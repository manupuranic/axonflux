"use client";

import { useState } from "react";
import { Section } from "../Section";
import { m } from "../motion";
import { cn } from "@/lib/utils";

type PatternKey = "sequential" | "parallel" | "coordinator" | "tool_loop";

type Pattern = {
  key: PatternKey;
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  whenToUse: string;
  axonExamples: { agent: string; what: string }[];
  accent: string;
  ringAccent: string;
};

const PATTERNS: Pattern[] = [
  {
    key: "sequential",
    label: "Sequential pipeline",
    emoji: "➡️",
    tagline: "A → B → C — each step consumes the previous step's output",
    description: "One agent finishes its job, hands a structured payload to the next. No branching, no parallelism. The simplest and most debuggable orchestration.",
    whenToUse: "Each step strictly depends on the previous (analysis must complete before writing; draft must exist before SEO pass).",
    axonExamples: [
      { agent: "Weekly Intelligence", what: "Sales aggregate → stock alerts → lapsed customers → cash status → one-screen report" },
      { agent: "Content Writer", what: "Topic seed → Claude draft → SEO meta pass → app.blog_posts (status=draft)" },
      { agent: "Cash Discrepancy", what: "Load 30d closure history → pattern detection → severity flag" },
    ],
    accent: "from-blue-50 to-sky-50 border-blue-200",
    ringAccent: "ring-blue-200",
  },
  {
    key: "parallel",
    label: "Parallel fan-out + merge",
    emoji: "🔀",
    tagline: "One trigger → N sub-tasks in parallel → reduce to one result",
    description: "Split work along a natural dimension (per supplier, per category, per product). All branches run independently. A final step merges, ranks, or picks the winners.",
    whenToUse: "Branches are independent and roughly equal cost. Fan-out is bounded (3–50 branches). Latency = max(branch), not sum.",
    axonExamples: [
      { agent: "Reorder Agent", what: "Per supplier: read replenishment + lead time → draft PO. Merge: per-supplier PO bundle." },
      { agent: "Dead Stock Clearance", what: "Per category: rank 4,661 dead products + cross-ref basket associations → ranked clearance + bundle suggestions" },
      { agent: "Supplier Performance", what: "Per supplier: spend trend + top products + stockout frequency → one-page brief per vendor" },
    ],
    accent: "from-purple-50 to-fuchsia-50 border-purple-200",
    ringAccent: "ring-purple-200",
  },
  {
    key: "coordinator",
    label: "Coordinator + sub-agents",
    emoji: "🎼",
    tagline: "Conductor delegates to specialist agents, joins their outputs into a final artifact",
    description: "A coordinator agent decides which specialists to invoke and in what order. Specialists may run in parallel or sequence under the coordinator's direction. Final agent assembles + publishes.",
    whenToUse: "Workflow has distinct expertise areas (image, content, SEO). Specialists shouldn't know about each other. Coordinator owns the orchestration plan.",
    axonExamples: [
      { agent: "Storefront Group (D7)", what: "Coordinator → [Product Selection → (Image Agent ∥ Content Agent ∥ SEO Agent)] → Publisher Agent" },
      { agent: "Image Agent", what: "Open Food Facts → web fallback → AI generation → StorageClient.upload → URL" },
      { agent: "Content Agent", what: "Claude API → description + tags + use_cases + key_benefits (wellness framing)" },
      { agent: "SEO Agent", what: "Claude API → seo_title (60ch) + seo_description (155ch) + schema.org JSON-LD" },
    ],
    accent: "from-emerald-50 to-teal-50 border-emerald-200",
    ringAccent: "ring-emerald-200",
  },
  {
    key: "tool_loop",
    label: "Tool-use loop",
    emoji: "🔁",
    tagline: "Agent calls tools in rounds until it decides it's done",
    description: "The LLM is given a set of tools and a goal. Each round: model emits tool calls → harness executes → results fed back → model decides next move. Loops until model returns plain text (no more tool calls) or hits MAX_TOOL_ROUNDS.",
    whenToUse: "Goal is open-ended exploration (find an image, edit a document, debug an error). Number of steps not known in advance. Model decides when to stop.",
    axonExamples: [
      { agent: "Pamphlet Chat", what: "User says 'make footer bigger' → apply_dsl_patch(ops=[...]) → DSL mutated → version saved" },
      { agent: "Image Agent (LLM-driven)", what: "Haiku iterates: fetch_url(Open Food Facts) → web_search → fetch_url → returns URL when found" },
      { agent: "MAX_TOOL_ROUNDS=10", what: "Hard cap prevents runaway loops if model misbehaves" },
    ],
    accent: "from-amber-50 to-orange-50 border-amber-200",
    ringAccent: "ring-amber-200",
  },
];

