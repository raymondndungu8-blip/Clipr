// CLI wrapper around the reusable real-footage clip renderer.
//
// Usage:
//   node render-source.mjs --url <yt-url> --start 30 --end 55 \
//     --id <sourceId> --key clips/<id>.mp4 [--hook "..."] [--accent "#3d7bff"]

import { renderSourceClip } from "./lib/renderSource.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("url", "");
if (!url) {
  console.error("Render failed: --url is required");
  process.exit(1);
}

const opts = {
  url,
  start: parseFloat(arg("start", "0")),
  end: parseFloat(arg("end", "30")),
  id: arg("id", `src-${Date.now()}`),
  key: arg("key", ""),
  hook: arg("hook", ""),
  accent: arg("accent", "#3d7bff"),
};

renderSourceClip(opts)
  .then((url) => {
    if (url) {
      console.log(`\nUploaded: ${url}`);
      console.log(`CLIPR_RESULT_URL=${url}`);
    } else {
      console.log("\nRendered locally (no storage configured).");
    }
  })
  .catch((err) => {
    console.error("Render failed:", err);
    process.exitCode = 1;
  });
