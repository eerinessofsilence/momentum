"""Add managed profiles and persistent demo transfer verification.

Revision ID: 0004
Revises: 0003
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    user_columns = {column["name"] for column in inspector.get_columns("users")}

    if "profile_label" not in user_columns:
        op.add_column("users", sa.Column("profile_label", sa.String(length=120), nullable=True))
    if "verification_target" not in user_columns:
        op.add_column(
            "users",
            sa.Column("verification_target", sa.Integer(), server_default="0", nullable=False),
        )
    if "verification_used" not in user_columns:
        op.add_column(
            "users", sa.Column("verification_used", sa.Integer(), server_default="0", nullable=False)
        )
    if "verification_state" not in user_columns:
        op.add_column(
            "users",
            sa.Column(
                "verification_state",
                sa.String(length=20),
                server_default="completed",
                nullable=False,
            ),
        )
    if "processing_until" not in user_columns:
        op.add_column("users", sa.Column("processing_until", sa.DateTime(), nullable=True))

    inspector = sa.inspect(connection)
    user_indexes = {index["name"] for index in inspector.get_indexes("users")}
    if "ix_users_profile_label" not in user_indexes:
        op.create_index("ix_users_profile_label", "users", ["profile_label"])
    if "ix_users_verification_state" not in user_indexes:
        op.create_index("ix_users_verification_state", "users", ["verification_state"])

    if not inspector.has_table("demo_transfers"):
        op.create_table(
            "demo_transfers",
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
            sa.Column("method", sa.String(length=20), nullable=False),
            sa.Column("asset", sa.String(length=10), nullable=False),
            sa.Column("amount", sa.Numeric(28, 8), nullable=False),
            sa.Column("destination", sa.String(length=180), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("required_codes", sa.Integer(), nullable=False),
            sa.Column("used_codes", sa.Integer(), nullable=False),
            sa.Column("processing_until", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    inspector = sa.inspect(connection)
    transfer_indexes = {index["name"] for index in inspector.get_indexes("demo_transfers")}
    if "ix_demo_transfers_user_id" not in transfer_indexes:
        op.create_index("ix_demo_transfers_user_id", "demo_transfers", ["user_id"])
    if "ix_demo_transfers_status" not in transfer_indexes:
        op.create_index("ix_demo_transfers_status", "demo_transfers", ["status"])
    if "ix_demo_transfers_created_at" not in transfer_indexes:
        op.create_index("ix_demo_transfers_created_at", "demo_transfers", ["created_at"])


def downgrade() -> None:
    op.drop_table("demo_transfers")
    op.drop_index("ix_users_verification_state", table_name="users")
    op.drop_index("ix_users_profile_label", table_name="users")
    op.drop_column("users", "processing_until")
    op.drop_column("users", "verification_state")
    op.drop_column("users", "verification_used")
    op.drop_column("users", "verification_target")
    op.drop_column("users", "profile_label")
