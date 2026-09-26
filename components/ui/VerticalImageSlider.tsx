"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";

interface Slide {
  src: StaticImageData;
  alt: string;
}

// Auto-advancing vertical slide reveal: each image slides up and over the
// last, looping continuously. Pauses on hover/focus, and offers an explicit
// pause control too since touch devices have no hover (WCAG 2.2.2).
export function VerticalImageSlider({
  slides,
  intervalMs = 3400,
  className,
}: {
  slides: readonly Slide[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotionSafe();
  const autoplay = !paused && !reduceMotion && slides.length > 1;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autoplay, intervalMs, slides.length]);

  return (
    <div
      className={clsx(
        "relative w-full overflow-hidden rounded-card shadow-[0_20px_50px_rgba(0,0,0,0.15)]",
        className ?? "aspect-[4/3] sm:aspect-[4/5]"
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={index}
          initial={reduceMotion ? false : { y: "100%" }}
          animate={{ y: "0%" }}
          exit={reduceMotion ? undefined : { y: "-100%" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <Image
            src={slides[index].src}
            alt={slides[index].alt}
            fill
            priority={index === 0}
            sizes="(min-width: 1024px) 560px, 100vw"
            className="object-cover"
          />
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 ? (
        <>
          <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
            {slides.map((_, i) => (
              <span
                key={i}
                className={clsx(
                  "h-1.5 w-1.5 rounded-full transition-colors duration-300",
                  i === index ? "bg-accent" : "bg-white/50"
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? "Play image slideshow" : "Pause image slideshow"}
            className="absolute left-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          </button>
        </>
      ) : null}
    </div>
  );
}
