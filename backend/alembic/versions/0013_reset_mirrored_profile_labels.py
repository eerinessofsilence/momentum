"""Reset profile_label rows that were incorrectly mirrored from name.

A prior change forced profile_label to always equal name on every account
edit, erasing its use as an independent staff-facing note. This clears that
mirrored value back to NULL so existing profiles start with an empty note
instead of a redundant copy of the client's name.

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    users = sa.table(
        "users", sa.column("name", sa.String()), sa.column("profile_label", sa.String())
    )
    connection.execute(
        users.update()
        .where(users.c.profile_label == users.c.name)
        .values(profile_label=None)
    )


def downgrade() -> None:
    pass
