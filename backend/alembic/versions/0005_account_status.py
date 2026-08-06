"""Add managed account status.

Revision ID: 0005
Revises: 0004
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "account_status" not in user_columns:
        op.add_column(
            "users",
            sa.Column(
                "account_status",
                sa.String(length=20),
                server_default="active",
                nullable=False,
            ),
        )

    inspector = sa.inspect(connection)
    user_indexes = {index["name"] for index in inspector.get_indexes("users")}
    if "ix_users_account_status" not in user_indexes:
        op.create_index("ix_users_account_status", "users", ["account_status"])


def downgrade() -> None:
    op.drop_index("ix_users_account_status", table_name="users")
    op.drop_column("users", "account_status")
