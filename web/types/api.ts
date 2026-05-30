// Auth
export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: string;
  full_name: string | null;
}

// Analytics
export interface AnalyticsSummary {
  latest_date: string | null;
  total_revenue_last_7d: number | null;
  total_bills_last_7d: number | null;
  total_purchases_last_7d: number | null;
  total_purchase_bills_last_7d: number | null;
  total_credit_last_7d: number | null;
  fast_moving_count: number;
  slow_moving_count: number;
  dead_stock_count: number;
  demand_spike_count: number;
  products_needing_reorder: number;
  total_unique_customers: number;
  repeat_customer_percent: number | null;
  new_customers_last_30d: number;
  walk_in_revenue_percent: number | null;
}

export interface TopProduct {
  rank: number;
  barcode: string;
  product_name: string | null;
  total_revenue: number;
  total_qty: number;
}

export interface DailyRevenue {
  sale_date: string;
  total_bills: number | null;
  total_items_sold: number | null;
  total_revenue: number | null;
  avg_bill_value: number | null;
}

export interface DailyPayment {
  sale_date: string;
  total_bills: number;
  cash_total: number;
  card_total: number;
  google_pay_total: number;
  phonepe_total: number;
  paytm_total: number;
  upi_total: number;
  credit_total: number;
  cn_redeemed_total: number;
  total_discount: number;
  membercard_discount_total: number;
}

export interface DailyPurchase {
  purchase_date: string;
  total_purchase_bills: number | null;
  total_quantity_purchased: number | null;
  total_taxable_value: number | null;
  total_settled_amount: number | null;
  total_due_amount: number | null;
}

export interface ProductHealthSignal {
  product_id: string;
  product_name: string | null;
  fast_moving_flag: boolean | null;
  slow_moving_flag: boolean | null;
  dead_stock_flag: boolean | null;
  demand_spike_flag: boolean | null;
  predicted_daily_demand: number | null;
  last_7_day_avg: number | null;
  last_30_day_avg: number | null;
  last_60_day_avg: number | null;
  demand_volatility: number | null;
  avg_monthly_consumption: number | null;
  suppliers: string | null;
}

export interface ReplenishmentItem {
  barcode: string;
  product_name: string | null;
  supplier_name: string | null;
  system_stock: number | null;
  predicted_daily_demand: number | null;
  days_of_cover: number | null;
  min_stock: number | null;
  max_stock: number | null;
  required_quantity: number | null;
  lead_time_days: number | null;
}

export interface DemandTrendPoint {
  date: string;
  quantity_sold: number;
  revenue: number;
  last_7_day_avg: number | null;
  last_30_day_avg: number | null;
  predicted_daily_demand: number | null;
}

export interface PaginatedResponse<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

// Customers
export interface CustomerListItem {
  mobile_clean: string;
  display_name: string | null;
  is_walk_in: boolean;
  is_member: boolean;
  first_seen_date: string | null;
  last_seen_date: string | null;
  total_bills: number | null;
  total_revenue: number | null;
  avg_bill_value: number | null;
  total_discount_received: number | null;
  days_since_last_visit: number | null;
  avg_days_between_visits: number | null;
  is_repeat: boolean | null;
  preferred_payment: "cash" | "card" | "upi" | "credit" | null;
}

export interface CustomerBill {
  bill_no: string | null;
  bill_date: string | null;
  net_total: number | null;
  total_discount: number | null;
  cash_total: number | null;
  card_total: number | null;
  upi_total: number | null;
  credit_total: number | null;
}

export interface CustomerSummary {
  total_unique_customers: number;
  repeat_customer_count: number;
  repeat_customer_percent: number;
  avg_bill_value: number | null;
  members_count: number;
  new_customers_last_30d: number;
  walk_in_revenue_percent: number | null;
}

// BOM Manager
export interface BomSuggestion {
  id: string;
  raw_barcode: string;
  raw_name: string | null;
  finished_barcode: string;
  finished_name: string | null;
  similarity_score: number;
  status: string;
}

