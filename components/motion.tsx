"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  MotionConfig,
  useInView,
  useReducedMotion,
  animate,
  type HTMLMotionProps,
} from "framer-motion";
import { fadeUp, hoverLift, pressScale, scaleIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * App-wide motion provider. `reducedMotion="user"` makes framer honor the OS
 * "reduce motion" setting WITHOUT changing the server-rendered markup, so it
 * can't cause hydration mismatches. Reduced-motion handling must live here,
 * never in per-component `initial`/`whileHover` branches (those differ between
 * server and client and break hydration).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fade + rise on mount. */
export function FadeIn({
  children,
  delay = 0,
  className,
  ...rest
}: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Scale + fade on mount (for preview/media panels). */
export function ScaleIn({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      variants={scaleIn}
      initial="hidden"
      animate="show"
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered reveal container. Children should be <StaggerItem>. Reveals when
 * scrolled into view (once). `initial` is identical on server and client
 * ("hidden"), so there's no hydration mismatch — only `animate` flips after
 * the IntersectionObserver fires on the client.
 */
export function Stagger({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
      }}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Interactive card: hover lift + press feedback. whileHover/whileTap are set
 * unconditionally (no reduced-motion branch) so server and client markup match;
 * MotionProvider neutralizes the transform for reduced-motion users.
 */
export function MotionCard({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      whileHover={hoverLift}
      whileTap={pressScale}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Page-content wrapper: fade + slide in on route mount. */
export function PageTransition({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated count-up number for stats. The render output never depends on the
 * reduced-motion value (it always renders `display`, which starts at 0 on both
 * server and client), so hydration is stable. Reduced motion only changes the
 * effect's duration to 0.
 */
export function CountUp({
  value,
  duration = 1.1,
  className,
  format = (n) => n.toLocaleString(),
}: {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: reduce ? 0 : duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(Math.round(display))}
    </span>
  );
}

/** Re-export motion + spring for ad-hoc use in pages. */
export { motion };
export { springQuick } from "@/lib/motion";
