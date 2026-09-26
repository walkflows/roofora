import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { SERVICES } from "@/lib/content";

export function Services() {
  return (
    <section id="services" className="bg-surface py-20 sm:py-28">
      <div className="container-roofora">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Reveal>
              <p className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
                Our Services
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="mt-4 max-w-xl text-3xl text-ink sm:text-4xl">
                Every Roofing Need, Handled With Care.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={120} direction="left">
            <p className="max-w-sm text-ink-soft">
              Whether it&apos;s one loose tile or a full new roof, we explain the options clearly
              and do the work properly.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, i) => (
            <Reveal key={service.id} delay={i * 80}>
              <a
                href="#contact"
                className="group relative flex h-80 flex-col justify-end overflow-hidden rounded-card shadow-[0_10px_30px_rgba(0,0,0,0.1)] transition-[box-shadow,transform] duration-300 hover:shadow-[0_16px_40px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 lg:motion-safe:hover:-translate-y-1.5"
              >
                <Image
                  src={service.image.src}
                  alt={service.image.alt}
                  fill
                  sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="on-image relative z-10 p-6">
                  <h3 className="text-xl font-bold text-white">{service.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/85">
                    {service.description}
                  </p>
                </div>
              </a>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <div className="mt-12 flex justify-center">
            <Button href="#contact">Request an Estimate</Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
