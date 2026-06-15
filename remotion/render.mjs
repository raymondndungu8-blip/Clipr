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
// Object key/path within the bucket (don't prefix the bucket name).
const r2Key = arg("key", `renders/${Date.now()}-${compositionId}.mp4`);

// Upload to Supabase Storage (preferred — needs only the service-role key).
async function uploadToSupabase(localPath) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "clips";
  if (!url || !serviceKey || serviceKey.includes("...")) return null;

  const body = await readFile(localPath);
  const endpoint = `${url}/storage/v1/object/${bucket}/${r2Key}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      // New sb_secret_ keys aren't JWTs — they must be sent as `apikey`
      // (Bearer alone makes the API try to parse them as a JWT and fail).
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `Supabase upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`
    );
  }
  return `${url}/storage/v1/object/public/${bucket}/${r2Key}`;
}

// Upload to Cloudflare R2 (fallback — needs the full R2 credential set).
async function uploadToR2(localPath) {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (
    !accountId ||
    !accessKeyId ||
    accessKeyId.includes("...") ||
    !secretAccessKey ||
    !bucket ||
    !publicUrl ||
    publicUrl.includes("xxxx")
  ) {
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

// Try Supabase Storage first, then R2, else skip.
async function uploadVideo(localPath) {
  const viaSupabase = await uploadToSupabase(localPath);
  if (viaSupabase) return viaSupabase;
  const viaR2 = await uploadToR2(localPath);
  if (viaR2) return viaR2;
  console.log(
    "\nNo storage configured — skipping upload.\n" +
      "  • Supabase: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (bucket 'clips'), or\n" +
      "  • R2: set CLOUDFLARE_R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET_NAME + R2_PUBLIC_URL."
  );
  return null;
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

  const url = await uploadVideo(outPath);
  if (url) {
    console.log(`\nUploaded: ${url}`);
  } else {
    console.log(`\nLocal file: ${outPath}`);
  }
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
