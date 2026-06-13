import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type LimiterKey =
  | "clipGenerate"
  | "facelessGenerate"
  | "hookWrite"
  | "captionAnimate"
  | "globalIp";

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp (ms) when the window resets. */
  reset: number;
}

export interface Limiter {
  limit(identifier: string): Promise<LimitResult>;
}

let limiters: Record<LimiterKey, Limiter> | null = null;
let warnedNoRedis = false;

function createNoopLimiter(): Limiter {
  return {
    async limit() {
      return {
        success: true,
        limit: Number.MAX_SAFE_INTEGER,
        remaining: Number.MAX_SAFE_INTEGER,
        reset: Date.now() + 3_600_000,
      };
    },
  };
}

/**
 * Lazily constructed limiters so the app builds/boots without Upstash env
 * vars. Without UPSTASH_REDIS_REST_URL all limiters are no-ops (always allow).
 */
function allNoop(reason: string): Record<LimiterKey, Limiter> {
  if (!warnedNoRedis) {
    console.warn(
      `[ratelimit] ${reason} — rate limiting is DISABLED (no-op limiters). Do not ship to production like this.`
    );
    warnedNoRedis = true;
  }
  const noop = createNoopLimiter();
  return {
    clipGenerate: noop,
    facelessGenerate: noop,
    hookWrite: noop,
    captionAnimate: noop,
    globalIp: noop,
  };
}

/** A value is usable only if it's set and not a placeholder like "https://...upstash.io". */
function isConfigured(value: string | undefined): value is string {
  return Boolean(value) && !value!.includes("...");
}

export function getLimiters(): Record<LimiterKey, Limiter> {
  if (limiters) return limiters;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!isConfigured(url) || !isConfigured(token) || !url.startsWith("https://")) {
    limiters = allNoop("Upstash Redis is not configured");
    return limiters;
  }

  try {
    const redis = new Redis({ url, token });

    limiters = {
      clipGenerate: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "rl:clip",
      }),
      facelessGenerate: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "1 h"),
        prefix: "rl:face",
      }),
      hookWrite: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "1 h"),
        prefix: "rl:hook",
      }),
      captionAnimate: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "1 h"),
        prefix: "rl:cap",
      }),
      globalIp: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, "1 h"),
        prefix: "rl:ip",
      }),
    };
    return limiters;
  } catch (err) {
    // Invalid credentials shouldn't take down every request — degrade to no-op.
    limiters = allNoop(`Upstash Redis init failed (${String(err)})`);
    return limiters;
  }
}
