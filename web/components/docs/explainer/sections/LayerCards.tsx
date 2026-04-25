"use client";

import { useState } from "react";
import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";
import { cn } from "@/lib/utils";

type Layer = {
  key: string;
  title: string;
  schema: string;
  badge: string;
  badgeClass: string;
  purpose: string;
  bullets: { label: string; text: string }[];
  tradeoffs: { pros: string[]; cons: string[] };
};

const LAYERS: Layer[] = [
  {
    key: "raw",
    title: "Raw Layer",
    schema: "raw.*",
    badge: "Append-only",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    purpose:
      "Hold an exact copy of every byte the billing system has ever exported. Six tables, one per report type, plus an audit log.",
    bullets: [
      { label: "Tables", text: "Six tables — *_itemwise / *_billwise pairs for sales + purchases, plus supplier_master and item_combinations." },
      { label: "Audit", text: "import_batch_id (UUID) + source_file_name on every row. ingestion_batches stores SHA-256 + timestamps." },
      { label: "Dedup", text: "SHA-256 of file at ingest. Re-running on the same file is a no-op." },
    ],
    tradeoffs: {
      pros: ["Reversibility — drop a batch, rebuild", "Replay for free on logic changes", "Clean trust boundary"],
      cons: ["Disk grows monotonically", "Querying raw is awkward — by design"],
    },
  },
  {
    key: "derived",
    title: "Derived Layer",
    schema: "derived.*",
    badge: "Rebuilt nightly",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    purpose:
      "Pre-computed analytics. The shape every dashboard query reads from. A pure function of raw + app.",
    bullets: [
      { label: "Contract", text: "TRUNCATE all derived tables, then run 10 SQL files in strict order. Each step in a transaction." },
      { label: "Density", text: "product_daily_metrics has every (date × barcode) — even gap days. ~2.3M rows. Required for window functions." },
      { label: "Determinism", text: "Same raw + app inputs → same derived outputs. No random(), no watermark, no implicit state." },
    ],
    tradeoffs: {
      pros: ["Bug-fix replay is one rebuild", "No incremental complexity", "Idempotent by construction"],
      cons: ["Wall-clock minutes per run", "Brief read window during rebuild (acceptable for staff tool)"],
    },
  },
  {
    key: "app",
    title: "Application Layer",
    schema: "app.*",
    badge: "Migrated",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    purpose:
      "Human-authored data that must survive nightly rebuilds — canonical names, aliases, cash counts, pamphlets, users.",
    bullets: [
      { label: "Pattern", text: "Enriches derived via COALESCE. Never replaces it: COALESCE(p.canonical_name, d.product_name)" },
      { label: "Schema", text: "Managed by Alembic. Migrations only touch app.* — raw and derived stay pipeline-managed." },
      { label: "Tables", text: "users, products, product_aliases, pipeline_runs, cash_closure_records, pamphlets, plus merge_suggestions." },
    ],
    tradeoffs: {
      pros: ["Survives full rebuilds", "Strongest isolation Postgres offers (schema-level)", "Versioned, repeatable migrations"],
      cons: ["Two ORM-vs-raw-SQL access patterns", "Cross-schema joins must be explicit"],
    },
  },
];

export function LayerCards() {
  return (
    <Section
      id="layers"
      eyebrow="Architecture deep dive"
      title="The three layers, each with one job"
      description="Click any card to flip and see trade-offs. The rule: never let analytical transforms touch raw, never store application state in derived."
    >
      <m.div
        variants={stagger(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {LAYERS.map((layer) => (
          <m.div key={layer.key} variants={fadeInUp}>
            <FlipCard layer={layer} />
          </m.div>
        ))}
      </m.div>
    </Section>
  );
}

function FlipCard({ layer }: { layer: Layer }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="relative h-[520px] [perspective:1500px]">
      <m.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative w-full h-full [transform-style:preserve-3d]"
      >
        {/* Front */}
        <div className="absolute inset-0 [backface-visibility:hidden] rounded-2xl border border-slate-200 bg-white p-6 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", layer.badgeClass)}>
              {layer.badge}
            </span>
            <button
              onClick={() => setFlipped(true)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={`Show trade-offs for ${layer.title}`}
            >
              trade-offs →
            </button>
          </div>
          <h3 className="text-xl font-bold text-slate-900">{layer.title}</h3>
          <code className="text-sm font-mono text-blue-600 mb-3">{layer.schema}</code>
          <p className="text-[13px] text-slate-600 leading-relaxed mb-4">{layer.purpose}</p>
          <dl className="space-y-2.5 mt-auto">
            {layer.bullets.map((b) => (
              <div key={b.label}>
                <dt className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{b.label}</dt>
                <dd className="text-[12.5px] text-slate-700 leading-snug mt-0.5">{b.text}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Back */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 flex flex-col text-white">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Trade-offs</p>
            <button
              onClick={() => setFlipped(false)}
              className="text-xs text-slate-400 hover:text-white transition-colors"
              aria-label={`Back to ${layer.title} overview`}
            >
              ← back
            </button>
          </div>
          <h3 className="text-xl font-bold mb-4">{layer.title}</h3>

          <div className="flex-1 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 mb-2">✓ Wins</p>
              <ul className="space-y-1.5">
                {layer.tradeoffs.pros.map((p) => (
                  <li key={p} className="text-[12.5px] text-slate-200 flex gap-2">
                    <span className="text-emerald-400 shrink-0">+</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 mb-2">⚠ Costs</p>
              <ul className="space-y-1.5">
                {layer.tradeoffs.cons.map((c) => (
                  <li key={c} className="text-[12.5px] text-slate-200 flex gap-2">
                    <span className="text-amber-400 shrink-0">−</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </m.div>
    </div>
  );
}