export function AgenticArchitecture() {
  const [active, setActive] = useState<PatternKey>("sequential");
  const pattern = PATTERNS.find((p) => p.key === active)!;

  return (
    <Section
      id="agentic"
      eyebrow="Agentic architecture"
      title="Four ways agents are orchestrated here"
      description="Phase D introduces 8 internal agents. They don't all work the same way — each pattern below earns its keep for a specific shape of work. Click a tab to see the orchestration diagram + which AxonFlux agents use it."
    >
      {/* Pattern tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        {PATTERNS.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition-all",
              active === p.key
                ? `bg-gradient-to-br ${p.accent} ring-2 ${p.ringAccent} shadow-sm`
                : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
            )}
          >
            <div className="text-lg mb-1">{p.emoji}</div>
            <div className={cn("text-[13px] font-semibold", active === p.key ? "text-slate-900" : "text-slate-700")}>
              {p.label}
            </div>
          </button>
        ))}
      </div>

      {/* Active pattern body */}
      <m.div
        key={pattern.key}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "rounded-2xl border bg-gradient-to-br p-6 md:p-8",
          pattern.accent
        )}
      >
        {/* Diagram */}
        <div className="mb-6 rounded-xl bg-white border border-slate-200/80 p-6 md:p-8 overflow-x-auto">
          <PatternDiagram pattern={pattern.key} />
        </div>

        {/* Tagline */}
        <p className="text-sm font-mono text-slate-600 mb-3 italic">{pattern.tagline}</p>

        {/* Description + when-to-use */}
        <div className="grid md:grid-cols-2 gap-5 mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">How it works</p>
            <p className="text-[13px] text-slate-700 leading-relaxed">{pattern.description}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">When to reach for it</p>
            <p className="text-[13px] text-slate-700 leading-relaxed">{pattern.whenToUse}</p>
          </div>
        </div>

        {/* Examples */}
        <div className="rounded-lg bg-white/60 border border-slate-200/60 p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2.5">AxonFlux agents using this pattern</p>
          <ul className="space-y-2">
            {pattern.axonExamples.map((ex) => (
              <li key={ex.agent} className="flex gap-3 text-[12.5px]">
                <span className="font-semibold text-slate-900 shrink-0 min-w-[170px]">{ex.agent}</span>
                <span className="text-slate-600 leading-snug">{ex.what}</span>
              </li>
            ))}
          </ul>
        </div>
      </m.div>
    </Section>
  );
}

/* ─────────────────────────── Diagrams ─────────────────────────── */

function PatternDiagram({ pattern }: { pattern: PatternKey }) {
  if (pattern === "sequential") return <SequentialDiagram />;
  if (pattern === "parallel") return <ParallelDiagram />;
  if (pattern === "coordinator") return <CoordinatorDiagram />;
  if (pattern === "tool_loop") return <ToolLoopDiagram />;
  return null;
}

function Node({
  label,
  sub,
  color = "blue",
  size = "md",
}: {
  label: string;
  sub?: string;
  color?: "blue" | "purple" | "emerald" | "amber" | "slate";
  size?: "sm" | "md" | "lg";
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-300 text-blue-900",
    purple: "bg-purple-50 border-purple-300 text-purple-900",
    emerald: "bg-emerald-50 border-emerald-300 text-emerald-900",
    amber: "bg-amber-50 border-amber-300 text-amber-900",
    slate: "bg-slate-50 border-slate-300 text-slate-900",
  };
  const sizes = {
    sm: "px-2.5 py-1.5 text-[11px] min-w-[80px]",
    md: "px-3.5 py-2.5 text-[12px] min-w-[110px]",
    lg: "px-4 py-3 text-[13px] min-w-[140px]",
  };
  return (
    <div className={cn("rounded-lg border-2 text-center font-semibold shadow-sm", colors[color], sizes[size])}>
      <div>{label}</div>
      {sub && <div className="text-[10px] font-normal opacity-70 mt-0.5">{sub}</div>}
    </div>
  );
}

function Arrow({ pulse = false }: { pulse?: boolean }) {
  return (
    <div className="flex items-center justify-center px-1">
      <svg width="32" height="14" viewBox="0 0 32 14" className={cn("text-slate-400", pulse && "animate-pulse")}>
        <line x1="0" y1="7" x2="26" y2="7" stroke="currentColor" strokeWidth="1.5" />
        <polyline points="22,3 28,7 22,11" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function SequentialDiagram() {
  const steps = ["Load data", "Analyze", "Detect patterns", "Build report"];
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <m.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15 }}
          >
            <Node label={s} color="blue" />
          </m.div>
          {i < steps.length - 1 && <Arrow />}
        </div>
      ))}
    </div>
  );
}

