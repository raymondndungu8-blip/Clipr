// Produce word-level (and segment-level) caption timings for karaoke captions
// from a downloaded video SEGMENT, in the Remotion render worker.
//
// Given a downloaded mp4 that is either the exact [start,end] slice
// (segmented === true, internal time 0-based) or the whole video
// (segmented === false, the wanted slice lives at [start,end]), this returns
// CLIP-RELATIVE word/segment cues (0 at clip start .. clipLength).
//
// It NEVER throws: any failure yields { words: [], segments: [] }.

import { spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { transcribeFile } from "./whisper.mjs";

const EMPTY = { words: [], segments: [] };

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Clamp a list of 0-based cues into [0, clipLength]: drop cues fully outside,
// clamp the end to clipLength, round to 2 decimals, drop degenerate cues.
function clampCues(cues, clipLength) {
  if (!Array.isArray(cues)) return [];
  const out = [];
  for (const c of cues) {
    if (!c) continue;
    const s = round2(c.start);
    let e = round2(c.end);
    // Fully outside the window.
    if (s >= clipLength || e <= 0) continue;
    const cs = round2(Math.max(0, s));
    const ce = round2(Math.min(clipLength, e));
    if (!(ce > cs)) continue;
    out.push({ start: cs, end: ce, text: String(c.text ?? "") });
  }
  return out;
}

export async function extractSegmentWords({ videoPath, start, end, segmented }) {
  try {
    const clipLength = Math.max(1, Number(end) - Number(start));

    if (segmented) {
      // File already starts at the clip; whisper cues are 0-based.
      const r = transcribeFile(videoPath);
      if (!r || r.ok === false) return { words: [], segments: [] };
      return {
        words: clampCues(r.words, clipLength),
        segments: clampCues(r.segments, clipLength),
      };
    }

    // Not segmented: slice just the [start,end] audio to a temp wav, transcribe
    // that so the cues come back 0-based, then clean up the temp file.
    const tmpWav = path.join(
      os.tmpdir(),
      `clipr-seg-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
    );
    try {
      if (!ffmpegPath) return { words: [], segments: [] };
      const ff = spawnSync(ffmpegPath, [
        "-y",
        "-hide_banner",
        "-ss",
        String(start),
        "-to",
        String(end),
        "-i",
        videoPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        tmpWav,
      ]);
      if (!ff || ff.status !== 0) return { words: [], segments: [] };

      const r = transcribeFile(tmpWav);
      if (!r || r.ok === false) return { words: [], segments: [] };
      return {
        words: clampCues(r.words, clipLength),
        segments: clampCues(r.segments, clipLength),
      };
    } finally {
      try {
        unlinkSync(tmpWav);
      } catch {
        /* temp file may not exist */
      }
    }
  } catch {
    return { words: [], segments: [] };
  }
}
