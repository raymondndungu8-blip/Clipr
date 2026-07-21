// Promisified child_process.spawn — replaces spawnSync so long-running
// yt-dlp / Whisper subprocesses don't block the event loop (health checks,
// progress PATCHes, concurrent jobs). Same shape as spawnSync's result:
// { status, stdout, stderr }.
import { spawn } from "node:child_process";

export function spawnAsync(cmd, args, { timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: -1, stdout, stderr: stderr || String(err?.message || err) });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: code ?? -1, stdout, stderr });
    });
  });
}
