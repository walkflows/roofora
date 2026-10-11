// Single source of truth for the ROOFORA enquiry form: field options, limits,
// wording and validation. Imported by the browser form AND the server routes,
// so client and server always apply the same rules. Keep it free of
// server-only code (no secrets, no Node APIs).

import { SERVICE_OPTIONS } from "@/lib/content";

export const CONTRACT_VERSION = 1;

export const PROPERTY_TYPES = ["Residential", "Commercial", "Other"] as const;

export const URGENCY_OPTIONS = [
  "Urgent active leak/storm damage",
  "This week",
  "This month",
  "Just researching",
] as const;
export const URGENT_VALUE = URGENCY_OPTIONS[0];

export const CONTACT_METHODS = ["Phone call", "Email"] as const;

export const URGENT_NOTICE =
  "Your enquiry will be flagged as urgent. Submitting this form does not confirm an emergency visit.";

export const PHOTO_SAFETY_NOTICE =
  "Photos can help us understand the problem. Only take photos from a safe location—do not climb onto the roof.";

// Contact permission. If this wording changes, bump the version so every
// saved enquiry records exactly which wording the customer agreed to.
export const CONSENT_WORDING =
  "I agree to be contacted about this enquiry using my preferred contact method.";
export const CONSENT_VERSION = "contact-permission-v1";

export const LIMITS = {
  fullName: 100,
  phone: 30,
  email: 200,
  town: 80,
  postcode: 12,
  details: 2000,
} as const;

export const PHOTO_RULES = {
  maxFiles: 3,
  // What the visitor may choose (before the browser shrinks the photo).
  maxOriginalBytes: 5 * 1024 * 1024,
  // What the server accepts per upload after shrinking. Kept well under
  // Vercel's 4.5 MB request limit and Airtable's 5 MB attachment limit
  // (the file travels to Airtable base64-encoded, which adds ~33%).
  maxUploadBytes: 3_500_000,
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  acceptAttr: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp",
} as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type Urgency = (typeof URGENCY_OPTIONS)[number];
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export type Service = (typeof SERVICE_OPTIONS)[number];

/** What the browser sends to /api/enquiry. */
export interface EnquiryInput {
  submissionId: string;
  fullName: string;
  phone: string;
  email: string;
  propertyType: string;
  service: string;
  town: string;
  postcode: string;
  details: string;
  urgency: string;
  preferredContact: string;
  consent: boolean;
  photoCount: number;
  website: string; // honeypot
  startedAt: number; // ms timestamp when the form was first shown
  accessCode?: string; // controlled-demo gate (checked on the server only; never forwarded)
}

export const ENQUIRY_KEYS: (keyof EnquiryInput)[] = [
  "submissionId",
  "fullName",
  "phone",
  "email",
  "propertyType",
  "service",
  "town",
  "postcode",
  "details",
  "urgency",
  "preferredContact",
  "consent",
  "photoCount",
  "website",
  "startedAt",
  "accessCode",
];

export interface CleanEnquiry {
  submissionId: string;
  fullName: string;
  phone: string;
  email: string | null;
  propertyType: PropertyType;
  service: Service;
  town: string;
  postcode: string | null;
  details: string | null;
  urgency: Urgency;
  preferredContact: "Phone" | "Email";
  photoCount: number;
}

export type FieldErrors = Partial<Record<keyof EnquiryInput | "photos", string>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Letters, digits, spaces and hyphens only; covers UK, US ZIP, EU and others.
const POSTCODE_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,10}[A-Za-z0-9]$/;

/** Collapses whitespace and strips control characters. */
export function tidy(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string") return "";
  let v = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  v = multiline ? v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : v.replace(/\s+/g, " ");
  return v.trim().slice(0, max);
}

/**
 * International phone check: optional leading +, then digits with common
 * separators; 7–15 digits in total (the E.164 maximum). No country is assumed.
 */
