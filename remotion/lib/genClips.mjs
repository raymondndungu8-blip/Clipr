// Generate clip metadata from a real transcript using the NVIDIA LLM
// (OpenAI-compatible). Returns an array of clip objects. Worker-side port of
// the app's clip generation so uploads can be processed entirely on the worker.

const BASE = process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.LLM_MODEL || "meta/llama-3.3-70b-instruct";

function stripFences(text) {
  let t = text.trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return t;
}

function condense(segments, maxChars = 24000) {
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

/**
 * @param {{segments:{start:number,end:number,text:string}[], count:number, style:string, platforms:string[], clipLength?:string, topic?:string|null}} opts
 */
export async function generateClipsFromTranscript(opts) {
  const key = process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not configured on the worker");
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
- "viralityScore": integer 0-100 predicting viral potential (honest and differentiated)
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
  return parsed;
}
