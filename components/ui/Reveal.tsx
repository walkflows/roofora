"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";

type Direction = "up" | "left" | "right" | "none";

// Fades/slides content in once it scrolls into view. Falls back to fully
// visible content if JavaScript never runs: the "reveal-target" class is
// forced to opacity:1 by a <noscript> stylesheet in the root layout, so a
// no-JS visitor always sees the real content, never a permanently hidden
// section.
export function Reveal({
  children,
  delay = 0,
  direction = "up",
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  direction?: Direction;
  className?: string;
  as?: "div" | "li";
}) {
  const reduceMotion = useReducedMotionSafe();
  const offset =
    direction === "up"
      ? { y: 28 }
      : direction === "left"
        ? { x: -28 }
        : direction === "right"
          ? { x: 28 }
          : {};

  const Component = motion[as];

  // If reduced motion turns out to be preferred, it's only known after mount
  // (see useReducedMotionSafe) — by then this element may already be mounted
  // hidden, below the fold, with nothing left to trigger whileInView. Forcing
  // `animate` to the visible state here corrects that immediately instead of
  // leaving it stuck at opacity 0.
  return (
    <Component
      className={clsx("reveal-target", className)}
      initial={reduceMotion ? false : { opacity: 0, ...offset }}
      whileInView={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
      animate={reduceMotion ? { opacity: 1, x: 0, y: 0 } : undefined}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduceMotion ? 0.2 : 0.6, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  );
}
