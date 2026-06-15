"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MonitorPlay, Camera, Users, Music2, Plus, X, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";
import { PLATFORMS, PLATFORM_COLORS, type Platform } from "@/components/PlatformPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  PageTransition,
  FadeIn,
  Stagger,
  StaggerItem,
  MotionCard,
} from "@/components/motion";
import { apiPost, apiDelete, ApiError, type FieldIssues } from "@/components/lib/api";
import type { LucideIcon } from "lucide-react";

type Account = Tables<"social_accounts">;

const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  YouTube: MonitorPlay,
  TikTok: Music2,
  Instagram: Camera,
  Facebook: Users,
};

const PLATFORM_HINT: Record<Platform, string> = {
  YouTube: "Channel name or @handle",
  TikTok: "@username",
  Instagram: "@username",
  Facebook: "Page name",
};

export default function ConnectionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dialogPlatform, setDialogPlatform] = useState<Platform | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldIssues>({});

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  async function loadAccounts() {
    const { data } = await getSupabase()
      .from("social_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    setAccounts(data ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openDialog(platform: Platform) {
    setDialogPlatform(platform);
    setDisplayName("");
    setProfileUrl("");
    setFieldErrors({});
  }

  async function onConnect() {
    if (!dialogPlatform) return;
    setSaving(true);
    setFieldErrors({});
    try {
      const { account } = await apiPost<{ account: Account }>("/api/accounts", {
        platform: dialogPlatform,
        displayName: displayName.trim(),
        profileUrl: profileUrl.trim() || undefined,
      });
      setAccounts((prev) => [...prev, account]);
      toast.success(`${dialogPlatform} page connected.`);
      setDialogPlatform(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) setFieldErrors(err.issues ?? {});
        else toast.error(err.message);
      } else {
        toast.error("Couldn't connect that page.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDisconnect(account: Account) {
    const prev = accounts;
    setAccounts((a) => a.filter((x) => x.id !== account.id));
    try {
      await apiDelete("/api/accounts", { id: account.id });
      toast.success("Page disconnected.");
    } catch {
      setAccounts(prev);
      toast.error("Couldn't disconnect that page.");
    }
  }

  return (
    <PageTransition className="flex flex-col gap-6">
      <FadeIn>
        <h1 className="text-2xl font-semibold text-clipr-text">Connections</h1>
        <p className="text-sm text-clipr-secondary">
          Add the social pages you post to. Clipr publishes your clips and reels
          to the pages you connect here.
        </p>
      </FadeIn>

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const Icon = PLATFORM_ICON[platform];
          const color = PLATFORM_COLORS[platform];
          const connected = accounts.filter((a) => a.platform === platform);
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
                          : `${connected.length} page${connected.length === 1 ? "" : "s"} connected`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDialog(platform)}
                  >
                    <Plus className="size-3.5" />
                    Add page
                  </Button>
                </div>

                {connected.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {connected.map((acct) => (
                      <li
                        key={acct.id}
                        className="flex items-center justify-between gap-2 rounded-xl neo-inset px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full bg-clipr-success" />
                          <span className="truncate text-sm text-clipr-text">
                            {acct.display_name}
                          </span>
                          {acct.profile_url && (
                            <a
                              href={acct.profile_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-clipr-dim hover:text-clipr-gold"
                              aria-label="Open profile"
                            >
                              <Link2 className="size-3.5" />
                            </a>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDisconnect(acct)}
                          aria-label={`Disconnect ${acct.display_name}`}
                          className="shrink-0 rounded-full p-1 text-clipr-dim transition-colors hover:text-clipr-error"
                        >
                          <X className="size-4" />
                        </button>
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
          No pages connected yet — add one above to start posting.
        </p>
      )}

      <p className="rounded-xl neo-inset px-4 py-3 text-xs text-clipr-secondary">
        Adding a page here registers it in Clipr so you can target it when
        posting. One-click platform sign-in (OAuth) is coming next — it requires
        each platform&apos;s app approval.
      </p>

      <Dialog
        open={dialogPlatform !== null}
        onOpenChange={(open) => !open && setDialogPlatform(null)}
      >
        <DialogContent className="rounded-2xl border-none bg-clipr-card shadow-none neo-raised">
          <DialogHeader>
            <DialogTitle>
              Connect a {dialogPlatform} page
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="acct-name">
                {dialogPlatform ? PLATFORM_HINT[dialogPlatform] : "Page name"}
              </Label>
              <Input
                id="acct-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={
                  dialogPlatform ? PLATFORM_HINT[dialogPlatform] : "Your page"
                }
                aria-invalid={!!fieldErrors.displayName}
              />
              {fieldErrors.displayName && (
                <p className="text-xs text-clipr-error">
                  {fieldErrors.displayName[0]}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="acct-url">Profile URL (optional)</Label>
              <Input
                id="acct-url"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                placeholder="https://…"
                aria-invalid={!!fieldErrors.profileUrl}
              />
              {fieldErrors.profileUrl && (
                <p className="text-xs text-clipr-error">
                  {fieldErrors.profileUrl[0]}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogPlatform(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={onConnect} disabled={saving || !displayName.trim()}>
              {saving && <span className="clipr-spinner" />}
              {saving ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
