'use strict';

const { spawn } = require('child_process');

/**
 * Spawn a binary, capture its output, and enforce a hard timeout. Shared by
 * every processor that shells out to yt-dlp/ffmpeg directly (outside of
 * fluent-ffmpeg, which has its own run() wrapper in ffmpeg.js).
 */
function spawnCapture(bin, args, { timeoutMs = 60000, label = bin } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (err) {
      return reject(new Error(`${label} failed to spawn: ${err.message}`));
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // already dead
      }
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > 1_000_000) stdout = stdout.slice(-500_000);
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 1_000_000) stderr = stderr.slice(-500_000);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${label} failed to start: ${err.message}`));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

module.exports = { spawnCapture };
