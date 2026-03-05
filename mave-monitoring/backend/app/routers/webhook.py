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
            # chatId formats from Z-API:
            #   "5511999999999@c.us"      — real phone (preferred)
            #   "5511999999999@s.whatsapp.net" — real phone
            #   "123456789012345@lid"      — linked device ID (NOT a phone!)
            chat_id = payload.get("chatId", "")
            lid_id = ""  # store @lid reference for fallback matching

            if chat_id and "@lid" in chat_id:
                # Linked device ID — use the "phone" field instead
                lid_id = chat_id.split("@")[0]
                phone = payload.get("phone", "")
            elif chat_id:
                phone = chat_id.split("@")[0]
            else:
                phone = payload.get("phone", "")

            # Safety check: if phone matches seller's own phone, skip
            normalized = normalize_phone(phone)
            seller_norm = normalize_phone(seller.phone or "")
            if normalized == seller_norm:
                logger.debug(f"Webhook: skipping message to/from seller's own number {normalized}")
                return

            if not normalized and not lid_id:
                logger.debug(f"Webhook: no valid phone or lid_id, skipping")
                return

            # Check exclusion (only if we have a real phone)
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

            # Upsert conversation — match by normalized phone OR by @lid ID
            conv = None
            if normalized:
                conv_result = await db.execute(
                    select(Conversation).where(and_(
                        Conversation.seller_id == seller.id,
                        Conversation.customer_phone == normalized,
                    ))
                )
                conv = conv_result.scalar_one_or_none()

            # If no match by phone and we have a @lid, try smarter matching
            if not conv and lid_id:
                # First check if there's already an @lid conversation
                conv_result = await db.execute(
                    select(Conversation).where(and_(
                        Conversation.seller_id == seller.id,
                        Conversation.customer_phone == lid_id,
                    ))
                )
                lid_conv = conv_result.scalar_one_or_none()

                # For outgoing messages (@lid + from_me), try to find the real
                # phone conversation the seller is replying to.
                # Z-API sends chatName with the customer name — use it to match.
                if from_me:
                    chat_name = (payload.get("chatName") or "").strip()
                    if chat_name:
                        name_result = await db.execute(
                            select(Conversation).where(and_(
                                Conversation.seller_id == seller.id,
                                Conversation.customer_name == chat_name,
                                Conversation.customer_phone.like("55%"),
                            )).order_by(Conversation.last_message_at.desc().nulls_last()).limit(1)
                        )
                        real_by_name = name_result.scalar_one_or_none()
                        if real_by_name:
                            conv = real_by_name
                            # If there's also an orphan @lid conv, upgrade it
                            if lid_conv and normalized:
                                lid_conv.customer_phone = normalized
                                lid_conv.zapi_chat_id = normalized

                if not conv:
                    conv = lid_conv
                    # If found by lid and we now have a real phone, update it
                    if conv and normalized:
                        logger.info(f"Webhook: upgrading @lid conv {conv.id} phone {conv.customer_phone} -> {normalized}")
                        conv.customer_phone = normalized
                        conv.zapi_chat_id = normalized

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
                    customer_phone=normalized or lid_id,
                    zapi_chat_id=normalized or lid_id,
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
