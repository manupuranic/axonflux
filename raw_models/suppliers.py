import uuid
from sqlalchemy import Column, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from raw_models.base import Base

class RawSupplierMaster(Base):
    __tablename__ = "raw_supplier_master"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    import_batch_id = Column(UUID, nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    supplier_id_raw = Column(Text)
    status_raw = Column(Text)
    supplier_code_raw = Column(Text)
    supplier_name_raw = Column(Text)
    location_raw = Column(Text)
    address_raw = Column(Text)
    mobile_raw = Column(Text)
    email_raw = Column(Text)
    supplier_date_raw = Column(Text)
    city_raw = Column(Text)
    country_raw = Column(Text)
    state_raw = Column(Text)
    register_type_raw = Column(Text)
    gstin_raw = Column(Text)
    tin_no_raw = Column(Text)
    pan_no_raw = Column(Text)
    registered_invoice_start_duration_raw = Column(Text)
    supplier_category_raw = Column(Text)
    create_ledger_raw = Column(Text)
    closing_balance_raw = Column(Text)
