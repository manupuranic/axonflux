import anthropic as sdk
from api.ai.provider import AIProvider, Message, ToolCall, CompletionResult
from api.ai.config import get_api_key
from api.ai.tools import Tool


class AnthropicProvider(AIProvider):
    def __init__(self):
        self._client: sdk.Anthropic | None = None

    def _get_client(self) -> sdk.Anthropic:
        if not self._client:
            self._client = sdk.Anthropic(api_key=get_api_key("anthropic"))
        return self._client

    def complete(self, messages: list[Message], system: str, tools: list[Tool], model: str, tool_choice: str = "auto") -> CompletionResult:
        sdk_msgs = []
        for msg in messages:
            if msg.role == "user" and msg.tool_results:
                content: list = []
                if msg.content:
                    content.append({"type": "text", "text": msg.content})
                for tr in msg.tool_results:
                    content.append({
                        "type": "tool_result",
                        "tool_use_id": tr.tool_call_id,
                        "content": str(tr.result),
                        "is_error": tr.is_error,
                    })
                sdk_msgs.append({"role": "user", "content": content})
            elif msg.role == "assistant" and msg.tool_calls:
                content = []
                if msg.content:
                    content.append({"type": "text", "text": msg.content})
                for tc in msg.tool_calls:
                    content.append({"type": "tool_use", "id": tc.id, "name": tc.name, "input": tc.arguments})
                sdk_msgs.append({"role": "assistant", "content": content})
            else:
                sdk_msgs.append({"role": msg.role, "content": msg.content or ""})

        sdk_tools = [
            {"name": t.name, "description": t.description, "input_schema": t.parameters}
            for t in tools
        ]
        kwargs: dict = {"model": model, "max_tokens": 4096, "system": system, "messages": sdk_msgs}
        if sdk_tools:
            kwargs["tools"] = sdk_tools
            if tool_choice == "required":
                kwargs["tool_choice"] = {"type": "any"}

        resp = self._get_client().messages.create(**kwargs)

        text, tool_calls = "", []
        for block in resp.content:
            if block.type == "text":
                text = block.text
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(id=block.id, name=block.name, arguments=block.input))

        return CompletionResult(
            message=Message(role="assistant", content=text or None, tool_calls=tool_calls),
            prompt_tokens=resp.usage.input_tokens,
            completion_tokens=resp.usage.output_tokens,
        )
