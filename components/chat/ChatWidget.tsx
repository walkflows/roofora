"use client";

import { MessageCircle, X, HardHat, Droplets, Phone, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CONTACT_DETAILS, TEL_HREF, WHATSAPP_HREF, SITE_NAME } from "@/lib/config";

const QUICK_OPTIONS = [
  {
    label: "Get a free estimate",
    description: "Tell us about your project",
    icon: HardHat,
    href: "#contact",
  },
  {
    label: "Report a leak",
    description: "Get prompt storm & leak help",
    icon: Droplets,
    href: "#contact",
  },
  {
    label: "Call us",
    description: CONTACT_DETAILS.phoneDisplay,
    icon: Phone,
    href: TEL_HREF,
  },
  {
    label: "Chat on WhatsApp",
    description: "Message us directly",
    icon: MessageSquareText,
    href: WHATSAPP_HREF,
    external: true,
  },
] as const;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const openPanel = useCallback(() => {
    setMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => setMounted(false), 220);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {mounted ? (
        <div
          ref={panelRef}
          id="roofora-chat-panel"
          role="dialog"
          aria-label="ROOFORA quick chat"
          tabIndex={-1}
          className={clsx(
            "flex max-h-[min(560px,calc(100dvh-8.5rem))] w-[calc(100vw-2rem)] max-w-[360px] origin-bottom-right flex-col overflow-hidden rounded-card border border-divider bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.3)] outline-none",
            "transition-[opacity,transform] duration-200 ease-out",
            open ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"
          )}
        >
          <div className="flex items-start justify-between gap-3 bg-ink px-5 py-4 text-white">
            <div>
              <p className="font-heading text-base font-bold">{SITE_NAME}</p>
              <p className="mt-0.5 text-xs text-white/70">
                Hi there! How can we help with your roof today?
              </p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close chat"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {QUICK_OPTIONS.map((option) => (
              <a
                key={option.label}
                href={option.href}
                onClick={closePanel}
                target={"external" in option && option.external ? "_blank" : undefined}
                rel={"external" in option && option.external ? "noreferrer" : undefined}
                className="group flex items-center gap-3 rounded-2xl border border-divider bg-cream/60 px-4 py-3 transition-colors hover:border-accent hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                  <option.icon size={18} aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-heading text-sm font-bold text-ink">
                    {option.label}
                  </span>
                  <span className="block text-xs text-ink-soft">{option.description}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-label={open ? "Close ROOFORA chat" : "Open ROOFORA chat"}
        aria-expanded={open}
        aria-controls="roofora-chat-panel"
        className={clsx(
          "relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_28px_rgba(255,133,55,0.45)] transition-[transform,background-color,box-shadow] duration-200 hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95",
          !open && "motion-safe:animate-chat-pulse"
        )}
      >
        <span className="relative h-6 w-6" aria-hidden="true">
          <MessageCircle
            size={24}
            className={clsx(
              "absolute inset-0 transition-[opacity,transform] duration-200",
              open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
            )}
          />
          <X
            size={24}
            className={clsx(
              "absolute inset-0 transition-[opacity,transform] duration-200",
              open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
            )}
          />
        </span>
      </button>
    </div>
  );
}
