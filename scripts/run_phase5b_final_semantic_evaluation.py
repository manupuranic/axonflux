"""Run the final, label-blind Phase 5B v2 semantic benchmark.

The benchmark combines the frozen semantic-positive fixture with the semantic
tail of the original frozen fixture.  It only reads application/raw evidence
and writes an offline JSON report.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from uuid import UUID

import openpyxl
from sqlalchemy import select, text

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.ai.cost import calculate_cost
from api.tools.item_combination_cleanup.models import ItemCombinationCleanupRow
from api.tools.item_combination_cleanup.name_semantic import tokens
from api.tools.item_combination_cleanup.name_semantic_eval import (
    NameSemanticOutput, build_production_payload, evaluate_name, load_ground_truth,
    minimal_edit_violations,
)
from config.db import SessionLocal


RUN_ID = "49a0b23a-9cc9-4b9c-b487-e80bb4d76f48"
POSITIVE_FIXTURE = PROJECT_ROOT / "tests/fixtures/phase5b_semantic_positive_ground_truth.xlsx"
NEGATIVE_FIXTURE = PROJECT_ROOT / "tests/fixtures/phase5b_name_context_ground_truth.xlsx"
POSITIVE_SHA256 = "13a86356357c8de79b13a0fd779d19e3c2ded53d785c17acdaf2c3a43ca7e7b9"
LABELS = ("CORRECTION", "NO_CHANGE")
PREDICTIONS = ("CORRECTION", "NO_CHANGE", "UNCERTAIN", "INVALID")


def load_positive_truth(path: Path) -> list[dict]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != POSITIVE_SHA256:
        raise ValueError(f"Unexpected semantic-positive fixture hash: {path}")
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook["Evaluation"]
        values = list(sheet.values)
    finally:
        workbook.close()
    headers = [str(value) for value in values[0]]
    required = {
        "Item_Id", "Effective Item Name", "Suspicious token", "Proposed lexical neighbor",
        "Detector reason", "Corroborating evidence", "Human Label", "Human Corrected Name", "Human Notes",
    }
    if not required.issubset(headers):
        raise ValueError("Semantic-positive fixture headers are incomplete")
    rows = []
    for values_row in values[1:]:
        source = dict(zip(headers, list(values_row) + [None] * (len(headers) - len(values_row))))
        label = str(source["Human Label"] or "").strip().upper()
        if label not in LABELS:
            raise ValueError(f"Positive Item_Id {source['Item_Id']}: invalid label {label!r}")
        rows.append({
            "item_id": str(source["Item_Id"]), "effective_item_name": str(source["Effective Item Name"] or ""),
            "suspicious_token": str(source["Suspicious token"] or ""),
            "lexical_neighbor": str(source["Proposed lexical neighbor"] or ""),
            "detector_reason": str(source["Detector reason"] or ""),
            "corroborating_evidence": str(source["Corroborating evidence"] or ""),
            "human_label": label, "human_corrected_name": str(source["Human Corrected Name"] or ""),
            "human_notes": source["Human Notes"], "cohort": "semantic_positive",
        })
    if Counter(row["human_label"] for row in rows) != Counter({"CORRECTION": 19, "NO_CHANGE": 1}):
        raise ValueError("Positive fixture must contain 19 CORRECTION and 1 NO_CHANGE rows")
    return rows


def semantic_negative_truth() -> list[dict]:
    rows = []
    for row in load_ground_truth(NEGATIVE_FIXTURE):
        if row["human_label"] != "NO_CHANGE" or row["detector_reason"] != "RARE_NEAR_NEIGHBOR":
            continue
        rows.append({**row, "cohort": "semantic_negative"})
    if len(rows) != 19:
        raise ValueError(f"Expected 19 semantic-negative rows; found {len(rows)}")
    return rows


def catalog_siblings(name: str, token: str, replacement: str, catalog_names: list[str]) -> list[str]:
    current = set(tokens(name)); current.discard(token.upper()); found = []
    for sibling in catalog_names:
        sibling_tokens = set(tokens(sibling))
        if replacement.upper() in sibling_tokens and current.intersection(sibling_tokens):
            found.append(sibling)
        if len(found) == 5:
            break
    return found


def expected_name(row: dict) -> str:
    """Apply the human-approved token replacement without normalizing anything else."""
    pattern = rf"(?<![A-Z0-9]){re.escape(row['suspicious_token'])}(?![A-Z0-9])"
    value, count = re.subn(pattern, row["lexical_neighbor"], row["effective_item_name"], count=1, flags=re.I)
    if count != 1 or value != row["human_corrected_name"]:
        raise ValueError(f"Item {row['item_id']}: frozen human correction is not an exact one-token materialization")
    return value


def metrics(confusion: dict[str, dict[str, int]], total: int) -> dict:
    result = {"confusion_matrix": confusion, "schema_valid_rate": round((total - sum(confusion[h]["INVALID"] for h in LABELS)) / total, 4),
              "classification_accuracy": round(sum(confusion[h][h] for h in LABELS) / total, 4)}
    for label, key in (("CORRECTION", "correction"), ("NO_CHANGE", "no_change")):
        tp = confusion[label][label]; predicted = sum(confusion[h][label] for h in LABELS); actual = sum(confusion[label].values())
        result[key] = {"precision": round(tp / predicted, 4) if predicted else None, "recall": round(tp / actual, 4) if actual else None,
                       "true_positive": tp, "predicted": predicted, "actual": actual}
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="gpt-4o")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "outputs/phase5b_final_semantic_evaluation_v2.json")
    parser.add_argument("--checkpoint", type=Path, default=PROJECT_ROOT / "outputs/phase5b_final_semantic_evaluation_v2.partial.json")
    args = parser.parse_args()
    positive, negative = load_positive_truth(POSITIVE_FIXTURE), semantic_negative_truth()
    rows = positive + negative
    if len(rows) != 39 or Counter(row["human_label"] for row in rows) != Counter({"CORRECTION": 19, "NO_CHANGE": 20}):
        raise ValueError("Combined benchmark must be exactly 39 rows: 19 CORRECTION, 20 NO_CHANGE")
    for row in positive:
        if row["human_label"] == "CORRECTION":
            expected_name(row)

    session = SessionLocal()
    try:
        ids = {row["item_id"] for row in rows}; run_id = UUID(RUN_ID)
        cleanup = {row.item_id_key: row for row in session.scalars(select(ItemCombinationCleanupRow).where(
            ItemCombinationCleanupRow.run_id == run_id, ItemCombinationCleanupRow.item_id_key.in_(ids)))}
        if missing := sorted(ids - cleanup.keys()):
            raise ValueError(f"Benchmark rows missing from cleanup run: {missing}")
        barcode_by_id = {item_id: str((row.source_identity or {}).get("barcode") or "") for item_id, row in cleanup.items()}
        purchases: dict[str, list[str]] = defaultdict(list)
        barcodes = [barcode for barcode in barcode_by_id.values() if barcode]
        for barcode, name in session.execute(text("""
            SELECT barcode, item_name_raw FROM raw.raw_purchase_itemwise
            WHERE barcode = ANY(:barcodes) AND item_name_raw IS NOT NULL
        """), {"barcodes": barcodes}):
            purchases[str(barcode)].append(str(name))
        catalog_names = [row.original_item_name or "" for row in session.scalars(select(ItemCombinationCleanupRow).where(ItemCombinationCleanupRow.run_id == run_id))]
    finally:
        session.close()

    confusion = {label: {prediction: 0 for prediction in PREDICTIONS} for label in LABELS}
    by_cohort = {cohort: {label: {prediction: 0 for prediction in PREDICTIONS} for label in LABELS} for cohort in ("semantic_positive", "semantic_negative")}
    checkpoint = json.loads(args.checkpoint.read_text(encoding="utf-8")) if args.checkpoint.exists() else {}
    records = checkpoint.get("records", [])
    completed_ids = {record["item_id"] for record in records}
    prompt_tokens = checkpoint.get("prompt_tokens", 0); completion_tokens = checkpoint.get("completion_tokens", 0)
    started = time.monotonic()
    for index, row in enumerate(rows, 1):
        if row["item_id"] in completed_ids:
            continue
        payload = build_production_payload(row, purchase_names=purchases.get(barcode_by_id[row["item_id"]], []),
                                            catalog_siblings=catalog_siblings(row["effective_item_name"], row["suspicious_token"], row["lexical_neighbor"], catalog_names))
        if set(payload) != {"candidate", "context"} or any(key.startswith("human_") for key in json.dumps(payload).lower().split('"')):
            raise AssertionError("Human evaluation fields leaked into provider payload")
        record = {"item_id": row["item_id"], "cohort": row["cohort"], "payload": payload, "human_label": row["human_label"]}
        call_started = time.monotonic()
        try:
            output, completion = evaluate_name(payload, model=args.model); record["gpt"] = output.model_dump()
            prompt_tokens += completion.prompt_tokens; completion_tokens += completion.completion_tokens; prediction = output.result
            if prediction == "CORRECTION":
                expected = expected_name(row) if row["human_label"] == "CORRECTION" else None
                if expected:
                    if output.suggested_name != expected or output.changes[0].replacement_text != row["lexical_neighbor"]:
                        pass
                edit_issues = minimal_edit_violations(output, original_item_name=row["effective_item_name"], suspicious_token=row["suspicious_token"])
        except Exception as exc:
            prediction = "INVALID"; record["error"] = str(exc)
        record["latency_seconds"] = round(time.monotonic() - call_started, 3)
        confusion[row["human_label"]][prediction] += 1; by_cohort[row["cohort"]][row["human_label"]][prediction] += 1
        records.append(record); print(f"[{index}/39] Item {row['item_id']}: {prediction}", flush=True)
        args.checkpoint.parent.mkdir(parents=True, exist_ok=True)
        args.checkpoint.write_text(json.dumps({"records": records, "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens}, indent=2), encoding="utf-8")

    if len(records) != 39:
        raise ValueError(f"Checkpoint contains {len(records)} records; expected 39")
    row_by_id = {row["item_id"]: row for row in rows}
    confusion = {label: {prediction: 0 for prediction in PREDICTIONS} for label in LABELS}
    by_cohort = {cohort: {label: {prediction: 0 for prediction in PREDICTIONS} for label in LABELS} for cohort in ("semantic_positive", "semantic_negative")}
    false_corrections = []; missed = []; invalid = []; disagreements = []; violations = []; replacement_correct = replacement_total = 0
    for record in records:
        row = row_by_id[record["item_id"]]; prediction = record.get("gpt", {}).get("result", "INVALID")
        confusion[row["human_label"]][prediction] += 1; by_cohort[row["cohort"]][row["human_label"]][prediction] += 1
        if prediction == "INVALID": invalid.append(record)
        if row["human_label"] == "NO_CHANGE" and prediction == "CORRECTION": false_corrections.append(record)
        if row["human_label"] == "CORRECTION" and prediction in {"NO_CHANGE", "UNCERTAIN"}: missed.append({**record, "human_corrected_name": row["human_corrected_name"]})
        if prediction == "CORRECTION":
            output = NameSemanticOutput.model_validate(record["gpt"])
            edit_issues = minimal_edit_violations(output, original_item_name=row["effective_item_name"], suspicious_token=row["suspicious_token"])
            if edit_issues: violations.append({**record, "violations": edit_issues})
            if row["human_label"] == "CORRECTION":
                replacement_total += 1; expected = expected_name(row)
                replacement_correct += int(output.changes[0].replacement_text == row["lexical_neighbor"])
                if output.suggested_name != expected or output.changes[0].replacement_text != row["lexical_neighbor"]:
                    disagreements.append({**record, "human_corrected_name": expected})

    report = {"evaluation": {"model": args.model, "rows": 39, "human_counts": {"CORRECTION": 19, "NO_CHANGE": 20}, "writes_to_application_tables": False},
              "summary": {**metrics(confusion, 39), "gpt_distribution": dict(Counter(record.get("gpt", {}).get("result", "INVALID") for record in records)),
                          "uncertain_count": sum(confusion[h]["UNCERTAIN"] for h in LABELS), "invalid_count": len(invalid),
                          "false_correction_count": len(false_corrections), "false_correction_rate": round(len(false_corrections) / 20, 4),
                          "human_correction_to_gpt_no_change": confusion["CORRECTION"]["NO_CHANGE"], "human_correction_to_gpt_uncertain": confusion["CORRECTION"]["UNCERTAIN"],
                          "minimal_replacement_correct_count": replacement_correct, "minimal_replacement_total": replacement_total,
                          "minimal_edit_compliance_count": sum(r.get("gpt", {}).get("result") == "CORRECTION" for r in records) - len(violations),
                          "minimal_edit_total": sum(r.get("gpt", {}).get("result") == "CORRECTION" for r in records),
                          "material_corrected_name_disagreement_count": len(disagreements),
                          "runtime_seconds": round(sum(record.get("latency_seconds", 0) for record in records), 3),
                          "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens,
                          "estimated_cost_usd": calculate_cost("openai", args.model, prompt_tokens, completion_tokens)},
              "cohorts": {cohort: {**metrics(matrix, sum(sum(row.values()) for row in matrix.values())), "gpt_distribution": dict(Counter(
                  record.get("gpt", {}).get("result", "INVALID") for record in records if record["cohort"] == cohort))} for cohort, matrix in by_cohort.items()},
              "unsafe_false_corrections": false_corrections, "missed_semantic_corrections": missed, "invalid_outputs": invalid,
              "wrong_corrections": disagreements, "minimal_edit_violations": violations, "all_results": records}
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], indent=2)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
