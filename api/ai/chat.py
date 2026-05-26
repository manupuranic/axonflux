from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

from api.ai.config import is_model_allowed
from api.ai.cost import calculate_cost
from api.ai.provider import AIProvider, Message, ToolResult
from api.ai.tools import Tool


@dataclass
class ToolExecution:
    tool_name: str
    args: dict[str, Any]
    result: Any
    is_error: bool = False


@dataclass
class TurnResult:
    assistant_text: str | None
    tool_executions: list[ToolExecution]
    new_messages: list[Message]
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    provider: str
    model: str


class ChatSession:
    MAX_TOOL_ROUNDS = 10

    def __init__(self, provider: str, model: str, system_prompt: str,
                 tools: list[Tool], history: list[Message] | None = None):
        if not is_model_allowed(provider, model):
            raise ValueError(f"Model {model!r} not allowed for provider {provider!r}")
        self.provider_name = provider
        self.model = model
        self.system_prompt = system_prompt
        self.tools: dict[str, Tool] = {t.name: t for t in tools}
        self.history: list[Message] = list(history or [])
        self._provider: AIProvider = self._make_provider(provider)

    def _make_provider(self, provider: str) -> AIProvider:
        if provider == "anthropic":
            from api.ai.providers.anthropic import AnthropicProvider
            return AnthropicProvider()
        if provider == "openai":
            from api.ai.providers.openai import OpenAIProvider
            return OpenAIProvider(api_key_provider="openai")
        if provider == "openrouter":
            from api.ai.providers.openai import OpenAIProvider
            return OpenAIProvider(base_url="https://openrouter.ai/api/v1", api_key_provider="openrouter")
        raise ValueError(f"Unknown provider: {provider!r}")

    def send(self, user_message: str) -> TurnResult:
        user_msg = Message(role="user", content=user_message)
        self.history.append(user_msg)
        executions: list[ToolExecution] = []
        new_msgs: list[Message] = [user_msg]
        total_p = total_c = 0

        for round_num in range(self.MAX_TOOL_ROUNDS):
            # Force tool call on first round so model can't narrate without acting
            tc = "required" if round_num == 0 and self.tools else "auto"
            completion = self._provider.complete(
                messages=self.history, system=self.system_prompt,
                tools=list(self.tools.values()), model=self.model,
                tool_choice=tc,
            )
            total_p += completion.prompt_tokens
            total_c += completion.completion_tokens
            asst = completion.message
            self.history.append(asst)
            new_msgs.append(asst)

            if not asst.tool_calls:
                break

            tool_results: list[ToolResult] = []
            for tc in asst.tool_calls:
                if tc.name not in self.tools:
                    res, err = {"error": f"Unknown tool: {tc.name}"}, True
                else:
                    try:
                        res, err = self.tools[tc.name].func(**tc.arguments), False
                    except Exception as exc:
                        res, err = {"error": str(exc)}, True
                executions.append(ToolExecution(tc.name, tc.arguments, res, err))
                tool_results.append(ToolResult(tc.id, tc.name, res, err))

            results_msg = Message(role="user", tool_results=tool_results)
            self.history.append(results_msg)
            new_msgs.append(results_msg)

        last_text = next(
            (m.content for m in reversed(new_msgs) if m.role == "assistant" and m.content), None
        )
        return TurnResult(
            assistant_text=last_text,
            tool_executions=executions,
            new_messages=new_msgs,
            prompt_tokens=total_p,
            completion_tokens=total_c,
            cost_usd=calculate_cost(self.provider_name, self.model, total_p, total_c),
            provider=self.provider_name,
            model=self.model,
        )
