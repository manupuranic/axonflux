"""Run only the resolved Phase 4B human-label sanity set with terminal progress.

Usage (from repository root):
    .\\.venv\\Scripts\\python.exe scripts/run_cleanup_semantic_sanity.py

The command is intentionally bounded to the supplied workbook's resolved labels;
it cannot start the 371-row production cohort.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path
from uuid import UUID

import openpyxl
from sqlalchemy import select

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.tools.item_combination_cleanup.models import (
    ItemCombinationCleanupRow,
    ItemCombinationCleanupSemanticAssessment,
)
from api.tools.item_combination_cleanup.semantic import evaluate
from api.tools.item_combination_cleanup.semantic_runner import build_evidence_payload, resolved_human_label
from config.db import SessionLocal

DEFAULT_RUN_ID = "49a0b23a-9cc9-4b9c-b487-e80bb4d76f48"
DEFAULT_WORKBOOK = Path(r"C:\Users\Manu\Downloads\phase4b_human_label_evaluation_49a0b23a.xlsx")
DEFAULT_PROMPT_VERSION = "phase4b-v2-marker-safety"


def workbook_rows(path: Path) -> list[dict]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Evaluation Dataset"]
    rows = list(sheet.values)
    headers = [str(header) for header in rows[0]]
    return [dict(zip(headers, row)) for row in rows[1:] if resolved_human_label(dict(zip(headers, row)))]


def seconds_text(seconds: float) -> str:
    seconds = max(0, round(seconds))
    minutes, seconds = divmod(seconds, 60)
    return f"{minutes}m {seconds:02d}s" if minutes else f"{seconds}s"


def persist_result(session, *, run_id: UUID, item_id: str, provider: str, model: str, prompt_version: str, result=None, completion=None, error: str | None = None):
    existing = session.scalar(select(ItemCombinationCleanupSemanticAssessment).where(
        ItemCombinationCleanupSemanticAssessment.run_id == run_id,
        ItemCombinationCleanupSemanticAssessment.item_id_key == item_id,
        ItemCombinationCleanupSemanticAssessment.provider == provider,
        ItemCombinationCleanupSemanticAssessment.model == model,
        ItemCombinationCleanupSemanticAssessment.prompt_version == prompt_version,
    ))
    assessment = existing or ItemCombinationCleanupSemanticAssessment(
        run_id=run_id, item_id_key=item_id, provider=provider, model=model, prompt_version=prompt_version,
    )
    if result:
        assessment.relationship = result.relationship
        assessment.confidence = result.confidence
        assessment.reason = result.reason
        assessment.signals_for_packed = result.signals_for_packed
        assessment.signals_against_packed = result.signals_against_packed
        assessment.identity_interpretations = [entry.model_dump() for entry in result.identity_interpretations]
        assessment.raw_response = {
            "prompt_tokens": completion.prompt_tokens,
            "completion_tokens": completion.completion_tokens,
        }
        assessment.validation_status = "VALID"
        assessment.error_message = None
    else:
        assessment.validation_status = "FAILED"
        assessment.error_message = error
    if not existing:
        session.add(assessment)
    session.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default=DEFAULT_RUN_ID)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--provider", default="openai")
    parser.add_argument("--model", default="gpt-4o")
    parser.add_argument("--prompt-version", default=DEFAULT_PROMPT_VERSION)
    parser.add_argument("--retry-failed", action="store_true", help="Retry persisted failures; valid rows are always skipped.")
    args = parser.parse_args()

    rows = workbook_rows(args.workbook)
    if len(rows) != 27:
        raise ValueError(f"Expected exactly 27 resolved evaluation labels; found {len(rows)}")
    run_id = UUID(args.run_id)
    session = SessionLocal()
    try:
        packed_ids = set(session.scalars(select(ItemCombinationCleanupRow.item_id_key).where(
            ItemCombinationCleanupRow.run_id == run_id,
            ItemCombinationCleanupRow.product_type == "PACKED",
        )))
        missing = [str(row["Retail Item_Id"]) for row in rows if str(row["Retail Item_Id"]) not in packed_ids]
        if missing:
            raise ValueError(f"Workbook items are not PACKED candidates in run {run_id}: {missing}")

        pending = []
        for row in rows:
            item_id = str(row["Retail Item_Id"])
            existing = session.scalar(select(ItemCombinationCleanupSemanticAssessment.validation_status).where(
                ItemCombinationCleanupSemanticAssessment.run_id == run_id,
                ItemCombinationCleanupSemanticAssessment.item_id_key == item_id,
                ItemCombinationCleanupSemanticAssessment.provider == args.provider,
                ItemCombinationCleanupSemanticAssessment.model == args.model,
                ItemCombinationCleanupSemanticAssessment.prompt_version == args.prompt_version,
            ))
            if existing == "VALID":
                continue
            if existing == "FAILED" and not args.retry_failed:
                continue
            pending.append(row)

        print(f"Semantic sanity evaluation: {len(pending)}/{len(rows)} calls pending ({args.provider}/{args.model})", flush=True)
        if not pending:
            print("Nothing to run. Use --retry-failed to retry persisted failures.", flush=True)
            return 0

        started = time.monotonic()
        latencies, failures, relationships, confidences = [], [], Counter(), Counter()
        for index, row in enumerate(pending, start=1):
            item_id = str(row["Retail Item_Id"])
            call_started = time.monotonic()
            try:
                result, completion = evaluate(build_evidence_payload(row), provider=args.provider, model=args.model, prompt_version=args.prompt_version)
                latency = time.monotonic() - call_started
                latencies.append(latency)
                relationships[result.relationship] += 1
                confidences[result.confidence] += 1
                persist_result(session, run_id=run_id, item_id=item_id, provider=args.provider, model=args.model, prompt_version=args.prompt_version, result=result, completion=completion)
                state = f"VALID {result.relationship} / {result.confidence}"
            except Exception as exc:
                latency = time.monotonic() - call_started
                latencies.append(latency)
                failures.append({"item_id": item_id, "error": str(exc)})
                persist_result(session, run_id=run_id, item_id=item_id, provider=args.provider, model=args.model, prompt_version=args.prompt_version, error=str(exc))
                state = f"FAILED {exc}"
            average = sum(latencies) / len(latencies)
            eta = average * (len(pending) - index)
            print(f"[{index}/{len(pending)}] Item {item_id}: {state}; last {seconds_text(latency)}, avg {seconds_text(average)}, ETA {seconds_text(eta)}", flush=True)

        print(json.dumps({
            "attempted": len(pending), "valid": len(pending) - len(failures), "failed": len(failures),
            "relationships": relationships, "confidence": confidences,
            "latency_seconds": round(time.monotonic() - started, 2), "failures": failures,
        }, default=dict, indent=2), flush=True)
        return 1 if failures else 0
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
