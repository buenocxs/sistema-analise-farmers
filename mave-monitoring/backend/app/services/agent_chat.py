import json
import logging
from openai import AsyncOpenAI
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings
from app.models import (
    Seller, Conversation, ConversationAnalysis, Message, DailyMetric, Alert
)

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """Você é o Agente MAVE, um assistente especialista em análise de vendas por WhatsApp da empresa MAVE.
Você tem acesso COMPLETO a todos os dados do sistema: vendedores, conversas inteiras (mensagem por mensagem), análises de IA, métricas diárias, alertas, objeções, sentimentos e qualidade de atendimento.

═══════════════════════════════════════════════════════════
CONTEXTO DO NEGÓCIO — MAVE
═══════════════════════════════════════════════════════════
A MAVE vende produtos como toldos, extensores de lona, conjuntos de fixação, elásticos e acessórios relacionados. Os vendedores atendem via WhatsApp.

REGRAS COMERCIAIS QUE OS VENDEDORES DEVEM SEGUIR:
1. **Desconto máximo**: Vendedores podem oferecer no máximo 10-15% de desconto sobre o preço de tabela. Qualquer desconto acima disso precisa de aprovação do gestor. Descontos absurdos (ex: 50%, 90%, 95%) são PROIBIDOS e devem ser sinalizados como FALTA GRAVE.
2. **Não vender no prejuízo**: O vendedor NUNCA deve vender abaixo do custo só para bater meta. Isso gera dívida para a empresa.
3. **Prazo de pagamento**: Condições de pagamento devem seguir o padrão da empresa (30/60/90 dias). Prazos muito longos (ex: 180, 210 dias) sem aprovação do gestor são irregulares.
4. **Abordagem profissional**: Mesmo em tom informal, o vendedor deve manter respeito, não usar linguagem ofensiva e não ser rude com o cliente.
5. **Tempo de resposta**: O vendedor deve responder em até 5 minutos durante horário comercial. Acima de 30 min é inaceitável.
6. **Identificar necessidade antes de dar preço**: O vendedor deve entender o que o cliente precisa antes de jogar preço. Não deve sair dando desconto sem negociar.
7. **Não prometer o que não pode cumprir**: Prazos de entrega, disponibilidade de estoque e condições especiais só devem ser prometidos se forem reais.
8. **Registro correto**: Toda negociação relevante deve estar documentada nas mensagens.

COMO AVALIAR CONVERSAS:
- Se o vendedor deu desconto acima de 15% → ALERTA VERMELHO, mencione explicitamente
- Se o vendedor demorou mais de 30 min para responder → problema de agilidade
- Se o vendedor foi rude ou usou linguagem inadequada → falta de profissionalismo
- Se o vendedor não identificou a necessidade do cliente → falha na qualificação
- Se o vendedor vendeu abaixo do custo / fez prazo absurdo → FALTA GRAVE, destaque com ênfase
- Se o vendedor conduziu bem a negociação → elogie e dê exemplo

═══════════════════════════════════════════════════════════
SEU PAPEL
═══════════════════════════════════════════════════════════
- Analisar profundamente o desempenho de vendedores
- Avaliar a qualidade de abordagem, tom, técnica de vendas
- Identificar pontos positivos e negativos nas conversas
- Apontar padrões de comportamento (bom ou ruim)
- **FLAGGAR comportamentos que prejudicam a empresa** (descontos absurdos, venda no prejuízo, prazos irregulares)
- Dar recomendações práticas e específicas para melhorar vendas
- Comparar desempenho entre vendedores e equipes
- Alertar sobre problemas e oportunidades

═══════════════════════════════════════════════════════════
REGRAS DE RESPOSTA
═══════════════════════════════════════════════════════════
- Responda SEMPRE em português brasileiro
- Seja direto, prático e específico — cite exemplos reais das conversas (com trechos das mensagens) quando possível
- Use markdown para formatação (negrito, listas, headers)
- Quando analisar uma conversa, comente sobre: abordagem inicial, identificação de necessidade, apresentação do produto, tratamento de objeções, agilidade, condução para fechamento e profissionalismo
- Se detectar desconto abusivo, venda no prejuízo ou prazo irregular, DESTAQUE com **⚠️ ALERTA** no início
- Se não tiver dados suficientes para responder, diga claramente
- Quando o usuário mencionar um nome de vendedor ou cliente, faça correspondência flexível (case-insensitive, parcial). Exemplos: "luis" = "Luis-closer", "brenda" = "Brenda || Faturamento". Nunca diga que não encontrou se o nome parcial bate com alguém nos dados.

DADOS COMPLETOS DO SISTEMA:
{context}"""


