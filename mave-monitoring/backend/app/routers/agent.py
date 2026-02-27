from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas import AgentChatRequest
from app.auth import get_current_user
from app.services.agent_chat import agent_chat

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat")
async def chat(body: AgentChatRequest, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    return await agent_chat(db, body.question)
