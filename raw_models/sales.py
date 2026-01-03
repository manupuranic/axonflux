import uuid
from sqlalchemy import TEXT, Column, Text, Numeric, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from raw_models.base import Base

class RawSalesItemwise(Base):
    __tablename__ = "raw_sales_itemwise"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    import_batch_id = Column(UUID(as_uuid=True), nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    store_name = Column(Text)
    sale_location = Column(Text)
    operator_name = Column(Text)

    bill_no = Column(Text)
    sale_datetime_raw = Column(Text)
    sale_to = Column(Text)
    customer_name = Column(Text)
    mobile = Column(Text)
    gstin = Column(Text)
        
    item_name_raw = Column(Text)
    barcode = Column(Text)
    hsn_code = Column(Text)
    brand_raw = Column(Text)
    size_raw = Column(Text)
    colour_raw = Column(Text)
    style_raw = Column(Text)
    expiry_date_raw = Column(Text)

    sale_qty = Column(Numeric)
    free_qty = Column(Numeric)
    current_stock_snapshot = Column(Numeric)

    mrp = Column(Numeric)
    total_mrp = Column(Numeric)
    rate = Column(Numeric)
    total_rate = Column(Numeric)
    discount_percent = Column(Numeric)
    discount_amount = Column(Numeric)
    other_discount_amount = Column(Numeric)
    total_discount_amount = Column(Numeric)
    taxable_amount = Column(Numeric)
    igst_percent = Column(Numeric)
    igst_amount = Column(Numeric)
    cgst_percent = Column(Numeric)
    cgst_amount = Column(Numeric)
    sgst_percent = Column(Numeric)
    sgst_amount = Column(Numeric)
    cess_percent = Column(Numeric)
    cess_amount = Column(Numeric)
    gross_amount = Column(Numeric)
    round_off = Column(Numeric)
    net_total = Column(Numeric)

class RawSalesBillwise(Base):
    __tablename__ = "raw_sales_billwise"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # audit
    import_batch_id = Column(UUID(as_uuid=True), nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    # bill identity
    sale_id = Column(Text)
    bill_no = Column(Text)
    bill_datetime_raw = Column(Text)

    location_name = Column(Text)
    operator_name = Column(Text)

    sale_type = Column(Text)
    bill_type = Column(Text)
    gst_type = Column(Text)
    dispatch_mode = Column(Text)
    sale_to = Column(Text)

    # customer
    customer_name_raw = Column(Text)
    customer_mobile_raw = Column(Text)
    customer_address_raw = Column(Text)
    customer_city_raw = Column(Text)
    customer_state_raw = Column(Text)
    company_name = Column(Text)
    customer_gstin_raw = Column(Text)

    # quantities & totals
    total_qty = Column(Numeric)
    total_mrp = Column(Numeric)
    total_rate = Column(Numeric)
    gross_sale = Column(Numeric)

    # discounts
    cust_discount_percent = Column(Numeric)
    cust_discount = Column(Numeric)
    bill_discount_percent = Column(Numeric)
    bill_discount_amount = Column(Numeric)
    extra_discount_percent = Column(Numeric)
    extra_discount_amount = Column(Numeric)
    membercard_discount = Column(Numeric)
    total_discount = Column(Numeric)

    # taxable
    taxable_amount = Column(Numeric)

    taxable_amt_0 = Column(Numeric)
    taxable_amt_3 = Column(Numeric)
    taxable_amt_5 = Column(Numeric)
    taxable_amt_12 = Column(Numeric)
    taxable_amt_18 = Column(Numeric)
    taxable_amt_28 = Column(Numeric)
    taxable_amt_40 = Column(Numeric)

    taxable_amt_0_percent = Column(Numeric)
    taxable_amt_3_percent = Column(Numeric)
    taxable_amt_5_percent = Column(Numeric)
    taxable_amt_12_percent = Column(Numeric)
    taxable_amt_18_percent = Column(Numeric)
    taxable_amt_28_percent = Column(Numeric)
    taxable_amt_40_percent = Column(Numeric)

    # tax slabs
    igst_3 = Column(Numeric)
    igst_5 = Column(Numeric)
    igst_12 = Column(Numeric)
    igst_18 = Column(Numeric)
    igst_28 = Column(Numeric)
    igst_40 = Column(Numeric)

    cgst_1_5 = Column(Numeric)
    cgst_2_5 = Column(Numeric)
    cgst_6 = Column(Numeric)
    cgst_9 = Column(Numeric)
    cgst_14 = Column(Numeric)
    cgst_20 = Column(Numeric)

    sgst_1_5 = Column(Numeric)
    sgst_2_5 = Column(Numeric)
    sgst_6 = Column(Numeric)
    sgst_9 = Column(Numeric)
    sgst_14 = Column(Numeric)
    sgst_20 = Column(Numeric)

    # tax totals
    total_igst = Column(Numeric)
    total_cgst = Column(Numeric)
    total_sgst = Column(Numeric)
    net_tax = Column(Numeric)

    # payments
    other_charges = Column(Numeric)
    credit_amount = Column(Numeric)
    cn_adjust = Column(Numeric)
    cn_amount = Column(Numeric)
    cash_amount = Column(Numeric)
    card_amount = Column(Numeric)
    google_pay_amount = Column(Numeric)
    phonepe_amount = Column(Numeric)
    paytm_amount = Column(Numeric)
    actual_cash = Column(Numeric)
    cash_return = Column(Numeric)

    round_off = Column(Numeric)
    net_total = Column(Numeric)