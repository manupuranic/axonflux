"use client";

import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";

const CASES = [
  {
    case: "Duplicate ingestion",
    symptom: "Same file dropped twice",
    fix: "SHA-256 dedup in raw.ingestion_batches. No-op on second run.",
    severity: "low",
  },
  {
    case: "Corrected re-export",
    symptom: "'This month' file with one fixed row",
    fix: "New batch, new SHA. Both batches retained. Most recent batch wins because aggregates re-derive from the latest superset.",
    severity: "low",
  },
  {
    case: "Schema drift",
    symptom: "Billing system adds a column",
    fix: "Header validation rejects the file with a clear error. Operator updates HEADER_MAP and re-ingests.",
    severity: "medium",
  },
  {
    case: "Date format glitch",
    symptom: "04-04-202507:29 AM (no space)",
    fix: "Hardcoded TO_TIMESTAMP(..., 'DD-MM-YYYYHH12:MI AM') parses it deterministically.",
    severity: "low",
  },
  {
    case: "Same SKU, multiple barcodes",
    symptom: "Sales split across barcodes",
    fix: "Phase B3 entity resolution: clustering script + manual review + app.product_aliases remap at aggregation source.",
    severity: "medium",
  },
  {
    case: "Walk-in customer pollution",
    symptom: "50% of bills with no mobile",
    fix: "Synthetic mobile_clean = 'WALK-IN' collapses them into one bucket. Walk-in metrics surfaced separately.",
    severity: "low",
  },
  {
    case: "Negative pseudo-stock",
    symptom: "Cumulative sold > received historically",
    fix: "Surface in UI as 'stock estimate unreliable' banner. Don't clamp — that hides truth.",
    severity: "medium",
  },
  {
    case: "Pipeline crash mid-rebuild",
    symptom: "Partial derived.* state",
    fix: "Each step in a transaction; failure rolls back the step. Re-run resumes implicitly because everything truncates.",
    severity: "medium",
  },
];

const SEVERITY_COLOR = {
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-rose-100 text-rose-700 border-rose-200",
};

export function FailureCases() {
  return (
    <Section
      id="failures"
      eyebrow="What can break"
      title="Edge cases & their mitigations"
      description="Designed-for failure modes. Each one has a known fix path — most are absorbed automatically."
    >
      <m.div
        variants={stagger(0.05)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {CASES.map((c) => (
          <m.div
            key={c.case}
            variants={fadeInUp}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-semibold text-slate-900 text-sm flex-1">{c.case}</h3>
              <span
                className={
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider " +
                  SEVERITY_COLOR[c.severity as keyof typeof SEVERITY_COLOR]
                }
              >
                {c.severity}
              </span>
            </div>
            <dl className="space-y-2">
              <div>
                <dt className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                  Symptom
                </dt>
                <dd className="text-[12.5px] text-slate-600 leading-relaxed">{c.symptom}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">
                  Mitigation
                </dt>
                <dd className="text-[12.5px] text-slate-700 leading-relaxed">{c.fix}</dd>
              </div>
            </dl>
          </m.div>
        ))}
      </m.div>
    </Section>
  );
}
