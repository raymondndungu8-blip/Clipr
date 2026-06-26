// Clipr render service (deploy to Fly.io). Renders real-footage clips with audio
// + captions and uploads to Supabase Storage, then writes the public URL back to
// the clip row. Authenticated with x-worker-secret.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, rm } from "node:fs/promises";
import {
  renderSourceClip,
  renderCaptionsClip,
  renderUploadedClip,
} from "./lib/renderSource.mjs";
import { fetchTranscript, ytIdFromUrl } from "./lib/transcript.mjs";
import { transcribeFile } from "./lib/whisper.mjs";
import { generateClipsFromTranscript } from "./lib/genClips.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(ROOT, "public", "sources");
const SUPA = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || "uploads";

async function downloadUpload(key, destPath) {
  const res = await fetch(`${SUPA}/storage/v1/object/${UPLOAD_BUCKET}/${key}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) throw new Error(`download upload failed ${res.status}`);
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

async function signUploadUrl(key) {
  const res = await fetch(
    `${SUPA}/storage/v1/object/sign/${UPLOAD_BUCKET}/${key}`,
    {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    }
  );
  if (!res.ok) throw new Error(`sign url failed ${res.status}`);
  const data = await res.json();
  return `${SUPA}/storage/v1${data.signedURL}`;
}

async function insertClips(jobId, metas) {
  const rows = metas.map((c) => ({
    job_id: jobId,
    title: c.title,
    hook: c.hook,
    description: c.description,
    captions: c.captions,
    hashtags: c.hashtags,
    duration: c.duration,
    start_seconds: Number.isFinite(Number(c.startSeconds))
      ? Math.floor(Number(c.startSeconds))
      : null,
    end_seconds: Number.isFinite(Number(c.endSeconds))
      ? Math.floor(Number(c.endSeconds))
      : null,
    bg_gradient: c.bgGradient,
  }));
  const res = await fetch(`${SUPA}/rest/v1/clips`, {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`insert clips failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return await res.json();
}

async function setJobStatus(jobId, status, errorMessage) {
  await fetch(`${SUPA}/rest/v1/clip_jobs?id=eq.${jobId}`, {
    method: "PATCH",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status, error_message: errorMessage ?? null }),
  });
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// Auth gate for everything below.
app.use((req, res, next) => {
  const secret = req.headers["x-worker-secret"];
  if (!secret || secret !== process.env.WORKER_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// Full upload pipeline: download the user's file → Whisper transcript → AI
// clip selection → insert clips → render each from the file (real footage +
// audio + captions). No YouTube, so nothing is IP-blocked. Async.
app.post("/process-upload", (req, res) => {
  const { jobId, key, count, style, platforms, accent } = req.body || {};
  if (!jobId || !key) {
    return res.status(400).json({ error: "jobId and key required" });
  }
  res.status(202).json({ accepted: true });

  (async () => {
    const localName = `upload-${jobId}.mp4`;
    const localPath = path.join(SOURCES_DIR, localName);
    const n = Math.min(Math.max(1, Number(count) || 3), 20);
    try {
      await mkdir(SOURCES_DIR, { recursive: true });
      await downloadUpload(key, localPath);

      const tr = transcribeFile(localPath);
      if (!tr.ok || !tr.segments?.length) {
        throw new Error("transcription failed: " + (tr.error || "no speech detected"));
      }

      const metas = await generateClipsFromTranscript({
        segments: tr.segments,
        count: n,
        style: style || "Educational",
        platforms:
          Array.isArray(platforms) && platforms.length ? platforms : ["TikTok"],
      });

      const inserted = await insertClips(jobId, metas.slice(0, n));
      const signedUrl = await signUploadUrl(key);

      for (let i = 0; i < inserted.length; i++) {
        const row = inserted[i];
        const meta = metas[i] || {};
        const start = Number(meta.startSeconds) || 0;
        const end = Number(meta.endSeconds) || start + 30;
        try {
          const url = await renderUploadedClip({
            videoRel: signedUrl,
            start,
            end,
            id: row.id,
            key: `clips/${row.id}.mp4`,
            hook: meta.hook || "",
            segments: tr.segments,
            words: tr.words || [],
            accent: accent || "#22e06a",
          });
          if (url) await updateClip(row.id, url, "clips");
        } catch (e) {
          console.error(
            `[process-upload] render clip ${row.id} failed:`,
            e?.message || e
          );
        }
      }

      await setJobStatus(jobId, "done");
      console.log(`[process-upload] ${jobId} done (${inserted.length} clips)`);
    } catch (err) {
      console.error(`[process-upload] ${jobId} failed:`, err?.message || err);
      await setJobStatus(jobId, "failed", String(err?.message || err).slice(0, 300));
    } finally {
      await rm(localPath, { force: true }).catch(() => {});
    }
  })();
});

// Returns the real video transcript (timed segments) so the app can generate
// captions/titles that actually match the video. Not IP-blocked like downloads.
app.post("/transcript", (req, res) => {
  const { url, videoId } = req.body || {};
  const id = ytIdFromUrl(videoId || url);
  if (!id) return res.status(400).json({ error: "url or videoId required" });
  const out = fetchTranscript(id);
  return res.json(out);
});

app.post("/render", (req, res) => {
  const {
    clipId,
    url,
    start,
    end,
    hook,
    key,
    captions,
    gradient,
    accent,
    table,
  } = req.body || {};
  // Respond immediately; render in the background.
  res.status(202).json({ accepted: true, clipId: clipId ?? null });

  (async () => {
    const id = clipId || `c-${Date.now()}`;
    const outKey = key || (clipId ? `clips/${clipId}.mp4` : `clips/${id}.mp4`);
    const common = { id, key: outKey, hook: hook || "", captions, gradient, accent };
    try {
      // Real footage when we have a source segment (falls back to captions if
      // the download is blocked); captions-only for topic / faceless clips.
      const publicUrl =
        url && start != null && end != null
          ? await renderSourceClip({
              ...common,
              url,
              start: Number(start),
              end: Number(end),
            })
          : await renderCaptionsClip(common);
      if (clipId && publicUrl) await updateClip(clipId, publicUrl, table);
      console.log(`[render] ${clipId ?? "(adhoc)"} -> ${publicUrl}`);
    } catch (err) {
      console.error(`[render] failed for ${clipId}:`, err?.message || err);
    }
  })();
});

async function updateClip(rowId, r2Url, table) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return;
  // Allowlist the table to avoid any injection via the request body.
  const target = table === "faceless_videos" ? "faceless_videos" : "clips";
  const res = await fetch(`${base}/rest/v1/${target}?id=eq.${rowId}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ r2_url: r2Url }),
  });
  if (!res.ok) {
    console.error(`[render] could not update ${target} ${rowId}: ${res.status}`);
  }
}

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Clipr render service listening on ${port}`));
