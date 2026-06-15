// Reusable real-footage clip renderer: downloads only the [start,end] segment
// of a source video (yt-dlp + bundled ffmpeg), parses YouTube auto-captions,
// renders the trimmed 9:16 segment WITH its original audio + synced captions
// (SourceClip), and uploads to Supabase Storage. Returns the public URL.
//
// Shared by render-source.mjs (CLI) and server.mjs (HTTP service).

import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync, copyFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { uploadVideo } from "./upload.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES_DIR = path.join(ROOT, "public", "sources");
const ENTRY = path.join(ROOT, "src", "index.ts");
const YTDLP = process.env.YT_DLP_CMD || "python";
const YTDLP_PREFIX = process.env.YT_DLP_CMD ? [] : ["-m", "yt_dlp"];

// YouTube blocks plain web requests from datacenter IPs ("Sign in to confirm
// you're not a bot"). Forcing alternate player clients (tv/ios/android) usually
// bypasses that wall without cookies; if it doesn't, supply a Netscape cookies
// file via the YT_DLP_COOKIES secret as a fallback.
const PLAYER_CLIENTS = process.env.YT_PLAYER_CLIENTS || "tv,ios,android,web_safari";
const COOKIES_PATH = "/tmp/yt-cookies.txt";
let cookiesWritten = false;
function cookieArgs() {
  const raw = process.env.YT_DLP_COOKIES;
  if (!raw) return [];
  try {
    if (!cookiesWritten) {
      writeFileSync(COOKIES_PATH, raw.replace(/\\n/g, "\n"));
      cookiesWritten = true;
    }
    return ["--cookies", COOKIES_PATH];
  } catch {
    return [];
  }
}
function ytCommon() {
  return ["--extractor-args", `youtube:player_client=${PLAYER_CLIENTS}`, ...cookieArgs()];
}

// Bundle once per process and reuse across renders (big speedup for a service).
let cachedServeUrl = null;
async function getServeUrl() {
  if (!cachedServeUrl) cachedServeUrl = await bundle({ entryPoint: ENTRY });
  return cachedServeUrl;
}

function ensureFfmpegDir() {
  if (!ffmpegPath) return null;
  const dir = path.dirname(ffmpegPath);
  try {
    const dest = path.join(dir, path.basename(ffprobeStatic.path));
    if (!existsSync(dest)) copyFileSync(ffprobeStatic.path, dest);
  } catch {
    /* ffprobe optional */
  }
  return dir;
}

function tsToSeconds(ts) {
  const p = ts.trim().split(":").map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return Number(ts) || 0;
}

function parseVtt(content) {
  const cues = [];
  for (const block of content.replace(/\r/g, "").split("\n\n")) {
    const line = block.split("\n").find((l) => l.includes("-->"));
    if (!line) continue;
    const [s, e] = line.split("-->").map((x) => x.trim().split(" ")[0]);
    const text = block
      .split("\n")
      .filter((l) => l && !l.includes("-->") && l !== "WEBVTT" && !/^\d+$/.test(l))
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) cues.push({ start: tsToSeconds(s), end: tsToSeconds(e), text });
  }
  return cues;
}

function buildCaptions(cues, start, end, clipLen) {
  const out = [];
  let last = "";
  for (const c of cues) {
    if (c.end <= start || c.start >= end) continue;
    const rs = Math.max(0, c.start - start);
    const re = Math.min(clipLen, c.end - start);
    if (re - rs < 0.1) continue;
    const text = c.text.toUpperCase();
    if (text === last) {
      if (out.length) out[out.length - 1].end = re;
      continue;
    }
    out.push({ start: rs, end: re, text });
    last = text;
  }
  return out;
}

function runYtDlp(extra) {
  return spawnSync(YTDLP, [...YTDLP_PREFIX, ...extra], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function download(url, start, end, sourceId) {
  await mkdir(SOURCES_DIR, { recursive: true });
  const outTemplate = path.join(SOURCES_DIR, `${sourceId}.%(ext)s`);
  const ffmpegDir = ensureFfmpegDir();

  let segmented = false;
  if (ffmpegDir) {
    const seg = runYtDlp([
      ...ytCommon(),
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
  }
  if (!segmented) {
    const vid = runYtDlp([
      ...ytCommon(),
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

  // auto-captions (best-effort)
  runYtDlp([
    ...ytCommon(),
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

  const files = await readdir(SOURCES_DIR);
  const mp4 = files.find((f) => f.startsWith(sourceId) && f.endsWith(".mp4"));
  const vtt = files.find((f) => f.startsWith(sourceId) && f.endsWith(".vtt"));
  if (!mp4) throw new Error("yt-dlp did not produce an mp4");
  return {
    videoRel: `sources/${mp4}`,
    vttPath: vtt ? path.join(SOURCES_DIR, vtt) : null,
    segmented,
  };
}

async function cleanup(sourceId) {
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

/**
 * Render a real-footage clip and upload it. Returns the public MP4 URL.
 * @param {{url:string,start:number,end:number,id:string,key:string,hook?:string,accent?:string}} opts
 */
export async function renderSourceClip(opts) {
  const { url, start, end, id } = opts;
  const clipLen = Math.max(1, end - start);
  const key = opts.key || `clips/${id}.mp4`;
  const hook = opts.hook ?? "";
  const accent = opts.accent ?? "#3d7bff";

  try {
    const { videoRel, vttPath, segmented } = await download(url, start, end, id);
    let captions = [];
    if (vttPath && existsSync(vttPath)) {
      captions = buildCaptions(parseVtt(await readFile(vttPath, "utf8")), start, end, clipLen);
    }

    const inputProps = {
      videoSrc: videoRel,
      startSeconds: segmented ? 0 : start,
      endSeconds: segmented ? clipLen : end,
      hook,
      captions,
      accent,
    };

    const serveUrl = await getServeUrl();
    const composition = await selectComposition({
      serveUrl,
      id: "SourceClip",
      inputProps,
    });
    const outPath = path.join(ROOT, "out", `${id}.mp4`);
    await mkdir(path.dirname(outPath), { recursive: true });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outPath,
      inputProps,
    });

    const publicUrl = await uploadVideo(outPath, key);
    await rm(outPath, { force: true }).catch(() => {});
    return publicUrl;
  } finally {
    await cleanup(id);
  }
}
