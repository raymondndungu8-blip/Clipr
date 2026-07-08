'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ffmpeg, ffmpegPath, run, getDuration } = require('../lib/ffmpeg');
const { uploadFile } = require('../lib/r2Upload');
const { updateClipJob, postCallback } = require('../lib/supabaseCallback');
const { spawnCapture } = require('../lib/proc');

const CLIP_LENGTH = 30; // seconds per clip
const CLIP_COUNT = 3;
const YTDLP_TIMEOUT_MS = 5 * 60 * 1000;
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Step 2: download source with yt-dlp.
// ---------------------------------------------------------------------------
async function downloadSource(sourceUrl, outputPath) {
  const args = [
    '-f', 'mp4[height<=1080]/best',
    '--max-filesize', '500m',
    '--no-playlist',
    '-o', outputPath,
    sourceUrl,
  ];
  const result = await spawnCapture('yt-dlp', args, {
    timeoutMs: YTDLP_TIMEOUT_MS,
    label: 'yt-dlp',
  });
  if (result.code !== 0 || !fs.existsSync(outputPath)) {
    const tail = (result.stderr || result.stdout || '').slice(-2000);
    throw new Error(`yt-dlp exited with code ${result.code}: ${tail}`);
  }
}

// ---------------------------------------------------------------------------
// Step 3: loudness analysis — mean_volume per 30s window via volumedetect,
// pick the top 3 non-overlapping windows. Fallback: evenly spaced segments.
// ---------------------------------------------------------------------------
async function measureMeanVolume(sourcePath, start, length) {
  const result = await spawnCapture(
    ffmpegPath,
    [
      '-hide_banner', '-nostats',
      '-ss', String(start),
      '-t', String(length),
      '-i', sourcePath,
      '-vn',
      '-af', 'volumedetect',
      '-f', 'null', '-',
    ],
    { timeoutMs: 60000, label: 'ffmpeg volumedetect' }
  );
  const match = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(result.stderr || '');
  if (!match) throw new Error('mean_volume not found in volumedetect output');
  return Number(match[1]);
}

function fallbackSegments(duration, count = CLIP_COUNT) {
  const length = Math.min(CLIP_LENGTH, Math.max(5, duration / 4));
  const segments = [];
  for (let i = 0; i < count; i++) {
    const fraction = (i + 1) / (count + 1);
    const start = Math.max(0, Math.min(duration * fraction, Math.max(0, duration - length)));
    segments.push({ start, duration: length });
  }
  return segments;
}

async function findLoudestSegments(sourcePath, duration, count = CLIP_COUNT) {
  if (!Number.isFinite(duration) || duration <= CLIP_LENGTH * count) {
    return fallbackSegments(duration, count);
  }

  try {
    // Cap the number of sampled windows so very long videos stay cheap.
    const step = Math.max(CLIP_LENGTH, Math.floor(duration / (count * 6)));
    const windows = [];
    for (let start = 0; start + CLIP_LENGTH <= duration; start += step) {
      windows.push(start);
    }
    if (windows.length < count) return fallbackSegments(duration, count);

    const measured = [];
    for (const start of windows) {
      try {
        const meanVolume = await measureMeanVolume(sourcePath, start, CLIP_LENGTH);
        measured.push({ start, meanVolume });
      } catch (err) {
        console.warn(`[clip] volumedetect failed at ${start}s: ${err.message}`);
      }
    }
    if (measured.length < count) return fallbackSegments(duration, count);

    // Loudest first, then keep the first `count` that don't overlap.
    measured.sort((a, b) => b.meanVolume - a.meanVolume);
    const picked = [];
    for (const candidate of measured) {
      const overlaps = picked.some((p) => Math.abs(p.start - candidate.start) < CLIP_LENGTH);
      if (!overlaps) picked.push(candidate);
      if (picked.length === count) break;
    }
    if (picked.length < count) return fallbackSegments(duration, count);

    picked.sort((a, b) => a.start - b.start);
    return picked.map((p) => ({ start: p.start, duration: CLIP_LENGTH }));
  } catch (err) {
    console.warn('[clip] loudness analysis failed, using fallback segments:', err.message);
    return fallbackSegments(duration, count);
  }
}

