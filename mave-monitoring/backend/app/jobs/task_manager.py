import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable, Coroutine, Any

logger = logging.getLogger(__name__)

# In-memory task store
_tasks: dict[str, dict] = {}


def create_task(total: int = 0) -> str:
    task_id = str(uuid.uuid4())[:8]
    _tasks[task_id] = {
        "id": task_id,
        "status": "running",
        "progress": 0,
        "message": "Iniciando...",
        "current": 0,
        "total": total,
        "result": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return task_id


def update_task(task_id: str, **kwargs):
    if task_id in _tasks:
        _tasks[task_id].update(kwargs)
        if "current" in kwargs and _tasks[task_id]["total"] > 0:
            _tasks[task_id]["progress"] = round(
                kwargs["current"] / _tasks[task_id]["total"] * 100, 1
            )


def complete_task(task_id: str, result: dict | None = None):
    if task_id in _tasks:
        _tasks[task_id]["status"] = "completed"
        _tasks[task_id]["progress"] = 100
        _tasks[task_id]["message"] = "Concluído"
        _tasks[task_id]["result"] = result


def fail_task(task_id: str, message: str = "Erro"):
    if task_id in _tasks:
        _tasks[task_id]["status"] = "failed"
        _tasks[task_id]["message"] = message


def get_task(task_id: str) -> dict | None:
    return _tasks.get(task_id)


def run_background(coro: Coroutine):
    """Fire-and-forget a coroutine as a background task."""
    loop = asyncio.get_event_loop()
    task = loop.create_task(coro)
    task.add_done_callback(_task_done)
    return task


def _task_done(task: asyncio.Task):
    if task.exception():
        logger.error(f"Background task failed: {task.exception()}")
