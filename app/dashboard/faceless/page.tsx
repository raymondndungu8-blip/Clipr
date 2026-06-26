"use client";

import { useRef, useState } from "react";
import { Copy, Send, Clapperboard, Download } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import PlatformPill, { PLATFORMS, type Platform } from "@/components/PlatformPill";
import VideoPreview from "@/components/VideoPreview";
import ConnectionGate from "@/components/ConnectionGate";
import EmptyState from "@/components/EmptyState";
import RateLimitBanner from "@/components/RateLimitBanner";
import PostDialog from "@/components/PostDialog";
import { PageTransition, FadeIn, ScaleIn, motion } from "@/components/motion";
import { apiPost, ApiError } from "@/components/lib/api";
import { saveVideo } from "@/lib/download";

const NICHES = [
  "Tech & AI",
  "Business",
  "Finance",
  "Health",
  "Motivation",
  "News",
  "Kenyan Content",
  "Entertainment",
] as const;

const VOICES = [
  "Authoritative",
  "Conversational",
  "Hype",
  "Calm",
  "Storytelling",
] as const;

const DURATIONS = ["30s", "45s", "60s", "90s"] as const;

type Scene = {
  scene: number | string;
  voiceover: string;
  visual: string;
  caption: string;
  duration: string | number;
};

type FacelessScript = {
  title: string;
  hook: string;
  script: Scene[];
  endScreen?: string;
  hashtags: string[];
  description: string;
  music?: string;
  bgGradient?: string;
  captions: string[];
};

