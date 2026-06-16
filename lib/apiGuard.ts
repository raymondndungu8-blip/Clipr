import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getLimiters, type LimiterKey } from "@/lib/ratelimit";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type GuardSuccess = {
  user: User;
  supabase: ServerSupabaseClient;
  error?: undefined;
};

export type GuardFailure = {
  error: Response;
  user?: undefined;
  supabase?: undefined;
};

export type GuardResult = GuardSuccess | GuardFailure;

/**
 * Standard route guard: IP rate limit → auth → per-user rate limit.
 * Usage:
 *   const guard = await guardRoute(req, 'clipGenerate');
 *   if (guard.error) return guard.error;
 *   const { user, supabase } = guard;
 */
/** These JSON APIs take small inputs; reject anything larger up front. */
const MAX_BODY_BYTES = 100_000;

export async function guardRoute(
  req: NextRequest,
  limiterKey: Exclude<LimiterKey, "globalIp">
): Promise<GuardResult> {
  const limiters = getLimiters();

  // 0. Reject oversized bodies before doing any work (cheap DoS guard).
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return {
      error: NextResponse.json(
        { error: "Request body too large." },
        { status: 413 }
      ),
    };
  }

  // 1. Global per-IP limit
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipResult = await limiters.globalIp.limit(ip);
  if (!ipResult.success) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "Retry-After": "3600" } }
      ),
    };
  }

  // 2. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // 3. Per-user limit
  const userResult = await limiters[limiterKey].limit(user.id);
  if (!userResult.success) {
    const resetAt = new Date(userResult.reset).toISOString();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((userResult.reset - Date.now()) / 1000)
    );
    return {
      error: NextResponse.json(
        { error: "Hourly limit reached.", resetAt },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": String(userResult.remaining),
            "X-RateLimit-Reset": String(userResult.reset),
            "Retry-After": String(retryAfterSeconds),
          },
        }
      ),
    };
  }

  return { user, supabase };
}
