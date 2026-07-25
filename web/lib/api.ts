import { clearToken, getToken } from "./auth";
import type {
  TokenResponse,
  AnalyticsSummary,
  DailyRevenue,
  DailyPayment,
  DailyPurchase,
  ProductHealthSignal,
  ReplenishmentItem,
  DemandTrendPoint,
  PaginatedResponse,
  HealthSignalParams,
  ReplenishmentParams,
  PipelineRun,
  FullRefreshResult,
  LastDataDate,
  CustomerListItem,
  CustomerBill,
  CustomerSummary,
  ActiveCustomer,
  CustomerParams,
  ChurnTier,
  LapsedParams,
  LapsedResponse,
  TopProduct,
  HotoResponse,
  HotoCreate,
  ProductSearchResult,
  ProductRecommendation,
  Pamphlet,
  PamphletSummary,
  PamphletCreate,
  PamphletUpdate,
  PamphletItemCreate,
  PamphletItemUpdate,
  PamphletItem,
  GSheetImportRequest,
  SuggestionCluster,
  ConfirmRequest,
  ConfirmResponse,
  RejectRequest,
  AliasListResponse,
  ProductDetail,
  LapsedExportParams,
  CampaignStudioMeta,
  CampaignSummary,
  Campaign,
  CampaignCreate,
  CampaignUpdate,
  CampaignProduct,
  CampaignProductCreate,
  CampaignProductUpdate,
  CampaignDesignSummary,
  CampaignDesign,
  CampaignDesignCreate,
  CampaignDesignUpdate,
  AssetLibraryItem,
  DesignChatRequest,
  DesignChatResponse,
  AppUserOut,
} from "@/types/api";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

function buildQuery(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    // Arrays expand to repeated keys: `?cond=a&cond=b`. FastAPI's `Query()`
    // collects these into a list, matching the parse_conditions wire format.
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        pairs.push(`${k}=${encodeURIComponent(String(item))}`);
      }
    } else {
      pairs.push(`${k}=${encodeURIComponent(String(v))}`);
    }
  }
  return pairs.length ? `?${pairs.join("&")}` : "";
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) {
      clearToken();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      throw error;
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : `Failed to fetch ${path}. Is the API running at ${BASE}?`
    );
  }
}

