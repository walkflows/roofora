"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { PROCESS_STEPS } from "@/lib/content";
import { images } from "@/lib/images";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";

export function Process() {
  const reduceMotion = useReducedMotionSafe();

  return (
    <section id="process" className="bg-ink py-20 text-white sm:py-28">
      <div className="container-roofora">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Reveal>
              <p className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
                How We Work
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="mt-4 max-w-xl text-3xl text-white sm:text-4xl">
                Three Steps To A Roof You Can Trust.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={120} direction="left" className="max-w-sm">
            <p className="text-white/70">
              No guesswork, no surprises - just honest answers, careful work and a site left
              tidier than we found it.
            </p>
            <Button href="#contact" variant="secondary-light" className="mt-5">
              Get In Touch
            </Button>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-16">
          <ol className="grid gap-8 sm:grid-cols-3 lg:gap-6">
            {PROCESS_STEPS.map((step, i) => (
              <Reveal key={step.number} as="li" delay={i * 150}>
                <div className="group border-t-2 border-accent pt-5 transition-transform duration-300 motion-safe:hover:-translate-y-1">
                  <motion.p
                    className="font-heading text-3xl font-extrabold text-accent"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ duration: 0.5, delay: 0.15 + i * 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    {step.number}
                  </motion.p>
                  <h3 className="mt-3 text-lg text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{step.description}</p>
                </div>
              </Reveal>
            ))}
          </ol>

          <Reveal delay={250} direction="left">
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-card shadow-[0_20px_50px_rgba(0,0,0,0.35)] sm:aspect-video">
              <Image
                src={images.processPhoto.src}
                alt={images.processPhoto.alt}
                fill
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
