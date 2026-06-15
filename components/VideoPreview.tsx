"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";

export type CaptionStyle =
  | "Bold Gold"
  | "Pure White"
  | "Fire Red"
  | "Neon Green"
  | "Ice Blue";

export const CAPTION_STYLES: CaptionStyle[] = [
  "Bold Gold",
  "Pure White",
  "Fire Red",
  "Neon Green",
  "Ice Blue",
];

const STYLE_COLORS: Record<CaptionStyle, { bg: string; fg: string }> = {
  "Bold Gold": { bg: "#C9A84C", fg: "#0A0A0A" },
  "Pure White": { bg: "#FFFFFF", fg: "#0A0A0A" },
  "Fire Red": { bg: "#E05A5A", fg: "#FFFFFF" },
  "Neon Green": { bg: "#4CAF7A", fg: "#0A0A0A" },
  "Ice Blue": { bg: "#5A9BE0", fg: "#FFFFFF" },
};

const DEFAULT_GRADIENT =
  "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)";

type VideoPreviewProps = {
  hook?: string;
  captions?: string[];
  duration?: string;
  bgGradient?: string;
  videoUrl?: string | null;
  /** YouTube video id — renders the real clip segment as a live preview. */
  youtubeId?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  captionStyle?: CaptionStyle;
  /** Force the preview to show a specific caption index (disables cycling). */
  activeIndex?: number;
  className?: string;
};

export { youtubeIdFromUrl } from "@/lib/youtube";

export default function VideoPreview({
  hook,
  captions,
  duration,
  bgGradient,
  videoUrl,
  youtubeId,
  startSeconds,
  endSeconds,
  captionStyle = "Bold Gold",
  activeIndex,
  className,
}: VideoPreviewProps) {
  const safeCaptions = captions?.filter(Boolean) ?? [];
  const [index, setIndex] = useState(0);

  const controlled = typeof activeIndex === "number";

  useEffect(() => {
    if (controlled || safeCaptions.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % safeCaptions.length);
    }, 1200);
    return () => clearInterval(id);
  }, [controlled, safeCaptions.length]);

  const shown = controlled
    ? safeCaptions[activeIndex ?? 0]
    : safeCaptions[index % Math.max(safeCaptions.length, 1)];

  const colors = STYLE_COLORS[captionStyle] ?? STYLE_COLORS["Bold Gold"];

  const isEmbed = !videoUrl && !!youtubeId;
  const embedSrc = isEmbed
    ? `https://www.youtube.com/embed/${youtubeId}?` +
      new URLSearchParams({
        autoplay: "1",
        mute: "1",
        controls: "1",
        rel: "0",
        modestbranding: "1",
        playsinline: "1",
        loop: "1",
        playlist: youtubeId!,
        ...(typeof startSeconds === "number"
          ? { start: String(Math.max(0, startSeconds)) }
          : {}),
        ...(typeof endSeconds === "number"
          ? { end: String(endSeconds) }
          : {}),
      }).toString()
    : null;

  // Caption + hook + duration overlay, shown over the gradient mock and the
  // live YouTube clip alike. pointer-events-none so player controls stay usable.
  const overlay = (
    <div className="pointer-events-none absolute inset-0">
      {hook && (
        <div className="absolute inset-x-0 px-4 text-center" style={{ top: "8%" }}>
          <p
            className="font-sans font-bold leading-snug"
            style={{
              fontSize: 15,
              color: "#FFFFFF",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
            }}
          >
            {hook}
          </p>
        </div>
      )}

      {shown && (
        <div
          className="absolute inset-x-0 flex justify-center px-4"
          style={{ bottom: "16%" }}
        >
          <span
            key={controlled ? `c-${activeIndex}` : `c-${index}`}
            className="animate-caption-flash inline-block rounded-md px-2.5 py-1 font-mono font-bold uppercase"
            style={{
              fontSize: 14,
              lineHeight: 1.1,
              backgroundColor: colors.bg,
              color: colors.fg,
              letterSpacing: "0.02em",
              boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
            }}
          >
            {shown}
          </span>
        </div>
      )}

      {duration && (
        <div
          className="absolute font-mono"
          style={{
            bottom: 8,
            right: 8,
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 6,
            backgroundColor: "rgba(0,0,0,0.75)",
            color: "#EEEBE4",
          }}
        >
          {duration}
        </div>
      )}
    </div>
  );

  return (
    <div className={className} style={{ maxWidth: 300, width: "100%" }}>
      <div
        className="neo-inset relative w-full overflow-hidden rounded-2xl p-1.5 ring-1 ring-clipr-gold/15"
        style={{ paddingTop: "calc(177.78% + 0.75rem)" }}
      >
        <div className="absolute inset-1.5 overflow-hidden rounded-lg">
          {videoUrl ? (
            <>
              <video
                src={videoUrl}
                controls
                playsInline
                className="absolute inset-0 h-full w-full bg-black object-cover"
              />
              {overlay}
            </>
          ) : isEmbed ? (
            <>
              <iframe
                src={embedSrc!}
                title="Clip preview"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0 bg-black"
              />
              {overlay}
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{ background: bgGradient || DEFAULT_GRADIENT }}
              />
              <div className="clipr-scanlines absolute inset-0" />

              {/* center play button (mock only) */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 34,
                    height: 34,
                    backgroundColor: "var(--clipr-gold)",
                    boxShadow: "0 0 24px 4px rgba(61,123,255,0.5)",
                  }}
                >
                  <Play
                    fill="#FFFFFF"
                    stroke="#FFFFFF"
                    style={{ width: 14, height: 14, marginLeft: 2 }}
                  />
                </div>
              </div>

              {overlay}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
