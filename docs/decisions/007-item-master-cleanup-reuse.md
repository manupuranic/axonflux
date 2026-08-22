# ADR 007: Item Master Cleanup Runs and Historical Decision Reuse

**Status:** Accepted
**Date:** 2026-08-22

## Context

ER4U periodically exports an Item Combination Master workbook with names, Brand, Size, supplier, and PACKED-related fields that need correction. The first 13,507-row cleanup proved the rules and human-review process, but a production feature must also handle next month's workbook without replaying developer scripts or blindly applying stale judgments.

The central risk is asymmetric: missing a cleanup suggestion leaves a visible imperfection, while applying an old or semantic correction to the wrong item silently corrupts the workbook imported back into ER4U.

## Decisions

### 1. Every upload creates an independent immutable cleanup run

The uploaded workbook, cleanup rows, suggestions, decisions, and approved export belong to a new run ID. A later upload never regenerates or mutates a closed run.

**Why:** The run is an audit boundary. It must remain possible to reconstruct what the operator saw, accepted, rejected, edited, and exported for each source workbook.

### 2. Stable identity requires both Item ID and barcode

Historical knowledge is considered only when normalized `Item_Id` and barcode both match.

**Why:** Either key alone can be reused or mistyped by the source system. Requiring both deliberately prefers a repeated review over attaching a decision to the wrong product.

### 3. Reuse requires an unchanged relevant baseline

Field decisions are reusable only when the original field value and current deterministic proposal exactly match the historical decision. Name-suggestion decisions additionally require the same effective Name baseline, suggestion source, and proposed correction. A manual accepted Name edit may be copied as the new run's authoritative edit only under that exact baseline.

Changed source text or a changed deterministic proposal invalidates reuse and sends the item through current analysis. Evidence changes that do not alter either relevant baseline or proposal do not invalidate an otherwise identical decision.

### 4. Exact historical rejection suppresses the same question

When identity, effective Name baseline, semantic source, and proposed correction are unchanged, a rejected suggestion is copied into the new run as rejected rather than shown or evaluated again.

**Why:** Repeatedly asking the same human question wastes attention and makes rejection appear non-authoritative.

### 5. Semantic output remains advisory

The semantic evaluator may create a review suggestion or a PACKED relationship assessment. It never writes an effective Name, Brand, Size, supplier, PACKED classification, or export cell directly. Accept, Reject, and Edit remain explicit human actions.

### 6. Export is a separate, explicit, fidelity-validated action

Pending suggestions do not affect export-authoritative values. Export applies only accepted or manually edited field decisions, preserves row count and identity, checks protected workbook fields, writes a new file, and never imports it into ER4U automatically.

## Consequences

- Future cleanup is incremental: global rules rerun, valid human knowledge carries forward, and only new/changed/ambiguous items require attention.
- A changed baseline intentionally creates more review rather than risking stale automation.
- Historical rows are preserved instead of rewritten; reuse creates provenance-bearing records in the new run.
- Semantic analysis can fail independently. Successful deterministic results remain reviewable, and the UI warns that failed advisory checks were not reviewed.
- Analysis currently runs synchronously from the user-facing endpoint; per-item progress and retry-only semantic execution remain future operational improvements.

## Files

| File | Responsibility |
|---|---|
| `api/tools/item_combination_cleanup/workflow.py` | Fresh-run orchestration and conservative historical reuse |
| `api/tools/item_combination_cleanup/service.py` | Processing, decisions, review queues, deterministic suggestions, export |
| `api/tools/item_combination_cleanup/name_semantic.py` | Optimized long-tail candidate detection |
| `api/tools/item_combination_cleanup/name_semantic_eval.py` | Structured semantic-v2 evaluator and minimal-edit validation |
| `web/app/(internal)/tools/item-combination-cleanup/page.tsx` | Upload, Decision Inbox, and explicit export workflow |
| `tests/test_cleanup_fresh_workflow.py` | Cross-run reuse and public API acceptance proof |
