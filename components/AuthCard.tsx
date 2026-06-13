"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { CliprMark } from "@/components/CliprLogo";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Centered auth shell: ambient indigo glow behind a soft neumorphic card,
 * topped by the Clipr mark in an inset icon well + wordmark.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-6 py-12">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-clipr-gold/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 translate-x-1/3 rounded-full bg-clipr-tertiary/15 blur-3xl" />
        <div className="absolute bottom-10 left-0 h-56 w-56 -translate-x-1/3 rounded-full bg-clipr-gold-soft/15 blur-3xl" />
      </div>

      <div className="animate-fade-up relative w-full max-w-sm rounded-3xl bg-clipr-card neo-raised p-8">
        <div className="mb-6 flex flex-col items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl neo-inset">
            <CliprMark size={32} />
          </div>
          <div className="flex flex-col items-center leading-none">
            <span
              className="font-mono text-lg font-bold text-clipr-text"
              style={{ letterSpacing: "-0.01em" }}
            >
              Cl<span className="text-clipr-gold">i</span>pr
            </span>
            <span className="mt-1 text-[10px] text-clipr-secondary">
              by RN Studio
            </span>
          </div>
        </div>

        <h1 className="text-center text-2xl font-semibold text-clipr-text">
          {title}
        </h1>
        <p className="mt-1 mb-6 text-center text-sm text-clipr-secondary">
          {subtitle}
        </p>

        {children}

        <div className="mt-6 text-center text-sm text-clipr-secondary">
          {footer}
        </div>
      </div>
    </div>
  );
}

/** Inset field with a leading icon and (for passwords) a show/hide toggle. */
export function IconInput({
  icon: Icon,
  type = "text",
  className,
  ...props
}: React.ComponentProps<"input"> & { icon: LucideIcon }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-clipr-dim" />
      <Input
        type={resolvedType}
        className={cn("pl-10", isPassword && "pr-10", className)}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-clipr-dim transition-colors hover:text-clipr-gold"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
}
