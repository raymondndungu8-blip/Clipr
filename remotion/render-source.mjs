// Real-footage clip pipeline: download the source video + YouTube auto-captions
// with yt-dlp, render the trimmed 9:16 segment with synced captions (SourceClip),
// and upload to Supabase Storage / R2.
//
// Usage:
//   node render-source.mjs --url <yt-url> --start 30 --end 55 \
//     --id <sourceId> --key clips/<id>.mp4 [--hook "..."] [--accent "#3d7bff"]
//
// Requires yt-dlp (installed; callable as `python -m yt_dlp`).

import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { uploadVideo } from "./lib/upload.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("url", "");
const start = parseFloat(arg("start", "0"));
const end = parseFloat(arg("end", "30"));
const sourceId = arg("id", `src-${Date.now()}`);
const storageKey = arg("key", `clips/${sourceId}.mp4`);
const hook = arg("hook", "");
const accent = arg("accent", "#3d7bff");

if (!url) {
  console.error("Render failed: --url is required");
  process.exit(1);
}

const SOURCES_DIR = path.resolve("public/sources");
const YTDLP = process.env.YT_DLP_CMD || "python";
const YTDLP_ARGS_PREFIX = process.env.YT_DLP_CMD ? [] : ["-m", "yt_dlp"];

/** Parse a WEBVTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) to seconds. */
function tsToSeconds(ts) {
  const parts = ts.trim().split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(ts) || 0;
}

/** Parse a VTT file into [{start,end,text}] cues, stripping inline tags. */
function parseVtt(content) {
  const cues = [];
  const blocks = content.replace(/\r/g, "").split("\n\n");
  for (const block of blocks) {
    const line = block.split("\n").find((l) => l.includes("-->"));
    if (!line) continue;
    const [s, e] = line.split("-->").map((x) => x.trim().split(" ")[0]);
    const textLines = block
      .split("\n")
      .filter((l) => l && !l.includes("-->") && l !== "WEBVTT" && !/^\d+$/.test(l));
    const text = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "") // strip <c>/<00:00:00.000> tags
      .replace(/\s+/g, " ")
      .trim();
    if (text) cues.push({ start: tsToSeconds(s), end: tsToSeconds(e), text });
  }
  return cues;
}

/** Build segment-relative caption cues, deduped, clamped to the clip length. */
function buildCaptions(cues) {
  const out = [];
  let lastText = "";
  for (const c of cues) {
    if (c.end <= start || c.start >= end) continue;
    const rs = Math.max(0, c.start - start);
    const re = Math.min(end - start, c.end - start);
    if (re - rs < 0.1) continue;
    const text = c.text.toUpperCase();
    if (text === lastText) {
      // extend the previous cue rather than repeating (rolling captions)
      if (out.length) out[out.length - 1].end = re;
      continue;
    }
    out.push({ start: rs, end: re, text });
    lastText = text;
  }
  return out;
}

function runYtDlp(extra) {
  return spawnSync(YTDLP, [...YTDLP_ARGS_PREFIX, ...extra], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function download() {
  await mkdir(SOURCES_DIR, { recursive: true });
  const outTemplate = path.join(SOURCES_DIR, `${sourceId}.%(ext)s`);

  // 1. Video — required (progressive mp4, no ffmpeg merge needed).
  console.log("Downloading source video…");
  const vid = runYtDlp([
    "-f",
    "18/best[ext=mp4][acodec!=none][vcodec!=none]/best[ext=mp4]",
    "--no-playlist",
    "--no-warnings",
    "-o",
    outTemplate,
    url,
  ]);
  if (vid.status !== 0) {
    throw new Error(
      `yt-dlp video download failed: ${(vid.stderr || vid.stdout || "").slice(-400)}`
    );
  }

  // 2. Auto-captions — best-effort (YouTube throttles the subtitle endpoint;
  // a failure here must not abort the clip). Narrow langs to avoid pulling
  // dozens of auto-translated tracks.
  console.log("Fetching auto-captions (best-effort)…");
  const sub = runYtDlp([
    "--skip-download",
    "--write-auto-subs",
    "--sub-langs",
    "en,en-orig,en-US",
    "--sub-format",
    "vtt",
    "--no-playlist",
    "--no-warnings",
    "-o",
    outTemplate,
    url,
  ]);
  if (sub.status !== 0) {
    console.log("(captions unavailable — proceeding with footage only)");
  }

  const files = await readdir(SOURCES_DIR);
  const mp4 = files.find((f) => f.startsWith(sourceId) && f.endsWith(".mp4"));
  const vtt = files.find((f) => f.startsWith(sourceId) && f.endsWith(".vtt"));
  if (!mp4) {
    throw new Error("yt-dlp did not produce an mp4 (progressive format unavailable?)");
  }
  return {
    videoRel: `sources/${mp4}`,
    vttPath: vtt ? path.join(SOURCES_DIR, vtt) : null,
  };
}

async function cleanup() {
  try {
    const files = await readdir(SOURCES_DIR);
    await Promise.all(
      files
        .filter((f) => f.startsWith(sourceId))
        .map((f) => rm(path.join(SOURCES_DIR, f), { force: true }))
    );
  } catch {
    /* ignore */
  }
}

async function main() {
  const { videoRel, vttPath } = await download();

  let captions = [];
  if (vttPath && existsSync(vttPath)) {
    captions = buildCaptions(parseVtt(await readFile(vttPath, "utf8")));
    console.log(`Parsed ${captions.length} caption cues for the segment.`);
  } else {
    console.log("No auto-captions found — rendering footage without captions.");
  }

  const inputProps = {
    videoSrc: videoRel,
    startSeconds: start,
    endSeconds: end,
    hook,
    captions,
    accent,
  };

  console.log("Bundling…");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });

  console.log("Selecting SourceClip…");
  const composition = await selectComposition({
    serveUrl,
    id: "SourceClip",
    inputProps,
  });

  const outPath = path.resolve(`out/${sourceId}.mp4`);
  console.log(`Rendering → ${outPath}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
  });
  console.log("Render complete.");

  const publicUrl = await uploadVideo(outPath, storageKey);
  if (publicUrl) {
    console.log(`\nUploaded: ${publicUrl}`);
    console.log(`CLIPR_RESULT_URL=${publicUrl}`);
  } else {
    console.log(`\nLocal file: ${outPath}`);
  }
}

main()
  .catch((err) => {
    console.error("Render failed:", err);
    process.exitCode = 1;
  })
  .finally(cleanup);
