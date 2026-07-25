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
    date: "2026-07-26",
    title: "Phase A4 — Role-Based Access Control",
    detail: "Three-role lattice staff(1) < manager(2) < admin(3) via a require_role() guard factory in api/dependencies.py — adding a role is one dict line. Missing or garbage role claims map to level 0 and fail every gate (the old code silently defaulted them to staff). Migration 013 adds the users.role CHECK constraint (001 never had one). Endpoint audit: pipeline trigger/cancel manager+, pipeline reads staff+, cash verify manager+, entity confirm/reject manager+, recompute/alias-delete admin, everything else require_staff. Admin user-management API (/api/users: create, role change, deactivate, password reset — self-demotion/self-deactivation blocked) + Users section on Settings. Frontend hasRole() mirrors the lattice; UI hiding is UX, server 403 is the boundary. Final whole-branch review earned its keep: grep-driven sweeps can't see routes that never had a guard — /api/documentation shipped fully unauthenticated, and two SSE query-token side-door helpers (agents stream, pamphlet preview) still defaulted missing roles to staff; both closed via a shared assert_min_role(). 51 auth-related tests incl. 9-combo lattice matrix, forged-token, and race-to-DB-constraint cases. Machine identities deliberately NOT roles — Phase E gets an API-key plane.",
    type: "feature",
  },
  {
    date: "2026-07-25",
    title: "AxonFlux Academy — interactive learning portal at /academy",
    detail: "Learning platform generated from the real codebase, replacing the standalone System Design page and Docs Library (both absorbed as Academy tabs). Nine sections: synapse map (topic graph across data/backend/ML/AI domain bands with prereq edges), frontier topics with level-2/level-3 deep dives + mentor notes + exercises, feature case studies (data pipeline, RBAC, Campaign Studio, entity resolution, demand forecasting, cash closure, storage abstraction, customer analytics), 6-phase frontier roadmap (RBAC → embeddings → co-pilot → evals → agents → MCP) with a rejected-tech list as interview ammunition, architecture graph, rebuild-from-memory challenges with progressive hints, and an interview deck auto-derived from topics + features. Learning progress (confidence marks, revealed answers, completed challenges) lives in localStorage only — Academy data files are versioned content, never state. A local update-progress skill now maps every knowledge surface (Academy modules, this changelog, CLAUDE.md roadmap, docs library) so none drift when features ship.",
    type: "learning",
  },
  {
    date: "2026-07-25",
    title: "Campaign Studio product edits + BOM column backfill",
    detail: "Two fixes. (1) Chat product-update tool silently failed in Campaign Studio: shared update_products always queried PamphletItem, but Campaign Studio rows live in CampaignProduct — edits matched 0 rows and surfaced as phantom save failures. PamphletState now carries the backing model (PamphletItem default, CampaignProduct injected by the Campaign Studio chat route), and unmatched item_ids return to the LLM as not_found with a hint so it self-corrects instead of retrying blindly. (2) Step 04 stock position: CREATE TABLE IF NOT EXISTS skips existing tables, so databases built before BOM consumption tracking lacked total_bom_consumed and the INSERT failed — ADD COLUMN IF NOT EXISTS keeps the step idempotent on old and fresh databases alike.",
    type: "fix",
  },
  {
    date: "2026-05-31",
    title: "Campaign Studio — format-aware design authoring (Phases 1–6)",
    detail: "Campaign Studio graduates the pamphlet DSL into a general design-authoring tool. Format-as-data architecture: canvas dimensions (A4, A5, WhatsApp story, Instagram post, Facebook cover) are data rows, not code branches — the renderer reads width/height/margins from the format record. Multi-panel editor: canvas preview, product list with bulk management, AI chat with product context. Same apply_dsl_patch universal mutation tool as pamphlets. Direct image upload onto the canvas (via C2 storage). One-way export to the Pamphlets tool keeps legacy printing intact. Phase 6 QA: 24 unit tests over DSL mutation, format math, and export paths.",
    type: "feature",
  },
  {
    date: "2026-05-31",
    title: "Phase C2 — Storage abstraction + Cloudflare R2 integration",
    detail: "StorageClient ABC with two implementations: LocalStorageClient (dev — writes to data/uploads/, served via FastAPI StaticFiles at /static/uploads) and R2StorageClient (prod — Cloudflare R2 via boto3 S3-compatible API). Factory function get_storage_client() reads STORAGE_* env vars — switching storage provider requires zero code changes, only .env edits. Migration 012 adds image_url TEXT to app.products. New endpoint POST /api/products/{barcode}/image: validates content-type (jpeg/png/webp), 10 MB limit, uploads to storage, upserts image_url. Product detail page gains an image card with preview + upload button. Bulk fetcher script (scripts/fetch_product_images.py) queries Open Food Facts by EAN-13 barcode — discovered ~0% hit rate for Indian supermarket catalog (even Parle-G, Maggi, Colgate absent from OFF). Staff manual upload is primary image sourcing path. 12 storage tests green including API-level upload/reject/auth checks.",
    type: "feature",
  },
  {
    date: "2026-05-31",
    title: "Phase B5 — Test baseline",
    detail: "6 new test files covering the critical path before Phase C: test_api_auth.py (login, token decode, role enforcement), test_api_customers.py (lapsed tier math 30/60/90d, active filter, summary counts), test_api_analytics.py (summary endpoint, health signal flags), test_api_bom.py (confirm requires qty>0, reject marks status, duplicate prevention), test_pipeline_step04.py (BOM consumption math — wrong yield factor = daily stock error), test_storage.py (LocalStorageClient + R2StorageClient + image upload API). Persistent axonflux_test DB via scripts/setup_test_db.py. UUID isolation per test, dependency override pattern for test DB swap. pytest.ini registers integration mark for real-credential tests.",
    type: "feature",
  },
  {
    date: "2026-05-27",
    title: "Pamphlet renderer + AI overhaul — atomic tools, universal patch, A4 reflow",
    detail: "Two-pronged fix for chat reliability + render layout. RENDERER: (1) Empty product slots (deleted items) auto-skipped pre-chunking so the 5×5 grid reflows without phantom blanks. (2) Last A4 page uses grid-auto-rows with pre-computed calc((210mm-32px-(rows-1)*gap)/rows) row height so partial pages render identical card sizes to full pages, killing the dead row at page bottom. (3) Trailing nodes (banners, contact_strip, footer text) get tucked INSIDE the last A4 page div instead of spilling onto a fresh print sheet — partial pages place trailing below the grid in remaining row space; full pages use flex column with grid:flex 1 + trailing pinned to bottom. CHAT: root-caused 'AI says Done but nothing happens' to Haiku failing to chain get_layout → update_node calls. Fix: collapsed N-step chains into atomic single-call tools — set_grid(cols, rows, image_width_pct), style_region(region: footer|header|all_text|all_headings, ...), add_banner(headline, position: top|bottom, ...). Then went one level deeper: universal apply_dsl_patch(ops=[{op:set|style|insert|remove|move, ...}]) tool covers all DSL mutations in one call, lenient JSON parser repairs Python-literal mistakes from LLM. System prompt now injects compact DSL summary (node IDs visible inline) so LLM emits patches without prior get_layout round-trip. New image_width_pct field on SectionNode → CSS --img-w variable → product card image width configurable per pamphlet (default 38%, range 20–60). Also fixed banner-below-footer bug (text-based footers not detected), f-string brace escape crash in system prompt.",
    type: "feature",
  },
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
