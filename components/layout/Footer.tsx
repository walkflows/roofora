import Image from "next/image";
import { Facebook, Instagram, Linkedin, Twitter, Mail, Phone, MapPin } from "lucide-react";
import {
  CONTACT_DETAILS,
  MAILTO_HREF,
  MAPS_HREF,
  NAV_LINKS,
  SOCIAL_LINKS,
  TEL_HREF,
  TAGLINE,
} from "@/lib/config";
import { images } from "@/lib/images";
import { Reveal } from "@/components/ui/Reveal";

const SOCIAL_ICONS = {
  Facebook,
  Instagram,
  LinkedIn: Linkedin,
  X: Twitter,
} as const;

const SERVICE_LINKS = ["Roof Installation", "Roof Repair", "Roof Replacement", "Commercial Roofing"];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink text-white">
      <div className="container-roofora relative z-10 grid gap-12 py-16 sm:py-20 md:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <Image src={images.logoWhite.src} alt={images.logoWhite.alt} className="h-9 w-auto" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">{TAGLINE}</p>
          <ul className="mt-6 flex items-center gap-3">
            {SOCIAL_LINKS.map((social, i) => {
              const Icon = SOCIAL_ICONS[social.platform as keyof typeof SOCIAL_ICONS];
              return (
                <Reveal as="li" key={social.platform} delay={i * 60}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={social.platform}
                    className="group inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/80 transition-all duration-200 hover:-translate-y-1 hover:border-accent hover:bg-accent hover:text-white hover:shadow-[0_8px_20px_rgba(255,133,55,0.4)]"
                  >
                    <Icon size={18} aria-hidden="true" />
                  </a>
                </Reveal>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-white/50">
            Quick Links
          </p>
          <ul className="mt-4 space-y-3">
            {NAV_LINKS.map((link, i) => (
              <Reveal as="li" key={link.href} delay={i * 60}>
                <a
                  href={link.href}
                  className="group inline-flex items-center gap-2 text-sm text-white/80 transition-all duration-200 hover:translate-x-1 hover:text-accent"
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  {link.label}
                </a>
              </Reveal>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-white/50">
            Services
          </p>
          <ul className="mt-4 space-y-3">
            {SERVICE_LINKS.map((label, i) => (
              <Reveal as="li" key={label} delay={i * 60}>
                <a
                  href="#services"
                  className="group inline-flex items-center gap-2 text-sm text-white/80 transition-all duration-200 hover:translate-x-1 hover:text-accent"
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  {label}
                </a>
              </Reveal>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-white/50">
            Contact Us
          </p>
          <ul className="mt-4 space-y-3 text-sm text-white/80">
            {[
              { href: MAILTO_HREF, icon: Mail, text: CONTACT_DETAILS.email },
              { href: TEL_HREF, icon: Phone, text: CONTACT_DETAILS.phoneDisplay },
              { href: MAPS_HREF, icon: MapPin, text: CONTACT_DETAILS.address, external: true },
            ].map((item, i) => (
              <Reveal as="li" key={item.text} delay={i * 60}>
                <a
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                  className="inline-flex items-start gap-2 transition-transform duration-200 hover:translate-x-1 hover:text-accent"
                >
                  <item.icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                  <span>{item.text}</span>
                </a>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>

      <div className="container-roofora relative z-10 flex justify-center pb-8 pt-4 sm:pb-12">
        <a
          href="#home"
          aria-label="ROOFORA home"
          className="inline-flex w-full max-w-md transition-opacity duration-200 hover:opacity-75 sm:max-w-xl lg:max-w-3xl"
        >
          <Image
            src={images.logoWhite.src}
            alt={images.logoWhite.alt}
            className="h-auto w-full"
          />
        </a>
      </div>

      <div className="relative z-10 border-t border-white/10 bg-ink">
        <div className="container-roofora flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/55 sm:flex-row">
          <p>© {new Date().getFullYear()} ROOFORA. All rights reserved.</p>
          <div className="flex items-center gap-5">
            {/* No standalone policy pages exist yet in this single-page
                build — shown as plain text rather than a dead link. */}
            <span>Privacy Policy</span>
            <span>Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
