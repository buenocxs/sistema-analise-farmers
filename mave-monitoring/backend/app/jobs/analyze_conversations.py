import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session
from app.models import Seller, Conversation, Message, ConversationAnalysis
from app.services.ai_analyzer import analyze_conversation
from app.jobs.task_manager import update_task, complete_task, fail_task
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def analyze_seller_conversations(seller_id: int, task_id: str, force: bool = False):
    """Analyze all conversations for a seller using AI."""
    try:
        async with async_session() as db:
            # Get conversations for seller
            q = (
                select(Conversation)
                .where(Conversation.seller_id == seller_id)
                .order_by(Conversation.last_message_at.desc())
            )
            result = await db.execute(q)
            conversations = result.scalars().all()

            total = len(conversations)
            update_task(task_id, total=total, message=f"Analisando {total} conversas...")
            analyzed = 0
            skipped = 0
            errors = 0

            for i, conv in enumerate(conversations):
                try:
                    # Skip if already analyzed (unless force)
                    if conv.analysis and not force:
                        skipped += 1
                        update_task(task_id, current=i + 1, message=f"Já analisada ({i+1}/{total})")
                        continue

                    # Get messages for conversation
                    msg_result = await db.execute(
                        select(Message)
                        .where(Message.conversation_id == conv.id)
                        .order_by(Message.timestamp)
                    )
                    messages = msg_result.scalars().all()

                    if len(messages) < 2:
                        skipped += 1
                        update_task(task_id, current=i + 1, message=f"Poucas mensagens ({i+1}/{total})")
                        continue

                    update_task(task_id, current=i + 1, message=f"Analisando {conv.customer_name or conv.customer_phone} ({i+1}/{total})")

                    # Prepare messages for analysis
                    msg_dicts = [
                        {
                            "content": m.content,
                            "sender_type": m.sender_type,
                            "sender_name": m.sender_name,
                            "from_me": m.from_me,
                        }
                        for m in messages
                        if m.content
                    ]

                    analysis_data = await analyze_conversation(msg_dicts)
                    if not analysis_data:
                        skipped += 1
                        continue

                    # Upsert analysis
                    if conv.analysis:
                        for key, value in analysis_data.items():
                            if hasattr(conv.analysis, key):
                                setattr(conv.analysis, key, value)
                        conv.analysis.analyzed_at = datetime.now(timezone.utc)
                    else:
                        analysis = ConversationAnalysis(
                            conversation_id=conv.id,
                            sentiment_label=analysis_data.get("sentiment_label"),
                            sentiment_score=analysis_data.get("sentiment_score"),
                            quality_score=analysis_data.get("quality_score"),
                            quality_breakdown=analysis_data.get("quality_breakdown"),
                            stage=analysis_data.get("stage"),
                            tone=analysis_data.get("tone"),
                            summary=analysis_data.get("summary"),
                            keywords=analysis_data.get("keywords"),
                            objections=analysis_data.get("objections"),
                            objections_handled=analysis_data.get("objections_handled"),
                        )
                        db.add(analysis)

                    analyzed += 1
                    await db.flush()

                except Exception as e:
                    logger.error(f"Error analyzing conversation {conv.id}: {e}")
                    errors += 1
                    continue

            await db.commit()
            complete_task(task_id, {
                "analyzed": analyzed,
                "skipped": skipped,
                "errors": errors,
                "processed": total,
            })
            logger.info(f"Analysis complete for seller {seller_id}: {analyzed} analyzed, {skipped} skipped, {errors} errors")

    except Exception as e:
        logger.error(f"Analysis failed for seller {seller_id}: {e}")
        fail_task(task_id, str(e))


async def analyze_single_conversation(conversation_id: int) -> dict | None:
    """Analyze a single conversation."""
    try:
        async with async_session() as db:
            result = await db.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conv = result.scalar_one_or_none()
            if not conv:
                return None

            msg_result = await db.execute(
                select(Message)
                .where(Message.conversation_id == conv.id)
                .order_by(Message.timestamp)
            )
            messages = msg_result.scalars().all()

            if len(messages) < 2:
                return None

            msg_dicts = [
                {
                    "content": m.content,
                    "sender_type": m.sender_type,
                    "sender_name": m.sender_name,
                    "from_me": m.from_me,
                }
                for m in messages
                if m.content
            ]

            analysis_data = await analyze_conversation(msg_dicts)
            if not analysis_data:
                return None

            # Upsert
            existing = await db.execute(
                select(ConversationAnalysis).where(ConversationAnalysis.conversation_id == conv.id)
            )
            existing_analysis = existing.scalar_one_or_none()

            if existing_analysis:
                for key, value in analysis_data.items():
                    if hasattr(existing_analysis, key):
                        setattr(existing_analysis, key, value)
                existing_analysis.analyzed_at = datetime.now(timezone.utc)
                await db.commit()
                return analysis_data
            else:
                new_analysis = ConversationAnalysis(
                    conversation_id=conv.id,
                    sentiment_label=analysis_data.get("sentiment_label"),
                    sentiment_score=analysis_data.get("sentiment_score"),
                    quality_score=analysis_data.get("quality_score"),
                    quality_breakdown=analysis_data.get("quality_breakdown"),
                    stage=analysis_data.get("stage"),
                    tone=analysis_data.get("tone"),
                    summary=analysis_data.get("summary"),
                    keywords=analysis_data.get("keywords"),
                    objections=analysis_data.get("objections"),
                    objections_handled=analysis_data.get("objections_handled"),
                )
                db.add(new_analysis)
                await db.commit()
                return analysis_data

    except Exception as e:
        logger.error(f"Error analyzing conversation {conversation_id}: {e}")
        return None
