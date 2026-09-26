"use client";

import { motion } from "motion/react";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";

// Reveals a sentence word by word as it scrolls into view. The "reveal-target"
// class is forced visible by the <noscript> stylesheet in the root layout,
// so the full sentence is always readable if JavaScript never runs.
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const reduceMotion = useReducedMotionSafe();
  const words = text.split(" ");

  if (reduceMotion) {
    return <p className={className}>{text}</p>;
  }

  return (
    <p className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="reveal-target inline-block"
          initial={{ opacity: 0.12, filter: "blur(3px)" }}
          whileInView={{ opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.9 }}
          transition={{ duration: 0.4, delay: i * 0.035, ease: "easeOut" }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </p>
  );
}
