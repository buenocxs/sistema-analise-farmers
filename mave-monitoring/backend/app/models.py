from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, JSON, ForeignKey, UniqueConstraint, Date
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="gestor_comercial")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Seller(Base):
    __tablename__ = "sellers"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(50), unique=True, nullable=False)
    team = Column(String(50), nullable=False, default="closer")
    instance_name = Column(String(255), nullable=True)
    zapi_instance_id = Column(String(255), nullable=True)
    zapi_instance_token = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    conversations = relationship("Conversation", back_populates="seller", lazy="selectin")
    daily_metrics = relationship("DailyMetric", back_populates="seller", lazy="selectin")
    alerts = relationship("Alert", back_populates="seller", lazy="selectin")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=False)
    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=False)
    zapi_chat_id = Column(String(255), unique=True, nullable=True)
    message_count = Column(Integer, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="active")
    is_group = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    seller = relationship("Seller", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", lazy="selectin", order_by="Message.timestamp")
    analysis = relationship("ConversationAnalysis", back_populates="conversation", uselist=False, lazy="selectin")
    alerts = relationship("Alert", back_populates="conversation", lazy="selectin")
    notes = relationship("ManagerNote", back_populates="conversation", lazy="selectin", order_by="ManagerNote.created_at.desc()")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    zapi_message_id = Column(String(255), unique=True, nullable=True)
    sender_type = Column(String(20), nullable=False)  # 'seller' or 'customer'
    sender_name = Column(String(255), nullable=True)
    content = Column(Text, nullable=True)
    message_type = Column(String(50), default="text")
    timestamp = Column(DateTime(timezone=True), nullable=False)
    from_me = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class ConversationAnalysis(Base):
    __tablename__ = "conversation_analyses"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), unique=True, nullable=False)
    sentiment_label = Column(String(50), nullable=True)
    sentiment_score = Column(Float, nullable=True)
    quality_score = Column(Float, nullable=True)
    quality_breakdown = Column(JSON, nullable=True)
    stage = Column(String(50), nullable=True)
    tone = Column(String(50), nullable=True)
    summary = Column(Text, nullable=True)
    keywords = Column(JSON, nullable=True)
    objections = Column(JSON, nullable=True)
    objections_handled = Column(JSON, nullable=True)
    analyzed_at = Column(DateTime(timezone=True), default=utcnow)

    conversation = relationship("Conversation", back_populates="analysis")


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    id = Column(Integer, primary_key=True)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=False)
    date = Column(Date, nullable=False)
    conversations_started = Column(Integer, default=0)
    messages_sent = Column(Integer, default=0)
    quality_avg = Column(Float, nullable=True)
    avg_response_time_seconds = Column(Float, nullable=True)
    response_under_5min = Column(Integer, default=0)
    response_5_30min = Column(Integer, default=0)
    response_30_60min = Column(Integer, default=0)
    response_over_60min = Column(Integer, default=0)

    seller = relationship("Seller", back_populates="daily_metrics")

    __table_args__ = (UniqueConstraint("seller_id", "date", name="uq_seller_date"),)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    alert_type = Column(String(100), nullable=False)
    severity = Column(String(20), default="medium")
    message = Column(Text, nullable=False)
    resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    seller = relationship("Seller", back_populates="alerts")
    conversation = relationship("Conversation", back_populates="alerts")


class ExcludedNumber(Base):
    __tablename__ = "excluded_numbers"

    id = Column(Integer, primary_key=True)
    phone_normalized = Column(String(50), unique=True, nullable=False)
    original_format = Column(String(100), nullable=True)
    reason = Column(String(255), nullable=True)
    active = Column(Boolean, default=True)
    added_at = Column(DateTime(timezone=True), default=utcnow)


class ManagerNote(Base):
    __tablename__ = "manager_notes"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    conversation = relationship("Conversation", back_populates="notes")
    user = relationship("User")


class AlertConfig(Base):
    __tablename__ = "alert_config"

    id = Column(Integer, primary_key=True)
    max_response_time = Column(Integer, default=300)
    days_without_follow_up = Column(Integer, default=3)
    unhandled_objection_hours = Column(Integer, default=24)
