// Generate clip metadata from a real transcript using the NVIDIA LLM
// (OpenAI-compatible). Returns an array of clip objects. Worker-side port of
// the app's clip generation so uploads can be processed entirely on the worker.

const BASE = process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
// Fast, widely-available default so upload processing returns quickly.
// Override with LLM_MODEL for a larger/more-accurate model.
const MODEL = process.env.LLM_MODEL || "meta/llama-3.1-8b-instruct";

function stripFences(text) {
  let t = text.trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return t;
}

function condense(segments, maxChars = 9000) {
  const lines = [];
  let total = 0;
  for (const s of segments) {
    const line = `[${Math.floor(s.start)}] ${s.text}`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

function lengthGuide(preset) {
  switch (preset) {
    case "<30s":
      return "Each clip MUST be 15-30 seconds.";
    case "30-60s":
      return "Each clip MUST be 30-60 seconds.";
    case "60-90s":
      return "Each clip MUST be 60-90 seconds.";
    default:
      return "Each clip should be 20-60 seconds — whatever best captures a complete, self-contained moment.";
  }
}

function lengthWindow(preset) {
  switch (preset) {
    case "<30s":
      return { min: 12, max: 30 };
    case "30-60s":
      return { min: 30, max: 60 };
    case "60-90s":
      return { min: 55, max: 92 };
    default:
      return { min: 12, max: 75 };
  }
}

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const ENDS_SENTENCE = /[.!?]["'”’)]?\s*$/;

// Opus-style clean-clip snapping: pull a clip's start/end onto spoken-line
// boundaries so it begins and ends on a complete thought, then clamp to the
// target length window. `boundaries` are {start,end,text} in seconds.
function snapToBoundaries(startSeconds, endSeconds, boundaries, window) {
  if (
    !Array.isArray(boundaries) ||
    !boundaries.length ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    endSeconds <= startSeconds
  ) {
    return { startSeconds, endSeconds };
  }
  const sorted = boundaries
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start);
  if (!sorted.length) return { startSeconds, endSeconds };

  const firstStart = sorted[0].start;
  const lastEnd = sorted[sorted.length - 1].end;
  const TOL = 0.5;

  let newStart = firstStart;
  for (const b of sorted) {
    if (b.start <= startSeconds + TOL) newStart = b.start;
    else break;
  }

  let newEnd = lastEnd;
  for (const b of sorted) {
    if (b.end >= endSeconds - TOL) {
      newEnd = b.end;
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

/**
 * @param {{segments:{start:number,end:number,text:string}[], count:number, style:string, platforms:string[], clipLength?:string, topic?:string|null}} opts
 */
export async function generateClipsFromTranscript(opts) {
  const key = (process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || "").trim();
  if (!key) throw new Error("LLM_API_KEY / NVIDIA_API_KEY not configured on the worker");
  const { segments, count, style, platforms, clipLength, topic } = opts;
  const transcript = condense(segments);
  const focus = topic
    ? `\nThe creator wants clips about: "${topic}". Prioritise matching moments.`
    : "";

  const prompt = `You analyse a real video transcript (visual/audio/sentiment cues) and select the ${count} BEST viral short-form clip${count === 1 ? "" : "s"} — the moments most likely to go viral.
Style: ${style}. Target platforms: ${platforms.join(", ")}. ${lengthGuide(clipLength)}${focus}

Here is the ACTUAL transcript (each line is "[startSecond] spoken text"):
"""
${transcript}
"""

Choose the ${count} most viral, self-contained moments that ACTUALLY occur — each needs a strong hook in its first seconds AND a satisfying payoff (not a random slice). Return a JSON array of exactly ${count} objects, each with:
- "title": punchy title (under 60 chars) from the clip's real content
- "hook": scroll-stopping line drawn from what's actually said
- "description": 1 short post description
- "captions": array of exactly 5 chunks, 2-4 words, ALL UPPERCASE, from words actually spoken in the clip
- "hashtags": array of exactly 5 relevant hashtags (with #)
- "duration": "0:NN" matching the length rule above
- "startSeconds": integer start time (real transcript timestamp)
- "endSeconds": integer end; endSeconds-startSeconds equals the duration
- "bgGradient": a dark CSS linear-gradient string suited to the mood
- "viralityScore": integer 0-99 scored the Opus Clip way — weigh HOOK (do the first ~3s stop the scroll?), FLOW (one complete, self-contained thought that builds and resolves), VALUE (insight/emotion/entertainment the viewer keeps), and TREND (rides current interest). Honest and differentiated; only genuinely strong moments break 80
- "viralityTag": 1-3 word reason (e.g. "Strong Hook", "Emotional", "Surprising")
- "scoreReason": one short sentence on why it scored that

Return ONLY a JSON array of exactly ${count} objects, sorted by viralityScore descending. No markdown, no commentary.`;

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a viral short-form video producer. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: Math.min(Math.max(1800, count * 650 + 600), 12000),
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(stripFences(content));
  if (!Array.isArray(parsed)) throw new Error("LLM did not return an array");

  // Opus-style clean-clip snapping onto the real (Whisper) sentence boundaries
  // so every clip begins and ends on a complete thought, not mid-sentence.
  const boundaries = (segments || [])
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
    .map((s) => ({ start: s.start, end: s.end, text: s.text }));
  const window = lengthWindow(clipLength);
  if (boundaries.length) {
    for (const clip of parsed) {
      const s = Number(clip.startSeconds);
      const e = Number(clip.endSeconds);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      const snapped = snapToBoundaries(s, e, boundaries, window);
      clip.startSeconds = snapped.startSeconds;
      clip.endSeconds = snapped.endSeconds;
      clip.duration = fmtDuration(snapped.endSeconds - snapped.startSeconds);
    }
  }
  return parsed;
}
