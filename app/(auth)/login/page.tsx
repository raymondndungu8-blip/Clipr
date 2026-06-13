"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import CliprLogo from "@/components/CliprLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/dashboard");
    } catch {
      toast.error("Couldn't sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-12">
      <Toaster richColors />
      <div className="animate-fade-up w-full max-w-sm rounded-2xl bg-clipr-card neo-raised p-8">
        <div className="mb-6 flex justify-center">
          <CliprLogo />
        </div>
        <h1 className="mb-1 text-center text-2xl font-semibold text-clipr-text">
          Welcome back
        </h1>
        <p className="mb-6 text-center text-sm text-clipr-secondary">
          Sign in to your studio.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-clipr-surface"
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-clipr-surface"
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={loading} className="mt-2">
            {loading && <span className="clipr-spinner" />}
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-clipr-secondary">
          No account?{" "}
          <Link href="/signup" className="text-clipr-gold hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
