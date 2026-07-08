'use strict';

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;

  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 is not configured: CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY are required'
    );
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

/**
 * Upload a local file to R2 and return its public URL.
 *
 * Note: R2 does NOT support S3 ACLs — never set `ACL` here. Public access
 * comes from the bucket's public-bucket / custom-domain configuration
 * (R2_PUBLIC_URL points at that).
 */
async function uploadFile(localPath, key, contentType = 'video/mp4') {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!bucket) throw new Error('CLOUDFLARE_R2_BUCKET_NAME is not set');
  if (!publicUrl) throw new Error('R2_PUBLIC_URL is not set');

  const { size } = fs.statSync(localPath);
  // "inline" (not "attachment") so the in-page <video> preview keeps playing
  // normally — the real "download" path (components/lib/download.ts) always
  // fetches the bytes as a blob and saves them itself, so it doesn't depend
  // on this header. This just gives a sane filename to anything that DOES
  // open the raw URL directly (e.g. a long-press "save" on mobile, or the
  // window.open() fallback when the blob fetch can't run).
  const filename = path.basename(key) || 'clip.mp4';

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentLength: size,
      ContentType: contentType,
      ContentDisposition: `inline; filename="${filename}"`,
    })
  );

  return `${publicUrl.replace(/\/$/, '')}/${key}`;
}

module.exports = { uploadFile };
