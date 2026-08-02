"use client";

// The Atlas: the project's own map. Architecture and Features were separate
// pages that already cross-referenced each other — merging them removes a click
// without losing anything, and gives the confidence heatmap somewhere to live.

import { useState } from "react";
import Link from "next/link";
import { ArchitectureMap } from "@/components/academy/ArchitectureMap";
import { Card, Eyebrow } from "@/components/academy/ui";
import { CapabilityChip } from "@/components/academy/v2";
import { ARCH_NODES } from "@/lib/academy/architecture";
import { FEATURES } from "@/lib/academy/features";
import { CAPABILITIES } from "@/lib/academy/capabilities";
import { decisionsForArchNode } from "@/lib/academy/decisions";
import { CONFIDENCE_META } from "@/lib/academy/types";
import type { Confidence } from "@/lib/academy/types";

type Tab = "architecture" | "features" | "confidence";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  {
    id: "architecture",
    label: "Architecture",
    blurb: "The whole system on one screen. Every block is clickable.",
  },
  {
    id: "features",
    label: "Features",
    blurb: "Case studies of what shipped, and what each one taught.",
  },
  {
    id: "confidence",
    label: "Confidence heatmap",
    blurb:
      "How well I understand each component — not how good the code is. The gap between those two is the point.",
  },
];

export default function AtlasPage() {
  const [tab, setTab] = useState<Tab>("architecture");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="px-4 py-6">
      <div className="mb-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          AxonFlux Atlas
        </div>
        <h2 className="text-xl font-bold text-[#1b293e]">How does my project actually work?</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">{active.blurb}</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-[#1b293e] text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "architecture" ? <ArchitectureMap /> : null}
      {tab === "features" ? <FeaturesTab /> : null}
      {tab === "confidence" ? <ConfidenceTab /> : null}
    </div>
  );
}

function FeaturesTab() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {FEATURES.map((f) => {
        const caps = CAPABILITIES.filter((c) => c.featureId === f.id);
        return (
          <Link
            key={f.id}
            href={`/academy/features/${f.id}`}
            className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-[#1b293e] group-hover:text-[#105dff]">
                {f.title}
              </h3>
              <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-gray-400">
                {f.status}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{f.problem}</p>
            {caps.length > 0 ? (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-emerald-600">
                Capability: {caps.map((c) => c.title).join(", ")}
              </p>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Components ordered weakest-understanding first. `myConfidence` is authored in
 * architecture.ts; anything unset reads as "never assessed", which is itself
 * useful information rather than a blank.
 */
function ConfidenceTab() {
  const order: Record<Confidence | "unset", number> = {
    none: 0,
    partial: 1,
    unset: 2,
    solid: 3,
  };
  const nodes = [...ARCH_NODES].sort(
    (a, b) => order[a.myConfidence ?? "unset"] - order[b.myConfidence ?? "unset"],
  );

  return (
    <div>
      <Card className="mb-4 p-4">
        <Eyebrow>How to read this</Eyebrow>
        <p className="mt-1 text-sm text-gray-600">
          This measures <strong>my understanding</strong>, not code quality. A well-built component
          I have forgotten is red; a rough one I wrote yesterday is green. Red is where to revisit
          before touching anything nearby.
        </p>
      </Card>

      <div className="space-y-2">
        {nodes.map((n) => {
          const c = n.myConfidence;
          const meta = c ? CONFIDENCE_META[c] : null;
          const decisions = decisionsForArchNode(n.id);
          const caps = CAPABILITIES.filter((cap) => cap.archNodeIds.includes(n.id));
          return (
            <div
              key={n.id}
              className="rounded-xl border border-gray-200 bg-white p-4"
              style={meta ? { borderLeft: `4px solid ${meta.color}` } : undefined}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-[#1b293e]">{n.label}</h3>
                <span
                  className="font-mono text-[11px] uppercase tracking-wider"
                  style={{ color: meta?.color ?? "#94a3b8" }}
                >
                  {meta ? meta.label : "not assessed"}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{n.purpose}</p>
              {(caps.length > 0 || decisions.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {caps.map((cap) => (
                    <CapabilityChip
                      key={cap.id}
                      id={cap.id}
                      title={cap.title}
                      status={cap.status}
                    />
                  ))}
                  {decisions.length > 0 ? (
                    <Link
                      href="/academy/decisions"
                      className="font-mono text-[11px] uppercase tracking-wider text-gray-400 hover:text-gray-600"
                    >
                      {decisions.length} decision{decisions.length > 1 ? "s" : ""} →
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
