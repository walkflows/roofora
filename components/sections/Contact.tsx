"use client";

import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Twitter } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { EnquiryForm } from "@/components/enquiry/EnquiryForm";
import {
  CONTACT_DETAILS,
  MAILTO_HREF,
  MAPS_HREF,
  SOCIAL_LINKS,
  TEL_HREF,
} from "@/lib/config";

const SOCIAL_ICONS = {
  Facebook,
  Instagram,
  LinkedIn: Linkedin,
  X: Twitter,
} as const;

export function Contact() {
  const formId = "enquiry-form";

  return (
    <section id="contact" className="bg-cream py-20 sm:py-28">
      <div className="container-roofora grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div>
          <Reveal>
            <p className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
              Get In Touch
            </p>
          </Reveal>
          <Reveal delay={70}>
            <h2 className="mt-4 text-3xl text-ink sm:text-4xl">
              Give Your Property The Roof It Deserves.
            </h2>
          </Reveal>
          <Reveal delay={130}>
            <p className="mt-4 max-w-md text-ink-soft">
              Tell us what you&apos;ve noticed or what you&apos;re planning, and we&apos;ll get
              back to you with a clear, no-pressure estimate.
            </p>
          </Reveal>

          <ul className="mt-8 space-y-4">
            {[
              { icon: Phone, href: TEL_HREF, text: CONTACT_DETAILS.phoneDisplay },
              { icon: Mail, href: MAILTO_HREF, text: CONTACT_DETAILS.email },
              { icon: MapPin, href: MAPS_HREF, text: CONTACT_DETAILS.address, external: true },
            ].map((item, i) => (
              <Reveal key={item.text} delay={180 + i * 80}>
                <a
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                  className="group flex items-center gap-3 transition-transform duration-200 motion-safe:hover:translate-x-1"
                >
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-accent shadow-sm ring-1 ring-divider transition-colors group-hover:bg-accent group-hover:text-white">
                    <item.icon size={18} aria-hidden="true" />
                  </span>
                  <span className="font-heading text-sm font-semibold text-ink sm:text-base">
                    {item.text}
                  </span>
                </a>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={420}>
            <ul className="mt-8 flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => {
                const Icon = SOCIAL_ICONS[social.platform as keyof typeof SOCIAL_ICONS];
                return (
                  <li key={social.platform}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={social.platform}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-divider text-ink-soft transition-all duration-200 hover:-translate-y-1 hover:border-accent hover:bg-accent hover:text-white hover:shadow-[0_8px_20px_rgba(255,133,55,0.35)]"
                    >
                      <Icon size={18} aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={100} direction="left">
          <div
            id={formId}
            className="scroll-mt-28 rounded-card border border-divider bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.1)] sm:p-10"
          >
            <EnquiryForm />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
