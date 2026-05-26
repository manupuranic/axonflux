from __future__ import annotations
import asyncio
import logging
import threading
import uuid
from dataclasses import dataclass, field
from typing import Optional

from api.ai import ChatSession
from api.agents.tools.infra import build_infra_tools
from api.ai.config import get_default_provider

# Cheapest tool-capable model per provider — image agent must use tool use,
# so we can't inherit get_default_model() (user may select a non-tool model).
_AGENT_MODELS: dict[str, str] = {
    "anthropic": "claude-haiku-4-5-20251001",
    "openrouter": "anthropic/claude-haiku-4-5-20251001",
    "openai": "gpt-4o-mini",
}

logger = logging.getLogger(__name__)

_tasks: dict[str, "ImageTask"] = {}
_tasks_lock = threading.Lock()

_SYSTEM_PROMPT = """You are an image-finding agent for a supermarket product catalog.
Find a direct, publicly accessible product image URL for the given product.

Strategy (in order):
1. If barcode provided: call fetch_url("https://world.openfoodfacts.org/api/v0/product/{barcode}.json")
   - Parse JSON for: product.image_front_url or product.image_url
   - If found, use it directly without further searching.
2. If barcode missing or OFF had no image: call web_search with include_images=true
   - Query format: "{product_name} {unit} product photo"
   - Pick the most relevant image URL from the images list in the response.

Output rules:
- Your final message must contain the image URL on its own line.
- URL must be a direct image (.jpg, .jpeg, .png, .webp, .gif) or from a known image CDN.
- If no suitable image found after searching, output exactly: NOT_FOUND
"""


@dataclass
class ImageTask:
    task_id: str
    pamphlet_id: str
    status: str = "pending"
    current_product: str = ""
    total: int = 0
    done_count: int = 0
    updates: list[dict] = field(default_factory=list)
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "pamphlet_id": self.pamphlet_id,
            "status": self.status,
            "current_product": self.current_product,
            "total": self.total,
            "done_count": self.done_count,
            "updates": self.updates,
            "error": self.error,
        }


async def find_image_for_product(
    display_name: str,
    barcode: Optional[str],
    category: Optional[str],
    unit: Optional[str],
) -> Optional[str]:
    tools = build_infra_tools()
    provider = get_default_provider()
    model = _AGENT_MODELS.get(provider, "claude-haiku-4-5-20251001")
    session = ChatSession(
        provider=provider,
        model=model,
        system_prompt=_SYSTEM_PROMPT,
        tools=tools,
        history=[],
    )
    msg = f"Find product image for: {display_name}"
    if barcode:
        msg += f"\nBarcode: {barcode}"
    if category:
        msg += f"\nCategory: {category}"
    if unit:
        msg += f"\nUnit/Size: {unit}"

    turn = session.send(msg)
    text = (turn.assistant_text or "").strip()

    if "NOT_FOUND" in text:
        return None

    for line in reversed(text.split("\n")):
        line = line.strip()
        if line.startswith("http"):
            return line
    return None


def _run_scan_thread(task: ImageTask, items: list[dict], db_factory) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_scan_items(task, items, db_factory))
    finally:
        loop.close()


async def _scan_items(task: ImageTask, items: list[dict], db_factory) -> None:
    task.status = "running"
    task.total = len(items)
    try:
        from api.tools.pamphlets.models import PamphletItem
        for item in items:
            task.current_product = item.get("display_name", "")
            url = await find_image_for_product(
                display_name=item.get("display_name", ""),
                barcode=item.get("barcode"),
                category=item.get("category"),
                unit=item.get("unit"),
            )
            if url:
                task.updates.append({
                    "item_id": item["id"],
                    "image_url": url,
                    "name": item.get("display_name"),
                })
                with db_factory() as db:
                    pi = db.query(PamphletItem).filter(PamphletItem.id == item["id"]).first()
                    if pi:
                        pi.image_url = url
                        db.commit()
            task.done_count += 1
        task.status = "done"
    except Exception as exc:
        logger.exception("Image scan task %s failed", task.task_id)
        task.status = "error"
        task.error = str(exc)


def start_scan_task(pamphlet_id: str, items: list[dict], db_factory) -> str:
    task_id = str(uuid.uuid4())[:8]
    task = ImageTask(task_id=task_id, pamphlet_id=pamphlet_id)
    with _tasks_lock:
        _tasks[task_id] = task
    t = threading.Thread(
        target=_run_scan_thread, args=(task, items, db_factory), daemon=True
    )
    t.start()
    return task_id


def get_task(task_id: str) -> Optional[ImageTask]:
    with _tasks_lock:
        return _tasks.get(task_id)
