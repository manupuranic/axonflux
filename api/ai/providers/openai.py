import json
from openai import OpenAI
from api.ai.provider import AIProvider, Message, ToolCall, CompletionResult
from api.ai.config import get_api_key
from api.ai.tools import Tool


class OpenAIProvider(AIProvider):
    def __init__(self, base_url: str | None = None, api_key_provider: str = "openai"):
        self._client: OpenAI | None = None
        self._base_url = base_url
        self._api_key_provider = api_key_provider

    def _get_client(self) -> OpenAI:
        if not self._client:
            self._client = OpenAI(
                api_key=get_api_key(self._api_key_provider),
                base_url=self._base_url,
                timeout=120.0,
            )
        return self._client

    def complete(self, messages: list[Message], system: str, tools: list[Tool], model: str) -> CompletionResult:
        oai_msgs: list[dict] = [{"role": "system", "content": system}]
        for msg in messages:
            if msg.role == "user" and not msg.tool_results:
                oai_msgs.append({"role": "user", "content": msg.content or ""})
            elif msg.role == "assistant" and msg.tool_calls:
                oai_msgs.append({
                    "role": "assistant",
                    "content": msg.content,
                    "tool_calls": [
                        {"id": tc.id, "type": "function",
                         "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)}}
                        for tc in msg.tool_calls
                    ],
                })
            elif msg.role == "user" and msg.tool_results:
                if msg.content:
                    oai_msgs.append({"role": "user", "content": msg.content})
                for tr in msg.tool_results:
                    oai_msgs.append({
                        "role": "tool",
                        "tool_call_id": tr.tool_call_id,
                        "content": json.dumps(tr.result) if not tr.is_error else f"Error: {tr.result}",
                    })
            else:
                oai_msgs.append({"role": msg.role, "content": msg.content or ""})

        oai_tools = [
            {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}
            for t in tools
        ]
        kwargs: dict = {"model": model, "messages": oai_msgs}
        if oai_tools:
            kwargs["tools"] = oai_tools
            kwargs["tool_choice"] = "auto"

        resp = self._get_client().chat.completions.create(**kwargs)

        if not resp.choices:
            raise ValueError(
                f"Provider returned no choices for model '{model}'. "
                "The model may not support function calling — try a Claude model via OpenRouter."
            )

        choice = resp.choices[0]

        tool_calls = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {"_raw": tc.function.arguments}
                tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args))

        return CompletionResult(
            message=Message(role="assistant", content=choice.message.content, tool_calls=tool_calls),
            prompt_tokens=resp.usage.prompt_tokens if resp.usage else 0,
            completion_tokens=resp.usage.completion_tokens if resp.usage else 0,
        )