function ParallelDiagram() {
  const branches = ["Supplier A", "Supplier B", "Supplier C", "Supplier D"];
  return (
    <div className="flex flex-col items-center gap-3">
      <Node label="Trigger" sub="weekly cron" color="purple" />
      <svg width="280" height="32" viewBox="0 0 280 32" className="text-purple-300">
        <line x1="140" y1="0" x2="140" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="35" y1="10" x2="245" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="35" y1="10" x2="35" y2="28" stroke="currentColor" strokeWidth="1.5" />
        <line x1="105" y1="10" x2="105" y2="28" stroke="currentColor" strokeWidth="1.5" />
        <line x1="175" y1="10" x2="175" y2="28" stroke="currentColor" strokeWidth="1.5" />
        <line x1="245" y1="10" x2="245" y2="28" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="flex gap-2 flex-wrap justify-center">
        {branches.map((b, i) => (
          <m.div
            key={b}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
          >
            <Node label={b} sub="draft PO" color="purple" size="sm" />
          </m.div>
        ))}
      </div>
      <svg width="280" height="32" viewBox="0 0 280 32" className="text-purple-300">
        <line x1="35" y1="0" x2="35" y2="18" stroke="currentColor" strokeWidth="1.5" />
        <line x1="105" y1="0" x2="105" y2="18" stroke="currentColor" strokeWidth="1.5" />
        <line x1="175" y1="0" x2="175" y2="18" stroke="currentColor" strokeWidth="1.5" />
        <line x1="245" y1="0" x2="245" y2="18" stroke="currentColor" strokeWidth="1.5" />
        <line x1="35" y1="18" x2="245" y2="18" stroke="currentColor" strokeWidth="1.5" />
        <line x1="140" y1="18" x2="140" y2="30" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <Node label="Merge" sub="PO bundle" color="purple" />
    </div>
  );
}

function CoordinatorDiagram() {
  return (
    <div className="flex flex-col items-center gap-3">
      <Node label="Coordinator" sub="Storefront Group" color="emerald" size="lg" />
      <svg width="320" height="32" viewBox="0 0 320 32" className="text-emerald-300">
        <line x1="160" y1="0" x2="160" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="50" y1="10" x2="270" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="50" y1="10" x2="50" y2="28" stroke="currentColor" strokeWidth="1.5" />
        <line x1="160" y1="10" x2="160" y2="28" stroke="currentColor" strokeWidth="1.5" />
        <line x1="270" y1="10" x2="270" y2="28" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="flex gap-3 flex-wrap justify-center">
        <Node label="Image Agent" sub="Tavily + R2" color="emerald" size="sm" />
        <Node label="Content Agent" sub="Claude" color="emerald" size="sm" />
        <Node label="SEO Agent" sub="schema.org" color="emerald" size="sm" />
      </div>
      <svg width="320" height="32" viewBox="0 0 320 32" className="text-emerald-300">
        <line x1="50" y1="0" x2="50" y2="14" stroke="currentColor" strokeWidth="1.5" />
        <line x1="160" y1="0" x2="160" y2="14" stroke="currentColor" strokeWidth="1.5" />
        <line x1="270" y1="0" x2="270" y2="14" stroke="currentColor" strokeWidth="1.5" />
        <line x1="50" y1="14" x2="270" y2="14" stroke="currentColor" strokeWidth="1.5" />
        <line x1="160" y1="14" x2="160" y2="30" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <Node label="Publisher" sub="upsert + git push" color="emerald" size="lg" />
    </div>
  );
}

function ToolLoopDiagram() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Node label="LLM" sub="Haiku 4.5" color="amber" size="md" />
      <div className="flex items-center gap-4">
        <svg width="80" height="40" viewBox="0 0 80 40" className="text-amber-400">
          <path d="M 40 5 Q 5 20 40 35" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="36,32 40,38 44,32" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <div className="flex flex-col gap-2">
          <Node label="apply_dsl_patch" sub="tool call" color="slate" size="sm" />
          <Node label="set_grid" sub="tool call" color="slate" size="sm" />
        </div>
        <svg width="80" height="40" viewBox="0 0 80 40" className="text-amber-400">
          <path d="M 40 5 Q 75 20 40 35" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <polyline points="36,8 40,2 44,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <p className="text-[10px] text-slate-500 italic mt-1">round 0…N until LLM emits no tool calls (or hits MAX_TOOL_ROUNDS=10)</p>
    </div>
  );
}
