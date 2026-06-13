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
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-mono transition-colors",
                  isDone && "bg-clipr-gold text-white neo-raised-sm",
                  isActive && "neo-inset text-clipr-gold",
                  isFailed && "neo-inset text-clipr-error",
                  !isDone &&
                    !isActive &&
                    !isFailed &&
                    "neo-inset text-clipr-secondary"
                )}
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
