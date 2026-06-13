"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, IconInput } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (data.session) {
        router.push("/dashboard");
        return;
      }
      // No session returned (e.g. email confirmation). Try an immediate sign-in —
      // this succeeds when the account is already confirmed.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        toast.success("Check your inbox to confirm your email, then sign in.");
        router.push("/login");
        return;
      }
      router.push("/dashboard");
    } catch {
      toast.error("Couldn't create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Toaster richColors />
      <AuthCard
        title="Create your studio"
        subtitle="Start clipping in minutes."
        footer={
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-clipr-gold hover:underline"
            >
              Sign in
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">Display name</Label>
            <IconInput
              id="display_name"
              icon={User}
              type="text"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
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
            <Label htmlFor="password">Password</Label>
            <IconInput
              id="password"
              icon={Lock}
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? (
              <>
                <span className="clipr-spinner" />
                Creating…
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>
      </AuthCard>
    </>
  );
}
