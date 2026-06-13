"use client";

import { X } from "lucide-react";
import { minutesUntil } from "@/components/lib/api";

type RateLimitBannerProps = {
  resetAt?: string;
  onDismiss: () => void;
};

export default function RateLimitBanner({
  resetAt,
  onDismiss,
}: RateLimitBannerProps) {
  const minutes = minutesUntil(resetAt);

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg p-4"
      style={{
        backgroundColor: "#FFF8E6",
        borderLeft: "4px solid var(--clipr-gold)",
        color: "#3A2F12",
      }}
    >
      <div>
        <p className="text-sm font-semibold">Hourly limit reached</p>
        <p className="text-sm">
          You&apos;ve reached your hourly limit. Resets in {minutes} minute
          {minutes === 1 ? "" : "s"}.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 transition-opacity hover:opacity-70"
        style={{ color: "#3A2F12" }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
