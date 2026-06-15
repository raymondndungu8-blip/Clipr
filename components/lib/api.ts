"use client";

/**
 * Typed fetch helper for Clipr API routes.
 * Parses JSON and throws typed errors that map 422 / 429 / 500.
 * On 401 it redirects the browser to /login.
 */

export type FieldIssues = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  issues?: FieldIssues;
  resetAt?: string;

  constructor(
    message: string,
    status: number,
    opts?: { issues?: FieldIssues; resetAt?: string }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = opts?.issues;
    this.resetAt = opts?.resetAt;
  }
}

export async function apiSend<T = unknown>(
  path: string,
  method: "POST" | "DELETE" | "PUT",
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }

  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError("Not signed in.", 401);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.ok) return data as T;

  const payload = (data ?? {}) as {
    error?: string;
    issues?: FieldIssues;
    resetAt?: string;
  };

  if (res.status === 422) {
    throw new ApiError(payload.error ?? "Validation failed", 422, {
      issues: payload.issues,
    });
  }

  if (res.status === 429) {
    throw new ApiError(
      payload.error ?? "You've reached your hourly limit.",
      429,
      { resetAt: payload.resetAt }
    );
  }

  throw new ApiError(
    payload.error ?? "Something went wrong. Please try again.",
    res.status || 500
  );
}

export function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiSend<T>(path, "POST", body);
}

export function apiDelete<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiSend<T>(path, "DELETE", body);
}

/** Minutes (rounded up, min 1) until a resetAt ISO timestamp. */
export function minutesUntil(resetAt?: string): number {
  if (!resetAt) return 60;
  const diff = new Date(resetAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return 60;
  return Math.max(1, Math.ceil(diff / 60000));
}
