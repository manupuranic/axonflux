import uuid
from sqlalchemy import Column, Text, Numeric, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from raw_models.base import Base

class RawPurchaseItemwise(Base):
    __tablename__ = "raw_purchase_itemwise"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    import_batch_id = Column(UUID(as_uuid=True), nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    purchase_bill_no = Column(Text)
    purchase_date_raw = Column(Text)

    supplier_name_raw = Column(Text)

    item_name_raw = Column(Text)
    barcode = Column(Text)
    hsn_code = Column(Text)
    brand_raw = Column(Text)
    size_raw = Column(Text)

    purchase_qty = Column(Numeric)
    free_qty = Column(Numeric)
    cost_price = Column(Numeric)
    mrp = Column(Numeric)
    gross_amount = Column(Numeric)
    discount_amount = Column(Numeric)
    taxable_amount = Column(Numeric)
    cgst_amount = Column(Numeric)
    sgst_amount = Column(Numeric)
    igst_amount = Column(Numeric)
    cess_amount = Column(Numeric)
    net_total = Column(Numeric)

class RawPurchaseBillwise(Base):
    __tablename__ = "raw_purchase_billwise"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    import_batch_id = Column(UUID(as_uuid=True), nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    purchase_bill_no = Column(Text)
    purchase_date_raw = Column(Text)

    supplier_name_raw = Column(Text)

    gross_amount = Column(Numeric)
    discount_amount = Column(Numeric)
    tax_amount = Column(Numeric)
    round_off = Column(Numeric)
    net_amount = Column(Numeric)
