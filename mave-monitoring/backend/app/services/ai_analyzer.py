import json
import logging
from openai import AsyncOpenAI
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

ANALYSIS_PROMPT = """Você é um analista de vendas especializado. Analise a conversa de WhatsApp abaixo entre um vendedor e um cliente.

Retorne APENAS um JSON válido (sem markdown, sem ```json) com esta estrutura exata:
{
  "sentiment_label": "positivo" | "neutro" | "negativo" | "frustrado",
  "sentiment_score": 0.0 a 1.0,
  "quality_score": 0.0 a 10.0,
  "quality_breakdown": {
    "cordialidade": 0.0 a 10.0,
    "conhecimento_produto": 0.0 a 10.0,
    "tecnica_vendas": 0.0 a 10.0,
    "tempo_resposta": 0.0 a 10.0,
    "resolucao_objecoes": 0.0 a 10.0,
    "personalizacao": 0.0 a 10.0,
    "fechamento": 0.0 a 10.0
  },
  "stage": "prospecção" | "qualificação" | "negociação" | "fechamento" | "pós-venda",
  "tone": "profissional" | "informal" | "agressivo" | "passivo" | "empático",
  "summary": "Resumo breve da conversa em 2-3 frases",
  "keywords": ["palavra1", "palavra2"],
  "objections": [{"tipo": "tipo da objeção", "descricao": "descrição"}],
  "objections_handled": [{"tipo": "tipo", "descricao": "como foi tratada"}]
}

CONVERSA:
"""


async def analyze_conversation(messages: list[dict]) -> dict | None:
    """Analyze conversation messages using OpenAI GPT-4o-mini."""
    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not configured, skipping analysis")
        return None

    try:
        conversation_text = ""
        for msg in messages:
            sender = "Vendedor" if msg.get("from_me") or msg.get("sender_type") == "seller" else "Cliente"
            name = msg.get("sender_name", sender)
            content = msg.get("content", "")
            if content:
                conversation_text += f"[{sender} - {name}]: {content}\n"

        if not conversation_text.strip():
            return None

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Você analisa conversas de vendas e retorna JSON."},
                {"role": "user", "content": ANALYSIS_PROMPT + conversation_text},
            ],
            temperature=0.3,
            max_tokens=1500,
        )

        text = response.choices[0].message.content.strip()
        # Remove markdown code blocks if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        return None
