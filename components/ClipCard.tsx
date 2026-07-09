"use client";

import { useRef, useState } from "react";
import { Copy, Send, Clapperboard, Download } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import VideoPreview from "@/components/VideoPreview";
import { youtubeIdFromUrl } from "@/lib/youtube";
import PostDialog from "@/components/PostDialog";
import { apiPost, ApiError } from "@/components/lib/api";
import { saveVideo } from "@/lib/download";

type Clip = Tables<"clips">;

export default function ClipCard({
  clip,
  sourceUrl,
  accent,
}: {
  clip: Clip;
  sourceUrl?: string | null;
  /** Caption highlight colour from the chosen caption style. */
  accent?: string;
}) {
  const [postOpen, setPostOpen] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(clip.r2_url);
  const [rendering, setRendering] = useState(false);
  const youtubeId = youtubeIdFromUrl(sourceUrl);

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Poll the clip row until the worker writes the rendered MP4 URL.
  async function pollForRender(): Promise<string | null> {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const { data } = await getSupabase()
        .from("clips")
        .select("r2_url")
        .eq("id", clip.id)
        .single();
      if (data?.r2_url) return data.r2_url;
    }
    return null;
  }

  async function renderVideo() {
    setRendering(true);
    try {
      const resp = await apiPost<{ url?: string; status?: string }>(
        "/api/render",
        { clipId: clip.id, accent }
      );
      if (resp.url) {
        setRenderedUrl(resp.url);
        toast.success("Clip rendered and saved.");
        return;
      }
      // Worker is rendering on the server — poll for the result.
      toast.message("Rendering on the server — this can take a minute…");
      const url = await pollForRender();
      if (url) {
        setRenderedUrl(url);
        toast.success("Clip rendered and saved.");
      } else {
        toast.error("Still rendering — check back in a moment.");
      }
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Couldn't render this clip.");
    } finally {
      setRendering(false);
    }
  }

  async function downloadVideo() {
    if (!renderedUrl) return;
    const name = `${(clip.title || "clip").replace(/[^\w-]+/g, "-").slice(0, 40)}.mp4`;
    await saveVideo(renderedUrl, name);
  }

  const hashtags = clip.hashtags ?? [];
  const captions = clip.captions ?? [];
  const description = clip.description ?? "";

  const defaultCaption = [description, hashtags.join(" ")]
    .filter(Boolean)
    .join("\n\n");

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(defaultCaption || description);
      toast.success("Caption copied.");
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  const score = clip.virality_score;
  const scoreColor =
    typeof score !== "number"
      ? "#7A756E"
      : score >= 80
        ? "#22e06a"
        : score >= 60
          ? "#C9A84C"
          : "#7A756E";

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-clipr-card neo-raised p-4">
      <div className="relative flex justify-center">
        <VideoPreview
          hook={clip.hook ?? undefined}
          captions={captions}
          duration={clip.duration ?? undefined}
          bgGradient={clip.bg_gradient ?? undefined}
          videoUrl={renderedUrl}
          youtubeId={youtubeId}
          startSeconds={clip.start_seconds}
          endSeconds={clip.end_seconds}
          accent={accent}
          onPlayClick={rendering ? undefined : renderVideo}
        />
        {typeof score === "number" && (
          <div
            className="absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 backdrop-blur-sm"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            title={clip.score_reason ?? "Virality score"}
          >
            <span style={{ fontSize: 11 }}>🔥</span>
            <span
              className="font-mono font-bold"
              style={{ fontSize: 13, color: scoreColor }}
            >
              {score}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {clip.title && (
          <h3 className="text-base font-semibold leading-snug text-clipr-text">
            {clip.title}
          </h3>
        )}
        {(clip.virality_tag || clip.score_reason) && (
          <div className="flex flex-col gap-1">
            {clip.virality_tag && (
              <span
                className="w-fit rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: `${scoreColor}22`, color: scoreColor }}
              >
                {clip.virality_tag}
              </span>
            )}
            {clip.score_reason && (
              <p className="text-xs text-clipr-dim">{clip.score_reason}</p>
            )}
          </div>
        )}
        {description && (
          <p className="line-clamp-3 text-sm text-clipr-secondary">
            {description}
          </p>
        )}
      </div>

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-clipr-card neo-inset px-2.5 py-0.5 font-mono text-xs text-clipr-secondary"
            >
              {tag.startsWith("#") ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={renderVideo}
          disabled={rendering}
        >
          {rendering ? (
            <span className="clipr-spinner" />
          ) : (
            <Clapperboard className="size-3.5" />
          )}
          {rendering
            ? "Rendering…"
            : renderedUrl
              ? "Re-render video"
              : "Render video"}
        </Button>
        {renderedUrl && (
          <Button variant="outline" size="sm" onClick={downloadVideo}>
            <Download className="size-3.5" />
            Download
          </Button>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-clipr-gold hover:text-clipr-gold"
            onClick={copyCaption}
          >
            <Copy className="size-3.5" />
            Copy caption
          </Button>
          <Button size="sm" className="flex-1" onClick={() => setPostOpen(true)}>
            <Send className="size-3.5" />
            Post
          </Button>
        </div>
      </div>

      <PostDialog
        open={postOpen}
        onOpenChange={setPostOpen}
        clipId={clip.id}
        defaultCaption={defaultCaption}
      />
    </div>
  );
}
