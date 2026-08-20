"""Add random non-sequential client_number identifier to users.

Revision ID: 0012
Revises: 0011
"""

import secrets

import sqlalchemy as sa

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def _make_client_number() -> int:
    while True:
        candidate = 100_000 + secrets.randbelow(900_000)
        if candidate % 10 != 0:
            return candidate


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "client_number" not in user_columns:
        op.add_column("users", sa.Column("client_number", sa.Integer(), nullable=True))

    users = sa.table("users", sa.column("id", sa.Integer()), sa.column("client_number", sa.Integer()))
    existing = {
        row[0]
        for row in connection.execute(
            sa.select(users.c.client_number).where(users.c.client_number.is_not(None))
        )
    }
    rows = connection.execute(
        sa.select(users.c.id).where(users.c.client_number.is_(None))
    ).fetchall()
    for (user_id,) in rows:
        candidate = _make_client_number()
        while candidate in existing:
            candidate = _make_client_number()
        existing.add(candidate)
        connection.execute(
            users.update().where(users.c.id == user_id).values(client_number=candidate)
        )

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("client_number", nullable=False)

    inspector = sa.inspect(connection)
    user_indexes = {index["name"] for index in inspector.get_indexes("users")}
    if "ix_users_client_number" not in user_indexes:
        op.create_index("ix_users_client_number", "users", ["client_number"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_client_number", table_name="users")
    op.drop_column("users", "client_number")
