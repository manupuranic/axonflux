from datetime import date, datetime

from pydantic import BaseModel


class LineItem(BaseModel):
    """A single named row in manual_billings, old_balance_collections, credits_given, or expenses."""
    description: str
    amount: float


class HotoCreate(BaseModel):
    closure_date: date

    # Opening
    opening_cash: float | None = None

    # Inside Counter
    net_sales: float | None = None
    sodexo_collection: float | None = None
    manual_billings: list[LineItem] = []
    old_balance_collections: list[LineItem] = []
    distributor_expiry: float | None = None
    oil_crush: float | None = None
    other_income: float | None = None

    # Outside Counter — digital
    pluxee_amount: float | None = None
    paytm_amount: float | None = None
    phonepe_amount: float | None = None
    card_amount: float | None = None
    credits_given: list[LineItem] = []
    returns_amount: float | None = None

    # Outside Counter — expenses
    expenses: list[LineItem] = []

    # Physical count
    physical_cash_counted: float | None = None

    # Denomination counts  {"500": qty, "200": qty, ...}
    denominations_opening: dict[str, int] = {}
    denominations_sales: dict[str, int] = {}

    notes: str | None = None


class HotoResponse(BaseModel):
    id: str
    closure_date: date
    status: str
    submitted_at: datetime | None = None

    opening_cash: float | None = None
    net_sales: float | None = None
    sodexo_collection: float | None = None
    manual_billings: list[LineItem] = []
    old_balance_collections: list[LineItem] = []
    distributor_expiry: float | None = None
    oil_crush: float | None = None
    other_income: float | None = None

    pluxee_amount: float | None = None
    paytm_amount: float | None = None
    phonepe_amount: float | None = None
    card_amount: float | None = None
    credits_given: list[LineItem] = []
    returns_amount: float | None = None

    expenses: list[LineItem] = []

    physical_cash_counted: float | None = None
    denominations_opening: dict[str, int] = {}
    denominations_sales: dict[str, int] = {}

    total_inside_counter: float | None = None
    total_outside_counter: float | None = None
    expected_cash: float | None = None
    difference_amount: float | None = None

    notes: str | None = None

    model_config = {"from_attributes": True}


class HotoVerify(BaseModel):
    status: str  # "verified" | "rejected"
    notes: str | None = None
