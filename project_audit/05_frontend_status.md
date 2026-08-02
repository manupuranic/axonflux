# 05 — Frontend Status

Next.js app under `web/`. App Router with two route groups: `(auth)` (public login) and `(internal)` (protected, sidebar shell). No `(public)` group exists yet — that's the eventual Phase F storefront location.

## Current Dashboard — Pages

All routes below are fully implemented (not stubs) unless noted.

**`(auth)/login`** — JWT login form.

**`(internal)/dashboard`**
- `dashboard` — 14 KPI cards, revenue/purchase/payment-breakdown charts, top products, "Refresh Data" pipeline trigger
- `dashboard/health` — paginated, filterable product health signals (fast/slow/dead/spike)
- `dashboard/replenishment` — supplier-filterable, urgent-only-toggle restock recommendations

**`(internal)/customers`**
- `customers` — searchable table, filters, drawer with purchase history
- `customers/lapsed` — churn-tier (at-risk/lapsed/lost) list with CSV/XLSX export

**`(internal)/products`**
- `products/[barcode]` — product detail (demand trend chart, frequently-bought-together recommendations)

**`(internal)/tools`** (staff tool plugins, mirrors backend `api/tools/*`)
- `tools/cash-closure` — EOD cash count entry, live delta, verify/reject flow
- `tools/pamphlet-generator` + `[id]` — DSL v2 builder (chat / products / preview 3-panel)
- `tools/pamphlet-generator/[id]/legacy` — old client-side PDF builder, kept intentionally for rollback, not active dead code
- `tools/campaign-studio` + `[id]` + `[id]/designs/[designId]/edit` — format-as-data canvas, AI chat, asset library, dedicated design editor (largest/most complex route in the app, 1000+ lines each for the two `[id]` pages)
- `tools/bom-manager` — BOM suggestion review/confirm/manual mapping
- `tools/entity-resolution` — duplicate-barcode cluster review UI

**`(internal)/settings`** — admin user management (RBAC)

**`(internal)/docs`, `docs/library`** — intentional redirect stubs to `/academy/deep-dive` and `/academy/library` (kept alive for old bookmarks, not incomplete work)

**`(internal)/academy`** — see `08_learning_system.md` for full detail; all sub-pages populated, none are stubs: `academy`, `topics`, `topics/[id]`, `graph` (Synapse Map), `path`, `features`, `features/[id]`, `architecture`, `roadmap`, `rebuild`, `interview`, `deep-dive`, `library`.

**Root** — `app/page.tsx` redirects to `/login`. `app/api/chat-proxy/route.ts` is a Next.js API route working around a 30-second rewrite timeout for the long-running Campaign Studio AI chat.

## Reusable Components

Organized by category under `web/components/`:

- **Charts**: `RevenueChart`, `PurchaseChart`, `PaymentBreakdownChart`, `DemandTrendChart`
- **Dashboard/KPI**: `KpiCard`, `SummaryGrid`, `TopProductsCard`
- **Tables**: `CustomerTable`, `HealthSignalTable`, `ReplenishmentTable`, `AliasTable`
- **Drawers/Modals**: `CustomerDrawer`, `ProductDrawer`, `HistoryDrawer`, `PamphletItemEditModal`, `PipelineTriggerModal`
- **Forms**: `LoginForm`, `HotoForm` + `DenominationGrid`/`DynamicRows`/`ReconciliationSummary`/`HotoHistory`
- **Layout/Shared**: `Sidebar`, `Pagination`, `FilterBuilder`, `DataStateWrapper`
- **Pamphlet tool**: `ChatPanel`, `ModelDropdown`, `PamphletItemCard`, `PamphletPDFTemplate`/`Viewer`, `PreviewIframe`, `ProductSearchInput`, `ProductsPanel`, `ToolCallPill`
- **Entity resolution**: `EntityResolutionPage`, `SuggestionClusterCard`
- **Academy**: `AcademyNav`, `ArchitectureMap`, `ConfidenceControl`, `RevealCard`, `SynapseMap`, `YouAreHere`, shared `ui.tsx` primitives
- **Docs/Explainer** (`docs/explainer/`): `ExplainerPage` orchestrator + ~14 section components (Hero, PipelineStepper, SqlDeepDive, FailureCases, Scaling, Roadmap, Changelog, InterviewMode, AgenticArchitecture, ArchitectureDiagram, CodebaseTree, ConceptsGrid, DataFlowWalkthrough, ProblemStatement, Tradeoffs, Bonus)
- **UI primitives** (shadcn-style): `badge`, `button`, `card`, `input`, `scroll-area`, `select`, `separator`, `sheet`, `skeleton`, `table`, `tabs`, `textarea`
- **Badges**: `SignalBadge`, `UrgencyBadge`

## Current UX Architecture

**State management:** no Redux/Zustand/react-query — deliberately plain `fetch` + custom hooks (`useFetch`, `usePaginatedFetch`, `useDebounce`) + component-local `useState`/`useEffect`. One exception: `web/lib/academy/progress.ts` exposes a `useProgress()` hook, localStorage-backed, explicitly documented in its own code as a stop-gap ("if progress ever needs to survive browsers/devices, promote to `app.academy_progress`").

**Auth:** JWT stored in `localStorage` (`web/lib/auth.ts`, keys `axonflux_token`/`axonflux_user`). `hasRole()` mirrors the backend's `ROLE_LEVELS` lattice — a manually-maintained duplication the code comments explicitly flag as a "keep in sync" risk. If the backend lattice ever changes without a matching frontend edit, role-gating silently drifts.

**API client:** single file `web/lib/api.ts` (714 lines) — one `api` object namespacing every route by domain (analytics, customers, pipeline, products, pamphlets, entityResolution, docs, hoto, campaignStudio) + separate `usersApi`. Core `apiFetch<T>()` wrapper injects the JWT header, handles 401 by clearing token + redirecting to `/login`, throws helpful errors including a "is the API running at {BASE}?" hint on network failure. No axios/ky, no retry/cache layer — a straightforward hand-rolled REST client whose shapes mirror FastAPI routes 1:1 via `web/types/api.ts`. `NEXT_PUBLIC_API_BASE_URL` must stay an empty-string fallback per `[[feedback_next_public_api_base_url]]` memory — a hardcoded hostname here previously broke phone/Tailscale/LAN clients.

**Long-running AI chat** (Campaign Studio) routes through the `chat-proxy` Next.js API route specifically to dodge the platform's 30-second rewrite timeout — a real, previously-hit constraint, not speculative engineering.

## Frontend/Backend Parity

No mismatches found — `web/lib/api.ts` tracks the backend's shipped surface closely (auth, analytics, customers, pipeline, BOM, pamphlets, entity resolution, campaign studio, users/RBAC all present on both sides). Phase C items still unbuilt on the backend (C1 content gen, C3 embeddings, C4 RAG, C5 decision engine) correspondingly have zero frontend surface — this is "nothing built yet on either side," not drift.

## Missing Pages (expected gaps, not bugs — nothing invented, backend doesn't have these yet either)

- No RAG chatbot UI (C4 — planned as a "dashboard sidebar chat")
- No "What should I do today?" daily briefing view (C5)
- No agent-run dashboard/audit log UI for any Phase D agent (Reorder, Weekly Intelligence, Dead Stock Clearance, Cash Discrepancy, Supplier Performance, Storefront Group, Content Writer)
- No `app.blog_posts` review/approval UI (D8 output)
- No MCP server admin/status page (Phase E)
- No `app/(public)/` route group at all (Phase F storefront) — the repo currently has exactly two route groups, `(auth)` and `(internal)`
