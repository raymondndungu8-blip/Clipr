// LLM helper — talks to an OpenAI-compatible chat-completions endpoint.
// Defaults to NVIDIA NIM (https://integrate.api.nvidia.com/v1), which offers a
// free tier and hosts Llama / Qwen / Nemotron / etc. Swap LLM_BASE_URL +
// LLM_MODEL + the matching key to use any other OpenAI-compatible provider.
// (File kept as lib/anthropic.ts so existing route imports don't change.)

const BASE_URL =
  process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.LLM_MODEL || "meta/llama-3.3-70b-instruct";

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY;
  if (!key || key.includes("...")) {
    throw new Error(
      "LLM is not configured — set NVIDIA_API_KEY (or LLM_API_KEY) in .env.local."
    );
  }
  return key;
}

/** Strip ```json ... ``` fences and any <think>…</think> reasoning blocks. */
function cleanModelOutput(text: string): string {
  let out = text.trim();
  // Remove reasoning traces some models emit before the answer.
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```[a-zA-Z]*\s*\n?/, "");
    out = out.replace(/\n?```\s*$/, "");
  }
  // If there's prose around the JSON, grab the outermost JSON object/array.
  if (!out.startsWith("{") && !out.startsWith("[")) {
    const match = out.match(/[[{][\s\S]*[\]}]/);
    if (match) out = match[0];
  }
  return out.trim();
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
  error?: unknown;
}

/**
 * Ask the model for JSON and parse it. Throws a descriptive error on a non-2xx
 * response or unparseable JSON — callers wrap in try/catch and map failures to
 * a 500 without leaking details to the client.
 */
export async function generateJSON<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      temperature: 0.8,
      top_p: 0.9,
      max_tokens: opts.maxTokens ?? 4096,
      stream: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as ChatCompletion;
  const text = data.choices?.[0]?.message?.content ?? "";
  const cleaned = cleanModelOutput(text);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `LLM returned invalid JSON (first 200 chars): ${cleaned.slice(0, 200)}`
    );
  }
}
