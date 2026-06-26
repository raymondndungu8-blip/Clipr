import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { generateJSON } from "@/lib/anthropic";
import { listAccounts } from "@/lib/zernio";
import { youtubeIdFromUrl } from "@/lib/youtube";
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
  viralityScore: number;
  scoreReason: string;
  viralityTag: string;
}

/** Opus-style target-length guidance for the AI. */
function lengthGuide(preset?: string): string {
  switch (preset) {
    case "<30s":
      return "Each clip MUST be 15-30 seconds.";
    case "30-60s":
      return "Each clip MUST be 30-60 seconds.";
    case "60-90s":
      return "Each clip MUST be 60-90 seconds.";
    default:
      return "Each clip should be 20-60 seconds — whatever length best captures a complete, self-contained moment.";
  }
}

type TranscriptSegment = { start: number; dur: number; text: string };

/** Fetch the real video transcript from the worker (not IP-blocked). */
async function fetchTranscript(
  videoId: string
): Promise<TranscriptSegment[] | null> {
  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl || workerUrl.includes("your-worker")) return null;
  try {
    const res = await fetch(`${workerUrl}/transcript`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": process.env.WORKER_SECRET ?? "",
      },
      body: JSON.stringify({ videoId }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      segments?: TranscriptSegment[];
    };
    if (data?.ok && Array.isArray(data.segments) && data.segments.length > 0) {
      return data.segments;
    }
  } catch (err) {
    console.error("[api/clip] transcript fetch failed:", err);
  }
  return null;
}

