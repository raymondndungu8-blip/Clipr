// Clipr render service (deploy to Fly.io). Renders real-footage clips with audio
// + captions and uploads to Supabase Storage, then writes the public URL back to
// the clip row. Authenticated with x-worker-secret.
import express from "express";
import { renderSourceClip, renderCaptionsClip } from "./lib/renderSource.mjs";

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
