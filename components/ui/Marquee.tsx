"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import clsx from "clsx";

// Continuously moving content needs a pause control for accessibility
// (WCAG 2.2.2). Pausing also happens automatically on hover/focus.
export function Marquee({ items }: { items: readonly string[] }) {
  const [paused, setPaused] = useState(false);
  const doubled = [...items, ...items];

  return (
    <div className="relative w-full overflow-hidden">
      <div
        className={clsx(
          "flex w-max items-center gap-10 whitespace-nowrap py-1 motion-reduce:animate-none",
          !paused && "animate-marquee"
        )}
        style={{ animationPlayState: paused ? "paused" : "running" }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            aria-hidden={i >= items.length ? "true" : undefined}
            className="font-heading text-sm font-bold uppercase tracking-[0.16em] text-ink-soft sm:text-base"
          >
            {item}
            <span className="mx-10 text-accent" aria-hidden="true">
              •
            </span>
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "Play scrolling text" : "Pause scrolling text"}
        className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-cream p-2 text-ink-soft shadow-sm ring-1 ring-divider transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex"
      >
        {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
      </button>
    </div>
  );
}
