"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Scissors, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ClipCard from "@/components/ClipCard";
import EmptyState from "@/components/EmptyState";
import {
  PageTransition,
  FadeIn,
  Stagger,
  StaggerItem,
  MotionCard,
  CountUp,
} from "@/components/motion";

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

  const numberStats = [
    { label: "Clips this month", value: stats?.clipsThisMonth ?? 0 },
    { label: "Posts sent", value: stats?.postsSent ?? 0 },
  ];

  return (
    <PageTransition className="flex flex-col gap-8">
      {/* greeting */}
      <FadeIn>
        <h1 className="text-2xl font-semibold text-clipr-text">
          Hello, Creator
        </h1>
        <p className="mt-1 text-sm font-medium text-clipr-secondary">
          What&apos;s the plan for today?
        </p>
      </FadeIn>

      {/* bento create buttons */}
      <Stagger className="grid grid-cols-2 gap-5 sm:max-w-md">
        <StaggerItem>
          <MotionCard className="h-full">
            <Link
              href="/dashboard/clipper"
              className="group flex aspect-square flex-col items-center justify-center rounded-2xl bg-clipr-card neo-raised p-4"
            >
              <div className="mb-4 flex size-14 items-center justify-center rounded-full neo-inset text-clipr-gold transition-transform group-hover:scale-110">
                <Scissors className="size-6" />
              </div>
              <span className="text-sm font-semibold text-clipr-text">
                Clip video
              </span>
              <span className="mt-1 text-[10px] text-clipr-secondary">
                Short-form magic
              </span>
            </Link>
          </MotionCard>
        </StaggerItem>
        <StaggerItem>
          <MotionCard className="h-full">
            <Link
              href="/dashboard/faceless"
              className="group flex aspect-square flex-col items-center justify-center rounded-2xl bg-clipr-card neo-raised p-4"
            >
              <div className="mb-4 flex size-14 items-center justify-center rounded-full neo-inset text-clipr-tertiary transition-transform group-hover:scale-110">
                <Sparkles className="size-6" />
              </div>
              <span className="text-center text-sm font-semibold text-clipr-text">
                AI faceless
              </span>
              <span className="mt-1 text-[10px] text-clipr-secondary">
                Auto-generated
              </span>
            </Link>
          </MotionCard>
        </StaggerItem>
      </Stagger>

      {/* stats */}
      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {numberStats.map((s) => (
          <StaggerItem
            key={s.label}
            className="rounded-2xl bg-clipr-card neo-inset p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-clipr-secondary">
              {s.label}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-mono text-2xl text-clipr-text">
                <CountUp value={s.value} />
              </p>
            )}
          </StaggerItem>
        ))}
        <StaggerItem className="rounded-2xl bg-clipr-card neo-inset p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-clipr-secondary">
            Plan
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 font-mono text-2xl text-clipr-gold">
              {stats?.plan ?? "Free"}
            </p>
          )}
        </StaggerItem>
      </Stagger>

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
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clips.map((clip) => (
              <StaggerItem key={clip.id}>
                <ClipCard clip={clip} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}
