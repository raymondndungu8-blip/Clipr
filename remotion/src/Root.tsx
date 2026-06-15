import { Composition } from "remotion";
import { CaptionClip, captionClipSchema, FPS } from "./CaptionClip";

/**
 * Registers Clipr's compositions. The render worker / Studio reads these.
 * `CaptionClip` renders a vertical 9:16 clip with an animated hook + karaoke
 * captions over a gradient (or, later, over trimmed source footage).
 */
export const RemotionRoot: React.FC = () => {
  return (
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
        gradient: "linear-gradient(160deg, #14213d 0%, #0a0e1a 55%, #0e1b33 100%)",
        accent: "#3d7bff",
      }}
    />
  );
};
