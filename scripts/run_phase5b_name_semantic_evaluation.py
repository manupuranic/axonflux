"""Run the bounded Phase 5B name-semantic evaluation without application writes.

Only the 60 resolved rows in the hash-pinned ground-truth workbook are sent to
GPT-4o.  Human-label columns are never included in a provider payload. Results
are saved as an evaluation artifact; this command does not update app.* tables.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from uuid import UUID

from sqlalchemy import select, text

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.ai.cost import calculate_cost
from api.tools.item_combination_cleanup.models import ItemCombinationCleanupRow
from api.tools.item_combination_cleanup.name_semantic import tokens
from api.tools.item_combination_cleanup.name_semantic_eval import (
    GROUND_TRUTH_SHA256,
    build_production_payload,
    evaluate_name,
    human_minimal_replacement,
    load_ground_truth,
    minimal_edit_violations,
)
from config.db import SessionLocal


DEFAULT_RUN_ID = "49a0b23a-9cc9-4b9c-b487-e80bb4d76f48"
DEFAULT_FIXTURE = PROJECT_ROOT / "tests" / "fixtures" / "phase5b_name_context_ground_truth.xlsx"
LABELS = ("CORRECTION", "NO_CHANGE")
PREDICTIONS = ("CORRECTION", "NO_CHANGE", "UNCERTAIN", "INVALID")


def _normal(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (value or "").upper())


def _catalog_siblings(name: str, suspicious_token: str, replacement: str, catalog_names: list[str]) -> list[str]:
    current_tokens = set(tokens(name))
    current_tokens.discard(suspicious_token.upper())
    replacement = replacement.upper()
    siblings = []
    for sibling in catalog_names:
        sibling_tokens = set(tokens(sibling))
        if replacement in sibling_tokens and current_tokens.intersection(sibling_tokens):
            siblings.append(sibling)
        if len(siblings) == 5:
            break
    return siblings


def _metrics(confusion: dict[str, dict[str, int]]) -> dict:
    metrics = {}
    for label in LABELS:
        tp = confusion[label][label]
        predicted = sum(confusion[human][label] for human in LABELS)
        actual = sum(confusion[label][prediction] for prediction in PREDICTIONS)
        metrics[label] = {
            "precision": round(tp / predicted, 4) if predicted else None,
            "recall": round(tp / actual, 4) if actual else None,
            "true_positive": tp,
            "predicted": predicted,
            "actual": actual,
        }
    return metrics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default=DEFAULT_RUN_ID)
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--model", default="gpt-4o")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "outputs" / "phase5b_name_semantic_evaluation.json")
    args = parser.parse_args()

    truth = load_ground_truth(args.fixture)
    resolved = [row for row in truth if row["human_label"] in LABELS]
    uncertain = [row for row in truth if row["human_label"] == "UNCERTAIN"]
    if len(resolved) != 60 or len(uncertain) != 1:
        raise ValueError("Ground truth must contain exactly 60 resolved rows and one UNCERTAIN row")

    session = SessionLocal()
    try:
        run_id = UUID(args.run_id)
        candidate_ids = {row["item_id"] for row in truth}
        cleanup_rows = {
            row.item_id_key: row
            for row in session.scalars(select(ItemCombinationCleanupRow).where(
                ItemCombinationCleanupRow.run_id == run_id,
                ItemCombinationCleanupRow.item_id_key.in_(candidate_ids),
            ))
        }
        missing = sorted(candidate_ids - cleanup_rows.keys())
        if missing:
            raise ValueError(f"Ground-truth Item_Id values missing from cleanup run: {missing}")
        catalog_names = [
            row.original_item_name or ""
            for row in session.scalars(select(ItemCombinationCleanupRow).where(ItemCombinationCleanupRow.run_id == run_id))
            if row.original_item_name
        ]
        barcode_by_id = {
            item_id: str((row.source_identity or {}).get("barcode") or "")
            for item_id, row in cleanup_rows.items()
        }
        barcodes = [barcode for barcode in barcode_by_id.values() if barcode]
        purchase_by_barcode: dict[str, list[str]] = defaultdict(list)
        if barcodes:
            for barcode, name in session.execute(text("""
                SELECT barcode, item_name_raw
                FROM raw.raw_purchase_itemwise
                WHERE barcode = ANY(:barcodes) AND item_name_raw IS NOT NULL
            """), {"barcodes": barcodes}):
                purchase_by_barcode[str(barcode)].append(str(name))
    finally:
        session.close()

    confusion = {human: {prediction: 0 for prediction in PREDICTIONS} for human in LABELS}
    results, no_change_to_correction, correction_misses = [], [], []
    corrected_name_disagreements, minimal_edit_violation_records, invalid = [], [], []
    minimal_replacement_total = minimal_replacement_correct = 0
    prompt_tokens = completion_tokens = 0
    started = time.monotonic()
    for index, row in enumerate(resolved, start=1):
        payload = build_production_payload(
            row,
            purchase_names=purchase_by_barcode.get(barcode_by_id[row["item_id"]], []),
            catalog_siblings=_catalog_siblings(row["effective_item_name"], row["suspicious_token"], row["lexical_neighbor"], catalog_names),
        )
        call_started = time.monotonic()
        entry = {"item_id": row["item_id"], "payload": payload, "human_label": row["human_label"]}
        try:
            result, completion = evaluate_name(payload, model=args.model)
            latency = round(time.monotonic() - call_started, 3)
            prompt_tokens += completion.prompt_tokens
            completion_tokens += completion.completion_tokens
            entry["gpt"] = result.model_dump()
            entry["latency_seconds"] = latency
            predicted = result.result
            violations = minimal_edit_violations(
                result,
                original_item_name=row["effective_item_name"],
                suspicious_token=row["suspicious_token"],
            )
            if violations:
                minimal_edit_violation_records.append({**entry, "violations": violations})
            if row["human_label"] == "NO_CHANGE" and predicted == "CORRECTION":
                no_change_to_correction.append(entry)
            if row["human_label"] == "CORRECTION" and predicted in {"NO_CHANGE", "UNCERTAIN"}:
                correction_misses.append(entry)
            if row["human_label"] == "CORRECTION" and predicted == "CORRECTION":
                expected_replacement = human_minimal_replacement(row)
                expected_name = row["effective_item_name"].replace(row["suspicious_token"], expected_replacement)
                minimal_replacement_total += 1
                replacement_matches = _normal(result.changes[0].replacement_text) == _normal(expected_replacement)
                minimal_replacement_correct += replacement_matches
                if not replacement_matches or _normal(result.suggested_name) != _normal(expected_name):
                    corrected_name_disagreements.append({
                        **entry,
                        "expected_minimal_replacement": expected_replacement,
                        "expected_corrected_name": expected_name,
                    })
        except Exception as exc:
            latency = round(time.monotonic() - call_started, 3)
            predicted = "INVALID"
            entry["error"] = str(exc)
            entry["latency_seconds"] = latency
            invalid.append(entry)
        confusion[row["human_label"]][predicted] += 1
        results.append(entry)
        print(f"[{index}/60] Item {row['item_id']}: {predicted} ({latency}s)", flush=True)

    valid = 60 - len(invalid)
    correct = sum(confusion[label][label] for label in LABELS)
    report = {
        "evaluation": {
            "name": "Phase 5B name semantic evaluation",
            "model": args.model,
            "ground_truth_sha256": GROUND_TRUTH_SHA256,
            "ground_truth_rows": 61,
            "resolved_rows_sent_to_model": 60,
            "excluded_uncertain_rows": uncertain,
            "writes_to_application_tables": False,
        },
        "summary": {
            "schema_valid_rate": round(valid / 60, 4),
            "classification_accuracy": round(correct / 60, 4),
            "correction": _metrics(confusion)["CORRECTION"],
            "no_change": _metrics(confusion)["NO_CHANGE"],
            "uncertain_behavior": {
                "by_human_label": {label: confusion[label]["UNCERTAIN"] for label in LABELS},
                "total": sum(confusion[label]["UNCERTAIN"] for label in LABELS),
            },
            "confusion_matrix": confusion,
            "human_no_change_to_gpt_correction_count": len(no_change_to_correction),
            "human_correction_to_gpt_no_change_or_uncertain_count": len(correction_misses),
            "both_correction_material_name_disagreement_count": len(corrected_name_disagreements),
            "minimal_replacement_correct_count": minimal_replacement_correct,
            "minimal_replacement_total": minimal_replacement_total,
            "minimal_edit_violation_count": len(minimal_edit_violation_records),
            "minimal_edit_compliance_count": sum(1 for result in results if result.get("gpt", {}).get("result") == "CORRECTION") - len(minimal_edit_violation_records),
            "minimal_edit_total": sum(1 for result in results if result.get("gpt", {}).get("result") == "CORRECTION"),
            "runtime_seconds": round(time.monotonic() - started, 3),
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "estimated_cost_usd": calculate_cost("openai", args.model, prompt_tokens, completion_tokens),
        },
        "human_no_change_to_gpt_correction": no_change_to_correction,
        "human_correction_to_gpt_no_change_or_uncertain": correction_misses,
        "both_correction_material_name_disagreements": corrected_name_disagreements,
        "minimal_edit_violations": minimal_edit_violation_records,
        "invalid_outputs": invalid,
        "all_results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
