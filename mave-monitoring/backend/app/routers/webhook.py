import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from sqlalchemy import select, and_, func
from app.database import async_session
from app.models import Seller, Conversation, Message, ExcludedNumber
from app.services.phone_normalizer import normalize_phone
from app.jobs.task_manager import run_background

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])

# In-memory cache: (seller_id, lid_id) -> customer_phone
# Survives as long as the process is alive; rebuilt from DB on cache miss.
_lid_cache: dict[tuple[int, str], str] = {}

# Debug buffer: stores last N webhook payloads for diagnostics
from collections import deque
_debug_payloads: deque = deque(maxlen=50)
_debug_errors: deque = deque(maxlen=20)


def _cache_lid(seller_id: int, lid_id: str, phone: str):
    """Store @lid → real phone mapping in memory."""
    if lid_id and phone and phone.startswith("55"):
        _lid_cache[(seller_id, lid_id)] = phone


def _resolve_lid(seller_id: int, lid_id: str) -> str:
    """Look up cached real phone for a @lid ID."""
    return _lid_cache.get((seller_id, lid_id), "")


async def _find_conversation(db, seller_id: int, normalized: str, lid_id: str, from_me: bool, payload: dict):
    """Find the correct conversation for this message.

    Strategy (in order):
    1. By real phone (customer_phone) — works for all incoming messages
    2. By lid_id column — works for @lid messages after first match
    3. By in-memory cache (lid → phone) — fast fallback
    4. By chatName matching — first-time @lid resolution
    """
    conv = None

    # 1. Direct lookup by real phone
    if normalized:
        result = await db.execute(
            select(Conversation).where(and_(
                Conversation.seller_id == seller_id,
                Conversation.customer_phone == normalized,
            ))
        )
        conv = result.scalar_one_or_none()
        if conv:
            # If we also have a lid_id, store the mapping for future lookups
            if lid_id and not conv.lid_id:
                conv.lid_id = lid_id
                _cache_lid(seller_id, lid_id, normalized)
            return conv

    # 2. Direct lookup by lid_id column (persistent mapping)
    if lid_id:
        result = await db.execute(
            select(Conversation).where(and_(
                Conversation.seller_id == seller_id,
                Conversation.lid_id == lid_id,
            ))
        )
        conv = result.scalar_one_or_none()
        if conv:
            _cache_lid(seller_id, lid_id, conv.customer_phone)
            return conv

    # 3. In-memory cache: resolve lid_id → phone, then lookup by phone
    if lid_id:
        cached_phone = _resolve_lid(seller_id, lid_id)
        if cached_phone:
            result = await db.execute(
                select(Conversation).where(and_(
                    Conversation.seller_id == seller_id,
                    Conversation.customer_phone == cached_phone,
                ))
            )
            conv = result.scalar_one_or_none()
            if conv:
                if not conv.lid_id:
                    conv.lid_id = lid_id
                return conv

    # 4. chatName matching — find real-phone conversation by customer name
    if lid_id:
        chat_name = (payload.get("chatName") or "").strip()
        if chat_name:
            # Case-insensitive match against customer_name, only real-phone conversations
            result = await db.execute(
                select(Conversation).where(and_(
                    Conversation.seller_id == seller_id,
                    func.lower(Conversation.customer_name) == chat_name.lower(),
                    Conversation.customer_phone.like("55%"),
                    func.length(Conversation.customer_phone) <= 13,
                )).order_by(Conversation.last_message_at.desc().nulls_last()).limit(1)
            )
            conv = result.scalar_one_or_none()
            if conv:
                # Store the mapping permanently
                conv.lid_id = lid_id
                _cache_lid(seller_id, lid_id, conv.customer_phone)
                logger.info(f"Webhook: matched @lid {lid_id} to conv {conv.id} ({conv.customer_phone}) by chatName '{chat_name}'")
                return conv

    # 5. Check if there's an existing @lid-only conversation (customer_phone = lid_id)
    if lid_id:
        result = await db.execute(
            select(Conversation).where(and_(
                Conversation.seller_id == seller_id,
                Conversation.customer_phone == lid_id,
            ))
        )
        conv = result.scalar_one_or_none()
        if conv:
            # Upgrade with real phone if available
            if normalized:
                logger.info(f"Webhook: upgrading @lid conv {conv.id} phone {conv.customer_phone} -> {normalized}")
                conv.customer_phone = normalized
                conv.zapi_chat_id = normalized
                conv.lid_id = lid_id
                _cache_lid(seller_id, lid_id, normalized)
            return conv

    return None


