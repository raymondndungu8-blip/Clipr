'use strict';

const fs = require('fs');
const path = require('path');
const { spawnCapture } = require('./proc');
const { parseAutoVtt } = require('./vtt');

/**
 * Fetch YouTube's auto-generated captions for a video WITHOUT downloading
 * the video itself (--skip-download), parse them into {start, dur, text}
 * segments. Returns null on any failure (no captions, network/bot-wall
 * block, timeout) — callers treat that as "no transcript available" and
 * fall back to non-grounded generation, same as before this endpoint existed.
 */
async function fetchAutoCaptions(videoId, tmpDir, { timeoutMs = 25000 } = {}) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outBase = path.join(tmpDir, 'captions');
  const args = [
    '--skip-download',
    '--write-auto-subs',
    '--sub-langs', 'en.*,en',
    '--sub-format', 'vtt',
    '--no-playlist',
    '-o', `${outBase}.%(ext)s`,
    url,
  ];

  try {
    await spawnCapture('yt-dlp', args, { timeoutMs, label: 'yt-dlp captions' });
  } catch (err) {
    console.warn(`[ytdlp] caption fetch failed for ${videoId}:`, err.message);
    return null;
  }

  // yt-dlp names the file <base>.<lang>.vtt — find whichever language landed.
  const dir = path.dirname(outBase);
  const prefix = path.basename(outBase);
  let vttPath = null;
  try {
    const match = fs
      .readdirSync(dir)
      .find((f) => f.startsWith(`${prefix}.`) && f.endsWith('.vtt'));
    if (match) vttPath = path.join(dir, match);
  } catch (err) {
    console.warn('[ytdlp] could not list caption dir:', err.message);
  }
  if (!vttPath || !fs.existsSync(vttPath)) return null;

  try {
    const text = fs.readFileSync(vttPath, 'utf8');
    const segments = parseAutoVtt(text);
    return segments.length > 0 ? segments : null;
  } catch (err) {
    console.warn('[ytdlp] failed to parse captions:', err.message);
    return null;
  }
}

/**
 * Download only a [start, end] segment of a source video (yt-dlp
 * --download-sections), far cheaper than pulling the whole file when we only
 * need one clip's worth of footage.
 */
async function downloadSegment(sourceUrl, startSeconds, endSeconds, outputPath, { timeoutMs = 3 * 60 * 1000, padSeconds = 0 } = {}) {
  // With padding the caller re-encodes anyway and trims precisely itself, so
  // skip --force-keyframes-at-cuts (a yt-dlp-side re-encode) — grab a few
  // extra seconds around the window instead and cut on keyframes only.
  const pad = Math.max(0, padSeconds);
  const paddedStart = Math.max(0, Math.floor(startSeconds - pad));
  const section = `*${paddedStart}-${Math.ceil(endSeconds + pad)}`;
  const args = [
    '-f', 'mp4[height<=1080]/best',
    '--download-sections', section,
    ...(pad > 0 ? [] : ['--force-keyframes-at-cuts']),
    '--max-filesize', '300m',
    '--no-playlist',
    '-o', outputPath,
    sourceUrl,
  ];
  const result = await spawnCapture('yt-dlp', args, { timeoutMs, label: 'yt-dlp segment' });
  if (result.code !== 0 || !fs.existsSync(outputPath)) {
    const tail = (result.stderr || result.stdout || '').slice(-2000);
    throw new Error(`yt-dlp segment download exited with code ${result.code}: ${tail}`);
  }
  // Where the requested start actually sits inside the downloaded file.
  return { offsetSeconds: startSeconds - paddedStart };
}

module.exports = { fetchAutoCaptions, downloadSegment };
