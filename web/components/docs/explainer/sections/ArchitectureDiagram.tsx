"use client";

import { useState } from "react";
import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";
import { cn } from "@/lib/utils";

type LayerKey = "csv" | "raw" | "derived" | "app" | "api";

const LAYER_INFO: Record<LayerKey, { title: string; rule: string; node: string }> = {
  csv: {
    title: "CSV / XLS exports",
    rule: "Source files. Manual export from billing software. SHA-256 hashed.",
    node: "from-slate-100 to-slate-50 border-slate-300",
  },
  raw: {
    title: "raw.*",
    rule: "Append-only. Never UPDATE or DELETE. Every row carries import_batch_id + source_file_name.",
    node: "from-amber-100 to-amber-50 border-amber-300",
  },
  derived: {
    title: "derived.*",
    rule: "Truncated and rebuilt every pipeline run. Pure function of raw + app. Idempotent.",
    node: "from-emerald-100 to-emerald-50 border-emerald-300",
  },
  app: {
    title: "app.*",
    rule: "Human-authored data — canonical names, aliases, cash counts, pamphlets. Migrated by Alembic. Survives rebuilds.",
    node: "from-blue-100 to-blue-50 border-blue-300",
  },
  api: {
    title: "API + UI",
    rule: "FastAPI reads derived with raw SQL, joins app for overrides. Next.js dashboard.",
    node: "from-slate-200 to-slate-100 border-slate-400",
  },
};

export function ArchitectureDiagram() {
  const [active, setActive] = useState<LayerKey | null>(null);

  return (
    <Section
      id="architecture"
      eyebrow="High-level architecture"
      title="Three immutable layers, one Postgres"
      description="A stripped-down medallion architecture, adapted for single-store retail. Hover any layer to see its rule."
    >
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 md:p-10">
        {/* Main flow row: 4 nodes + 3 horizontal arrows between them */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-x-2 gap-y-3">
          <DiagramNode layer="csv" active={active} setActive={setActive} subLabel="files" />
          <ArrowRight delay={0} />
          <DiagramNode layer="raw" active={active} setActive={setActive} subLabel="append-only" />
          <ArrowRight delay={0.15} />
          <DiagramNode layer="derived" active={active} setActive={setActive} subLabel="rebuildable" />
          <ArrowRight delay={0.3} />
          <DiagramNode layer="api" active={active} setActive={setActive} subLabel="FastAPI + Next" />
        </div>

        {/* App row: same column structure, but only column 5 (under derived) is filled */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-start gap-x-2 mt-3">
          <div /><div /><div /><div />
          <div className="flex flex-col items-center gap-1.5">
            <ArrowUp />
            <DiagramNode layer="app" active={active} setActive={setActive} subLabel="human-authored" small />
          </div>
          <div /><div />
        </div>

        {/* Legend / detail panel */}
        <m.div
          key={active ?? "default"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-8 rounded-xl bg-white border border-slate-200 px-5 py-4 min-h-[68px]"
        >
          {active ? (
            <>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                {LAYER_INFO[active].title}
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">{LAYER_INFO[active].rule}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">Tip.</span> Hover a node for its mutability rule.
              Solid arrows = pipeline flow. Dashed = enrichment join.
            </p>
          )}
        </m.div>

        {/* Three rules table */}
        <m.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6"
        >
          {[
            { layer: "raw.*", mut: "Append-only", rebuild: "Never", role: "Source of truth" },
            { layer: "derived.*", mut: "Truncate + rebuild", rebuild: "Every run", role: "Analytics" },
            { layer: "app.*", mut: "CRUD via Alembic", rebuild: "Migrated", role: "Human decisions" },
          ].map((r) => (
            <m.div
              key={r.layer}
              variants={fadeInUp}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="font-mono text-sm text-slate-900 font-semibold">{r.layer}</p>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Mutability</dt>
                  <dd className="text-slate-800 font-medium">{r.mut}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Rebuild</dt>
                  <dd className="text-slate-800 font-medium">{r.rebuild}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Role</dt>
                  <dd className="text-slate-800 font-medium">{r.role}</dd>
                </div>
              </dl>
            </m.div>
          ))}
        </m.div>
      </div>
    </Section>
  );
}

function DiagramNode({
  layer,
  active,
  setActive,
  subLabel,
  small,
}: {
  layer: LayerKey;
  active: LayerKey | null;
  setActive: (k: LayerKey | null) => void;
  subLabel: string;
  small?: boolean;
}) {
  const info = LAYER_INFO[layer];
  const isActive = active === layer;

  return (
    <button
      onMouseEnter={() => setActive(layer)}
      onFocus={() => setActive(layer)}
      onMouseLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      onClick={() => setActive(isActive ? null : layer)}
      className={cn(
        "group relative bg-gradient-to-br border rounded-xl text-center transition-all w-full",
        info.node,
        small ? "px-3 py-2.5" : "px-4 py-4",
        isActive ? "scale-[1.04] shadow-md ring-2 ring-blue-300" : "hover:scale-[1.02] hover:shadow-sm"
      )}
    >
      <p className={cn("font-mono font-semibold text-slate-900", small ? "text-xs" : "text-sm")}>
        {info.title}
      </p>
      <p className="text-[10px] text-slate-600 mt-0.5">{subLabel}</p>
    </button>
  );
}

function ArrowRight({ delay = 0 }: { delay?: number }) {
  return (
    <m.svg
      width="40"
      height="20"
      viewBox="0 0 40 20"
      initial={{ opacity: 0, x: -6 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.4, delay }}
      className="shrink-0"
      aria-hidden
    >
      <line x1="0" y1="10" x2="32" y2="10" stroke="#94a3b8" strokeWidth="2" />
      <path d="M 28 5 L 38 10 L 28 15 z" fill="#94a3b8" />
    </m.svg>
  );
}

function ArrowUp() {
  return (
    <m.svg
      width="20"
      height="36"
      viewBox="0 0 20 36"
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="shrink-0"
      aria-hidden
    >
      <line x1="10" y1="36" x2="10" y2="10" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M 4 13 L 10 3 L 16 13 z" fill="#3b82f6" />
    </m.svg>
  );
}
