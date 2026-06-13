import type { Variants } from "framer-motion";

/** Shared easing — a smooth "ease-out expo" curve for entrances. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Single element: fade + rise. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

/** Subtle scale-in (for media/preview panels). */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: EASE_OUT } },
};

/** Parent that staggers its children's entrance (30–50ms cadence per skill). */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

/** Child item used inside a staggerContainer. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

/** Spring used for hover lift / press feedback. */
export const springQuick = {
  type: "spring" as const,
  stiffness: 400,
  damping: 28,
};

/** Card hover lift + press. */
export const hoverLift = { y: -4, transition: springQuick };
export const pressScale = { scale: 0.97 };
