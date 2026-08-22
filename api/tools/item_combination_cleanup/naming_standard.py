"""Approved Phase 5B naming conventions. Pure and inspectable by design."""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class NameStandardSuggestion:
    suggested_name: str | None
    transformations: list[str]
    category: str | None
    evidence: dict[str, object]


_TOKEN_RULES = (
    ("CHOCOLT", "CHOCOLATE", "HUMAN_VERIFIED_CORRECTION"),
    ("SHOULDE", "SHOULDERS", "HUMAN_VERIFIED_CORRECTION"),
    ("LIQUD", "LIQUID", "HUMAN_VERIFIED_CORRECTION"),
    ("CHESE", "CHEESE", "HUMAN_VERIFIED_CORRECTION"),
    ("WIPERC", "WIPER", "HUMAN_VERIFIED_CORRECTION"),
    ("SAJJI", "SAJJE", "CANONICAL_TERMINOLOGY"),
    ("AVALAKI", "AVALAKKI", "CANONICAL_TERMINOLOGY"),
    ("SHMPO", "SHAMPOO", "ABBREVIATION_EXPANSION"),
    ("SHMP", "SHAMPOO", "ABBREVIATION_EXPANSION"),
    ("PWDR", "POWDER", "ABBREVIATION_EXPANSION"),
    ("TOPLOAD", "TOP LOAD", "CONTEXTUAL_ABBREVIATION"),
)
_LAUNDRY_CONTEXT = re.compile(r"\b(TIDE|SURF|ARIEL|RIN|MATIC|DETERGENT|WASH)\b", re.I)


def _replace_token(value: str, old: str, new: str) -> tuple[str, bool]:
    return re.subn(rf"(?<![A-Z0-9]){re.escape(old)}(?![A-Z0-9])", new, value, flags=re.I)


def suggest_name_standard(base_name: str | None) -> NameStandardSuggestion:
    if not base_name:
        return NameStandardSuggestion(None, [], None, {})
    value, transformations, categories = base_name, [], []
    for old, new, category in _TOKEN_RULES:
        value, count = _replace_token(value, old, new)
        if count:
            transformations.append(f"{old} → {new}")
            categories.append(category)
    laundry = bool(_LAUNDRY_CONTEXT.search(base_name))
    if laundry:
        for old, new in (("FL", "FRONT LOAD"), ("TL", "TOP LOAD")):
            value, count = _replace_token(value, old, new)
            if count:
                transformations.append(f"{old} → {new}")
                categories.append("CONTEXTUAL_ABBREVIATION")
    if value == base_name:
        return NameStandardSuggestion(None, [], None, {"laundry_context": laundry})
    return NameStandardSuggestion(value, transformations, categories[0], {"laundry_context": laundry, "categories": categories})
