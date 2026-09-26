import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { Accordion } from "@/components/ui/Accordion";
import { FAQS } from "@/lib/content";
import { images } from "@/lib/images";

export function Faq() {
  return (
    <section id="faq" className="bg-surface py-20 sm:py-28">
      <div className="container-roofora grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:flex lg:h-full lg:flex-col">
          <Reveal>
            <p className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
              FAQ&apos;s
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-4 text-3xl text-ink sm:text-4xl">Ask Now. Relax Later.</h2>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-4 max-w-sm text-ink-soft">
              Straight answers to the questions we hear most, so you can plan your roofing project
              with confidence.
            </p>
          </Reveal>
          {/* lg:flex-1 makes this fill whatever height remains in the
              stretched grid row (which tracks the accordion's own height, so
              it grows/shrinks with it as items open and close); h-full on
              the inner frame then fills that space with object-cover. Below
              lg, it's a normal fixed-height block instead. */}
          <Reveal delay={190} className="mt-8 lg:flex-1 lg:min-h-0">
            <div className="relative h-56 w-full max-w-sm overflow-hidden rounded-card shadow-[0_16px_40px_rgba(0,0,0,0.12)] sm:h-72 lg:h-full lg:max-w-none">
              <Image
                src={images.faqPhoto.src}
                alt={images.faqPhoto.alt}
                fill
                sizes="(min-width: 1024px) 400px, (min-width: 640px) 480px, 100vw"
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>

        <Reveal delay={120} direction="left">
          <Accordion items={FAQS} />
        </Reveal>
      </div>
    </section>
  );
}
