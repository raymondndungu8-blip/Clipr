<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Clipr — AI video clipping & social posting SaaS

Built by Raymond Ndungu under the **RN Studio** brand ("Design. Code. Intelligence."). Target users: African content creators.

Four tools: URL Clipper (`/dashboard/clipper`), Faceless Video Generator (`/dashboard/faceless`), Hook Writer (`/dashboard/hooks`), Caption Animator (`/dashboard/captions`), plus social posting (`/dashboard/posts`).

## Stack
- Next.js 16 App Router + TypeScript (note: `cookies()`, `headers()`, `params` are async — always `await` them), Tailwind CSS v4 + shadcn/ui
- Supabase (Postgres + Auth + RLS + Realtime) — schema in `supabase/schema.sql`
- Video worker: Node.js Express in `/worker` (deployed separately to Railway; FFmpeg + yt-dlp + Whisper). Never put FFmpeg code in the Next.js app.
- Cloudflare R2 storage (`@aws-sdk/client-s3`), Upstash Redis rate limiting, Anthropic Claude (`claude-sonnet-4-6`) for all AI generation, ElevenLabs (voiceover), Pexels (stock footage), Zernio (social posting), Flutterwave (payments)

## Absolute rules
1. API keys live server-side only — all external calls go through `app/api/*` routes. Never `NEXT_PUBLIC_` a secret (allowed public: Supabase URL/anon key, R2 public CDN URL, Flutterwave public key, worker URL).
2. Every API route starts with `guardRoute(req, '<limiterKey>')` from `lib/apiGuard.ts` (IP rate limit → auth → per-user rate limit), then Zod `safeParse` from `lib/validations/*` before any logic. Validation failure → 422 with flattened field errors; rate limit → 429 with `Retry-After` + `resetAt`.
3. RLS enabled on every table; users only touch their own rows.
4. Worker requests authenticated with `x-worker-secret` header (`WORKER_SECRET` env).
5. Claude API: model `claude-sonnet-4-6`, ask for JSON only, wrap in try/catch, strip markdown fences before `JSON.parse`.
6. Supabase Realtime subscriptions happen client-side only.

## Design system (apply everywhere)
Palette: bg `#0A0A0A`, surface `#111111`, card `#171717`, border `#222222`, gold `#C9A84C`, gold glow `rgba(201,168,76,0.10)`, text `#EEEBE4`, text-secondary `#7A756E`, text-dim `#333028`, success `#4CAF7A`, error `#E05A5A`, info `#5A9BE0`.
These are defined as CSS variables in `app/globals.css` (`--clipr-bg`, `--clipr-surface`, `--clipr-card`, `--clipr-border`, `--clipr-gold`, etc.) and Tailwind theme tokens (`bg-clipr-card`, `text-clipr-gold`, …).

Typography: UI = Space Grotesk, mono = Space Mono (captions, timestamps, scores, code) — loaded via `next/font/google` in `app/layout.tsx` as CSS vars `--font-grotesk` / `--font-mono`. Scale 10/12/14/18/24/36px. Sentence case everywhere; ALL CAPS only for badge labels and caption preview text.

Components: buttons 8px radius (primary = gold fill + `#0A0A0A` text; ghost = transparent + gold border/text). Inputs 8px radius, `#171717` bg, `#222222` border, focus border `#C9A84C80`, 0.15s transition. Cards 12px radius, `#171717`, 1px `#222222` border, no shadows. Chips 20px radius (active = gold 18% bg + gold 55% border). Platform pill colors: TikTok `#69C9D0`, Instagram `#E1306C`, YouTube `#FF3B30`, Facebook `#1877F2` (active = brand 10% bg + brand border).

Animations: `fadeUp` page load (0.3s ease, 0.08s stagger), `captionFlash` (scale .88→1 + opacity 0→1, 0.15s ease), gold spinner for loading buttons. No bounce/overshoot.

Layout: sticky 54px top nav, 1180px max width, 24px side padding. Dashboard = 2-col grid (controls ~340px / output flex). Mobile <768px: bottom tab bar, single column.

Logo: `components/CliprLogo.tsx` — SVG scissor-C mark + `Cl[i]pr` wordmark (Space Mono 17px bold, gold `i`) + "by RN Studio" subtext.

## Conventions
- Path alias `@/*` from repo root.
- DB columns are snake_case; convert at the query boundary.
- `lib/supabase/client.ts` = browser client (`createBrowserClient` from `@supabase/ssr`); `lib/supabase/server.ts` = server clients (cookie-based for auth, service-role for privileged writes).
- Commit after every working feature: `feat: ...` / `security: ...` / `chore: ...`.
- `worker/` is a separate npm project — it is NOT part of the Next.js build; it has its own package.json and Dockerfile (`.vercelignore` + tsconfig exclude keep it out of the frontend build).

## Commands
- `npm run dev` — Next.js dev server (Turbopack)
- `npm run build` — production build (run before committing significant changes)
- `cd worker && npm start` — run worker locally (needs FFmpeg + yt-dlp on PATH)
