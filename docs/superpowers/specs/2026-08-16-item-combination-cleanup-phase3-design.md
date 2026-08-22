# Item Combination Cleanup Phase 3 Design

## Goal

Allow staff to review deterministic proposals, explicitly approve or reject business-significant changes, and produce an ER4U workbook that contains only export-eligible changes. The workbook must retain Phase 1 identity validation.

## Scope and boundaries

Phase 3 changes only `app.item_combination_cleanup_*`, the cleanup plugin, and its internal UI. It does not change `raw_ingestion`, raw data, derived data, BOM, products, aliases, HSN, LLM behavior, fuzzy matching, or the Phase 2.6 classifier.

`source.xlsx` is immutable. Every approved export begins by copying it, never by reusing a prior output.

## Proposal decision model

Deterministic `review_status` remains a description of the classifier result (`AUTO_APPROVED`, `NEEDS_REVIEW`, or `UNCHANGED`). Human approval is separate state on each stored proposal row:

| Field | Values / meaning |
|---|---|
| `approval_status` | `PENDING`, `APPROVED`, or `REJECTED` |
| `reviewed_by` | the authenticated staff user who made the last decision |
| `reviewed_at` | timestamp of the last decision |

Rows begin `PENDING`. Individual staff actions can approve or reject a pending row. An approved or rejected row can be changed only by another explicit individual decision; there is no silent reset.

## Export eligibility

A proposal is export-eligible when either condition holds:

1. It is a mechanical-only deterministic auto-approval: `review_status = AUTO_APPROVED`, it has no proposed Brand change, it is not `PACKED`, and it changes only `Item Name` and/or `Size`.
2. A staff member explicitly set `approval_status = APPROVED`.

Any Brand change requires explicit approval. Every `PACKED` proposal requires explicit approval. `LOW` confidence does not prohibit individual approval, but it cannot be bulk-approved. `REJECTED` and `PENDING` business-significant proposals never export.

The export applies only `Item Name`, `Brand`, and `Size`; HsnCode is not changed in Phase 3.

## API and service behavior

The plugin exposes:

- `POST /runs/{run_id}/rows/{item_id}/approval` for an individual `APPROVED` or `REJECTED` decision.
- `POST /runs/{run_id}/bulk-approval` for approving all matching pending rows.
- `POST /runs/{run_id}/approved-export` to write a validated ER4U workbook from export-eligible rows.
- `GET /runs/{run_id}/approved-download` to retrieve the validated approved export.

Bulk approval accepts the existing server-side list filters, but requires at least one meaningful selector: product type, confidence, deterministic review status, changed-field filter, or non-empty search. The service recomputes matching rows server-side. It rejects bulk approval if the filter includes any `LOW`-confidence row, and it skips mechanical-only auto-eligible rows because they need no approval.

Once any row has a human decision, `POST /runs/{run_id}/process` is rejected. This prevents recomputation from deleting audited decisions. A new upload/run is required for regenerated deterministic proposals.

## Workbook safety

`export_approved_proposals()` copies the original source workbook, locates each approved row by exact `Item_Id`, and writes only the permitted mutable cells. It rejects duplicate/missing Item_Id mappings and deletes the output on any failure. It always invokes the existing `validate_identity_copy(source, output)` afterward, so Item_Id, Barcode, MRP, Rate, Purchase Price, Expiry, Stock, all other cells, sheet order, headers, and dimensions remain protected.

## UI

The existing inspection page gains:

- visible original → proposed Name, Brand, and Size values;
- deterministic review status and separate human approval status;
- approval-state filters and statistics;
- detail evidence plus individual Approve/Reject controls;
- an approve-all-filtered-pending action that displays the server-returned affected count;
- a download button for the approved export.

The UI does not provide proposal editing, semantic suggestions, LLM calls, or HSN controls.

## Evaluation

Tests prove mechanical eligibility, Brand/PACKED approval requirements, individual and filtered bulk decisions, LOW bulk rejection, reprocess protection, approved-only cell application, missing Item_Id protection, and Phase 1 invariant validation. The existing Phase 1 and Phase 2.6 suites remain green.