/** Condense a transcript into "[s] text" lines within a character budget. */
function condenseTranscript(segments: TranscriptSegment[], maxChars = 24000) {
  const lines: string[] = [];
  let total = 0;
  for (const s of segments) {
    const line = `[${Math.floor(s.start)}] ${s.text}`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
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

  const { url, topic, style, platforms, uploadKey } = parsed.data;
  const count = parsed.data.count ?? 3;
  const accent = parsed.data.accent ?? "#22e06a";

  // Gate: a social account must be connected (a manually-added page OR a
  // Zernio-connected account) before clipping.
  {
    let connected = false;
    const { data: own } = await supabase
      .from("social_accounts")
      .select("id")
      .limit(1);
    if (own && own.length > 0) connected = true;
    if (!connected) {
      try {
        connected = (await listAccounts()).length > 0;
      } catch (err) {
        console.error("[api/clip] connection check failed:", err);
      }
    }
    if (!connected) {
      return NextResponse.json(
        {
          error: "Connect a social account before clipping.",
          code: "NO_CONNECTION",
        },
        { status: 403 }
      );
    }
  }

  // Uploaded video: the worker does everything (download → Whisper transcript →
  // AI clip selection → render from the file). Async; the client polls the job.
  if (uploadKey) {
    const { data: job, error: jobError } = await supabase
      .from("clip_jobs")
      .insert({
        user_id: user.id,
        source_url: null,
        topic: topic ?? null,
        style,
        platforms,
        status: "processing",
      })
      .select("id")
      .single();
    if (jobError || !job) {
      console.error("[api/clip] upload job insert failed:", jobError);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }

    const workerUrl = process.env.WORKER_URL;
    if (!workerUrl || workerUrl.includes("your-worker")) {
      await supabase
        .from("clip_jobs")
        .update({ status: "failed", error_message: "Processor unavailable." })
        .eq("id", job.id);
      return NextResponse.json(
        { error: "Video processing isn't available right now." },
        { status: 503 }
      );
    }
    try {
      const res = await fetch(`${workerUrl}/process-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": process.env.WORKER_SECRET ?? "",
        },
        body: JSON.stringify({
          jobId: job.id,
          key: uploadKey,
          count,
          style,
          platforms,
          accent,
          clipLength: parsed.data.clipLength,
          topic: topic ?? null,
        }),
      });
      if (!res.ok && res.status !== 202) {
        throw new Error(`worker responded ${res.status}`);
      }
      return NextResponse.json({ jobId: job.id, status: "processing" });
    } catch (err) {
      console.error("[api/clip] upload dispatch failed:", err);
      await supabase
        .from("clip_jobs")
        .update({ status: "failed", error_message: "Couldn't reach processor." })
        .eq("id", job.id);
      return NextResponse.json(
        { error: "Couldn't start processing. Try again." },
        { status: 502 }
      );
    }
  }

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

    // 2. AI clip metadata — grounded in the REAL transcript when we can read it,
    //    so titles/captions/timestamps actually match the video (no guessing).
    const youtubeId = youtubeIdFromUrl(url);
    const transcript = youtubeId ? await fetchTranscript(youtubeId) : null;

    const source = url
      ? `the video at ${url}${topic ? ` (about: ${topic})` : ""}`
      : `the topic "${topic}"`;

    const focus = topic
      ? `\n\nThe creator wants clips about: "${topic}". Prioritise moments matching that.`
      : "";

    const transcriptBlock = transcript
      ? `\n\nHere is the ACTUAL transcript of the video (each line is "[startSecond] spoken text"):\n"""\n${condenseTranscript(transcript)}\n"""\n\nUse ONLY this transcript. Choose the ${count} most viral, self-contained moments that ACTUALLY occur in it — each must have a strong hook in its first seconds AND a satisfying payoff/complete thought (not a random slice). Set startSeconds/endSeconds to the real transcript timestamps. Write the title, hook, description and captions from what is ACTUALLY said. Captions must be real phrases spoken in the clip. Do not invent anything not in the transcript.`
      : "";

    const clipsJson = await generateJSON<ClipMeta[]>({
      system:
        "You are an expert viral short-form video producer (like Opus Clip). You analyse long videos for visual, audio and sentiment cues and turn them into accurate, viral-worthy vertical shorts, each scored for viral potential. Return valid JSON only.",
      prompt: `From ${source}, select the ${count} BEST short-form clip${count === 1 ? "" : "s"} — the moments most likely to go viral.
Style: ${style}. Target platforms: ${platforms.join(", ")}. ${lengthGuide(parsed.data.clipLength)}${focus}${transcriptBlock}

For each clip return an object with:
- "title": punchy title (under 60 chars) from the clip's real content
- "hook": scroll-stopping first line drawn from what's actually said
- "description": 1 short post description for the platforms
- "captions": array of exactly 5 short chunks, 2-4 words, ALL UPPERCASE${transcript ? ", from words actually spoken in the clip" : ""}
- "hashtags": array of exactly 5 relevant hashtags (with #)
- "duration": "0:NN" matching the length rule above
- "startSeconds": integer start (seconds) in the source${transcript ? " (real transcript timestamp)" : ""}
- "endSeconds": integer end; endSeconds - startSeconds equals the duration${transcript ? "" : ". Pick different, non-overlapping moments across a typical 8-15 min video"}
- "bgGradient": a dark CSS linear-gradient string suited to the mood
- "viralityScore": integer 0-100 predicting viral potential (be honest and differentiated — strong hook + emotion + payoff scores high; flat/rambling scores low)
- "viralityTag": 1-3 word reason it could pop (e.g. "Strong Hook", "Emotional", "Controversial", "Actionable", "Surprising")
- "scoreReason": one short sentence on why it scored that

Return ONLY a JSON array of exactly ${count} objects, sorted by viralityScore descending. No markdown, no commentary.`,
      maxTokens: Math.min(Math.max(2200, count * 750 + 700), 14000),
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
        virality_score:
          typeof clip.viralityScore === "number"
            ? Math.max(0, Math.min(100, Math.round(clip.viralityScore)))
            : null,
        score_reason: clip.scoreReason ?? null,
        virality_tag: clip.viralityTag ?? null,
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
