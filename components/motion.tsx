"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  animate,
  type HTMLMotionProps,
} from "framer-motion";
import {
  fadeUp,
  hoverLift,
  pressScale,
  scaleIn,
  springQuick,
  staggerContainer,
  staggerItem,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Fade + rise on mount. Optional delay for hand-placed sequencing. */
export function FadeIn({
  children,
  delay = 0,
  className,
  ...rest
}: HTMLMotionProps<"div"> & { delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial={reduce ? false : "hidden"}
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
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={scaleIn}
      initial={reduce ? false : "hidden"}
      animate="show"
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered reveal container. Children should be <StaggerItem>. Reveals when
 * scrolled into view (once), so long pages animate section by section.
 */
export function Stagger({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={staggerContainer}
      initial={reduce ? false : "hidden"}
      animate={reduce || inView ? "show" : "hidden"}
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
    <motion.div className={className} variants={staggerItem} {...rest}>
      {children}
    </motion.div>
  );
}

/** Interactive card: hover lift + press feedback (transform/opacity only). */
export function MotionCard({
  children,
  className,
  interactive = true,
  ...rest
}: HTMLMotionProps<"div"> & { interactive?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      whileHover={interactive && !reduce ? hoverLift : undefined}
      whileTap={interactive && !reduce ? pressScale : undefined}
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
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Animated count-up number for stats. Respects reduced motion. */
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
    if (reduce || !inView) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  // When reduced motion is on, render the final value directly (no animation).
  const shown = reduce ? value : display;

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(Math.round(shown))}
    </span>
  );
}

/** Re-export motion for ad-hoc use in pages. */
export { motion, springQuick };
