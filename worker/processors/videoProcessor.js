'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const { ffmpeg, run } = require('../lib/ffmpeg');
const { uploadFile } = require('../lib/r2Upload');
const { updateFacelessVideo, postCallback } = require('../lib/supabaseCallback');

const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000;
const SCENE_RENDER_TIMEOUT_MS = 5 * 60 * 1000;
const CONCAT_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Download a remote file to disk with a hard timeout (Node 20 global fetch).
// ---------------------------------------------------------------------------
async function downloadToFile(url, destPath, { timeoutMs = DOWNLOAD_TIMEOUT_MS, label = 'download' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok || !res.body) {
      throw new Error(`${label}: HTTP ${res.status} for ${url}`);
    }
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s (${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function clampDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(Math.max(n, 1), 60);
}

// ---------------------------------------------------------------------------
// Per-scene render: trim to scene duration, fill the 1080x1920 frame,
// normalize to an intermediate MPEG-TS segment (no audio — the voiceover
// replaces all audio at concat time).
// ---------------------------------------------------------------------------
const SCENE_FILTER = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30';

const TS_OUTPUT_OPTIONS = [
  '-an',
  '-c:v libx264',
  '-preset veryfast',
  '-crf 23',
  '-pix_fmt yuv420p',
  '-bsf:v h264_mp4toannexb',
  '-f mpegts',
];

async function renderScene(scene, index, tmpDir) {
  const duration = clampDuration(scene.duration);
  const tsPath = path.join(tmpDir, `scene_${index}.ts`);

  if (scene.stockVideoUrl && typeof scene.stockVideoUrl === 'string') {
    const localPath = path.join(tmpDir, `stock_${index}.mp4`);
    await downloadToFile(scene.stockVideoUrl, localPath, { label: `scene ${index + 1} stock video` });

    // -stream_loop -1 loops short stock clips so they always cover the
    // scene duration; .duration() trims the output to exactly that length.
    const command = ffmpeg(localPath)
      .inputOptions(['-stream_loop', '-1'])
      .duration(duration)
      .videoFilters(SCENE_FILTER)
      .outputOptions(TS_OUTPUT_OPTIONS)
      .output(tsPath);

    await run(command, { label: `scene ${index + 1} render`, timeoutMs: SCENE_RENDER_TIMEOUT_MS });
  } else {
    // Defensive fallback: no stock footage for this scene → black filler so
    // the voiceover timing still lines up.
    console.warn(`[assemble] scene ${index + 1} has no stockVideoUrl, using black filler`);
    const command = ffmpeg(`color=c=black:s=1080x1920:r=30:d=${duration}`)
      .inputFormat('lavfi')
      .outputOptions(TS_OUTPUT_OPTIONS)
      .output(tsPath);

    await run(command, { label: `scene ${index + 1} filler render`, timeoutMs: SCENE_RENDER_TIMEOUT_MS });
  }

  return tsPath;
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------
async function assembleFacelessVideo({ videoId, scenes, voiceoverUrl }) {
  const tmpDir = path.join(os.tmpdir(), 'clipr', `faceless-${videoId}`);

  try {
    await updateFacelessVideo(videoId, { status: 'processing' });
    fs.mkdirSync(tmpDir, { recursive: true });

    // 1. Download the voiceover.
    const voiceoverPath = path.join(tmpDir, 'voiceover.mp3');
    console.log(`[assemble] video ${videoId}: downloading voiceover`);
    await downloadToFile(voiceoverUrl, voiceoverPath, { label: 'voiceover' });

    // 2. Download + normalize each scene to an intermediate .ts segment.
    const tsPaths = [];
    for (let i = 0; i < scenes.length; i++) {
      console.log(`[assemble] video ${videoId}: scene ${i + 1}/${scenes.length}`);
      tsPaths.push(await renderScene(scenes[i], i, tmpDir));
    }

    // 3. Concat all scenes (concat demuxer) and lay the voiceover over the
    //    top, replacing any original audio. -shortest ends at whichever of
    //    video/voiceover runs out first.
    const listPath = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(
      listPath,
      tsPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
      'utf8'
    );

    const finalPath = path.join(tmpDir, 'final.mp4');
    const concatCommand = ffmpeg(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(voiceoverPath)
      .outputOptions([
        '-map 0:v:0',
        '-map 1:a:0',
        '-c:v copy',
        '-c:a aac',
        '-b:a 192k',
        '-shortest',
        '-movflags +faststart',
      ])
      .output(finalPath);

    console.log(`[assemble] video ${videoId}: concatenating ${tsPaths.length} scenes`);
    await run(concatCommand, { label: 'final assembly', timeoutMs: CONCAT_TIMEOUT_MS });

    // 4. Upload + persist.
    const r2Url = await uploadFile(finalPath, `faceless/${videoId}.mp4`);
    await updateFacelessVideo(videoId, { r2_url: r2Url, status: 'done' });
    await postCallback({ videoId, status: 'done', r2Url });
    console.log(`[assemble] video ${videoId}: done -> ${r2Url}`);
  } catch (err) {
    const message = (err && err.message ? err.message : String(err)).slice(0, 1000);
    console.error(`[assemble] video ${videoId} failed:`, message);
    try {
      await updateFacelessVideo(videoId, { status: 'failed', error_message: message });
    } catch (dbErr) {
      console.error(`[assemble] video ${videoId}: could not update Supabase status:`, dbErr.message);
    }
    await postCallback({ videoId, status: 'failed', error: message });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[assemble] video ${videoId}: tmp cleanup failed:`, cleanupErr.message);
    }
  }
}

module.exports = { assembleFacelessVideo };
