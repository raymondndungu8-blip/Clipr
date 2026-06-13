import { NextRequest, NextResponse } from "next/server";
import { guardRoute } from "@/lib/apiGuard";
import { PostInputSchema } from "@/lib/validations/post";
import type { Json } from "@/types/database";

export async function POST(req: NextRequest) {
  // Reuse the clip limiter for posting per spec.
  const guard = await guardRoute(req, "clipGenerate");
  if (guard.error) return guard.error;
  const { user, supabase } = guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PostInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { clipId, videoId, platforms, caption, scheduledAt } = parsed.data;

  try {
    // 1. Resolve the media URL from the owned clip / video (RLS-scoped client).
    let mediaUrl: string | null = null;

    if (clipId) {
      const { data: clip } = await supabase
        .from("clips")
        .select("r2_url")
        .eq("id", clipId)
        .single();
      if (!clip) {
        return NextResponse.json({ error: "Clip not found" }, { status: 404 });
      }
      mediaUrl = clip.r2_url;
    } else if (videoId) {
      const { data: video } = await supabase
        .from("faceless_videos")
        .select("r2_url")
        .eq("id", videoId)
        .single();
      if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
      mediaUrl = video.r2_url;
    }

    if (!mediaUrl) {
      return NextResponse.json(
        { error: "Video not rendered yet — nothing to post." },
        { status: 422 }
      );
    }

    // 2. Record the post as queued.
    const { data: post, error: insertError } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        clip_id: clipId ?? null,
        video_id: videoId ?? null,
        platforms,
        caption,
        scheduled_at: scheduledAt ?? null,
        status: "queued",
      })
      .select("id")
      .single();

    if (insertError || !post) {
      console.error("[api/post] insert failed:", insertError);
      return NextResponse.json({ error: "Post failed" }, { status: 500 });
    }

    // 3. Dispatch to Zernio.
    const apiKey = process.env.ZERNIO_API_KEY;
    let status: "posted" | "failed" = "failed";
    let zernioResponse: Json = null;

    if (apiKey) {
      try {
        const res = await fetch("https://api.zernio.com/v1/posts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            platforms,
            media_url: mediaUrl,
            caption,
            scheduled_at: scheduledAt || undefined,
          }),
        });
        zernioResponse = (await res.json().catch(() => null)) as Json;
        status = res.ok ? "posted" : "failed";
      } catch (err) {
        console.error("[api/post] Zernio request failed:", err);
        zernioResponse = { error: "Zernio request failed" };
      }
    } else {
      zernioResponse = { error: "ZERNIO_API_KEY not configured" };
    }

    // 4. Finalize.
    await supabase
      .from("posts")
      .update({
        status,
        posted_at: status === "posted" ? new Date().toISOString() : null,
        zernio_response: zernioResponse,
      })
      .eq("id", post.id);

    return NextResponse.json({ postId: post.id, status });
  } catch (err) {
    console.error("[api/post] post failed:", err);
    return NextResponse.json({ error: "Post failed" }, { status: 500 });
  }
}
