import uuid
from sqlalchemy import Column, Text, Numeric, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from raw_models.base import Base

class RawPurchaseItemwise(Base):
    __tablename__ = "raw_purchase_itemwise"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    import_batch_id = Column(UUID, nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at =  Column(TIMESTAMP)

    purchase_id = Column(Text)
    purchase_reference_id = Column(Text)
    invoice_no = Column(Text)
    purchase_date_raw = Column(Text)

    supplier_name_raw = Column(Text)
    item_name_raw = Column(Text)
    barcode = Column(Text)
    hsn_code = Column(Text)
    brand_raw = Column(Text)

    tax_type = Column(Text)
    gst_percent = Column(Text)

    min_stock = Column(Numeric)
    max_stock = Column(Numeric)
    expiry_date_raw = Column(Text)

    qty_phm = Column(Numeric)
    free_qty_phm = Column(Numeric)
    qty_wh = Column(Numeric)
    free_qty_wh = Column(Numeric)
    total_qty = Column(Numeric)

    profit_percent = Column(Numeric)
    taxable_value = Column(Numeric)
    mrp = Column(Numeric)
    rate = Column(Numeric)

class RawPurchaseBillwise(Base):
    __tablename__ = "raw_purchase_billwise"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # audit
    import_batch_id = Column(UUID(as_uuid=True), nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    # core bill
    purchase_id = Column(Text)
    ref_id = Column(Text)
    invoice_no = Column(Text)
    purchase_date_raw = Column(Text)
    purchase_time_raw = Column(Text)

    supplier_name_raw = Column(Text)
    supplier_type = Column(Text)
    location_name = Column(Text)
    status = Column(Text)

    # metrics
    age = Column(Numeric)
    total_qty = Column(Numeric)

    gross_amount = Column(Numeric)
    total_disc1_amount = Column(Numeric)
    extra_disc_amount = Column(Numeric)
    taxable_value = Column(Numeric)

    gst_0 = Column(Numeric)
    gst_3 = Column(Numeric)
    gst_5 = Column(Numeric)
    gst_12 = Column(Numeric)
    gst_18 = Column(Numeric)
    gst_28 = Column(Numeric)
    gst_40 = Column(Numeric)

    tax_amount = Column(Numeric)
    round_off = Column(Numeric)
    settled_amount = Column(Numeric)
    due_amount = Column(Numeric)
    net_amount = Column(Numeric)
