import type { MetadataRoute } from "next";

// Indexing stays off (see robots metadata in layout.tsx) until the real
// domain, business details and policies are confirmed for launch.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
