import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="container-roofora flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="font-heading text-sm font-bold uppercase tracking-[0.18em] text-accent">
        404
      </p>
      <h1 className="text-3xl sm:text-4xl">This page doesn&apos;t exist.</h1>
      <p className="max-w-md text-ink-soft">
        The page you&apos;re looking for isn&apos;t here. Head back to the homepage to find what
        you need.
      </p>
      <Button href="/" className="mt-2">
        Back to Home
      </Button>
      <Link href="/#contact" className="text-sm font-semibold text-ink underline underline-offset-4">
        Or get in touch
      </Link>
    </div>
  );
}
