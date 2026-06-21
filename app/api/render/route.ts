import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRoute } from "@/lib/apiGuard";
import { renderAndUpload, renderSourceAndUpload } from "@/lib/render";
import { youtubeIdFromUrl } from "@/lib/youtube";

// Rendering runs Node + Chromium (Remotion) + yt-dlp — local dev / a Node host
// (the worker), NOT Vercel serverless. On Vercel this route returns a clean
// error (CLIPR_RENDER_SCRIPT unset). Keep maxDuration within free-plan limits.
export const maxDuration = 60;

const RenderSchema = z.object({ clipId: z.uuid() });

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

  // RLS ensures the user can only render their own clip.
  const { data: clip } = await supabase
    .from("clips")
    .select("*")
    .eq("id", parsed.data.clipId)
    .single();
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  // Look up the source URL from the parent job.
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

  // Production: dispatch to the deployed render worker (Fly). It renders +
  // uploads and writes clip.r2_url when done; the client polls for it. Real
  // footage is used when there's a YouTube segment; otherwise (or if the
  // download is blocked) the worker renders the AI captions over a gradient, so
  // there's always a captioned, downloadable MP4.
  const workerUrl = process.env.WORKER_URL;
  if (workerUrl && !workerUrl.includes("your-worker")) {
    const body: Record<string, unknown> = {
      clipId: clip.id,
      hook: clip.hook ?? "",
      captions: clip.captions ?? [],
      gradient: clip.bg_gradient ?? undefined,
      accent: "#3d7bff",
      key: `clips/${clip.id}.mp4`,
    };
    if (youtubeId && hasSegment && job?.source_url) {
      body.url = job.source_url;
      body.start = clip.start_seconds;
      body.end = clip.end_seconds;
    }
    try {
      const res = await fetch(`${workerUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-secret": process.env.WORKER_SECRET ?? "",
        },
        body: JSON.stringify(body),
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

  // Local dev (no worker): render in-process and return the URL.
  try {
    let url: string;

    if (youtubeId && hasSegment && job?.source_url) {
      // Real footage: download the YouTube segment + auto-captions and render it.
      url = await renderSourceAndUpload({
        url: job.source_url,
        startSeconds: clip.start_seconds!,
        endSeconds: clip.end_seconds!,
        id: clip.id,
        key: `clips/${clip.id}.mp4`,
        hook: clip.hook ?? "",
      });
    } else {
      // Fallback: styled caption clip over a gradient.
      url = await renderAndUpload({
        compositionId: "CaptionClip",
        props: {
          hook: clip.hook ?? "",
          captions: clip.captions ?? [],
          gradient:
            clip.bg_gradient ??
            "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)",
          accent: "#3d7bff",
        },
        key: `clips/${clip.id}.mp4`,
      });
    }

    await supabase.from("clips").update({ r2_url: url }).eq("id", clip.id);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[api/render] render failed:", err);
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}
