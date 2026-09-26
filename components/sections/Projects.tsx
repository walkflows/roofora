"use client";

import { useState } from "react";
import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { Lightbox } from "@/components/ui/Lightbox";
import { PROJECTS } from "@/lib/content";

export function Projects() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? PROJECTS[activeIndex] : null;

  return (
    <section id="projects" className="bg-cream py-20 sm:py-28">
      <div className="container-roofora">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <p className="mx-auto inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
              Recent Work
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-4 text-3xl text-ink sm:text-4xl">Built To Protect. Built To Last.</h2>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((project, i) => (
            <Reveal key={project.id} delay={i * 90}>
              <button
                type="button"
                onClick={() => setActiveIndex(i)}
                className="group relative flex h-72 w-full flex-col justify-end overflow-hidden rounded-card text-left shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-[box-shadow,transform] duration-300 hover:shadow-[0_16px_40px_rgba(0,0,0,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:motion-safe:hover:-translate-y-1.5"
              >
                <Image
                  src={project.image.src}
                  alt={project.image.alt}
                  fill
                  sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <span className="rounded-full bg-white px-5 py-2 font-heading text-sm font-bold text-ink">
                    View Details
                  </span>
                </span>
                <div className="on-image relative z-10 p-5">
                  <p className="font-heading text-xs font-bold uppercase tracking-[0.12em] text-accent">
                    {project.tag}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-white">{project.title}</h3>
                </div>
              </button>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <div className="mt-12 flex justify-center">
            <Button href="#contact">Start Your Project</Button>
          </div>
        </Reveal>
      </div>

      <Lightbox
        open={active !== null}
        onClose={() => setActiveIndex(null)}
        image={active ? active.image : null}
        title={active ? active.title : undefined}
      />
    </section>
  );
}
