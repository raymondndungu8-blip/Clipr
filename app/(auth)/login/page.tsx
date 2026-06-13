"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, IconInput } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
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
    <>
      <Toaster richColors />
      <AuthCard
        title="Welcome back"
        subtitle="Sign in to your studio."
        footer={
          <>
            No account?{" "}
            <Link
              href="/signup"
              className="font-semibold text-clipr-gold hover:underline"
            >
              Create one
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <IconInput
              id="email"
              icon={Mail}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
            </div>
            <IconInput
              id="password"
              icon={Lock}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? (
              <>
                <span className="clipr-spinner" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>
      </AuthCard>
    </>
  );
}
