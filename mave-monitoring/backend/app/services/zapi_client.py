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

    async def get_webhooks(self) -> dict:
        """Get current webhook configuration."""
        try:
            result = await self._request("GET", "webhooks")
            return result if isinstance(result, dict) else {}
        except Exception as e:
            logger.error(f"Failed to get webhooks: {e}")
            return {}

    async def set_webhook(self, webhook_url: str) -> dict | None:
        """Set webhook URL for ALL events (received, send, status, etc)."""
        try:
            payload = {
                "receivedMessage": {"webhookUrl": webhook_url},
                "sentMessage": {"webhookUrl": webhook_url},
                "messageStatus": {"webhookUrl": webhook_url},
            }
            return await self._request("PUT", "webhooks", json=payload)
        except Exception as e:
            logger.error(f"Failed to set webhooks: {e}")
            return None
