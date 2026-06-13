'use strict';

const express = require('express');

const { processClipJob } = require('./processors/clipProcessor');
const { assembleFacelessVideo } = require('./processors/videoProcessor');

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
    processClipJob({ jobId, sourceUrl, topic, platforms }).catch((err) => {
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
    assembleFacelessVideo({ videoId, scenes, voiceoverUrl }).catch((err) => {
      console.error(`[assemble] video ${videoId} crashed unexpectedly:`, err);
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
