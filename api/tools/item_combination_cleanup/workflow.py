"""User-facing orchestration for recurring Item Master cleanup runs."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from api.tools.item_combination_cleanup.models import (
    ItemCombinationCleanupFieldDecision,
    ItemCombinationCleanupNameSuggestion,
    ItemCombinationCleanupRow,
    ItemCombinationCleanupRun,
    ItemCombinationCleanupSemanticAssessment,
)
from api.tools.item_combination_cleanup.name_semantic import context_qualified, detect, tokens
from api.tools.item_combination_cleanup.name_semantic_eval import (
    build_production_payload,
    evaluate_name,
    minimal_edit_violations,
)
from api.tools.item_combination_cleanup.semantic import evaluate as evaluate_packed
from api.tools.item_combination_cleanup.semantic_runner import build_production_evidence_payload
from api.tools.item_combination_cleanup.service import (
    CleanupServiceError,
    _mechanical_only_auto_approval,
    effective_name_for_phase5,
    generate_phase5_name_suggestions,
    process_run,
    proposed_changes,
    list_actionable_name_review,
)


def _identity_matches(current: ItemCombinationCleanupRow, historical: ItemCombinationCleanupRow) -> bool:
    current_barcode = str((current.source_identity or {}).get("barcode") or "").strip()
    historical_barcode = str((historical.source_identity or {}).get("barcode") or "").strip()
    return current.item_id_key == historical.item_id_key and current_barcode == historical_barcode


def _field_values(row: ItemCombinationCleanupRow, field: str) -> tuple[str | None, str | None]:
    return {
        "name": (row.original_item_name, row.proposed_item_name),
        "brand": (row.original_brand, row.proposed_brand),
        "size": (row.original_size, row.proposed_size),
    }[field]


def _historical_rows(db: Session, run: ItemCombinationCleanupRun, item_ids: set[str]):
    records = (
        db.query(ItemCombinationCleanupRow, ItemCombinationCleanupRun)
        .join(ItemCombinationCleanupRun, ItemCombinationCleanupRun.id == ItemCombinationCleanupRow.run_id)
        .filter(
            ItemCombinationCleanupRow.item_id_key.in_(item_ids),
            ItemCombinationCleanupRow.run_id != run.id,
        )
        .order_by(ItemCombinationCleanupRun.created_at.desc(), ItemCombinationCleanupRow.row_index)
        .all()
    )
    return {(row.run_id, row.item_id_key): row for row, _ in records}


def _reuse_historical_knowledge(db: Session, run: ItemCombinationCleanupRun) -> dict[str, int]:
    current_rows = {
        row.item_id_key: row
        for row in db.query(ItemCombinationCleanupRow).filter_by(run_id=run.id)
    }
    history_rows = _historical_rows(db, run, set(current_rows))
    now = datetime.now(timezone.utc)
    counts = defaultdict(int)
    matched_historical_items = {
        item_id
        for (_historical_run_id, item_id), historical in history_rows.items()
        if _identity_matches(current_rows[item_id], historical)
    }
    counts["historical_items_matched"] = len(matched_historical_items)
    counts["new_items"] = len(current_rows) - len(matched_historical_items)

    latest_decisions: dict[tuple[str, str], ItemCombinationCleanupFieldDecision] = {}
    decisions = (
        db.query(ItemCombinationCleanupFieldDecision)
        .filter(
            ItemCombinationCleanupFieldDecision.run_id != run.id,
            ItemCombinationCleanupFieldDecision.item_id_key.in_(set(current_rows)),
            ItemCombinationCleanupFieldDecision.decision.in_(("ACCEPTED", "REJECTED")),
        )
        .order_by(ItemCombinationCleanupFieldDecision.reviewed_at.desc().nullslast())
        .all()
    )
    for decision in decisions:
        latest_decisions.setdefault((decision.item_id_key, decision.field_name), decision)

    for (item_id, field), decision in latest_decisions.items():
        current = current_rows[item_id]
        historical = history_rows.get((decision.run_id, item_id))
        if historical is None or not _identity_matches(current, historical):
            counts["historical_decisions_invalidated"] += 1
            continue
        original, proposed = _field_values(current, field)
        if original != decision.original_value:
            counts["historical_decisions_invalidated"] += 1
            continue
        if decision.review_source.startswith("NAME_SUGGESTION:"):
            continue
        if proposed != decision.deterministic_proposed_value:
            counts["historical_decisions_invalidated"] += 1
            continue
        db.add(
            ItemCombinationCleanupFieldDecision(
                run_id=run.id,
                item_id_key=item_id,
                field_name=field,
                original_value=original,
                deterministic_proposed_value=proposed,
                edited_value=decision.edited_value,
                decision=decision.decision,
                reviewed_by=decision.reviewed_by,
                review_source=f"HISTORICAL_REUSE:{decision.run_id}",
                reviewed_at=now,
            )
        )
        counts["historical_field_decisions_reused"] += 1
    db.flush()

    current_suggestions = {
        (suggestion.item_id_key, suggestion.suggestion_source, suggestion.base_value, suggestion.suggested_value): suggestion
        for suggestion in db.query(ItemCombinationCleanupNameSuggestion).filter_by(run_id=run.id)
    }
    seen_suggestion_keys = set()
    historical_suggestions = (
        db.query(ItemCombinationCleanupNameSuggestion)
        .filter(
            ItemCombinationCleanupNameSuggestion.run_id != run.id,
            ItemCombinationCleanupNameSuggestion.item_id_key.in_(set(current_rows)),
            ItemCombinationCleanupNameSuggestion.status.in_(("ACCEPTED", "REJECTED")),
        )
        .order_by(
            ItemCombinationCleanupNameSuggestion.reviewed_at.desc().nullslast(),
            ItemCombinationCleanupNameSuggestion.created_at.desc().nullslast(),
        )
        .all()
    )
    for historical_suggestion in historical_suggestions:
        logical_key = (historical_suggestion.item_id_key, historical_suggestion.suggestion_source)
        if logical_key in seen_suggestion_keys:
            continue
        seen_suggestion_keys.add(logical_key)
        current = current_rows[historical_suggestion.item_id_key]
        historical = history_rows.get((historical_suggestion.run_id, historical_suggestion.item_id_key))
        current_base = effective_name_for_phase5(db, current) or ""
        if historical is None or not _identity_matches(current, historical) or current_base != historical_suggestion.base_value:
            counts["historical_decisions_invalidated"] += 1
            continue
        key = (
            historical_suggestion.item_id_key,
            historical_suggestion.suggestion_source,
            historical_suggestion.base_value,
            historical_suggestion.suggested_value,
        )
        current_suggestion = current_suggestions.get(key)
        if current_suggestion is None:
            current_suggestion = ItemCombinationCleanupNameSuggestion(
                run_id=run.id,
                item_id_key=historical_suggestion.item_id_key,
                field_name="name",
                suggestion_source=historical_suggestion.suggestion_source,
                suggestion_version=historical_suggestion.suggestion_version,
                category=historical_suggestion.category,
                base_value=historical_suggestion.base_value,
                suggested_value=historical_suggestion.suggested_value,
                transformations=historical_suggestion.transformations,
                evidence={
                    **(historical_suggestion.evidence or {}),
                    "historical_reuse": {"run_id": str(historical_suggestion.run_id), "status": historical_suggestion.status},
                },
            )
            db.add(current_suggestion)
            current_suggestions[key] = current_suggestion
        current_suggestion.status = historical_suggestion.status
        current_suggestion.reviewed_by = historical_suggestion.reviewed_by
        current_suggestion.reviewed_at = now
        if historical_suggestion.status == "REJECTED":
            counts["historical_name_rejections_reused"] += 1
            continue

        previous_decision = latest_decisions.get((historical_suggestion.item_id_key, "name"))
        if (
            previous_decision is None
            or previous_decision.run_id != historical_suggestion.run_id
            or previous_decision.decision != "ACCEPTED"
            or previous_decision.deterministic_proposed_value != historical_suggestion.suggested_value
        ):
            current_suggestion.status = "PENDING"
            counts["historical_decisions_invalidated"] += 1
            continue
        if db.query(ItemCombinationCleanupFieldDecision).filter_by(run_id=run.id, item_id_key=current.item_id_key, field_name="name").first() is None:
            db.add(
                ItemCombinationCleanupFieldDecision(
                    run_id=run.id,
                    item_id_key=current.item_id_key,
                    field_name="name",
                    original_value=current.original_item_name,
                    deterministic_proposed_value=current_suggestion.suggested_value,
                    edited_value=previous_decision.edited_value,
                    decision="ACCEPTED",
                    reviewed_by=previous_decision.reviewed_by,
                    review_source=f"HISTORICAL_REUSE:{previous_decision.run_id}",
                    reviewed_at=now,
                )
            )
        counts["historical_name_acceptances_reused"] += 1
    db.flush()

    for row in current_rows.values():
        changes = proposed_changes(row)
        if not changes:
            continue
        row_decisions = {
            decision.field_name: decision.decision
            for decision in db.query(ItemCombinationCleanupFieldDecision).filter_by(run_id=run.id, item_id_key=row.item_id_key)
        }
        if all(row_decisions.get(field) in {"ACCEPTED", "REJECTED"} for field in changes):
            row.approval_status = "APPROVED" if any(row_decisions[field] == "ACCEPTED" for field in changes) else "REJECTED"
            row.reviewed_at = now
    return dict(counts)


def _catalog_siblings(name: str, token: str, replacement: str, catalog: list[str]) -> list[str]:
    current = set(tokens(name))
    current.discard(token.upper())
    siblings = []
    for value in catalog:
        value_tokens = set(tokens(value))
        if replacement.upper() in value_tokens and current & value_tokens:
            siblings.append(value)
        if len(siblings) == 5:
            break
    return siblings


def _run_name_semantic(db: Session, conn: Connection, run: ItemCombinationCleanupRun) -> dict[str, int]:
    rows = db.query(ItemCombinationCleanupRow).filter_by(run_id=run.id).order_by(ItemCombinationCleanupRow.row_index).all()
    names = [(row.item_id_key, effective_name_for_phase5(db, row) or "") for row in rows]
    barcode_by_item = {
        row.item_id_key: str((row.source_identity or {}).get("barcode") or "")
        for row in rows
    }
    purchase_by_barcode = defaultdict(list)
    barcodes = [barcode for barcode in barcode_by_item.values() if barcode]
    if barcodes:
        for barcode, name in conn.execute(
            text("SELECT barcode,item_name_raw FROM raw.raw_purchase_itemwise WHERE barcode = ANY(:barcodes) AND item_name_raw IS NOT NULL"),
            {"barcodes": barcodes},
        ):
            purchase_by_barcode[str(barcode)].append(str(name))
    purchase_names = {
        item_id: purchase_by_barcode[barcode]
        for item_id, barcode in barcode_by_item.items()
    }
    detected = detect(names)
    qualified = context_qualified(detected, purchase_names, [name for _, name in names])
    deterministic_items = {
        suggestion.item_id_key
        for suggestion in db.query(ItemCombinationCleanupNameSuggestion).filter_by(
            run_id=run.id, suggestion_source="NAMING_STANDARD"
        )
    }
    reused_semantic_items = {
        suggestion.item_id_key
        for suggestion in db.query(ItemCombinationCleanupNameSuggestion).filter(
            ItemCombinationCleanupNameSuggestion.run_id == run.id,
            ItemCombinationCleanupNameSuggestion.suggestion_source == "SEMANTIC_V2",
            ItemCombinationCleanupNameSuggestion.status.in_(("ACCEPTED", "REJECTED")),
        )
    }
    grouped = defaultdict(list)
    for candidate in qualified:
        if candidate["item_id"] not in deterministic_items and candidate["item_id"] not in reused_semantic_items:
            grouped[candidate["item_id"]].append(candidate)
    work = [candidates[0] for candidates in grouped.values() if len(candidates) == 1]
    catalog = [name for _, name in names]
    created = calls = failures = 0
    for candidate in work:
        payload = build_production_payload(
            {
                "item_id": candidate["item_id"],
                "effective_item_name": candidate["name"],
                "suspicious_token": candidate["token"],
                "lexical_neighbor": candidate["evidence"],
                "detector_reason": candidate["reason"],
                "corroborating_evidence": ", ".join(candidate["context_evidence"]),
            },
            purchase_names=purchase_names[candidate["item_id"]],
            catalog_siblings=_catalog_siblings(
                candidate["name"], candidate["token"], candidate["evidence"], catalog
            ),
        )
        calls += 1
        try:
            result, _completion = evaluate_name(payload, model="gpt-4o")
            violations = minimal_edit_violations(
                result,
                original_item_name=candidate["name"],
                suspicious_token=candidate["token"],
            )
            if result.result != "CORRECTION" or violations:
                continue
            db.add(
                ItemCombinationCleanupNameSuggestion(
                    run_id=run.id,
                    item_id_key=candidate["item_id"],
                    field_name="name",
                    suggestion_source="SEMANTIC_V2",
                    suggestion_version="phase5b-v2-advisory",
                    category="SEMANTIC_ADVISORY",
                    base_value=candidate["name"],
                    suggested_value=result.suggested_name,
                    transformations=[change.model_dump() for change in result.changes],
                    evidence={
                        "payload": payload,
                        "confidence": result.confidence,
                        "reason": result.reason,
                    },
                )
            )
            created += 1
        except Exception:
            failures += 1
    db.flush()
    return {
        "semantic_candidates": len(work),
        "semantic_conflicts": sum(len(candidates) > 1 for candidates in grouped.values()),
        "semantic_calls": calls,
        "semantic_suggestions_created": created,
        "semantic_failures": failures,
    }


def _run_packed_semantic(db: Session, run: ItemCombinationCleanupRun) -> dict[str, int]:
    candidates = db.query(ItemCombinationCleanupRow).filter_by(
        run_id=run.id, product_type="PACKED"
    ).order_by(ItemCombinationCleanupRow.row_index).all()
    source_ids = {
        str((candidate.classification_evidence or {}).get("source_loose_item_id"))
        for candidate in candidates
        if (candidate.classification_evidence or {}).get("source_loose_item_id") is not None
    }
    loose_by_id = {
        row.item_id_key: row
        for row in db.query(ItemCombinationCleanupRow).filter(
            ItemCombinationCleanupRow.run_id == run.id,
            ItemCombinationCleanupRow.item_id_key.in_(source_ids),
        )
    }
    created = calls = failures = 0
    for candidate in candidates:
        source_id = str((candidate.classification_evidence or {}).get("source_loose_item_id") or "")
        calls += 1
        try:
            result, completion = evaluate_packed(
                build_production_evidence_payload(candidate, loose_by_id.get(source_id)),
                provider="openai",
                model="gpt-4o",
                prompt_version="phase4b-v2-marker-safety",
            )
            db.add(
                ItemCombinationCleanupSemanticAssessment(
                    run_id=run.id,
                    item_id_key=candidate.item_id_key,
                    relationship=result.relationship,
                    confidence=result.confidence,
                    reason=result.reason,
                    signals_for_packed=result.signals_for_packed,
                    signals_against_packed=result.signals_against_packed,
                    identity_interpretations=[entry.model_dump() for entry in result.identity_interpretations],
                    provider="openai",
                    model="gpt-4o",
                    prompt_version="phase4b-v2-marker-safety",
                    raw_response={
                        "prompt_tokens": completion.prompt_tokens,
                        "completion_tokens": completion.completion_tokens,
                    },
                    validation_status="VALID",
                )
            )
            created += 1
        except Exception as exc:
            db.add(
                ItemCombinationCleanupSemanticAssessment(
                    run_id=run.id,
                    item_id_key=candidate.item_id_key,
                    provider="openai",
                    model="gpt-4o",
                    prompt_version="phase4b-v2-marker-safety",
                    validation_status="FAILED",
                    error_message=str(exc),
                )
            )
            failures += 1
    db.flush()
    return {
        "packed_semantic_candidates": len(candidates),
        "packed_semantic_calls": calls,
        "packed_semantic_assessments_created": created,
        "packed_semantic_failures": failures,
    }


def analyze_run(db: Session, conn: Connection, run: ItemCombinationCleanupRun, *, include_semantic: bool) -> ItemCombinationCleanupRun:
    if run.status != "uploaded":
        raise CleanupServiceError("Only a newly uploaded run can be analyzed.", 409)
    process_run(db, conn, run)
    deterministic = generate_phase5_name_suggestions(db, run)
    reused = _reuse_historical_knowledge(db, run)
    analysis: dict[str, Any] = {
        "deterministic_suggestions_created": deterministic["created"],
        "semantic_calls": 0,
        "semantic_suggestions_created": 0,
        **{
            key: reused.get(key, 0)
            for key in (
                "historical_field_decisions_reused",
                "historical_name_acceptances_reused",
                "historical_name_rejections_reused",
                "historical_decisions_invalidated",
                "historical_items_matched",
                "new_items",
            )
        },
    }
    if include_semantic:
        analysis.update(_run_packed_semantic(db, run))
        analysis.update(_run_name_semantic(db, conn, run))
    pending_row_items = {
        row.item_id_key
        for row in db.query(ItemCombinationCleanupRow).filter_by(run_id=run.id, approval_status="PENDING")
        if proposed_changes(row) and not _mechanical_only_auto_approval(row)
    }
    pending_name_items = {
        item["item_id"] for item in list_actionable_name_review(db, run.id)["items"]
    }
    analysis["items_requiring_human_review"] = len(pending_row_items | pending_name_items)
    current_analysis_rows = db.query(ItemCombinationCleanupRow).filter_by(run_id=run.id).all()
    analysis["automatically_resolved_by_rules"] = sum(
        _mechanical_only_auto_approval(row) for row in current_analysis_rows
    )
    run.summary_json = {**(run.summary_json or {}), "analysis": analysis}
    run.status = "ready_for_review"
    db.flush()
    return run
