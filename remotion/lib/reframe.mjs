// Analyze a local video segment for subject-tracking reframe via reframe.py (OpenCV).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.PYTHON_CMD || "python3";

export function computeReframe(videoAbsPath, start, end) {
  try {
    const r = spawnSync(
      PY,
      [path.join(ROOT, "reframe.py"), videoAbsPath, String(start), String(end)],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    if (r.status !== 0) {
      return null;
    }
    const parsed = JSON.parse((r.stdout || "").trim());
    if (!parsed || parsed.ok !== true) {
      return null;
    }
    return {
      srcWidth: parsed.srcWidth,
      srcHeight: parsed.srcHeight,
      fps: parsed.fps,
      reframe: parsed.reframe,
    };
  } catch {
    return null;
  }
}