async function downloadWithAuth(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) { clearToken(); window.location.href = "/login"; return; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (username: string, password: string) =>
    apiFetch<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  summary: () => apiFetch<AnalyticsSummary>("/api/analytics/summary"),

  dailyRevenue: (from_date?: string, to_date?: string) =>
    apiFetch<DailyRevenue[]>(
      `/api/analytics/daily-revenue${buildQuery({ from_date, to_date })}`
    ),

  dailyPayments: (from_date?: string, to_date?: string) =>
    apiFetch<DailyPayment[]>(
      `/api/analytics/daily-payments${buildQuery({ from_date, to_date })}`
    ),

  dailyPurchases: (from_date?: string, to_date?: string) =>
    apiFetch<DailyPurchase[]>(
      `/api/analytics/daily-purchases${buildQuery({ from_date, to_date })}`
    ),

  healthSignals: (params: HealthSignalParams) =>
    apiFetch<PaginatedResponse<ProductHealthSignal>>(
      `/api/analytics/health-signals${buildQuery(params)}`
    ),

  downloadHealthExport: () => {
    const today = new Date().toISOString().slice(0, 10);
    return downloadWithAuth(`/api/analytics/health-export`, `product_health_${today}.csv`);
  },
  downloadSupplierExport: (supplier?: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const qs = supplier ? `?supplier=${encodeURIComponent(supplier)}` : "";
    const name = supplier
      ? `supplier_${supplier.replace(/\s+/g, "_").slice(0, 40)}_${today}.csv`
      : `supplier_report_${today}.csv`;
    return downloadWithAuth(`/api/analytics/supplier-export${qs}`, name);
  },

  listSuppliers: () =>
    apiFetch<{ supplier_name: string; supplier_region: string | null; lead_time_days: number; product_count: number }[]>("/api/suppliers"),

  replenishment: (params: ReplenishmentParams) =>
    apiFetch<PaginatedResponse<ReplenishmentItem>>(
      `/api/analytics/replenishment${buildQuery(params)}`
    ),

  topProducts: (days = 30, limit = 10, sort_by: "revenue" | "qty" = "revenue") =>
    apiFetch<TopProduct[]>(
      `/api/analytics/top-products${buildQuery({ days, limit, sort_by })}`
    ),

  demandTrend: (barcode: string, days = 60) =>
    apiFetch<DemandTrendPoint[]>(
      `/api/analytics/demand-trend/${encodeURIComponent(barcode)}?days=${days}`
    ),

  productDetail: (barcode: string) =>
    apiFetch<Record<string, unknown>>(
      `/api/products/${encodeURIComponent(barcode)}`
    ),

  uploadProductImage: async (barcode: string, file: File): Promise<{ image_url: string }> => {
    const token = getToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/products/${encodeURIComponent(barcode)}/image`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (res.status === 401) { clearToken(); window.location.href = "/login"; throw new Error("Unauthorized"); }
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  // Customers
  customers: (params: CustomerParams) =>
    apiFetch<PaginatedResponse<CustomerListItem>>(
      `/api/customers${buildQuery(params)}`
    ),

  customerSummary: () =>
    apiFetch<CustomerSummary>("/api/customers/summary"),

  bom: {
    suggestions: (status = "pending") =>
      apiFetch<import("@/types/api").BomSuggestionGroup[]>(
        `/api/tools/bom/suggestions?status=${encodeURIComponent(status)}`
      ),
    confirm: (body: { raw_barcode: string; finished_barcode: string; qty_per_unit: number; notes?: string | null; suggestion_id?: string | null }) =>
      apiFetch<import("@/types/api").BomMapping>("/api/tools/bom/confirm", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    reject: (suggestion_id: string) =>
      apiFetch<{ ok: boolean }>("/api/tools/bom/reject", {
        method: "POST",
        body: JSON.stringify({ suggestion_id }),
      }),
    mappings: (limit = 100, offset = 0) =>
      apiFetch<import("@/types/api").BomMapping[]>(
        `/api/tools/bom/mappings${buildQuery({ limit, offset })}`
      ),
    update: (id: string, body: { qty_per_unit?: number; notes?: string | null }) =>
      apiFetch<import("@/types/api").BomMapping>(`/api/tools/bom/mappings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/api/tools/bom/mappings/${id}`, { method: "DELETE" }),
    manual: (body: { raw_barcode: string; finished_barcode: string; qty_per_unit: number; notes?: string | null }) =>
      apiFetch<import("@/types/api").BomMapping>("/api/tools/bom/manual", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    productSearch: (q: string, limit = 20) =>
      apiFetch<{ barcode: string; item_name: string }[]>(
        `/api/tools/bom/product-search${buildQuery({ q, limit })}`
      ),
  },

  activeCustomers: (params: { limit?: number; offset?: number; [key: string]: unknown }) =>
    apiFetch<PaginatedResponse<ActiveCustomer>>(`/api/customers/active${buildQuery(params)}`),

  lapsedCustomers: (params: LapsedParams) =>
    apiFetch<LapsedResponse>(`/api/customers/lapsed${buildQuery(params)}`),

  downloadLapsedExport: (format: "csv" | "xlsx", params: LapsedExportParams = {}) => {
    const today = new Date().toISOString().slice(0, 10);
    const tierStr = params.tier ? `_${params.tier}` : "";
    return downloadWithAuth(
      `/api/customers/lapsed/export${buildQuery({ ...params, export_format: format })}`,
      `lapsed_customers${tierStr}_${today}.${format}`,
    );
  },

  customerHistory: (mobile: string, limit = 50) =>
    apiFetch<CustomerBill[]>(
      `/api/customers/${encodeURIComponent(mobile)}/history?limit=${limit}`
    ),

  // Pipeline
  pipelineLatestRun: () =>
    apiFetch<PipelineRun | null>("/api/pipeline/status/latest"),

  pipelineRunById: (runId: string) =>
    apiFetch<PipelineRun>(`/api/pipeline/status/${runId}`),

  pipelineTrigger: (runIngestion: boolean = false) =>
    apiFetch<{ run_id: string; status: string }>(
      `/api/pipeline/trigger${runIngestion ? "?run_ingestion=true" : ""}`,
      { method: "POST" }
    ),

  pipelineFullRefresh: (debug = false, includeMasters = false) => {
    const params = new URLSearchParams();
    if (debug) params.set("debug", "true");
    if (includeMasters) params.set("include_masters", "true");
    const qs = params.toString();
    return apiFetch<FullRefreshResult>(`/api/pipeline/full-refresh${qs ? `?${qs}` : ""}`, { method: "POST" });
  },

  pipelineLastDataDate: () =>
    apiFetch<LastDataDate>("/api/pipeline/last-data-date"),

  pipelineStatus: (limit: number = 10) =>
    apiFetch<PipelineRun[]>(`/api/pipeline/status?limit=${limit}`),

  pipelineCancel: (runId: string) =>
    apiFetch<{ status: string }>(`/api/pipeline/${runId}/cancel`, { method: "POST" }),

  // Products
  productSearch: (q: string, limit = 20) =>
    apiFetch<ProductSearchResult[]>(
      `/api/products/search${buildQuery({ q, limit })}`
    ),

  productRecommendations: (barcode: string, limit = 5) =>
    apiFetch<ProductRecommendation[]>(
      `/api/products/${encodeURIComponent(barcode)}/recommendations${buildQuery({ limit })}`
    ),

  // Pamphlets
  pamphlets: {
    list: (limit = 30, offset = 0) =>
      apiFetch<{ total: number; limit: number; offset: number; items: PamphletSummary[] }>(
        `/api/tools/pamphlets${buildQuery({ limit, offset })}`
      ),

    create: (body: PamphletCreate) =>
      apiFetch<Pamphlet>("/api/tools/pamphlets", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    get: (id: string) =>
      apiFetch<Pamphlet>(`/api/tools/pamphlets/${id}`),

    update: (id: string, body: PamphletUpdate) =>
      apiFetch<Pamphlet>(`/api/tools/pamphlets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    addItem: (id: string, item: PamphletItemCreate) =>
      apiFetch<PamphletItem>(`/api/tools/pamphlets/${id}/items`, {
        method: "POST",
        body: JSON.stringify(item),
      }),

    updateItem: (pamphletId: string, itemId: string, body: PamphletItemUpdate) =>
      apiFetch<PamphletItem>(`/api/tools/pamphlets/${pamphletId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    removeItem: (pamphletId: string, itemId: string) =>
      apiFetch<void>(`/api/tools/pamphlets/${pamphletId}/items/${itemId}`, {
        method: "DELETE",
      }),

    generateHighlights: (id: string) =>
      apiFetch<Pamphlet>(`/api/tools/pamphlets/${id}/ai/highlights`, {
        method: "POST",
      }),

    delete: (id: string) =>
      apiFetch<void>(`/api/tools/pamphlets/${id}`, { method: "DELETE" }),

    duplicate: (id: string) =>
      apiFetch<Pamphlet>(`/api/tools/pamphlets/${id}/duplicate`, {
        method: "POST",
      }),

    importFromSheet: (body: GSheetImportRequest) =>
      apiFetch<Pamphlet>("/api/tools/pamphlets/import-gsheet", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // Entity Resolution (B3)
  entityResolution: {
    suggestions: (params?: { status?: string; min_score?: number; limit?: number; offset?: number }) =>
      apiFetch<SuggestionCluster[]>(
        `/api/tools/entity-resolution/suggestions${buildQuery(params ?? {})}`
      ),

    confirm: (body: ConfirmRequest) =>
      apiFetch<ConfirmResponse>("/api/tools/entity-resolution/confirm", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    reject: (body: RejectRequest) =>
      apiFetch<{ ok: boolean }>("/api/tools/entity-resolution/reject", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    aliases: (params?: { canonical_barcode?: string; limit?: number; offset?: number }) =>
      apiFetch<AliasListResponse>(
        `/api/tools/entity-resolution/aliases${buildQuery(params ?? {})}`
      ),

    deleteAlias: (aliasBarcode: string) =>
      apiFetch<void>(
        `/api/tools/entity-resolution/aliases/${encodeURIComponent(aliasBarcode)}`,
        { method: "DELETE" }
      ),

    recompute: (minScore = 78) =>
      apiFetch<{ status: string; message: string; pid: number }>(
        `/api/tools/entity-resolution/recompute${buildQuery({ min_score: minScore })}`,
        { method: "POST" }
      ),

    productDetail: (barcode: string) =>
      apiFetch<ProductDetail>(
        `/api/tools/entity-resolution/product/${encodeURIComponent(barcode)}`
      ),
  },

  // Docs — markdown library browser
  docs: {
    list: () =>
      apiFetch<Array<{ category: string; slug: string; filename: string; title: string }>>(
        "/api/documentation"
      ),

    get: (slug: string) =>
      apiFetch<{ slug: string; content: string }>(
        `/api/documentation/${slug}`
      ),
  },

  // HOTO — Daily Cash Closure
  hoto: {
    getByDate: (date: string) =>
      apiFetch<HotoResponse>(`/api/tools/cash-closure/date/${date}`),

    list: (limit = 30, offset = 0) =>
      apiFetch<{ total: number; limit: number; offset: number; items: HotoResponse[] }>(
        `/api/tools/cash-closure${buildQuery({ limit, offset })}`
      ),

    saveDraft: (body: HotoCreate) =>
      apiFetch<HotoResponse>("/api/tools/cash-closure/draft", {
        method: "PUT",
        body: JSON.stringify(body),
      }),

    submit: (body: HotoCreate) =>
      apiFetch<HotoResponse>("/api/tools/cash-closure", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    verify: (id: string, status: "verified" | "rejected", notes?: string) =>
      apiFetch<HotoResponse>(`/api/tools/cash-closure/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
      }),
  },

  // Campaign Studio
  campaignStudio: {
    meta: () =>
      apiFetch<CampaignStudioMeta>("/api/tools/campaign-studio/meta"),

    listCampaigns: (params: { limit?: number; offset?: number; status?: string } = {}) =>
      apiFetch<{ total: number; limit: number; offset: number; items: CampaignSummary[] }>(
        `/api/tools/campaign-studio/campaigns${buildQuery(params)}`
      ),

    getCampaign: (id: string) =>
      apiFetch<Campaign>(`/api/tools/campaign-studio/campaigns/${id}`),

    createCampaign: (body: CampaignCreate) =>
      apiFetch<Campaign>("/api/tools/campaign-studio/campaigns", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    updateCampaign: (id: string, body: CampaignUpdate) =>
      apiFetch<Campaign>(`/api/tools/campaign-studio/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    deleteCampaign: (id: string) =>
      apiFetch<void>(`/api/tools/campaign-studio/campaigns/${id}`, { method: "DELETE" }),

    duplicateCampaign: (id: string) =>
      apiFetch<Campaign>(`/api/tools/campaign-studio/campaigns/${id}/duplicate`, { method: "POST" }),

    listProducts: (campaignId: string) =>
      apiFetch<CampaignProduct[]>(`/api/tools/campaign-studio/campaigns/${campaignId}/products`),

    addProduct: (campaignId: string, body: CampaignProductCreate) =>
      apiFetch<CampaignProduct>(`/api/tools/campaign-studio/campaigns/${campaignId}/products`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    bulkAddProducts: (campaignId: string, barcodes: string[]) =>
      apiFetch<CampaignProduct[]>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/products/bulk-add`,
        { method: "POST", body: JSON.stringify({ barcodes }) }
      ),

    updateProduct: (campaignId: string, productId: string, body: CampaignProductUpdate) =>
      apiFetch<CampaignProduct>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/products/${productId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),

    removeProduct: (campaignId: string, productId: string) =>
      apiFetch<void>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/products/${productId}`,
        { method: "DELETE" }
      ),

    importFromPamphlet: (campaignId: string, pamphletId: string) =>
      apiFetch<CampaignProduct[]>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/products/import-pamphlet`,
        { method: "POST", body: JSON.stringify({ pamphlet_id: pamphletId }) }
      ),

    listDesigns: (campaignId: string) =>
      apiFetch<CampaignDesignSummary[]>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs`
      ),

    createDesign: (campaignId: string, body: CampaignDesignCreate) =>
      apiFetch<CampaignDesign>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs`,
        { method: "POST", body: JSON.stringify(body) }
      ),

    getDesign: (campaignId: string, designId: string) =>
      apiFetch<CampaignDesign>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}`
      ),

    updateDesign: (campaignId: string, designId: string, body: CampaignDesignUpdate) =>
      apiFetch<CampaignDesign>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),

    deleteDesign: (campaignId: string, designId: string) =>
      apiFetch<void>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}`,
        { method: "DELETE" }
      ),

    previewDesign: async (
      campaignId: string,
      designId: string,
      dsl?: Record<string, unknown> | null,
      theme?: Record<string, unknown> | null
    ): Promise<string> => {
      const token = getToken();
      const res = await fetch(
        `${BASE}/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}/preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ dsl, theme }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },

    duplicateDesign: (campaignId: string, designId: string) =>
      apiFetch<CampaignDesign>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}/duplicate`,
        { method: "POST" }
      ),

    exportDesignPdf: (campaignId: string, designId: string, title: string) =>
      downloadWithAuth(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}/export-pdf`,
        `${title}.pdf`
      ),

    exportDesignImage: (campaignId: string, designId: string, title: string) =>
      downloadWithAuth(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}/export-image`,
        `${title}.png`
      ),

    exportAsPamphlet: (
      campaignId: string,
      body: { design_id: string; pamphlet_title?: string; valid_from?: string; valid_until?: string }
    ) =>
      apiFetch<{ pamphlet_id: string; title: string }>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/export-as-pamphlet`,
        { method: "POST", body: JSON.stringify(body) }
      ),

    listAssets: (kind?: string) =>
      apiFetch<AssetLibraryItem[]>(
        `/api/tools/campaign-studio/assets${buildQuery({ kind })}`
      ),

    uploadAsset: async (file: File, kind: string, alt?: string): Promise<AssetLibraryItem> => {
      const token = getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${BASE}/api/tools/campaign-studio/assets/upload${buildQuery({ kind, alt })}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      return res.json();
    },

    uploadCampaignAsset: async (campaignId: string, file: File): Promise<string> => {
      const token = getToken();
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(
        `${BASE}/api/tools/campaign-studio/campaigns/${campaignId}/assets/upload`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail ?? "Upload failed");
      }
      const data = await resp.json();
      return `${BASE}${data.url}`;
    },

    deleteAsset: (id: string) =>
      apiFetch<void>(`/api/tools/campaign-studio/assets/${id}`, { method: "DELETE" }),

    getDesignChatHistory: (campaignId: string, designId: string) =>
      apiFetch<{ role: string; content: string }[]>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}/chat`
      ),

    clearDesignChat: (campaignId: string, designId: string) =>
      apiFetch<{ deleted: number }>(
        `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}/chat`,
        { method: "DELETE" }
      ),

    chatDesign: async (campaignId: string, designId: string, body: DesignChatRequest): Promise<DesignChatResponse> => {
      // AI chat can take 60-120s — route through long-timeout proxy instead of
      // the rewrite-based proxy which drops connections after ~30s.
      const backendPath = `/api/tools/campaign-studio/campaigns/${campaignId}/designs/${designId}/chat`;
      const token = getToken();
      const res = await fetch(
        `/api/chat-proxy?path=${encodeURIComponent(backendPath)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  },
};

// Users (A4 — admin-only user management)
export const usersApi = {
  list: () => apiFetch<AppUserOut[]>("/api/users"),

  create: (body: { username: string; password: string; full_name: string | null; role: string }) =>
    apiFetch<AppUserOut>("/api/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  patch: (
    id: string,
    body: Partial<{ full_name: string; role: string; is_active: boolean; password: string }>
  ) =>
    apiFetch<AppUserOut>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
