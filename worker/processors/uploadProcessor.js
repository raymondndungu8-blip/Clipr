'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const { getDuration } = require('../lib/ffmpeg');
const { uploadFile } = require('../lib/r2Upload');
const { getClient, updateClipJob, postCallback } = require('../lib/supabaseCallback');
const { findLoudestSegments, tryTranscribe, captionForSegment, renderClip } = require('./clipProcessor');
const { createLimit } = require('../lib/limit');

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
const DEFAULT_GRADIENT = 'linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)';
const RENDER_CONCURRENCY = 2;

async function reportProgress(jobId, progress) {
  try {
    await updateClipJob(jobId, { progress });
  } catch (err) {
    console.warn(`[upload] job ${jobId}: progress update failed (${progress}%):`, err.message);
  }
}

async function downloadUploadedFile(key, destPath) {
  // Stream straight to disk (constant memory) instead of buffering the whole
  // upload in RAM — uploads can be hundreds of MB.
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${UPLOAD_BUCKET}/${key}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Could not download uploaded file (${UPLOAD_BUCKET}/${key}): HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Process an uploaded video: find the loudest non-overlapping segments
 * (same heuristic as the original /process job — no AI clip-selection call
 * here, see conversation notes), render each with a burned-in caption, and
 * insert the resulting `clips` rows directly (this flow creates them, unlike
 * the URL/topic flow where the app inserts AI-generated clip rows upfront).
 */
async function processUploadJob({ jobId, key, count, topic }) {
  const n = Math.min(20, Math.max(1, Number(count) || 3));
  const tmpDir = path.join(os.tmpdir(), 'clipr', `upload-${jobId}`);

  try {
    await updateClipJob(jobId, { status: 'processing', progress: 2 });
    fs.mkdirSync(tmpDir, { recursive: true });
    const sourcePath = path.join(tmpDir, 'source.mp4');

    console.log(`[upload] job ${jobId}: downloading uploaded file`);
    await downloadUploadedFile(key, sourcePath);
    await reportProgress(jobId, 15);

    const duration = await getDuration(sourcePath);
    console.log(`[upload] job ${jobId}: source duration ${duration.toFixed(1)}s`);

    const segments = await findLoudestSegments(sourcePath, duration, n);
    await reportProgress(jobId, 30);

    // Transcription is unused when a topic override is set, and only needs
    // the selected segments' audio.
    const transcription = topic ? null : await tryTranscribe(sourcePath, tmpDir, segments);
    await reportProgress(jobId, 40);

    const supabase = getClient();
    const limit = createLimit(RENDER_CONCURRENCY);
    let inserted = 0;
    let completed = 0;

    await Promise.all(
      segments.map((segment, i) =>
        limit(async () => {
          const caption = captionForSegment(transcription, segment, topic);
          const outputPath = path.join(tmpDir, `clip_${i + 1}.mp4`);

          console.log(`[upload] job ${jobId}: rendering clip ${i + 1}/${segments.length}`);
          await renderClip(sourcePath, outputPath, segment, caption, i);
          const r2Url = await uploadFile(outputPath, `clips/${jobId}/${i + 1}.mp4`);

          const { error: insertError } = await supabase.from('clips').insert({
            job_id: jobId,
            title: caption || topic || `Clip ${i + 1}`,
            hook: caption || topic || null,
            captions: caption ? [caption] : [],
            duration: formatDuration(segment.duration),
            start_seconds: Math.round(segment.start),
            end_seconds: Math.round(segment.start + segment.duration),
            r2_url: r2Url,
            bg_gradient: DEFAULT_GRADIENT,
          });
          if (insertError) {
            console.error(`[upload] job ${jobId}: clip ${i + 1} insert failed:`, insertError.message);
          } else {
            inserted += 1;
          }
          completed += 1;
          await reportProgress(jobId, 40 + Math.round((completed / segments.length) * 55));
        })
      )
    );

    await updateClipJob(jobId, { status: 'done', progress: 100 });
    await postCallback({ jobId, status: 'done' });
    console.log(`[upload] job ${jobId}: done (${inserted}/${segments.length} clips)`);
  } catch (err) {
    const message = (err && err.message ? err.message : String(err)).slice(0, 1000);
    console.error(`[upload] job ${jobId} failed:`, message);
    try {
      await updateClipJob(jobId, { status: 'failed', error_message: message });
    } catch (dbErr) {
      console.error(`[upload] job ${jobId}: could not update Supabase status:`, dbErr.message);
    }
    await postCallback({ jobId, status: 'failed', error: message });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[upload] job ${jobId}: tmp cleanup failed:`, cleanupErr.message);
    }
  }
}

module.exports = { processUploadJob };
