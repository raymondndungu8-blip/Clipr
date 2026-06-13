"use client";

import { cn } from "@/lib/utils";

export type Platform = "TikTok" | "Instagram" | "YouTube" | "Facebook";

export const PLATFORMS: Platform[] = [
  "TikTok",
  "Instagram",
  "YouTube",
  "Facebook",
];

/** Brand colors per platform (hex). */
export const PLATFORM_COLORS: Record<Platform, string> = {
  TikTok: "#69C9D0",
  Instagram: "#E1306C",
  YouTube: "#FF3B30",
  Facebook: "#1877F2",
};

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

type PlatformPillProps = {
  platform: Platform;
  active: boolean;
  onToggle: (platform: Platform) => void;
  disabled?: boolean;
};

export default function PlatformPill({
  platform,
  active,
  onToggle,
  disabled,
}: PlatformPillProps) {
  const color = PLATFORM_COLORS[platform];
  const rgb = hexToRgb(color);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(platform)}
      aria-pressed={active}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 active:scale-95 disabled:opacity-50",
        active
          ? "neo-inset"
          : "bg-clipr-card neo-raised-sm text-clipr-secondary hover:text-clipr-text"
      )}
      style={
        active
          ? {
              backgroundColor: `rgba(${rgb}, 0.12)`,
              color,
            }
          : undefined
      }
    >
      {platform}
    </button>
  );
}
