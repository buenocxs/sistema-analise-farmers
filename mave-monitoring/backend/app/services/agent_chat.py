import logging
from openai import AsyncOpenAI
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings
from app.models import Seller, Conversation, ConversationAnalysis, Alert

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """Você é o Agente MAVE, um assistente inteligente de análise de vendas.
Você tem acesso a dados de vendedores, conversas, análises e alertas.
Responda em português brasileiro, de forma clara e objetiva.
Use markdown para formatação quando apropriado.

Contexto do banco de dados:
{context}

Responda a pergunta do usuário com base nos dados disponíveis."""


async def build_context(db: AsyncSession) -> str:
    """Build a context string from database data."""
    try:
        # Sellers summary
        sellers_result = await db.execute(
            select(Seller.name, Seller.team, Seller.is_active)
            .order_by(Seller.name).limit(50)
        )
        sellers = sellers_result.all()

        # Conversations summary
        conv_count = (await db.execute(select(func.count(Conversation.id)))).scalar() or 0

        # Analyses summary
        avg_quality = (await db.execute(
            select(func.avg(ConversationAnalysis.quality_score))
        )).scalar()

        # Active alerts
        alert_count = (await db.execute(
            select(func.count(Alert.id)).where(Alert.resolved == False)
        )).scalar() or 0

        context_parts = [
            f"Total de vendedores: {len(sellers)}",
            f"Vendedores: {', '.join(f'{s.name} ({s.team})' for s in sellers[:20])}",
            f"Total de conversas: {conv_count}",
            f"Qualidade média: {round(avg_quality, 1) if avg_quality else 'N/A'}",
            f"Alertas ativos: {alert_count}",
        ]
        return "\n".join(context_parts)
    except Exception as e:
        logger.error(f"Error building context: {e}")
        return "Dados não disponíveis no momento."


async def agent_chat(db: AsyncSession, question: str) -> dict:
    """Process agent chat question."""
    if not settings.OPENAI_API_KEY:
        return {
            "answer": "API OpenAI não configurada. Configure OPENAI_API_KEY no .env.",
            "response": "API OpenAI não configurada.",
        }

    try:
        context = await build_context(db)
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
                {"role": "user", "content": question},
            ],
            temperature=0.5,
            max_tokens=2000,
        )
        answer = response.choices[0].message.content.strip()
        return {"answer": answer, "response": answer}
    except Exception as e:
        logger.error(f"Agent chat error: {e}")
        return {
            "answer": f"Erro ao processar sua pergunta: {str(e)}",
            "response": f"Erro: {str(e)}",
        }