export default function FacelessPage() {
  const [topic, setTopic] = useState("");
  const [niche, setNiche] = useState<(typeof NICHES)[number]>("Tech & AI");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>("45s");
  const [voice, setVoice] = useState<(typeof VOICES)[number]>("Conversational");
  const [platforms, setPlatforms] = useState<Platform[]>(["TikTok"]);

  const [loading, setLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [script, setScript] = useState<FacelessScript | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  async function pollForRender(id: string): Promise<string | null> {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      const { data } = await getSupabase()
        .from("faceless_videos")
        .select("r2_url")
        .eq("id", id)
        .single();
      if (data?.r2_url) return data.r2_url;
    }
    return null;
  }

  async function renderVideo() {
    if (!videoId) return;
    setRendering(true);
    try {
      const resp = await apiPost<{ url?: string; status?: string }>(
        "/api/render",
        { videoId }
      );
      if (resp.url) {
        setRenderedUrl(resp.url);
        toast.success("Video rendered and saved.");
        return;
      }
      toast.message("Rendering on the server — this can take a minute…");
      const url = await pollForRender(videoId);
      if (url) {
        setRenderedUrl(url);
        toast.success("Video rendered and saved.");
      } else {
        toast.error("Still rendering — check back in a moment.");
      }
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Couldn't render this video.");
    } finally {
      setRendering(false);
    }
  }

  async function downloadVideo() {
    if (!renderedUrl) return;
    const name = `${(script?.title || "faceless").replace(/[^\w-]+/g, "-").slice(0, 40)}.mp4`;
    await saveVideo(renderedUrl, name);
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function onGenerate() {
    if (!topic.trim()) {
      toast.error("Add a topic for your video.");
      return;
    }
    if (platforms.length === 0) {
      toast.error("Pick at least one platform.");
      return;
    }

    setLoading(true);
    setRateLimit(null);
    setRenderedUrl(null);
    try {
      const res = await apiPost<{ videoId: string; script: FacelessScript }>(
        "/api/faceless",
        { topic: topic.trim(), niche, voice, duration, platforms }
      );
      setVideoId(res.videoId);
      setScript(res.script);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setRateLimit(err.resetAt ?? "");
        else if (err.status === 422)
          toast.error("Please check your inputs and try again.");
        else toast.error(err.message);
      } else {
        toast.error("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyDescription() {
    if (!script) return;
    const text = [script.description, script.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Description copied.");
    } catch {
      toast.error("Couldn't copy.");
    }
  }

  return (
    <PageTransition className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-clipr-text">
          Faceless video generator
        </h1>
        <p className="text-sm text-clipr-secondary">
          Turn a topic into a fully scripted faceless video.
        </p>
      </div>

      <ConnectionGate>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* controls */}
        <FadeIn className="flex h-fit flex-col gap-5 rounded-2xl bg-clipr-card neo-raised p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-clipr-surface"
              placeholder="e.g. Why everyone is talking about AI agents"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Niche</Label>
            <Select
              value={niche}
              onValueChange={(v) => setNiche(v as (typeof NICHES)[number])}
            >
              <SelectTrigger className="w-full bg-clipr-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NICHES.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Duration</Label>
            <Select
              value={duration}
              onValueChange={(v) => setDuration(v as (typeof DURATIONS)[number])}
            >
              <SelectTrigger className="w-full bg-clipr-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Voice</Label>
            <div className="flex flex-wrap gap-2">
              {VOICES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVoice(v)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95",
                    voice === v
                      ? "neo-inset text-clipr-gold"
                      : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  {v}
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

          <Button
            onClick={onGenerate}
            disabled={loading}
            className="mt-1 glow-blue"
          >
            {loading && <span className="clipr-spinner" />}
            {loading ? "Generating…" : "Generate video"}
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

          {!script ? (
            !loading && (
              <EmptyState
                title="No video yet"
                hint="Set a topic, niche and voice, then generate a faceless video script."
              />
            )
          ) : (
            <FadeIn className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-[300px_1fr]">
                <ScaleIn>
                  <VideoPreview
                    hook={script.hook}
                    captions={script.captions}
                    duration={duration}
                    bgGradient={script.bgGradient}
                    videoUrl={renderedUrl}
                    onPlayClick={rendering ? undefined : renderVideo}
                  />
                </ScaleIn>
                <div className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold text-clipr-text">
                    {script.title}
                  </h2>
                  <p className="text-sm text-clipr-secondary">
                    {script.description}
                  </p>
                  {script.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {script.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-clipr-card neo-inset px-2.5 py-0.5 font-mono text-xs text-clipr-secondary"
                        >
                          {tag.startsWith("#") ? tag : `#${tag}`}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={renderVideo}
                      disabled={rendering}
                    >
                      {rendering ? (
                        <span className="clipr-spinner" />
                      ) : (
                        <Clapperboard className="size-3.5" />
                      )}
                      {rendering
                        ? "Rendering…"
                        : renderedUrl
                          ? "Re-render"
                          : "Render video"}
                    </Button>
                    {renderedUrl && (
                      <Button variant="outline" size="sm" onClick={downloadVideo}>
                        <Download className="size-3.5" />
                        Download
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-clipr-gold hover:text-clipr-gold"
                      onClick={copyDescription}
                    >
                      <Copy className="size-3.5" />
                      Copy description
                    </Button>
                    <Button size="sm" onClick={() => setPostOpen(true)}>
                      <Send className="size-3.5" />
                      Post
                    </Button>
                  </div>
                </div>
              </div>

              {/* scene breakdown */}
              <div className="rounded-2xl bg-clipr-card neo-raised p-4">
                <h3 className="mb-3 text-sm font-semibold text-clipr-text">
                  Scene breakdown
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Voiceover</TableHead>
                      <TableHead>Visual</TableHead>
                      <TableHead>Caption</TableHead>
                      <TableHead className="w-16">Dur.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {script.script.map((sc, i) => (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: i * 0.05,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="border-b border-clipr-border/60 transition-colors hover:bg-clipr-card-bright/40"
                      >
                        <TableCell className="font-mono text-clipr-gold">
                          {sc.scene}
                        </TableCell>
                        <TableCell className="max-w-[220px] whitespace-normal text-clipr-text">
                          {sc.voiceover}
                        </TableCell>
                        <TableCell className="max-w-[180px] whitespace-normal text-clipr-secondary">
                          {sc.visual}
                        </TableCell>
                        <TableCell className="max-w-[160px] whitespace-normal font-mono text-xs uppercase text-clipr-secondary">
                          {sc.caption}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-clipr-secondary">
                          {sc.duration}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </FadeIn>
          )}
        </div>
      </div>
      </ConnectionGate>

      {videoId && (
        <PostDialog
          open={postOpen}
          onOpenChange={setPostOpen}
          videoId={videoId}
          defaultCaption={
            script
              ? [script.description, script.hashtags.join(" ")]
                  .filter(Boolean)
                  .join("\n\n")
              : ""
          }
          defaultPlatforms={platforms}
        />
      )}
    </PageTransition>
  );
}