async def _process_webhook(seller_id: int, payload: dict):
    """Process webhook payload in background."""
    try:
        async with async_session() as db:
            # Get seller — try by ID first, then by connectedPhone
            result = await db.execute(select(Seller).where(Seller.id == seller_id))
            seller = result.scalar_one_or_none()
            if not seller:
                connected = normalize_phone(payload.get("connectedPhone", ""))
                if connected:
                    result = await db.execute(select(Seller).where(Seller.phone == connected))
                    seller = result.scalar_one_or_none()
                if not seller:
                    logger.warning(f"Webhook: seller {seller_id} not found")
                    return
                logger.info(f"Webhook: seller_id={seller_id} not found, resolved by connectedPhone to seller {seller.id}")

            is_group = payload.get("isGroup", False)
            if is_group:
                return

            from_me = payload.get("fromMe", False)

            # Skip status callbacks (delivery/read receipts, not real messages)
            msg_type = payload.get("type", "")
            if msg_type == "MessageStatusCallback":
                return

            # Extract customer phone and @lid.
            # Z-API payload formats:
            #   Incoming (customer→seller): chatId="5511999@c.us", phone="5511999"
            #   Outgoing via chatId:        chatId="12345@lid", phone="5511999" or phone="12345@lid"
            #   Outgoing via notifySentByMe: chatId="", phone="12345@lid" or phone="5511999",
            #                                chatLid="12345@lid", connectedPhone="seller_phone"
            chat_id = payload.get("chatId") or ""
            chat_lid = payload.get("chatLid") or ""
            phone_raw = payload.get("phone") or ""
            lid_id = ""

            # Extract lid_id from chatId, chatLid, or phone field
            if chat_id and "@lid" in chat_id:
                lid_id = chat_id.split("@")[0]
            if not lid_id and chat_lid and "@lid" in chat_lid:
                lid_id = chat_lid.split("@")[0]
            if not lid_id and "@lid" in phone_raw:
                lid_id = phone_raw.split("@")[0]

            # Extract real phone — try chatId first, then phone field
            if chat_id and "@lid" not in chat_id and "@" in chat_id:
                phone = chat_id.split("@")[0]
            elif phone_raw and "@lid" not in phone_raw:
                phone = phone_raw
            else:
                phone = ""

            # Safety check: if phone is the seller's own number, it's a self-note
            # For fromMe messages, the "phone" field sometimes is the seller's number
            # but the chatLid tells us which customer they're writing to
            normalized = normalize_phone(phone)
            seller_norm = normalize_phone(seller.phone or "")
            if normalized and normalized == seller_norm:
                # Seller sending to themselves (self-note/cotação) — skip
                # UNLESS we have a lid_id pointing to a customer conversation
                if lid_id:
                    normalized = ""  # Use lid_id matching instead
                else:
                    return

            if not normalized and not lid_id:
                return

            # Check exclusion
            if normalized:
                excl = await db.execute(
                    select(ExcludedNumber).where(
                        ExcludedNumber.phone_normalized == normalized,
                        ExcludedNumber.active == True,
                    )
                )
                if excl.scalar_one_or_none():
                    return

            # Dedup by messageId
            message_id = payload.get("messageId") or payload.get("id")
            if message_id:
                exists = await db.execute(select(Message.id).where(Message.zapi_message_id == message_id))
                if exists.scalar_one_or_none():
                    return

            # Find or create conversation
            conv = await _find_conversation(db, seller.id, normalized, lid_id, from_me, payload)

            if not conv:
                if from_me:
                    cust_name = payload.get("chatName") or phone
                else:
                    cust_name = payload.get("senderName") or payload.get("chatName") or phone
                conv = Conversation(
                    seller_id=seller.id,
                    customer_name=cust_name,
                    customer_phone=normalized or lid_id,
                    zapi_chat_id=normalized or None,  # None for @lid-only (unique constraint)
                    lid_id=lid_id or None,
                    is_group=False,
                    status="active",
                )
                db.add(conv)
                await db.flush()
                if lid_id and normalized:
                    _cache_lid(seller.id, lid_id, normalized)

            # Parse timestamp
            moment = payload.get("moment") or payload.get("timestamp")
            if isinstance(moment, (int, float)):
                ts = datetime.fromtimestamp(moment, tz=timezone.utc)
            else:
                ts = datetime.now(timezone.utc)

            # Parse content
            content = ""
            text_data = payload.get("text")
            if isinstance(text_data, dict):
                content = text_data.get("message", "")
            elif isinstance(text_data, str):
                content = text_data
            else:
                content = payload.get("body", "")

            # For media messages with no text, store a readable placeholder
            if not content:
                _type = (msg_type or "").lower()
                if _type in ("audio", "ptt"):
                    content = "[Áudio]"
                elif _type == "image":
                    content = "[Imagem]"
                elif _type == "document":
                    content = "[Documento]"
                elif _type == "video":
                    content = "[Vídeo]"
                elif _type == "sticker":
                    content = "[Figurinha]"

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

            # When customer sends a message, update customer_name if it was wrong
            if not from_me:
                real_name = payload.get("senderName") or payload.get("chatName")
                if real_name and real_name != conv.customer_name:
                    current = conv.customer_name or ""
                    if current == conv.customer_phone or current == phone or current == seller.name:
                        conv.customer_name = real_name

            # Update conversation metadata
            conv.message_count = (conv.message_count or 0) + 1
            conv.last_message_at = ts
            if not conv.started_at:
                conv.started_at = ts

            await db.commit()
            logger.info(f"Webhook processed: seller={seller_id}, phone={normalized or lid_id}, from_me={from_me}, conv={conv.id}")

    except Exception as e:
        logger.error(f"Webhook processing error: {e}", exc_info=True)
        _debug_errors.append({
            "error": str(e),
            "type": type(e).__name__,
            "seller_id": seller_id,
            "ts": datetime.now(timezone.utc).isoformat()[:19],
        })


@router.post("/zapi/{seller_id}")
async def zapi_webhook(seller_id: int, request: Request):
    """Receive Z-API webhook. Always returns 200 immediately."""
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    # Store for debug inspection
    _debug_payloads.append({
        "seller_id": seller_id,
        "keys": sorted(payload.keys()),
        "fromMe": payload.get("fromMe"),
        "chatId": payload.get("chatId", ""),
        "chatLid": payload.get("chatLid", ""),
        "phone": payload.get("phone", ""),
        "chatName": payload.get("chatName", "")[:30],
        "senderName": payload.get("senderName", "")[:30],
        "connectedPhone": payload.get("connectedPhone", ""),
        "type": payload.get("type", ""),
        "text": str(payload.get("text", ""))[:80],
        "ts": datetime.now(timezone.utc).isoformat()[:19],
    })

    run_background(_process_webhook(seller_id, payload))
    return {"status": "ok"}


@router.get("/debug/recent")
async def debug_recent_payloads():
    """Return last 50 webhook payloads and errors for diagnostics."""
    return {
        "count": len(_debug_payloads),
        "lid_cache_size": len(_lid_cache),
        "errors": list(_debug_errors),
        "payloads": list(_debug_payloads),
    }
