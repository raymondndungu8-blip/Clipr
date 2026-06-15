# Clipr — Remotion

Programmatic video rendering for Clipr. Renders vertical (1080×1920) clips with
an animated hook + karaoke captions to MP4. Separate npm project (like `worker/`)
— **not** part of the Next.js / Vercel build.

## Why it's separate
Remotion renders via headless Chromium + FFmpeg, which can't run in Vercel
serverless functions. Run it locally, in the Railway `worker`, or on Remotion
Lambda.

## Commands (run inside `remotion/`)
- `npm run studio` — open Remotion Studio to preview/tweak compositions in the browser.
- `npm run render -- CaptionClip out/clip.mp4` — render the `CaptionClip` composition to an MP4.
- Override props at render time, e.g.:
  ```bash
  npm run render -- CaptionClip out/clip.mp4 --props='{"hook":"My hook","captions":["DO","THIS","NOW"],"gradient":"linear-gradient(160deg,#14213d,#0a0e1a)","accent":"#3d7bff"}'
  ```

## Files
- `src/index.ts` — registers the root.
- `src/Root.tsx` — composition registry (id `CaptionClip`).
- `src/CaptionClip.tsx` — the vertical clip: animated hook + karaoke captions.
- `remotion.config.ts` — render config.

## Next steps to wire into Clipr
1. Add `@remotion/captions` + Whisper word-timestamps for word-synced captions.
2. Add `<OffthreadVideo>` to trim/crop downloaded source footage (clipper) or
   sequence Pexels/Higgsfield B-roll + ElevenLabs voice (faceless).
3. Call `@remotion/renderer` from the worker, upload the MP4 to R2, and POST the
   URL back to `/api/worker/callback`.

Note: Remotion requires a paid company license for larger/commercial use — see
https://remotion.dev/license.
