import json
import os

import anthropic

from api.tools.pamphlets.models import PamphletItem

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def generate_highlights(items: list[PamphletItem]) -> list[dict]:
    """Call Claude to generate punchy highlight_text for each pamphlet item.

    Returns list of {id, highlight_text} dicts ready for bulk_update_highlights().
    """
    if not items:
        return []

    lines = []
    for i, item in enumerate(items, 1):
        name = item.display_name or item.barcode or "Product"
        mrp = f"₹{item.original_price}" if item.original_price else "N/A"
        offer = f"₹{item.offer_price}" if item.offer_price else "N/A"
        lines.append(f"{i}. id={item.id} | {name} | MRP {mrp} | Offer {offer}")

    product_list = "\n".join(lines)

    prompt = f"""You are writing short promotional badge text for a health mart pamphlet.
For each product write a punchy 2–6 word highlight (examples: "Save ₹120 Today!", "Best Value!", "Limited Stock!", "Top Seller").
Rules:
- Keep it retail-friendly. No medical claims.
- If there is a discount, quantify it (e.g. "Save ₹50!" or "33% OFF").
- If no discount info, use generic retail copy.
- Return ONLY a JSON array, no prose.

Products:
{product_list}

Return format (one object per product, same order):
[{{"id": "<uuid>", "highlight_text": "<text>"}}]"""

    client = _get_client()
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences if Claude wrapped in ```json
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
