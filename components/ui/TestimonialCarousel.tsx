"use client";

import { useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import clsx from "clsx";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";

interface Review {
  rating: number;
  quote: string;
  name: string;
  role: string;
  image: { src: StaticImageData; alt: string };
}

export function TestimonialCarousel({ reviews }: { reviews: readonly Review[] }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduceMotion = useReducedMotionSafe();

  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex((next + reviews.length) % reviews.length);
  };

  const current = reviews[index];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative overflow-hidden rounded-card border border-divider bg-surface shadow-sm">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            initial={reduceMotion ? undefined : { opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            drag={reduceMotion ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(index + 1);
              else if (info.offset.x > 60) go(index - 1);
            }}
            className="flex cursor-grab flex-col active:cursor-grabbing sm:flex-row"
          >
            <div className="relative h-44 w-full shrink-0 sm:h-auto sm:w-56">
              <Image
                src={current.image.src}
                alt={current.image.alt}
                fill
                sizes="(min-width: 640px) 224px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-8 sm:p-10">
              <div className="flex gap-1 text-accent" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={18}
                    fill={i < current.rating ? "currentColor" : "none"}
                    strokeWidth={i < current.rating ? 0 : 1.5}
                  />
                ))}
              </div>
              <p className="sr-only">{current.rating} out of 5 stars.</p>
              <blockquote className="mt-4 font-heading text-lg text-ink sm:text-xl">
                &ldquo;{current.quote}&rdquo;
              </blockquote>
              <p className="mt-6 font-heading text-sm font-bold text-ink">{current.name}</p>
              <p className="text-sm text-ink-soft">{current.role}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => go(index - 1)}
          aria-label="Previous review"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-divider bg-surface text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2" role="tablist" aria-label="Choose a review">
          {reviews.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show review ${i + 1} of ${reviews.length}`}
              onClick={() => go(i)}
              className={clsx(
                "h-2.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                i === index ? "w-6 bg-accent" : "w-2.5 bg-ink/20 hover:bg-ink/35"
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(index + 1)}
          aria-label="Next review"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-divider bg-surface text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
