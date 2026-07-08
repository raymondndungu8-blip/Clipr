# clipr-worker

Standalone video-processing worker for Clipr. A small Express service that:

- **`POST /process`** — downloads a source video with yt-dlp, finds the 3 loudest ~30s segments, cuts them into 9:16 1080x1920 vertical clips with a burned-in caption, uploads them to Cloudflare R2, and reports back to the Next.js app. Not currently called by the app (kept for reference / possible reuse) — the upload flow now goes through `/process-upload` below instead.
- **`POST /process-upload`** — the uploaded-file counterpart to `/process`: takes a Supabase Storage key instead of a YouTube URL, downloads the file from Storage, finds the loudest non-overlapping segments (`count`-many), renders each as a captioned 9:16 clip, uploads to R2, and inserts the resulting rows into the `clips` table directly (this flow has no pre-existing AI-generated clip rows to attach to, unlike the URL/topic flow).
- **`POST /render`** — renders ONE clip or faceless-video script: real downloaded YouTube footage (via `yt-dlp --download-sections`, so only the needed seconds are pulled) when a `url`/`start`/`end` segment is given and the download succeeds, otherwise a caption-and-hook-over-gradient fallback — so there's always a downloadable MP4. Uploads to R2 and reports back per-clip (`clipId`) or per-video (`videoId` when `table: "faceless_videos"`).
- **`POST /transcript`** — fetches a YouTube video's auto-captions (`yt-dlp --skip-download --write-auto-subs`, no video download) and returns them as `{start, dur, text}` segments, so the AI clip-selection prompt can ground titles/captions/timestamps in what's actually said. Returns `{ok: false}` (never an error) when captions aren't available — the app already falls back gracefully.
- **`POST /assemble`** — downloads stock-footage scenes + an ElevenLabs voiceover, trims/normalizes each scene to 1080x1920, concatenates them, overlays the voiceover, uploads the final MP4 to R2, and reports back.
- **`GET /health`** — unauthenticated health check.

All routes except `/health` require the `x-worker-secret` header (must equal `WORKER_SECRET`). `/transcript` responds synchronously (it's a quick subtitle-only fetch); the other processing routes respond `202` immediately and run the job asynchronously — results are written to Supabase and POSTed to `${APP_URL}/api/worker/callback`.

This is a **separate npm project** from the Next.js app — it is deployed on its own (Railway), not as part of the frontend build.

## Environment variables

See `.env.example`:

| Variable | Purpose |
| --- | --- |
| `WORKER_SECRET` | Shared secret for `x-worker-secret` auth (both directions) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Service-role Supabase client for job status updates |
| `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME` | R2 (S3-compatible) upload credentials |
| `R2_PUBLIC_URL` | Public base URL of the R2 bucket (custom domain / public bucket) |
| `APP_URL` | Base URL of the deployed Next.js app (callback target) |
| `UPLOAD_BUCKET` | Supabase Storage bucket uploaded videos land in (default `uploads`) |
| `PORT` | Listen port (default 3001; Railway injects its own) |

## Deploy to Railway

1. `cd worker`
2. `npm install` once locally (generates `package-lock.json`, required by `npm ci` in the Dockerfile)
3. `railway init` (create/link a project)
4. Set all env vars from `.env.example` in the Railway dashboard (or `railway variables set ...`)
5. `railway up` — Railway detects the `Dockerfile` and builds/deploys with FFmpeg + yt-dlp baked in

## Run locally

Requirements:

- Node.js >= 20
- `ffmpeg` (and ideally `ffprobe`) on PATH — if missing, the bundled `ffmpeg-static` binary is used as a fallback
- `yt-dlp` on PATH (needed for `/process` jobs with a `sourceUrl`)

```bash
cd worker
npm install
cp .env.example .env   # fill in values, then load them into your shell
npm start
```

Optional: `npm install @xenova/transformers` enables on-device Whisper (tiny) transcription as a caption enhancement. It is lazily required and entirely optional — the worker runs fine without it.
