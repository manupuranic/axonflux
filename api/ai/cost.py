# USD per million tokens (prompt, completion)
_PRICING: dict[str, dict[str, tuple[float, float]]] = {
    "anthropic": {
        "claude-opus-4-7": (15.0, 75.0),
        "claude-sonnet-4-6": (3.0, 15.0),
        "claude-haiku-4-5-20251001": (1.0, 5.0),
    },
    "openai": {
        "gpt-4o": (2.5, 10.0),
        "gpt-4o-mini": (0.15, 0.6),
        "gpt-4-turbo": (10.0, 30.0),
    },
    "openrouter": {
        "anthropic/claude-sonnet-4-6": (3.0, 15.0),
        "openai/gpt-4o": (2.5, 10.0),
        "meta-llama/llama-3.1-70b-instruct": (0.5, 0.75),
        "deepseek/deepseek-chat": (0.14, 0.28),
    },
}


def calculate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = _PRICING.get(provider, {}).get(model)
    if not pricing:
        return 0.0
    p_rate, c_rate = pricing
    return round(
        (prompt_tokens * p_rate + completion_tokens * c_rate) / 1_000_000,
        6,
    )
