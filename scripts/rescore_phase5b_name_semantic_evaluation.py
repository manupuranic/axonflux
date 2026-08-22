"""Rescore saved Phase 5B name-semantic outputs against the frozen ground truth.

This command never calls a provider and never writes application tables.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.tools.item_combination_cleanup.name_semantic_eval import (
    NameSemanticOutput,
    human_minimal_replacement,
    load_ground_truth,
    minimal_edit_violations,
)

LABELS = ("CORRECTION", "NO_CHANGE")
PREDICTIONS = ("CORRECTION", "NO_CHANGE", "UNCERTAIN", "INVALID")


def normal(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (value or "").upper())


def metric(confusion: dict[str, dict[str, int]], label: str) -> dict:
    tp = confusion[label][label]
    predicted = sum(confusion[human][label] for human in LABELS)
    actual = sum(confusion[label].values())
    return {
        "precision": round(tp / predicted, 4) if predicted else None,
        "recall": round(tp / actual, 4) if actual else None,
        "true_positive": tp,
        "predicted": predicted,
        "actual": actual,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=PROJECT_ROOT / "outputs" / "phase5b_name_semantic_evaluation.json")
    parser.add_argument("--fixture", type=Path, default=PROJECT_ROOT / "tests" / "fixtures" / "phase5b_name_context_ground_truth.xlsx")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "outputs" / "phase5b_name_semantic_evaluation_v1_rescored.json")
    args = parser.parse_args()

    prior = json.loads(args.input.read_text(encoding="utf-8"))
    truth = {row["item_id"]: row for row in load_ground_truth(args.fixture)}
    resolved = {item_id: row for item_id, row in truth.items() if row["human_label"] in LABELS}
    confusion = {label: {prediction: 0 for prediction in PREDICTIONS} for label in LABELS}
    false_corrections, missed_corrections, minimal_violations, name_disagreements, invalid = [], [], [], [], []
    minimal_replacement_total = minimal_replacement_correct = 0
    scored = []
    for entry in prior["all_results"]:
        item_id = entry["item_id"]
        if item_id not in resolved:
            continue
        human = resolved[item_id]
        record = {"item_id": item_id, "payload": entry["payload"], "human_label": human["human_label"]}
        try:
            gpt = NameSemanticOutput.model_validate(entry["gpt"])
            prediction = gpt.result
            record["gpt"] = gpt.model_dump()
            violations = minimal_edit_violations(gpt, original_item_name=human["effective_item_name"], suspicious_token=human["suspicious_token"])
            if violations:
                minimal_violations.append({**record, "violations": violations})
            if human["human_label"] == "CORRECTION" and prediction == "CORRECTION":
                replacement = human_minimal_replacement(human)
                expected_name = human["effective_item_name"].replace(human["suspicious_token"], replacement)
                minimal_replacement_total += 1
                replacement_matches = normal(gpt.changes[0].replacement_text) == normal(replacement)
                minimal_replacement_correct += replacement_matches
                if not replacement_matches or normal(gpt.suggested_name) != normal(expected_name):
                    name_disagreements.append({**record, "expected_minimal_replacement": replacement, "expected_corrected_name": expected_name})
        except Exception as exc:
            prediction = "INVALID"
            record["error"] = str(exc)
            invalid.append(record)
        confusion[human["human_label"]][prediction] += 1
        if human["human_label"] == "NO_CHANGE" and prediction == "CORRECTION":
            false_corrections.append(record)
        if human["human_label"] == "CORRECTION" and prediction in {"NO_CHANGE", "UNCERTAIN"}:
            missed_corrections.append(record)
        scored.append(record)

    valid = len(scored) - len(invalid)
    correct = sum(confusion[label][label] for label in LABELS)
    report = {
        "evaluation": {"source": str(args.input), "mode": "rescore_only_no_provider_calls", "resolved_rows": len(scored)},
        "summary": {
            "schema_valid_rate": round(valid / len(scored), 4),
            "classification_accuracy": round(correct / len(scored), 4),
            "correction": metric(confusion, "CORRECTION"),
            "no_change": metric(confusion, "NO_CHANGE"),
            "confusion_matrix": confusion,
            "human_no_change_to_gpt_correction_count": len(false_corrections),
            "human_correction_to_gpt_no_change_or_uncertain_count": len(missed_corrections),
            "minimal_replacement_correct_count": minimal_replacement_correct,
            "minimal_replacement_total": minimal_replacement_total,
            "minimal_edit_compliance_count": sum(1 for record in scored if record.get("gpt", {}).get("result") == "CORRECTION") - len(minimal_violations),
            "minimal_edit_total": sum(1 for record in scored if record.get("gpt", {}).get("result") == "CORRECTION"),
            "material_corrected_name_disagreement_count": len(name_disagreements),
            "runtime_seconds": prior["summary"]["runtime_seconds"],
            "prompt_tokens": prior["summary"]["prompt_tokens"],
            "completion_tokens": prior["summary"]["completion_tokens"],
            "estimated_cost_usd": prior["summary"]["estimated_cost_usd"],
        },
        "false_corrections": false_corrections,
        "missed_corrections": missed_corrections,
        "minimal_edit_violations": minimal_violations,
        "material_corrected_name_disagreements": name_disagreements,
        "invalid_outputs": invalid,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
