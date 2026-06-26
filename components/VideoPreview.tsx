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

const STYLE_TO_ACCENT: Record<CaptionStyle, string> = {
  "Bold Gold": "#C9A84C",
  "Pure White": "#FFFFFF",
  "Fire Red": "#E05A5A",
  "Neon Green": "#22e06a",
  "Ice Blue": "#5A9BE0",
};

const DEFAULT_GRADIENT =
  "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)";

/** Pick readable text for a given background colour. */
function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#0A0A0A";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0A0A0A" : "#FFFFFF";
}

type VideoPreviewProps = {
  hook?: string;
  captions?: string[];
  duration?: string;
  bgGradient?: string;
  videoUrl?: string | null;
  /** YouTube id — shows the real video frame (static thumbnail, no watermark). */
  youtubeId?: string | null;
  /** Caption highlight colour (overrides captionStyle). */
  accent?: string;
  /** Named caption style (used by the Caption Animator). */
  captionStyle?: CaptionStyle;
  /** Force a specific caption index (disables cycling). */
  activeIndex?: number;
  /** Tapping the play button (e.g. to render then play the clip). */
  onPlayClick?: () => void;
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
  accent,
  captionStyle,
  activeIndex,
  onPlayClick,
  className,
}: VideoPreviewProps) {
  const effectiveAccent =
    accent ?? (captionStyle ? STYLE_TO_ACCENT[captionStyle] : "#22e06a");
  const safeCaptions = captions?.filter(Boolean) ?? [];
  const [index, setIndex] = useState(0);
  const controlled = typeof activeIndex === "number";

  useEffect(() => {
    if (controlled || safeCaptions.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % safeCaptions.length);
    }, 1100);
    return () => clearInterval(id);
  }, [controlled, safeCaptions.length]);

  const shown = controlled
    ? safeCaptions[activeIndex ?? 0]
    : safeCaptions[index % Math.max(safeCaptions.length, 1)];

  const fg = contrastText(effectiveAccent);
  const showThumb = !videoUrl && !!youtubeId;

  const overlay = (
    <div className="pointer-events-none absolute inset-0">
      {/* dark scrim for legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {hook && (
        <div className="absolute inset-x-0 px-3 text-center" style={{ top: "7%" }}>
          <p
            className="font-sans font-extrabold uppercase leading-tight"
            style={{
              fontSize: 16,
              color: "#FFFFFF",
              letterSpacing: "-0.01em",
              textShadow: "0 2px 10px rgba(0,0,0,0.9)",
            }}
          >
            {hook}
          </p>
        </div>
      )}

      {shown && (
        <div
          className="absolute inset-x-0 flex justify-center px-3"
          style={{ bottom: "15%" }}
        >
          <span
            key={controlled ? `c-${activeIndex}` : `c-${index}`}
            className="animate-caption-flash inline-block rounded-lg px-3 py-1.5 font-sans font-extrabold uppercase"
            style={{
              fontSize: 17,
              lineHeight: 1.05,
              backgroundColor: effectiveAccent,
              color: fg,
              letterSpacing: "-0.01em",
              boxShadow: "0 3px 14px rgba(0,0,0,0.55)",
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
            // Rendered clip — autoplays muted (tap the volume to hear it).
            <video
              src={videoUrl}
              controls
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full bg-black object-cover"
            />
          ) : showThumb ? (
            <>
              {/* real video frame — static thumbnail, no YouTube player/watermark */}
              <img
                src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full bg-black object-cover"
              />
              {overlay}
              <button
                type="button"
                onClick={onPlayClick}
                aria-label="Play clip"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span
                  className="flex items-center justify-center rounded-full transition-transform active:scale-90"
                  style={{
                    width: 56,
                    height: 56,
                    backgroundColor: "var(--clipr-gold)",
                    boxShadow: "0 0 28px 6px rgba(61,123,255,0.55)",
                  }}
                >
                  <Play
                    fill="#0A0A0A"
                    stroke="#0A0A0A"
                    style={{ width: 22, height: 22, marginLeft: 3 }}
                  />
                </span>
              </button>
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{ background: bgGradient || DEFAULT_GRADIENT }}
              />
              <div className="clipr-scanlines absolute inset-0" />
              {overlay}
              <button
                type="button"
                onClick={onPlayClick}
                aria-label="Play clip"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span
                  className="flex items-center justify-center rounded-full transition-transform active:scale-90"
                  style={{
                    width: 56,
                    height: 56,
                    backgroundColor: "var(--clipr-gold)",
                    boxShadow: "0 0 28px 6px rgba(61,123,255,0.55)",
                  }}
                >
                  <Play
                    fill="#0A0A0A"
                    stroke="#0A0A0A"
                    style={{ width: 22, height: 22, marginLeft: 3 }}
                  />
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
