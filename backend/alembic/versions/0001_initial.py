"""Initial Momentum sandbox schema.

Revision ID: 0001
Revises:
"""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("username", sa.String(length=40), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"], unique=True)
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])

    op.create_table(
        "wallets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("symbol", sa.String(length=10), nullable=False),
        sa.Column("network", sa.String(length=50), nullable=False),
        sa.Column("address", sa.String(length=160), nullable=False),
        sa.Column("balance", sa.Numeric(28, 8), nullable=False),
        sa.Column("price_usd", sa.Numeric(20, 8), nullable=False),
        sa.Column("change_24h", sa.Numeric(8, 2), nullable=False),
        sa.UniqueConstraint("user_id", "symbol"),
    )
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"])
    op.create_index("ix_wallets_symbol", "wallets", ["symbol"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("asset", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Numeric(28, 8), nullable=False),
        sa.Column("usd_value", sa.Numeric(20, 2), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_kind", "transactions", ["kind"])
    op.create_index("ix_transactions_status", "transactions", ["status"])
    op.create_index("ix_transactions_created_at", "transactions", ["created_at"])

    op.create_table(
        "withdrawals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Numeric(28, 8), nullable=False),
        sa.Column("cardholder", sa.String(length=100), nullable=False),
        sa.Column("card_last4", sa.String(length=4), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_withdrawals_user_id", "withdrawals", ["user_id"])

    op.create_table(
        "support_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=80), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_support_attachments_user_id", "support_attachments", ["user_id"])

    op.create_table(
        "preferences",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("theme", sa.String(length=10), nullable=False),
        sa.Column("sounds", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "verification_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("withdrawal_id", sa.Integer(), sa.ForeignKey("withdrawals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_verification_challenges_withdrawal_id", "verification_challenges", ["withdrawal_id"])

    op.create_table(
        "support_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("attachment_id", sa.Integer(), sa.ForeignKey("support_attachments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_support_messages_user_id", "support_messages", ["user_id"])


def downgrade() -> None:
    op.drop_table("support_messages")
    op.drop_table("verification_challenges")
    op.drop_table("preferences")
    op.drop_table("support_attachments")
    op.drop_table("withdrawals")
    op.drop_table("transactions")
    op.drop_table("wallets")
    op.drop_table("sessions")
    op.drop_table("users")
