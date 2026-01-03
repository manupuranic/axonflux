import uuid
from sqlalchemy import Column, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from raw_models.base import Base

class RawSupplierMaster(Base):
    __tablename__ = "raw_supplier_master"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    import_batch_id = Column(UUID(as_uuid=True), nullable=False)
    source_file_name = Column(Text, nullable=False)
    imported_at = Column(TIMESTAMP)

    supplier_name_raw = Column(Text)
    contact_person = Column(Text)
    phone_raw = Column(Text)
    email_raw = Column(Text)
    gstin_raw = Column(Text)

    address_raw = Column(Text)
    city_raw = Column(Text)
    state_raw = Column(Text)
    pincode_raw = Column(Text)
