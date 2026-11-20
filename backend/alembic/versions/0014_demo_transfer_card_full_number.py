"""Store demo card numbers for staff activity.

Revision ID: 0014
Revises: 0013
"""

import sqlalchemy as sa

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "demo_transfers", sa.Column("card_full_number", sa.String(length=19), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("demo_transfers", "card_full_number")
