import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";

export const FPS = 30;

export const captionClipSchema = z.object({
  hook: z.string(),
  captions: z.array(z.string()),
  gradient: z.string(),
  accent: z.string(),
});

export type CaptionClipProps = z.infer<typeof captionClipSchema>;

/**
 * Vertical (1080x1920) clip: a hook headline that springs in at the top and a
 * karaoke caption chunk that flips through the caption list at the bottom, each
 * popping in with a scale+fade (the "captionFlash" look from the web preview).
 */
export const CaptionClip: React.FC<CaptionClipProps> = ({
  hook,
  captions,
  gradient,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Hook springs down from the top in the first ~0.7s.
  const hookProgress = spring({
    frame,
    fps: FPS,
    config: { damping: 200 },
    durationInFrames: 20,
  });
  const hookY = interpolate(hookProgress, [0, 1], [-40, 0]);

  // Cycle captions evenly across the clip duration.
  const list = captions.length > 0 ? captions : [""];
  const perCaption = durationInFrames / list.length;
  const captionIndex = Math.min(list.length - 1, Math.floor(frame / perCaption));
  const localFrame = frame - captionIndex * perCaption;
  const pop = spring({
    frame: localFrame,
    fps: FPS,
    config: { damping: 14, mass: 0.5 },
    durationInFrames: 12,
  });
  const captionScale = interpolate(pop, [0, 1], [0.86, 1]);
  const captionOpacity = interpolate(localFrame, [0, 4], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: gradient, fontFamily: "sans-serif" }}>
      {/* subtle scanlines */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px)",
        }}
      />

      {/* hook headline */}
      <div
        style={{
          position: "absolute",
          top: "9%",
          left: 0,
          right: 0,
          padding: "0 80px",
          textAlign: "center",
          transform: `translateY(${hookY}px)`,
          opacity: hookProgress,
        }}
      >
        <span
          style={{
            color: "#FFFFFF",
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            textShadow: "0 4px 24px rgba(0,0,0,0.8)",
          }}
        >
          {hook}
        </span>
      </div>

      {/* karaoke caption chunk */}
      <div
        style={{
          position: "absolute",
          bottom: "16%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            backgroundColor: accent,
            color: "#FFFFFF",
            fontSize: 72,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            padding: "12px 28px",
            borderRadius: 16,
            transform: `scale(${captionScale})`,
            opacity: captionOpacity,
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          }}
        >
          {list[captionIndex]}
        </span>
      </div>
    </AbsoluteFill>
  );
};
