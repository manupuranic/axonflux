"""Conservative product-type classification for cleanup Phase 2."""

from __future__ import annotations

from dataclasses import dataclass, field
from api.tools.item_combination_cleanup.normalize import (
    base_name,
    detect_external_brand_marker,
    has_loose_token,
    has_phm_marker,
    has_retail_size,
)
from api.tools.item_combination_cleanup.purchases import PurchaseHit


@dataclass(frozen=True)
class LooseAnchor:
    item_id: str
    barcode: str
    item_name: str
    has_purchase: bool


@dataclass
class Classification:
    product_type: str
    confidence: str | None
    proposed_brand: str | None
    keep_original_brand: bool
    review_status: str
    evidence: dict
    rules: list[str] = field(default_factory=list)


def classify(
    *,
    normalized_name: str,
    original_brand: str | None,
    purchase: PurchaseHit | None,
    barcode_mrp_item_id_count: int,
    loose_anchors: dict[str, LooseAnchor],
    barcode_identity_safe: bool = False,
) -> Classification:
    external_brand = detect_external_brand_marker(normalized_name)
    evidence = {
        "has_phm_marker": has_phm_marker(normalized_name),
        "loose_in_name": has_loose_token(normalized_name),
        "has_retail_size": has_retail_size(normalized_name),
        "match_method": purchase.match_method if purchase else None,
        "supplier_count": purchase.supplier_count if purchase else 0,
        "barcode_mrp_item_id_count": barcode_mrp_item_id_count,
        "barcode_identity_safe": barcode_identity_safe,
        "matched_loose_item_id": None,
        "matched_loose_barcode": None,
        "source_loose_item_id": None,
        "source_loose_barcode": None,
        "source_loose_item_name": None,
        "source_loose_purchase_exists": None,
        "base_name_match": None,
        "has_external_brand_signal": external_brand.has_external_brand_signal,
        "external_brand_candidates": list(external_brand.brand_candidates),
        "external_brand_evidence": list(external_brand.evidence),
        "external_brand_signal_source": "current_item" if external_brand.has_external_brand_signal else None,
        "classification_reason": None,
    }
    rules: list[str] = []

    if has_loose_token(normalized_name):
        rules.append("name contains LOOSE")
        if evidence["has_phm_marker"]:
            rules.append("LOOSE wins over PHM marker")
        if purchase is None:
            return Classification(
                product_type="LOOSE",
                confidence="LOW",
                proposed_brand=original_brand,
                keep_original_brand=True,
                review_status="NEEDS_REVIEW",
                evidence=evidence,
                rules=rules + ["no purchase evidence"],
            )
        confidence = "HIGH" if purchase.match_method == "barcode_mrp" else "MEDIUM"
        if barcode_mrp_item_id_count > 1:
            confidence = "LOW"
        elif (
            purchase.match_method == "barcode"
            and purchase.supplier_count == 1
            and barcode_identity_safe
        ):
            confidence = "HIGH"
            rules.append("one real supplier + barcode identity safe")
        status = "AUTO_APPROVED" if confidence == "HIGH" else "NEEDS_REVIEW"
        return Classification(
            product_type="LOOSE",
            confidence=confidence,
            proposed_brand=purchase.supplier_name,
            keep_original_brand=False,
            review_status=status,
            evidence=evidence,
            rules=rules + [f"latest supplier via {purchase.match_method}"],
        )

    if purchase is None and has_retail_size(normalized_name):
        base = base_name(normalized_name)
        anchor = loose_anchors.get(base) if base else None
        if anchor is not None and anchor.has_purchase:
            source_external_brand = detect_external_brand_marker(anchor.item_name)
            external_candidates = list(
                dict.fromkeys(
                    (*external_brand.brand_candidates, *source_external_brand.brand_candidates)
                )
            )
            external_evidence = list(
                dict.fromkeys((*external_brand.evidence, *source_external_brand.evidence))
            )
            has_external_brand_signal = bool(external_candidates)
            if external_brand.has_external_brand_signal and source_external_brand.has_external_brand_signal:
                signal_source = "current_item_and_source_loose"
            elif source_external_brand.has_external_brand_signal:
                signal_source = "source_loose"
            elif external_brand.has_external_brand_signal:
                signal_source = "current_item"
            else:
                signal_source = None
            evidence["matched_loose_item_id"] = anchor.item_id
            evidence["matched_loose_barcode"] = anchor.barcode
            evidence["source_loose_item_id"] = anchor.item_id
            evidence["source_loose_barcode"] = anchor.barcode
            evidence["source_loose_item_name"] = anchor.item_name
            evidence["source_loose_purchase_exists"] = anchor.has_purchase
            evidence["base_name_match"] = "exact"
            evidence["has_external_brand_signal"] = has_external_brand_signal
            evidence["external_brand_candidates"] = external_candidates
            evidence["external_brand_evidence"] = external_evidence
            evidence["external_brand_signal_source"] = signal_source
            rules.append("no purchase + retail size + exact base match to purchased LOOSE")
            confidence = "MEDIUM" if has_external_brand_signal else "HIGH"
            if has_external_brand_signal:
                reason = "exact LOOSE base match, but external-brand signal requires review"
            else:
                reason = "exact LOOSE base match with no external-brand signal"
            evidence["classification_reason"] = reason
            return Classification(
                product_type="PACKED",
                confidence=confidence,
                proposed_brand="PKG",
                keep_original_brand=False,
                review_status="NEEDS_REVIEW",
                evidence=evidence,
                rules=rules + [reason],
            )

    if purchase is not None:
        rules.append("purchase evidence exists")
        confidence = "HIGH" if purchase.match_method == "barcode_mrp" else "MEDIUM"
        if barcode_mrp_item_id_count > 1:
            confidence = "LOW"
        elif (
            purchase.match_method == "barcode"
            and purchase.supplier_count == 1
            and barcode_identity_safe
        ):
            confidence = "HIGH"
            rules.append("one real supplier + barcode identity safe")
        status = "AUTO_APPROVED" if confidence == "HIGH" else "NEEDS_REVIEW"
        return Classification(
            product_type="PURCHASED",
            confidence=confidence,
            proposed_brand=purchase.supplier_name,
            keep_original_brand=False,
            review_status=status,
            evidence=evidence,
            rules=rules + [f"latest supplier via {purchase.match_method}"],
        )

    rules.append("insufficient evidence")
    return Classification(
        product_type="UNKNOWN",
        confidence=None,
        proposed_brand=original_brand,
        keep_original_brand=True,
        review_status="UNCHANGED",
        evidence=evidence,
        rules=rules,
    )


def build_loose_anchors(
    rows: list[tuple[str, str, str, bool]],
) -> dict[str, LooseAnchor]:
    """rows: (item_id, barcode, normalized_name, has_purchase)."""
    anchors: dict[str, LooseAnchor] = {}
    for item_id, barcode, name, has_purchase in rows:
        if not has_loose_token(name):
            continue
        base = base_name(name)
        if not base:
            continue
        existing = anchors.get(base)
        if existing is None or (has_purchase and not existing.has_purchase):
            anchors[base] = LooseAnchor(
                item_id=item_id,
                barcode=barcode,
                item_name=name,
                has_purchase=has_purchase,
            )
    return anchors
