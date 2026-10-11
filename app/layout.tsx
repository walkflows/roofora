import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/config";

// Self-hosted (SIL Open Font License, see app/fonts/): the build never downloads fonts, so it works the same on
// every machine and on Vercel, and visitors' browsers never contact Google Fonts.
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin-variable.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  // Set ROOFORA_SITE_URL (server env) to the real address once one is authorised; defaults to the existing project URL.
  metadataBase: new URL(process.env.ROOFORA_SITE_URL || "https://roofora-rose.vercel.app"),
  title: {
    default: `${SITE_NAME} | Roofing You Can Rely On`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} | Roofing You Can Rely On`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  themeColor: "#1e1e1e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col overflow-x-hidden bg-cream text-ink">
        <noscript>
          <style>{`.reveal-target, .reveal-target * { opacity: 1 !important; filter: none !important; transform: none !important; }`}</style>
        </noscript>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}
