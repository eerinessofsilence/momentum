"""Add support-reviewed deposit requests.

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deposit_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "transaction_id",
            sa.Integer(),
            sa.ForeignKey("transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "decided_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("asset", sa.String(length=10), nullable=False),
        sa.Column("amount_usd", sa.Numeric(20, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_deposit_requests_user_id", "deposit_requests", ["user_id"])
    op.create_index("ix_deposit_requests_status", "deposit_requests", ["status"])
    op.create_index("ix_deposit_requests_created_at", "deposit_requests", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_deposit_requests_created_at", table_name="deposit_requests")
    op.drop_index("ix_deposit_requests_status", table_name="deposit_requests")
    op.drop_index("ix_deposit_requests_user_id", table_name="deposit_requests")
    op.drop_table("deposit_requests")
