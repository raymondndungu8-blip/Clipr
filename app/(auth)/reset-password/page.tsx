"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, IconInput } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [verifying, setVerifying] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Establish a recovery session from the link (admin token_hash, email OTP, or
  // PKCE code), so the user can set a new password.
  useEffect(() => {
    const supabase = createClient();
    async function init() {
      try {
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session) {
          setReady(true);
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get("token_hash") ?? params.get("token");
        const code = params.get("code");

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) throw error;
          setReady(true);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setReady(true);
        } else {
          setReady(false);
        }
      } catch (err) {
        console.error("[reset-password] verify failed:", err);
        setReady(false);
      } finally {
        setVerifying(false);
      }
    }
    init();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated — you're signed in.");
      router.replace("/dashboard");
    } catch {
      toast.error("Couldn't update your password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Toaster richColors />
      <AuthCard
        title="Set a new password"
        subtitle="Choose a new password for your studio."
        footer={
          <>
            Remembered it?{" "}
            <Link
              href="/login"
              className="font-semibold text-clipr-gold hover:underline"
            >
              Back to sign in
            </Link>
          </>
        }
      >
        {verifying ? (
          <p className="text-sm text-clipr-secondary">Verifying your link…</p>
        ) : ready ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
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
                  Saving…
                </>
              ) : (
                <>
                  Save new password
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-clipr-secondary">
            This reset link is invalid or has expired. Go to{" "}
            <Link href="/login" className="text-clipr-gold hover:underline">
              sign in
            </Link>{" "}
            and tap “Forgot password?” to get a new one.
          </p>
        )}
      </AuthCard>
    </>
  );
}
