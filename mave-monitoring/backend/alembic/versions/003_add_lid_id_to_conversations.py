"""Add lid_id column to conversations for @lid matching

Revision ID: 003
Revises: 002
Create Date: 2026-03-05
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("conversations", sa.Column("lid_id", sa.String(50), nullable=True))
    op.create_index("ix_conversations_lid_id", "conversations", ["lid_id"])


def downgrade():
    op.drop_index("ix_conversations_lid_id", table_name="conversations")
    op.drop_column("conversations", "lid_id")
