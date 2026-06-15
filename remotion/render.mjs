// Programmatic render + upload pipeline for Clipr (styled CaptionClip).
//
// Renders a composition to MP4 with Remotion, then uploads it to Supabase
// Storage (or R2), printing the public URL. Without storage env it renders
// locally.
//
// Usage:
//   node render.mjs --id CaptionClip --out out/clip.mp4 \
//     --props '<json>' | --props-file <path> [--key renders/clip.mp4]

import path from "node:path";
import { readFile } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { uploadVideo } from "./lib/upload.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const compositionId = arg("id", "CaptionClip");
const outPath = path.resolve(arg("out", `out/${compositionId}.mp4`));
const propsArg = arg("props", "");
const propsFile = arg("props-file", "");
const inputProps = propsFile
  ? JSON.parse(await readFile(propsFile, "utf8"))
  : propsArg
    ? JSON.parse(propsArg)
    : {};
const storageKey = arg("key", `renders/${Date.now()}-${compositionId}.mp4`);

async function main() {
  console.log(`Bundling Remotion project…`);
  const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });

  console.log(`Selecting composition "${compositionId}"…`);
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  });

  console.log(`Rendering → ${outPath}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
  });
  console.log("Render complete.");

  const url = await uploadVideo(outPath, storageKey);
  if (url) {
    console.log(`\nUploaded: ${url}`);
    console.log(`CLIPR_RESULT_URL=${url}`);
  } else {
    console.log(`\nLocal file: ${outPath}`);
  }
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
