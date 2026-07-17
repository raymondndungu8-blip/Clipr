'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ffmpeg, run, getDuration } = require('../lib/ffmpeg');
const { uploadFile } = require('../lib/r2Upload');
const { postCallback } = require('../lib/supabaseCallback');
const { downloadSegment } = require('../lib/ytdlp');
const { buildCaptionFilters, firstHexColor } = require('../lib/captionOverlay');
const { BASE_FILTER } = require('./clipProcessor');

const SEGMENT_DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000;
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DURATION_S = 30;

/** No explicit duration is available for the caption-over-gradient case unless
 * the caller passed one — fall back to a rough estimate from caption count. */
function estimateDuration(captions, explicitSeconds) {
  if (typeof explicitSeconds === 'number' && explicitSeconds > 0) {
    return Math.min(120, explicitSeconds);
  }
  const n = Array.isArray(captions) ? captions.length : 0;
  return Math.min(90, Math.max(15, n * 3 || DEFAULT_DURATION_S));
}

async function renderGradientClip({ hook, captions, gradient, accent, duration, outputPath }) {
  const bg = firstHexColor(gradient);
  const filters = buildCaptionFilters({ hook, captions, duration, accent });
  const command = ffmpeg(`color=c=${bg}:s=1080x1920:r=30:d=${duration}`)
    .inputFormat('lavfi')
    .videoFilters(filters.length ? filters.join(',') : 'null')
    .outputOptions([
      '-c:v libx264',
      '-preset veryfast',
      '-crf 23',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
    ])
    .output(outputPath);
  await run(command, { label: 'gradient caption render', timeoutMs: RENDER_TIMEOUT_MS });
}

async function renderFootageClip({ sourcePath, duration, hook, captions, accent, outputPath }) {
  const filters = [BASE_FILTER, ...buildCaptionFilters({ hook, captions, duration, accent })];

  // Check if source has an audio stream; fall back to no audio if missing.
  let audioOpts = ['-c:a aac', '-b:a 128k'];
  try {
    await getDuration(sourcePath);
  } catch {
    audioOpts = [];
  }

  const command = ffmpeg(sourcePath)
    .duration(duration)
    .videoFilters(filters.join(','))
    .outputOptions([
      '-c:v libx264',
      '-preset veryfast',
      '-crf 23',
      '-pix_fmt yuv420p',
      ...audioOpts,
      '-movflags +faststart',
    ])
    .output(outputPath);
  await run(command, { label: 'footage caption render', timeoutMs: RENDER_TIMEOUT_MS });
}

/**
 * Render one clip: real downloaded footage when a YouTube segment is given
 * and the download succeeds, otherwise (or on any download/render failure)
 * the caption-and-hook-over-gradient fallback — so there is always a
 * downloadable MP4. `table: "faceless_videos"` renders a faceless-video
 * script (always gradient, never real footage) and calls back with
 * `videoId` instead of `clipId` to match the existing callback contract.
 */
async function processRenderJob({ clipId, table, hook, captions, gradient, accent, key, url, start, end, duration }) {
  const isFaceless = table === 'faceless_videos';
  const tmpDir = path.join(os.tmpdir(), 'clipr', `render-${clipId}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const outputPath = path.join(tmpDir, 'out.mp4');
  const clipDuration = estimateDuration(captions, duration);

  try {
    let usedRealFootage = false;

    if (!isFaceless && url && typeof start === 'number' && typeof end === 'number' && end > start) {
      const sourcePath = path.join(tmpDir, 'source.mp4');
      try {
        console.log(`[render] ${clipId}: downloading segment ${start}-${end}`);
        await downloadSegment(url, start, end, sourcePath, { timeoutMs: SEGMENT_DOWNLOAD_TIMEOUT_MS });
        await renderFootageClip({
          sourcePath,
          duration: end - start,
          hook,
          captions,
          accent,
          outputPath,
        });
        usedRealFootage = true;
      } catch (err) {
        console.warn(`[render] ${clipId}: real-footage render failed, falling back to gradient:`, err.message);
      }
    }

    if (!usedRealFootage) {
      await renderGradientClip({ hook, captions, gradient, accent, duration: clipDuration, outputPath });
    }

    const r2Url = await uploadFile(outputPath, key || `clips/${clipId}.mp4`);

    if (isFaceless) await postCallback({ videoId: clipId, status: 'done', r2Url });
    else await postCallback({ clipId, status: 'done', r2Url });
    console.log(`[render] ${clipId}: done -> ${r2Url}`);
  } catch (err) {
    const message = (err && err.message ? err.message : String(err)).slice(0, 1000);
    console.error(`[render] ${clipId} failed:`, message);
    if (isFaceless) await postCallback({ videoId: clipId, status: 'failed', error: message });
    else await postCallback({ clipId, status: 'failed', error: message });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[render] ${clipId}: tmp cleanup failed:`, cleanupErr.message);
    }
  }
}

module.exports = { processRenderJob };
