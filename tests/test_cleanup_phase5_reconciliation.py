import uuid

import pytest

from api.tools.item_combination_cleanup.models import (
    ItemCombinationCleanupFieldDecision,
    ItemCombinationCleanupNameSuggestion,
    ItemCombinationCleanupRow,
    ItemCombinationCleanupRun,
)
from scripts.reconcile_phase5b_stale_naming_suggestions import (
    REPLACEMENT_VERSION,
    STALE_STATUS,
    reconcile_stale_naming_suggestions,
)
from scripts.run_phase5b_controlled_production import (
    prepare_pre_gpt_pipeline,
    replace_checkpoint_record,
    select_current_checkpoint_records,
)
from tests.conftest import TestSessionLocal


def _seed_stale_case(db, *, decided_item: str | None = None):
    run = ItemCombinationCleanupRun(
        id=uuid.uuid4(),
        source_file_name="phase5-test.xlsx",
        original_path="phase5-test.xlsx",
        status="processed",
    )
    db.add(run)
    db.flush()
    rows = [
        ItemCombinationCleanupRow(
            run_id=run.id,
            row_index=index,
            item_id_key=item_id,
            source_identity={"barcode": item_id},
            original_item_name=original,
            proposed_item_name=proposed,
            product_type="RETAIL",
            review_status="REVIEWED",
        )
        for index, item_id, original, proposed in (
            (1, "valid", "CHOCOLT BAR", "CHOCOLT BAR"),
            (2, "stale-a", "HEAD&SHOULDE SHMP", "HEAD&SHOULDE SHAMPOO"),
            (3, "stale-b", "LIQUD CHESE", "LIQUID CHEESE"),
        )
    ]
    db.add_all(rows)
    db.add_all(
        [
            ItemCombinationCleanupNameSuggestion(
                run_id=run.id,
                item_id_key=item_id,
                field_name="name",
                suggestion_source="NAMING_STANDARD",
                suggestion_version="phase5b-v1",
                category="HUMAN_VERIFIED_CORRECTION",
                base_value=base,
                suggested_value=suggested,
                transformations=["historical"],
                evidence={},
            )
            for item_id, base, suggested in (
                ("valid", "CHOCOLT BAR", "CHOCOLATE BAR"),
                ("stale-a", "HEAD&SHOULDE SHAMPOO", "HEAD&SHOULDERS SHAMPOO"),
                ("stale-b", "LIQUID CHEESE", "LIQUID CHEESE"),
            )
        ]
    )
    if decided_item:
        db.add(
            ItemCombinationCleanupFieldDecision(
                run_id=run.id,
                item_id_key=decided_item,
                field_name="name",
                original_value="HEAD&SHOULDE SHMP",
                deterministic_proposed_value="HEAD&SHOULDE SHAMPOO",
                decision="REJECTED",
            )
        )
    db.commit()
    return run.id


def test_reconciliation_preserves_history_and_is_idempotent(seed_test_db):
    """Catches rescanning superseded v1 rows or creating a second actionable replacement."""
    with TestSessionLocal() as db:
        run_id = _seed_stale_case(db)

        first = reconcile_stale_naming_suggestions(db, run_id)
        db.commit()
        second = reconcile_stale_naming_suggestions(db, run_id)
        db.commit()

        suggestions = db.query(ItemCombinationCleanupNameSuggestion).filter_by(run_id=run_id).all()
        historical = [s for s in suggestions if s.suggestion_version == "phase5b-v1"]
        replacements = [s for s in suggestions if s.suggestion_version == REPLACEMENT_VERSION]
        actionable_keys = [
            (s.item_id_key, s.field_name, s.suggestion_source)
            for s in suggestions
            if s.status != STALE_STATUS
        ]

        assert first == {"valid_current": 1, "superseded": 2, "replacements_created": 2}
        assert second == {"valid_current": 1, "superseded": 0, "replacements_created": 0}
        assert len(historical) == 3
        assert {s.item_id_key for s in historical if s.status == STALE_STATUS} == {"stale-a", "stale-b"}
        assert {s.item_id_key for s in replacements} == {"stale-a", "stale-b"}
        assert len(actionable_keys) == len(set(actionable_keys))


