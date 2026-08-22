# Item Combination Cleanup Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable review decisions and a Phase 1-validated export that applies only export-eligible Item Combination cleanup proposals.

**Architecture:** Human approval is stored separately from deterministic classification. The service determines export eligibility on the server, applies eligible Name/Brand/Size values to a fresh copy of `source.xlsx`, and validates all protected workbook cells before exposing the file.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, PostgreSQL JSONB, openpyxl, Next.js/TypeScript, pytest.

**Spec:** `docs/superpowers/specs/2026-08-16-item-combination-cleanup-phase3-design.md`

## Global Constraints

- Do not modify `raw_ingestion`, raw tables, derived tables, BOM, product tables, aliases, HSN, LLM behavior, or Phase 2.6 classification rules.
- Preserve `source.xlsx`; approved export starts from it every time.
- Apply only Item Name, Brand, and Size; run `validate_identity_copy()` before publishing output.
- Mechanical-only AUTO_APPROVED rows may export automatically; Brand changes and PACKED always require explicit approval.
- Bulk approval requires server-side meaningful filters and must reject any LOW-confidence match.
- Do not commit automatically.

---

### Task 1: Persist human decisions and calculate export eligibility

**Files:**
- Create: `api/migrations/versions/016_cleanup_row_approvals.py`
- Modify: `api/tools/item_combination_cleanup/models.py`
- Modify: `api/tools/item_combination_cleanup/service.py`
- Test: `tests/test_api_item_combination_cleanup.py`

**Interfaces:**
- Produces `is_export_eligible(row) -> bool`.
- Produces row fields `approval_status`, `reviewed_by`, and `reviewed_at`.

- [ ] **Step 1: Write failing eligibility tests**

```python
assert is_export_eligible(mechanical_name_normalization_row) is True
assert is_export_eligible(brand_change_auto_approved_row) is False
assert is_export_eligible(packed_auto_approved_row) is False
assert is_export_eligible(explicitly_approved_row) is True
```

- [ ] **Step 2: Run the focused test and verify it fails because the fields/helper are absent.**

Run: `.venv\\Scripts\\python.exe -m pytest tests/test_api_item_combination_cleanup.py -q`

- [ ] **Step 3: Add migration, ORM fields, response fields, and minimal eligibility helper.**

```python
def is_export_eligible(row):
    return row.approval_status == "APPROVED" or mechanical_only_auto_approval(row)
```

- [ ] **Step 4: Run focused tests and verify they pass.**

### Task 2: Add decision and guarded bulk-approval APIs

**Files:**
- Modify: `api/tools/item_combination_cleanup/schemas.py`
- Modify: `api/tools/item_combination_cleanup/router.py`
- Modify: `api/tools/item_combination_cleanup/service.py`
- Test: `tests/test_api_item_combination_cleanup.py`

**Interfaces:**
- Consumes `approval_status: Literal["APPROVED", "REJECTED"]` and current user.
- Produces row decisions and `{"updated": int}` bulk responses.

- [ ] **Step 1: Write failing API tests for individual approval/rejection, no-filter bulk rejection, LOW-filter bulk rejection, and matching filtered bulk approval.**

```python
response = client.post(f"{prefix}/runs/{run_id}/bulk-approval", json={"confidence": "LOW"})
assert response.status_code == 422
```

- [ ] **Step 2: Run those tests and verify endpoint absence/failure.**

- [ ] **Step 3: Implement Pydantic request models, server-side filter evaluation, and decision writes.**

```python
if not has_meaningful_filter(filters):
    raise CleanupServiceError("Bulk approval requires at least one filter.", 422)
if query.filter(Row.classification_confidence == "LOW").count():
    raise CleanupServiceError("LOW confidence rows cannot be bulk-approved.", 422)
```

- [ ] **Step 4: Reject reprocessing a run with any human decision, then rerun focused API tests.**

### Task 3: Generate a validated approved export

**Files:**
- Modify: `api/tools/item_combination_cleanup/workbook.py`
- Modify: `api/tools/item_combination_cleanup/service.py`
- Modify: `api/tools/item_combination_cleanup/router.py`
- Test: `tests/test_cleanup_workbook.py`
- Test: `tests/test_api_item_combination_cleanup.py`

**Interfaces:**
- Produces `export_approved_proposals(source, destination, approved_by_item_id)`.
- Produces `approved_output.xlsx` and an approved-download endpoint.

- [ ] **Step 1: Write failing workbook tests for approved Name/Brand/Size changes, unapproved exclusion, and protected-cell validation.**

```python
export_approved_proposals(source, output, {"1001": {"Brand": "PKG"}})
assert output_brand("1001") == "PKG"
assert output_rate("1001") == source_rate("1001")
```

- [ ] **Step 2: Run the workbook tests and verify they fail because the exporter is absent.**

- [ ] **Step 3: Copy source, map exact Item_Id cells, write only allowed values, validate with `validate_identity_copy`, and delete output on error.**

- [ ] **Step 4: Add endpoint tests proving only export-eligible rows are applied and approved download is unavailable before export.**

- [ ] **Step 5: Run the focused workbook/API tests and verify they pass.**

### Task 4: Add review and export controls to the internal UI

**Files:**
- Modify: `web/types/api.ts`
- Modify: `web/lib/api.ts`
- Modify: `web/app/(internal)/tools/item-combination-cleanup/page.tsx`

**Interfaces:**
- Consumes approval fields and API clients from Tasks 1–3.
- Produces individual review actions, filter-aware bulk approval, and approved-export download controls.

- [ ] **Step 1: Add TypeScript types and API functions for decision, bulk approval, approved export, and approved download.**
- [ ] **Step 2: Render separate deterministic and human-decision status, original → proposed field values, and evidence-aware row actions.**
- [ ] **Step 3: Add approval-state filters and a bulk-approve action disabled until a meaningful filter is present; display the count returned by the server.**
- [ ] **Step 4: Add approved-export/download controls without changing the identity-copy export controls.**
- [ ] **Step 5: Run `cd web; npm run build` and correct all type/build errors.**

### Task 5: Full regression and operational verification

**Files:**
- Modify only if tests reveal a scoped defect.

- [ ] **Step 1: Run all cleanup tests with workspace-scoped pytest temp files.**

Run: `.venv\\Scripts\\python.exe -m pytest tests/test_cleanup_normalize.py tests/test_cleanup_purchases.py tests/test_cleanup_classify.py tests/test_cleanup_workbook.py tests/test_api_item_combination_cleanup.py -q -p no:cacheprovider --basetemp D:\\projects\\axonflux\\_pytest_tmp_phase3`

- [ ] **Step 2: Run `cd web; npm run build`.**
- [ ] **Step 3: Inspect `git diff --check` and report changed files, test results, and the remaining intentional semantic limitations.**
