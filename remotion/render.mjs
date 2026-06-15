// Programmatic render + R2 upload pipeline for Clipr.
//
// Renders a composition to MP4 with Remotion, then (if R2 is configured)
// uploads it to Cloudflare R2 and prints the public URL. Without R2 env vars it
// renders locally and tells you what to set to enable upload.
//
// Usage:
//   node render.mjs --id CaptionClip --out out/clip.mp4 \
//     --props '{"hook":"...","captions":["A","B"],"gradient":"...","accent":"#3d7bff"}' \
//     [--key clips/demo.mp4]
//
// R2 env (set in this folder's environment or a .env you load):
//   CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
//   CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME, R2_PUBLIC_URL

import path from "node:path";
import { readFile } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const compositionId = arg("id", "CaptionClip");
const outPath = path.resolve(arg("out", `out/${compositionId}.mp4`));
const propsArg = arg("props", "");
const inputProps = propsArg ? JSON.parse(propsArg) : {};
const r2Key = arg("key", `clips/${Date.now()}-${compositionId}.mp4`);

async function uploadToR2(localPath) {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    console.log(
      "\nR2 not configured — skipping upload. Set CLOUDFLARE_R2_ACCOUNT_ID, " +
        "CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, " +
        "CLOUDFLARE_R2_BUCKET_NAME and R2_PUBLIC_URL to enable it."
    );
    return null;
  }

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const body = await readFile(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: body,
      ContentType: "video/mp4",
    })
  );
  return `${publicUrl}/${r2Key}`;
}

async function main() {
  console.log(`Bundling Remotion project…`);
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/index.ts"),
  });

  console.log(`Selecting composition "${compositionId}"…`);
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  });

  console.log(`Rendering → ${outPath}`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
  });
  console.log("Render complete.");

  const url = await uploadToR2(outPath);
  if (url) {
    console.log(`\nUploaded to R2: ${url}`);
  } else {
    console.log(`\nLocal file: ${outPath}`);
  }
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
