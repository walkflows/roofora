"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import clsx from "clsx";
import { Reveal } from "@/components/ui/Reveal";

interface Item {
  question: string;
  answer: string;
  defaultOpen?: boolean;
}

export function Accordion({ items }: { items: readonly Item[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(
    items.findIndex((item) => item.defaultOpen)
  );
  const baseId = useId();

  return (
    <div className="divide-y divide-divider overflow-hidden rounded-card border border-divider bg-surface">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;
        return (
          <Reveal as="div" key={item.question} delay={i * 70}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left font-heading text-base text-ink transition-colors hover:bg-cream/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-6 sm:py-6 sm:text-lg"
              >
                {item.question}
                <Plus
                  size={20}
                  aria-hidden="true"
                  className={clsx(
                    "shrink-0 text-accent transition-transform duration-300 ease-out",
                    isOpen && "rotate-45"
                  )}
                />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-[15px] leading-relaxed text-ink-soft sm:px-6 sm:pb-6">
                    {item.answer}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </Reveal>
        );
      })}
    </div>
  );
}
