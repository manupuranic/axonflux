"""Generate advisory Phase 4B v2 semantic assessments for PACKED rows only.

This command never updates deterministic cleanup rows. It persists only the
separate semantic-assessment record and resumes safely after isolated failures.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path
from uuid import UUID

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import select

from api.tools.item_combination_cleanup.models import (
    ItemCombinationCleanupRow,
    ItemCombinationCleanupSemanticAssessment,
)
from api.tools.item_combination_cleanup.semantic import evaluate
from api.tools.item_combination_cleanup.semantic_runner import build_production_evidence_payload
from scripts.run_cleanup_semantic_sanity import DEFAULT_PROMPT_VERSION, DEFAULT_RUN_ID, persist_result, seconds_text
from config.db import SessionLocal


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default=DEFAULT_RUN_ID)
    parser.add_argument("--provider", default="openai")
    parser.add_argument("--model", default="gpt-4o")
    parser.add_argument("--prompt-version", default=DEFAULT_PROMPT_VERSION)
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()
    run_id = UUID(args.run_id)
    session = SessionLocal()
    try:
        candidates = session.scalars(select(ItemCombinationCleanupRow).where(
            ItemCombinationCleanupRow.run_id == run_id,
            ItemCombinationCleanupRow.product_type == "PACKED",
        ).order_by(ItemCombinationCleanupRow.row_index)).all()
        if len(candidates) != 371:
            raise ValueError(f"Expected 371 PACKED candidates in run {run_id}; found {len(candidates)}")
        source_ids = {
            str((row.classification_evidence or {}).get("source_loose_item_id"))
            for row in candidates if (row.classification_evidence or {}).get("source_loose_item_id") is not None
        }
        loose_by_id = {
            row.item_id_key: row
            for row in session.scalars(select(ItemCombinationCleanupRow).where(
                ItemCombinationCleanupRow.run_id == run_id,
                ItemCombinationCleanupRow.item_id_key.in_(source_ids),
            ))
        }
        existing = {
            row.item_id_key: row.validation_status
            for row in session.scalars(select(ItemCombinationCleanupSemanticAssessment).where(
                ItemCombinationCleanupSemanticAssessment.run_id == run_id,
                ItemCombinationCleanupSemanticAssessment.provider == args.provider,
                ItemCombinationCleanupSemanticAssessment.model == args.model,
                ItemCombinationCleanupSemanticAssessment.prompt_version == args.prompt_version,
            ))
        }
        pending = [
            row for row in candidates
            if existing.get(row.item_id_key) != "VALID"
            and (args.retry_failed or existing.get(row.item_id_key) != "FAILED")
        ]
        print(f"Semantic production: {len(pending)}/{len(candidates)} calls pending ({args.provider}/{args.model}, {args.prompt_version})", flush=True)
        started = time.monotonic()
        latencies, failures, relationships, confidences = [], [], Counter(), Counter()
        for index, candidate in enumerate(pending, start=1):
            call_started = time.monotonic()
            try:
                source_id = str((candidate.classification_evidence or {}).get("source_loose_item_id") or "")
                result, completion = evaluate(
                    build_production_evidence_payload(candidate, loose_by_id.get(source_id)),
                    provider=args.provider, model=args.model, prompt_version=args.prompt_version,
                )
                latency = time.monotonic() - call_started
                latencies.append(latency)
                relationships[result.relationship] += 1
                confidences[result.confidence] += 1
                persist_result(session, run_id=run_id, item_id=candidate.item_id_key, provider=args.provider, model=args.model, prompt_version=args.prompt_version, result=result, completion=completion)
                state = f"VALID {result.relationship} / {result.confidence}"
            except Exception as exc:
                latency = time.monotonic() - call_started
                latencies.append(latency)
                failures.append({"item_id": candidate.item_id_key, "error": str(exc)})
                persist_result(session, run_id=run_id, item_id=candidate.item_id_key, provider=args.provider, model=args.model, prompt_version=args.prompt_version, error=str(exc))
                state = f"FAILED {exc}"
            average = sum(latencies) / len(latencies)
            print(f"[{index}/{len(pending)}] Item {candidate.item_id_key}: {state}; last {seconds_text(latency)}, avg {seconds_text(average)}, ETA {seconds_text(average * (len(pending) - index))}", flush=True)
        print(json.dumps({
            "attempted": len(pending), "valid": len(pending) - len(failures), "failed": len(failures),
            "relationships": relationships, "confidence": confidences,
            "runtime_seconds": round(time.monotonic() - started, 2), "failures": failures,
        }, default=dict, indent=2), flush=True)
        return 1 if failures else 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