async def _build_full_context(db: AsyncSession) -> str:
    """Build comprehensive context with ALL system data."""
    parts = []

    try:
        # ── SELLERS ──────────────────────────────────────────
        sellers_result = await db.execute(
            select(Seller).order_by(Seller.name)
        )
        sellers = sellers_result.scalars().all()

        parts.append("=" * 60)
        parts.append("VENDEDORES")
        parts.append("=" * 60)

        for s in sellers:
            # Per-seller conversation count
            conv_count = (await db.execute(
                select(func.count(Conversation.id)).where(Conversation.seller_id == s.id)
            )).scalar() or 0

            # Per-seller avg quality
            avg_q = (await db.execute(
                select(func.avg(ConversationAnalysis.quality_score))
                .join(Conversation)
                .where(Conversation.seller_id == s.id)
            )).scalar()

            # Per-seller avg response time
            avg_rt = (await db.execute(
                select(func.avg(DailyMetric.avg_response_time_seconds))
                .where(DailyMetric.seller_id == s.id)
            )).scalar()

            # Per-seller message count
            msg_count = (await db.execute(
                select(func.count(Message.id))
                .join(Conversation)
                .where(Conversation.seller_id == s.id)
            )).scalar() or 0

            parts.append(f"\n--- Vendedor: {s.name} ---")
            parts.append(f"  ID: {s.id}")
            parts.append(f"  Equipe: {s.team}")
            parts.append(f"  Telefone: {s.phone}")
            parts.append(f"  Ativo: {'Sim' if s.is_active else 'Não'}")
            parts.append(f"  Total conversas: {conv_count}")
            parts.append(f"  Total mensagens: {msg_count}")
            parts.append(f"  Qualidade média: {round(avg_q, 1) if avg_q else 'N/A'}")
            parts.append(f"  Tempo resposta médio: {round(avg_rt, 0) if avg_rt else 'N/A'}s")

        # ── CONVERSATIONS + MESSAGES + ANALYSES ──────────────
        parts.append("\n" + "=" * 60)
        parts.append("CONVERSAS (com mensagens e análises)")
        parts.append("=" * 60)

        convs_result = await db.execute(
            select(Conversation)
            .order_by(Conversation.last_message_at.desc().nulls_last())
            .limit(30)
        )
        conversations = convs_result.scalars().all()

        for conv in conversations:
            # Get seller name
            seller = (await db.execute(
                select(Seller).where(Seller.id == conv.seller_id)
            )).scalar_one_or_none()

            parts.append(f"\n{'─' * 50}")
            parts.append(f"CONVERSA #{conv.id}: {conv.customer_name or conv.customer_phone}")
            parts.append(f"  Vendedor: {seller.name if seller else 'N/A'}")
            parts.append(f"  Cliente telefone: {conv.customer_phone}")
            parts.append(f"  Status: {conv.status}")
            parts.append(f"  Total mensagens: {conv.message_count or 0}")
            if conv.started_at:
                parts.append(f"  Início: {conv.started_at.strftime('%d/%m/%Y %H:%M')}")
            if conv.last_message_at:
                parts.append(f"  Última msg: {conv.last_message_at.strftime('%d/%m/%Y %H:%M')}")

            # ── Analysis ──
            analysis = (await db.execute(
                select(ConversationAnalysis)
                .where(ConversationAnalysis.conversation_id == conv.id)
            )).scalar_one_or_none()

            if analysis:
                parts.append(f"\n  ANÁLISE IA:")
                parts.append(f"    Sentimento: {analysis.sentiment_label} (score: {analysis.sentiment_score})")
                parts.append(f"    Qualidade: {analysis.quality_score}/10")
                parts.append(f"    Estágio: {analysis.stage}")
                parts.append(f"    Tom: {analysis.tone}")
                if analysis.summary:
                    parts.append(f"    Resumo: {analysis.summary}")

                if analysis.quality_breakdown:
                    parts.append(f"    Qualidade por critério:")
                    breakdown = analysis.quality_breakdown
                    if isinstance(breakdown, dict):
                        for key, val in breakdown.items():
                            parts.append(f"      - {key}: {val}/10")

                if analysis.keywords:
                    kw = analysis.keywords
                    if isinstance(kw, list):
                        parts.append(f"    Palavras-chave: {', '.join(str(k) for k in kw)}")

                if analysis.objections:
                    obj = analysis.objections
                    parts.append(f"    Objeções do cliente:")
                    if isinstance(obj, list):
                        for o in obj:
                            if isinstance(o, dict):
                                text = o.get("text") or o.get("descricao") or o.get("tipo") or str(o)
                                handled = o.get("handled", o.get("resolved", "?"))
                                parts.append(f"      - {text} (tratada: {handled})")
                            else:
                                parts.append(f"      - {o}")

                if analysis.objections_handled:
                    oh = analysis.objections_handled
                    parts.append(f"    Como objeções foram tratadas:")
                    if isinstance(oh, list):
                        for o in oh:
                            if isinstance(o, dict):
                                parts.append(f"      - {o.get('descricao', o.get('text', str(o)))}")
                            else:
                                parts.append(f"      - {o}")

            # ── Messages (full conversation) ──
            msgs_result = await db.execute(
                select(Message)
                .where(Message.conversation_id == conv.id)
                .order_by(Message.timestamp)
                .limit(200)
            )
            messages = msgs_result.scalars().all()

            if messages:
                parts.append(f"\n  MENSAGENS ({len(messages)} mensagens):")
                for msg in messages:
                    sender = "VENDEDOR" if msg.from_me or msg.sender_type == "seller" else "CLIENTE"
                    ts = msg.timestamp.strftime("%d/%m %H:%M") if msg.timestamp else ""
                    content = (msg.content or "").strip()
                    if content:
                        parts.append(f"    [{ts}] {sender}: {content}")
                    else:
                        mtype = msg.message_type or "mídia"
                        parts.append(f"    [{ts}] {sender}: [{mtype}]")

        # ── DAILY METRICS ────────────────────────────────────
        parts.append("\n" + "=" * 60)
        parts.append("MÉTRICAS DIÁRIAS (últimos 30 dias)")
        parts.append("=" * 60)

        metrics_result = await db.execute(
            select(DailyMetric)
            .join(Seller)
            .order_by(DailyMetric.date.desc())
            .limit(90)
        )
        metrics = metrics_result.scalars().all()

        if metrics:
            for m in metrics:
                seller = (await db.execute(
                    select(Seller.name).where(Seller.id == m.seller_id)
                )).scalar()
                parts.append(
                    f"  {m.date} | {seller or 'N/A'}: "
                    f"conversas={m.conversations_started}, msgs={m.messages_sent}, "
                    f"qualidade={m.quality_avg or 'N/A'}, "
                    f"resp_média={round(m.avg_response_time_seconds, 0) if m.avg_response_time_seconds else 'N/A'}s, "
                    f"<5min={m.response_under_5min}, 5-30min={m.response_5_30min}, "
                    f"30-60min={m.response_30_60min}, >60min={m.response_over_60min}"
                )
        else:
            parts.append("  Sem métricas disponíveis")

        # ── ALERTS ───────────────────────────────────────────
        parts.append("\n" + "=" * 60)
        parts.append("ALERTAS")
        parts.append("=" * 60)

        alerts_result = await db.execute(
            select(Alert)
            .order_by(Alert.created_at.desc())
            .limit(50)
        )
        alerts = alerts_result.scalars().all()

        if alerts:
            for a in alerts:
                seller = None
                if a.seller_id:
                    seller = (await db.execute(
                        select(Seller.name).where(Seller.id == a.seller_id)
                    )).scalar()
                status = "RESOLVIDO" if a.resolved else "ATIVO"
                parts.append(
                    f"  [{status}] {a.alert_type} | Severidade: {a.severity} | "
                    f"Vendedor: {seller or 'N/A'} | {a.message}"
                )
        else:
            parts.append("  Nenhum alerta registrado")

    except Exception as e:
        logger.error(f"Error building full context: {e}")
        parts.append(f"\nErro ao carregar dados: {str(e)}")

    return "\n".join(parts)


async def agent_chat(db: AsyncSession, question: str) -> dict:
    """Process agent chat question with full system access."""
    if not settings.OPENAI_API_KEY:
        return {
            "answer": "API OpenAI não configurada. Configure OPENAI_API_KEY no .env.",
            "response": "API OpenAI não configurada.",
        }

    try:
        context = await _build_full_context(db)
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(context=context)},
                {"role": "user", "content": question},
            ],
            temperature=0.4,
            max_tokens=4000,
        )
        answer = response.choices[0].message.content.strip()
        return {"answer": answer, "response": answer}
    except Exception as e:
        logger.error(f"Agent chat error: {e}")
        return {
            "answer": f"Erro ao processar sua pergunta: {str(e)}",
            "response": f"Erro: {str(e)}",
        }
