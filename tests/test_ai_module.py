from api.ai.provider import Message, ToolCall, ToolResult

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
