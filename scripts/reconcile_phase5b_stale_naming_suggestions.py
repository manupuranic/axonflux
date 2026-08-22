"""Non-destructively supersede stale Phase 5B deterministic suggestions."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.tools.item_combination_cleanup.models import (  # noqa: E402
    ItemCombinationCleanupFieldDecision,
    ItemCombinationCleanupNameSuggestion,
    ItemCombinationCleanupRow,
)
from api.tools.item_combination_cleanup.naming_standard import suggest_name_standard  # noqa: E402
from api.tools.item_combination_cleanup.service import effective_name_for_phase5  # noqa: E402
from config.db import SessionLocal  # noqa: E402


RUN_ID = UUID("49a0b23a-9cc9-4b9c-b487-e80bb4d76f48")
HISTORICAL_VERSION = "phase5b-v1"
REPLACEMENT_VERSION = "phase5b-v2-effective-baseline"
STALE_STATUS = "SUPERSEDED_STALE_BASELINE"


def reconcile_stale_naming_suggestions(db: Session, run_id: UUID) -> dict[str, int]:
    """Reconcile changed v1 baselines without deleting audit history.

    All conflicts and human decisions are validated before any ORM object is
    changed. Existing matching v2 replacements make reruns no-ops.
    """
    rows = {
        row.item_id_key: row
        for row in db.scalars(
            select(ItemCombinationCleanupRow).where(ItemCombinationCleanupRow.run_id == run_id)
        )
    }
    historical = list(
        db.scalars(
            select(ItemCombinationCleanupNameSuggestion).where(
                ItemCombinationCleanupNameSuggestion.run_id == run_id,
                ItemCombinationCleanupNameSuggestion.suggestion_source == "NAMING_STANDARD",
                ItemCombinationCleanupNameSuggestion.suggestion_version == HISTORICAL_VERSION,
            )
        )
    )
    replacements = {
        suggestion.item_id_key: suggestion
        for suggestion in db.scalars(
            select(ItemCombinationCleanupNameSuggestion).where(
                ItemCombinationCleanupNameSuggestion.run_id == run_id,
                ItemCombinationCleanupNameSuggestion.suggestion_source == "NAMING_STANDARD",
                ItemCombinationCleanupNameSuggestion.suggestion_version == REPLACEMENT_VERSION,
            )
        )
    }

    valid_current = 0
    conflicts = []
    for suggestion in historical:
        row = rows.get(suggestion.item_id_key)
        if row is None:
            raise RuntimeError(f"missing cleanup row {suggestion.item_id_key}")
        baseline = effective_name_for_phase5(db, row) or ""
        current = suggest_name_standard(baseline)
        if baseline == suggestion.base_value and current.suggested_name == suggestion.suggested_value:
            valid_current += 1
            continue
        if not current.suggested_name:
            raise RuntimeError(f"no current replacement {suggestion.item_id_key}")
        conflicts.append((suggestion, baseline, current))

    conflict_ids = [suggestion.item_id_key for suggestion, _, _ in conflicts]
    if conflict_ids:
        decided = list(
            db.scalars(
                select(ItemCombinationCleanupFieldDecision).where(
                    ItemCombinationCleanupFieldDecision.run_id == run_id,
                    ItemCombinationCleanupFieldDecision.item_id_key.in_(conflict_ids),
                    ItemCombinationCleanupFieldDecision.field_name == "name",
                    ItemCombinationCleanupFieldDecision.decision.in_(("ACCEPTED", "REJECTED")),
                )
            )
        )
        if decided:
            keys = ", ".join(sorted(decision.item_id_key for decision in decided))
            raise RuntimeError(f"human-decided conflict {keys}")

    # Validate every existing replacement before staging any status change.
    for historical_suggestion, baseline, current in conflicts:
        replacement = replacements.get(historical_suggestion.item_id_key)
        if replacement is None:
            continue
        if (
            replacement.base_value != baseline
            or replacement.suggested_value != current.suggested_name
            or replacement.evidence.get("supersedes_suggestion_id") != str(historical_suggestion.id)
        ):
            raise RuntimeError(f"conflicting current replacement {historical_suggestion.item_id_key}")

    superseded = replacements_created = 0
    for historical_suggestion, baseline, current in conflicts:
        if historical_suggestion.status != STALE_STATUS:
            historical_suggestion.status = STALE_STATUS
            superseded += 1
        if historical_suggestion.item_id_key in replacements:
            continue
        db.add(
            ItemCombinationCleanupNameSuggestion(
                run_id=run_id,
                item_id_key=historical_suggestion.item_id_key,
                field_name="name",
                suggestion_source="NAMING_STANDARD",
                suggestion_version=REPLACEMENT_VERSION,
                category=current.category or "ABBREVIATION_EXPANSION",
                base_value=baseline,
                suggested_value=current.suggested_name,
                transformations=current.transformations,
                evidence={
                    **current.evidence,
                    "supersedes_suggestion_id": str(historical_suggestion.id),
                    "historical_baseline": historical_suggestion.base_value,
                },
            )
        )
        replacements_created += 1

    db.flush()
    return {
        "valid_current": valid_current,
        "superseded": superseded,
        "replacements_created": replacements_created,
    }


def main() -> None:
    with SessionLocal() as db:
        try:
            result = reconcile_stale_naming_suggestions(db, RUN_ID)
            db.commit()
        except Exception:
            db.rollback()
            raise
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
