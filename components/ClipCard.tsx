"use client";

import { useState } from "react";
import { Copy, Send, Clapperboard } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/types/database";
import { Button } from "@/components/ui/button";
import VideoPreview, { youtubeIdFromUrl } from "@/components/VideoPreview";
import PostDialog from "@/components/PostDialog";
import { apiPost, ApiError } from "@/components/lib/api";

type Clip = Tables<"clips">;

export default function ClipCard({
  clip,
  sourceUrl,
}: {
  clip: Clip;
  sourceUrl?: string | null;
}) {
  const [postOpen, setPostOpen] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(clip.r2_url);
  const [rendering, setRendering] = useState(false);
  const youtubeId = youtubeIdFromUrl(sourceUrl);

  async function renderVideo() {
    setRendering(true);
    try {
      const { url } = await apiPost<{ url: string }>("/api/render", {
        clipId: clip.id,
      });
      setRenderedUrl(url);
      toast.success("Clip rendered and saved.");
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Couldn't render this clip.");
    } finally {
      setRendering(false);
    }
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

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-clipr-card neo-raised p-4">
      <div className="flex justify-center">
        <VideoPreview
          hook={clip.hook ?? undefined}
          captions={captions}
          duration={clip.duration ?? undefined}
          bgGradient={clip.bg_gradient ?? undefined}
          videoUrl={renderedUrl}
          youtubeId={youtubeId}
          startSeconds={clip.start_seconds}
          endSeconds={clip.end_seconds}
        />
      </div>

      <div className="flex flex-col gap-2">
        {clip.title && (
          <h3 className="text-base font-semibold leading-snug text-clipr-text">
            {clip.title}
          </h3>
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
