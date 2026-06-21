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

/**
 * @param {{segments:{start:number,end:number,text:string}[], count:number, style:string, platforms:string[]}} opts
 */
export async function generateClipsFromTranscript(opts) {
  const key = process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not configured on the worker");
  const { segments, count, style, platforms } = opts;
  const transcript = condense(segments);

  const prompt = `You turn a real video transcript into ${count} viral short-form clip${count === 1 ? "" : "s"}.
Style: ${style}. Target platforms: ${platforms.join(", ")}.

Here is the ACTUAL transcript (each line is "[startSecond] spoken text"):
"""
${transcript}
"""

Pick the ${count} most compelling moments that ACTUALLY occur in the transcript. Return a JSON array of exactly ${count} objects, each with:
- "title": punchy clip title (under 60 chars) from the clip's real content
- "hook": scroll-stopping line drawn from what's actually said
- "description": 1 short post description
- "captions": array of exactly 5 short caption chunks, 2-4 words each, ALL UPPERCASE, taken from words actually spoken in the clip
- "hashtags": array of exactly 5 relevant hashtags (with #)
- "duration": clip length as "0:NN" between 15 and 60 seconds
- "startSeconds": integer start time from the transcript timestamps
- "endSeconds": integer end time; endSeconds-startSeconds equals the duration
- "bgGradient": a dark CSS linear-gradient string suited to the mood

Return ONLY the JSON array. No markdown, no commentary.`;

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
