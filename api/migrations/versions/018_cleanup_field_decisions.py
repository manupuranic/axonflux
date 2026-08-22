"""add cleanup field-level review decisions"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "018_cleanup_field_decisions"
down_revision = "017_cleanup_semantic_assessments"
branch_labels = depends_on = None
def upgrade():
    op.create_table("item_combination_cleanup_field_decisions", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.item_combination_cleanup_runs.id", ondelete="CASCADE"), nullable=False), sa.Column("item_id_key", sa.Text(), nullable=False), sa.Column("field_name", sa.Text(), nullable=False), sa.Column("original_value", sa.Text()), sa.Column("deterministic_proposed_value", sa.Text()), sa.Column("edited_value", sa.Text()), sa.Column("decision", sa.Text(), nullable=False, server_default="NO_PROPOSAL"), sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("app.users.id")), sa.Column("review_source", sa.Text(), nullable=False, server_default="UI"), sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()")), sa.UniqueConstraint("run_id", "item_id_key", "field_name", name="uq_cleanup_field_decision"), schema="app")
def downgrade(): op.drop_table("item_combination_cleanup_field_decisions", schema="app")
