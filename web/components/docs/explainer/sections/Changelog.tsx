"use client";

import { Section } from "../Section";
import { fadeInUp, m, stagger } from "../motion";
import { cn } from "@/lib/utils";

type Entry = {
  date: string;
  title: string;
  detail: string;
  type: "feature" | "doc" | "refactor" | "polish" | "fix" | "learning";
};

const ENTRIES: Entry[] = [
  {
    date: "2026-05-27",
    title: "Pamphlet chat — item management, approval flow, self-healing renderer",
    detail: "Chat agent can now remove products and update prices/names via staged approval. Three new tools: list_items, stage_remove_items, stage_update_items — changes accumulate in pending_item_changes without touching DB. ChatPanel shows an approval card (Apply / Dismiss) inline in the assistant message. Apply endpoint commits to DB, purges orphaned DSL product nodes in the same transaction. Renderer made self-healing: _render_product returns '' for missing items, _render_slot collapses empty slots — grid auto-reflows without gaps regardless of DSL state. Badge text auto-computed (Save ₹X) when mrp+offer_price provided. PATCH /nodes/{id}/content endpoint for direct text edits bypassing LLM. PATCH /nodes/{id} general endpoint (patch dict, style_overrides sub-merge). purge-orphaned-nodes one-shot cleanup endpoint. tool_choice='required' on round 0 prevents model narrating without acting. ReactMarkdown in ChatPanel. product image object-position:center top.",
    type: "feature",
  },
  {
    date: "2026-05-25",
    title: "Pamphlet generator v2 — DSL renderer, AI image agent, 3-column editor",
    detail: "Full ground-up rewrite of the pamphlet tool. DSL JSON tree replaces client-side React-PDF: 16 primitive node types (Page, Section, Slot, Product, Text, Image, Divider, Spacer, OfferBanner, Logo, Decoration, QrCode, ContactStrip, PriceCompare, CustomHtml, RawSvg) rendered server-side to HTML, then to PDF/PNG via Playwright. Three-column editor: Chat (AI conversation) | Products (CRUD panel) | Preview (live iframe). AI tool registry collapsed from 18 specialised tools to 6 composable ones (get_layout, edit_layout, update_node, update_products, set_theme, ask_user) — reduces LLM context pressure and prevents tool-choice paralysis. LLM image agent: Claude Haiku drives Tavily search + Open Food Facts API → finds product images autonomously, streams progress via SSE (EventSource). Thread-safe task registry with asyncio + threading.Lock. CSS Grid equal-height cards with grid-template-rows:repeat(n,1fr) — no per-card height hacks. Horizontal card layout: image left 38%, text right, align-self:stretch fills full row height. Force-rescan: soft path scans missing-only; auto-retries with ?force=true when all URLs present but broken. AI Settings page with provider/model dropdown and OpenRouter support. Versioned history preserved per pamphlet. Migration 010 adds category + unit columns to pamphlet_items.",
    type: "feature",
  },
  {
    date: "2026-05-24",
    title: "Filter infrastructure (cross-table, operator-per-row)",
    detail: "Reusable filter system shared by every list/export endpoint. Backend api/lib/filters.py: FieldSpec + parse_conditions translates wire-format cond=key:op:value into parameterized SQL via build_where(). 53 unit tests cover ops, NULL-safe ncontains, column-safety guard, rejection paths. Frontend FilterBuilder.tsx is a Notion/Linear-style row builder — each row [field ▾][op ▾][value][×], Add filter picker, Apply/Clear, draft state inside the component so no per-keystroke refetch. First consumer: Customer Activity (8 filterable fields incl. visits, days_silent, spend, name contains/starts-with, is_member, payment enum). Export shares the same filter list — WYSIWYG download.",
    type: "feature",
  },
  {
    date: "2026-05-24",
    title: "Tailscale Serve tunnel for mobile dev",
    detail: "dev.ps1 launches tailscale serve --bg --https=8443 alongside uvicorn + Next.js — phone reaches dashboard at https://desktop-jb2ntpf.tail961410.ts.net:8443. Next.js rewrites() proxies /api/* to localhost:8000 so the FastAPI backend never crosses the tailnet. Port 8443 chosen so Manastra (already on 443) coexists. allowedDevOrigins in next.config.ts whitelists the tailnet hostname.",
    type: "feature",
  },
  {
    date: "2026-05-23",
    title: "Phase F — Puranic Storefront + D8 Content Writer Agent (design)",
    detail: "Storefront: puranic.in, brand Puranic, static export to Vercel (dashboard stays local). 8 routes: homepage, catalogue, product pages, category, offers, WhatsApp-shareable offers, blog, contact. WhatsApp: click-to-enquire + Meta product feed export. C2 updated: StorageClient abstraction over boto3 — switch R2→S3 via .env only. D8 Content Writer Agent: topic seeds from catalog → Claude draft → SEO pass → staff approves → static export.",
    type: "doc",
  },
  {
    date: "2026-05-23",
    title: "Phase D + E — Agentic Intelligence + MCP Server (design)",
    detail: "Phase D: 7 internal agents (Reorder, Weekly Intelligence, Dead Stock Clearance, Pamphlet Intelligence, Cash Discrepancy, Supplier Performance, Storefront Group). Storefront Group = coordinator + 4 sub-agents (Product Selection, Image, Content, SEO, Publisher). Phase E: read-only MCP server for Manastra integration — 6 tools, owner briefings + anomaly alerts. Phase F (was D): Public presence renumbered.",
    type: "doc",
  },
  {
    date: "2026-05-23",
    title: "Phase B4 — BOM Manager",
    detail: "Solves in-house repackaging blind spot: wheat/pulses/spices bought loose, sold as branded packets. app.product_bom + app.product_bom_suggestions (migration 008). Auto-suggest script (792 candidates, 100% scores for core products). Staff review UI at /tools/bom-manager — collapsible groups, yield-based qty_per_unit as confirmation gate. Step 04 stock position rewritten: BOM consumption deducted from raw material stock, finished goods excluded entirely. Suggest script reruns on every pipeline rebuild.",
    type: "feature",
  },
  {
    date: "2026-05-22",
    title: "Customer Activity report + lapsed/active tiers",
    detail: "GET /api/customers/lapsed with tier filter (Active <30d / At-Risk 30–59d / Lapsed 60–89d / Lost 90d+). Repeat customers only. Summary KPIs, tier filter chips, CSV + Excel export. History drawer reused. Replaced all emoji icons with lucide-react SVGs across sidebar and KPI cards.",
    type: "feature",
  },
  {
    date: "2026-04-26",
    title: "B1 pre-flight: calendar dim + stockout censoring + ML predictions schema",
    detail: "derived.calendar_dim seeded (2,192 rows, 2024–2029) with Indian official holidays + 12 retail festivals with pre/post windows. step 02 restructured to CTE — adds stockout_proxy (80K censored rows), is_holiday, days_to_next_festival. Migration 007: app.ml_demand_predictions(date, product_id, p10, p50, p90).",
    type: "feature",
  },
  {
    date: "2026-04-25",
    title: "Project Explainer (interactive)",
    detail: "Replaced static system design page with component-driven explainer — animations, scroll-spy, flip cards, interactive pipeline stepper, SQL deep dive tabs, interview mode.",
    type: "doc",
  },
  {
    date: "2026-04-25",
    title: "Phase B3 — Product entity resolution",
    detail: "RapidFuzz clustering --min-score 78. Staff review UI at /tools/entity-resolution. Alias remap at aggregation source (steps 01, 05, 10).",
    type: "feature",
  },
  {
    date: "2026-04-22",
    title: "Entity resolution polish",
    detail: "Hover product details (MRP/brand/stock). Swap canonical direction.",
    type: "polish",
  },
  {
    date: "2026-04-20",
    title: "Phase B2 — Basket analysis",
    detail: "30,018 pairs in derived.product_associations. Frequently Bought Together in ProductDrawer.",
    type: "feature",
  },
  {
    date: "2026-04-15",
    title: "Phase A3 — Pamphlet generator",
    detail: "Client-side PDF, AI highlight copy via Claude Haiku, GSheets CSV import.",
    type: "feature",
  },
  {
    date: "2026-04-12",
    title: "Phase A1 — Cash closure UI",
    detail: "EOD count vs system totals, manager verify/reject.",
    type: "feature",
  },
  {
    date: "2026-04-10",
    title: "Phase A2 — Daily ingestion + refresh",
    detail: "Pipeline trigger with run_ingestion flag. er4u_export.py Playwright auto-export.",
    type: "feature",
  },
  {
    date: "2026-04-05",
    title: "Tool plugin system (ADR-002)",
    detail: "api/tools/<name>/ auto-discovered with MANIFEST + router.",
    type: "refactor",
  },
  {
    date: "2026-04-01",
    title: "App schema separation (ADR-001)",
    detail: "app.* for human-authored data; derived.* truncated nightly.",
    type: "refactor",
  },
  {
    date: "2026-03-15",
    title: "10-step rebuild pipeline finalized",
    detail: "Steps 00–09 in deterministic order.",
    type: "feature",
  },
];

