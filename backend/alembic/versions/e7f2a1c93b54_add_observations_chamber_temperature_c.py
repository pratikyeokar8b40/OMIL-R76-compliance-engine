"""add observations chamber_temperature_c

Fixes a missing schema migration: the Observation model grew the
``chamber_temperature_c`` column (Temperature effect on no-load) without a
corresponding Alembic revision, so any database built through the migration
path (Docker entrypoint: ``alembic upgrade head``) lacked the column and
every observation query failed with
``sqlite3.OperationalError: no such column: observations.chamber_temperature_c``.

This revision also repairs the migration graph: it chains after
``a8c4b1e2d901`` (add_test_plan_items) so the tree has a single head again
and ``alembic upgrade head`` succeeds on fresh and existing databases.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e7f2a1c93b54'
down_revision: Union[str, None] = 'a8c4b1e2d901'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'observations',
        sa.Column('chamber_temperature_c', sa.Numeric(precision=18, scale=6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('observations', 'chamber_temperature_c')
