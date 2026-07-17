import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRoute } from "@/lib/apiGuard";
import { youtubeIdFromUrl } from "@/lib/youtube";

export const maxDuration = 60;

const RenderSchema = z
  .object({
    clipId: z.string().optional(),
    videoId: z.string().optional(),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .refine((d) => d.clipId || d.videoId, {
    message: "clipId or videoId is required",
  });

const DEFAULT_GRADIENT =
  "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)";

function parseDurationSeconds(input: string | null | undefined): number | undefined {
  if (!input) return undefined;
  const mmss = /^(\d+):(\d{1,2})$/.exec(input.trim());
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const secOnly = /^(\d+)\s*s?$/.exec(input.trim());
  if (secOnly) return Number(secOnly[1]);
  return undefined;
}

export async function POST(req: NextRequest) {
  const guard = await guardRoute(req, "clipGenerate");
  if (guard.error) return guard.error;
  const { supabase } = guard;

  const body = await req.json().catch(() => null);
  const parsed = RenderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const accent = parsed.data.accent ?? "#22e06a";

  // Faceless video: render the AI captions + hook over a gradient (no source).
  if (parsed.data.videoId) {
    const { data: video } = await supabase
      .from("faceless_videos")
      .select("*")
      .eq("id", parsed.data.videoId)
      .single();
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const script = (video.script_json ?? {}) as {
      hook?: string;
      captions?: unknown;
      bgGradient?: string;
    };
    const captions = Array.isArray(script.captions) ? script.captions : [];
    const hook = script.hook ?? "";
    const gradient = script.bgGradient ?? DEFAULT_GRADIENT;
    const key = `videos/${video.id}.mp4`;

    const workerUrl = process.env.WORKER_URL;
    if (!workerUrl || workerUrl.includes("your-worker")) {
      return NextResponse.json(
        { error: "Render service not configured" },
        { status: 500 }
      );
    }

    try {
      const res = await fetch(`${workerUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": process.env.WORKER_SECRET ?? "",
        },
        body: JSON.stringify({
          clipId: video.id,
          table: "faceless_videos",
          hook,
          captions,
          gradient,
          accent,
          key,
          duration: parseDurationSeconds(video.duration),
        }),
      });
      if (!res.ok && res.status !== 202) {
        throw new Error(`worker responded ${res.status}`);
      }
      return NextResponse.json({ status: "rendering" });
    } catch (err) {
      console.error("[api/render] faceless dispatch failed:", err);
      return NextResponse.json(
        { error: "Couldn't reach the render service. Try again." },
        { status: 502 }
      );
    }
  }

  // RLS ensures the user can only render their own clip.
  const clipId = parsed.data.clipId!;
  const { data: clip } = await supabase
    .from("clips")
    .select("*")
    .eq("id", clipId)
    .single();
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const { data: job } = await supabase
    .from("clip_jobs")
    .select("source_url")
    .eq("id", clip.job_id)
    .single();

  const youtubeId = youtubeIdFromUrl(job?.source_url);
  const hasSegment =
    typeof clip.start_seconds === "number" &&
    typeof clip.end_seconds === "number" &&
    clip.end_seconds > clip.start_seconds;

  const workerUrl = process.env.WORKER_URL;
  if (!workerUrl || workerUrl.includes("your-worker")) {
    return NextResponse.json(
      { error: "Render service not configured" },
      { status: 500 }
    );
  }

  const renderBody: Record<string, unknown> = {
    clipId: clip.id,
    hook: clip.hook ?? "",
    captions: clip.captions ?? [],
    gradient: clip.bg_gradient ?? undefined,
    accent,
    key: `clips/${clip.id}.mp4`,
    duration: parseDurationSeconds(clip.duration),
  };
  if (youtubeId && hasSegment && job?.source_url) {
    renderBody.url = job.source_url;
    renderBody.start = clip.start_seconds;
    renderBody.end = clip.end_seconds;
  }

  try {
    const res = await fetch(`${workerUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": process.env.WORKER_SECRET ?? "",
      },
      body: JSON.stringify(renderBody),
    });
    if (!res.ok && res.status !== 202) {
      throw new Error(`worker responded ${res.status}`);
    }
    return NextResponse.json({ status: "rendering" });
  } catch (err) {
    console.error("[api/render] worker dispatch failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach the render service. Try again." },
      { status: 502 }
    );
  }
}
