"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import PlatformPill, { PLATFORMS, type Platform } from "@/components/PlatformPill";
import ClipCard from "@/components/ClipCard";
import ConnectionGate from "@/components/ConnectionGate";
import EmptyState from "@/components/EmptyState";
import RateLimitBanner from "@/components/RateLimitBanner";
import {
  PageTransition,
  FadeIn,
  ScaleIn,
  Stagger,
  StaggerItem,
} from "@/components/motion";
import { apiPost, ApiError, type FieldIssues } from "@/components/lib/api";
import {
  CAPTION_STYLES,
  DEFAULT_CAPTION_STYLE,
  accentForStyle,
  type CaptionStyleName,
} from "@/lib/captionStyles";

type Clip = Tables<"clips">;

/** Human label for a 0-100 progress value, matching the worker's stages. */
function stageLabel(p: number): string {
  if (p < 12) return "Preparing your video…";
  if (p < 38) return "Transcribing the audio…";
  if (p < 48) return "Finding the most viral moments…";
  if (p < 52) return "Writing captions, titles & scores…";
  if (p < 100) return "Rendering clips with captions…";
  return "Finishing up…";
}

const STYLES = [
  "Educational",
  "Motivational",
  "Entertainment",
  "Comedy",
  "News",
] as const;

export default function ClipperPage() {
  const [url, setUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<(typeof STYLES)[number]>("Educational");
  const [platforms, setPlatforms] = useState<Platform[]>(["TikTok"]);
  const [count, setCount] = useState(3);
  const [captionStyle, setCaptionStyle] =
    useState<CaptionStyleName>(DEFAULT_CAPTION_STYLE);
  const [clipLength, setClipLength] = useState<
    "auto" | "<30s" | "30-60s" | "60-90s"
  >("auto");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipSourceUrl, setClipSourceUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldIssues>({});
  const [rateLimit, setRateLimit] = useState<string | null>(null);

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }


  async function loadClips(jobId: string) {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("clips")
      .select("*")
      .eq("job_id", jobId)
      .order("virality_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true });
    setClips(data ?? []);
  }

  // Uploads are processed async on the worker (transcribe → generate → render),
  // so poll the job until it finishes, then load the clips.
  async function pollJob(jobId: string) {
    const supabase = getSupabase();
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const { data } = await supabase
        .from("clip_jobs")
        .select("status, error_message, progress")
        .eq("id", jobId)
        .single();
      if (typeof data?.progress === "number") {
        setProgress((p) => Math.max(p, data.progress));
      }
      if (data?.status === "done") {
        setProgress(100);
        await loadClips(jobId);
        setLoading(false);
        return;
      }
      if (data?.status === "failed") {
        toast.error(data.error_message ?? "Processing failed. Please try again.");
        setLoading(false);
        return;
      }
    }
    toast.error("Still processing — check back in a moment.");
    setLoading(false);
  }

  async function onGenerate() {
    if (!file && !url.trim() && !topic.trim()) {
      toast.error("Upload a video, or add a URL or topic.");
      return;
    }
    if (platforms.length === 0) {
      toast.error("Pick at least one platform.");
      return;
    }

    setLoading(true);
    setProgress(0);
    setFieldErrors({});
    setRateLimit(null);
    setClips([]);
    setClipSourceUrl(url.trim() || null);

    try {
      if (file) {
        // 1. Signed upload URL → 2. upload straight to storage → 3. process.
        setProgress(2);
        const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
        const { path, token } = await apiPost<{ path: string; token: string }>(
          "/api/upload-url",
          { ext }
        );
        const { error: upErr } = await getSupabase()
          .storage.from("uploads")
          .uploadToSignedUrl(path, token, file);
        if (upErr) {
          toast.error(`Upload failed: ${upErr.message}`);
          setLoading(false);
          return;
        }
        setProgress(5);
        const resp = await apiPost<{ jobId: string; status?: string }>(
          "/api/clip",
          {
            uploadKey: path,
            topic: topic.trim() || undefined,
            style,
            platforms,
            count,
            accent: accentForStyle(captionStyle),
            clipLength,
          }
        );
        await pollJob(resp.jobId);
        return;
      }

      // URL/topic is fast + synchronous — animate the bar toward 90% meanwhile.
      progressTimer.current = setInterval(() => {
        setProgress((p) =>
          p < 90 ? p + Math.max(1, Math.round((90 - p) * 0.12)) : p
        );
      }, 350);
      const { jobId } = await apiPost<{ jobId: string }>("/api/clip", {
        url: url.trim() || undefined,
        topic: topic.trim() || undefined,
        style,
        platforms,
        count,
        accent: accentForStyle(captionStyle),
        clipLength,
      });
      if (progressTimer.current) clearInterval(progressTimer.current);
      setProgress(100);
      await loadClips(jobId);
      setLoading(false);
    } catch (err) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setLoading(false);
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setFieldErrors(err.issues ?? {});
          toast.error("Please fix the highlighted fields.");
        } else if (err.status === 429) {
          setRateLimit(err.resetAt ?? "");
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error("Something went wrong.");
      }
    }
  }

  return (
    <PageTransition className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-clipr-text">URL clipper</h1>
        <p className="text-sm text-clipr-secondary">
          Turn a link or a topic into vertical clips.
        </p>
      </div>

      <ConnectionGate>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* controls */}
        <FadeIn className="flex h-fit flex-col gap-5 rounded-2xl bg-clipr-card neo-raised p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="url">Video URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-clipr-surface"
              placeholder="https://youtube.com/watch?v=…"
              aria-invalid={!!fieldErrors.url}
            />
            {fieldErrors.url && (
              <p className="text-xs text-clipr-error">{fieldErrors.url[0]}</p>
            )}
            <p className="text-xs text-clipr-dim">
              Note: YouTube clips render as silent caption videos (YouTube blocks
              server downloads). For clips that{" "}
              <span className="text-clipr-secondary">play with real footage and sound</span>,
              upload the video below.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-clipr-border/60" />
            <span className="font-mono text-xs text-clipr-secondary">— OR —</span>
            <span className="h-px flex-1 bg-clipr-border/60" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">What to clip (optional)</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-clipr-surface"
              placeholder="e.g. the funniest moments, or the part about pricing"
              aria-invalid={!!fieldErrors.topic}
            />
            {fieldErrors.topic && (
              <p className="text-xs text-clipr-error">{fieldErrors.topic[0]}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-clipr-border/60" />
            <span className="font-mono text-xs text-clipr-secondary">— OR —</span>
            <span className="h-px flex-1 bg-clipr-border/60" />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Upload a video</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="justify-start"
            >
              <Upload className="size-3.5" />
              <span className="truncate">{file ? file.name : "Choose a file"}</span>
            </Button>
            <p className="text-xs text-clipr-dim">
              Best results — captions match your video exactly, with real footage
              and sound. Up to 50&nbsp;MB.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Style</Label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95",
                    style === s
                      ? "neo-inset text-clipr-gold"
                      : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="clip-count">How many clips? (1–20)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {[3, 6, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  aria-pressed={count === n}
                  className={cn(
                    "size-9 rounded-full text-sm font-semibold transition-all active:scale-95",
                    count === n
                      ? "neo-inset text-clipr-gold"
                      : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  {n}
                </button>
              ))}
              <Input
                id="clip-count"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n)) return;
                  setCount(Math.min(20, Math.max(1, n)));
                }}
                className="w-20 bg-clipr-surface"
              />
            </div>
            <p className="text-xs text-clipr-dim">
              Number of shorts/reels to generate from the video (up to 20).
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Clip length</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["auto", "Auto"],
                  ["<30s", "<30s"],
                  ["30-60s", "30–60s"],
                  ["60-90s", "60–90s"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setClipLength(val)}
                  aria-pressed={clipLength === val}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95",
                    clipLength === val
                      ? "neo-inset text-clipr-gold"
                      : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Caption style</Label>
            <div className="flex flex-wrap gap-2">
              {CAPTION_STYLES.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setCaptionStyle(s.name)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-95",
                    captionStyle === s.name
                      ? "neo-inset text-clipr-text"
                      : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: s.accent }}
                  />
                  {s.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-clipr-dim">
              The highlighted-word colour for your clip captions.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <PlatformPill
                  key={p}
                  platform={p}
                  active={platforms.includes(p)}
                  onToggle={togglePlatform}
                />
              ))}
            </div>
          </div>

          <Button onClick={onGenerate} disabled={loading} className="mt-1">
            {loading && <span className="clipr-spinner" />}
            {loading ? "Generating…" : "Generate clips"}
          </Button>
        </FadeIn>

        {/* output */}
        <div className="flex flex-col gap-5">
          {rateLimit !== null && (
            <RateLimitBanner
              resetAt={rateLimit || undefined}
              onDismiss={() => setRateLimit(null)}
            />
          )}

          {clips.length > 0 ? (
            <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {clips.map((clip) => (
                <StaggerItem key={clip.id}>
                  <ClipCard
                    clip={clip}
                    sourceUrl={clipSourceUrl}
                    accent={accentForStyle(captionStyle)}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          ) : loading ? (
            <ScaleIn className="flex flex-col items-center gap-6 rounded-2xl bg-clipr-card neo-raised p-10 text-center">
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle
                  cx="75"
                  cy="75"
                  r="62"
                  fill="none"
                  stroke="var(--clipr-border)"
                  strokeWidth="10"
                />
                <circle
                  cx="75"
                  cy="75"
                  r="62"
                  fill="none"
                  stroke="var(--clipr-gold)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 62}
                  strokeDashoffset={2 * Math.PI * 62 * (1 - progress / 100)}
                  transform="rotate(-90 75 75)"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
                <text
                  x="75"
                  y="75"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fill: "var(--clipr-text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 32,
                    fontWeight: 700,
                  }}
                >
                  {progress}%
                </text>
              </svg>
              <div>
                <p className="text-base font-semibold text-clipr-text">
                  {stageLabel(progress)}
                </p>
                <p className="mt-1 text-sm text-clipr-secondary">
                  Crafting {count} perfect clip{count === 1 ? "" : "s"} —
                  captions, scores and all.
                </p>
              </div>
            </ScaleIn>
          ) : (
            <EmptyState
              title="No clips yet"
              hint="Paste a URL or upload a video, pick your length and style, then generate."
            />
          )}
        </div>
      </div>
      </ConnectionGate>
    </PageTransition>
  );
}
