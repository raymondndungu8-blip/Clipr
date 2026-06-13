"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Scissors,
  Wand2,
  Sparkles,
  Type,
  Send,
  LogOut,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CliprLogo from "@/components/CliprLogo";
import { Toaster } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard/clipper", label: "URL Clipper", icon: Scissors },
  { href: "/dashboard/faceless", label: "Faceless Video", icon: Wand2 },
  { href: "/dashboard/hooks", label: "Hook Writer", icon: Sparkles },
  { href: "/dashboard/captions", label: "Captions", icon: Type },
  { href: "/dashboard/posts", label: "Posts", icon: Send },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex min-h-full flex-col bg-clipr-bg">
      <Toaster richColors />

      {/* top nav */}
      <header className="sticky top-0 z-40 h-16 bg-clipr-bg neo-raised-sm">
        <div className="mx-auto flex h-full max-w-[1180px] items-center justify-between px-6">
          <Link href="/dashboard">
            <CliprLogo />
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {tabs.map((t) => {
              const active = isActive(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95",
                    active
                      ? "neo-inset text-clipr-gold"
                      : "text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="flex size-10 items-center justify-center rounded-full bg-clipr-card neo-raised text-clipr-gold transition-transform active:scale-95"
              >
                <User className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-xl border-none bg-clipr-card shadow-none neo-raised"
            >
              <DropdownMenuItem asChild>
                <Link href="/dashboard">Dashboard</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={signOut}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* content */}
      <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 pb-24 pt-6 md:pb-10">
        {children}
      </main>

      {/* mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-clipr-bg shadow-[0_-6px_12px_rgba(0,0,0,0.05),0_-6px_12px_rgba(255,255,255,0.4)] md:hidden">
        <div className="flex items-stretch justify-around px-2 py-2">
          {tabs.map((t) => {
            const active = isActive(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-all active:scale-95",
                  active ? "neo-active text-clipr-gold" : "text-clipr-secondary"
                )}
              >
                <t.icon className="size-5" />
                <span className="truncate">{t.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
