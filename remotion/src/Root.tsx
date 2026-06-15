import { Composition } from "remotion";
import { CaptionClip, captionClipSchema, FPS } from "./CaptionClip";
import { SourceClip, sourceClipSchema, SOURCE_FPS } from "./SourceClip";

/**
 * Registers Clipr's compositions:
 * - CaptionClip: styled hook + karaoke captions over a gradient.
 * - SourceClip: the actual downloaded footage trimmed to a segment, cropped to
 *   9:16, with the source's time-stamped captions burned in.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CaptionClip"
        component={CaptionClip}
        schema={captionClipSchema}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{
          hook: "This one tip changed everything",
          captions: [
            "WATCH THIS",
            "BEFORE YOU",
            "POST AGAIN",
            "IT WORKS",
            "EVERY TIME",
          ],
          gradient:
            "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)",
          accent: "#3d7bff",
        }}
      />

      <Composition
        id="SourceClip"
        component={SourceClip}
        schema={sourceClipSchema}
        fps={SOURCE_FPS}
        width={1080}
        height={1920}
        durationInFrames={SOURCE_FPS * 30}
        defaultProps={{
          videoSrc: "",
          startSeconds: 0,
          endSeconds: 30,
          hook: "",
          captions: [],
          accent: "#3d7bff",
        }}
        calculateMetadata={({ props }) => {
          const length = Math.max(1, props.endSeconds - props.startSeconds);
          return { durationInFrames: Math.round(length * SOURCE_FPS) };
        }}
      />
    </>
  );
};
