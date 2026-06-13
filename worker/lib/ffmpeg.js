'use strict';

/**
 * Shared FFmpeg setup for the worker.
 *
 * Prefers the system ffmpeg/ffprobe binaries (present in the Docker image);
 * falls back to the bundled ffmpeg-static binary for local development.
 */

const { spawnSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

function binaryWorks(bin) {
  try {
    const result = spawnSync(bin, ['-version'], {
      stdio: 'ignore',
      timeout: 5000,
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

let ffmpegPath = 'ffmpeg';

if (!binaryWorks('ffmpeg')) {
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath) {
      ffmpegPath = staticPath;
      ffmpeg.setFfmpegPath(staticPath);
      console.log('[ffmpeg] system ffmpeg not found, using ffmpeg-static:', staticPath);
    }
  } catch (err) {
    console.warn('[ffmpeg] no system ffmpeg and ffmpeg-static unavailable:', err.message);
  }
}

/**
 * Run a fluent-ffmpeg command with a hard timeout and stderr capture.
 * Resolves on completion, rejects with the tail of stderr on failure.
 */
function run(command, { label = 'ffmpeg', timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const stderrTail = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        command.kill('SIGKILL');
      } catch {
        // ignore — process may already be gone
      }
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    command
      .on('stderr', (line) => {
        stderrTail.push(line);
        if (stderrTail.length > 30) stderrTail.shift();
      })
      .on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      })
      .on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`${label} failed: ${err.message}\n--- stderr tail ---\n${stderrTail.join('\n')}`));
      })
      .run();
  });
}

/**
 * Get media duration in seconds. Tries ffprobe first (available in Docker),
 * then falls back to parsing `ffmpeg -i` stderr (works with ffmpeg-static,
 * which does not ship ffprobe).
 */
function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (probeErr, data) => {
      const probed = data && data.format && Number(data.format.duration);
      if (!probeErr && Number.isFinite(probed) && probed > 0) {
        return resolve(probed);
      }
      try {
        const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', filePath], {
          encoding: 'utf8',
          timeout: 30000,
          windowsHide: true,
        });
        const output = `${result.stderr || ''}\n${result.stdout || ''}`;
        const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(output);
        if (match) {
          return resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
        }
      } catch {
        // fall through to reject below
      }
      reject(probeErr || new Error(`Could not determine duration of ${filePath}`));
    });
  });
}

module.exports = { ffmpeg, ffmpegPath, run, getDuration };
