import { ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { BeforeAfterSlider } from "@/components/ui/BeforeAfterSlider";
import { WHY_CHOOSE_CARDS } from "@/lib/content";
import { images } from "@/lib/images";
import clsx from "clsx";

export function WhyChooseUs() {
  return (
    <section className="bg-surface py-20 sm:py-28">
      <div className="container-roofora">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Reveal>
              <p className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
                Why ROOFORA
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="mt-4 max-w-xl text-3xl text-ink sm:text-4xl">
                Roofing That Puts Your Peace Of Mind First.
              </h2>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-cream px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.1em] text-ink-soft">
                <ShieldCheck size={14} aria-hidden="true" className="text-accent" />
                Protecting What&apos;s Under Your Roof
              </p>
            </Reveal>
          </div>
          <Reveal delay={120} direction="left">
            <p className="max-w-sm text-ink-soft">
              The right roof starts with the right people - a team that respects your property,
              your budget and your time.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {WHY_CHOOSE_CARDS.map((card, i) => (
            <Reveal key={card.title} delay={i * 100}>
              <div
                className={clsx(
                  "h-full rounded-card p-7 transition-transform duration-300 lg:motion-safe:hover:-translate-y-1.5",
                  card.dark ? "bg-ink text-white" : "bg-cream text-ink"
                )}
              >
                <h3 className="text-lg font-bold">{card.title}</h3>
                <p
                  className={clsx(
                    "mt-3 text-sm leading-relaxed",
                    card.dark ? "text-white/70" : "text-ink-soft"
                  )}
                >
                  {card.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal delay={150}>
            <BeforeAfterSlider
              before={images.whyBefore1}
              after={images.whyAfter1}
              frameClassName="aspect-[4/3] w-full"
            />
          </Reveal>
          <Reveal delay={220}>
            <BeforeAfterSlider
              before={images.whyBefore2}
              after={images.whyAfter2}
              frameClassName="aspect-[4/3] w-full"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
