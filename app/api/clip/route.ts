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
      prompt: `Create exactly 3 viral short-form clip concepts for ${source}.
Style: ${style}. Target platforms: ${platforms.join(", ")}.

Return a JSON array of exactly 3 objects, each with:
- "title": punchy clip title (under 60 chars)
- "hook": scroll-stopping first line spoken on screen
- "description": 1-2 sentence post description tailored to the platforms
- "captions": array of exactly 5 short caption chunks, each 2-4 words, ALL UPPERCASE
- "hashtags": array of exactly 5 relevant hashtags (with #)
- "duration": estimated clip length as "0:NN" (e.g. "0:34")
- "bgGradient": a dark CSS linear-gradient string suited to the mood (e.g. "linear-gradient(135deg, #0f0c29, #302b63)")

Return ONLY the JSON array. No markdown, no commentary.`,
    });

    if (!Array.isArray(clipsJson) || clipsJson.length === 0) {
      throw new Error("Claude did not return a clip array");
    }

    // 3. Persist clips
    const { error: clipsError } = await supabase.from("clips").insert(
      clipsJson.slice(0, 3).map((clip) => ({
        job_id: job.id,
        title: clip.title,
        hook: clip.hook,
        description: clip.description,
        captions: clip.captions,
        hashtags: clip.hashtags,
        duration: clip.duration,
        bg_gradient: clip.bgGradient,
      }))
    );
    if (clipsError) {
      console.error("[api/clip] clips insert failed:", clipsError);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }

    // 4. Dispatch to worker (video rendering) or finish in text-only mode
    if (url) {
      let dispatched = false;
      const workerUrl = process.env.WORKER_URL;
      if (workerUrl) {
        try {
          // Fire-and-forget render request
          await fetch(`${workerUrl}/process`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-worker-secret": process.env.WORKER_SECRET ?? "",
            },
            body: JSON.stringify({
              jobId: job.id,
              sourceUrl: url,
              topic: topic ?? null,
              platforms,
            }),
          });
          dispatched = true;
        } catch (err) {
          console.error("[api/clip] worker unreachable:", err);
        }
      }

      // TEXT-ONLY MODE: AI metadata clips are usable without rendered video.
      await supabase
        .from("clip_jobs")
        .update({ status: dispatched ? "processing" : "done" })
        .eq("id", job.id);
    } else {
      await supabase
        .from("clip_jobs")
        .update({ status: "done" })
        .eq("id", job.id);
    }

    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    console.error("[api/clip] generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
