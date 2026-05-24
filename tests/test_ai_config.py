import pytest

from api.ai.config import ALLOWED_MODELS, get_default_provider, get_default_model, is_model_allowed
from api.ai.cost import calculate_cost


def test_allowed_models_has_three_providers():
    assert "anthropic" in ALLOWED_MODELS
    assert "openai" in ALLOWED_MODELS
    assert "openrouter" in ALLOWED_MODELS


def test_default_provider_and_model():
    assert get_default_provider() in ALLOWED_MODELS
    assert get_default_model() in ALLOWED_MODELS[get_default_provider()]


def test_is_model_allowed_rejects_unknown():
    assert is_model_allowed("anthropic", "claude-sonnet-4-6") is True
    assert is_model_allowed("anthropic", "claude-opus-99") is False
    assert is_model_allowed("unknown-provider", "x") is False


def test_calculate_cost_anthropic_sonnet():
    cost = calculate_cost("anthropic", "claude-sonnet-4-6", prompt_tokens=1000, completion_tokens=500)
    assert cost > 0
    assert isinstance(cost, float)


def test_calculate_cost_unknown_model_returns_zero():
    cost = calculate_cost("anthropic", "claude-unicorn", prompt_tokens=1000, completion_tokens=500)
    assert cost == 0.0
