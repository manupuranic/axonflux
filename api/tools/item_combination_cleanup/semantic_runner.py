"""Bounded, auditable runner helpers for Phase 4B semantic suggestions.

This module deliberately builds evidence only from the human evaluation workbook.
It never writes to deterministic cleanup proposal fields.
"""
from __future__ import annotations

from typing import Any

RESOLVED_HUMAN_LABELS = {
    "LIKELY_PACKED_VERSION",
    "LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT",
    "UNCERTAIN",
}


def resolved_human_label(row: dict[str, Any]) -> str | None:
    label = str(row.get("Human Label") or "").strip()
    return label if label in RESOLVED_HUMAN_LABELS else None


def _value(row: dict[str, Any], key: str) -> Any:
    value = row.get(key)
    return None if value in (None, "") else value


def build_evidence_payload(row: dict[str, Any]) -> dict[str, Any]:
    """Create the allowed semantic evidence without leaking the human label."""
    return {
        "retail_candidate": {
            "item_id": _value(row, "Retail Item_Id"),
            "item_name": _value(row, "Retail Item Name"),
            "barcode": _value(row, "Retail Barcode"),
            "mrp": _value(row, "Retail MRP"),
            "existing_brand": _value(row, "Retail Existing Brand"),
            "size": _value(row, "Retail Size"),
            "deterministic_packed_confidence": _value(row, "Deterministic PACKED Confidence"),
            "direct_purchase_history_exists": _value(row, "Direct Purchase History Exists"),
            "identity_marker_candidates": _value(row, "Identity Markers"),
        },
        "loose_source": {
            "item_id": _value(row, "Loose Item_Id"),
            "item_name": _value(row, "Loose Item Name"),
            "barcode": _value(row, "Loose Barcode"),
            "latest_supplier": _value(row, "Loose Latest Supplier"),
            "purchase_history_exists": _value(row, "Loose Purchase History Exists"),
        },
        "deterministic_relationship_evidence": {
            "reason": _value(row, "Deterministic Reason"),
            "suggested_review_focus": _value(row, "Suggested Review Focus"),
        },
    }


def build_production_evidence_payload(candidate: Any, loose_source: Any | None) -> dict[str, Any]:
    """Build the same bounded semantic evidence from persisted deterministic rows."""
    evidence = candidate.classification_evidence or {}
    identity = candidate.source_identity or {}
    loose_identity = loose_source.source_identity or {} if loose_source else {}
    return {
        "retail_candidate": {
            "item_id": candidate.item_id_key,
            "item_name": candidate.original_item_name,
            "normalized_item_name": getattr(candidate, "proposed_item_name", None) or candidate.original_item_name,
            "barcode": identity.get("barcode"),
            "mrp": identity.get("mrp"),
            "existing_brand": candidate.original_brand,
            "size": candidate.original_size,
            "deterministic_packed_confidence": candidate.classification_confidence,
            "direct_purchase_history_exists": bool(candidate.supplier_name),
            "identity_marker_candidates": evidence.get("external_brand_candidates", []),
            "phm_marker_present": bool(evidence.get("has_phm_marker")),
        },
        "loose_source": {
            "item_id": loose_source.item_id_key if loose_source else evidence.get("source_loose_item_id"),
            "item_name": loose_source.original_item_name if loose_source else evidence.get("source_loose_item_name"),
            "normalized_item_name": getattr(loose_source, "proposed_item_name", None) if loose_source else evidence.get("source_loose_item_name"),
            "barcode": loose_identity.get("barcode") if loose_source else evidence.get("source_loose_barcode"),
            "mrp": loose_identity.get("mrp") if loose_source else None,
            "latest_supplier": loose_source.supplier_name if loose_source else None,
            "purchase_history_exists": bool(evidence.get("source_loose_purchase_exists")),
        },
        "deterministic_relationship_evidence": {
            "base_name_match": evidence.get("base_name_match"),
            "reason": evidence.get("classification_reason"),
            "identity_marker_evidence": evidence.get("external_brand_evidence", []),
        },
    }
