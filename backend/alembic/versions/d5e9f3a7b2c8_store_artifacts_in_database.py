"""store report artifacts and evidence attachments in the database

Hosted deployments (Vercel functions) have no persistent disk: report PDFs /
DOCX and uploaded evidence written to disk vanished between invocations, and
the verify page then reported "file missing". The bytes now live in the
database; existing reports keep being served from their files.

Revision ID: d5e9f3a7b2c8
Revises: c4d8e2f6a1b7
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5e9f3a7b2c8"
down_revision: Union[str, Sequence[str], None] = "c4d8e2f6a1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("pdf_bytes", sa.LargeBinary(), nullable=True))
    op.add_column("reports", sa.Column("docx_bytes", sa.LargeBinary(), nullable=True))
    op.create_table(
        "attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("stored_as", sa.String(length=80), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("uploaded_by", sa.Uuid(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["test_sessions.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attachments_session_id", "attachments", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_attachments_session_id", table_name="attachments")
    op.drop_table("attachments")
    op.drop_column("reports", "docx_bytes")
    op.drop_column("reports", "pdf_bytes")
