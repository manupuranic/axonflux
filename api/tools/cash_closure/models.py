import uuid

from sqlalchemy import Column, Date, Numeric, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID

from api.models.app import AppBase


class CashClosureRecord(AppBase):
    __tablename__ = "cash_closure_records"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    closure_date = Column(Date, nullable=False)
    submitted_by = Column(UUID(as_uuid=True))   # references app.users.id
    submitted_at = Column(TIMESTAMP(timezone=True))
    status = Column(Text, nullable=False, default="draft")

    # Staff-entered counts
    physical_cash = Column(Numeric)
    card_total = Column(Numeric)
    upi_googlepay = Column(Numeric)
    upi_phonepe = Column(Numeric)
    upi_paytm = Column(Numeric)

    # System-derived totals (snapshot at submission time)
    system_cash = Column(Numeric)
    system_card = Column(Numeric)
    system_googlepay = Column(Numeric)
    system_phonepe = Column(Numeric)
    system_paytm = Column(Numeric)
    system_net_total = Column(Numeric)

    notes = Column(Text)
    verified_by = Column(UUID(as_uuid=True))    # references app.users.id
    verified_at = Column(TIMESTAMP(timezone=True))
