"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, Phone } from "lucide-react";
import clsx from "clsx";
import { NAV_LINKS, CONTACT_DETAILS, TEL_HREF } from "@/lib/config";
import { images } from "@/lib/images";
import { Button } from "@/components/ui/Button";
import { MobileMenu } from "@/components/layout/MobileMenu";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeHref, setActiveHref] = useState<string>("");

  useEffect(() => {
    const sections = NAV_LINKS.map((link) => document.querySelector<HTMLElement>(link.href)).filter(
      (el): el is HTMLElement => el !== null
    );

    const onScroll = () => {
      setScrolled(window.scrollY > 32);

      // Whichever tracked section's top has most recently passed just below
      // the fixed header is "active" - simple, deterministic scrollspy that
      // doesn't depend on how tall each section is.
      const triggerLine = 140;
      let current = "";
      for (const section of sections) {
        if (section.getBoundingClientRect().top - triggerLine <= 0) {
          current = `#${section.id}`;
        }
      }
      setActiveHref(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={clsx(
          "fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300",
          scrolled
            ? "bg-cream/95 shadow-[0_4px_24px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-cream/85"
            : "bg-transparent"
        )}
      >
        <div className="container-roofora flex h-20 items-center justify-between gap-4">
          <a href="#home" aria-label="ROOFORA home" className="shrink-0">
            <Image
              src={scrolled ? images.logoBlack.src : images.logoWhite.src}
              alt={images.logoBlack.alt}
              className="h-8 w-auto sm:h-9"
              priority
            />
          </a>

          <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => {
              const isActive = activeHref === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "true" : undefined}
                  className={clsx(
                    "relative py-1 font-heading text-[15px] font-semibold transition-colors after:absolute after:-bottom-0.5 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:rounded-full after:bg-accent after:transition-transform after:duration-300 after:ease-out hover:text-accent hover:after:scale-x-100",
                    isActive && "text-accent after:scale-x-100",
                    !isActive && (scrolled ? "text-ink" : "on-image text-white")
                  )}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={TEL_HREF}
              className={clsx(
                "hidden items-center gap-2 font-heading text-sm font-bold transition-colors hover:text-accent lg:inline-flex",
                scrolled ? "text-ink" : "on-image text-white"
              )}
            >
              <Phone size={16} aria-hidden="true" />
              Call Us: {CONTACT_DETAILS.phoneDisplay}
            </a>

            <Button
              href="#contact"
              variant={scrolled ? "primary" : "secondary-light"}
              className="hidden w-auto! sm:inline-flex"
            >
              Get an Estimate
            </Button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              className={clsx(
                "inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors md:hidden",
                scrolled ? "text-ink hover:bg-ink/5" : "text-white hover:bg-white/10"
              )}
            >
              <Menu size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