// ---------------------------------------------------------------------------
// Step 4: optional Whisper transcription via @xenova/transformers (tiny).
// Strictly best-effort — captions come from the AI metadata anyway.
// ---------------------------------------------------------------------------
function readWavAsFloat32(wavPath) {
  const buf = fs.readFileSync(wavPath);
  // Locate the 'data' chunk in the RIFF container (16-bit PCM assumed —
  // that is what our ffmpeg extraction produces).
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      const end = Math.min(offset + 8 + chunkSize, buf.length);
      const samples = new Float32Array(Math.floor((end - (offset + 8)) / 2));
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buf.readInt16LE(offset + 8 + i * 2) / 32768;
      }
      return samples;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error('No data chunk found in WAV file');
}

async function tryTranscribe(sourcePath, tmpDir) {
  let transformers;
  try {
    // Lazy, optional dependency — not in package.json on purpose.
    transformers = require('@xenova/transformers');
  } catch {
    return null;
  }

  try {
    const wavPath = path.join(tmpDir, 'audio16k.wav');
    const extract = await spawnCapture(
      ffmpegPath,
      ['-y', '-hide_banner', '-i', sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', wavPath],
      { timeoutMs: 2 * 60 * 1000, label: 'ffmpeg audio extract' }
    );
    if (extract.code !== 0) throw new Error('audio extraction failed');

    const audio = readWavAsFloat32(wavPath);
    const transcriber = await transformers.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    const output = await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    console.log('[clip] whisper transcription succeeded');
    return output; // { text, chunks: [{ timestamp: [start, end], text }] }
  } catch (err) {
    console.warn('[clip] whisper transcription skipped:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 5: render one vertical clip (trim → 9:16 crop → 1080x1920 → caption).
// ---------------------------------------------------------------------------
function sanitizeCaption(text) {
  // drawtext is picky about quoting; keep it to safe characters.
  return String(text || '')
    .replace(/[^A-Za-z0-9 .!?\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 60);
}

function captionForSegment(transcription, segment, topic) {
  if (topic) return sanitizeCaption(topic);
  if (transcription && Array.isArray(transcription.chunks)) {
    const inRange = transcription.chunks.filter((chunk) => {
      const ts = Array.isArray(chunk.timestamp) ? chunk.timestamp[0] : null;
      return ts !== null && ts >= segment.start && ts < segment.start + segment.duration;
    });
    const text = inRange.map((chunk) => chunk.text).join(' ');
    if (text.trim()) return sanitizeCaption(text);
  }
  return '';
}

const BASE_FILTER = 'crop=ih*9/16:ih,scale=1080:1920,setsar=1';

function buildCommand(sourcePath, outputPath, segment, videoFilter) {
  return ffmpeg(sourcePath)
    .seekInput(segment.start)
    .duration(segment.duration)
    .videoFilters(videoFilter)
    .outputOptions([
      '-c:v libx264',
      '-preset veryfast',
      '-crf 23',
      '-pix_fmt yuv420p',
      '-c:a aac',
      '-b:a 128k',
      '-movflags +faststart',
    ])
    .output(outputPath);
}

async function renderClip(sourcePath, outputPath, segment, caption, index) {
  const label = `clip ${index + 1} render`;

  if (caption) {
    // drawtext requires fontconfig / a usable default font — fall back to a
    // plain render if the overlay fails for any reason.
    const drawtext =
      `drawtext=text='${caption}'` +
      ':fontcolor=white:fontsize=54:borderw=2:bordercolor=black' +
      ':box=1:boxcolor=black@0.55:boxborderw=18' +
      ':x=(w-text_w)/2:y=h-text_h-180';
    try {
      await run(buildCommand(sourcePath, outputPath, segment, `${BASE_FILTER},${drawtext}`), {
        label: `${label} (captioned)`,
        timeoutMs: RENDER_TIMEOUT_MS,
      });
      return;
    } catch (err) {
      console.warn(`[clip] drawtext overlay failed for clip ${index + 1}, retrying without caption:`, err.message);
      try {
        fs.rmSync(outputPath, { force: true });
      } catch {
        // ignore
      }
    }
  }

  await run(buildCommand(sourcePath, outputPath, segment, BASE_FILTER), {
    label,
    timeoutMs: RENDER_TIMEOUT_MS,
  });
}

// ---------------------------------------------------------------------------
// Progress is best-effort — never let a failed progress write abort the job.
// ---------------------------------------------------------------------------
async function reportProgress(jobId, progress) {
  try {
    await updateClipJob(jobId, { progress });
  } catch (err) {
    console.warn(`[clip] job ${jobId}: progress update failed (${progress}%):`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------
async function processClipJob({ jobId, sourceUrl, topic /* , platforms */ }) {
  const tmpDir = path.join(os.tmpdir(), 'clipr', String(jobId));

  try {
    await updateClipJob(jobId, { status: 'processing', progress: 2 });

    // Topic-only job: the Next.js app already generated the AI clip metadata,
    // there is no source video to cut — just mark it done.
    if (!sourceUrl) {
      await updateClipJob(jobId, { status: 'done', progress: 100 });
      await postCallback({ jobId, status: 'done', clips: [] });
      console.log(`[clip] job ${jobId}: topic-only, marked done`);
      return;
    }

    fs.mkdirSync(tmpDir, { recursive: true });
    const sourcePath = path.join(tmpDir, 'source.mp4');

    console.log(`[clip] job ${jobId}: downloading source`);
    await downloadSource(sourceUrl, sourcePath);
    await reportProgress(jobId, 15);

    const duration = await getDuration(sourcePath);
    console.log(`[clip] job ${jobId}: source duration ${duration.toFixed(1)}s`);

    const segments = await findLoudestSegments(sourcePath, duration);
    await reportProgress(jobId, 30);

    const transcription = await tryTranscribe(sourcePath, tmpDir);
    await reportProgress(jobId, 40);

    const clips = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const outputPath = path.join(tmpDir, `clip_${i + 1}.mp4`);
      const caption = captionForSegment(transcription, segment, topic);

      console.log(`[clip] job ${jobId}: rendering clip ${i + 1}/${segments.length} (start ${segment.start.toFixed(1)}s)`);
      await renderClip(sourcePath, outputPath, segment, caption, i);

      const r2Url = await uploadFile(outputPath, `clips/${jobId}/${i + 1}.mp4`);
      clips.push({ r2Url, duration: Math.round(segment.duration) });
      await reportProgress(jobId, 40 + Math.round(((i + 1) / segments.length) * 55));
    }

    await updateClipJob(jobId, { status: 'done', progress: 100 });
    await postCallback({ jobId, status: 'done', clips });
    console.log(`[clip] job ${jobId}: done (${clips.length} clips)`);
  } catch (err) {
    const message = (err && err.message ? err.message : String(err)).slice(0, 1000);
    console.error(`[clip] job ${jobId} failed:`, message);
    try {
      await updateClipJob(jobId, { status: 'failed', error_message: message });
    } catch (dbErr) {
      console.error(`[clip] job ${jobId}: could not update Supabase status:`, dbErr.message);
    }
    await postCallback({ jobId, status: 'failed', error: message });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[clip] job ${jobId}: tmp cleanup failed:`, cleanupErr.message);
    }
  }
}

module.exports = {
  processClipJob,
  // Shared building blocks reused by renderProcessor.js / uploadProcessor.js
  // so the render-worker rewrite doesn't have to re-derive proven logic.
  downloadSource,
  findLoudestSegments,
  tryTranscribe,
  captionForSegment,
  sanitizeCaption,
  renderClip,
  buildCommand,
  BASE_FILTER,
  CLIP_LENGTH,
  CLIP_COUNT,
};
