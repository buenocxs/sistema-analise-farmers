import httpx
import asyncio
import logging
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_RETRIES = 3
TIMEOUT = 30.0


class ZAPIClient:
    def __init__(self, instance_id: str, instance_token: str):
        self.base_url = f"https://api.z-api.io/instances/{instance_id}/token/{instance_token}"
        self.headers = {"Client-Token": settings.ZAPI_CLIENT_TOKEN}

    async def _request(self, method: str, path: str, **kwargs) -> dict | list | None:
        url = f"{self.base_url}/{path.lstrip('/')}"
        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                    resp = await client.request(method, url, headers=self.headers, **kwargs)
                    if resp.status_code == 429 or resp.status_code >= 500:
                        wait = 2 ** attempt
                        logger.warning(f"Z-API {resp.status_code} on {path}, retry {attempt+1} in {wait}s")
                        await asyncio.sleep(wait)
                        continue
                    resp.raise_for_status()
                    return resp.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Z-API HTTP error: {e}")
                if attempt == MAX_RETRIES - 1:
                    raise
            except httpx.RequestError as e:
                logger.error(f"Z-API request error: {e}")
                if attempt == MAX_RETRIES - 1:
                    raise
                await asyncio.sleep(2 ** attempt)
        return None

    async def get_chats(self, page: int = 1, page_size: int = 20) -> list:
        try:
            result = await self._request("GET", f"chats?page={page}&pageSize={page_size}")
            return result if isinstance(result, list) else []
        except Exception as e:
            logger.error(f"Failed to get chats: {e}")
            return []

    async def get_chat_messages(self, phone: str, amount: int = 10, last_message_id: str | None = None) -> list:
        try:
            path = f"chat-messages/{phone}?amount={amount}"
            if last_message_id:
                path += f"&lastMessageId={last_message_id}"
            result = await self._request("GET", path)
            return result if isinstance(result, list) else []
        except Exception as e:
            logger.error(f"Failed to get messages for {phone}: {e}")
            return []

    async def get_contacts(self) -> list:
        try:
            result = await self._request("GET", "contacts")
            return result if isinstance(result, list) else []
        except Exception as e:
            logger.error(f"Failed to get contacts: {e}")
            return []

    async def set_webhook_received(self, webhook_url: str) -> dict | None:
        """Set webhook for received messages (including 'sent by me' via received-delivery)."""
        try:
            return await self._request("PUT", "update-webhook-received-delivery", json={"value": webhook_url})
        except Exception as e:
            logger.error(f"Failed to set received webhook: {e}")
            return None

    async def set_webhook_delivery(self, webhook_url: str) -> dict | None:
        """Set webhook for sent/delivery notifications."""
        try:
            return await self._request("PUT", "update-webhook-delivery", json={"value": webhook_url})
        except Exception as e:
            logger.error(f"Failed to set delivery webhook: {e}")
            return None

    async def set_webhook_message_status(self, webhook_url: str) -> dict | None:
        """Set webhook for message status changes."""
        try:
            return await self._request("PUT", "update-webhook-message-status", json={"value": webhook_url})
        except Exception as e:
            logger.error(f"Failed to set message-status webhook: {e}")
            return None

    async def enable_notify_sent_by_me(self) -> dict | None:
        """Enable webhook notifications for messages sent by the seller."""
        try:
            return await self._request("PUT", "update-notify-sent-by-me", json={"notifySentByMe": True})
        except Exception as e:
            logger.error(f"Failed to enable notifySentByMe: {e}")
            return None

    async def setup_all_webhooks(self, webhook_url: str) -> dict:
        """Configure all webhook types to the same URL + enable sent-by-me."""
        results = {}
        results["received"] = await self.set_webhook_received(webhook_url)
        results["delivery"] = await self.set_webhook_delivery(webhook_url)
        results["message_status"] = await self.set_webhook_message_status(webhook_url)
        results["notify_sent_by_me"] = await self.enable_notify_sent_by_me()
        return results
