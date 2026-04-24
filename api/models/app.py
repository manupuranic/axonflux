import uuid

from sqlalchemy import Boolean, Column, Numeric, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base

AppBase = declarative_base()


class AppUser(AppBase):
    __tablename__ = "users"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(Text, unique=True, nullable=False)
    full_name = Column(Text)
    hashed_password = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="staff")
    is_active = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True))
    last_login_at = Column(TIMESTAMP(timezone=True))


class AppProduct(AppBase):
    __tablename__ = "products"
    __table_args__ = {"schema": "app"}

    barcode = Column(Text, primary_key=True)
    canonical_name = Column(Text, nullable=False)
    category = Column(Text)
    subcategory = Column(Text)
    brand = Column(Text)
    unit_of_measure = Column(Text)
    pack_size = Column(Numeric)
    image_url = Column(Text)
    hsn_code = Column(Text)
    gst_rate_percent = Column(Numeric)
    is_active = Column(Boolean, default=True)
    notes = Column(Text)
    product_type = Column(Text, default="retail")
    is_reviewed = Column(Boolean, default=False)
    size = Column(Text)
    colour = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True))
    updated_at = Column(TIMESTAMP(timezone=True))


class AppProductAlias(AppBase):
    __tablename__ = "product_aliases"
    __table_args__ = {"schema": "app"}

    alias_barcode     = Column(Text, primary_key=True)
    canonical_barcode = Column(Text, nullable=False)  # FK to app.products(barcode)
    similarity_score  = Column(Numeric)
    confirmed_by      = Column(UUID(as_uuid=True))    # FK to app.users(id)
    confirmed_at      = Column(TIMESTAMP(timezone=True))
    notes             = Column(Text)


class AppProductMergeSuggestion(AppBase):
    __tablename__ = "product_merge_suggestions"
    __table_args__ = {"schema": "app"}

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_key         = Column(Text, nullable=False)
    alias_barcode       = Column(Text, nullable=False)
    canonical_candidate = Column(Text, nullable=False)
    alias_name          = Column(Text)
    canonical_name      = Column(Text)
    similarity_score    = Column(Numeric, nullable=False)
    status              = Column(Text, nullable=False, default="pending")
    generated_at        = Column(TIMESTAMP(timezone=True))
    reviewed_by         = Column(UUID(as_uuid=True))  # FK to app.users(id)
    reviewed_at         = Column(TIMESTAMP(timezone=True))


class AppPipelineRun(AppBase):
    __tablename__ = "pipeline_runs"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    triggered_by = Column(UUID(as_uuid=True))  # references app.users.id
    triggered_at = Column(TIMESTAMP(timezone=True))
    pipeline_type = Column(Text, nullable=False, default="weekly_full")
    status = Column(Text, nullable=False, default="running")
    completed_at = Column(TIMESTAMP(timezone=True))
    log_output = Column(Text)
    error_message = Column(Text)
