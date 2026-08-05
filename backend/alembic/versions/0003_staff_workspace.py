"""Add staff workspaces and confirmation codes.

Revision ID: 0003
Revises: 0002
"""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_staff", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_table(
        "confirmation_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=6), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ready"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_confirmation_codes_user_id", "confirmation_codes", ["user_id"])
    op.create_index("ix_confirmation_codes_code", "confirmation_codes", ["code"])
    op.create_index("ix_confirmation_codes_status", "confirmation_codes", ["status"])


def downgrade() -> None:
    op.drop_table("confirmation_codes")
    op.drop_column("users", "is_staff")
