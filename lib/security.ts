import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time secret comparison. Returns false if either value is missing or
 * lengths differ, so it never throws and never leaks length via early return
 * timing differences beyond the unavoidable length check.
 */
export function safeSecretEqual(
  provided: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
