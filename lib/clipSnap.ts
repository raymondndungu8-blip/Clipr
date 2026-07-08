// Opus-style "clean clip" helpers.
//
// The single biggest reason AI clips feel unclean is that they start or end
// mid-sentence. Opus Clip solves this by snapping every clip to the natural
// boundaries of what was actually said. These helpers do the same: given the
// timed transcript lines, they pull a clip's start back to the beginning of the
// spoken line it lands in, and push its end out to the end of the line it lands
// in — so clips begin and end on complete thoughts, never mid-word.

export interface Boundary {
  /** Boundary start time in seconds (start of a spoken line). */
  start: number;
  /** Boundary end time in seconds (end of a spoken line). */
  end: number;
  /** Optional spoken text — used to prefer sentence-final punctuation. */
  text?: string;
}

export interface HasSegment {
  startSeconds?: number | null;
  endSeconds?: number | null;
}

export interface LengthWindow {
  min: number;
  max: number;
}

/** Target min/max clip length (seconds) for each Opus-style length preset. */
export function lengthWindow(preset?: string): LengthWindow {
  switch (preset) {
    case "<30s":
      return { min: 12, max: 30 };
    case "30-60s":
      return { min: 30, max: 60 };
    case "60-90s":
      return { min: 55, max: 92 };
    default:
      // "auto": Opus's sweet spot — complete moments, mostly 15–75s.
      return { min: 12, max: 75 };
  }
}

/** Seconds → "M:SS" (e.g. 8 → "0:08", 92 → "1:32"). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

const ENDS_SENTENCE = /[.!?]["'”’)]?\s*$/;

/**
 * Snap one clip's [startSeconds, endSeconds] to transcript boundaries so it
 * begins and ends on complete spoken lines, then clamp the result into the
 * target length window. Returns new start/end integers (or the originals if
 * there is nothing sensible to snap to).
 */
export function snapSegmentToBoundaries(
  startSeconds: number,
  endSeconds: number,
  boundaries: Boundary[],
  window: LengthWindow
): { startSeconds: number; endSeconds: number } {
  if (
    !Array.isArray(boundaries) ||
    boundaries.length === 0 ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    endSeconds <= startSeconds
  ) {
    return { startSeconds, endSeconds };
  }

  const sorted = [...boundaries]
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return { startSeconds, endSeconds };

  const firstStart = sorted[0].start;
  const lastEnd = sorted[sorted.length - 1].end;
  const TOL = 0.5; // tolerance so a start that's a hair inside a line still snaps to it

  // START → beginning of the line the chosen start falls in (largest line
  // start that is <= chosen start). Never start mid-line.
  let newStart = firstStart;
  for (const b of sorted) {
    if (b.start <= startSeconds + TOL) newStart = b.start;
    else break;
  }

  // END → end of the line the chosen end falls in (smallest line end that is
  // >= chosen end). Prefer a line that ends a sentence when one is close.
  let newEnd = lastEnd;
  for (const b of sorted) {
    if (b.end >= endSeconds - TOL) {
      newEnd = b.end;
      // If this line doesn't finish a sentence, try to extend to the next line
      // that does — but only if it stays inside the max length.
      if (b.text && !ENDS_SENTENCE.test(b.text)) {
        for (const nb of sorted) {
          if (nb.start < b.start) continue;
          if (nb.end - newStart > window.max) break;
          if (nb.text && ENDS_SENTENCE.test(nb.text)) {
            newEnd = nb.end;
            break;
          }
        }
      }
      break;
    }
  }

  if (newEnd <= newStart) {
    newStart = startSeconds;
    newEnd = endSeconds;
  }

  // Clamp into the length window without ever cutting mid-line again: trim the
  // end back to the nearest line end within max, and extend to reach min.
  if (newEnd - newStart > window.max) {
    const cap = newStart + window.max;
    let capped = newStart;
    for (const b of sorted) {
      if (b.end > newStart && b.end <= cap + TOL) capped = b.end;
      else if (b.end > cap + TOL) break;
    }
    if (capped > newStart) newEnd = capped;
  }
  if (newEnd - newStart < window.min) {
    const target = newStart + window.min;
    let extended = newEnd;
    for (const b of sorted) {
      if (b.end >= target - TOL) {
        extended = b.end;
        break;
      }
    }
    newEnd = Math.min(lastEnd, Math.max(extended, target));
  }

  return {
    startSeconds: Math.max(0, Math.round(newStart)),
    endSeconds: Math.round(newEnd),
  };
}
