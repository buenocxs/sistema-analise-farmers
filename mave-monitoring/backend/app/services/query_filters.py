"""Centralized query filters for excluding invalid/blocked conversations."""

from sqlalchemy import select, func
from app.models import Conversation, ExcludedNumber


def excluded_phones_subquery():
    """Subquery returning all active excluded phone numbers."""
    return select(ExcludedNumber.phone_normalized).where(
        ExcludedNumber.active == True
    ).scalar_subquery()


def apply_conversation_exclusions(q, conv_model=Conversation):
    """Add standard exclusion filters to a query involving Conversation.

    Filters out:
    1. Phone numbers in the exclusion list
    2. Invalid phones (@lid artifacts — not valid BR format 55 + 10-11 digits)
    """
    q = q.where(conv_model.customer_phone.not_in(excluded_phones_subquery()))
    q = q.where(func.length(conv_model.customer_phone) <= 13)
    q = q.where(conv_model.customer_phone.like("55%"))
    return q
