"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Scissors } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ClipCard from "@/components/ClipCard";
import EmptyState from "@/components/EmptyState";

type Clip = Tables<"clips">;

type Stats = {
  clipsThisMonth: number;
  postsSent: number;
  plan: string;
};

export default function DashboardHome() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [
        { data: clipRows },
        { count: clipCount },
        { count: postCount },
        { data: userData },
      ] = await Promise.all([
        supabase
          .from("clips")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("clips")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfMonth.toISOString()),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true }),
        supabase.auth.getUser(),
      ]);

      let plan = "Free";
      const uid = userData.user?.id;
      if (uid) {
        const { data: profile } = await supabase
          .from("users_profiles")
          .select("plan")
          .eq("id", uid)
          .maybeSingle();
        if (profile?.plan) {
          plan = profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1);
        }
      }

      if (cancelled) return;
      setClips(clipRows ?? []);
      setStats({
        clipsThisMonth: clipCount ?? 0,
        postsSent: postCount ?? 0,
        plan,
      });
      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-clipr-text">Dashboard</h1>
          <p className="text-sm text-clipr-secondary">
            Your latest clips and studio activity.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/clipper">
            <Scissors className="size-4" />
            Quick generate
          </Link>
        </Button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Clips this month", value: stats?.clipsThisMonth },
          { label: "Posts sent", value: stats?.postsSent },
          { label: "Plan", value: stats?.plan },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-clipr-border bg-clipr-card p-5"
          >
            <p className="text-sm text-clipr-secondary">{s.label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-mono text-2xl text-clipr-text">
                {s.value ?? 0}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* recent clips */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-clipr-text">Recent clips</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-96 w-full rounded-xl" />
            ))}
          </div>
        ) : clips.length === 0 ? (
          <EmptyState
            title="No clips yet"
            hint="Generate your first clip to see it here."
          >
            <Button asChild className="mt-2">
              <Link href="/dashboard/clipper">Create a clip</Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        )}
      </div>
    </div>
  );
}
