"""Initial schema

Revision ID: 001
Revises:
Create Date: 2025-02-25
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="gestor_comercial"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # sellers
    op.create_table(
        "sellers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), unique=True, nullable=False),
        sa.Column("team", sa.String(50), nullable=False, server_default="closer"),
        sa.Column("instance_name", sa.String(255), nullable=True),
        sa.Column("zapi_instance_id", sa.String(255), nullable=True),
        sa.Column("zapi_instance_token", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # conversations
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("sellers.id"), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=True),
        sa.Column("customer_phone", sa.String(50), nullable=False),
        sa.Column("zapi_chat_id", sa.String(255), unique=True, nullable=True),
        sa.Column("message_count", sa.Integer(), server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("is_group", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # messages
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("zapi_message_id", sa.String(255), unique=True, nullable=True),
        sa.Column("sender_type", sa.String(20), nullable=False),
        sa.Column("sender_name", sa.String(255), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("message_type", sa.String(50), server_default="text"),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("from_me", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # conversation_analyses
    op.create_table(
        "conversation_analyses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), unique=True, nullable=False),
        sa.Column("sentiment_label", sa.String(50), nullable=True),
        sa.Column("sentiment_score", sa.Float(), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("quality_breakdown", sa.JSON(), nullable=True),
        sa.Column("stage", sa.String(50), nullable=True),
        sa.Column("tone", sa.String(50), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("keywords", sa.JSON(), nullable=True),
        sa.Column("objections", sa.JSON(), nullable=True),
        sa.Column("objections_handled", sa.JSON(), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # daily_metrics
    op.create_table(
        "daily_metrics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("sellers.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("conversations_started", sa.Integer(), server_default="0"),
        sa.Column("messages_sent", sa.Integer(), server_default="0"),
        sa.Column("quality_avg", sa.Float(), nullable=True),
        sa.Column("avg_response_time_seconds", sa.Float(), nullable=True),
        sa.Column("response_under_5min", sa.Integer(), server_default="0"),
        sa.Column("response_5_30min", sa.Integer(), server_default="0"),
        sa.Column("response_30_60min", sa.Integer(), server_default="0"),
        sa.Column("response_over_60min", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("seller_id", "date", name="uq_seller_date"),
    )

    # alerts
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("sellers.id"), nullable=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), nullable=True),
        sa.Column("alert_type", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(20), server_default="medium"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("resolved", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # excluded_numbers
    op.create_table(
        "excluded_numbers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phone_normalized", sa.String(50), unique=True, nullable=False),
        sa.Column("original_format", sa.String(100), nullable=True),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # alert_config
    op.create_table(
        "alert_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("max_response_time", sa.Integer(), server_default="300"),
        sa.Column("days_without_follow_up", sa.Integer(), server_default="3"),
        sa.Column("unhandled_objection_hours", sa.Integer(), server_default="24"),
    )

    # Indexes
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_timestamp", "messages", ["timestamp"])
    op.create_index("ix_conversations_seller_id", "conversations", ["seller_id"])
    op.create_index("ix_conversations_status", "conversations", ["status"])
    op.create_index("ix_daily_metrics_seller_date", "daily_metrics", ["seller_id", "date"])
    op.create_index("ix_alerts_resolved", "alerts", ["resolved"])


def downgrade():
    op.drop_table("alert_config")
    op.drop_table("excluded_numbers")
    op.drop_table("alerts")
    op.drop_table("daily_metrics")
    op.drop_table("conversation_analyses")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("sellers")
    op.drop_table("users")
