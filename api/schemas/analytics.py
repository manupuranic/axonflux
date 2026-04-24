from datetime import date
from pydantic import BaseModel


class DailyRevenue(BaseModel):
    sale_date: date
    total_bills: int | None
    total_items_sold: float | None
    total_revenue: float | None
    avg_bill_value: float | None


class DailyPayment(BaseModel):
    sale_date: date
    total_bills: int
    cash_total: float
    card_total: float
    google_pay_total: float
    phonepe_total: float
    paytm_total: float
    upi_total: float
    credit_total: float
    cn_redeemed_total: float
    total_discount: float
    membercard_discount_total: float


class DailyPurchase(BaseModel):
    purchase_date: date
    total_purchase_bills: int | None
    total_quantity_purchased: float | None
    total_taxable_value: float | None
    total_settled_amount: float | None
    total_due_amount: float | None


class ProductHealthSignal(BaseModel):
    product_id: str
    product_name: str | None
    fast_moving_flag: bool | None
    slow_moving_flag: bool | None
    dead_stock_flag: bool | None
    demand_spike_flag: bool | None
    predicted_daily_demand: float | None
    last_7_day_avg: float | None
    last_30_day_avg: float | None
    last_60_day_avg: float | None
    demand_volatility: float | None
    avg_monthly_consumption: float | None = None
    suppliers: str | None = None


class ReplenishmentItem(BaseModel):
    barcode: str
    product_name: str | None
    supplier_name: str | None
    system_stock: float | None
    predicted_daily_demand: float | None
    days_of_cover: float | None
    min_stock: float | None
    max_stock: float | None
    required_quantity: float | None
    lead_time_days: int | None


class DemandTrendPoint(BaseModel):
    date: date
    quantity_sold: float
    revenue: float
    last_7_day_avg: float | None
    last_30_day_avg: float | None
    predicted_daily_demand: float | None


class AnalyticsSummary(BaseModel):
    """Lightweight KPIs for the dashboard home card."""
    latest_date: date | None
    total_revenue_last_7d: float | None
    total_bills_last_7d: int | None
    total_purchases_last_7d: float | None
    total_purchase_bills_last_7d: int | None
    total_credit_last_7d: float | None
    fast_moving_count: int
    slow_moving_count: int
    dead_stock_count: int
    demand_spike_count: int
    products_needing_reorder: int
    # Customer KPIs
    total_unique_customers: int
    repeat_customer_percent: float | None
    new_customers_last_30d: int
    walk_in_revenue_percent: float | None


class TopProduct(BaseModel):
    rank: int
    barcode: str
    product_name: str | None
    total_revenue: float
    total_qty: float
