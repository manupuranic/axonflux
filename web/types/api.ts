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
  pipeline_type: "weekly_full" | "weekly_full_with_ingestion";
  status: "running" | "success" | "failed";
  completed_at: string | null;
  log_output?: string | null;
  error_message?: string | null;
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
