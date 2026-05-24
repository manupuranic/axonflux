from __future__ import annotations
from dataclasses import dataclass
from typing import Callable


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict  # JSON Schema object
    func: Callable


def tool(description: str, parameters: dict):
    """Decorator factory — converts a function into a Tool with explicit JSON schema."""
    def decorator(func: Callable) -> Tool:
        return Tool(name=func.__name__, description=description, parameters=parameters, func=func)
    return decorator
