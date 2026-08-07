"""Normalize client-facing titles for manual credits.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


transactions = sa.table(
    "transactions",
    sa.column("id", sa.Integer()),
    sa.column("asset", sa.String()),
    sa.column("title", sa.String()),
    sa.column("details", sa.JSON()),
)


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(transactions.c.id, transactions.c.asset).where(
            transactions.c.title == "Manual credit by Momentum Operations"
        )
    ).all()
    for transaction_id, asset in rows:
        connection.execute(
            transactions.update()
            .where(transactions.c.id == transaction_id)
            .values(title=f"Received {asset}")
        )


def downgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(
            transactions.c.id,
            transactions.c.asset,
            transactions.c.title,
            transactions.c.details,
        )
    ).all()
    for transaction_id, asset, title, details in rows:
        if (
            title == f"Received {asset}"
            and details
            and details.get("reason") == "Manual account adjustment"
        ):
            connection.execute(
                transactions.update()
                .where(transactions.c.id == transaction_id)
                .values(title="Manual credit by Momentum Operations")
            )