def test_reconciliation_preflights_all_human_decisions_before_mutating(seed_test_db):
    """Catches partial superseding when a later conflicting row has a human decision."""
    with TestSessionLocal() as db:
        run_id = _seed_stale_case(db, decided_item="stale-a")

        with pytest.raises(RuntimeError, match="human-decided conflict stale-a"):
            reconcile_stale_naming_suggestions(db, run_id)

        db.rollback()
        suggestions = db.query(ItemCombinationCleanupNameSuggestion).filter_by(run_id=run_id).all()
        assert len(suggestions) == 3
        assert all(s.status == "PENDING" for s in suggestions)
        assert not any(s.suggestion_version == REPLACEMENT_VERSION for s in suggestions)


def test_deterministic_generation_is_idempotent(seed_test_db):
    """Catches a generator that only checks rows loaded before its previous flush."""
    from api.tools.item_combination_cleanup.service import generate_phase5_name_suggestions

    with TestSessionLocal() as db:
        run = ItemCombinationCleanupRun(
            id=uuid.uuid4(),
            source_file_name="phase5-idempotency.xlsx",
            original_path="phase5-idempotency.xlsx",
            status="processed",
        )
        db.add(run)
        db.add(
            ItemCombinationCleanupRow(
                run_id=run.id,
                row_index=1,
                item_id_key="one-rule",
                source_identity={"barcode": "one-rule"},
                original_item_name="CHOCOLT BAR",
                product_type="RETAIL",
                review_status="REVIEWED",
            )
        )
        db.commit()

        assert generate_phase5_name_suggestions(db, run) == {"created": 1, "existing": 0}
        assert generate_phase5_name_suggestions(db, run) == {"created": 0, "existing": 1}
        db.commit()
        assert db.query(ItemCombinationCleanupNameSuggestion).filter_by(run_id=run.id).count() == 1


def test_pre_gpt_pipeline_qualifies_by_item_context_and_removes_deterministic_rows():
    """Catches barcode-keyed context loss and deterministic rows leaking to GPT work."""
    names = [(f"common-{i}", f"FRESH BANANA LIQUID BUNCH {i}") for i in range(12)]
    names += [
        ("semantic", "FRESH BANAN BUNCH"),
        ("deterministic", "DARK LIQUD SOAP"),
    ]
    purchase_names_by_item = {
        "semantic": ["FRESH BANANA BUNCH"],
        "deterministic": ["DARK LIQUID SOAP"],
    }

    result = prepare_pre_gpt_pipeline(names, purchase_names_by_item)

    assert result["counts"] == {
        "rows": 14,
        "deterministic_resolved_items": 1,
        "detector_candidates": 2,
        "context_qualified_candidates": 2,
        "deterministic_candidates_removed": 1,
        "final_semantic_candidates": 1,
        "semantic_work_items": 1,
        "semantic_conflict_items": 0,
    }
    assert [candidate["item_id"] for candidate in result["work"]] == ["semantic"]
    assert set(result["stage_runtimes_seconds"]) == {
        "deterministic_rules",
        "optimized_detector",
        "context_qualification",
        "remove_deterministic_resolved",
        "group_final_candidates",
    }


def test_checkpoint_history_can_be_a_superset_of_the_corrected_worklist():
    """Catches a resume loop that requires historical and current work lengths to match."""
    work = [{"item_id": "keep-a"}, {"item_id": "new"}, {"item_id": "keep-b"}]
    historical_records = [
        {"item_id": "removed-by-new-rules"},
        {"item_id": "keep-b"},
        {"item_id": "keep-a"},
    ]

    selected, missing = select_current_checkpoint_records(work, historical_records)

    assert [record["item_id"] for record in selected] == ["keep-a", "keep-b"]
    assert [candidate["item_id"] for candidate in missing] == ["new"]


def test_connection_errors_are_retryable_without_losing_the_failed_attempt():
    """Catches transport failures becoming permanently completed checkpoint work."""
    work = [{"item_id": "retry"}, {"item_id": "complete"}]
    records = [
        {"item_id": "retry", "error": "Connection error.", "latency_seconds": 1.2},
        {"item_id": "complete", "gpt": {"result": "NO_CHANGE"}},
    ]

    selected, missing = select_current_checkpoint_records(
        work, records, retry_connection_errors=True
    )
    replace_checkpoint_record(
        records,
        {"item_id": "retry", "gpt": {"result": "NO_CHANGE"}, "latency_seconds": 2.3},
    )

    assert [record["item_id"] for record in selected] == ["complete"]
    assert [candidate["item_id"] for candidate in missing] == ["retry"]
    assert len(records) == 2
    assert records[0]["gpt"]["result"] == "NO_CHANGE"
    assert records[0]["attempt_history"] == [
        {"error": "Connection error.", "latency_seconds": 1.2}
    ]
