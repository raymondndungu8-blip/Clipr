"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PlatformPill, { PLATFORMS, type Platform } from "@/components/PlatformPill";
import RateLimitBanner from "@/components/RateLimitBanner";
import { apiPost, ApiError } from "@/components/lib/api";

type PostDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Either clipId or videoId should be set. */
  clipId?: string;
  videoId?: string;
  defaultCaption?: string;
  defaultPlatforms?: Platform[];
};

export default function PostDialog({
  open,
  onOpenChange,
  clipId,
  videoId,
  defaultCaption = "",
  defaultPlatforms = ["TikTok"],
}: PostDialogProps) {
  const [caption, setCaption] = useState(defaultCaption);
  const [platforms, setPlatforms] = useState<Platform[]>(defaultPlatforms);
  const [loading, setLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<string | null>(null);

  function toggle(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function submit() {
    if (platforms.length === 0) {
      toast.error("Pick at least one platform.");
      return;
    }
    setLoading(true);
    setRateLimit(null);
    try {
      await apiPost<{ postId: string; status: string }>("/api/post", {
        clipId,
        videoId,
        platforms,
        caption,
      });
      toast.success("Post queued.");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setRateLimit(err.resetAt ?? "");
        } else if (err.status === 422) {
          toast.error("Check the caption and platforms and try again.");
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-clipr-card">
        <DialogHeader>
          <DialogTitle>Post to socials</DialogTitle>
          <DialogDescription>
            Choose platforms and edit the caption before sending.
          </DialogDescription>
        </DialogHeader>

        {rateLimit !== null && (
          <RateLimitBanner
            resetAt={rateLimit || undefined}
            onDismiss={() => setRateLimit(null)}
          />
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <PlatformPill
                  key={p}
                  platform={p}
                  active={platforms.includes(p)}
                  onToggle={toggle}
                  disabled={loading}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="post-caption">Caption</Label>
            <Textarea
              id="post-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              className="bg-clipr-surface"
              placeholder="Write a caption…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <span className="clipr-spinner" />}
            {loading ? "Posting…" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
