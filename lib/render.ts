import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Spawns the standalone Remotion render pipeline (remotion/render.mjs) to render
// a composition to MP4 and upload it to Supabase Storage, returning the public
// URL. Runs Node + Chromium, so this works in local dev or on a Node host
// (the worker) — NOT on Vercel serverless. We key off the CLIPR_RESULT_URL line
// rather than the exit code (the Node process can exit non-zero on Windows even
// after a successful render+upload).
//
// The script path comes from the CLIPR_RENDER_SCRIPT env var (a runtime-only,
// non-NEXT_PUBLIC_ var) so the bundler never tries to trace/resolve the spawned
// script or its directory at build time.
export async function renderAndUpload(opts: {
  compositionId?: string;
  props: Record<string, unknown>;
  key: string;
}): Promise<string> {
  const scriptPath = process.env.CLIPR_RENDER_SCRIPT;
  if (!scriptPath) {
    throw new Error(
      "CLIPR_RENDER_SCRIPT is not set — point it at the absolute path of remotion/render.mjs."
    );
  }
  const remotionDir = path.dirname(scriptPath);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "clipr-render-"));
  const propsPath = path.join(tmpDir, "props.json");
  const outPath = path.join(tmpDir, "out.mp4");
  await writeFile(propsPath, JSON.stringify(opts.props), "utf8");

  const args = [
    scriptPath,
    "--id",
    opts.compositionId ?? "CaptionClip",
    "--out",
    outPath,
    "--props-file",
    propsPath,
    "--key",
    opts.key,
  ];

  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn("node", args, {
        cwd: remotionDir,
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
        else
          reject(
            new Error(`Render produced no URL: ${(err || out).slice(-400)}`)
          );
      });
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
