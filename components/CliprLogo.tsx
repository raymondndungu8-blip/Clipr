import { cn } from "@/lib/utils";

type CliprLogoProps = {
  /** Render only the scissor-C mark without the wordmark */
  markOnly?: boolean;
  /** Pixel size of the scissor-C mark */
  size?: number;
  /** Mute the mark (used in empty states) */
  muted?: boolean;
  className?: string;
};

export function CliprMark({
  size = 26,
  muted = false,
  className,
}: {
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const stroke = muted ? "var(--clipr-text-dim)" : "var(--clipr-gold)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* upper blade arc of the C */}
      <path
        d="M26 7.5A12.5 12.5 0 0 0 5 16"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* lower blade arc of the C, offset to form the cut notch */}
      <path
        d="M5 16a12.5 12.5 0 0 0 21 8.5"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* cut notch */}
      <path
        d="M24.5 12.5 28 16l-3.5 3.5"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      {/* pivot dot */}
      <circle cx="5" cy="16" r="2.4" fill={stroke} />
    </svg>
  );
}

export default function CliprLogo({
  markOnly = false,
  size = 26,
  muted = false,
  className,
}: CliprLogoProps) {
  if (markOnly) return <CliprMark size={size} muted={muted} className={className} />;

  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <CliprMark size={size} muted={muted} />
      <span className="flex flex-col leading-none">
        <span
          className="font-mono font-bold"
          style={{ fontSize: 17, color: "var(--clipr-text)" }}
        >
          Cl<span style={{ color: "var(--clipr-gold)" }}>i</span>pr
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 9, color: "var(--clipr-text-secondary)" }}
        >
          by RN Studio
        </span>
      </span>
    </span>
  );
}
