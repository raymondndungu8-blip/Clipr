"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORM_COLORS, type Platform } from "@/components/PlatformPill";
import EmptyState from "@/components/EmptyState";
import { PageTransition, FadeIn, motion } from "@/components/motion";

type Post = Tables<"posts">;
type StatusFilter = "all" | "queued" | "posted" | "failed";
type PlatformFilter = "all" | Platform;

const STATUS_COLORS: Record<string, string> = {
  queued: "var(--clipr-info)",
  posted: "var(--clipr-success)",
  failed: "var(--clipr-error)",
};

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(
    h.slice(4, 6),
    16
  )}`;
}

function PlatformTag({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform as Platform];
  if (!color) {
    return (
      <span className="rounded-full bg-clipr-card neo-inset px-2.5 py-0.5 text-xs text-clipr-secondary">
        {platform}
      </span>
    );
  }
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium neo-inset"
      style={{
        color,
        backgroundColor: `rgba(${hexToRgb(color)}, 0.12)`,
      }}
    >
      {platform}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setPosts(data ?? []);
      setLoading(false);
    }
    load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (
        platformFilter !== "all" &&
        !(p.platforms ?? []).includes(platformFilter)
      )
        return false;
      return true;
    });
  }, [posts, statusFilter, platformFilter]);

  return (
    <PageTransition className="flex flex-col gap-6">
      <FadeIn className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-clipr-text">Posts</h1>
          <p className="text-sm text-clipr-secondary">
            Your scheduled and sent posts.
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={platformFilter}
            onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}
          >
            <SelectTrigger className="bg-clipr-surface" size="sm">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="TikTok">TikTok</SelectItem>
              <SelectItem value="Instagram">Instagram</SelectItem>
              <SelectItem value="YouTube">YouTube</SelectItem>
              <SelectItem value="Facebook">Facebook</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="bg-clipr-surface" size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FadeIn>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          title="No posts yet"
          hint="Post a clip or video and it'll show up here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No posts match your filters"
          hint="Try clearing the platform or status filter."
        />
      ) : (
        <div className="rounded-2xl bg-clipr-card neo-raised p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14"></TableHead>
                <TableHead>Platforms</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Caption</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: Math.min(i * 0.04, 0.4),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="border-b border-clipr-border/60 transition-colors hover:bg-clipr-card-bright/40"
                >
                  <TableCell>
                    <div className="flex size-10 items-center justify-center rounded-lg neo-inset text-clipr-gold">
                      <ImageIcon className="size-4" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {(p.platforms ?? []).map((pl) => (
                        <PlatformTag key={pl} platform={pl} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className="text-xs font-medium uppercase"
                      style={{
                        color:
                          STATUS_COLORS[p.status ?? "queued"] ??
                          "var(--clipr-secondary)",
                      }}
                    >
                      {p.status ?? "queued"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-clipr-secondary">
                    {p.caption ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-clipr-secondary">
                    {formatDate(p.created_at)}
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageTransition>
  );
}
