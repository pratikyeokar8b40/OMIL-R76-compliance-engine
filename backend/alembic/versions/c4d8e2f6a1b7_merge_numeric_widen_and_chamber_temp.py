"""merge heads: numeric widening + chamber temperature

``b7d2e4f1a9c3`` (widen metrology columns) and ``e7f2a1c93b54`` (add
observations.chamber_temperature_c) were written on separate branches, which
left two heads and made ``alembic upgrade head`` fail. This no-op merge
joins them, so a database at either head (or a fresh one) upgrades cleanly.

Revision ID: c4d8e2f6a1b7
Revises: b7d2e4f1a9c3, e7f2a1c93b54
"""
from typing import Sequence, Union

revision: str = "c4d8e2f6a1b7"
down_revision: Union[str, Sequence[str], None] = ("b7d2e4f1a9c3", "e7f2a1c93b54")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
