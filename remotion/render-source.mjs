// Real-footage clip pipeline: download ONLY the needed segment of the source
// video with yt-dlp (+ bundled ffmpeg) and its YouTube auto-captions, render the
// trimmed 9:16 segment with synced captions (SourceClip), and upload.
//
// Usage:
//   node render-source.mjs --url <yt-url> --start 30 --end 55 \
//     --id <sourceId> --key clips/<id>.mp4 [--hook "..."] [--accent "#3d7bff"]
//
// Requires yt-dlp (callable as `python -m yt_dlp`); ffmpeg is provided by the
// bundled ffmpeg-static package, so no system ffmpeg is needed.

import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync, copyFileSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { uploadVideo } from "./lib/upload.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("url", "");
const start = parseFloat(arg("start", "0"));
const end = parseFloat(arg("end", "30"));
const clipLen = Math.max(1, end - start);
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

/** Directory containing both ffmpeg and ffprobe, for yt-dlp --ffmpeg-location. */
function ensureFfmpegDir() {
  if (!ffmpegPath) return null;
  const dir = path.dirname(ffmpegPath);
  try {
    const probeName = path.basename(ffprobeStatic.path);
    const dest = path.join(dir, probeName);
    if (!existsSync(dest)) copyFileSync(ffprobeStatic.path, dest);
  } catch {
    /* ffprobe is optional for section downloads */
  }
  return dir;
}

function tsToSeconds(ts) {
  const parts = ts.trim().split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(ts) || 0;
}

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
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) cues.push({ start: tsToSeconds(s), end: tsToSeconds(e), text });
  }
  return cues;
}

/** Build segment-relative caption cues (filtered to [start,end], offset by -start). */
function buildCaptions(cues) {
  const out = [];
  let lastText = "";
  for (const c of cues) {
    if (c.end <= start || c.start >= end) continue;
    const rs = Math.max(0, c.start - start);
    const re = Math.min(clipLen, c.end - start);
    if (re - rs < 0.1) continue;
    const text = c.text.toUpperCase();
    if (text === lastText) {
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
  const ffmpegDir = ensureFfmpegDir();

  // 1. Video — try a fast SEGMENT-ONLY download with bundled ffmpeg.
  let segmented = false;
  if (ffmpegDir) {
    console.log(`Downloading segment ${start}s–${end}s…`);
    const seg = runYtDlp([
      "-f",
      "bv*[height<=720]+ba/b[height<=720]/18/best[ext=mp4]",
      "--download-sections",
      `*${start}-${end}`,
      "--force-keyframes-at-cuts",
      "--ffmpeg-location",
      ffmpegDir,
      "--no-playlist",
      "--no-warnings",
      "--merge-output-format",
      "mp4",
      "-o",
      outTemplate,
      url,
    ]);
    segmented = seg.status === 0;
    if (!segmented) {
      console.log(
        `Segment download failed, falling back to full download: ${(seg.stderr || "").slice(-200)}`
      );
    }
  }

  // 2. Fallback — full progressive download (trim happens in Remotion).
  if (!segmented) {
    console.log("Downloading source video (full)…");
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
  }

  // 3. Auto-captions — best-effort.
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
    throw new Error("yt-dlp did not produce an mp4 (format unavailable?)");
  }
  return {
    videoRel: `sources/${mp4}`,
    vttPath: vtt ? path.join(SOURCES_DIR, vtt) : null,
    segmented,
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
  const { videoRel, vttPath, segmented } = await download();

  let captions = [];
  if (vttPath && existsSync(vttPath)) {
    captions = buildCaptions(parseVtt(await readFile(vttPath, "utf8")));
    console.log(`Parsed ${captions.length} caption cues for the segment.`);
  } else {
    console.log("No auto-captions found — rendering footage without captions.");
  }

  // When segmented, the file already starts at the cut, so trim from 0.
  const inputProps = {
    videoSrc: videoRel,
    startSeconds: segmented ? 0 : start,
    endSeconds: segmented ? clipLen : end,
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
