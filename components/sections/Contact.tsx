"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Facebook, Instagram, Linkedin, Loader2, Mail, MapPin, Phone, Twitter } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import {
  CONTACT_DETAILS,
  MAILTO_HREF,
  MAPS_HREF,
  SOCIAL_LINKS,
  TEL_HREF,
} from "@/lib/config";
import { SERVICE_OPTIONS } from "@/lib/content";

const SOCIAL_ICONS = {
  Facebook,
  Instagram,
  LinkedIn: Linkedin,
  X: Twitter,
} as const;

const PROPERTY_TYPES = ["Residential", "Commercial", "Other"] as const;

type Status = "idle" | "submitting" | "success" | "error";

interface FieldErrors {
  [key: string]: string;
}

export function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formId = "enquiry-form";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      propertyType: String(formData.get("propertyType") ?? ""),
      service: String(formData.get("service") ?? ""),
      location: String(formData.get("location") ?? "").trim(),
      details: String(formData.get("details") ?? "").trim(),
      website: String(formData.get("website") ?? ""), // honeypot
    };

    setStatus("submitting");
    setErrorMessage("");
    setFieldErrors({});

    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setFieldErrors(data.fields ?? {});
        setErrorMessage(
          data.error ??
            `Something went wrong and your enquiry wasn't sent. Please try again, or call us on ${CONTACT_DETAILS.phoneDisplay}.`
        );
        return;
      }

      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
      setErrorMessage(
        `Something went wrong and your enquiry wasn't sent. Please try again, or call us on ${CONTACT_DETAILS.phoneDisplay}.`
      );
    }
  }

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
            {status === "success" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CheckCircle2 size={40} aria-hidden="true" className="text-accent" />
                <p className="max-w-sm text-lg font-semibold text-ink">
                  Thanks for getting in touch. Your enquiry has been received. We&apos;ll contact
                  you by email to discuss the next step.
                </p>
                <Button variant="secondary" onClick={() => setStatus("idle")} className="mt-2">
                  Send another enquiry
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                {/* Honeypot field — visually hidden so only bots that fill in
                    every field (including ones no human can see) trip it. */}
                <div className="visually-hidden">
                  <label htmlFor="website">Leave this field empty</label>
                  <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="name" required error={fieldErrors.name}>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      maxLength={100}
                      placeholder="Your name"
                      autoComplete="name"
                      className="input-field"
                    />
                  </Field>

                  <Field label="Phone number" htmlFor="phone" required error={fieldErrors.phone}>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      required
                      maxLength={30}
                      placeholder="Best number to reach you"
                      autoComplete="tel"
                      className="input-field"
                    />
                  </Field>

                  <Field label="Email address" htmlFor="email" error={fieldErrors.email}>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      maxLength={200}
                      placeholder="Your email (optional)"
                      autoComplete="email"
                      className="input-field"
                    />
                  </Field>

                  <Field label="Property type" htmlFor="propertyType" required error={fieldErrors.propertyType}>
                    <select id="propertyType" name="propertyType" required defaultValue="" className="input-field">
                      <option value="" disabled>
                        Choose one
                      </option>
                      {PROPERTY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Service needed" htmlFor="service" required error={fieldErrors.service}>
                    <select id="service" name="service" required defaultValue="" className="input-field">
                      <option value="" disabled>
                        Choose one
                      </option>
                      {SERVICE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Property location" htmlFor="location" required error={fieldErrors.location}>
                    <input
                      id="location"
                      name="location"
                      type="text"
                      required
                      maxLength={120}
                      placeholder="Area or town"
                      autoComplete="address-level2"
                      className="input-field"
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Tell us about your roof" htmlFor="details">
                      <textarea
                        id="details"
                        name="details"
                        rows={4}
                        maxLength={2000}
                        placeholder="What have you noticed, or what would you like done?"
                        className="input-field resize-none"
                      />
                    </Field>
                  </div>
                </div>

                {status === "error" ? (
                  <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </p>
                ) : null}

                <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="submit" disabled={status === "submitting"} className="sm:w-auto">
                    {status === "submitting" ? (
                      <>
                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                        Sending…
                      </>
                    ) : (
                      "Send My Enquiry"
                    )}
                  </Button>
                  <p className="text-xs leading-relaxed text-ink-soft">
                    We&apos;ll only use your details to respond to your enquiry.{" "}
                    <a href={TEL_HREF} className="font-semibold text-ink underline underline-offset-2">
                      Prefer to call? {CONTACT_DETAILS.phoneDisplay}
                    </a>
                  </p>
                </div>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
