import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "secondary-light";

// One shared size across the whole site: same height, padding, font size and
// corner radius for every button, on every breakpoint. Only the two
// requested styles exist (primary / secondary); secondary-light is the same
// outline style recolored for use on dark or photo backgrounds.
const base =
  "group relative isolate overflow-hidden inline-flex h-[52px] min-h-[52px] items-center justify-center gap-2 rounded-pill px-7 font-heading text-[15px] font-bold tracking-[0.01em] " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out " +
  "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-cream " +
  "disabled:pointer-events-none disabled:opacity-50 select-none w-full sm:w-auto";

// Diagonal light sweep on hover. Sits above the button's own background/text
// via z-index but ignores clicks; translate-x keeps it a transform-only
// animation, so prefers-reduced-motion (which zeroes transition-duration
// globally) is enough to make it inert without extra handling here.
const shine = (
  <span
    aria-hidden="true"
    className="pointer-events-none absolute inset-y-0 -left-1/3 z-10 w-1/3 -skew-x-12 bg-white/25 opacity-0 transition-[transform,opacity] duration-700 ease-out group-hover:translate-x-[350%] group-hover:opacity-100"
  />
);

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[0_6px_18px_rgba(255,133,55,0.35)] hover:bg-accent-dark hover:shadow-[0_10px_24px_rgba(255,133,55,0.45)]",
  secondary:
    "border-2 border-ink/15 bg-transparent text-ink hover:border-ink hover:bg-ink hover:text-white",
  "secondary-light":
    "border-2 border-white/70 bg-white/5 text-white backdrop-blur-[2px] hover:border-white hover:bg-white hover:text-ink focus-visible:ring-offset-transparent",
};

interface CommonProps {
  variant?: Variant;
  className?: string;
  children?: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof CommonProps> & {
    href: ComponentPropsWithoutRef<typeof Link>["href"];
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const { variant = "primary", className, children, ...rest } = props;
  const classes = clsx(base, variants[variant], className);

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...linkRest } = rest as Omit<ButtonAsLink, keyof CommonProps>;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {shine}
        {children}
      </Link>
    );
  }

  const buttonRest = rest as Omit<ButtonAsButton, keyof CommonProps>;
  return (
    <button className={classes} {...buttonRest}>
      {shine}
      {children}
    </button>
  );
}
