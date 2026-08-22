"""Schema-bound, suggestion-only semantic assessment contract."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from api.ai.provider import Message
from api.ai.tools import Tool

Relationship = Literal["LIKELY_PACKED_VERSION", "LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT", "UNCERTAIN"]
Confidence = Literal["HIGH", "MEDIUM", "LOW"]
IdentityRole = Literal["brand_or_manufacturer", "variant", "local_or_synonymous_name", "descriptor", "packaging_note", "unknown"]


class IdentityInterpretation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=120)
    possible_role: IdentityRole


class SemanticAssessmentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    relationship: Relationship
    confidence: Confidence
    reason: str = Field(min_length=1, max_length=1000)
    signals_for_packed: list[str] = Field(max_length=8)
    signals_against_packed: list[str] = Field(max_length=8)
    identity_interpretations: list[IdentityInterpretation] = Field(max_length=8)


TOOL_NAME = "submit_semantic_assessment"


def validate_tool_call(name: str, arguments: dict) -> SemanticAssessmentOutput:
    if name != TOOL_NAME:
        raise ValueError("Semantic evaluator returned an unexpected tool")
    return SemanticAssessmentOutput.model_validate(arguments)


def semantic_tool() -> Tool:
    return Tool(
        name=TOOL_NAME,
        description="Submit the semantic PACKED relationship assessment. Use only supplied evidence.",
        parameters=SemanticAssessmentOutput.model_json_schema(),
        func=lambda **kwargs: kwargs,
    )


def semantic_system_prompt(prompt_version: str = "phase4b-v2-marker-safety") -> str:
    if prompt_version == "phase4b-v1":
        return """You assess whether a deterministic PACKED retail SKU is an in-store packed version of its supplied LOOSE source. Use only the supplied JSON evidence. Parenthetical text is not automatically a brand. Never invent facts, suppliers, sizes, barcodes, HSN, or outside knowledge. Prefer UNCERTAIN over calling an external product packed. Return exactly one submit_semantic_assessment tool call."""
    if prompt_version != "phase4b-v2-marker-safety":
        raise ValueError(f"Unknown semantic prompt version: {prompt_version}")
    return """You assess whether a deterministic PACKED retail SKU is an in-store packed/repacked version of its supplied LOOSE source. Use only supplied JSON evidence; never use outside product or brand knowledge.

Decision policy: a false LIKELY_PACKED_VERSION is the highest-cost error. A plausible external manufacturer or finished-product identity marker is strong negative evidence. Exact LOOSE-name matching and no direct retail purchase history support a packed relationship, but are not sufficient by themselves. If a marker cannot be confidently interpreted from supplied evidence as a descriptor, local/synonymous name, variant, or packaging note, prefer UNCERTAIN over LIKELY_PACKED_VERSION. Parenthetical text is not automatically a brand, and it is not automatically a harmless descriptor either.

The following are calibration examples only. They demonstrate the decision policy; do not convert marker text into deterministic rules and do not assume an unseen marker has the same meaning.
- CASTROL OIL (NATURAL)500ML matched to CASTROL OIL (NATURAL) LOOSE: LIKELY_PACKED_VERSION. NATURAL is supported as a shared descriptor in this evidence.
- HURULE(BLACK) 1KG matched to HURULE LOOSE: LIKELY_PACKED_VERSION. BLACK can be a variant/descriptor when no contrary supplied evidence exists.
- SUNFLOWER SEEDS(JAVARI)100GM(PHM) matched to SUNFLOWER SEEDS LOOSE: LIKELY_PACKED_VERSION. JAVARI may be a local/variant description in the supplied context.
- AMLA POWDER (FOUR SEASONS) 100GM matched to AMLA POWDER LOOSE: LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT. The additional identity marker is treated as external/different in this evidence.
- JOWAR FLAKES (HEALTH SUTRA) 250GM matched to JOWAR FLAKES LOOSE: LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT. The marker is strong negative identity evidence in this example.
- HING (THREE MANGO) 40GM matched to HING LOOSE: LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT. The marker is strong negative identity evidence in this example.
- MANGO PICKLE 250GM(SWASTIK) matched to MANGO PICKLE LOOSE: LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT. The marker is strong negative identity evidence in this example.

Never invent facts, suppliers, sizes, barcodes, HSN, or external knowledge. Return exactly one submit_semantic_assessment tool call."""


def make_provider(provider: str):
    if provider == "anthropic":
        from api.ai.providers.anthropic import AnthropicProvider
        return AnthropicProvider()
    if provider == "openai":
        from api.ai.providers.openai import OpenAIProvider
        return OpenAIProvider(api_key_provider="openai")
    if provider == "openrouter":
        from api.ai.providers.openai import OpenAIProvider
        return OpenAIProvider(base_url="https://openrouter.ai/api/v1", api_key_provider="openrouter")
    raise ValueError(f"Unknown provider: {provider}")


def evaluate(payload: dict, *, provider: str, model: str, prompt_version: str = "phase4b-v2-marker-safety"):
    completion = make_provider(provider).complete(
        messages=[Message(role="user", content=__import__('json').dumps(payload))],
        system=semantic_system_prompt(prompt_version), tools=[semantic_tool()], model=model, tool_choice="required",
    )
    if len(completion.message.tool_calls) != 1:
        raise ValueError("Semantic evaluator did not return exactly one assessment tool call")
    call = completion.message.tool_calls[0]
    result = validate_tool_call(call.name, call.arguments)
    return result, completion
