import uuid

from sqlalchemy import Column, DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID

from raw_models.base import Base


class RawIngestionBatch(Base):
    __tablename__ = "ingestion_batches"
    __table_args__ = {"schema": "raw"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    file_name = Column(Text, nullable=False)
    file_hash = Column(Text, nullable=False, unique=True)
    report_type = Column(Text, nullable=False)

    row_count = Column(Integer)
    status = Column(Text, nullable=False, default="SUCCESS")
    error_message = Column(Text)

    imported_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
