// Central image manifest. Every photo used on the page is imported once here
// with its alt text, so swapping a photo later means changing one line in
// this file rather than hunting through components.
//
// Static imports let next/image read each file's real dimensions at build
// time (no layout shift) and automatically serve resized AVIF/WebP variants.

import heroPhoto from "@/public/images/hero-photo.png";
import about1 from "@/public/images/about-1.png";
import about2 from "@/public/images/about-2.png";
import serviceInstallation from "@/public/images/service-installation.png";
import serviceRepair from "@/public/images/service-repair.jpg";
import serviceCommercial from "@/public/images/service-commercial.png";
import serviceReplacement from "@/public/images/service-replacement.png";
import serviceStorm from "@/public/images/service-storm.png";
import serviceInspection from "@/public/images/service-inspection.png";
import processPhoto from "@/public/images/process-photo.png";
import faqPhoto from "@/public/images/faq-photo.jpg";
import whyBefore1 from "@/public/images/why-before-1.png";
import whyAfter1 from "@/public/images/why-after-1.png";
import whyBefore2 from "@/public/images/why-before-2.png";
import whyAfter2 from "@/public/images/why-after-2.png";
import projectCommercial from "@/public/images/project-commercial.png";
import projectReplacement from "@/public/images/project-replacement.webp";
import projectRepair from "@/public/images/project-repair.png";
import testimonial1 from "@/public/images/testimonial-1.png";
import testimonial2 from "@/public/images/testimonial-2.png";
import testimonial3 from "@/public/images/testimonial-3.png";
import logoWhite from "@/public/images/logo-white.png";
import logoBlack from "@/public/images/logo-black.png";

export const images = {
  hero: {
    src: heroPhoto,
    alt: "Roofer securing new shingles along a steep roofline against a blue sky",
  },
  about1: {
    src: about1,
    alt: "Aerial view of a home with a clean dark standing-seam roof at dusk",
  },
  about2: {
    src: about2,
    alt: "Home with a well-maintained Spanish tile roof",
  },
  serviceInstallation: {
    src: serviceInstallation,
    alt: "Newly installed cedar shake roof on a home surrounded by trees",
  },
  serviceRepair: {
    src: serviceRepair,
    alt: "Two roofers working together to repair shingles on a roof",
  },
  serviceCommercial: {
    src: serviceCommercial,
    alt: "Standing-seam commercial metal roof fitted with solar panels",
  },
  serviceReplacement: {
    src: serviceReplacement,
    alt: "Home with a freshly completed dark shingle roof replacement",
  },
  serviceStorm: {
    src: serviceStorm,
    alt: "Close-up of storm-damaged shingles with exposed roof decking",
  },
  serviceInspection: {
    src: serviceInspection,
    alt: "Clean, well-maintained shingle roof viewed from below the ridge",
  },
  processPhoto: {
    src: processPhoto,
    alt: "Aerial view of a home with a clean black metal roof",
  },
  faqPhoto: {
    src: faqPhoto,
    alt: "Close-up of a terracotta tile roof with dormer windows",
  },
  whyBefore1: {
    src: whyBefore1,
    alt: "Aging, moss-covered roof before ROOFORA's replacement work",
  },
  whyAfter1: {
    src: whyAfter1,
    alt: "Same home with a clean new roof after ROOFORA's replacement work",
  },
  whyBefore2: {
    src: whyBefore2,
    alt: "Home with visible storm damage and missing shingles before repair",
  },
  whyAfter2: {
    src: whyAfter2,
    alt: "Same home with a fully restored roof after ROOFORA's repair",
  },
  projectCommercial: {
    src: projectCommercial,
    alt: "Commercial standing-seam metal roof installation",
  },
  projectReplacement: {
    src: projectReplacement,
    alt: "Aerial view of a residential home with a completed full roof replacement",
  },
  projectRepair: {
    src: projectRepair,
    alt: "Aerial view of a suburban home roof after a completed repair",
  },
  testimonial1: {
    src: testimonial1,
    alt: "Completed roofing project with a dark shingle roof",
  },
  testimonial2: {
    src: testimonial2,
    alt: "Completed roofing project on a large residential home",
  },
  testimonial3: {
    src: testimonial3,
    alt: "Close-up of a completed cedar shake roof detail",
  },
  logoWhite: {
    src: logoWhite,
    alt: "ROOFORA logo",
  },
  logoBlack: {
    src: logoBlack,
    alt: "ROOFORA logo",
  },
} as const;
