"use client";

import { X, AlarmClock } from "lucide-react";
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
      className="flex items-start justify-between gap-3 rounded-xl bg-clipr-card neo-inset p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full neo-raised text-clipr-gold">
          <AlarmClock className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-clipr-text">
            Hourly limit reached
          </p>
          <p className="text-sm text-clipr-secondary">
            You&apos;ve reached your hourly limit. Resets in {minutes} minute
            {minutes === 1 ? "" : "s"}.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex size-7 shrink-0 items-center justify-center rounded-full neo-raised text-clipr-secondary transition-transform active:scale-90 hover:text-clipr-text"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
