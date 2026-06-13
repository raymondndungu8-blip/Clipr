import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { generateJSON } from "@/lib/anthropic";
import { CaptionInputSchema } from "@/lib/validations/caption";

interface CaptionResult {
  words: string[];
  highlights: number[];
  timing: number;
}

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "captionAnimate");
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CaptionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { script, style } = parsed.data;

  try {
    const result = await generateJSON<CaptionResult>({
      system:
        "You are a karaoke-style caption animator for short-form video. Return valid JSON only.",
      prompt: `Turn this script into animated caption chunks (${style} style).

Script:
"""
${script}
"""

Return a JSON object with:
- "words": array of 12-18 caption chunks, each 2-4 words, ALL UPPERCASE, in spoken order
- "highlights": array of integer indices into "words" marking the most emphatic chunks (3-6 indices)
- "timing": total estimated read time in seconds (number)

Return ONLY the JSON object, no markdown.`,
    });

    if (!result || !Array.isArray(result.words)) {
      throw new Error("Claude did not return caption words");
    }

    return NextResponse.json({
      words: result.words,
      highlights: Array.isArray(result.highlights) ? result.highlights : [],
      timing: typeof result.timing === "number" ? result.timing : 45,
    });
  } catch (err) {
    console.error("[api/captions] generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
