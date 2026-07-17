'use strict';

const express = require('express');

const { processClipJob } = require('./processors/clipProcessor');
const { assembleFacelessVideo } = require('./processors/videoProcessor');
const { processRenderJob } = require('./processors/renderProcessor');
const { processUploadJob } = require('./processors/uploadProcessor');
const { getTranscript } = require('./processors/transcriptProcessor');
const { createLimit } = require('./lib/limit');

// Heavy jobs (download + ffmpeg + upload) queue behind this limit so a burst
// of requests can't run unbounded concurrent pipelines. Requests still get
// their 202 immediately.
const jobLimit = createLimit(Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS) || 2));

const app = express();

// ---------------------------------------------------------------------------
// Health check — no auth, no body parsing required.
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ---------------------------------------------------------------------------
// Everything below requires the shared worker secret.
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const secret = process.env.WORKER_SECRET;
  if (!secret || req.headers['x-worker-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// ---------------------------------------------------------------------------
// POST /process — clip a source video into 3 short verticals.
// Body: { jobId, sourceUrl, topic, platforms }
// ---------------------------------------------------------------------------
app.post('/process', (req, res) => {
  const { jobId, sourceUrl, topic, platforms } = req.body || {};

  if (!jobId || (typeof jobId !== 'string' && typeof jobId !== 'number')) {
    return res.status(400).json({ error: 'jobId is required' });
  }
  if (sourceUrl !== undefined && sourceUrl !== null && typeof sourceUrl !== 'string') {
    return res.status(400).json({ error: 'sourceUrl must be a string when provided' });
  }
  if (platforms !== undefined && platforms !== null && !Array.isArray(platforms)) {
    return res.status(400).json({ error: 'platforms must be an array when provided' });
  }

  res.status(202).json({ accepted: true, jobId });

  // Fire-and-forget: processClipJob handles its own failures (Supabase status
  // update + callback). The extra catch here is a last line of defense so a
  // bug in the processor can never take down the server.
  setImmediate(() => {
    jobLimit(() => processClipJob({ jobId, sourceUrl, topic, platforms })).catch((err) => {
      console.error(`[process] job ${jobId} crashed unexpectedly:`, err);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /assemble — assemble a faceless video from stock scenes + voiceover.
// Body: { videoId, scenes: [{ scene, voiceover, visual, caption, duration, stockVideoUrl }], voiceoverUrl }
// ---------------------------------------------------------------------------
app.post('/assemble', (req, res) => {
  const { videoId, scenes, voiceoverUrl } = req.body || {};

  if (!videoId || (typeof videoId !== 'string' && typeof videoId !== 'number')) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'scenes must be a non-empty array' });
  }
  if (!voiceoverUrl || typeof voiceoverUrl !== 'string') {
    return res.status(400).json({ error: 'voiceoverUrl is required' });
  }

  res.status(202).json({ accepted: true, videoId });

  setImmediate(() => {
    jobLimit(() => assembleFacelessVideo({ videoId, scenes, voiceoverUrl })).catch((err) => {
      console.error(`[assemble] video ${videoId} crashed unexpectedly:`, err);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /transcript — fetch a YouTube video's auto-captions (no video
// download) and return them as {start, dur, text} segments. Synchronous:
// this is a lightweight subtitle-only fetch, not a full render job.
// Body: { videoId }
// ---------------------------------------------------------------------------
app.post('/transcript', async (req, res) => {
  const { videoId } = req.body || {};
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId is required' });
  }

  try {
    const segments = await getTranscript(videoId);
    if (!segments) return res.json({ ok: false, segments: [] });
    return res.json({ ok: true, segments });
  } catch (err) {
    console.error(`[transcript] ${videoId} failed:`, err);
    return res.json({ ok: false, segments: [] });
  }
});

// ---------------------------------------------------------------------------
// POST /render — render one clip (real YouTube segment when given, otherwise
// a caption-and-hook-over-gradient fallback) or one faceless-video script,
// upload it to R2, and report back via /api/worker/callback.
// Body: { clipId, table?, hook, captions, gradient, accent, key, url?, start?, end?, duration? }
// ---------------------------------------------------------------------------
app.post('/render', (req, res) => {
  const { clipId, table, hook, captions, gradient, accent, key, url, start, end, duration } = req.body || {};

  if (!clipId || (typeof clipId !== 'string' && typeof clipId !== 'number')) {
    return res.status(400).json({ error: 'clipId is required' });
  }
  if (captions !== undefined && captions !== null && !Array.isArray(captions)) {
    return res.status(400).json({ error: 'captions must be an array when provided' });
  }

  res.status(202).json({ accepted: true, clipId });

  setImmediate(() => {
    jobLimit(() => processRenderJob({ clipId, table, hook, captions, gradient, accent, key, url, start, end, duration })).catch((err) => {
      console.error(`[render] ${clipId} crashed unexpectedly:`, err);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /process-upload — the counterpart to /process for uploaded files: no
// sourceUrl, instead a Supabase Storage key for the file the browser already
// uploaded straight to storage.
// Body: { jobId, key, count, style, platforms, accent, clipLength, topic }
// ---------------------------------------------------------------------------
app.post('/process-upload', (req, res) => {
  const { jobId, key, count, topic } = req.body || {};

  if (!jobId || (typeof jobId !== 'string' && typeof jobId !== 'number')) {
    return res.status(400).json({ error: 'jobId is required' });
  }
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'key is required' });
  }

  res.status(202).json({ accepted: true, jobId });

  setImmediate(() => {
    jobLimit(() => processUploadJob({ jobId, key, count, topic })).catch((err) => {
      console.error(`[process-upload] job ${jobId} crashed unexpectedly:`, err);
    });
  });
});

// ---------------------------------------------------------------------------
// Error handling — malformed JSON, unknown routes, anything thrown in a
// request handler. Never crash the process.
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  console.error('[http] unhandled request error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal-guard] unhandled rejection (process kept alive):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal-guard] uncaught exception (process kept alive):', err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`clipr-worker listening on port ${PORT}`);
});
