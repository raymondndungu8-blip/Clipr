// Fetches a YouTube transcript by shelling out to transcript.py
// (youtube-transcript-api). Returns { ok, segments:[{start,dur,text}] }.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.PYTHON_CMD || "python3";

export function ytIdFromUrl(input) {
  if (!input) return null;
  if (/^[\w-]{11}$/.test(input)) return input;
  const m = String(input).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
}

export function fetchTranscript(videoId) {
  const r = spawnSync(PY, [path.join(ROOT, "transcript.py"), videoId], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || "transcript spawn failed").slice(0, 200) };
  }
  try {
    return JSON.parse((r.stdout || "").trim());
  } catch {
    return { ok: false, error: "transcript parse failed" };
  }
}
