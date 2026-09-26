"use client";

import Image, { type StaticImageData } from "next/image";
import { useCallback, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";
import clsx from "clsx";

interface Props {
  before: { src: StaticImageData; alt: string };
  after: { src: StaticImageData; alt: string };
  beforeLabel?: string;
  afterLabel?: string;
  /** Overrides the default aspect-ratio/max-width classes on the outer frame. */
  frameClassName?: string;
}

const DEFAULT_FRAME = "aspect-[4/5] w-full max-w-[600px] sm:aspect-[27/34]";

// A draggable before/after comparison. Uses Pointer Events so mouse, touch
// and pen all share one code path, plus arrow-key support for keyboard users.
export function BeforeAfterSlider({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  frameClassName,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };

  const stopDragging = () => setDragging(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPosition((p) => Math.min(100, p + 5));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPosition(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setPosition(100);
    }
  };

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative touch-none select-none overflow-hidden rounded-card shadow-[0_20px_50px_rgba(0,0,0,0.35)]",
        frameClassName ?? DEFAULT_FRAME
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <Image
        src={after.src}
        alt={after.alt}
        fill
        sizes="(min-width: 1024px) 700px, (min-width: 640px) 90vw, 100vw"
        className="pointer-events-none object-cover"
      />

      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <Image
          src={before.src}
          alt={before.alt}
          fill
          sizes="(min-width: 1024px) 700px, (min-width: 640px) 90vw, 100vw"
          className="object-cover"
        />
      </div>

      <span className="on-image pointer-events-none absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white">
        {beforeLabel}
      </span>
      <span className="on-image pointer-events-none absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white">
        {afterLabel}
      </span>

      <div
        className="absolute inset-y-0 w-0.5 bg-white/90"
        style={{ left: `${position}%` }}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="Drag to compare before and after"
          aria-valuenow={Math.round(position)}
          aria-valuemin={0}
          aria-valuemax={100}
          onKeyDown={handleKeyDown}
          className={clsx(
            "absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-ink shadow-lg outline-none transition-transform focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
            dragging && "scale-110"
          )}
        >
          <MoveHorizontal size={20} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
