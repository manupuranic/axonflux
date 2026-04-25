"use client";

import { useState } from "react";
import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";
import { cn } from "@/lib/utils";

const QA = [
  {
    q: "Walk me through your architecture.",
    a: "AxonFlux ingests CSV exports from a billing system that has no API into an append-only raw layer in Postgres. A nightly pipeline truncates and rebuilds an analytical derived layer using ten SQL files in strict order. A separate app schema holds human-authored state — canonical names, aliases, cash closures — that survives the rebuild. FastAPI reads derived with raw SQL, joins app for overrides, and serves a Next.js dashboard.",
    trap: "Why not Snowflake? — Scale. 2.3M rows, single store. Migration cost outweighs benefit. Postgres is the right tool until it isn't, and we have indicators for when (Scaling section).",
  },
  {
    q: "What happens if the same file is ingested twice?",
    a: "No-op. SHA-256 of the file is checked against raw.ingestion_batches. Hash seen → skip. If the file was edited and re-exported, hash differs — new batch. Aggregations naturally pick up the latest values because the pipeline rebuilds from the union.",
    trap: "What if the filename changed but content didn't? — Hash is content-based, not name-based. Still a no-op.",
  },
  {
    q: "How do you handle late-arriving data?",
    a: "We don't need to, conceptually. Full rebuild means the latest snapshot of raw.* always produces the latest derived.*. Late data gets included on the next rebuild. We pay this in pipeline runtime, not correctness.",
    trap: "What if the late row corrects an earlier number? — Same answer. Rebuild reads the corrected row, new aggregate is right. The previous incorrect number existed only in a previous run's snapshot, which we don't display historically.",
  },
  {
    q: "How do you join a barcode to a product when the master doesn't have it?",
    a: "Two layers of fallback. First, app.product_aliases — staff-confirmed alias barcodes map to canonical barcodes at aggregation time. Second, COALESCE(p.canonical_name, d.product_name) in read queries — if no app row, derived row's name (from raw) wins. We never break a query because of a missing canonical entry.",
    trap: "How do new products get into the app schema? — They don't, until needed. The PATCH endpoint creates the row on first edit. Until then, the derived name is shown.",
  },
  {
    q: "Why store predictions in SQL instead of Python?",
    a: "Today's prediction is a weighted moving average — two lines of SQL inside the existing pipeline. Python introduces a deployment surface. Phase B1 plans the upgrade: train XGBoost in ml/, write predictions back to derived.demand_predictions, keep the read pattern unchanged. SQL stays the integration boundary.",
    trap: "How would you A/B test the new model? — Write both predictions to separate columns, expose a feature flag in the API.",
  },
  {
    q: "How would you scale this 100×?",
    a: "Three moves. (1) Partition product_daily_metrics by business_date range — BRIN candidate. (2) Move step 01 to incremental rolling 90-day rebuild + separate deep-history backfill. (3) Add Redis cache in front of dashboard summary endpoints, keyed on pipeline_run_id, atomically invalidated on rebuild land. Architecture itself doesn't change; two specific layers do.",
    trap: "What's the very first thing that breaks? — Sort cost in step 02 when product_daily_metrics crosses ~10M rows.",
  },
  {
    q: "What's the most surprising bug you've shipped?",
    a: "Date parsing. Billing system exports timestamps as 04-04-202507:29 AM — no separator between date and time. Default Postgres TO_TIMESTAMP choked. Fix was a single hardcoded format mask. Lesson is wider: every external system has this kind of glitch, and the only safe place for the fix is the derived layer, not the raw insert.",
    trap: "Why not fix it on ingest? — Mutation in raw breaks the audit chain. Future-you can't replay.",
  },
];

export function InterviewMode() {
  return (
    <Section
      id="interview"
      eyebrow="Practice ground"
      title="Interview mode"
      description="Likely questions, strong answers, and the follow-up trap each one is really probing for. Click to expand. Click again for the trap."
    >
      <m.div
        variants={stagger(0.05)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.05 }}
        className="space-y-3"
      >
        {QA.map((item, i) => (
          <m.div key={i} variants={fadeInUp}>
            <QACard {...item} index={i} />
          </m.div>
        ))}
      </m.div>
    </Section>
  );
}

function QACard({
  q,
  a,
  trap,
  index,
}: {
  q: string;
  a: string;
  trap: string;
  index: number;
}) {
  const [stage, setStage] = useState<0 | 1 | 2>(0); // 0=closed, 1=answer, 2=trap

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setStage((s) => ((s + 1) % 3) as 0 | 1 | 2)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-slate-50/80 transition-colors"
      >
        <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-700 text-xs font-mono font-bold">
          Q{index + 1}
        </span>
        <span className="flex-1 font-medium text-slate-900 text-sm">{q}</span>
        <m.span
          animate={{ rotate: stage === 0 ? 0 : 180 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-slate-400 mt-1"
        >
          ▼
        </m.span>
      </button>
      <m.div
        initial={false}
        animate={{
          height: stage === 0 ? 0 : "auto",
          opacity: stage === 0 ? 0 : 1,
        }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        style={{ overflow: "hidden" }}
      >
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-100">
          <div className="flex gap-3">
            <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-mono font-bold">
              A
            </span>
            <p className="text-[13.5px] text-slate-700 leading-relaxed">{a}</p>
          </div>

          <m.div
            initial={false}
            animate={{
              height: stage === 2 ? "auto" : 0,
              opacity: stage === 2 ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
            className={cn(stage === 2 && "border-t border-slate-100 pt-4")}
          >
            <div className="flex gap-3">
              <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md bg-rose-50 text-rose-700 text-[11px] font-bold">
                ⚡
              </span>
              <div className="text-[13px] text-slate-600 leading-relaxed">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-500 mb-1">
                  Follow-up trap
                </p>
                <p className="italic">{trap}</p>
              </div>
            </div>
          </m.div>

          {stage === 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setStage(2);
              }}
              className="text-xs font-medium text-rose-600 hover:text-rose-700"
            >
              Show follow-up trap →
            </button>
          )}
        </div>
      </m.div>
    </div>
  );
}
