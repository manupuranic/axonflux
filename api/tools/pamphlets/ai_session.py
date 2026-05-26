from __future__ import annotations
from api.ai import ChatSession
from api.ai.config import get_default_provider, get_default_model
from api.ai.provider import Message
from api.tools.pamphlets.state import PamphletState
from api.agents.tools.pamphlet_dsl import build_dsl_tools
from api.agents.tools.pamphlet_items import build_item_tools
from api.tools.pamphlets.system_prompt import build_system_prompt


def make_pamphlet_session(
    dsl: dict,
    theme: dict,
    items: dict[str, dict],
    pamphlet_title: str,
    history: list[Message],
    provider: str | None = None,
    model: str | None = None,
    db=None,
    pamphlet_id: str = "",
) -> tuple[ChatSession, PamphletState]:
    state = PamphletState(dsl=dsl, theme=theme, items=items, db=db, pamphlet_id=pamphlet_id)
    tools = build_dsl_tools(state) + build_item_tools(state)
    session = ChatSession(
        provider=provider or get_default_provider(),
        model=model or get_default_model(),
        system_prompt=build_system_prompt(pamphlet_title, len(items)),
        tools=tools,
        history=history,
    )
    return session, state
