import { Marquee } from "@/components/ui/Marquee";

const ITEMS = [
  "Residential Roofing",
  "Commercial Roofing",
  "Leak Repairs",
  "Full Replacements",
  "Roof Inspections",
  "Storm Damage Assessments",
];

export function TrustMarquee() {
  return (
    <section aria-label="What we do" className="border-y border-divider bg-surface py-6">
      <div className="container-roofora">
        <Marquee items={ITEMS} />
      </div>
    </section>
  );
}
