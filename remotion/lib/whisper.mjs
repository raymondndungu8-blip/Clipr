// Transcribe a local media file via transcribe.py (faster-whisper).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.PYTHON_CMD || "python3";

export function transcribeFile(localPath) {
  const r = spawnSync(PY, [path.join(ROOT, "transcribe.py"), localPath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || "whisper spawn failed").slice(0, 300) };
  }
  try {
    return JSON.parse((r.stdout || "").trim());
  } catch {
    return { ok: false, error: "whisper parse failed" };
  }
}
