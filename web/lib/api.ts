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
  CustomerParams,
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
} from "@/types/api";

const BASE = "http://localhost:8000";
// const BASE = "http://192.168.1.20:8000"

function buildQuery(params: Record<string, unknown>): string {
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return filtered ? `?${filtered}` : "";
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

  // Customers
  customers: (params: CustomerParams) =>
    apiFetch<PaginatedResponse<CustomerListItem>>(
      `/api/customers${buildQuery(params)}`
    ),

  customerSummary: () =>
    apiFetch<CustomerSummary>("/api/customers/summary"),

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
};