const TYPE_META = {
  feature: { label: "Feature", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  doc: { label: "Doc", color: "bg-blue-100 text-blue-700 border-blue-200" },
  refactor: { label: "Refactor", color: "bg-violet-100 text-violet-700 border-violet-200" },
  polish: { label: "Polish", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  fix: { label: "Fix", color: "bg-rose-100 text-rose-700 border-rose-200" },
  learning: { label: "Learning", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

export function Changelog() {
  return (
    <Section
      id="changelog"
      eyebrow="Evolution log"
      title="What shipped, when, why"
      description="Append-only timeline. Newest first. Updates land here when they ship — not when they're planned."
    >
      <div className="relative">
        {/* Vertical track */}
        <div className="absolute left-[12px] top-2 bottom-2 w-px bg-gradient-to-b from-blue-300 via-blue-400 to-slate-500" />

        <m.ol
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.05 }}
          className="space-y-4"
        >
          {ENTRIES.map((entry, i) => (
            <m.li key={i} variants={fadeInUp} className="relative flex gap-4 items-start">
              <m.div
                whileHover={{ scale: 1.3 }}
                className="relative z-10 shrink-0 mt-2 h-[10px] w-[10px] rounded-full bg-white border-2 border-blue-400 ring-4 ring-white"
              />
              <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors">
                <div className="flex items-baseline gap-3 flex-wrap mb-1">
                  <time className="text-[11px] font-mono text-slate-400">{entry.date}</time>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      TYPE_META[entry.type].color
                    )}
                  >
                    {TYPE_META[entry.type].label}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">{entry.title}</h3>
                <p className="mt-1 text-[12.5px] text-slate-600 leading-relaxed">{entry.detail}</p>
              </div>
            </m.li>
          ))}
        </m.ol>
      </div>
    </Section>
  );
}
