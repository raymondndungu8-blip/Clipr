import Link from "next/link";
import { Scissors, Sparkles, Type, Wand2 } from "lucide-react";
import CliprLogo from "@/components/CliprLogo";
import { Button } from "@/components/ui/button";
import VideoPreview from "@/components/VideoPreview";

const tools = [
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

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-clipr-bg">
      {/* nav */}
      <header className="sticky top-0 z-40 h-[54px] border-b border-clipr-border bg-clipr-bg/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1180px] items-center justify-between px-6">
          <CliprLogo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-6">
        {/* hero */}
        <section className="grid grid-cols-1 gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div className="animate-fade-up flex flex-col gap-6">
            <span className="w-fit rounded-[20px] border border-clipr-border bg-clipr-surface px-3 py-1 font-mono text-xs uppercase text-clipr-gold">
              For African creators
            </span>
            <h1 className="text-4xl font-bold leading-tight text-clipr-text md:text-[36px]">
              Turn long videos into{" "}
              <span className="text-clipr-gold">viral clips</span> in minutes.
            </h1>
            <p className="max-w-md text-lg text-clipr-secondary">
              Clipr is your AI studio for short-form: clip, script, hook and
              caption — then post to every platform from one place.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Start clipping free</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <div className="animate-fade-up" style={{ animationDelay: "0.08s" }}>
              <VideoPreview
                hook="How I edit 30 clips a day"
                captions={["WATCH THIS", "IT'S ALL AI", "POST EVERYWHERE"]}
                duration="0:42"
                captionStyle="Bold Gold"
              />
            </div>
          </div>
        </section>

        {/* tools */}
        <section className="py-12">
          <h2 className="mb-8 text-2xl font-semibold text-clipr-text">
            Four tools, one studio
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {tools.map((t, i) => (
              <div
                key={t.title}
                className="animate-fade-up flex flex-col gap-3 rounded-xl border border-clipr-border bg-clipr-card p-6"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div
                  className="flex size-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "var(--clipr-gold-glow)" }}
                >
                  <t.icon className="size-5 text-clipr-gold" />
                </div>
                <h3 className="text-lg font-semibold text-clipr-text">
                  {t.title}
                </h3>
                <p className="text-sm text-clipr-secondary">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <h2 className="mx-auto max-w-xl text-2xl font-semibold text-clipr-text">
            Ready to grow faster?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-clipr-secondary">
            Join creators turning ideas into content that travels.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/signup">Get started</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-clipr-border py-8">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-2 px-6 text-center">
          <CliprLogo />
          <p className="text-sm text-clipr-secondary">
            by RN Studio — Design. Code. Intelligence.
          </p>
        </div>
      </footer>
    </div>
  );
}
