"""Add configurable client network limits.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "daily_send_limit",
            sa.Numeric(20, 2),
            server_default="1000",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "monthly_send_limit",
            sa.Numeric(20, 2),
            server_default="50000",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "manual_review_threshold",
            sa.Numeric(20, 2),
            server_default="10000",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "manual_review_threshold")
    op.drop_column("users", "monthly_send_limit")
    op.drop_column("users", "daily_send_limit")
