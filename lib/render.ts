import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Spawns the standalone Remotion pipelines (remotion/render.mjs or
// render-source.mjs) to render a clip to MP4 and upload it to Supabase Storage,
// returning the public URL. Runs Node + Chromium (+ yt-dlp for source mode), so
// this works in local dev or on a Node host (the worker) — NOT on Vercel
// serverless. We key off the CLIPR_RESULT_URL line rather than the exit code
// (the Node process can exit non-zero on Windows even after success).
//
// The render-script path comes from CLIPR_RENDER_SCRIPT (a runtime-only,
// non-NEXT_PUBLIC_ env var) so the bundler never traces the spawned scripts.

function remotionDir(): string {
  const scriptPath = process.env.CLIPR_RENDER_SCRIPT;
  if (!scriptPath) {
    throw new Error(
      "CLIPR_RENDER_SCRIPT is not set — point it at the absolute path of remotion/render.mjs."
    );
  }
  return path.dirname(scriptPath);
}

function spawnPipeline(
  dir: string,
  scriptFile: string,
  extraArgs: string[]
): Promise<string> {
  const scriptPath = path.join(dir, scriptFile);
  return new Promise<string>((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...extraArgs], {
      cwd: dir,
      env: {
        ...process.env,
        SUPABASE_URL:
          process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
      },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", () => {
      const match = out.match(/CLIPR_RESULT_URL=(\S+)/);
      if (match) resolve(match[1]);
      else reject(new Error(`Render produced no URL: ${(err || out).slice(-500)}`));
    });
  });
}

/** Styled caption clip (hook + karaoke captions over a gradient). */
export async function renderAndUpload(opts: {
  compositionId?: string;
  props: Record<string, unknown>;
  key: string;
}): Promise<string> {
  const dir = remotionDir();
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "clipr-render-"));
  const propsPath = path.join(tmpDir, "props.json");
  const outPath = path.join(tmpDir, "out.mp4");
  await writeFile(propsPath, JSON.stringify(opts.props), "utf8");
  try {
    return await spawnPipeline(dir, ["render", "mjs"].join("."), [
      "--id",
      opts.compositionId ?? "CaptionClip",
      "--out",
      outPath,
      "--props-file",
      propsPath,
      "--key",
      opts.key,
    ]);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Real downloaded footage trimmed to a segment with synced captions. */
export async function renderSourceAndUpload(opts: {
  url: string;
  startSeconds: number;
  endSeconds: number;
  id: string;
  key: string;
  hook?: string;
}): Promise<string> {
  const dir = remotionDir();
  return spawnPipeline(dir, ["render-source", "mjs"].join("."), [
    "--url",
    opts.url,
    "--start",
    String(opts.startSeconds),
    "--end",
    String(opts.endSeconds),
    "--id",
    opts.id,
    "--key",
    opts.key,
    "--hook",
    opts.hook ?? "",
  ]);
}
