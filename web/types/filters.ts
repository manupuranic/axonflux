// Filter UI building blocks.
//
// A page declares an allowlist of fields (FilterFieldSpec[]) and holds an
// editable list of conditions (FilterCondition[]). The reusable
// <FilterBuilder/> component renders the conditions as rows; the page
// serializes them to wire format with `serializeConditions()` and sends them
// to the API as repeated `cond=<key>:<op>:<value>` query parameters.
//
// Wire format intentionally matches api.lib.filters.parse_conditions: the
// backend's spec dict is the source of truth on operator allowlists and
// type-validation; the frontend just mirrors a subset for UI affordances.

export type FieldType = "number" | "string" | "bool" | "enum";

export type NumericOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type StringOp = "eq" | "neq" | "contains" | "ncontains" | "startswith" | "endswith";
export type BoolOp = "eq";
export type EnumOp = "eq" | "neq";

export type FilterOp = NumericOp | StringOp | BoolOp | EnumOp;

export interface FilterFieldSpec {
  /** Public key sent to the API. Must match the backend spec. */
  key: string;
  /** Label shown in dropdowns + chips. */
  label: string;
  type: FieldType;
  /** Restrict operator menu. Defaults derive from type when omitted. */
  allowedOps?: FilterOp[];
  /** Required when type === "enum" — values the user can pick. */
  options?: { value: string; label: string }[];
  /** Optional unit suffix shown beside the value input, e.g. "days", "₹". */
  unit?: string;
  /** Optional input placeholder shown when the value is empty. */
  placeholder?: string;
}

export interface FilterCondition {
  /** Local-only id for React keys + targeted remove. Not sent to API. */
  id: string;
  key: string;
  op: FilterOp;
  value: string;
}

// ─── operator metadata ───────────────────────────────────────────────────────

const NUMERIC_OPS: { value: NumericOp; label: string }[] = [
  { value: "eq",  label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt",  label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt",  label: "<" },
  { value: "lte", label: "≤" },
];

const STRING_OPS: { value: StringOp; label: string }[] = [
  { value: "contains",   label: "contains" },
  { value: "ncontains",  label: "doesn’t contain" },
  { value: "eq",         label: "equals" },
  { value: "neq",        label: "not equal" },
  { value: "startswith", label: "starts with" },
  { value: "endswith",   label: "ends with" },
];

const BOOL_OPS: { value: BoolOp; label: string }[] = [
  { value: "eq", label: "is" },
];

const ENUM_OPS: { value: EnumOp; label: string }[] = [
  { value: "eq",  label: "is" },
  { value: "neq", label: "is not" },
];

export function opsForType(type: FieldType): { value: FilterOp; label: string }[] {
  switch (type) {
    case "number": return NUMERIC_OPS;
    case "string": return STRING_OPS;
    case "bool":   return BOOL_OPS;
    case "enum":   return ENUM_OPS;
  }
}

export function opsForField(field: FilterFieldSpec): { value: FilterOp; label: string }[] {
  const all = opsForType(field.type);
  if (!field.allowedOps?.length) return all;
  const allowed = new Set<string>(field.allowedOps);
  return all.filter((o) => allowed.has(o.value));
}

export function defaultOpForField(field: FilterFieldSpec): FilterOp {
  return opsForField(field)[0].value;
}

// ─── serialization + validity ────────────────────────────────────────────────

/** True when the condition has a non-empty value (eligible for the API). */
export function isConditionActive(c: FilterCondition): boolean {
  return c.value !== undefined && c.value !== null && String(c.value).trim() !== "";
}

/** Encode active conditions as `key:op:value` strings — matches backend wire format. */
export function serializeConditions(conds: FilterCondition[]): string[] {
  return conds
    .filter(isConditionActive)
    .map((c) => `${c.key}:${c.op}:${c.value}`);
}

/** Stable id for new conditions. Crypto.randomUUID is fine for client-only state. */
export function newConditionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a fresh condition for a given field with sensible defaults. */
export function newCondition(field: FilterFieldSpec): FilterCondition {
  let value = "";
  if (field.type === "enum" && field.options?.length) value = field.options[0].value;
  if (field.type === "bool") value = "true";
  return {
    id: newConditionId(),
    key: field.key,
    op: defaultOpForField(field),
    value,
  };
}
