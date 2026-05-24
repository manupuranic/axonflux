from __future__ import annotations
from api.ai import ChatSession
from api.ai.config import get_default_provider, get_default_model
from api.ai.provider import Message
from api.tools.pamphlets.ai_tools import PamphletState, build_tools
from api.tools.pamphlets.system_prompt import build_system_prompt


def make_pamphlet_session(
    dsl: dict,
    theme: dict,
    items: dict[str, dict],
    pamphlet_title: str,
    history: list[Message],
    provider: str | None = None,
    model: str | None = None,
) -> tuple[ChatSession, PamphletState]:
    state = PamphletState(dsl=dsl, theme=theme, items=items)
    tools = build_tools(state)
    session = ChatSession(
        provider=provider or get_default_provider(),
        model=model or get_default_model(),
        system_prompt=build_system_prompt(pamphlet_title, len(items)),
        tools=tools,
        history=history,
    )
    return session, state
