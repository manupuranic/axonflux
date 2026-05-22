from datetime import date
from typing import Literal
from pydantic import BaseModel


class CustomerListItem(BaseModel):
    mobile_clean: str
    display_name: str | None
    is_walk_in: bool
    is_member: bool
    first_seen_date: date | None
    last_seen_date: date | None
    total_bills: int | None
    total_revenue: float | None
    avg_bill_value: float | None
    total_discount_received: float | None
    days_since_last_visit: int | None
    avg_days_between_visits: float | None
    is_repeat: bool | None
    preferred_payment: str | None


class CustomerDetail(CustomerListItem):
    """Extended customer info — same as list item for now; history fetched separately."""
    pass


class CustomerBill(BaseModel):
    bill_no: str | None
    bill_date: date | None
    net_total: float | None
    total_discount: float | None
    cash_total: float | None
    card_total: float | None
    upi_total: float | None
    credit_total: float | None


ChurnTier = Literal["active", "at-risk", "lapsed", "lost"]


class ActiveCustomer(BaseModel):
    mobile_clean: str
    display_name: str | None
    is_member: bool
    is_repeat: bool | None
    total_bills: int | None
    total_revenue: float | None
    avg_bill_value: float | None
    last_purchase_date: date | None
    days_since_last_visit: int | None
    preferred_payment: str | None


class LapsedCustomer(BaseModel):
    mobile_clean: str
    display_name: str | None
    is_member: bool
    total_bills: int | None
    total_revenue: float | None
    avg_bill_value: float | None
    last_purchase_date: date | None
    days_since_last_visit: int | None
    avg_days_between_visits: float | None
    preferred_payment: str | None
    churn_tier: ChurnTier


class LapsedSummary(BaseModel):
    active_count: int
    at_risk_count: int
    lapsed_count: int
    lost_count: int
    total_count: int


class CustomerSummary(BaseModel):
    total_unique_customers: int
    repeat_customer_count: int
    repeat_customer_percent: float
    avg_bill_value: float | None
    members_count: int
    new_customers_last_30d: int
    walk_in_revenue_percent: float | None
