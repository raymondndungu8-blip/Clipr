import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { generateJSON } from "@/lib/anthropic";
import { ClipInputSchema } from "@/lib/validations/clip";

interface ClipMeta {
  title: string;
  hook: string;
  description: string;
  captions: string[];
  hashtags: string[];
  duration: string;
  startSeconds: number;
  endSeconds: number;
  bgGradient: string;
}

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "clipGenerate");
  if (guard.error) return guard.error;
  const { user, supabase } = guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ClipInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { url, topic, style, platforms } = parsed.data;
  const count = parsed.data.count ?? 3;

  try {
    // 1. Create the job (RLS applies — request-scoped client)
    const { data: job, error: jobError } = await supabase
      .from("clip_jobs")
      .insert({
        user_id: user.id,
        source_url: url ?? null,
        topic: topic ?? null,
        style,
        platforms,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("[api/clip] job insert failed:", jobError);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }

    // 2. AI clip metadata
    const source = url
      ? `the video at ${url}${topic ? ` (about: ${topic})` : ""}`
      : `the topic "${topic}"`;

    const clipsJson = await generateJSON<ClipMeta[]>({
      system:
        "You are a viral short-form video producer. Return valid JSON only.",
      prompt: `Create exactly ${count} viral short-form clip concept${count === 1 ? "" : "s"} for ${source}.
Style: ${style}. Target platforms: ${platforms.join(", ")}.

Return a JSON array of exactly ${count} objects, each with:
- "title": punchy clip title (under 60 chars)
- "hook": scroll-stopping first line spoken on screen
- "description": 1 short post description tailored to the platforms
- "captions": array of exactly 5 short caption chunks, each 2-4 words, ALL UPPERCASE
- "hashtags": array of exactly 5 relevant hashtags (with #)
- "duration": clip length as "0:NN" (e.g. "0:34"), between 15 and 60 seconds
- "startSeconds": integer start time (in seconds) of this moment within the source video
- "endSeconds": integer end time (in seconds); endSeconds - startSeconds must equal the duration. Pick ${count} different, non-overlapping moments spread across a typical 8-15 minute video.
- "bgGradient": a dark CSS linear-gradient string suited to the mood (e.g. "linear-gradient(135deg, #0f0c29, #302b63)")

Return ONLY the JSON array. No markdown, no commentary.`,
      maxTokens: Math.min(Math.max(1800, count * 650 + 600), 12000),
    });

    if (!Array.isArray(clipsJson) || clipsJson.length === 0) {
      throw new Error("Claude did not return a clip array");
    }

    // 3. Persist clips
    const { error: clipsError } = await supabase.from("clips").insert(
      clipsJson.slice(0, count).map((clip) => ({
        job_id: job.id,
        title: clip.title,
        hook: clip.hook,
        description: clip.description,
        captions: clip.captions,
        hashtags: clip.hashtags,
        duration: clip.duration,
        start_seconds:
          typeof clip.startSeconds === "number" ? clip.startSeconds : null,
        end_seconds:
          typeof clip.endSeconds === "number" ? clip.endSeconds : null,
        bg_gradient: clip.bgGradient,
      }))
    );
    if (clipsError) {
      console.error("[api/clip] clips insert failed:", clipsError);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }

    // 4. Clips (AI title/hook/captions/timestamps + live preview) are ready
    //    immediately. Rendering an actual MP4 is on-demand per clip via
    //    /api/render, so the job itself is done as soon as the clips exist.
    await supabase
      .from("clip_jobs")
      .update({ status: "done" })
      .eq("id", job.id);

    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    console.error("[api/clip] generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
