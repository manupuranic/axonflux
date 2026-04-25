"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { fadeInUp, m } from "./motion";

type SectionProps = {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function Section({ id, eyebrow, title, description, children, className }: SectionProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 py-16 md:py-20 first:pt-8", className)}
    >
      <m.div
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mb-8 md:mb-10"
      >
        {eyebrow && (
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-blue-600 mb-2">
            {eyebrow}
          </p>
        )}
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        {description && (
          <p className="mt-3 text-base md:text-lg text-slate-600 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </m.div>
      {children}
    </section>
  );
}

export function Callout({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "warn" | "fire";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const palette = {
    info: "border-blue-200 bg-blue-50/60 text-blue-900",
    warn: "border-amber-200 bg-amber-50/70 text-amber-900",
    fire: "border-rose-200 bg-rose-50/70 text-rose-900",
  }[tone];

  const defaultIcon = { info: "💡", warn: "⚠️", fire: "🔥" }[tone];

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        palette
      )}
    >
      <span className="shrink-0 text-base leading-tight">{icon ?? defaultIcon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
