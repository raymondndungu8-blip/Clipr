"use client";

import { Scissors, Sparkles, Type, Wand2, type LucideIcon } from "lucide-react";
import { FadeIn, ScaleIn, Stagger, MotionCard } from "@/components/motion";
import VideoPreview from "@/components/VideoPreview";

type Tool = { icon: LucideIcon; title: string; desc: string };

const tools: Tool[] = [
  {
    icon: Scissors,
    title: "URL clipper",
    desc: "Paste a YouTube or TikTok link and get viral-ready vertical clips with captions and hooks.",
  },
  {
    icon: Wand2,
    title: "Faceless video generator",
    desc: "Turn a topic into a fully scripted faceless video — voiceover, scenes, captions and hashtags.",
  },
  {
    icon: Sparkles,
    title: "Hook writer",
    desc: "Generate six scroll-stopping hooks with strength scores and the reasoning behind each one.",
  },
  {
    icon: Type,
    title: "Caption animator",
    desc: "Animate punchy captions in five styles, word-by-word, ready to burn into your videos.",
  },
];

/** Animated preview shown beside the hero copy. */
export function HeroPreview() {
  return (
    <ScaleIn className="flex justify-center md:justify-end">
      <div className="rounded-2xl bg-clipr-card-bright/40 p-2 ring-1 ring-clipr-gold/20 glow-blue">
        <VideoPreview
          hook="How I edit 30 clips a day"
          captions={["WATCH THIS", "IT'S ALL AI", "POST EVERYWHERE"]}
          duration="0:42"
          captionStyle="Bold Gold"
        />
      </div>
    </ScaleIn>
  );
}

/** Staggered grid of tool cards. */
export function ToolGrid() {
  return (
    <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {tools.map((t) => (
        <MotionCard
          key={t.title}
          className="flex flex-col gap-3 rounded-2xl bg-clipr-card neo-raised p-6"
        >
          <div className="flex size-12 items-center justify-center rounded-xl neo-inset text-clipr-gold">
            <t.icon className="size-5" />
          </div>
          <h3 className="text-lg font-semibold text-clipr-text">{t.title}</h3>
          <p className="text-sm text-clipr-secondary">{t.desc}</p>
        </MotionCard>
      ))}
    </Stagger>
  );
}

/** Fade wrapper re-exported so the server-rendered landing page can animate copy blocks. */
export { FadeIn };
