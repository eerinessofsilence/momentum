"""Remove the legacy card-withdrawal verification flow.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    if inspector.has_table("verification_challenges"):
        op.drop_table("verification_challenges")
    if inspector.has_table("withdrawals"):
        op.drop_table("withdrawals")


def downgrade() -> None:
    op.create_table(
        "withdrawals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("asset", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Numeric(28, 8), nullable=False),
        sa.Column("cardholder", sa.String(length=100), nullable=False),
        sa.Column("card_last4", sa.String(length=4), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_withdrawals_user_id", "withdrawals", ["user_id"])
    op.create_table(
        "verification_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "withdrawal_id",
            sa.Integer(),
            sa.ForeignKey("withdrawals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_verification_challenges_withdrawal_id",
        "verification_challenges",
        ["withdrawal_id"],
    )
