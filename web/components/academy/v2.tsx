"use client";

// Academy V2 shared primitives. Deliberately small and additive — the V1
// components in ui.tsx are untouched and still used everywhere.

import Link from "next/link";
import type {
  CapabilityStatus,
  CivilizationId,
  KnowledgeDebt,
  RingName,
  RingProgress,
} from "@/lib/academy/types";
import {
  CAPABILITY_STATUS_META,
  CIVILIZATION_META,
  DEBT_META,
  RING_META,
  RING_ORDER,
} from "@/lib/academy/types";

export function CivBadge({ civ, size = "sm" }: { civ: CivilizationId; size?: "sm" | "xs" }) {
  const m = CIVILIZATION_META[civ];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${m.bg} ${m.border} ${m.text} ${
        size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

export function CapabilityStatusBadge({ status }: { status: CapabilityStatus }) {
  const m = CAPABILITY_STATUS_META[status];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function DebtBadge({ debt }: { debt: KnowledgeDebt }) {
  if (debt === "none") return null;
  const m = DEBT_META[debt];
  const cls =
    m.tone === "alert"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : m.tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-gray-200 bg-gray-50 text-gray-500";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
      title={m.hint}
    >
      {m.label}
    </span>
  );
}

/**
 * The five knowledge rings as a row of togglable pips. Each ring is an
 * independent claim, which is the whole point — you can have built something
 * you cannot explain, and this makes that visible instead of averaging it away.
 */
export function KnowledgeRings({
  rings,
  onToggle,
  compact = false,
}: {
  rings: RingProgress;
  onToggle?: (ring: RingName) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex gap-1" aria-label="knowledge rings">
        {RING_ORDER.map((r) => (
          <span
            key={r}
            title={`${RING_META[r].label} — ${RING_META[r].question}`}
            className={`h-2 w-2 rounded-full ${rings[r] ? "bg-emerald-500" : "bg-gray-200"}`}
          />
        ))}
      </span>
    );
  }

  return (
    <div className="space-y-1.5">
      {RING_ORDER.map((r, i) => {
        const on = rings[r];
        const Tag = onToggle ? "button" : "div";
        return (
          <Tag
            key={r}
            {...(onToggle
              ? { onClick: () => onToggle(r), type: "button" as const }
              : {})}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
              on
                ? "border-emerald-200 bg-emerald-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            } ${onToggle ? "cursor-pointer" : ""}`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                on ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {on ? "✓" : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-medium ${on ? "text-emerald-900" : "text-gray-700"}`}
              >
                {RING_META[r].label}
              </span>
              <span className="block text-xs text-gray-500">{RING_META[r].question}</span>
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/** Milestone counter — the V2 brief bans percentages; this is the replacement. */
export function Milestone({
  done,
  total,
  noun,
}: {
  done: number;
  total: number;
  noun: string;
}) {
  return (
    <span className="font-mono text-sm text-gray-600">
      <span className="font-semibold text-[#1b293e]">{done}</span>
      <span className="text-gray-400"> of </span>
      <span>{total}</span> <span className="text-gray-500">{noun}</span>
    </span>
  );
}

export function CapabilityChip({
  id,
  title,
  status,
}: {
  id: string;
  title: string;
  status?: CapabilityStatus;
}) {
  return (
    <Link
      href={`/academy/capabilities/${id}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
    >
      {status ? (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status === "built"
              ? "bg-emerald-500"
              : status === "blocked"
                ? "bg-rose-400"
                : status === "next"
                  ? "bg-orange-400"
                  : "bg-gray-300"
          }`}
        />
      ) : null}
      {title}
    </Link>
  );
}
