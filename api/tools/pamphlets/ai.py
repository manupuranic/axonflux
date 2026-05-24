from api.tools.pamphlets.models import PamphletItem
from api.ai import ChatSession
from api.ai.tools import tool


def generate_highlights(items: list[PamphletItem]) -> list[dict]:
    if not items:
        return []

    lines = []
    for i, item in enumerate(items, 1):
        name = item.display_name or item.barcode or "Product"
        mrp = f"₹{item.original_price}" if item.original_price else "N/A"
        offer = f"₹{item.offer_price}" if item.offer_price else "N/A"
        lines.append(f"{i}. id={item.id} | {name} | MRP {mrp} | Offer {offer}")

    results: list[dict] = []

    @tool(
        description="Return highlight text for each product.",
        parameters={"type": "object", "properties": {
            "highlights": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "string"}, "highlight_text": {"type": "string"}
            }, "required": ["id", "highlight_text"]}}
        }, "required": ["highlights"]}
    )
    def submit_highlights(highlights: list) -> dict:
        results.extend(highlights)
        return {"ok": True}

    session = ChatSession(
        provider="anthropic",
        model="claude-haiku-4-5-20251001",
        system_prompt="You write punchy 2-6 word retail badge text for pamphlet products. No medical claims.",
        tools=[submit_highlights],
    )
    product_list = "\n".join(lines)
    session.send(
        f"Write highlight_text for each product. Call submit_highlights with all results.\n\n{product_list}"
    )
    return results if results else []
