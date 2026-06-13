"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import VideoPreview, {
  CAPTION_STYLES,
  type CaptionStyle,
} from "@/components/VideoPreview";
import EmptyState from "@/components/EmptyState";
import RateLimitBanner from "@/components/RateLimitBanner";
import { apiPost, ApiError } from "@/components/lib/api";

type CaptionResult = {
  words: string[];
  highlights: number[];
  timing: number;
};

export default function CaptionsPage() {
  const [script, setScript] = useState("");
  const [style, setStyle] = useState<CaptionStyle>("Bold Gold");

  const [loading, setLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<string | null>(null);
  const [result, setResult] = useState<CaptionResult | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // auto-advance the preview using the returned timing
  useEffect(() => {
    if (!result || result.words.length <= 1) return;
    const id = setInterval(
      () => {
        setActiveIndex((i) => (i + 1) % result.words.length);
      },
      Math.max(400, result.timing || 1200)
    );
    return () => clearInterval(id);
  }, [result]);

  async function onGenerate() {
    if (!script.trim()) {
      toast.error("Add a script to animate.");
      return;
    }
    setLoading(true);
    setRateLimit(null);
    try {
      const res = await apiPost<CaptionResult>("/api/captions", {
        script: script.trim(),
        style,
      });
      setResult(res);
      setActiveIndex(0);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setRateLimit(err.resetAt ?? "");
        else if (err.status === 422)
          toast.error("Please check your script and try again.");
        else toast.error(err.message);
      } else {
        toast.error("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  const highlights = new Set(result?.highlights ?? []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-clipr-text">
          Caption animator
        </h1>
        <p className="text-sm text-clipr-secondary">
          Animate punchy captions, word by word.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* controls */}
        <div className="flex h-fit flex-col gap-5 rounded-2xl bg-clipr-card neo-raised p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="script">Script</Label>
            <Textarea
              id="script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={6}
              className="bg-clipr-surface"
              placeholder="Paste the line or script you want animated…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Style</Label>
            <div className="flex flex-col gap-2">
              {CAPTION_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all active:scale-[0.98]",
                    style === s
                      ? "neo-inset text-clipr-gold"
                      : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={onGenerate} disabled={loading} className="mt-1">
            {loading && <span className="clipr-spinner" />}
            {loading ? "Animating…" : "Animate captions"}
          </Button>
        </div>

        {/* output */}
        <div className="flex flex-col gap-5">
          {rateLimit !== null && (
            <RateLimitBanner
              resetAt={rateLimit || undefined}
              onDismiss={() => setRateLimit(null)}
            />
          )}

          {!result ? (
            !loading && (
              <EmptyState
                title="No captions yet"
                hint="Paste a script, pick a style, then animate your captions."
              />
            )
          ) : (
            <div className="animate-fade-up grid grid-cols-1 gap-5 md:grid-cols-[300px_1fr]">
              <VideoPreview
                captions={result.words}
                captionStyle={style}
                activeIndex={activeIndex}
                duration={`${Math.round(
                  (result.words.length * (result.timing || 1200)) / 1000
                )}s`}
              />

              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-clipr-text">
                  Caption chunks
                </h3>
                <p className="text-xs text-clipr-secondary">
                  Click a chunk to jump the preview. Highlighted chunks get an
                  indigo ring.
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.words.map((w, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveIndex(i)}
                      className={cn(
                        "rounded-full px-3 py-1 font-mono text-xs uppercase transition-all active:scale-95",
                        i === activeIndex
                          ? "bg-clipr-gold text-white neo-raised-sm"
                          : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text",
                        highlights.has(i) &&
                          i !== activeIndex &&
                          "ring-2 ring-clipr-gold"
                      )}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
