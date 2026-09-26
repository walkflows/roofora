"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Button } from "@/components/ui/Button";
import { images } from "@/lib/images";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";

const HIGHLIGHTS = ["Clear Written Estimates", "Careful, Tidy Crews", "Homes & Businesses"];

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const isDesktop = useIsDesktop();
  const reduceMotion = useReducedMotionSafe();
  const enableParallax = isDesktop && !reduceMotion;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const parallaxY = useTransform(scrollYProgress, [0, 1], enableParallax ? [0, 110] : [0, 0]);

  return (
    <section
      ref={sectionRef}
      id="home"
      className="relative flex min-h-[100svh] items-end overflow-hidden bg-ink"
    >
      <motion.div style={{ y: parallaxY }} className="absolute inset-x-0 -top-[8%] -bottom-[8%]">
        <Image
          src={images.hero.src}
          alt={images.hero.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />

      <div className="container-roofora relative z-10 pb-28 pt-40 sm:pb-20 md:pb-24">
        <div className="max-w-2xl">
          <motion.p
            {...fadeUp(0)}
            className="reveal-target on-image font-heading text-sm font-bold uppercase tracking-[0.2em] text-accent"
          >
            Roofing You Can Rely On
          </motion.p>

          <motion.h1
            {...fadeUp(0.1)}
            className="reveal-target on-image mt-4 text-4xl text-white sm:text-5xl lg:text-6xl"
          >
            Your Roof, Done Right. <span className="text-accent">Done Once.</span>
          </motion.h1>

          <motion.p
            {...fadeUp(0.2)}
            className="reveal-target on-image mt-5 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg"
          >
            Roof installation, repair, replacement and inspections for homes and businesses - with
            honest advice, careful crews and a clear plan before any work begins.
          </motion.p>

          <motion.div {...fadeUp(0.3)} className="reveal-target mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="#contact">Get a Free Estimate</Button>
            <Button href="#services" variant="secondary-light">
              See Our Services
            </Button>
          </motion.div>

          <motion.ul
            {...fadeUp(0.4)}
            className="reveal-target on-image mt-8 flex flex-col flex-wrap gap-x-6 gap-y-2.5 text-sm font-semibold text-white/90 sm:flex-row sm:items-center"
          >
            {HIGHLIGHTS.map((item) => (
              <li
                key={item}
                className="group flex items-center gap-2 transition-transform duration-200 motion-safe:hover:translate-x-0.5"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent transition-transform duration-200 motion-safe:group-hover:scale-125"
                />
                {item}
              </li>
            ))}
          </motion.ul>
        </div>
      </div>
    </section>
  );
}
