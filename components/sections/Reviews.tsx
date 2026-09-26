import { Reveal } from "@/components/ui/Reveal";
import { TestimonialCarousel } from "@/components/ui/TestimonialCarousel";
import { REVIEWS, REVIEWS_ARE_SAMPLE } from "@/lib/content";

export function Reviews() {
  return (
    <section id="reviews" className="bg-cream-soft py-20 sm:py-28">
      <div className="container-roofora">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <p className="mx-auto inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
              Testimonials
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-4 text-3xl text-ink sm:text-4xl">Roofs Worth Recommending.</h2>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <div className="mt-12">
            <TestimonialCarousel reviews={REVIEWS} />
          </div>
        </Reveal>

        {REVIEWS_ARE_SAMPLE ? (
          <p className="mx-auto mt-6 max-w-md text-center text-xs text-ink-soft">
            These are sample placeholder reviews for design purposes only. Replace with genuine,
            approved customer feedback before launch.
          </p>
        ) : null}
      </div>
    </section>
  );
}
