# Filter Infrastructure

Cross-table filtering with per-field operators, type-safe serialization, and SQL-injection-proof query building. Shared by every list/export endpoint that needs richer slicing than a fixed query-param triplet.

## Why this exists

Each table in AxonFlux (Customer Activity, Product Health, Replenishment, Pamphlets, BOM, Entity Resolution, etc.) needs different filter columns. A bespoke `?min_visits=`/`?max_days_silent=` triplet per endpoint:
- locks the operator (always `>=` / `<=`) instead of letting the user choose
- doesn't compose (no way to express `spend > 1000 AND spend < 5000`)
- duplicates UI for every page (3 inputs there, 4 here, all bespoke)

The infrastructure solves all three: client picks operator per row, multiple conditions on the same column are first-class, and one UI component renders every table's filter bar.

## End-to-end flow

```
User picks "Visits ≥ 4" in FilterBuilder
        │
        ▼  serializeConditions() → ["visits:gte:4"]
        │
        ▼  GET /api/customers/lapsed?cond=visits%3Agte%3A4
        │
        ▼  parse_conditions(["visits:gte:4"], LAPSED_FIELDS)
        │      validates key in spec, op in allowed_ops, value type-coerces
        ▼
        ▼  build_where([NumericFilter("m.total_bills", ">=", 4)])
        ▼  → (" AND m.total_bills >= :flt_p_0", {"flt_p_0": 4})
        ▼
        ▼  conn.execute(text(f"... {filter_sql} ..."), {**filter_params, ...})
```

Three guarantees by construction:
1. Column names never appear on the wire — clients send public keys (`visits`), backend maps to safe columns (`m.total_bills`).
2. Operators are validated against an allowlist per field type — `?cond=visits:ncontains:4` returns 400, not SQL.
3. All values land in parameterized bind params — no string concatenation ever touches user input.

## Two layers

### Layer 1 — Low-level Filter dataclasses + `build_where()`
*File: `api/lib/filters.py`*

Filter primitives (`NumericFilter`, `StringFilter`, `BoolFilter`, `EnumFilter`) take SQL-native operators and produce a parameterized WHERE fragment. Pure, no I/O, fully unit-tested.

```python
from api.lib.filters import NumericFilter, build_where

where_sql, params = build_where([
    NumericFilter(column="m.total_bills", op=">=", value=4),
    NumericFilter(column="m.total_revenue", op=">=", value=2000),
])
# where_sql = " AND m.total_bills >= :flt_p_0 AND m.total_revenue >= :flt_p_1"
# params    = {"flt_p_0": 4, "flt_p_1": 2000}
```

Inactive filters (value=None or empty string) are skipped; placeholder indices come from `enumerate()` so two endpoints can't collide.

`_validate_column()` rejects identifiers containing `;`, `'`, `"`, `--`, `/* */`, spaces, or empties — a safety net against typos in author code that would land f-string fragments in SQL.

### Layer 2 — `FieldSpec` + `parse_conditions()`
*File: `api/lib/filters.py`*

Each endpoint declares a `dict[str, FieldSpec]` mapping public keys to (column, type, allowed_ops). `parse_conditions()` takes raw `cond=key:op:value` strings from the request and returns ready-to-use Filter objects.

```python
LAPSED_FIELDS: dict[str, FieldSpec] = {
    "visits":      FieldSpec(column="m.total_bills",            type="number"),
    "days_silent": FieldSpec(column="m.days_since_last_visit",  type="number"),
    "spend":       FieldSpec(column="m.total_revenue",          type="number"),
    "name":        FieldSpec(column="d.display_name",           type="string"),
    "is_member":   FieldSpec(column="d.is_member",              type="bool"),
    "payment":     FieldSpec(
        column="m.preferred_payment",
        type="enum",
        allowed_values=("cash", "card", "upi", "credit"),
    ),
}

filters = parse_conditions(request.cond, LAPSED_FIELDS)
where_sql, params = build_where(filters)
```

`FieldSpec.allowed_ops` defaults to the type's full op set; endpoints can narrow it (e.g. restrict a field to `("eq",)`).

## Wire format

`?cond=<key>:<op>:<value>` repeated for each condition.

```
GET /api/customers/lapsed?cond=visits:gte:4&cond=spend:gte:2000&cond=is_member:eq:true
```

Why repeated query params instead of JSON body:
- GET stays GET. URL is bookmarkable, browser back/forward works.
- FastAPI's auto-generated docs render `cond: list[str]` natively.
- Values containing `:` work via `split(":", 2)` — only first two colons are delimiters.

## Public operator vocabulary

URL-safe, alphabetic, dialect-agnostic. The mapping to SQL lives in `NUMERIC_OPS_PUBLIC`:

