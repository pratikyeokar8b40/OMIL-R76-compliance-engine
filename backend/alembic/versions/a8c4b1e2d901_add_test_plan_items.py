"""add formal R-76 test plan items"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision="a8c4b1e2d901"
down_revision="63a3c54cedbc"
branch_labels=None
depends_on=None

def upgrade():
    op.create_table("test_plan_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("test_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"],["test_sessions.id"]),
        sa.ForeignKeyConstraint(["updated_by"],["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id","test_type",name="uq_test_plan_session_type"))
    op.create_index(op.f("ix_test_plan_items_session_id"),"test_plan_items",["session_id"],unique=False)

def downgrade():
    op.drop_index(op.f("ix_test_plan_items_session_id"), table_name="test_plan_items")
    op.drop_table("test_plan_items")
