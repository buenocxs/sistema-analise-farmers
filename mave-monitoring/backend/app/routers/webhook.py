import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from sqlalchemy import select, and_
from app.database import async_session
from app.models import Seller, Conversation, Message, ExcludedNumber
from app.services.phone_normalizer import normalize_phone
from app.jobs.task_manager import run_background

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])


async def _process_webhook(seller_id: int, payload: dict):
    """Process webhook payload in background."""
    try:
        async with async_session() as db:
            # Get seller
            result = await db.execute(select(Seller).where(Seller.id == seller_id))
            seller = result.scalar_one_or_none()
            if not seller:
                logger.warning(f"Webhook: seller {seller_id} not found")
                return

            is_group = payload.get("isGroup", False)
            if is_group:
                return

            from_me = payload.get("fromMe", False)

            # Extract customer phone.
            # "Ao receber": phone = customer's phone (correct)
            # "Ao enviar":  phone = seller's own phone (wrong!) — use chatId instead
            chat_id = payload.get("chatId", "")
            if chat_id:
                # chatId is like "5511999999999@c.us" — always the customer
                phone = chat_id.split("@")[0]
            else:
                phone = payload.get("phone", "")

            # Safety check: if phone matches seller's own phone, skip
            normalized = normalize_phone(phone)
            seller_norm = normalize_phone(seller.phone or "")
            if normalized == seller_norm:
                logger.debug(f"Webhook: skipping message to/from seller's own number {normalized}")
                return

            if not normalized:
                return

            # Check exclusion
            excl = await db.execute(
                select(ExcludedNumber).where(ExcludedNumber.phone_normalized == normalized, ExcludedNumber.active == True)
            )
            if excl.scalar_one_or_none():
                return

            # Dedup by messageId
            message_id = payload.get("messageId") or payload.get("id")
            if message_id:
                exists = await db.execute(select(Message.id).where(Message.zapi_message_id == message_id))
                if exists.scalar_one_or_none():
                    return

            # Upsert conversation — use normalized phone + seller_id as unique key
            conv_result = await db.execute(
                select(Conversation).where(and_(
                    Conversation.seller_id == seller.id,
                    Conversation.customer_phone == normalized,
                ))
            )
            conv = conv_result.scalar_one_or_none()
            if not conv:
                # When seller sends first message (fromMe=true), senderName is the
                # seller's name — NOT the customer's. Use chatName or phone instead.
                if from_me:
                    cust_name = payload.get("chatName") or phone
                else:
                    cust_name = payload.get("senderName") or payload.get("chatName") or phone
                conv = Conversation(
                    seller_id=seller.id,
                    customer_name=cust_name,
                    customer_phone=normalized,
                    zapi_chat_id=normalized,
                    is_group=False,
                    status="active",
                )
                db.add(conv)
                await db.flush()

            # Parse timestamp
            moment = payload.get("moment") or payload.get("timestamp")
            if isinstance(moment, (int, float)):
                ts = datetime.fromtimestamp(moment, tz=timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            content = ""
            text_data = payload.get("text")
            if isinstance(text_data, dict):
                content = text_data.get("message", "")
            elif isinstance(text_data, str):
                content = text_data
            else:
                content = payload.get("body", "")

            msg = Message(
                conversation_id=conv.id,
                zapi_message_id=message_id,
                sender_type="seller" if from_me else "customer",
                sender_name=payload.get("senderName") or (seller.name if from_me else conv.customer_name),
                content=content,
                message_type=payload.get("type", "text") or "text",
                timestamp=ts,
                from_me=from_me,
            )
            db.add(msg)

            # When customer sends a message, update customer_name if it was
            # wrong (e.g. set to seller's name or just a phone number)
            if not from_me:
                real_name = payload.get("senderName") or payload.get("chatName")
                if real_name and real_name != conv.customer_name:
                    # Replace if current name is just a phone number or matches seller
                    current = conv.customer_name or ""
                    if current == conv.customer_phone or current == phone or current == seller.name:
                        conv.customer_name = real_name

            # Update conversation metadata
            conv.message_count = (conv.message_count or 0) + 1
            conv.last_message_at = ts
            if not conv.started_at:
                conv.started_at = ts

            await db.commit()
            logger.info(f"Webhook processed: seller={seller_id}, phone={normalized}, from_me={from_me}")

    except Exception as e:
        logger.error(f"Webhook processing error: {e}")


@router.post("/zapi/{seller_id}")
async def zapi_webhook(seller_id: int, request: Request):
    """Receive Z-API webhook. Always returns 200 immediately."""
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    run_background(_process_webhook(seller_id, payload))
    return {"status": "ok"}
