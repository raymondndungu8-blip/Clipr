"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_COLORS, type Platform } from "@/components/PlatformPill";
import RateLimitBanner from "@/components/RateLimitBanner";
import { apiGet, apiPost, ApiError } from "@/components/lib/api";
import { cn } from "@/lib/utils";

type ZernioAccount = {
  id: string;
  platform: string;
  username?: string;
  name?: string;
};

/** Zernio slug → Clipr platform name (for brand colors). */
const SLUG_TO_PLATFORM: Record<string, Platform> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
};

type PostDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Either clipId or videoId should be set. */
  clipId?: string;
  videoId?: string;
  defaultCaption?: string;
  defaultPlatforms?: Platform[];
};

export default function PostDialog({
  open,
  onOpenChange,
  clipId,
  videoId,
  defaultCaption = "",
}: PostDialogProps) {
  const [caption, setCaption] = useState(defaultCaption);
  const [accounts, setAccounts] = useState<ZernioAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [rateLimit, setRateLimit] = useState<string | null>(null);

  // Load connected accounts whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const { accounts } = await apiGet<{ accounts: ZernioAccount[] }>(
          "/api/zernio/accounts"
        );
        if (!active) return;
        setAccounts(accounts ?? []);
        // Pre-select all by default.
        setSelected(new Set((accounts ?? []).map((a) => a.id)));
      } catch {
        if (active) setAccounts([]);
      } finally {
        if (active) setAccountsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) {
      toast.error("Pick at least one account to post to.");
      return;
    }
    setLoading(true);
    setRateLimit(null);
    try {
      await apiPost<{ postId: string; status: string }>("/api/post", {
        clipId,
        videoId,
        accountIds: [...selected],
        caption,
      });
      toast.success("Post sent.");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setRateLimit(err.resetAt ?? "");
        else toast.error(err.message);
      } else {
        toast.error("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-none bg-clipr-card shadow-none neo-raised">
        <DialogHeader>
          <DialogTitle>Post to socials</DialogTitle>
          <DialogDescription>
            Choose which connected accounts to post to.
          </DialogDescription>
        </DialogHeader>

        {rateLimit !== null && (
          <RateLimitBanner
            resetAt={rateLimit || undefined}
            onDismiss={() => setRateLimit(null)}
          />
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Accounts</Label>
            {!accountsLoaded ? (
              <p className="text-sm text-clipr-dim">Loading your accounts…</p>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-start gap-2 rounded-xl neo-inset px-4 py-3">
                <p className="text-sm text-clipr-secondary">
                  No connected accounts yet.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/connections">
                    <Link2 className="size-3.5" />
                    Connect accounts
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const platform = SLUG_TO_PLATFORM[a.platform];
                  const color = platform ? PLATFORM_COLORS[platform] : undefined;
                  const active = selected.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={loading}
                      onClick={() => toggle(a.id)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-95 disabled:opacity-50",
                        active
                          ? "neo-inset"
                          : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                      )}
                      style={active && color ? { color } : undefined}
                    >
                      {a.username || a.name || a.id}
                      <span className="ml-1.5 text-[10px] uppercase opacity-70">
                        {platform ?? a.platform}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="post-caption">Caption</Label>
            <Textarea
              id="post-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              className="bg-clipr-surface"
              placeholder="Write a caption…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={loading || accounts.length === 0 || selected.size === 0}
          >
            {loading && <span className="clipr-spinner" />}
            {loading ? "Posting…" : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
