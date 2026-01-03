import uuid
from sqlalchemy import Column, Text, Numeric, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from raw_models.base import Base

class RawItemCombinations(Base):
    __tablename__ = "raw_item_combinations"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    import_batch_id = Column(UUID(as_uuid=True), nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    item_code = Column(Text)
    item_name_raw = Column(Text)
    barcode = Column(Text)
    hsn_code = Column(Text)
    brand_raw = Column(Text)
    category_raw = Column(Text)

    mrp = Column(Numeric)
    expiry_date_raw = Column(Text)
    size_raw = Column(Text)
    unit_raw = Column(Text)

    current_stock_snapshot = Column(Numeric)
    reorder_level = Column(Numeric)
    max_level = Column(Numeric)

    is_active = Column(Text)
    location_name = Column(Text)
    remarks = Column(Text)
