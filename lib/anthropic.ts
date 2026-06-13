import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Strip ```json ... ``` / ``` ... ``` fences Claude sometimes wraps output in. */
function stripMarkdownFences(text: string): string {
  let out = text.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```[a-zA-Z]*\s*\n?/, "");
    out = out.replace(/\n?```\s*$/, "");
  }
  return out.trim();
}

/**
 * Ask Claude for JSON and parse it. Throws a descriptive error if the
 * response is not valid JSON — callers should wrap in try/catch and map
 * failures to a 500 without leaking details to the client.
 */
export async function generateJSON<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cleaned = stripMarkdownFences(text);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Claude returned invalid JSON (first 200 chars): ${cleaned.slice(0, 200)}`
    );
  }
}
