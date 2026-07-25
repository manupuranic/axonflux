"use client";

import Link from "next/link";
import type { Confidence, Difficulty, Domain, TopicStatus } from "@/lib/academy/types";
import { CONFIDENCE_META, DIFFICULTY_META, DOMAIN_META } from "@/lib/academy/types";

/** Mono uppercase eyebrow — the Academy's structural voice. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
      {children}
    </div>
  );
}

export function DomainBadge({ domain }: { domain: Domain }) {
  const m = DOMAIN_META[domain];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.bg} ${m.border} ${m.text}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

export function DifficultyBadge({ level }: { level: Difficulty }) {
  const m = DIFFICULTY_META[level];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: TopicStatus }) {
  return status === "planned" ? (
    <span className="inline-flex rounded-full border border-dashed border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-500">
      Frontier — deepens when built
    </span>
  ) : null;
}

export function ConfidenceDot({ level }: { level: Confidence }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: CONFIDENCE_META[level].color }}
      title={CONFIDENCE_META[level].label}
    />
  );
}

export function ProgressBar({ value, color = "#105dff" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${className}`}>
      {children}
    </div>
  );
}

/** Section with eyebrow heading inside a card body. */
export function LabeledSection({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function FileRefList({ files }: { files: { path: string; note: string }[] }) {
  return (
    <ul className="space-y-1.5">
      {files.map((f) => (
        <li key={f.path} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-700">
            {f.path}
          </code>
          <span className="text-gray-500">{f.note}</span>
        </li>
      ))}
    </ul>
  );
}

export function TopicChip({
  id,
  title,
  confidence,
}: {
  id: string;
  title: string;
  confidence?: Confidence;
}) {
  return (
    <Link
      href={`/academy/topics/${id}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
    >
      {confidence ? <ConfidenceDot level={confidence} /> : null}
      {title}
    </Link>
  );
}
