from pathlib import Path

from api.tools.item_combination_cleanup.name_semantic_eval import (
    GROUND_TRUTH_SHA256,
    NameChange,
    NameSemanticOutput,
    build_production_payload,
    human_minimal_replacement,
    load_ground_truth,
    minimal_edit_violations,
    name_semantic_system_prompt,
)


FIXTURE = Path(__file__).parent / "fixtures" / "phase5b_name_context_ground_truth.xlsx"


def test_ground_truth_fixture_is_complete_and_hash_pinned():
    rows = load_ground_truth(FIXTURE)

    assert len(rows) == 61
    assert sum(row["human_label"] != "UNCERTAIN" for row in rows) == 60
    assert {row["human_label"] for row in rows} == {"CORRECTION", "NO_CHANGE", "UNCERTAIN"}
    assert GROUND_TRUTH_SHA256 == "15da731ce5dcec5590f091ba0425ab1a9aa1e0253a23459fdb72e71fbf8fe6b1"
    shoulders = [row for row in rows if row["suspicious_token"] == "SHOULDE"]
    assert len(shoulders) == 8
    assert all(row["human_corrected_name"] == row["effective_item_name"].replace("SHOULDE", "SHOULDERS") for row in shoulders)


def test_production_payload_never_exposes_human_label_columns():
    row = load_ground_truth(FIXTURE)[0]
    payload = build_production_payload(
        row,
        purchase_names=["GLASS ICE CREAM CUP SET 6PC DRY9087"],
        catalog_siblings=["GLASS ICE CREAM CUP SET 6PC DRY9087"],
    )

    serialized = str(payload).lower()
    assert "human" not in serialized
    assert "correction" not in serialized
    assert payload["candidate"]["item_id"] == "13279"
    assert payload["context"]["purchase_item_names"] == ["GLASS ICE CREAM CUP SET 6PC DRY9087"]


def test_full_name_ground_truth_derives_minimal_replacement_and_contract_is_exact():
    row = next(row for row in load_ground_truth(FIXTURE) if row["item_id"] == "10380")
    result = NameSemanticOutput(
        result="CORRECTION", confidence="HIGH", reason="Repeated truncation.",
        suggested_name="HEAD&SHOULDERS SMOOTH&SILKY 2IN1 180ML",
        changes=[NameChange(original_text="SHOULDE", replacement_text="SHOULDERS", change_type="TRUNCATION")],
    )

    assert human_minimal_replacement(row) == "SHOULDERS"
    assert minimal_edit_violations(result, original_item_name=row["effective_item_name"], suspicious_token=row["suspicious_token"]) == []
    result.suggested_name = "HEAD&SHOULDERS SMOOTH & SILKY 2IN1 180ML"
    assert minimal_edit_violations(result, original_item_name=row["effective_item_name"], suspicious_token=row["suspicious_token"])


def test_prompt_prioritizes_same_item_evidence_without_token_specific_rules():
    prompt = name_semantic_system_prompt().lower()

    assert "same-item historical purchase names" in prompt
    assert "outweighs unrelated catalog siblings" in prompt
    assert "false correction" in prompt
    assert "kanji" not in prompt
