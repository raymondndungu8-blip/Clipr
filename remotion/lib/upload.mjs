// Shared upload helper: Supabase Storage (preferred) → Cloudflare R2 → skip.
import { readFile } from "node:fs/promises";

export async function uploadVideo(localPath, key) {
  const viaSupabase = await uploadToSupabase(localPath, key);
  if (viaSupabase) return viaSupabase;
  const viaR2 = await uploadToR2(localPath, key);
  if (viaR2) return viaR2;
  console.log(
    "\nNo storage configured — skipping upload.\n" +
      "  • Supabase: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (bucket 'clips'), or\n" +
      "  • R2: set CLOUDFLARE_R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET_NAME + R2_PUBLIC_URL."
  );
  return null;
}

async function uploadToSupabase(localPath, key) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "clips";
  if (!url || !serviceKey || serviceKey.includes("...")) return null;

  const body = await readFile(localPath);
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
    method: "POST",
    headers: {
      // sb_secret_ keys aren't JWTs — must be sent as `apikey`.
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
  return `${url}/storage/v1/object/public/${bucket}/${key}`;
}

async function uploadToR2(localPath, key) {
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
      Key: key,
      Body: body,
      ContentType: "video/mp4",
    })
  );
  return `${publicUrl}/${key}`;
}
