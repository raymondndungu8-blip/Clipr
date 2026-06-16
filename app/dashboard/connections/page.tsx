"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  MonitorPlay,
  Camera,
  Users,
  Music2,
  Plus,
  RefreshCw,
  ExternalLink,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PLATFORMS, PLATFORM_COLORS, type Platform } from "@/components/PlatformPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PageTransition,
  FadeIn,
  Stagger,
  StaggerItem,
  MotionCard,
} from "@/components/motion";
import { apiGet, apiPost, apiDelete, ApiError } from "@/components/lib/api";

type ZernioAccount = {
  id: string;
  platform: string;
  username?: string;
  name?: string;
};

type MyAccount = {
  id: string;
  platform: string;
  display_name: string;
  profile_url: string | null;
};

const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  YouTube: MonitorPlay,
  TikTok: Music2,
  Instagram: Camera,
  Facebook: Users,
};

/** Clipr platform name → Zernio platform slug. */
const PLATFORM_SLUG: Record<Platform, string> = {
  TikTok: "tiktok",
  Instagram: "instagram",
  YouTube: "youtube",
  Facebook: "facebook",
};

export default function ConnectionsPage() {
  const [accounts, setAccounts] = useState<ZernioAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState<Platform | null>(null);

  // Manually-added pages (per-user) — works without the Zernio OAuth round-trip.
  const [mine, setMine] = useState<MyAccount[]>([]);
  const [addPlatform, setAddPlatform] = useState<Platform>("YouTube");
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadMine() {
    try {
      const { accounts } = await apiGet<{ accounts: MyAccount[] }>(
        "/api/accounts"
      );
      setMine(accounts ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Couldn't load your pages.");
      }
    }
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) {
      toast.error("Add your page name or @handle.");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/accounts", {
        platform: addPlatform,
        displayName: addName.trim(),
        profileUrl: addUrl.trim() || undefined,
      });
      toast.success(`${addPlatform} page added.`);
      setAddName("");
      setAddUrl("");
      await loadMine();
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Couldn't add the page.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMine(id: string) {
    try {
      await apiDelete("/api/accounts", { id });
      setMine((prev) => prev.filter((a) => a.id !== id));
      toast.success("Page removed.");
    } catch {
      toast.error("Couldn't remove the page.");
    }
  }

  async function loadAccounts() {
    setRefreshing(true);
    try {
      const { accounts } = await apiGet<{ accounts: ZernioAccount[] }>(
        "/api/zernio/accounts"
      );
      setAccounts(accounts ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        toast.error("Couldn't load connected accounts.");
      }
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { accounts } = await apiGet<{ accounts: ZernioAccount[] }>(
          "/api/zernio/accounts"
        );
        if (active) setAccounts(accounts ?? []);
      } catch (err) {
        if (active && err instanceof ApiError && err.status !== 401) {
          toast.error("Couldn't load connected accounts.");
        }
      } finally {
        if (active) setLoaded(true);
      }
      if (active) await loadMine();
    })();
    return () => {
      active = false;
    };
  }, []);

  async function connect(platform: Platform) {
    setConnecting(platform);
    try {
      const { authUrl } = await apiPost<{ authUrl: string }>(
        "/api/zernio/connect",
        { platform }
      );
      // Open the platform's OAuth screen in a new tab.
      window.open(authUrl, "_blank", "noopener,noreferrer");
      toast.success(
        `Authorize ${platform} in the new tab, then hit Refresh here.`
      );
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Couldn't start the connection.");
    } finally {
      setConnecting(null);
    }
  }

  return (
    <PageTransition className="flex flex-col gap-6">
      <FadeIn className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-clipr-text">Connections</h1>
          <p className="text-sm text-clipr-secondary">
            Connect your social pages so Clipr can post clips and reels to them.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAccounts} disabled={refreshing}>
          {refreshing ? <span className="clipr-spinner" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </Button>
      </FadeIn>

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const Icon = PLATFORM_ICON[platform];
          const color = PLATFORM_COLORS[platform];
          const connected = accounts.filter(
            (a) => a.platform === PLATFORM_SLUG[platform]
          );
          return (
            <StaggerItem key={platform}>
              <MotionCard
                interactive={false}
                className="flex h-full flex-col gap-4 rounded-2xl bg-clipr-card neo-raised p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-10 items-center justify-center rounded-full neo-inset"
                      style={{ color }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-clipr-text">{platform}</p>
                      <p className="text-xs text-clipr-dim">
                        {connected.length === 0
                          ? "Not connected"
                          : `${connected.length} account${connected.length === 1 ? "" : "s"} connected`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => connect(platform)}
                    disabled={connecting === platform}
                  >
                    {connecting === platform ? (
                      <span className="clipr-spinner" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Connect
                  </Button>
                </div>

                {connected.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {connected.map((acct) => (
                      <li
                        key={acct.id}
                        className="flex items-center gap-2 rounded-xl neo-inset px-3 py-2"
                      >
                        <span className="size-2 shrink-0 rounded-full bg-clipr-success" />
                        <span className="truncate text-sm text-clipr-text">
                          {acct.username || acct.name || acct.id}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </MotionCard>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* Manual add — works immediately, no OAuth round-trip needed */}
      <FadeIn className="flex flex-col gap-4 rounded-2xl bg-clipr-card neo-raised p-5">
        <div>
          <h2 className="text-lg font-semibold text-clipr-text">Add a page</h2>
          <p className="text-sm text-clipr-secondary">
            Add a page directly with its name/@handle and an optional link.
          </p>
        </div>

        <form onSubmit={addAccount} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Platform</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAddPlatform(p)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95",
                    addPlatform === p
                      ? "neo-inset text-clipr-gold"
                      : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-name">Page name / @handle</Label>
              <Input
                id="add-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="bg-clipr-surface"
                placeholder="@yourpage"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-url">Profile link (optional)</Label>
              <Input
                id="add-url"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                className="bg-clipr-surface"
                placeholder="https://…"
              />
            </div>
          </div>

          <Button type="submit" disabled={saving} className="self-start">
            {saving ? <span className="clipr-spinner" /> : <Plus className="size-3.5" />}
            Add page
          </Button>
        </form>

        {mine.length > 0 && (
          <ul className="flex flex-col gap-2">
            {mine.map((acct) => (
              <li
                key={acct.id}
                className="flex items-center justify-between gap-2 rounded-xl neo-inset px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full bg-clipr-success" />
                  <span className="truncate text-sm text-clipr-text">
                    {acct.display_name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-clipr-dim">
                    {acct.platform}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeMine(acct.id)}
                  aria-label="Remove page"
                  className="shrink-0 text-clipr-dim transition-colors hover:text-clipr-error"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FadeIn>

      {loaded && accounts.length === 0 && mine.length === 0 && (
        <p className="text-center text-sm text-clipr-dim">
          No accounts yet — connect a platform above or add a page manually.
        </p>
      )}

      <div className="flex items-start gap-2 rounded-xl neo-inset px-4 py-3 text-xs text-clipr-secondary">
        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-clipr-dim" />
        <span>
          Connect opens the platform&apos;s secure sign-in (via Zernio) in a new
          tab. After you authorize, come back and hit Refresh. Posting targets
          the accounts shown here.
        </span>
      </div>
    </PageTransition>
  );
}