export function normalisePhone(raw: string): string | null {
  const v = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(v)) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (v.startsWith("+") ? "+" : "") + digits;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Customer-facing reference derived from the submission ID (no lookup needed). */
export function enquiryRefFor(submissionId: string): string {
  return "RF-" + submissionId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * Validates and cleans an enquiry. Used by the browser before sending and by
 * the server as the authority. Returns either clean data or field errors.
 */
export function validateEnquiry(
  input: Partial<Record<keyof EnquiryInput, unknown>>
): { ok: true; data: CleanEnquiry } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const fullName = tidy(input.fullName, LIMITS.fullName);
  const phoneRaw = tidy(input.phone, LIMITS.phone);
  const email = tidy(input.email, LIMITS.email).toLowerCase();
  const town = tidy(input.town, LIMITS.town);
  const postcode = tidy(input.postcode, LIMITS.postcode).toUpperCase();
  const details = tidy(input.details, LIMITS.details, true);
  const propertyType = tidy(input.propertyType, 40);
  const service = tidy(input.service, 60);
  const urgency = tidy(input.urgency, 60);
  const preferredContact = tidy(input.preferredContact, 20);
  const photoCount = typeof input.photoCount === "number" ? input.photoCount : NaN;

  if (!isUuid(input.submissionId)) errors.submissionId = "Please refresh the page and try again.";

  if (fullName.length < 2) errors.fullName = "Please enter your full name.";

  const phone = normalisePhone(phoneRaw);
  if (!phoneRaw) errors.phone = "Please enter a phone number.";
  else if (!phone) errors.phone = "Please enter a valid phone number. Include the country code (for example +44) if you are calling from abroad.";

  if (!CONTACT_METHODS.includes(preferredContact as ContactMethod)) {
    errors.preferredContact = "Please choose how you would like us to contact you.";
  }
  if (preferredContact === "Email" && !email) {
    errors.email = "Please enter your email address, as you prefer to be contacted by email.";
  } else if (email && !EMAIL_RE.test(email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!PROPERTY_TYPES.includes(propertyType as PropertyType)) {
    errors.propertyType = "Please choose a property type.";
  }
  if (!SERVICE_OPTIONS.includes(service as Service)) errors.service = "Please choose a service.";
  if (town.length < 2) errors.town = "Please enter the town or city of the property.";
  if (postcode && !POSTCODE_RE.test(postcode)) errors.postcode = "Please check the postcode.";
  if (!URGENCY_OPTIONS.includes(urgency as Urgency)) {
    errors.urgency = "Please tell us how soon you need help.";
  }
  if (input.consent !== true) {
    errors.consent = "Please confirm we may contact you about this enquiry.";
  }
  if (!Number.isInteger(photoCount) || photoCount < 0 || photoCount > PHOTO_RULES.maxFiles) {
    errors.photos = `You can add up to ${PHOTO_RULES.maxFiles} photos.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      submissionId: input.submissionId as string,
      fullName,
      phone: phone as string,
      email: email || null,
      propertyType: propertyType as PropertyType,
      service: service as Service,
      town,
      postcode: postcode || null,
      details: details || null,
      urgency: urgency as Urgency,
      preferredContact: preferredContact === "Email" ? "Email" : "Phone",
      photoCount,
    },
  };
}

/** Checks a photo the visitor picked, before any shrinking. */
export function checkPickedPhoto(file: { name: string; type: string; size: number }): string | null {
  const type = file.type.toLowerCase();
  if (!(PHOTO_RULES.acceptedTypes as readonly string[]).includes(type)) {
    return `"${file.name}" is not a JPG, PNG or WebP image.`;
  }
  if (file.size > PHOTO_RULES.maxOriginalBytes) {
    return `"${file.name}" is larger than 5 MB. Please choose a smaller photo.`;
  }
  if (file.size === 0) return `"${file.name}" appears to be empty.`;
  return null;
}
