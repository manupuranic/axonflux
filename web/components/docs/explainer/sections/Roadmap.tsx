"use client";

import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";
import { cn } from "@/lib/utils";

type Status = "shipped" | "in-flight" | "planned";

const PHASES: {
  key: string;
  title: string;
  blurb: string;
  items: { name: string; detail: string; status: Status }[];
}[] = [
  {
    key: "A",
    title: "Phase A — Operational completeness",
    blurb: "Make staff workflows whole.",
    items: [
      { name: "A1 · Cash closure UI", detail: "EOD count vs system totals, manager verify/reject.", status: "shipped" },
      { name: "A2 · Daily ingestion + refresh", detail: "Pipeline trigger with run_ingestion flag. Er4u Playwright auto-export.", status: "shipped" },
      { name: "A3 · Pamphlet generator", detail: "Client PDF, AI highlight copy via Haiku, GSheets CSV import.", status: "shipped" },
    ],
  },
  {
    key: "B",
    title: "Phase B — ML upgrade",
    blurb: "Replace SQL heuristics with validated models. Ship intelligence that teaches the retailer.",
    items: [
      { name: "B1 · ML demand forecasting", detail: "XGBoost/ARIMA in ml/, MLflow tracking. Promote to derived.demand_predictions.", status: "in-flight" },
      { name: "B2 · Basket analysis", detail: "30,018 pairs in derived.product_associations. Frequently Bought Together UI.", status: "shipped" },
      { name: "B3 · Product entity resolution", detail: "RapidFuzz clustering, staff review UI, alias remap at aggregation source.", status: "shipped" },
    ],
  },
  {
    key: "C",
    title: "Phase C — AI / Retail co-pilot",
    blurb: "LLM-powered content + decision support layered on the data foundation.",
    items: [
      { name: "C1 · Product content generation", detail: "Claude generates description, tags, key benefits for promoted products.", status: "planned" },
      { name: "C2 · Product images", detail: "Open Food Facts → Cloudflare R2 → app.products.image_url.", status: "planned" },
      { name: "C3 · Embedding pipeline + pgvector", detail: "Catalog → vectors stored alongside in Postgres.", status: "planned" },
      { name: "C4 · RAG chatbot", detail: "Ask 'what should I reorder?' — answered from real signals.", status: "planned" },
      { name: "C5 · Daily decision engine", detail: "Briefing combining restock, demand spikes, dead stock, cash flags.", status: "planned" },
    ],
  },
  {
    key: "D",
    title: "Phase D — Public presence",
    blurb: "External-facing surface. Read-only. No internal data exposed.",
    items: [
      { name: "Public Next.js segment", detail: "Store info, current offers from published pamphlets. Vercel deploy.", status: "planned" },
    ],
  },
];

const STATUS_COLOR = {
  shipped: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "in-flight": "bg-amber-100 text-amber-700 border-amber-200",
  planned: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_DOT = {
  shipped: "bg-emerald-500",
  "in-flight": "bg-amber-500 animate-pulse",
  planned: "bg-slate-300",
};

export function Roadmap() {
  return (
    <Section
      id="roadmap"
      eyebrow="Forward"
      title="What's next"
      description="Phases compose. A lays the operational floor. B ships intelligence on top. C wraps it in an AI co-pilot. D opens a public surface."
    >
      <m.div
        variants={stagger(0.08)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="space-y-6"
      >
        {PHASES.map((phase) => (
          <m.div
            key={phase.key}
            variants={fadeInUp}
            className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-baseline gap-3 flex-wrap">
              <span className="font-mono text-2xl font-bold text-blue-600">{phase.key}</span>
              <h3 className="font-semibold text-slate-900">{phase.title}</h3>
              <span className="text-[12.5px] text-slate-500">{phase.blurb}</span>
            </div>

            <ul className="divide-y divide-slate-100">
              {phase.items.map((item) => (
                <li
                  key={item.name}
                  className="px-5 py-3 flex items-start gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <span
                    className={cn(
                      "shrink-0 mt-1.5 h-2 w-2 rounded-full",
                      STATUS_DOT[item.status]
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-slate-900 text-sm">{item.name}</h4>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          STATUS_COLOR[item.status]
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-slate-600 leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </m.div>
        ))}
      </m.div>
    </Section>
  );
}
