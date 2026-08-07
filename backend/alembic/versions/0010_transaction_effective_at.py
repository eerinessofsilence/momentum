"""Add the user-visible transaction effective date.

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("effective_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE transactions SET effective_at = created_at")
    op.alter_column("transactions", "effective_at", nullable=False)
    op.create_index(
        op.f("ix_transactions_effective_at"), "transactions", ["effective_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_transactions_effective_at"), table_name="transactions")
    op.drop_column("transactions", "effective_at")
