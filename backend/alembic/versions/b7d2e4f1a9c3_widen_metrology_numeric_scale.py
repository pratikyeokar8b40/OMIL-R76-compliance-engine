"""widen metrology columns to NUMERIC(28, 10)

Class I instruments declared in kg have e = 0.000001, so half-e and dL steps
need 7+ decimal places; NUMERIC(18, 6) rounded them on storage.
"""
from alembic import op
import sqlalchemy as sa

revision = "b7d2e4f1a9c3"
# Also merges the two heads that both branched from 950e9a084339 (checklist
# items and test plan items), so `alembic upgrade head` works again.
down_revision = ("63a3c54cedbc", "a8c4b1e2d901")
branch_labels = None
depends_on = None

_COLUMNS = {
    "instruments": (
        ("max_capacity", False),
        ("min_capacity", False),
        ("verification_scale_interval", False),
        ("display_interval", True),
    ),
    "observations": (
        ("applied_load", False),
        ("indication", False),
        ("additional_load", False),
        ("zero_error", False),
        ("second_indication", True),
        ("error_prior", False),
        ("corrected_error", False),
        ("mpe_limit", False),
    ),
}


def _alter(new_type: sa.Numeric, old_type: sa.Numeric) -> None:
    for table, columns in _COLUMNS.items():
        with op.batch_alter_table(table) as batch:
            for name, nullable in columns:
                batch.alter_column(
                    name,
                    type_=new_type,
                    existing_type=old_type,
                    existing_nullable=nullable,
                )


def upgrade():
    _alter(sa.Numeric(28, 10), sa.Numeric(18, 6))


def downgrade():
    _alter(sa.Numeric(18, 6), sa.Numeric(28, 10))
