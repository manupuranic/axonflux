from datetime import date, datetime
from pydantic import BaseModel


class SystemTotals(BaseModel):
    closure_date: date
    total_bills: int
    system_cash: float
    system_card: float
    system_googlepay: float
    system_phonepe: float
    system_paytm: float
    system_net_total: float


class CashClosureCreate(BaseModel):
    closure_date: date
    physical_cash: float | None = None
    card_total: float | None = None
    upi_googlepay: float | None = None
    upi_phonepe: float | None = None
    upi_paytm: float | None = None
    notes: str | None = None


class CashClosureResponse(BaseModel):
    id: str
    closure_date: date
    status: str
    submitted_at: datetime | None = None

    # Staff-entered
    physical_cash: float | None = None
    card_total: float | None = None
    upi_googlepay: float | None = None
    upi_phonepe: float | None = None
    upi_paytm: float | None = None

    # System totals
    system_cash: float | None = None
    system_card: float | None = None
    system_googlepay: float | None = None
    system_phonepe: float | None = None
    system_paytm: float | None = None
    system_net_total: float | None = None

    # Computed deltas (positive = surplus, negative = shortage)
    delta_cash: float | None = None
    delta_card: float | None = None
    delta_upi: float | None = None

    notes: str | None = None

    model_config = {"from_attributes": True}


class CashClosureVerify(BaseModel):
    status: str  # "verified" or "rejected"
    notes: str | None = None