export interface BomSuggestionGroup {
  raw_barcode: string;
  raw_name: string | null;
  suggestions: BomSuggestion[];
  max_score: number;
}

export interface BomMapping {
  id: string;
  raw_barcode: string;
  raw_name: string | null;
  finished_barcode: string;
  finished_name: string | null;
  qty_per_unit: number;
  notes: string | null;
  confirmed_at: string | null;
}

export interface ActiveCustomer {
  mobile_clean: string;
  display_name: string | null;
  is_member: boolean;
  is_repeat: boolean | null;
  total_bills: number | null;
  total_revenue: number | null;
  avg_bill_value: number | null;
  last_purchase_date: string | null;
  days_since_last_visit: number | null;
  preferred_payment: "cash" | "card" | "upi" | "credit" | null;
}

export type ChurnTier = "active" | "at-risk" | "lapsed" | "lost";

export interface LapsedCustomer {
  mobile_clean: string;
  display_name: string | null;
  is_member: boolean;
  total_bills: number | null;
  total_revenue: number | null;
  avg_bill_value: number | null;
  last_purchase_date: string | null;
  days_since_last_visit: number | null;
  avg_days_between_visits: number | null;
  preferred_payment: "cash" | "card" | "upi" | "credit" | null;
  churn_tier: ChurnTier;
}

export interface LapsedSummary {
  active_count: number;
  at_risk_count: number;
  lapsed_count: number;
  lost_count: number;
  total_count: number;
}

export interface LapsedResponse {
  total: number;
  limit: number;
  offset: number;
  summary: LapsedSummary;
  items: LapsedCustomer[];
}

