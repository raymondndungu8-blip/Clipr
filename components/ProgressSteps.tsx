"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ProgressStepsProps = {
  steps: string[];
  /** index of the current (in-progress) step; steps before it are done */
  current: number;
  failed?: boolean;
};

export default function ProgressSteps({
  steps,
  current,
  failed = false,
}: ProgressStepsProps) {
  return (
    <ol className="flex flex-col gap-3 md:flex-row md:items-start md:gap-2">
      {steps.map((label, i) => {
        const isDone = i < current;
        const isActive = i === current && !failed;
        const isFailed = i === current && failed;

        return (
          <li
            key={label}
            className="flex flex-1 items-center gap-3 md:flex-col md:items-center md:text-center"
          >
            <div className="flex items-center gap-3 md:flex-col md:gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-mono transition-colors",
                  isDone &&
                    "border-clipr-gold bg-clipr-gold text-[#0A0A0A]",
                  isActive && "border-clipr-gold text-clipr-gold",
                  isFailed && "border-clipr-error text-clipr-error",
                  !isDone &&
                    !isActive &&
                    !isFailed &&
                    "border-clipr-border bg-clipr-card text-clipr-secondary"
                )}
                style={
                  isActive
                    ? { boxShadow: "0 0 0 4px var(--clipr-gold-glow)" }
                    : undefined
                }
              >
                {isDone ? (
                  <Check className="size-3.5" />
                ) : isFailed ? (
                  <X className="size-3.5" />
                ) : isActive ? (
                  <span className="clipr-spinner" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "text-xs md:mt-0.5",
                  isDone || isActive
                    ? "text-clipr-text"
                    : isFailed
                      ? "text-clipr-error"
                      : "text-clipr-secondary"
                )}
              >
                {label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
