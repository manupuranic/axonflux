import pytest
from pydantic import ValidationError

from api.tools.item_combination_cleanup.semantic import SemanticAssessmentOutput
from api.tools.item_combination_cleanup.semantic import validate_tool_call
from api.tools.item_combination_cleanup.semantic import semantic_system_prompt
from api.tools.item_combination_cleanup.service import attach_semantic_assessment
from api.tools.item_combination_cleanup.service import resolved_reviewed_value
from api.tools.item_combination_cleanup.semantic_runner import (
    build_evidence_payload,
    build_production_evidence_payload,
    resolved_human_label,
)


def test_valid_semantic_output_is_accepted():
    result = SemanticAssessmentOutput.model_validate({
        "relationship": "LIKELY_PACKED_VERSION", "confidence": "HIGH", "reason": "Same commodity.",
        "signals_for_packed": ["exact relationship"], "signals_against_packed": [],
        "identity_interpretations": [{"text": "NATURAL", "possible_role": "descriptor"}],
    })
    assert result.relationship == "LIKELY_PACKED_VERSION"


@pytest.mark.parametrize("payload", [
    {"relationship": "OTHER", "confidence": "HIGH", "reason": "x", "signals_for_packed": [], "signals_against_packed": [], "identity_interpretations": []},
    {"relationship": "UNCERTAIN", "confidence": "HIGH", "signals_for_packed": [], "signals_against_packed": [], "identity_interpretations": []},
    {"relationship": "UNCERTAIN", "confidence": "HIGH", "reason": "x", "signals_for_packed": [], "signals_against_packed": [], "identity_interpretations": [], "extra": "forbidden"},
])
def test_invalid_semantic_output_is_rejected(payload):
    with pytest.raises(ValidationError):
        SemanticAssessmentOutput.model_validate(payload)


def test_tool_call_requires_exactly_one_named_assessment():
    result = validate_tool_call("submit_semantic_assessment", {
        "relationship": "UNCERTAIN", "confidence": "LOW", "reason": "Insufficient evidence.",
        "signals_for_packed": [], "signals_against_packed": [], "identity_interpretations": [],
    })
    assert result.relationship == "UNCERTAIN"

    with pytest.raises(ValueError):
        validate_tool_call("wrong_tool", {})


def test_only_resolved_human_labels_are_scored_and_payload_uses_workbook_evidence():
    row = {
        "Retail Item_Id": "16863",
        "Retail Item Name": "CASTROL OIL (NATURAL)500ML",
        "Retail Barcode": "CO50",
        "Retail MRP": 280,
        "Retail Existing Brand": "PKG",
        "Retail Size": None,
        "Deterministic PACKED Confidence": "MEDIUM",
        "Direct Purchase History Exists": "No",
        "Identity Markers": "NATURAL",
        "Loose Item_Id": "8726",
        "Loose Item Name": "CASTROL OIL (NATURAL) LOOSE",
        "Loose Barcode": "CSTL",
        "Loose Latest Supplier": "ECOVALE INDIA PRIVATE LIMITED",
        "Loose Purchase History Exists": "Yes",
        "Deterministic Reason": "exact LOOSE base match",
        "Human Label": "LIKELY_PACKED_VERSION",
    }

    assert resolved_human_label(row) == "LIKELY_PACKED_VERSION"
    assert resolved_human_label({"Human Label": "NEEDS_BUSINESS_LABEL"}) is None
    payload = build_evidence_payload(row)
    assert payload["retail_candidate"]["item_id"] == "16863"
    assert payload["loose_source"]["latest_supplier"] == "ECOVALE INDIA PRIVATE LIMITED"
    assert "human_label" not in payload


def test_refined_prompt_makes_false_packed_costly_and_uses_examples_as_prompt_policy_only():
    prompt = semantic_system_prompt("phase4b-v2-marker-safety")
    assert "highest-cost error" in prompt
    assert "prefer UNCERTAIN" in prompt
    assert "FOUR SEASONS" in prompt
    assert "BLACK" in prompt


def test_production_evidence_is_bounded_to_candidate_and_matched_loose_source():
    from types import SimpleNamespace
    candidate = SimpleNamespace(
        item_id_key="100", original_item_name="AMLA POWDER (MARKER) 100GM",
        original_brand=None, original_size="100GM", source_identity={"barcode": "123", "mrp": 80},
        classification_confidence="MEDIUM", supplier_name=None,
        classification_evidence={"has_phm_marker": False, "external_brand_candidates": ["MARKER"], "classification_reason": "exact LOOSE base match"},
    )
    loose = SimpleNamespace(
        item_id_key="200", original_item_name="AMLA POWDER LOOSE", source_identity={"barcode": "L-1", "mrp": None},
        supplier_name="A SUPPLIER",
    )
    payload = build_production_evidence_payload(candidate, loose)
    assert payload["retail_candidate"]["identity_marker_candidates"] == ["MARKER"]
    assert payload["loose_source"]["item_id"] == "200"
    assert payload["loose_source"]["latest_supplier"] == "A SUPPLIER"


def test_semantic_response_is_advisory_and_flags_only_external_packed_disagreement():
    row = {"product_type": "PACKED", "proposed_brand": "PKG", "approval_status": "PENDING"}
    assessment = {"relationship": "LIKELY_EXTERNAL_OR_DIFFERENT_PRODUCT", "confidence": "HIGH", "reason": "Identity marker."}
    output = attach_semantic_assessment(row, assessment)
    assert output["semantic_disagrees_with_packed_proposal"] is True
    assert output["proposed_brand"] == "PKG"
    assert output["approval_status"] == "PENDING"


def test_field_decision_export_precedence_requires_explicit_acceptance():
    assert resolved_reviewed_value("Original", "Proposal", "ACCEPTED", None) == "Proposal"
    assert resolved_reviewed_value("Original", "Proposal", "ACCEPTED", "Edited") == "Edited"
    assert resolved_reviewed_value("Original", "Proposal", "REJECTED", None) == "Original"
    assert resolved_reviewed_value("Original", "Proposal", "EDITED", "Edited") == "Original"
