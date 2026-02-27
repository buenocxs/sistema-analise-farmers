import logging
from datetime import datetime, timezone
from sqlalchemy import select, and_
from app.database import async_session
from app.models import Seller, Conversation, ExcludedNumber
from app.services.zapi_client import ZAPIClient
from app.services.phone_normalizer import normalize_phone
from app.jobs.task_manager import update_task, complete_task, fail_task

logger = logging.getLogger(__name__)


async def sync_seller_conversations(seller_id: int, task_id: str, days: int = 7):
    """Sync conversations from Z-API for a seller.

    Creates conversation records from the Z-API chat list.
    Messages are collected via webhook (Z-API chat-messages endpoint
    does not work with WhatsApp multi-device).
    """
    try:
        async with async_session() as db:
            # Get seller
            result = await db.execute(select(Seller).where(Seller.id == seller_id))
            seller = result.scalar_one_or_none()
            if not seller or not seller.zapi_instance_id or not seller.zapi_instance_token:
                fail_task(task_id, "Vendedor não encontrado ou sem credenciais Z-API")
                return

            client = ZAPIClient(seller.zapi_instance_id, seller.zapi_instance_token)
            update_task(task_id, message="Buscando chats...")

            # Get all chats
            all_chats = []
            page = 1
            while True:
                chats = await client.get_chats(page=page, page_size=20)
                if not chats:
                    break
                all_chats.extend(chats)
                page += 1
                if len(chats) < 20:
                    break

            # Get excluded numbers
            excl_result = await db.execute(
                select(ExcludedNumber.phone_normalized).where(ExcludedNumber.active == True)
            )
            excluded_phones = {r[0] for r in excl_result.all()}

            total = len(all_chats)
            update_task(task_id, total=total, message=f"Processando {total} chats...")
            conversations_synced = 0
            skipped = 0

            for i, chat in enumerate(all_chats):
                try:
                    is_group = chat.get("isGroup", False)
                    if is_group:
                        update_task(task_id, current=i + 1, message=f"Pulando grupo ({i+1}/{total})")
                        skipped += 1
                        continue

                    phone = chat.get("phone", "")
                    if not phone or phone == "0":
                        update_task(task_id, current=i + 1, message=f"Sem telefone ({i+1}/{total})")
                        skipped += 1
                        continue

                    normalized = normalize_phone(phone)
                    if not normalized:
                        skipped += 1
                        continue

                    if normalized in excluded_phones:
                        update_task(task_id, current=i + 1, message=f"Número excluído ({i+1}/{total})")
                        skipped += 1
                        continue

                    # Upsert conversation — use normalized phone as unique key per seller
                    existing = await db.execute(
                        select(Conversation).where(and_(
                            Conversation.seller_id == seller.id,
                            Conversation.customer_phone == normalized,
                        ))
                    )
                    conv = existing.scalar_one_or_none()

                    customer_name = chat.get("name") or chat.get("chatName") or phone

                    if not conv:
                        conv = Conversation(
                            seller_id=seller.id,
                            customer_name=customer_name,
                            customer_phone=normalized,
                            zapi_chat_id=normalized,
                            is_group=False,
                            status="active",
                        )
                        db.add(conv)
                        await db.flush()
                        conversations_synced += 1
                    else:
                        # Update name if it was empty or just a phone number
                        if not conv.customer_name or conv.customer_name == conv.customer_phone:
                            conv.customer_name = customer_name

                    update_task(task_id, current=i + 1, message=f"Sincronizado {customer_name} ({i+1}/{total})")

                except Exception as e:
                    logger.error(f"Error processing chat {i}: {e}")
                    continue

            await db.commit()
            complete_task(task_id, {
                "conversations_synced": conversations_synced,
                "skipped": skipped,
                "processed": total,
            })
            logger.info(f"Sync complete for seller {seller_id}: {conversations_synced} convs, {skipped} skipped, {total} total")

    except Exception as e:
        logger.error(f"Sync failed for seller {seller_id}: {e}")
        fail_task(task_id, str(e))
