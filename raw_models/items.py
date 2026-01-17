import uuid
from sqlalchemy import Column, Text, Numeric, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from raw_models.base import Base

class RawItemCombinations(Base):
    __tablename__ = "raw_item_combinations"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    import_batch_id = Column(UUID, nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    item_id_raw = Column(Text)
    item_code = Column(Text)   # keep if billing sometimes exports it elsewhere
    item_name_raw = Column(Text)
    barcode = Column(Text)
    hsn_code = Column(Text)

    tax_category_raw = Column(Text)
    brand_raw = Column(Text)
    size_raw = Column(Text)
    colour_raw = Column(Text)
    style_raw = Column(Text)

    expiry_date_raw = Column(Text)

    purchase_price = Column(Numeric)
    mrp = Column(Numeric)
    rate = Column(Numeric)

    system_stock_snapshot = Column(Numeric)