"""Deterministic Item Name and Size normalization for ER4U cleanup Phase 2."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Longer unit aliases first so GMS matches before GM before G.
_UNIT_ALIASES = (
    ("GMS", "G"),
    ("GM", "G"),
    ("GR", "G"),
    ("KGS", "KG"),
    ("KG", "KG"),
    ("MLS", "ML"),
    ("ML", "ML"),
    ("LTRS", "L"),
    ("LTR", "L"),
    ("LT", "L"),
    ("PCS", "PCS"),
    ("PC", "PCS"),
    ("NOS", "PCS"),
    ("G", "G"),
    ("L", "L"),
)

_UNIT_GROUP = "|".join(re.escape(alias) for alias, _ in _UNIT_ALIASES)
_SIZE_TOKEN = re.compile(
    rf"(\d+(?:\.\d+)?)\s*({_UNIT_GROUP})\b",
    re.IGNORECASE,
)
_LETTER_SIZE = re.compile(
    rf"([A-Z])(\d+(?:\.\d+)?(?:{_UNIT_GROUP}))\b",
)
_MULTI_SPACE = re.compile(r"\s+")
_SPACE_BEFORE_PAREN = re.compile(r"\s*\(\s*")
_SPACE_AFTER_PAREN = re.compile(r"\s*\)\s*")
_NBSP = re.compile(r"[\xa0\u2000-\u200b]+")

_CANON_UNIT = {alias: canon for alias, canon in _UNIT_ALIASES}


def _canon_qty_unit(qty_text: str, unit_text: str) -> str:
    unit = _CANON_UNIT.get(unit_text.upper(), unit_text.upper())
    if "." in qty_text:
        qty = float(qty_text)
        if qty.is_integer():
            qty_num: int | float = int(qty)
        else:
            qty_num = qty
    else:
        qty_num = int(qty_text)

    if unit == "G" and isinstance(qty_num, int) and qty_num >= 1000 and qty_num % 1000 == 0:
        return f"{qty_num // 1000}KG"
    if isinstance(qty_num, float):
        text = f"{qty_num:g}"
        return f"{text}{unit}"
    return f"{qty_num}{unit}"


def normalize_size_token(raw: str | None) -> str | None:
    """Normalize a standalone Size cell. Returns None if empty or unambiguous size not found."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    match = _SIZE_TOKEN.search(text.upper().replace(" ", ""))
    if not match:
        match = _SIZE_TOKEN.search(text)
    if not match:
        return None
    return _canon_qty_unit(match.group(1), match.group(2))


def extract_size_from_name(name: str) -> str | None:
    matches = list(_SIZE_TOKEN.finditer(name))
    if not matches:
        return None
    last = matches[-1]
    return _canon_qty_unit(last.group(1), last.group(2))


def normalize_item_name(raw: object | None) -> str:
    if raw is None:
        return ""
    text = str(raw)
    text = _NBSP.sub(" ", text)
    text = text.strip()
    if not text:
        return ""
    text = text.upper()

    def _repl(match: re.Match[str]) -> str:
        return _canon_qty_unit(match.group(1), match.group(2))

    text = _SIZE_TOKEN.sub(_repl, text)
    text = _LETTER_SIZE.sub(r"\1 \2", text)
    text = _SPACE_BEFORE_PAREN.sub(" (", text)
    text = _SPACE_AFTER_PAREN.sub(") ", text)
    text = _MULTI_SPACE.sub(" ", text).strip()
    return text


def has_loose_token(name: str) -> bool:
    return "LOOSE" in name.upper()


def has_phm_marker(name: str) -> bool:
    return bool(re.search(r"\(PHM\)|\bPHM\b", name.upper()))


_BASE_STRIP = re.compile(
    r"\([^)]*\)"
    rf"|\b(\d+(?:\.\d+)?(?:{_UNIT_GROUP}))\b"
    r"|\b(LOOSE|PKG|PHM|BULK|PLAIN)\b",
    re.IGNORECASE,
)
_PUNCT = re.compile(r"[^\w\s]")
_PARENTHETICAL = re.compile(r"\(([^()]*)\)")


def base_name(name: str) -> str:
    """Normalized comparable product base: drop size, LOOSE/PHM/PKG, and parentheticals."""
    text = normalize_item_name(name)
    text = _BASE_STRIP.sub(" ", text)
    text = _PUNCT.sub(" ", text)
    text = _MULTI_SPACE.sub(" ", text).strip()
    return text


def has_retail_size(name: str) -> bool:
    return extract_size_from_name(normalize_item_name(name)) is not None


@dataclass(frozen=True)
class ExternalBrandMarkerEvidence:
    """Explicit external-brand-like markers found in a product name.

    This is deliberately a warning signal, not a brand extractor.  Phase 2.6
    only trusts obvious parenthetical text and explicitly excludes PHM, whose
    business meaning belongs to the separate PHM evidence path.
    """

    has_external_brand_signal: bool
    brand_candidates: tuple[str, ...]
    evidence: tuple[str, ...]


def detect_external_brand_marker(name: str | None) -> ExternalBrandMarkerEvidence:
    """Find conservative external-brand-like parenthetical markers in ``name``.

    The source name is never changed.  Non-empty parenthetical segments other
    than PHM are evidence that an exact loose-base match may be unsafe to
    auto-classify as high-confidence PACKED.
    """
    normalized = normalize_item_name(name)
    candidates: list[str] = []
    for match in _PARENTHETICAL.finditer(normalized):
        candidate = _MULTI_SPACE.sub(" ", match.group(1)).strip()
        if not candidate or candidate == "PHM":
            continue
        if candidate not in candidates:
            candidates.append(candidate)
    evidence = tuple(f"external-brand-like parenthetical: {candidate}" for candidate in candidates)
    return ExternalBrandMarkerEvidence(
        has_external_brand_signal=bool(candidates),
        brand_candidates=tuple(candidates),
        evidence=evidence,
    )


@dataclass(frozen=True)
class NameSizeProposal:
    original_name: str
    proposed_name: str
    original_size: str | None
    proposed_size: str | None
    evidence: list[str]


def propose_name_and_size(original_name: object | None, original_size: object | None) -> NameSizeProposal:
    orig_name = "" if original_name is None else str(original_name)
    orig_size = None if original_size is None or str(original_size).strip() == "" else str(original_size).strip()
    proposed_name = normalize_item_name(orig_name)
    evidence: list[str] = []
    if proposed_name != orig_name.strip():
        evidence.append("deterministic name normalization")
    from_name = extract_size_from_name(proposed_name) if proposed_name else None
    from_cell = normalize_size_token(orig_size) if orig_size else None
    proposed_size = from_name or from_cell
    if proposed_size and proposed_size != (orig_size or ""):
        if from_name:
            evidence.append(f"size derived from name: {proposed_size}")
        else:
            evidence.append(f"size cell normalized: {proposed_size}")
    return NameSizeProposal(
        original_name=orig_name,
        proposed_name=proposed_name or orig_name,
        original_size=orig_size,
        proposed_size=proposed_size,
        evidence=evidence,
    )
