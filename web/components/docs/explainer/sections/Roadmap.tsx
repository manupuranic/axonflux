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
      { name: "A3 · Pamphlet generator v2", detail: "DSL JSON tree renderer (16 node types) → server HTML → Playwright PDF/PNG. Three-column editor (Chat | Products | Preview). 6-tool AI registry. LLM image agent with Tavily + Open Food Facts, SSE streaming. CSS Grid equal-height cards, horizontal layout. Force-rescan for broken URLs. AI Settings + OpenRouter. Versioned history. Migration 010.", status: "shipped" },
      { name: "A4 · Role-based access control", detail: "Three roles: admin (full access), manager (verify cash, approve agents + blog posts), staff (submit cash, use tools). require_manager dependency. Phase E MCP gets separate api_key auth. Frontend hides elements by role.", status: "planned" },
      { name: "A5 · Campaign Studio", detail: "Multi-channel design tool for staff: pamphlets, WhatsApp posts, Instagram creatives, posters. 6-phase delivery — (1) 7-table schema + 29-endpoint CRUD/asset API, (2) 3-panel visual editor (Layers / Preview / Properties) with live DSL tree, (3) AI chat with DSL tool registry (apply_dsl_patch, set_theme, style_region, add_banner) + chat history + new-session, (4) PDF + PNG export via Playwright with format-correct viewport. Format-aware canvas: page.width_mm/height_mm drives HTML renderer, PDF exporter, preview iframe — A4, WhatsApp 1080×1080, Instagram Story 1080×1920 all supported. Image upload with local static serving (swap-ready for R2/S3). (6) QA — 24 unit tests. Intelligence integration via D4.", status: "shipped" },
    ],
  },
  {
    key: "B",
    title: "Phase B — ML upgrade",
    blurb: "Replace SQL heuristics with validated models. Ship intelligence that teaches the retailer.",
    items: [
      { name: "B1 · ML demand forecasting", detail: "Data-eng complete: calendar_dim (Indian holidays + festivals), stockout_proxy censoring, app.ml_demand_predictions schema. LightGBM quantile model (P10/P50/P90) in ml/ — next.", status: "in-flight" },
      { name: "B2 · Basket analysis", detail: "30,018 pairs in derived.product_associations. Frequently Bought Together UI.", status: "shipped" },
      { name: "B3 · Product entity resolution", detail: "RapidFuzz clustering, staff review UI, alias remap at aggregation source.", status: "shipped" },
      { name: "B4 · BOM Manager", detail: "In-house repackaging: loose raw materials (wheat, pulses, spices) → branded retail packets. app.product_bom with yield-based qty_per_unit. Auto-suggest on every rebuild. Step 04 stock position corrected: BOM consumption deducted, finished goods excluded.", status: "shipped" },
      { name: "B5 · Test Baseline", detail: "Critical path tests before Phase C: auth + role enforcement, lapsed tier math (30/60/90d), BOM yield consumption, customer activity counts, LocalStorageClient. 6 test files, persistent axonflux_test DB, UUID isolation per test. 12 storage tests including API-level image upload endpoint coverage.", status: "shipped" },
    ],
  },
  {
    key: "C",
    title: "Phase C — AI / Retail co-pilot",
    blurb: "LLM-powered content + decision support layered on the data foundation.",
    items: [
      { name: "C1 · Product content generation", detail: "Claude generates description, tags, key benefits for promoted products.", status: "planned" },
      { name: "C2 · Storage abstraction + product images", detail: "StorageClient ABC over boto3: LocalStorageClient (dev, data/uploads/ → /static/uploads) + R2StorageClient (prod, Cloudflare R2). Factory reads STORAGE_* env vars — switching provider = change .env only, zero code changes. Migration 012 adds image_url TEXT to app.products. POST /api/products/{barcode}/image endpoint (jpeg/png/webp, 10 MB limit). Image upload card in product detail UI. Bulk fetcher via Open Food Facts (scripts/fetch_product_images.py) — ~0% hit rate for Indian catalog; staff manual upload is primary path. All 12 storage tests green.", status: "shipped" },
      { name: "C3 · Embedding pipeline + pgvector", detail: "Catalog → vectors stored alongside in Postgres.", status: "planned" },
      { name: "C4 · RAG chatbot", detail: "Ask 'what should I reorder?' — answered from real signals.", status: "planned" },
      { name: "C5 · Daily decision engine", detail: "Briefing combining restock, demand spikes, dead stock, cash flags.", status: "planned" },
    ],
  },
  {
    key: "D",
    title: "Phase D — Agentic Intelligence",
    blurb: "Multi-agent system inside AxonFlux. All agents suggest — staff approves. Parallel where independent, sequential where output feeds the next step.",
    items: [
      { name: "D1 · Reorder Agent", detail: "Parallel per supplier: reads replenishment sheet + stock + lead times → draft purchase order per supplier, merged for staff review.", status: "planned" },
      { name: "D2 · Weekly Intelligence Agent", detail: "Sequential pipeline: sales summary → stock alerts → lapsed customers → cash status → one-screen weekly report for the owner.", status: "planned" },
      { name: "D3 · Dead Stock Clearance Agent", detail: "4,661 dead stock products cross-referenced with basket associations → ranked clearance list with bundle/discount suggestions per product.", status: "planned" },
      { name: "D4 · Pamphlet Intelligence Agent", detail: "Parallel fan-out: demand signals + expiry risk + basket associations → ranked product list for next pamphlet. Surfaced in Campaign Studio as a 'Suggest Products' action — populates campaign product list from live analytics, no manual search needed.", status: "planned" },
      { name: "D5 · Cash Discrepancy Agent", detail: "30-day closure history → pattern detection (recurring discrepancy? day-of-week bias? worsening trend?) → severity-flagged alert.", status: "planned" },
      { name: "D6 · Supplier Performance Agent", detail: "Parallel per supplier: spend trend, top products, stockout frequency → one-page brief per vendor before supplier meetings.", status: "planned" },
      { name: "D7 · Storefront Agent Group", detail: "Coordinator + 4 sub-agents. Product Selection → parallel fan-out (Image Agent: Open Food Facts→AI gen, Content Agent: Claude descriptions, SEO Agent: meta+schema.org) → Publisher Agent: upserts app.products + triggers public rebuild.", status: "planned" },
      { name: "D8 · Content Writer Agent", detail: "Topic seeds from PHM catalog + categories + basket associations → Claude drafts 800–1200 word blog post → SEO pass (meta, schema.org Article, slug) → app.blog_posts status:draft → staff approves → static export.", status: "planned" },
    ],
  },
  {
    key: "E",
    title: "Phase E — MCP Server",
    blurb: "AxonFlux exposes a read-only MCP server consumed by Manastra (personal intelligence OS) for owner briefings and anomaly alerts. No writes via MCP.",
    items: [
      { name: "E1 · MCP server scaffold", detail: "FastAPI MCP endpoint with API key auth (read-only role). 6 tools: daily_summary, stock_alerts, lapsed_customers, cash_status, health_signals, weekly_report.", status: "planned" },
      { name: "E2 · Manastra integration", detail: "Owner asks Manastra 'how did the store do?' → Manastra agent calls axonflux.weekly_report() → structured JSON → conversational answer with memory context.", status: "planned" },
      { name: "E3 · Anomaly watchdog", detail: "Manastra nightly agent calls stock_alerts() + cash_status() → if critical threshold crossed → Manastra notification to owner. No customer PII exposed via MCP.", status: "planned" },
    ],
  },
  {
    key: "F",
    title: "Phase F — Puranic Storefront",
    blurb: "puranic.in — public storefront for the supermarket. Static export to Vercel. Dashboard stays local. Brand: Puranic. Depends on C2 (storage + images) + D7 (agent content) + D8 (blog).",
    items: [
      { name: "F1 · Static export pipeline", detail: "Pipeline step exports public-safe JSON (products, offers, blog) → web/storefront-data/ → git push → Vercel auto-deploys. Internal dashboard stays local permanently. Images on Cloudflare R2 (S3-compatible, swap-provider-ready).", status: "planned" },
      { name: "F2 · Core pages", detail: "8 routes: / (homepage + hero), /products (catalogue), /products/[slug] (product page), /category/[slug], /offers, /offers/[id] (WhatsApp-shareable), /blog, /blog/[slug], /contact (WhatsApp enquiry).", status: "planned" },
      { name: "F3 · SEO foundation", detail: "Static HTML per product — Google indexes each SKU. schema.org Product + Article markup. sitemap.xml auto-generated. Blog targets long-tail: 'health benefits of horsegram', 'stone-ground wheat flour vs commercial'.", status: "planned" },
      { name: "F4 · WhatsApp integration", detail: "Enquire on WhatsApp button per product/offer. Meta-compatible product feed (JSON/CSV) generated by pipeline — staff uploads to WhatsApp Business Manager manually. Offer pages WhatsApp-share optimised (og:image, og:title).", status: "planned" },
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
      description="Phases compose. A lays the operational floor. B ships intelligence. C wraps it in an AI co-pilot. D adds agentic automation. E connects to Manastra via MCP. F opens a public surface."
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
