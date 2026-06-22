import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { z } from "zod";

export const SOURCE_FPS = 30;

export const captionCueSchema = z.object({
  start: z.number(), // seconds, relative to the clip
  end: z.number(),
  text: z.string(),
});

export const sourceClipSchema = z.object({
  /** Path within remotion/public (use staticFile) to the downloaded source mp4. */
  videoSrc: z.string(),
  /** Trim window within the source video, in seconds. */
  startSeconds: z.number(),
  endSeconds: z.number(),
  hook: z.string().optional(),
  captions: z.array(captionCueSchema),
  /** Word-level cues for karaoke captions (preferred when present). */
  words: z.array(captionCueSchema).optional(),
  accent: z.string().default("#3d7bff"),
});

export type SourceClipProps = z.infer<typeof sourceClipSchema>;

/**
 * Renders the actual downloaded footage trimmed to [startSeconds, endSeconds],
 * cropped to vertical 9:16, with the source's word/line-timed captions burned in
 * (karaoke style) and the hook across the top.
 */
const WORDS_PER_LINE = 4;

export const SourceClip: React.FC<SourceClipProps> = ({
  videoSrc,
  startSeconds,
  endSeconds,
  hook,
  captions,
  words,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = startSeconds + frame / fps; // current time in source coordinates
  const local = frame / fps; // time since clip start

  const wordCues = words ?? [];
  const activeCaption = captions.find((c) => local >= c.start && local < c.end);

  // Karaoke captions: find the current word, show its line, highlight it.
  let karaokeLine: { text: string; start: number; end: number }[] | null = null;
  let activeInLine = -1;
  if (wordCues.length > 0) {
    let g = -1;
    for (let i = 0; i < wordCues.length; i++) {
      if (local >= wordCues[i].start) g = i;
      else break;
    }
    const lastEnd = wordCues[wordCues.length - 1].end;
    if (g >= 0 && local <= lastEnd + 0.4) {
      const lineStart = Math.floor(g / WORDS_PER_LINE) * WORDS_PER_LINE;
      karaokeLine = wordCues.slice(lineStart, lineStart + WORDS_PER_LINE);
      activeInLine = g - lineStart;
    }
  }

  const hookProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 18,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* real footage, cover-cropped to vertical */}
      <AbsoluteFill>
        <OffthreadVideo
          src={videoSrc.startsWith("http") ? videoSrc : staticFile(videoSrc)}
          trimBefore={Math.round(startSeconds * fps)}
          trimAfter={Math.round(endSeconds * fps)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* subtle bottom scrim for caption legibility */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* hook */}
      {hook && (
        <div
          style={{
            position: "absolute",
            top: "8%",
            left: 0,
            right: 0,
            padding: "0 70px",
            textAlign: "center",
            opacity: hookProgress,
            transform: `translateY(${interpolate(hookProgress, [0, 1], [-30, 0])}px)`,
          }}
        >
          <span
            style={{
              color: "#fff",
              fontFamily: "sans-serif",
              fontSize: 58,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              textShadow: "0 4px 24px rgba(0,0,0,0.85)",
            }}
          >
            {hook}
          </span>
        </div>
      )}

      {/* karaoke word-by-word captions (auto-synced to speech) */}
      {karaokeLine ? (
        <div
          style={{
            position: "absolute",
            bottom: "18%",
            left: 0,
            right: 0,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "0 20px",
            padding: "0 60px",
          }}
        >
          {karaokeLine.map((w, i) => {
            const isActive = i === activeInLine;
            const pop = isActive
              ? interpolate(
                  Math.max(0, local - w.start),
                  [0, 0.12],
                  [0.7, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                )
              : 1;
            return (
              <span
                key={i}
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 76,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.05,
                  color: isActive ? accent : "#fff",
                  WebkitTextStroke: "4px #000",
                  // @ts-expect-error paintOrder is valid CSS, missing in types
                  paintOrder: "stroke fill",
                  textShadow: "0 6px 22px rgba(0,0,0,0.7)",
                  transform: `scale(${pop})`,
                  display: "inline-block",
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      ) : (
        activeCaption && (
          <div
            style={{
              position: "absolute",
              bottom: "14%",
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              padding: "0 60px",
            }}
          >
            <span
              style={{
                backgroundColor: accent,
                color: "#fff",
                fontFamily: "sans-serif",
                fontSize: 56,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.01em",
                padding: "10px 24px",
                borderRadius: 14,
                textAlign: "center",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              }}
            >
              {activeCaption.text}
            </span>
          </div>
        )
      )}

      {/* hidden but keeps `t` referenced for clarity in future word-level sync */}
      <span style={{ display: "none" }}>{t.toFixed(2)}</span>
    </AbsoluteFill>
  );
};
