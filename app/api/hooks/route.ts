import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { generateJSON } from "@/lib/anthropic";
import { HookInputSchema } from "@/lib/validations/hook";

interface Hook {
  hook: string;
  type: string;
  strength: number;
  why: string;
}

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "hookWrite");
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = HookInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { topic, platform, tone } = parsed.data;

  try {
    const hooks = await generateJSON<Hook[]>({
      system:
        "You are a viral short-form video hook writer. Return valid JSON only.",
      prompt: `Write exactly 6 scroll-stopping opening hooks.
Topic: "${topic}". Platform: ${platform}. Tone: ${tone}.

Return a JSON array of exactly 6 objects, each with:
- "hook": the opening line (one sentence, said in the first 2 seconds)
- "type": the hook archetype (one of "Bold claim", "Question", "Stat shock", "Story open", "Contrarian", "Curiosity gap")
- "strength": integer virality score from 1 to 10
- "why": one sentence explaining why it works

Vary the types across the 6 hooks. Return ONLY the JSON array, no markdown.`,
    });

    if (!Array.isArray(hooks) || hooks.length === 0) {
      throw new Error("Claude did not return a hook array");
    }

    return NextResponse.json({ hooks: hooks.slice(0, 6) });
  } catch (err) {
    console.error("[api/hooks] generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
