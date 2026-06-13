import Link from "next/link";
import CliprLogo from "@/components/CliprLogo";
import { Button } from "@/components/ui/button";
import { HeroPreview, ToolGrid, FadeIn } from "./landing-sections";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-clipr-bg">
      {/* nav */}
      <header className="sticky top-0 z-40 h-[54px] bg-clipr-bg/80 backdrop-blur-md border-b border-clipr-border/60">
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
          <FadeIn className="flex flex-col gap-6">
            <span className="w-fit rounded-full bg-clipr-card neo-inset px-3.5 py-1 font-mono text-xs uppercase text-clipr-gold">
              For African creators
            </span>
            <h1 className="text-4xl font-bold leading-tight text-clipr-text md:text-[44px]">
              Turn long videos into{" "}
              <span className="text-gradient">viral clips</span> in minutes.
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
          </FadeIn>

          <HeroPreview />
        </section>

        {/* tools */}
        <section className="py-12">
          <FadeIn>
            <h2 className="mb-8 text-2xl font-semibold text-clipr-text">
              Four tools, one studio
            </h2>
          </FadeIn>
          <ToolGrid />
        </section>

        {/* CTA */}
        <FadeIn className="py-16 text-center">
          <h2 className="mx-auto max-w-xl text-2xl font-semibold text-clipr-text">
            Ready to grow faster?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-clipr-secondary">
            Join creators turning ideas into content that travels.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/signup">Get started</Link>
          </Button>
        </FadeIn>
      </main>

      <footer className="mt-8 border-t border-clipr-border/60 py-8">
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
