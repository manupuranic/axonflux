from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolResult:
    tool_call_id: str
    name: str
    result: Any
    is_error: bool = False


@dataclass
class Message:
    role: str  # "user" | "assistant"
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)


@dataclass
class CompletionResult:
    message: Message
    prompt_tokens: int
    completion_tokens: int


class AIProvider(ABC):
    @abstractmethod
    def complete(self, messages: list[Message], system: str, tools: list, model: str, tool_choice: str = "auto") -> CompletionResult: ...
