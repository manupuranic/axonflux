import uuid

from sqlalchemy import Column, Date, ForeignKey, Numeric, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import JSONB, UUID

from api.models.app import AppBase


class CashClosureRecord(AppBase):
    __tablename__ = "cash_closure_records"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    closure_date = Column(Date, nullable=False, unique=True)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("app.users.id"), nullable=True)
    submitted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(Text, nullable=False, default="draft")

    # Opening
    opening_cash = Column(Numeric, nullable=True)

    # Inside Counter — income
    net_sales = Column(Numeric, nullable=True)
    sodexo_collection = Column(Numeric, nullable=True)
    manual_billings = Column(JSONB, nullable=False, default=list)
    old_balance_collections = Column(JSONB, nullable=False, default=list)
    distributor_expiry = Column(Numeric, nullable=True)
    oil_crush = Column(Numeric, nullable=True)
    other_income = Column(Numeric, nullable=True)

    # Outside Counter — digital collections
    pluxee_amount = Column(Numeric, nullable=True)
    paytm_amount = Column(Numeric, nullable=True)
    phonepe_amount = Column(Numeric, nullable=True)
    card_amount = Column(Numeric, nullable=True)
    credits_given = Column(JSONB, nullable=False, default=list)
    returns_amount = Column(Numeric, nullable=True)

    # Outside Counter — expenses paid from drawer
    expenses = Column(JSONB, nullable=False, default=list)

    # Physical cash count
    physical_cash_counted = Column(Numeric, nullable=True)

    # Denomination counts  {"500": qty, "200": qty, ...}
    denominations_opening = Column(JSONB, nullable=False, default=dict)
    denominations_sales = Column(JSONB, nullable=False, default=dict)

    # Computed at submission time
    total_inside_counter = Column(Numeric, nullable=True)
    total_outside_counter = Column(Numeric, nullable=True)
    expected_cash = Column(Numeric, nullable=True)
    difference_amount = Column(Numeric, nullable=True)

    # Admin verification
    notes = Column(Text, nullable=True)
    verified_by = Column(UUID(as_uuid=True), ForeignKey("app.users.id"), nullable=True)
    verified_at = Column(TIMESTAMP(timezone=True), nullable=True)
