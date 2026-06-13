"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
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
import EmptyState from "@/components/EmptyState";
import RateLimitBanner from "@/components/RateLimitBanner";
import { apiPost, ApiError } from "@/components/lib/api";

const PLATFORMS = [
  "TikTok",
  "Instagram",
  "YouTube Shorts",
  "Facebook",
] as const;

const TONES = [
  "Shocking",
  "Curious",
  "Funny",
  "Motivational",
  "Controversial",
  "Educational",
] as const;

type Hook = {
  hook: string;
  type: string;
  strength: number;
  why: string;
};

function strengthColor(strength: number) {
  if (strength >= 8) return "var(--clipr-success)";
  if (strength >= 5) return "var(--clipr-gold)";
  return "var(--clipr-error)";
}

export default function HooksPage() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] =
    useState<(typeof PLATFORMS)[number]>("TikTok");
  const [tone, setTone] = useState<(typeof TONES)[number]>("Curious");

  const [loading, setLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<string | null>(null);
  const [hooks, setHooks] = useState<Hook[] | null>(null);

  async function onGenerate() {
    if (!topic.trim()) {
      toast.error("Add a topic to write hooks about.");
      return;
    }
    setLoading(true);
    setRateLimit(null);
    try {
      const res = await apiPost<{ hooks: Hook[] }>("/api/hooks", {
        topic: topic.trim(),
        platform,
        tone,
      });
      setHooks(res.hooks);
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

  async function copyHook(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Hook copied.");
    } catch {
      toast.error("Couldn't copy.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-clipr-text">Hook writer</h1>
        <p className="text-sm text-clipr-secondary">
          Six scroll-stopping hooks, scored and explained.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* controls */}
        <div className="flex h-fit flex-col gap-5 rounded-2xl bg-clipr-card neo-raised p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-clipr-surface"
              placeholder="e.g. saving money as a student"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Platform</Label>
            <Select
              value={platform}
              onValueChange={(v) =>
                setPlatform(v as (typeof PLATFORMS)[number])
              }
            >
              <SelectTrigger className="w-full bg-clipr-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Tone</Label>
            <Select
              value={tone}
              onValueChange={(v) => setTone(v as (typeof TONES)[number])}
            >
              <SelectTrigger className="w-full bg-clipr-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={onGenerate} disabled={loading} className="mt-1">
            {loading && <span className="clipr-spinner" />}
            {loading ? "Writing…" : "Write 6 hooks"}
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

          {!hooks ? (
            !loading && (
              <EmptyState
                title="No hooks yet"
                hint="Enter a topic, pick a platform and tone, then generate six hooks."
              />
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {hooks.map((h, i) => (
                <div
                  key={i}
                  className="animate-fade-up flex flex-col gap-3 rounded-xl bg-clipr-card neo-raised p-5"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full neo-inset px-2.5 py-0.5 text-[10px] font-bold uppercase text-clipr-gold">
                      {h.type}
                    </span>
                    <span
                      className="font-mono text-sm font-bold"
                      style={{ color: strengthColor(h.strength) }}
                    >
                      {h.strength}/10
                    </span>
                  </div>
                  <p className="text-lg font-semibold leading-snug text-clipr-text">
                    {h.hook}
                  </p>
                  <p className="text-sm text-clipr-secondary">{h.why}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-auto w-fit text-clipr-gold hover:text-clipr-gold"
                    onClick={() => copyHook(h.hook)}
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
