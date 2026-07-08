import type { NextConfig } from "next";

/** Origin of a configured URL, or null — used to whitelist the R2 CDN in the CSP below. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Rendered clips live on the R2 public CDN, a different origin than the app.
// The in-page <video> preview only needs media-src (already allows any
// https:), but downloading a clip (components/lib/download.ts's saveVideo,
// which fetch()es the clip as a blob so it can trigger a real save / share
// sheet on mobile) needs connect-src to explicitly allow that origin —
// without it the fetch is blocked by this CSP itself, silently falling back
// to opening the video in a new tab instead of downloading it.
const r2Origin = originOf(process.env.NEXT_PUBLIC_R2_PUBLIC_URL);

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "media-src 'self' https: blob:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  [
    "connect-src 'self' https://*.supabase.co https://*.upstash.io wss://*.supabase.co",
    r2Origin,
  ]
    .filter(Boolean)
    .join(" "),
].join("; ");

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray parent-dir lockfile otherwise confuses inference.
  turbopack: { root: __dirname },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
