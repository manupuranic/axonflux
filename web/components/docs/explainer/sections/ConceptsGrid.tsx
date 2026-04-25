"use client";

import { useState } from "react";
import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";
import { cn } from "@/lib/utils";

type Concept = {
  emoji: string;
  title: string;
  definition: string;
  analogy: string;
  here: string;
  pitch: string;
  accent: string;
};

const CONCEPTS: Concept[] = [
  {
    emoji: "🧱",
    title: "Append-only systems",
    definition: "Tables you only INSERT into. UPDATE/DELETE explicitly disallowed.",
    analogy: "A bank ledger — you never erase a transaction, you book a correcting one.",
    here: "All raw.* tables. Re-ingesting the same file is a no-op (SHA-256 dedup). A re-ingest of a corrected file is a new batch.",
    pitch: "Append-only is the simplest immutability you can buy. Costs disk and discipline; gives you a perfect time machine.",
    accent: "from-amber-50 to-orange-50 border-amber-200",
  },
  {
    emoji: "♻️",
    title: "Idempotency",
    definition: "Running the operation N times produces the same result as running it once.",
    analogy: "A door locked is locked. Locking it again doesn't make it more locked.",
    here: "Ingestion: SHA-256 dedup. Pipeline: TRUNCATE+INSERT. Mutating endpoints use upsert semantics.",
    pitch: "What lets a flaky cron, a retried webhook, or a confused operator click 'Run' twice without consequence. Not optional in real systems.",
    accent: "from-emerald-50 to-teal-50 border-emerald-200",
  },
  {
    emoji: "🎯",
    title: "Deterministic pipelines",
    definition: "Same inputs → same outputs, every time, no hidden state.",
    analogy: "A recipe. Two cooks following it identically produce identical cakes.",
    here: "Given raw.* + app.*, derived.* is fully determined. No random(), no last-run timestamp, no implicit watermark.",
    pitch: "Determinism is what makes 're-run and check' a viable debugging step. Hidden mutable state turns every bug into a Heisenbug.",
    accent: "from-blue-50 to-sky-50 border-blue-200",
  },
  {
    emoji: "📊",
    title: "OLAP vs OLTP",
    definition: "OLTP = many small transactional writes. OLAP = few large analytical reads.",
    analogy: "OLTP is the till. OLAP is the spreadsheet you build from a month of till tapes.",
    here: "Billing system is OLTP. AxonFlux is OLAP — same Postgres node, different query shapes. Wide pre-aggregated derived tables are OLAP-style.",
    pitch: "We don't need a separate warehouse yet. Postgres handles 2.3M rows comfortably. When that stops being true, the SQL is portable.",
    accent: "from-cyan-50 to-sky-50 border-cyan-200",
  },
  {
    emoji: "🌗",
    title: "Dense vs sparse time series",
    definition: "Dense = every (date × entity). Sparse = only rows where something happened.",
    analogy: "Calendar with every day shown vs. calendar with only your appointments.",
    here: "product_daily_metrics is dense — ~2.3M rows. Forecasting and rolling features need the zeros.",
    pitch: "If you're computing rolling features, go dense. Compute saved by skipping zero-rows is dwarfed by the bugs you create reasoning around gaps.",
    accent: "from-violet-50 to-fuchsia-50 border-violet-200",
  },
  {
    emoji: "🔁",
    title: "Full rebuild vs incremental",
    definition: "Full = truncate, recompute. Incremental = watermark, only process new.",
    analogy: "Wipe the whiteboard and redraw vs. erase one cell and update.",
    here: "Full rebuild every run. Wall-clock cost: minutes. Bug fixed today reflects in all historical data tomorrow without backfill.",
    pitch: "Incremental is a perf optimization you defer until full rebuild actually hurts. For most companies, that day never comes.",
    accent: "from-rose-50 to-pink-50 border-rose-200",
  },
];

export function ConceptsGrid() {
  return (
    <Section
      id="concepts"
      eyebrow="System design concepts"
      title="The ideas this whole thing rests on"
      description="Each card flips to a 30-second interview pitch. Knowing concepts isn't the same as knowing when to use them — these notes name where each one earns its keep here."
    >
      <m.div
        variants={stagger(0.06)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {CONCEPTS.map((c) => (
          <m.div key={c.title} variants={fadeInUp}>
            <ConceptCard concept={c} />
          </m.div>
        ))}
      </m.div>
    </Section>
  );
}

function ConceptCard({ concept }: { concept: Concept }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      onClick={() => setFlipped((f) => !f)}
      className="relative w-full h-[340px] [perspective:1500px] text-left"
    >
      <m.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative w-full h-full [transform-style:preserve-3d]"
      >
        {/* Front */}
        <div
          className={cn(
            "absolute inset-0 [backface-visibility:hidden] rounded-2xl border bg-gradient-to-br p-5 flex flex-col",
            concept.accent
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">{concept.emoji}</span>
            <span className="text-[10px] font-mono text-slate-400">tap to flip</span>
          </div>
          <h3 className="font-semibold text-slate-900 text-base">{concept.title}</h3>
          <p className="text-[13px] text-slate-700 leading-relaxed mt-1">{concept.definition}</p>
          <p className="text-[12px] text-slate-500 italic mt-3">{concept.analogy}</p>
          <p className="text-[12.5px] text-slate-700 leading-relaxed mt-auto pt-3 border-t border-slate-200/60">
            <span className="font-medium text-slate-900">In AxonFlux. </span>
            {concept.here}
          </p>
        </div>

        {/* Back */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-5 flex flex-col text-white">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">⚡</span>
            <span className="text-[10px] font-mono text-slate-500">30-sec pitch</span>
          </div>
          <h3 className="font-semibold text-white text-base mb-3">{concept.title}</h3>
          <p className="text-[14px] leading-relaxed text-slate-200 italic">"{concept.pitch}"</p>
        </div>
      </m.div>
    </button>
  );
}