| Type | Operators |
|---|---|
| `number` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` |
| `string` | `eq`, `neq`, `contains`, `ncontains`, `startswith`, `endswith` |
| `bool` | `eq` |
| `enum` | `eq`, `neq` |

`ncontains` ("doesn't contain") is NULL-safe: `(col IS NULL OR col NOT ILIKE :p)`. Without the NULL guard, rows with NULL values get dropped because `NOT ILIKE` returns unknown, which Postgres treats as falsy.

## Frontend pieces

### `web/types/filters.ts`
- `FilterFieldSpec` — the page-level allowlist entry (key, label, type, options, unit, placeholder, optional `allowedOps` override)
- `FilterCondition` — a single editable row `{id, key, op, value}` (id is local-only for React keys)
- `serializeConditions(conds)` — builds the wire-format `["key:op:value", …]` array; drops inactive (empty-value) rows
- `opsForField(field)` — returns the operator menu items for a given field, filtered by `allowedOps`
- `newCondition(field)` — factory with sensible defaults per type

### `web/components/shared/FilterBuilder.tsx`
Notion/Linear-style row builder. Each condition is `[field ▾] [op ▾] [value] [×]`. "Add filter" reveals a chip-row of fields to pick from. Apply commits the draft to the parent; Clear empties.

Draft state lives **inside** the component — typing doesn't trigger a refetch until Apply is clicked. Prevents per-keystroke pagination thrash, gives the user a clean "I'm done editing" signal.

### `web/lib/api.ts`
`buildQuery` now expands array values to repeated keys: `{cond: ["a","b"]}` → `?cond=a&cond=b`. Backward-compatible — scalars still emit one key.

## Adding a filter to a new table

Two diffs, mirror images.

**Backend** — define the spec dict next to the endpoint:
```python
PRODUCT_HEALTH_FIELDS: dict[str, FieldSpec] = {
    "demand":   FieldSpec(column="ph.predicted_daily_demand", type="number"),
    "name":     FieldSpec(column="d.product_name",            type="string"),
    "signal":   FieldSpec(
        column="ph.signal_type",
        type="enum",
        allowed_values=("fast", "slow", "dead", "spike"),
    ),
}

@router.get("/health-signals")
def list_health(cond: list[str] = Query(default_factory=list), ...):
    filters = parse_conditions(cond, PRODUCT_HEALTH_FIELDS)
    where_sql, params = build_where(filters)
    # ... use {**params, ...} in conn.execute()
```

**Frontend** — mirror the spec next to the page:
```tsx
const PRODUCT_FIELDS: FilterFieldSpec[] = [
  { key: "demand", label: "Demand", type: "number" },
  { key: "name",   label: "Name",   type: "string" },
  { key: "signal", label: "Signal", type: "enum",
    options: [
      { value: "fast",  label: "Fast" },
      { value: "slow",  label: "Slow" },
      { value: "dead",  label: "Dead" },
      { value: "spike", label: "Spike" },
    ],
  },
];

<FilterBuilder fields={PRODUCT_FIELDS} value={conds} onApply={setConds} />
```

Done. The component renders rows; the page reads `serializeConditions(conds)` to send to the API.

## Security model

The backend is the source of truth. Three checks happen in `parse_conditions`:
1. **Key must be in the spec dict.** Unknown keys → 400.
2. **Operator must be in `field.allowed_ops`.** Disallowed op → 400.
3. **Value must coerce to the field's type.** Bad number/bool/enum → 400.

A malicious client crafting `?cond=spend; DROP TABLE--:gte:1` fails at parse: there's no `cond=spend; DROP TABLE--` key in the spec. Even if it parsed, the column wouldn't pass `_validate_column`. Even if it passed, the value `1` would land in a bind param, not a string-concatenated query.

The frontend's `FilterFieldSpec` is a UI-affordance allowlist only — it shapes which inputs appear, never what the backend accepts. Adding a field on the frontend without adding it server-side returns 400 on apply.

## Test coverage

`tests/test_filters.py` — 53 unit tests covering:
- Activity predicates (is_active for None/empty/zero edge cases per type)
- `build_where` placeholder generation, op SQL mapping, multi-filter joining, inactive skipping
- All string ops including `ncontains` NULL guard
- Column-safety guard (rejects `;`, quotes, comments, spaces)
- `parse_conditions` happy paths + every rejection path (unknown field, disallowed op, bad value, malformed)
- End-to-end roundtrip: `parse_conditions → build_where` for a realistic 4-condition query

Run: `python -m pytest tests/test_filters.py -v`

## First consumer

Customer Activity (`/customers/lapsed`) — 8 filterable fields (visits, days_silent, spend, avg_bill, name, mobile, is_member, payment). Export and list endpoints share the same parsed filter list, guaranteeing WYSIWYG export.

## Files

| Layer | Path |
|---|---|
| Backend infra | `api/lib/filters.py` |
| Backend tests | `tests/test_filters.py` |
| Backend wiring (first consumer) | `api/routers/customers.py` (LAPSED_FIELDS + list + export) |
| Frontend infra | `web/types/filters.ts`, `web/components/shared/FilterBuilder.tsx` |
| Frontend query builder | `web/lib/api.ts` (buildQuery array handling) |
| Frontend wiring (first consumer) | `web/app/(internal)/customers/lapsed/page.tsx` |
