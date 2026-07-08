'use strict';

function toSeconds(ts) {
  const m = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(ts);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

const CUE_HEADER_RE = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/;

function cleanLine(line) {
  return line
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a WebVTT auto-caption file (YouTube's "rolling 2-line" style: each
 * cue shows the previously-completed line plus a second line growing word by
 * word) into deduplicated, chronologically-ordered phrase segments.
 *
 * Only each cue's LAST line is used — the first line (when present) is
 * always a verbatim repeat of the previous cue's last line, so it's
 * redundant. The last line either extends the previous last line (emit the
 * new suffix) or starts fresh (emit it in full). Verified against a real
 * YouTube auto-caption file — see conversation notes for the test case.
 */
function parseAutoVtt(vttText) {
  const blocks = vttText.split(/\r?\n\r?\n+/);
  const cues = [];
  for (const block of blocks) {
    const rawLines = block.split(/\r?\n/).filter((l) => l.length > 0);
    const headerIdx = rawLines.findIndex((l) => CUE_HEADER_RE.test(l));
    if (headerIdx === -1) continue;
    const header = CUE_HEADER_RE.exec(rawLines[headerIdx]);
    const start = toSeconds(header[1]);
    const end = toSeconds(header[2]);
    if (start === null || end === null || end - start < 0.05) continue; // transient artifact cue

    const textLines = rawLines.slice(headerIdx + 1).map(cleanLine).filter(Boolean);
    if (textLines.length === 0) continue;
    cues.push({ start, lastLine: textLines[textLines.length - 1] });
  }

  const segments = [];
  let prevWords = [];
  for (const cue of cues) {
    const words = cue.lastLine.split(' ');
    const isExtension =
      prevWords.length > 0 &&
      prevWords.length <= words.length &&
      prevWords.every((w, i) => w === words[i]);
    const newWords = isExtension ? words.slice(prevWords.length) : words;
    if (newWords.length > 0) segments.push({ start: cue.start, text: newWords.join(' ') });
    prevWords = words;
  }

  // Merge segments that land very close together in time.
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.start < 1.5) {
      last.text = `${last.text} ${seg.text}`.trim();
    } else {
      merged.push({ start: seg.start, text: seg.text });
    }
  }
  for (let i = 0; i < merged.length; i++) {
    const next = merged[i + 1];
    merged[i].start = Math.round(merged[i].start);
    merged[i].dur = Math.max(1, Math.round((next ? next.start : merged[i].start + 3) - merged[i].start));
  }
  return merged;
}

module.exports = { parseAutoVtt };
