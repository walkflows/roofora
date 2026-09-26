// Central place for every contact detail, nav link and social link used across
// the site (header, footer, contact section, chat widget). Replace the
// [PLACEHOLDER] values with ROOFORA's real details before launch — nothing
// else in the codebase needs to change.

export const SITE_NAME = "ROOFORA";

export const TAGLINE = "Take the steps. Build the flow.";

export const SITE_DESCRIPTION =
  "ROOFORA provides roof installation, repair, replacement and inspections for homes and businesses - with honest advice, careful crews and a clear plan before any work begins.";

export const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#projects", label: "Projects" },
  { href: "#contact", label: "Contact" },
] as const;

export const CONTACT_DETAILS = {
  email: "info@roofora.example.com",
  phone: "+1 (555) 010-1234",
  phoneDisplay: "+1 (555) 010-1234",
  whatsapp: "+15550101234",
  whatsappDisplay: "+1 (555) 010-1234",
  address: "1234 Example Street, Springfield, ST 00000",
} as const;

// Placeholder flags — set to true once each detail above has been replaced
// with a confirmed, real value. Used only to keep a single "is this real
// yet" signal in one place; does not change any rendered copy.
export const CONTACT_DETAILS_ARE_PLACEHOLDERS = true;

export const SOCIAL_LINKS = [
  { platform: "Facebook", href: "https://facebook.com/" },
  { platform: "Instagram", href: "https://instagram.com/" },
  { platform: "LinkedIn", href: "https://linkedin.com/" },
  { platform: "X", href: "https://x.com/" },
] as const;

export const MAPS_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  CONTACT_DETAILS.address
)}`;

export const TEL_HREF = `tel:${CONTACT_DETAILS.phone.replace(/[^+\d]/g, "")}`;
export const MAILTO_HREF = `mailto:${CONTACT_DETAILS.email}`;
export const WHATSAPP_HREF = `https://wa.me/${CONTACT_DETAILS.whatsapp.replace(/[^\d]/g, "")}`;
