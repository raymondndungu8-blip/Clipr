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

/** Subject-tracking reframe keyframe: at clip-relative time t, the subject's
 *  horizontal centre is at cx (0..1 across the source width). */
export const reframeCueSchema = z.object({
  t: z.number(),
  cx: z.number(),
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
  /** Subject-tracking pan keyframes (empty/omitted → static centre crop). */
  reframe: z.array(reframeCueSchema).optional(),
  /** Source video pixel dimensions (needed to compute the pan). */
  srcWidth: z.number().optional(),
  srcHeight: z.number().optional(),
  accent: z.string().default("#3d7bff"),
});

export type SourceClipProps = z.infer<typeof sourceClipSchema>;

/**
 * Renders the actual downloaded footage trimmed to [startSeconds, endSeconds],
 * cropped to vertical 9:16, with the source's word/line-timed captions burned in
 * (karaoke style) and the hook across the top.
 */
const WORDS_PER_LINE = 3;
const HIGHLIGHT = "#22e06a"; // bright green for the active (spoken) word
const FRAME_W = 1080; // composition width (9:16 vertical)
const FRAME_H = 1920; // composition height

type ReframeCue = { t: number; cx: number };

/** Interpolate the subject centre (0..1) at a clip-relative time. */
function sampleCx(cues: ReframeCue[], time: number): number {
  if (!cues.length) return 0.5;
  if (time <= cues[0].t) return cues[0].cx;
  const lastCue = cues[cues.length - 1];
  if (time >= lastCue.t) return lastCue.cx;
  for (let i = 0; i < cues.length - 1; i++) {
    const a = cues[i];
    const b = cues[i + 1];
    if (time >= a.t && time <= b.t) {
      const span = b.t - a.t;
      const f = span > 0 ? (time - a.t) / span : 0;
      return a.cx + (b.cx - a.cx) * f;
    }
  }
  return lastCue.cx;
}

export const SourceClip: React.FC<SourceClipProps> = ({
  videoSrc,
  startSeconds,
  endSeconds,
  hook,
  captions,
  words,
  reframe,
  srcWidth,
  srcHeight,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = startSeconds + frame / fps; // current time in source coordinates
  const local = frame / fps; // time since clip start

  // Subject-tracking reframe: when we have pan keyframes AND the source pixel
  // size, pan a height-filled copy of the video so the speaker stays centred.
  // Otherwise fall back to a static centre crop (identical to the old behaviour).
  const reframeCues: ReframeCue[] = reframe ?? [];
  const videoResolvedSrc = videoSrc.startsWith("http")
    ? videoSrc
    : staticFile(videoSrc);
  const trimBefore = Math.round(startSeconds * fps);
  const trimAfter = Math.round(endSeconds * fps);

  let panStyle: React.CSSProperties | null = null;
  if (reframeCues.length > 0 && srcWidth && srcHeight && srcHeight > 0) {
    const scale = FRAME_H / srcHeight;
    const scaledW = srcWidth * scale;
    // Only pan when the height-filled video is actually wider than the frame.
    if (scaledW > FRAME_W + 1) {
      const panRange = scaledW - FRAME_W;
      const cx = sampleCx(reframeCues, local);
      let left = cx * scaledW - FRAME_W / 2;
      left = Math.max(0, Math.min(panRange, left));
      panStyle = {
        position: "absolute",
        top: 0,
        left: 0,
        width: scaledW,
        height: FRAME_H,
        transform: `translateX(${-left}px)`,
        objectFit: "cover",
      };
    }
  }

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
      {/* real footage — subject-tracked pan when reframe data is present,
          otherwise a static centre crop (unchanged fallback). */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {panStyle ? (
          <OffthreadVideo
            src={videoResolvedSrc}
            trimBefore={trimBefore}
            trimAfter={trimAfter}
            style={panStyle}
          />
        ) : (
          <OffthreadVideo
            src={videoResolvedSrc}
            trimBefore={trimBefore}
            trimAfter={trimAfter}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
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
            bottom: "15%",
            left: 0,
            right: 0,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: "0 22px",
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
                  color: isActive ? HIGHLIGHT : "#fff",
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
