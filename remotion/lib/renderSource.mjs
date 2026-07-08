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
import { computeReframe } from "./reframe.mjs";
import { extractSegmentWords } from "./segmentWords.mjs";

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
  // Cookies are large; prefer a single-line base64 secret (YT_DLP_COOKIES_B64),
  // falling back to a raw value (YT_DLP_COOKIES) with optional \n escapes.
  let raw = process.env.YT_DLP_COOKIES;
  const b64 = process.env.YT_DLP_COOKIES_B64;
  if (!raw && b64) {
    try {
      raw = Buffer.from(b64, "base64").toString("utf8");
    } catch {
      raw = "";
    }
  }
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
// A residential proxy is the only reliable way past YouTube's datacenter-IP
// bot wall (cookies alone don't help once the IP is flagged). Set YT_DLP_PROXY
// to e.g. http://user:pass@host:port and all yt-dlp calls route through it.
function proxyArgs() {
  const proxy = process.env.YT_DLP_PROXY;
  if (!proxy || proxy.includes("...")) return [];
  return ["--proxy", proxy];
}
function ytCommon() {
  const cookies = cookieArgs();
  const proxy = proxyArgs();
  // With cookies, let yt-dlp use its default (web) client — it honors cookies.
  // Forcing tv/ios/android clients (a cookieless best-effort bypass) makes
  // yt-dlp ignore the cookies, so only do that when we have none.
  if (cookies.length) return [...proxy, ...cookies];
  return [...proxy, "--extractor-args", `youtube:player_client=${PLAYER_CLIENTS}`];
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

const DEFAULT_GRADIENT =
  "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)";

/**
 * Render a captions-only clip (hook + AI captions over a gradient) and upload
 * it. No YouTube/yt-dlp needed, so this always works — used directly for
 * topic-only clips and as the fallback when a source download is blocked.
 * @param {{id:string,key?:string,hook?:string,captions?:string[],gradient?:string,accent?:string}} opts
 */
export async function renderCaptionsClip(opts) {
  const { id } = opts;
  const key = opts.key || `clips/${id}.mp4`;
  const inputProps = {
    hook: opts.hook ?? "",
    captions: (opts.captions ?? []).map((c) => String(c)).filter(Boolean),
    gradient: opts.gradient || DEFAULT_GRADIENT,
    accent: opts.accent ?? "#3d7bff",
  };

  const serveUrl = await getServeUrl();
  const composition = await selectComposition({
    serveUrl,
    id: "CaptionClip",
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
}

/**
 * Render a clip from an ALREADY-LOCAL uploaded file (no download/yt-dlp).
 * Real footage + audio + Whisper captions. videoRel is relative to public/.
 * @param {{videoRel:string,start:number,end:number,id:string,key?:string,hook?:string,segments?:{start:number,end:number,text:string}[],accent?:string}} opts
 */
export async function renderUploadedClip(opts) {
  const { videoRel, start, end, id } = opts;
  const clipLen = Math.max(1, end - start);
  const key = opts.key || `clips/${id}.mp4`;
  const hook = opts.hook ?? "";
  const accent = opts.accent ?? "#3d7bff";
  const captions = buildCaptions(opts.segments || [], start, end, clipLen);

  // Word-level cues (clip-relative) for karaoke captions.
  const words = (opts.words || [])
    .filter((w) => w.end > start && w.start < end)
    .map((w) => ({
      text: String(w.text),
      start: Math.max(0, w.start - start),
      end: Math.min(clipLen, w.end - start),
    }));

  const inputProps = {
    videoSrc: videoRel,
    startSeconds: start,
    endSeconds: end,
    hook,
    captions,
    words,
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
}

/**
 * Render a real-footage clip and upload it. Returns the public MP4 URL. If the
 * source download is blocked (YouTube bot wall, no proxy), falls back to a
 * captions-only clip so there's always a downloadable, captioned output.
 * @param {{url:string,start:number,end:number,id:string,key:string,hook?:string,captions?:string[],gradient?:string,accent?:string}} opts
 */
export async function renderSourceClip(opts) {
  const { url, start, end, id } = opts;
  const clipLen = Math.max(1, end - start);
  const key = opts.key || `clips/${id}.mp4`;
  const hook = opts.hook ?? "";
  const accent = opts.accent ?? "#3d7bff";

  try {
    let downloaded;
    try {
      downloaded = await download(url, start, end, id);
    } catch (err) {
      console.error(
        `[render] source download failed (${err?.message || err}) — falling back to captions clip`
      );
      return await renderCaptionsClip(opts);
    }
    const { videoRel, vttPath, segmented } = downloaded;
    const absVideo = path.join(ROOT, "public", videoRel);
    let captions = [];
    if (vttPath && existsSync(vttPath)) {
      captions = buildCaptions(parseVtt(await readFile(vttPath, "utf8")), start, end, clipLen);
    }

    // Karaoke: word-level cues (clip-relative) transcribed from the actual
    // segment audio. Best-effort — falls back to VTT line captions if empty.
    // Whisper adds CPU per render; set DISABLE_KARAOKE_WHISPER=1 to skip it
    // (clips then use the line-level VTT captions instead).
    let words = [];
    if (process.env.DISABLE_KARAOKE_WHISPER !== "1") {
      try {
        const w = await extractSegmentWords({
          videoPath: absVideo,
          start,
          end,
          segmented,
        });
        words = Array.isArray(w?.words) ? w.words : [];
      } catch (err) {
        console.warn(`[render] word extraction failed: ${err?.message || err}`);
      }
    }

    // Subject-tracking reframe keyframes over the exact rendered window.
    // Best-effort — null means the composition uses a static centre crop.
    let reframeData = null;
    try {
      reframeData = computeReframe(
        absVideo,
        segmented ? 0 : start,
        segmented ? clipLen : end
      );
    } catch (err) {
      console.warn(`[render] reframe analysis failed: ${err?.message || err}`);
    }

    const inputProps = {
      videoSrc: videoRel,
      startSeconds: segmented ? 0 : start,
      endSeconds: segmented ? clipLen : end,
      hook,
      captions,
      words,
      reframe: reframeData?.reframe ?? [],
      srcWidth: reframeData?.srcWidth ?? 0,
      srcHeight: reframeData?.srcHeight ?? 0,
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
