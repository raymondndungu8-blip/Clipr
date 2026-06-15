// Server-only Zernio client (social posting + account connections).
// Base URL + auth per https://docs.zernio.com/ . Never import in client code.

const BASE_URL = "https://zernio.com/api/v1";

/** Zernio platform slugs (lowercase) keyed by Clipr's platform names. */
export const ZERNIO_PLATFORM: Record<string, string> = {
  TikTok: "tiktok",
  Instagram: "instagram",
  YouTube: "youtube",
  Facebook: "facebook",
};

export interface ZernioAccount {
  id: string;
  platform: string;
  username?: string;
  name?: string;
  avatar?: string;
}

function getKey(): string {
  const key = process.env.ZERNIO_API_KEY;
  if (!key || key.includes("...")) {
    throw new Error("ZERNIO_API_KEY is not configured.");
  }
  return key;
}

async function zfetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && (data.message || data.error)) || `Zernio error ${res.status}`;
    throw new Error(message);
  }
  return data;
}

/** List connected social accounts. Normalizes Zernio's `_id`/`id` shape. */
export async function listAccounts(): Promise<ZernioAccount[]> {
  const data = await zfetch("/accounts");
  const raw: unknown[] = data?.accounts ?? [];
  return raw.map((a) => {
    const acc = a as Record<string, unknown>;
    return {
      id: String(acc._id ?? acc.id ?? ""),
      platform: String(acc.platform ?? ""),
      username: (acc.username as string) ?? undefined,
      name: (acc.name as string) ?? undefined,
      avatar: (acc.avatar as string) ?? undefined,
    };
  });
}

/** Get an OAuth connect URL for a platform, attached to the Clipr profile. */
export async function getConnectUrl(platform: string): Promise<string> {
  const profileId = process.env.ZERNIO_PROFILE_ID;
  const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
  const data = await zfetch(`/connect/${platform}${query}`);
  if (!data?.authUrl) throw new Error("Zernio did not return an auth URL.");
  return data.authUrl as string;
}

/** Publish (or schedule) a post to the given accounts. */
export async function createPost(opts: {
  content: string;
  mediaUrls: string[];
  platforms: { platform: string; accountId: string }[];
  scheduledFor?: string;
}): Promise<unknown> {
  const body: Record<string, unknown> = {
    content: opts.content,
    mediaUrls: opts.mediaUrls,
    platforms: opts.platforms,
  };
  if (opts.scheduledFor) body.scheduledFor = opts.scheduledFor;
  else body.publishNow = true;

  return zfetch("/posts", { method: "POST", body: JSON.stringify(body) });
}
