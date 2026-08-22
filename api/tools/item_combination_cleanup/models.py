import uuid

from sqlalchemy import Column, Date, Integer, Text, TIMESTAMP, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from api.models.app import AppBase


class ItemCombinationCleanupRun(AppBase):
    __tablename__ = "item_combination_cleanup_runs"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by = Column(UUID(as_uuid=True), ForeignKey("app.users.id"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    status = Column(Text, nullable=False, default="uploaded")

    source_file_name = Column(Text, nullable=False)
    original_path = Column(Text, nullable=False)
    output_path = Column(Text, nullable=True)
    approved_output_path = Column(Text, nullable=True)

    sheet_name = Column(Text, nullable=True)
    header_row = Column(Integer, nullable=True)
    row_count = Column(Integer, nullable=True)
    column_count = Column(Integer, nullable=True)
    headers = Column(JSONB, nullable=True)
    summary_json = Column(JSONB, nullable=True)

    validation_status = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    rows = relationship(
        "ItemCombinationCleanupRow",
        back_populates="run",
        cascade="all, delete-orphan",
    )


class ItemCombinationCleanupRow(AppBase):
    __tablename__ = "item_combination_cleanup_rows"
    __table_args__ = {"schema": "app"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("app.item_combination_cleanup_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_index = Column(Integer, nullable=False)
    item_id_key = Column(Text, nullable=False)

    source_identity = Column(JSONB, nullable=False)
    original_item_name = Column(Text, nullable=True)
    original_brand = Column(Text, nullable=True)
    original_size = Column(Text, nullable=True)
    original_hsn = Column(Text, nullable=True)

    proposed_item_name = Column(Text, nullable=True)
    proposed_size = Column(Text, nullable=True)
    proposed_brand = Column(Text, nullable=True)
    product_type = Column(Text, nullable=False)
    classification_confidence = Column(Text, nullable=True)
    supplier_name = Column(Text, nullable=True)
    supplier_purchase_date = Column(Date, nullable=True)
    supplier_purchase_id = Column(Text, nullable=True)
    supplier_invoice_no = Column(Text, nullable=True)
    supplier_source_file = Column(Text, nullable=True)
    supplier_match_method = Column(Text, nullable=True)
    classification_evidence = Column(JSONB, nullable=True)
    name_evidence = Column(JSONB, nullable=True)
    review_status = Column(Text, nullable=False)
    approval_status = Column(Text, nullable=False, default="PENDING")
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("app.users.id"), nullable=True)
    reviewed_at = Column(TIMESTAMP(timezone=True), nullable=True)

    run = relationship("ItemCombinationCleanupRun", back_populates="rows")


class ItemCombinationCleanupSemanticAssessment(AppBase):
    __tablename__ = "item_combination_cleanup_semantic_assessments"
    __table_args__ = (
        UniqueConstraint("run_id", "item_id_key", "provider", "model", "prompt_version", name="uq_cleanup_semantic_assessment_version"),
        {"schema": "app"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("app.item_combination_cleanup_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id_key = Column(Text, nullable=False, index=True)
    relationship = Column(Text, nullable=True)
    confidence = Column(Text, nullable=True)
    reason = Column(Text, nullable=True)
    signals_for_packed = Column(JSONB, nullable=True)
    signals_against_packed = Column(JSONB, nullable=True)
    identity_interpretations = Column(JSONB, nullable=True)
    provider = Column(Text, nullable=False)
    model = Column(Text, nullable=False)
    prompt_version = Column(Text, nullable=False)
    raw_response = Column(JSONB, nullable=True)
    validation_status = Column(Text, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class ItemCombinationCleanupFieldDecision(AppBase):
    __tablename__ = "item_combination_cleanup_field_decisions"
    __table_args__ = (UniqueConstraint("run_id", "item_id_key", "field_name", name="uq_cleanup_field_decision"), {"schema": "app"})
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("app.item_combination_cleanup_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id_key = Column(Text, nullable=False, index=True)
    field_name = Column(Text, nullable=False)
    original_value = Column(Text, nullable=True)
    deterministic_proposed_value = Column(Text, nullable=True)
    edited_value = Column(Text, nullable=True)
    decision = Column(Text, nullable=False, default="NO_PROPOSAL")
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("app.users.id"), nullable=True)
    review_source = Column(Text, nullable=False, default="UI")
    reviewed_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class ItemCombinationCleanupNameSuggestion(AppBase):
    __tablename__ = "item_combination_cleanup_name_suggestions"
    __table_args__ = (UniqueConstraint("run_id", "item_id_key", "field_name", "suggestion_source", "suggestion_version", name="uq_cleanup_name_suggestion_version"), {"schema": "app"})
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("app.item_combination_cleanup_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id_key = Column(Text, nullable=False, index=True)
    field_name = Column(Text, nullable=False, default="name")
    suggestion_source = Column(Text, nullable=False)
    suggestion_version = Column(Text, nullable=False)
    category = Column(Text, nullable=False)
    base_value = Column(Text, nullable=False)
    suggested_value = Column(Text, nullable=False)
    transformations = Column(JSONB, nullable=False)
    evidence = Column(JSONB, nullable=False)
    status = Column(Text, nullable=False, default="PENDING")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    reviewed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("app.users.id"), nullable=True)
