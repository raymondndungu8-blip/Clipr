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
  "linear-gradient(160deg, #1c1810 0%, #0a0a0a 55%, #14110a 100%)";

type VideoPreviewProps = {
  hook?: string;
  captions?: string[];
  duration?: string;
  bgGradient?: string;
  videoUrl?: string | null;
  captionStyle?: CaptionStyle;
  /** Force the preview to show a specific caption index (disables cycling). */
  activeIndex?: number;
  className?: string;
};

export default function VideoPreview({
  hook,
  captions,
  duration,
  bgGradient,
  videoUrl,
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

  return (
    <div className={className} style={{ maxWidth: 300, width: "100%" }}>
      <div
        className="relative w-full overflow-hidden rounded-xl border border-clipr-border"
        style={{ paddingTop: "177.78%" }}
      >
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            playsInline
            className="absolute inset-0 h-full w-full bg-black object-cover"
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{ background: bgGradient || DEFAULT_GRADIENT }}
            />
            <div className="clipr-scanlines absolute inset-0" />

            {/* hook text near top */}
            {hook && (
              <div
                className="absolute inset-x-0 px-4 text-center"
                style={{ top: "10%" }}
              >
                <p
                  className="font-sans font-bold leading-snug"
                  style={{
                    fontSize: 16,
                    color: "#FFFFFF",
                    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
                  }}
                >
                  {hook}
                </p>
              </div>
            )}

            {/* center play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 34,
                  height: 34,
                  backgroundColor: "var(--clipr-gold)",
                  boxShadow: "0 0 24px 4px rgba(201,168,76,0.45)",
                }}
              >
                <Play
                  fill="#0A0A0A"
                  stroke="#0A0A0A"
                  style={{ width: 14, height: 14, marginLeft: 2 }}
                />
              </div>
            </div>

            {/* cycling caption chunk near bottom */}
            {shown && (
              <div
                className="absolute inset-x-0 flex justify-center px-4"
                style={{ bottom: "12%" }}
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
                  }}
                >
                  {shown}
                </span>
              </div>
            )}

            {/* duration badge */}
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
          </>
        )}
      </div>
    </div>
  );
}
