from unittest.mock import MagicMock, patch
from api.ai.chat import ChatSession, TurnResult
from api.ai.provider import Message, ToolCall, ToolResult, CompletionResult
from api.ai.tools import tool, Tool
import pytest


def test_message_defaults():
    m = Message(role="user", content="hello")
    assert m.tool_calls == []
    assert m.tool_results == []

def test_tool_call():
    tc = ToolCall(id="tc1", name="set_theme", arguments={"name": "monsoon"})
    assert tc.name == "set_theme"

def test_tool_result_default_not_error():
    tr = ToolResult(tool_call_id="tc1", name="set_theme", result={"ok": True})
    assert tr.is_error is False


def test_tool_decorator():
    @tool(
        description="Apply theme.",
        parameters={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}
    )
    def set_theme(name: str) -> dict:
        return {"applied": name}

    assert isinstance(set_theme, Tool)
    assert set_theme.name == "set_theme"
    assert set_theme.func(name="monsoon") == {"applied": "monsoon"}


def test_chat_session_rejects_unknown_model():
    with pytest.raises(ValueError, match="not allowed"):
        ChatSession(provider="anthropic", model="gpt-unicorn", system_prompt="", tools=[])

def test_chat_session_single_turn_no_tools():
    @tool(description="noop", parameters={"type": "object", "properties": {}, "required": []})
    def noop() -> dict:
        return {}

    mock_prov = MagicMock()
    mock_prov.complete.return_value = CompletionResult(
        message=Message(role="assistant", content="Done!", tool_calls=[]),
        prompt_tokens=10, completion_tokens=5,
    )
    # Patch _make_provider so ChatSession.__init__ never imports the real SDK
    with patch.object(ChatSession, "_make_provider", return_value=mock_prov):
        session = ChatSession(provider="anthropic", model="claude-sonnet-4-6", system_prompt="sys", tools=[noop])
    result = session.send("Hello")
    assert result.assistant_text == "Done!"
    assert result.tool_executions == []
