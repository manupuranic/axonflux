"use client";

import { Section, Callout } from "../Section";
import { fadeInUp, m, stagger } from "../motion";

const PAIN_POINTS = [
  {
    title: "No API. Ever.",
    body: "The billing software exports CSVs/XLS files. That's it. No webhooks, no polling endpoint, no JDBC, no replication slot.",
    icon: "🔌",
  },
  {
    title: "Mixed file formats",
    body: ".xls (HTML disguised as Excel), .xlsx, .csv with regional encodings. Same report type, different shapes across exports.",
    icon: "📁",
  },
  {
    title: "Date format bug",
    body: "bill_datetime_raw arrives as 04-04-202507:29 AM — no space between date and time. Default parsers choke.",
    icon: "📅",
  },
  {
    title: "Phone numbers in 4+ shapes",
    body: "+919876543210, 09876543210, 9876543210, 91 9876543210. Same person — one customer pool, four representations.",
    icon: "📞",
  },
  {
    title: "Fuzzy product identity",
    body: "Same physical SKU often has multiple barcodes because staff create new entries instead of looking up existing ones.",
    icon: "🏷️",
  },
  {
    title: "No referential integrity",
    body: "A bill row can reference a product missing from the current product master export. Joins fail silently.",
    icon: "🔗",
  },
];

export function ProblemStatement() {
  return (
    <Section
      id="problem"
      eyebrow="The world AxonFlux operates in"
      title="Real-world retail billing is a mess"
      description="Most data-platform writing assumes a clean transactional database. Real-world small-retail billing is the opposite. Here's what we're absorbing."
    >
      <m.div
        variants={stagger(0.06)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {PAIN_POINTS.map((p) => (
          <m.div
            key={p.title}
            variants={fadeInUp}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">{p.icon}</span>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">{p.title}</h3>
                <p className="mt-1 text-[13px] text-slate-600 leading-relaxed">{p.body}</p>
              </div>
            </div>
          </m.div>
        ))}
      </m.div>

      <m.div
        variants={fadeInUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        className="mt-6"
      >
        <Callout tone="warn">
          <strong>Why naive ingestion fails:</strong> the intuitive design — <em>"I'll just upsert each
          export into clean tables"</em> — collapses the moment you need to re-run with corrected logic
          on historical data, explain why yesterday's number changed, or debug a missing product. If you
          mutate on ingest, you've lost the ground truth.
        </Callout>
      </m.div>
    </Section>
  );
}
