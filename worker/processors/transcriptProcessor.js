'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { fetchAutoCaptions } = require('../lib/ytdlp');

/**
 * Fetch a YouTube video's auto-captions (no video download) and return them
 * as {start, dur, text} segments, or null if unavailable (no captions, or
 * yt-dlp is blocked — the app already treats null as "no transcript" and
 * falls back gracefully).
 */
async function getTranscript(videoId) {
  const tmpDir = path.join(os.tmpdir(), 'clipr', `transcript-${videoId}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    return await fetchAutoCaptions(videoId, tmpDir);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

module.exports = { getTranscript };
