from api.ai.provider import Message, ToolCall, ToolResult
from api.ai.tools import tool, Tool

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