export interface LapsedParams {
  tier?: ChurnTier;
  /** Each entry: `field_key:op:value` — see api.lib.filters.parse_conditions. */
  cond?: string[];
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface LapsedExportParams {
  tier?: ChurnTier;
  cond?: string[];
}

export interface CustomerParams {
  search?: string;
  is_repeat?: boolean;
  is_member?: boolean;
  include_walkin?: boolean;
  sort_by?: "total_revenue" | "total_bills" | "last_seen_date" | "avg_bill_value";
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

// Pipeline
export interface PipelineRun {
  id: string;
  triggered_at: string;
  pipeline_type: "weekly_full" | "weekly_full_with_ingestion" | "full_refresh";
  status: "running" | "success" | "failed" | "cancelled";
  completed_at: string | null;
  log_output?: string | null;
  error_message?: string | null;
}

export interface FullRefreshResult {
  run_id: string;
  status: string;
  days_to_export: number;
  last_data_date: string | null;
}

export interface LastDataDate {
  last_data_date: string | null;
  days_behind: number | null;
}

// Query params
export interface HealthSignalParams {
  flag?: "all" | "fast" | "slow" | "dead" | "spike";
  search?: string;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface ReplenishmentParams {
  supplier?: string;
  urgent_only?: boolean;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

// HOTO — Daily Cash Closure
export interface HotoLineItem {
  description: string;
  amount: number;
}

export interface HotoResponse {
  id: string;
  closure_date: string;
  status: "draft" | "submitted" | "verified" | "rejected";
  submitted_at: string | null;

  opening_cash: number | null;
  net_sales: number | null;
  sodexo_collection: number | null;
  manual_billings: HotoLineItem[];
  old_balance_collections: HotoLineItem[];
  distributor_expiry: number | null;
  oil_crush: number | null;
  other_income: number | null;

  pluxee_amount: number | null;
  paytm_amount: number | null;
  phonepe_amount: number | null;
  card_amount: number | null;
  credits_given: HotoLineItem[];
  returns_amount: number | null;

  expenses: HotoLineItem[];

  physical_cash_counted: number | null;
  denominations_opening: Record<string, number>;
  denominations_sales: Record<string, number>;

  total_inside_counter: number | null;
  total_outside_counter: number | null;
  expected_cash: number | null;
  difference_amount: number | null;

  notes: string | null;
}

// Products — search
export interface ProductSearchResult {
  barcode: string;
  canonical_name: string;
  category: string | null;
  mrp: number | null;
}

export interface ProductRecommendation {
  other_barcode: string;
  canonical_name: string;
  category: string | null;
  mrp: number | null;
  co_occurrences: number;
  confidence: number | string;
  lift: number | string;
}

// Pamphlets
export interface PamphletItem {
  id: string;
  pamphlet_id: string;
  barcode: string | null;
  display_name: string | null;
  offer_price: number | null;
  original_price: number | null;
  highlight_text: string | null;
  sort_order: number;
  image_url: string | null;
}

export interface PamphletItemCreate {
  barcode?: string | null;
  display_name?: string | null;
  offer_price?: number | null;
  original_price?: number | null;
  highlight_text?: string | null;
  sort_order?: number;
  image_url?: string | null;
}

export interface PamphletItemUpdate {
  display_name?: string | null;
  offer_price?: number | null;
  original_price?: number | null;
  highlight_text?: string | null;
  sort_order?: number | null;
  image_url?: string | null;
}

export interface Pamphlet {
  id: string;
  title: string;
  template_type: string;
  created_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_published: boolean;
  rows: number;
  cols: number;
  items: PamphletItem[];
}

export interface PamphletSummary {
  id: string;
  title: string;
  template_type: string;
  valid_from: string | null;
  valid_until: string | null;
  is_published: boolean;
  rows: number;
  cols: number;
  item_count: number;
}

export interface GSheetImportRequest {
  url: string;
  title: string;
  rows?: number;
  cols?: number;
}

export interface PamphletCreate {
  title: string;
  template_type?: string;
  valid_from?: string | null;
  valid_until?: string | null;
  rows?: number;
  cols?: number;
}

export interface PamphletUpdate {
  title?: string | null;
  template_type?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  is_published?: boolean | null;
  rows?: number | null;
  cols?: number | null;
}

// Entity Resolution (B3)
export interface SuggestionItem {
  id: string;
  alias_barcode: string;
  canonical_candidate: string;
  alias_name: string | null;
  canonical_name: string | null;
  similarity_score: number;
  status: string;
}

export interface SuggestionCluster {
  cluster_key: string;
  canonical_candidate: string;
  canonical_name: string | null;
  members: SuggestionItem[];
  min_score: number;
  max_score: number;
}

export interface AliasResponse {
  alias_barcode: string;
  canonical_barcode: string;
  canonical_name: string | null;
  similarity_score: number | null;
  confirmed_at: string | null;
  confirmed_by_username: string | null;
  notes: string | null;
}

export interface ConfirmRequest {
  alias_barcode: string;
  canonical_barcode: string;
  notes?: string | null;
}

export interface ProductDetail {
  barcode: string;
  item_name: string | null;
  brand: string | null;
  mrp: number | null;
  purchase_price: number | null;
  rate: number | null;
  size: string | null;
  expiry_date: string | null;
  hsn_code: string | null;
  system_stock: number | null;
  total_sales_qty: number | null;
  last_sold: string | null;
}

export interface RejectRequest {
  suggestion_id: string;
  notes?: string | null;
}

export interface ConfirmResponse {
  alias: AliasResponse;
  pipeline_rebuild_required: boolean;
}

export interface AliasListResponse {
  total: number;
  items: AliasResponse[];
}

export interface HotoCreate {
  closure_date: string;
  opening_cash?: number | null;
  net_sales?: number | null;
  sodexo_collection?: number | null;
  manual_billings?: HotoLineItem[];
  old_balance_collections?: HotoLineItem[];
  distributor_expiry?: number | null;
  oil_crush?: number | null;
  other_income?: number | null;
  pluxee_amount?: number | null;
  paytm_amount?: number | null;
  phonepe_amount?: number | null;
  card_amount?: number | null;
  credits_given?: HotoLineItem[];
  returns_amount?: number | null;
  expenses?: HotoLineItem[];
  physical_cash_counted?: number | null;
  denominations_opening?: Record<string, number>;
  denominations_sales?: Record<string, number>;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Campaign Studio
// ---------------------------------------------------------------------------

export type CampaignStatus = "draft" | "active" | "archived";
export type ProductPriority = "hero" | "feature" | "supporting";
export type DesignStatus = "draft" | "approved" | "exported";

export interface CampaignSummary {
  id: string;
  title: string;
  campaign_type: string | null;
  objective: string | null;
  channels: string[];
  status: CampaignStatus;
  created_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  product_count: number;
  design_count: number;
}

export interface Campaign extends CampaignSummary {
  audience: string | null;
  theme_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CampaignCreate {
  title: string;
  campaign_type?: string | null;
  objective?: string | null;
  audience?: string | null;
  theme_id?: string | null;
  channels?: string[];
  valid_from?: string | null;
  valid_until?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CampaignUpdate {
  title?: string;
  campaign_type?: string | null;
  objective?: string | null;
  audience?: string | null;
  theme_id?: string | null;
  channels?: string[];
  status?: CampaignStatus;
  valid_from?: string | null;
  valid_until?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CampaignProduct {
  id: string;
  campaign_id: string;
  barcode: string | null;
  display_name: string | null;
  priority: ProductPriority;
  role: string | null;
  sort_order: number;
  offer_price: number | null;
  original_price: number | null;
  highlight_text: string | null;
  image_url: string | null;
  category: string | null;
  unit: string | null;
}

export interface CampaignProductCreate {
  barcode?: string | null;
  display_name?: string | null;
  priority?: ProductPriority;
  role?: string | null;
  sort_order?: number;
  offer_price?: number | null;
  original_price?: number | null;
  highlight_text?: string | null;
  image_url?: string | null;
  category?: string | null;
  unit?: string | null;
}

export interface CampaignProductUpdate {
  display_name?: string | null;
  priority?: string | null;
  role?: string | null;
  sort_order?: number | null;
  offer_price?: number | null;
  original_price?: number | null;
  highlight_text?: string | null;
  image_url?: string | null;
  category?: string | null;
  unit?: string | null;
}

export interface CampaignDesignSummary {
  id: string;
  campaign_id: string;
  title: string;
  design_type: string;
  target: string;
  status: DesignStatus;
  created_at: string | null;
}

export interface CampaignDesign extends CampaignDesignSummary {
  target_width_px: number | null;
  target_height_px: number | null;
  dsl: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  current_version_id: string | null;
  version_retention: number;
}

export interface CampaignDesignCreate {
  title?: string;
  design_type: string;
  target: string;
  target_width_px?: number | null;
  target_height_px?: number | null;
  version_retention?: number;
}

export interface CampaignDesignUpdate {
  title?: string | null;
  status?: string | null;
  dsl?: Record<string, unknown> | null;
  theme?: Record<string, unknown> | null;
  version_retention?: number | null;
}

export interface AssetLibraryItem {
  id: string;
  kind: string;
  url: string;
  alt: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

export interface CampaignStudioMeta {
  campaign_types: string[];
  objectives: string[];
  design_types: string[];
  targets: string[];
  asset_kinds: string[];
}

export interface DesignChatRequest {
  message: string;
  provider?: string | null;
  model?: string | null;
}

export interface DesignToolCall {
  tool_name: string;
  args: Record<string, unknown>;
  result: unknown;
  is_error: boolean;
}

export interface DesignChatResponse {
  assistant_text: string | null;
  tool_calls: DesignToolCall[];
  version_id: string | null;
  dsl: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  cost_usd: number;
  provider: string;
  model: string;
}
