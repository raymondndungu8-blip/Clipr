"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import PlatformPill, { PLATFORMS, type Platform } from "@/components/PlatformPill";
import ProgressSteps from "@/components/ProgressSteps";
import ClipCard from "@/components/ClipCard";
import EmptyState from "@/components/EmptyState";
import RateLimitBanner from "@/components/RateLimitBanner";
import { apiPost, ApiError, type FieldIssues } from "@/components/lib/api";

type Clip = Tables<"clips">;
type JobStatus = "pending" | "processing" | "done" | "failed";

const STYLES = [
  "Educational",
  "Motivational",
  "Entertainment",
  "Comedy",
  "News",
] as const;

const STEPS = [
  "Queued",
  "Fetching source",
  "Transcribing",
  "Finding moments",
  "Rendering clips",
];

export default function ClipperPage() {
  const [url, setUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("Educational");
  const [platforms, setPlatforms] = useState<Platform[]>(["TikTok"]);

  const [loading, setLoading] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldIssues>({});
  const [rateLimit, setRateLimit] = useState<string | null>(null);

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  useEffect(() => {
    return () => {
      if (channelRef.current && supabaseRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
      }
    };
  }, []);

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  // map status → current step index
  const stepIndex =
    jobStatus === "pending"
      ? 0
      : jobStatus === "processing"
        ? 3
        : jobStatus === "done"
          ? STEPS.length
          : jobStatus === "failed"
            ? 3
            : 0;

  async function loadClips(jobId: string) {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("clips")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    setClips(data ?? []);
  }

  function subscribe(jobId: string) {
    const supabase = getSupabase();
    const channel = supabase
      .channel(`clip_job_${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "clip_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const next = payload.new as Tables<"clip_jobs">;
          setJobStatus(next.status);
          if (next.status === "done") {
            loadClips(jobId);
            setLoading(false);
            supabase.removeChannel(channel);
            channelRef.current = null;
          } else if (next.status === "failed") {
            toast.error(
              next.error_message ?? "Clipping failed. Please try again."
            );
            setLoading(false);
            supabase.removeChannel(channel);
            channelRef.current = null;
          }
        }
      )
      .subscribe();
    channelRef.current = channel;
  }

  async function onGenerate() {
    if (!url.trim() && !topic.trim()) {
      toast.error("Add a URL or a topic to clip.");
      return;
    }
    if (platforms.length === 0) {
      toast.error("Pick at least one platform.");
      return;
    }

    setLoading(true);
    setFieldErrors({});
    setRateLimit(null);
    setClips([]);
    setJobStatus("pending");

    try {
      const { jobId } = await apiPost<{ jobId: string }>("/api/clip", {
        url: url.trim() || undefined,
        topic: topic.trim() || undefined,
        style,
        platforms,
      });
      subscribe(jobId);
    } catch (err) {
      setJobStatus(null);
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

  const showProgress = loading || jobStatus === "failed";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-clipr-text">URL clipper</h1>
        <p className="text-sm text-clipr-secondary">
          Turn a link or a topic into vertical clips.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* controls */}
        <div className="flex h-fit flex-col gap-5 rounded-xl border border-clipr-border bg-clipr-card p-5">
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
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-clipr-border" />
            <span className="font-mono text-xs text-clipr-secondary">— OR —</span>
            <span className="h-px flex-1 bg-clipr-border" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-clipr-surface"
              placeholder="e.g. AI tools for creators"
              aria-invalid={!!fieldErrors.topic}
            />
            {fieldErrors.topic && (
              <p className="text-xs text-clipr-error">{fieldErrors.topic[0]}</p>
            )}
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
                    "rounded-[20px] border px-3 py-1.5 text-sm transition-all",
                    style === s
                      ? "border-clipr-gold text-clipr-gold"
                      : "border-clipr-border bg-clipr-surface text-clipr-secondary hover:text-clipr-text"
                  )}
                  style={
                    style === s
                      ? { backgroundColor: "rgba(201,168,76,0.18)" }
                      : undefined
                  }
                >
                  {s}
                </button>
              ))}
            </div>
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
        </div>

        {/* output */}
        <div className="flex flex-col gap-5">
          {rateLimit !== null && (
            <RateLimitBanner
              resetAt={rateLimit || undefined}
              onDismiss={() => setRateLimit(null)}
            />
          )}

          {showProgress && (
            <div className="rounded-xl border border-clipr-border bg-clipr-card p-5">
              <ProgressSteps
                steps={STEPS}
                current={stepIndex}
                failed={jobStatus === "failed"}
              />
            </div>
          )}

          {clips.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {clips.map((clip, i) => (
                <div
                  key={clip.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <ClipCard clip={clip} />
                </div>
              ))}
            </div>
          ) : (
            !showProgress && (
              <EmptyState
                title="No clips yet"
                hint="Paste a URL or enter a topic, pick your style and platforms, then generate."
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
