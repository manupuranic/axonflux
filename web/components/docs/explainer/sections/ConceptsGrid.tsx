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
  {
    emoji: "🔌",
    title: "Provider-agnostic LLM abstraction",
    definition: "One ChatSession interface; swap Anthropic / OpenAI / OpenRouter / Haiku / Sonnet via config.",
    analogy: "A power adapter — same plug, different sockets behind the wall.",
    here: "api/ai/provider.py defines AIProvider. ChatSession picks a provider by name at construction. Cost tuning, failover, A/B tests all become config changes.",
    pitch: "LLM vendor lock-in is real and expensive. Abstracting at the message boundary costs an afternoon and saves you the rewrite when pricing or quality changes.",
    accent: "from-indigo-50 to-violet-50 border-indigo-200",
  },
  {
    emoji: "📐",
    title: "Schema-driven LLM output",
    definition: "Pydantic models define the DSL the LLM must emit. Invalid output rejected at validation.",
    analogy: "A form with typed fields — the LLM can't submit a free-text essay where a number goes.",
    here: "render/primitives.py: 16 node types with field constraints (opacity 0–1, cols int, color regex). LLM hallucinations get normalized or rejected before render.",
    pitch: "Don't ask a weak LLM for structured output and hope. Constrain the output space at the type system; let validators fail loudly.",
    accent: "from-blue-50 to-indigo-50 border-blue-200",
  },
  {
    emoji: "🛡️",
    title: "LLM output as untrusted input",
    definition: "Sanitize, validate, and repair every byte the model produces — same posture as user input.",
    analogy: "You'd never INSERT raw user input into SQL. Don't render raw LLM HTML into a browser either.",
    here: "render/validator.py runs bleach + lxml on LLM-generated HTML/SVG. _coerce_ops_list repairs Python-literal JSON. Pydantic normalizes type fields.",
    pitch: "The LLM is an external system that occasionally lies, mis-types, or emits XSS payloads. Treat it like one. Defense at every boundary.",
    accent: "from-red-50 to-orange-50 border-red-200",
  },
  {
    emoji: "🧠",
    title: "State in the system prompt",
    definition: "Instead of round-tripping to discover state, embed it in the system prompt every turn.",
    analogy: "A surgeon walking into the OR with the X-ray already on the lightbox.",
    here: "Pamphlet chat injects a compact DSL outline (node IDs + key fields) so the LLM emits apply_dsl_patch ops without first calling get_layout. Killed ~30% of 'AI did nothing' bugs.",
    pitch: "For weak models, every saved tool call is a saved chance to fail. Pay extra prompt tokens to eliminate failure points.",
    accent: "from-purple-50 to-fuchsia-50 border-purple-200",
  },
  {
    emoji: "⚡",
    title: "Atomic tools for weak LLMs",
    definition: "Collapse N-step composable chains into one semantic tool with auto-discovery.",
    analogy: "Instead of 'open drawer, find key, unlock door', a single 'enter' command.",
    here: "set_grid / style_region / add_banner auto-find their targets and apply changes in one call. Haiku drops the second tool call ~30% of the time; one call can't be dropped.",
    pitch: "Composable primitives assume Sonnet-grade chaining. Below that, model can't reliably plan multi-step sequences — give it primitives that are already plans.",
    accent: "from-amber-50 to-yellow-50 border-amber-200",
  },
  {
    emoji: "🎬",
    title: "Forced first tool round",
    definition: "tool_choice='required' on round 0 prevents the model from narrating without acting.",
    analogy: "A speech contest where round one is 'demonstrate, don't describe'.",
    here: "api/ai/chat.py:65 sets tool_choice='required' when round_num==0. The LLM cannot reply with text on its first turn — it must call a tool. Auto on round 1+.",
    pitch: "LLMs love to say 'Sure, I'll do X' without doing X. Forcing tool use on round 0 makes 'said it' = 'did it'.",
    accent: "from-cyan-50 to-blue-50 border-cyan-200",
  },
  {
    emoji: "🧩",
    title: "Pluggable tool registry",
    definition: "Each tool is a folder with a MANIFEST + router.py. Auto-discovered at startup; zero core changes.",
    analogy: "USB devices — plug in, OS figures it out from the descriptor.",
    here: "api/tools/__init__.py:register_tools() scans subdirectories. Adding cash-closure, pamphlets, BOM, entity-resolution required zero edits to main.py.",
    pitch: "When 'add a new feature' means 'edit five core files', new features stop happening. Plugin auto-discovery makes the cost flat.",
    accent: "from-teal-50 to-emerald-50 border-teal-200",
  },
  {
    emoji: "🎚️",
    title: "Metadata-driven filters",
    definition: "Endpoints declare a FieldSpec allowlist. Wire format (key:op:value) translates to parameterised SQL.",
    analogy: "A restaurant menu — you can only order what's listed; the kitchen decides how it's made.",
    here: "api/lib/filters.py + 53 unit tests. Customer Activity exposes 8 fields with op-per-row UI. SQL column injection impossible by construction.",
    pitch: "Hand-rolling a query parser per endpoint is how 'GET /users?filter=...' becomes a permanent backlog item. Declare fields once; reuse everywhere.",
    accent: "from-sky-50 to-cyan-50 border-sky-200",
  },
  {
    emoji: "📡",
    title: "Subprocess-as-service",
    definition: "Long-running ops run as Popen children; stdout streams to DB; admin watches live.",
    analogy: "A factory floor with cameras — the conveyor runs in its own machine, but the control room sees every step.",
    here: "POST /pipeline/trigger forks weekly_pipeline.py. _active_procs registry supports cancel via subprocess.kill(). Stdout flushed to pipeline_runs every 3 lines.",
    pitch: "Long jobs don't belong in request handlers. Subprocesses isolate failure, enable cancel, and let one Python process not block another.",
    accent: "from-orange-50 to-amber-50 border-orange-200",
  },
  {
    emoji: "🌊",
    title: "SSE + query-param auth",
    definition: "Server-Sent Events stream task progress; browser EventSource can't send custom headers, so token goes in query string.",
    analogy: "A turnstile — the gate-pass goes on the front, not in your wallet.",
    here: "web/lib/pamphlet/api.ts: new EventSource(`...?token=${jwt}`). api/agents/router.py:_token_auth reads Authorization header OR ?token=. Image agent, pamphlet scan use this.",
    pitch: "Browser SSE has a real-world quirk — no headers. Pretending it doesn't, by adding a wrapper, costs you weeks. Accept the constraint, design around it.",
    accent: "from-emerald-50 to-green-50 border-emerald-200",
  },
  {
    emoji: "🏗️",
    title: "View → Table materialization",
    definition: "When a CTE-heavy view becomes a hotspot, promote to a TABLE rebuilt in the pipeline. Free materialization.",
    analogy: "Cooking once and freezing portions vs. re-cooking the same dish at every meal.",
    here: "product_dimension was a VIEW with 200ms latency. Promoted to TABLE rebuilt in step 05. 700ms → 55ms (12×). The full-rebuild architecture made this trivial.",
    pitch: "Materialized views need refresh logic. With a full rebuild already running, any expensive view can become a free materialised table.",
    accent: "from-fuchsia-50 to-pink-50 border-fuchsia-200",
  },
  {
    emoji: "🔀",
    title: "Alias remap at aggregation source",
    definition: "Entity resolution maps alias → canonical via LEFT JOIN at the source SQL, not via row rewrites.",
    analogy: "A redirect rule at the front door — every visitor lands in the right room without you moving the rooms.",
    here: "B3 entity resolution: app.product_aliases joined in step 01 + step 05 + step 10. No raw rewrites; merging two SKUs is one INSERT into the alias table.",
    pitch: "Rewriting historical data to merge entities is irreversible and risky. Remap-at-source keeps raw immutable; merges become reversible config changes.",
    accent: "from-lime-50 to-green-50 border-lime-200",
  },
  {
    emoji: "📐",
    title: "Format as data in DSL",
    definition: "Document dimensions (width, height, format) live in the DSL root node — not in the renderer. Every layer derives its viewport from the document, never from hardcoded constants.",
    analogy: "A page's paper size belongs in the print settings, not in the printer firmware.",
    here: "Campaign Studio DSL: page.width_mm / page.height_mm. render_html_to_image(width_px, height_px), PDF exporter, and the preview iframe all read from the same source. Adding a WhatsApp 1080×1080 or Story 1080×1920 format = one DSL field change; zero renderer code change.",
    pitch: "When format is a constant in code, every new format is a deployment. When it's data in the document, format is config at the right level of abstraction — and the renderer becomes format-agnostic by construction.",
    accent: "from-slate-50 to-gray-50 border-slate-200",
  },
  {
    emoji: "🗂️",
    title: "StaticFiles as dev-time object storage",
    definition: "Uploaded files land on disk; FastAPI's StaticFiles serve them. The URL structure mirrors what a real CDN would return — so production swap is one env var.",
    analogy: "A sticky note on your desk — same information content as a cloud note, no account required.",
    here: "POST /campaigns/{id}/assets/upload saves to data/uploads/campaign_assets/. app.mount('/uploads', StaticFiles(…)) serves them. Frontend constructs ${API_BASE}/uploads/... — the same URL shape it would use against R2 or S3 in prod. Switching to real object storage = change two env vars, zero frontend code.",
    pitch: "Don't stand up MinIO or real S3 in local dev. A folder + StaticFiles is your object storage until you actually need CDN characteristics. But design the URL surface as if it's a CDN from day one — then the swap costs nothing.",
    accent: "from-pink-50 to-rose-50 border-pink-200",
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
      className="relative w-full h-[420px] [perspective:1500px] text-left"
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
