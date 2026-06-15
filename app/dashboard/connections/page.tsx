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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PLATFORMS, PLATFORM_COLORS, type Platform } from "@/components/PlatformPill";
import { Button } from "@/components/ui/button";
import {
  PageTransition,
  FadeIn,
  Stagger,
  StaggerItem,
  MotionCard,
} from "@/components/motion";
import { apiGet, apiPost, ApiError } from "@/components/lib/api";

type ZernioAccount = {
  id: string;
  platform: string;
  username?: string;
  name?: string;
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

      {loaded && accounts.length === 0 && (
        <p className="text-center text-sm text-clipr-dim">
          No accounts connected yet — hit Connect on a platform to authorize it.
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
