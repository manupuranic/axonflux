import os

# Suggestions only — any model string is accepted; provider API validates at call time
ALLOWED_MODELS: dict[str, list[str]] = {
    "anthropic": [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
    ],
    "openrouter": [
        "anthropic/claude-sonnet-4-6",
        "anthropic/claude-sonnet-5",
        "anthropic/claude-opus-4-7",
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "google/gemini-2.0-flash-001",
        "deepseek/deepseek-chat",
        "meta-llama/llama-3.1-70b-instruct",
    ],
}


def get_default_provider() -> str:
    return os.environ.get("AI_DEFAULT_PROVIDER", "anthropic")


def get_default_model() -> str:
    provider = get_default_provider()
    fallback = ALLOWED_MODELS[provider][0]
    return os.environ.get("AI_DEFAULT_MODEL", fallback)


def is_model_allowed(provider: str, model: str) -> bool:
    return provider in ALLOWED_MODELS  # any model string OK; provider API validates at call time


def get_api_key(provider: str) -> str:
    env_var = {
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }[provider]
    return os.environ[env_var]
