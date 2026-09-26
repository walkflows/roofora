import { images } from "@/lib/images";
import { CONTACT_DETAILS } from "@/lib/config";

export type ServiceId =
  | "installation"
  | "repair"
  | "commercial"
  | "replacement"
  | "storm"
  | "inspection";

export const SERVICES: {
  id: ServiceId;
  title: string;
  description: string;
  image: (typeof images)[keyof typeof images];
}[] = [
  {
    id: "installation",
    title: "Roof Installation",
    description:
      "New roofing systems chosen for your building, your climate and the way you use the space.",
    image: images.serviceInstallation,
  },
  {
    id: "repair",
    title: "Roof Repair",
    description:
      "Targeted repairs that fix the cause of leaks and damage, not just the symptoms.",
    image: images.serviceRepair,
  },
  {
    id: "commercial",
    title: "Commercial Roofing",
    description:
      "Planned roofing work for offices, shops and warehouses, arranged around your operations.",
    image: images.serviceCommercial,
  },
  {
    id: "replacement",
    title: "Roof Replacement",
    description:
      "A complete renewal, planned step by step with a clear scope and suitable materials.",
    image: images.serviceReplacement,
  },
  {
    id: "storm",
    title: "Storm & Leak Response",
    description:
      "Prompt help assessing and securing a roof after heavy rain, wind or sudden leaks.",
    image: images.serviceStorm,
  },
  {
    id: "inspection",
    title: "Roof Inspections",
    description:
      "An honest look at your roof's condition, with straightforward recommendations.",
    image: images.serviceInspection,
  },
];

export const PROCESS_STEPS = [
  {
    number: "01",
    title: "Look & Listen",
    description:
      "We inspect the roof, hear what you've noticed and explain what we find in plain language.",
  },
  {
    number: "02",
    title: "Plan It Clearly",
    description:
      "You get a written scope, suitable material options and a straightforward estimate to decide on.",
  },
  {
    number: "03",
    title: "Build It Properly",
    description:
      "Our crew completes the agreed work with respect for your property, your schedule and your neighbours.",
  },
] as const;

export const ABOUT_HEADING = "More Than a Roof Over Your Head";

export const ABOUT_DESCRIPTION =
  "A roof you never have to worry about. Built with care. Explained in plain words. Made to last long after we've left.";

export const ABOUT_HIGHLIGHTS = [
  "Free, No-Pressure Assessments",
  "Written Scope Before Work Starts",
  "Updates Whenever Plans Change",
  "Site Cleaned Before We Leave",
] as const;

export const PROJECTS: {
  id: string;
  tag: string;
  title: string;
  image: (typeof images)[keyof typeof images];
}[] = [
  {
    id: "commercial",
    tag: "COMMERCIAL ROOFING",
    title: "Commercial Metal Roof Installation",
    image: images.projectCommercial,
  },
  {
    id: "replacement",
    tag: "ROOF REPLACEMENT",
    title: "Full Residential Roof Replacement",
    image: images.projectReplacement,
  },
  {
    id: "repair",
    tag: "ROOF REPAIR",
    title: "Leak Repair & Restoration for a Family Home",
    image: images.projectRepair,
  },
];

export const WHY_CHOOSE_CARDS = [
  {
    title: "Straight Answers",
    description:
      "You'll always know what we found, what we recommend and what it will cost before we start.",
    dark: false,
  },
  {
    title: "Work That Lasts",
    description:
      "Skilled crews and suitable materials, with attention given to every layer and every edge.",
    dark: true,
  },
  {
    title: "Respect On Site",
    description:
      "We protect your property while we work and leave the space clean when the job is done.",
    dark: false,
  },
] as const;

// Sample content only — clearly marked as placeholder in the UI. Replace
// with genuine, approved reviews before launch (see the copy doc's
// publishing checklist).
export const REVIEWS_ARE_SAMPLE = true;

export const REVIEWS = [
  {
    rating: 5,
    quote:
      "Sample review - clear estimate, tidy crew and the roof looks great. Replace with a genuine customer quote before launch.",
    name: "Sample Customer",
    role: "Homeowner",
    image: images.testimonial1,
  },
  {
    rating: 5,
    quote:
      "Sample review - good communication throughout the project and no surprises on the final invoice. Replace before launch.",
    name: "Sample Customer",
    role: "Business Owner",
    image: images.testimonial2,
  },
  {
    rating: 4,
    quote:
      "Sample review - responsive after a storm and explained the repair options clearly. Replace before launch.",
    name: "Sample Customer",
    role: "Property Manager",
    image: images.testimonial3,
  },
] as const;

export const FAQS = [
  {
    question: "How long does a roof replacement take?",
    answer:
      "Most homes take a few days, depending on roof size, access, materials and weather. You'll get an estimated timeline with your quote, and we'll update you if anything changes.",
  },
  {
    question: "Do you offer free roof assessments?",
    answer:
      "Yes. We'll take an honest look at your roof and explain its condition before you decide anything - no pressure, no obligation.",
    defaultOpen: true,
  },
  {
    question: "Can you help after storm damage?",
    answer:
      "Yes. We can assess the damage, make the roof safe where needed and give you a written report. If you plan to claim on insurance, check your insurer's process and what evidence they need.",
  },
  {
    question: "Which roofing material is right for my building?",
    answer:
      "It depends on your roof's structure, the look you want, maintenance expectations and budget. We'll walk you through suitable options and their trade-offs.",
  },
  {
    question: "Can my roof be repaired instead of replaced?",
    answer:
      "Often, yes. If the damage is limited and the rest of the roof is sound, a targeted repair is usually the better choice. We'll only recommend replacement when repairs no longer make sense.",
  },
  {
    question: "What should I do about an urgent leak?",
    answer: `Call us on ${CONTACT_DETAILS.phoneDisplay} and describe what's happening. Move valuables away from the leak, catch dripping water if you safely can, and please don't climb onto the roof yourself.`,
  },
] as const;

export const SERVICE_OPTIONS = [
  "Roof Installation",
  "Roof Repair",
  "Roof Replacement",
  "Commercial Roofing",
  "Storm & Leak Response",
  "Roof Inspections",
  "Not sure yet",
] as const;
