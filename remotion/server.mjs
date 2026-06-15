// Clipr render service (deploy to Fly.io). Renders real-footage clips with audio
// + captions and uploads to Supabase Storage, then writes the public URL back to
// the clip row. Authenticated with x-worker-secret.
import express from "express";
import { renderSourceClip } from "./lib/renderSource.mjs";

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

app.post("/render", (req, res) => {
  const { clipId, url, start, end, hook, key } = req.body || {};
  if (!url || start == null || end == null) {
    return res.status(400).json({ error: "url, start and end are required" });
  }
  // Respond immediately; render in the background.
  res.status(202).json({ accepted: true, clipId: clipId ?? null });

  (async () => {
    try {
      const publicUrl = await renderSourceClip({
        url,
        start: Number(start),
        end: Number(end),
        id: clipId || `c-${Date.now()}`,
        key: key || (clipId ? `clips/${clipId}.mp4` : undefined),
        hook: hook || "",
      });
      if (clipId && publicUrl) await updateClip(clipId, publicUrl);
      console.log(`[render] ${clipId ?? "(adhoc)"} -> ${publicUrl}`);
    } catch (err) {
      console.error(`[render] failed for ${clipId}:`, err?.message || err);
    }
  })();
});

async function updateClip(clipId, r2Url) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return;
  const res = await fetch(`${base}/rest/v1/clips?id=eq.${clipId}`, {
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
    console.error(`[render] could not update clip ${clipId}: ${res.status}`);
  }
}

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Clipr render service listening on ${port}`));
