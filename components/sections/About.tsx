import { ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { WordReveal } from "@/components/ui/WordReveal";
import { VerticalImageSlider } from "@/components/ui/VerticalImageSlider";
import { Button } from "@/components/ui/Button";
import { images } from "@/lib/images";
import { ABOUT_DESCRIPTION, ABOUT_HEADING, ABOUT_HIGHLIGHTS } from "@/lib/content";

const ABOUT_SLIDES = [images.about1, images.about2];

export function About() {
  return (
    <section id="about" className="bg-cream py-20 sm:py-28">
      <div className="container-roofora grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <Reveal direction="right" className="lg:self-stretch">
          <VerticalImageSlider
            slides={ABOUT_SLIDES}
            className="aspect-[4/3] sm:aspect-[4/5] lg:aspect-auto lg:h-full lg:min-h-[420px]"
          />
        </Reveal>

        <div>
          <Reveal>
            <p className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
              About ROOFORA
            </p>
          </Reveal>

          <Reveal delay={70}>
            <h2 className="mt-5 text-3xl text-ink sm:text-4xl">{ABOUT_HEADING}</h2>
          </Reveal>

          <div className="mt-4">
            <WordReveal
              text={ABOUT_DESCRIPTION}
              className="text-base leading-relaxed text-ink-soft sm:text-lg"
            />
          </div>

          <ul className="mt-8 divide-y divide-divider overflow-hidden rounded-card border border-divider bg-surface">
            {ABOUT_HIGHLIGHTS.map((item, i) => (
              <Reveal key={item} as="li" delay={i * 90}>
                <div className="group flex items-center gap-3 px-5 py-4 transition-colors duration-200 hover:bg-cream/60">
                  <ShieldCheck
                    size={18}
                    aria-hidden="true"
                    className="shrink-0 text-accent transition-transform duration-200 group-hover:scale-110"
                  />
                  <span className="font-heading text-sm font-semibold text-ink transition-transform duration-200 sm:text-base group-hover:translate-x-1">
                    {item}
                  </span>
                </div>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={200}>
            <Button href="#process" className="mt-8">
              More About Us
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
