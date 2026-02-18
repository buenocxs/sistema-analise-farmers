"""Integration with Evolution API for WhatsApp Web."""
import httpx
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Seller, Conversation, Message, ExcludedNumber
from app.services.phone_normalizer import normalize_phone, extract_phone_from_jid, is_excluded
import os

logger = logging.getLogger(__name__)


class EvolutionAPIService:
    """Service for interacting with the Evolution API to manage WhatsApp instances and messages."""

    def __init__(self):
        self.base_url = os.getenv('EVOLUTION_API_URL', 'http://localhost:8080').rstrip('/')
        self.api_key = os.getenv('EVOLUTION_API_KEY', '')
        self.instance_name = os.getenv('EVOLUTION_INSTANCE_NAME', 'mave-whatsapp')
        self.headers = {
            'apikey': self.api_key,
            'Content-Type': 'application/json'
        }
        self.timeout = httpx.Timeout(30.0, connect=10.0)

    def _get_client(self) -> httpx.AsyncClient:
        """Create a new async HTTP client with configured defaults."""
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=self.timeout,
        )

    async def get_instance_status(self, instance_name: str) -> dict:
        """Check WhatsApp instance connection status."""
        try:
            async with self._get_client() as client:
                response = await client.get(
                    f'/instance/connectionState/{instance_name}'
                )
                response.raise_for_status()
                data = response.json()
                return {
                    'instance': instance_name,
                    'state': data.get('instance', {}).get('state', data.get('state', 'unknown')),
                    'connected': data.get('instance', {}).get('state', data.get('state')) == 'open',
                    'raw': data,
                }
        except Exception as e:
            logger.error(f"Error checking instance status for '{instance_name}': {e}")
            return {
                'instance': instance_name,
                'state': 'error',
                'connected': False,
                'error': str(e),
            }

    async def get_qrcode(self, instance_name: str) -> str:
        """Get QR code for WhatsApp login."""
        try:
            async with self._get_client() as client:
                response = await client.get(
                    f'/instance/connect/{instance_name}'
                )
                response.raise_for_status()
                data = response.json()
                return data.get('base64', '') or data.get('qrcode', {}).get('base64', '')
        except Exception as e:
            logger.error(f"Error getting QR code for '{instance_name}': {e}")
            return ''

    async def create_instance(self, instance_name: str) -> dict:
        """Create a new WhatsApp instance in Evolution API."""
        try:
            async with self._get_client() as client:
                payload = {
                    'instanceName': instance_name,
                    'qrcode': True,
                    'integration': 'WHATSAPP-BAILEYS',
                }
                response = await client.post('/instance/create', json=payload)
                response.raise_for_status()
                data = response.json()
                return {
                    'success': True,
                    'instance': data.get('instance', {}),
                    'qrcode': data.get('qrcode', {}).get('base64', ''),
                    'raw': data,
                }
        except Exception as e:
            logger.error(f"Error creating instance '{instance_name}': {e}")
            return {'success': False, 'error': str(e)}

    async def fetch_chats(self, instance_name: str) -> list[dict]:
        """
        Fetch all chats from an Evolution API instance.
        Uses POST /chat/findChats/{instance}.
        Returns list of chat dicts with remoteJid, pushName, lastMessage, etc.
        """
        try:
            async with self._get_client() as client:
                response = await client.post(
                    f'/chat/findChats/{instance_name}',
                    json={},
                )
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list):
                    return data
                return data.get('chats', data.get('records', []))
        except Exception as e:
            logger.error(f"Error fetching chats from '{instance_name}': {e}")
            return []

    async def fetch_messages_for_chat(
        self,
        instance_name: str,
        remote_jid: str,
        since: Optional[datetime] = None,
        max_pages: int = 200,
    ) -> list[dict]:
        """
        Fetch messages for a specific chat (remoteJid) with pagination.

        Evolution API v2 returns paginated response (newest first):
        {
            "messages": {
                "total": N,
                "pages": P,
                "currentPage": C,
                "records": [...]
            }
        }

        Stops fetching when messages become older than `since`.
        Returns list of raw message records from the API.
        """
        all_records = []
        page = 1
        since_ts = int(since.timestamp()) if since else 0

        try:
            async with self._get_client() as client:
                while page <= max_pages:
                    payload = {
                        'where': {
                            'key': {'remoteJid': remote_jid}
                        },
                        'page': page,
                    }

                    response = await client.post(
                        f'/chat/findMessages/{instance_name}',
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()

                    # Extract records from paginated response
                    messages_wrapper = data.get('messages', {})
                    if isinstance(messages_wrapper, list):
                        records = messages_wrapper
                        total_pages = 1
                    elif isinstance(messages_wrapper, dict):
                        records = messages_wrapper.get('records', [])
                        total_pages = messages_wrapper.get('pages', 1) or 1
                    else:
                        records = []
                        total_pages = 1

                    if not records:
                        break

                    # Records are newest-first. Filter out messages older than `since`.
                    if since_ts > 0:
                        filtered = []
                        hit_old = False
                        for rec in records:
                            ts = rec.get('messageTimestamp', 0)
                            if isinstance(ts, dict):
                                ts = ts.get('low', 0)
                            if isinstance(ts, str):
                                try:
                                    ts = int(ts)
                                except ValueError:
                                    ts = 0
                            if ts >= since_ts:
                                filtered.append(rec)
                            else:
                                hit_old = True

                        all_records.extend(filtered)

                        # If any message in this page is too old, stop
                        if hit_old:
                            break
                    else:
                        all_records.extend(records)

                    # Check if there are more pages
                    if page >= total_pages:
                        break
                    page += 1

        except Exception as e:
            logger.error(
                f"Error fetching messages for chat '{remote_jid}' "
                f"from '{instance_name}' (page {page}): {e}"
            )

        return all_records

    async def fetch_messages(
        self, instance_name: str, since: Optional[datetime] = None
    ) -> list[dict]:
        """
        Fetch ALL messages from an instance since a given timestamp (paginated).
        Returns list of processed message dicts.
        """
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        all_records = []
        page = 1
        max_pages = 500

        try:
            async with self._get_client() as client:
                while page <= max_pages:
                    payload = {
                        'where': {
                            'messageTimestamp': {
                                'gte': int(since.timestamp()),
                            }
                        },
                        'page': page,
                    }
                    response = await client.post(
                        f'/chat/findMessages/{instance_name}',
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()

                    # Extract records from paginated response
                    messages_wrapper = data.get('messages', {})
                    if isinstance(messages_wrapper, list):
                        records = messages_wrapper
                        total_pages = 1
                    elif isinstance(messages_wrapper, dict):
                        records = messages_wrapper.get('records', [])
                        total_pages = messages_wrapper.get('pages', 1) or 1
                    else:
                        records = []
                        total_pages = 1

                    if not records:
                        break

                    all_records.extend(records)

                    if page >= total_pages:
                        break
                    page += 1

        except Exception as e:
            logger.error(f"Error fetching messages from '{instance_name}': {e}")

        # Process raw records into normalized dicts
        processed = []
        for msg in all_records:
            processed_msg = self._process_raw_message(msg)
            if processed_msg:
                processed.append(processed_msg)

        logger.info(
            f"Fetched {len(processed)} messages from instance '{instance_name}' "
            f"since {since.isoformat()} ({page} pages)"
        )
        return processed

    def _process_raw_message(self, msg: dict) -> Optional[dict]:
        """Process a raw Evolution API message record into a normalized dict."""
        key = msg.get('key', {})
        remote_jid = key.get('remoteJid', '')

        # Skip group chats
        if '@g.us' in remote_jid:
            return None

        # Resolve @lid to phone via remoteJidAlt
        alt_jid = key.get('remoteJidAlt', '')
        if '@lid' in remote_jid and '@s.whatsapp.net' in alt_jid:
            remote_jid = alt_jid

        # Extract text content from nested message object
        message_obj = msg.get('message', {})
        text_content = ''
        media_url = None

        if isinstance(message_obj, str):
            text_content = message_obj
        elif isinstance(message_obj, dict):
            text_content = (
                message_obj.get('conversation', '')
                or message_obj.get('extendedTextMessage', {}).get('text', '')
                or message_obj.get('imageMessage', {}).get('caption', '')
                or message_obj.get('videoMessage', {}).get('caption', '')
                or ''
            )

            # Extract media type labels
            for media_type in ('imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'):
                if media_type in message_obj:
                    media_url = message_obj[media_type].get('url', None)
                    if not text_content:
                        labels = {
                            'audioMessage': '[audio]',
                            'documentMessage': f"[documento: {message_obj[media_type].get('fileName', 'arquivo')}]",
                            'imageMessage': '[imagem]',
                            'videoMessage': '[video]',
                        }
                        text_content = labels.get(media_type, '[midia]')
                    break

        # Parse timestamp
        ts_raw = msg.get('messageTimestamp', 0)
        if isinstance(ts_raw, str):
            try:
                ts_raw = int(ts_raw)
            except ValueError:
                ts_raw = 0
        elif isinstance(ts_raw, dict):
            # Handle {low: N, high: 0, unsigned: true} format
            ts_raw = ts_raw.get('low', 0)

        return {
            'remoteJid': remote_jid,
            'fromMe': key.get('fromMe', False),
            'message': text_content,
            'timestamp': ts_raw,
            'messageId': key.get('id', ''),
            'pushName': msg.get('pushName', ''),
            'mediaUrl': media_url,
            'messageType': msg.get('messageType', ''),
        }

    async def sync_conversations(
        self,
        seller_id: int,
        instance_name: Optional[str] = None,
        since: Optional[datetime] = None,
        db: Optional[Session] = None,
    ) -> dict:
        """
        Sync conversations from Evolution API for a given seller.

        Flow:
        1. Fetch all chats from the instance
        2. For each non-group chat with a valid phone (@s.whatsapp.net):
           - Fetch messages for that chat
           - Create/update Conversation and Message records
        3. Return summary stats

        Returns dict with keys: conversations_synced, messages_synced, errors
        """
        if instance_name is None:
            instance_name = self.instance_name

        own_db = db is None
        if own_db:
            db = SessionLocal()

        stats = {
            'conversations_synced': 0,
            'messages_synced': 0,
            'conversations_skipped': 0,
            'lid_resolved': 0,
            'lid_unresolved': 0,
            'errors': [],
        }

        try:
            # Load exclusion list
            excluded_numbers = set()
            excluded_records = db.query(ExcludedNumber).filter(
                ExcludedNumber.active == True
            ).all()
            for record in excluded_records:
                excluded_numbers.add(record.phone_normalized)

            # Step 1: Fetch all chats
            chats = await self.fetch_chats(instance_name)
            logger.info(f"Found {len(chats)} chats in instance '{instance_name}'")

            # Filter: non-group chats, accept @s.whatsapp.net and @lid
            valid_chats = []
            for chat in chats:
                jid = chat.get('remoteJid', '')
                if '@g.us' in jid:
                    continue

                phone_jid = None
                is_lid_unresolved = False

                if '@s.whatsapp.net' in jid:
                    phone_jid = jid
                elif '@lid' in jid:
                    # Check lastMessage.key.remoteJidAlt for phone mapping
                    last_msg = chat.get('lastMessage', {})
                    alt_jid = last_msg.get('key', {}).get('remoteJidAlt', '')
                    if '@s.whatsapp.net' in alt_jid:
                        phone_jid = alt_jid
                    else:
                        phone_jid = jid
                        is_lid_unresolved = True
                else:
                    stats['conversations_skipped'] += 1
                    continue

                chat['_resolved_phone_jid'] = phone_jid
                chat['_is_lid_unresolved'] = is_lid_unresolved
                valid_chats.append(chat)

            logger.info(
                f"Processing {len(valid_chats)} valid chats "
                f"(skipped {stats['conversations_skipped']} group/invalid, "
                f"{sum(1 for c in valid_chats if c.get('_is_lid_unresolved'))} @lid pending resolution)"
            )

            # Step 2: Process each chat
            for chat in valid_chats:
                try:
                    jid = chat.get('remoteJid', '')
                    phone_jid = chat.get('_resolved_phone_jid', jid)
                    is_lid_unresolved = chat.get('_is_lid_unresolved', False)

                    # For @lid chats, fetch messages FIRST to try resolving phone
                    raw_messages = None
                    if is_lid_unresolved:
                        raw_messages = await self.fetch_messages_for_chat(
                            instance_name, jid, since=since
                        )
                        if not raw_messages:
                            continue
                        # Try to resolve phone from message remoteJidAlt
                        for raw_msg in raw_messages:
                            alt = raw_msg.get('key', {}).get('remoteJidAlt', '')
                            if '@s.whatsapp.net' in alt:
                                phone_jid = alt
                                is_lid_unresolved = False
                                stats['lid_resolved'] += 1
                                break

                    # Determine customer_phone
                    if is_lid_unresolved:
                        customer_phone = jid.split('@')[0]
                        stats['lid_unresolved'] += 1
                    else:
                        customer_phone_raw = extract_phone_from_jid(phone_jid)
                        if not customer_phone_raw:
                            continue
                        customer_phone = normalize_phone(customer_phone_raw)
                        if not customer_phone:
                            continue

                    # Check exclusion
                    if customer_phone in excluded_numbers:
                        stats['conversations_skipped'] += 1
                        continue

                    # Fetch messages if not already fetched (@s.whatsapp.net chats)
                    if raw_messages is None:
                        raw_messages = await self.fetch_messages_for_chat(
                            instance_name, jid, since=since
                        )

                    if not raw_messages:
                        continue

                    # Process raw messages
                    processed_messages = []
                    for raw_msg in raw_messages:
                        processed = self._process_raw_message(raw_msg)
                        if processed and (processed['message'] or processed['mediaUrl']):
                            processed_messages.append(processed)

                    if not processed_messages:
                        continue

                    # Sort by timestamp
                    processed_messages.sort(key=lambda m: m.get('timestamp', 0))

                    # Get customer name from chat or first incoming message
                    customer_name = chat.get('pushName')
                    if not customer_name:
                        for msg in processed_messages:
                            if not msg.get('fromMe') and msg.get('pushName'):
                                customer_name = msg['pushName']
                                break

                    # Find or create conversation
                    conversation = (
                        db.query(Conversation)
                        .filter(
                            Conversation.seller_id == seller_id,
                            Conversation.customer_phone == customer_phone,
                        )
                        .first()
                    )

                    if not conversation:
                        earliest_ts = processed_messages[0].get('timestamp', 0)
                        started_at = (
                            datetime.fromtimestamp(earliest_ts, tz=timezone.utc).replace(tzinfo=None)
                            if earliest_ts
                            else datetime.utcnow()
                        )
                        conversation = Conversation(
                            seller_id=seller_id,
                            customer_phone=customer_phone,
                            customer_name=customer_name,
                            started_at=started_at,
                            message_count=0,
                            status='active',
                        )
                        db.add(conversation)
                        db.flush()
                    elif customer_name and not conversation.customer_name:
                        conversation.customer_name = customer_name

                    # Track existing messages for dedup
                    existing_keys = set()
                    existing_messages = (
                        db.query(Message.timestamp, Message.content, Message.sender_type)
                        .filter(Message.conversation_id == conversation.id)
                        .all()
                    )
                    for em in existing_messages:
                        key = (
                            em.timestamp.isoformat() if em.timestamp else '',
                            (em.content or '')[:100],
                            em.sender_type,
                        )
                        existing_keys.add(key)

                    # Insert new messages
                    new_count = 0
                    latest_timestamp = conversation.last_message_at

                    for msg in processed_messages:
                        ts_raw = msg.get('timestamp', 0)
                        if ts_raw:
                            msg_time = datetime.fromtimestamp(ts_raw, tz=timezone.utc).replace(tzinfo=None)
                        else:
                            msg_time = datetime.utcnow()

                        sender_type = 'seller' if msg.get('fromMe') else 'customer'
                        content = msg.get('message', '') or ''
                        media_url = msg.get('mediaUrl')

                        if not content and not media_url:
                            continue

                        # Dedup check
                        dedup_key = (
                            msg_time.isoformat(),
                            (content or '')[:100],
                            sender_type,
                        )
                        if dedup_key in existing_keys:
                            continue

                        message = Message(
                            conversation_id=conversation.id,
                            sender_type=sender_type,
                            content=content if content else None,
                            timestamp=msg_time,
                            media_url=media_url,
                        )
                        db.add(message)
                        existing_keys.add(dedup_key)
                        new_count += 1

                        if latest_timestamp is None or msg_time > latest_timestamp:
                            latest_timestamp = msg_time

                    # Update conversation metadata
                    if new_count > 0:
                        conversation.message_count = (conversation.message_count or 0) + new_count
                        conversation.last_message_at = latest_timestamp
                        conversation.status = 'active'
                        stats['conversations_synced'] += 1
                        stats['messages_synced'] += new_count

                    db.commit()

                except Exception as e:
                    db.rollback()
                    error_msg = f"Error processing chat {chat.get('remoteJid', '?')}: {e}"
                    logger.error(error_msg)
                    stats['errors'].append(error_msg)

            logger.info(
                f"Sync complete: {stats['conversations_synced']} conversations, "
                f"{stats['messages_synced']} messages synced"
            )

        except Exception as e:
            logger.error(f"Critical error during sync: {e}")
            stats['errors'].append(str(e))
            db.rollback()
        finally:
            if own_db:
                db.close()

        return stats

    async def logout_instance(self, instance_name: str) -> bool:
        """Logout/disconnect a WhatsApp instance."""
        try:
            async with self._get_client() as client:
                response = await client.delete(
                    f'/instance/logout/{instance_name}'
                )
                response.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Error logging out instance '{instance_name}': {e}")
            return False

    async def restart_instance(self, instance_name: str) -> bool:
        """Restart a WhatsApp instance."""
        try:
            async with self._get_client() as client:
                response = await client.put(
                    f'/instance/restart/{instance_name}'
                )
                response.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Error restarting instance '{instance_name}': {e}")
            return False

    async def get_all_instances(self) -> list[dict]:
        """List all WhatsApp instances registered in Evolution API."""
        try:
            async with self._get_client() as client:
                response = await client.get('/instance/fetchInstances')
                response.raise_for_status()
                instances = response.json()
                if not isinstance(instances, list):
                    instances = instances.get('instances', [])
                return instances
        except Exception as e:
            logger.error(f"Error fetching all instances: {e}")
            return []


# Singleton instance for use across the application
evolution_service = EvolutionAPIService()
