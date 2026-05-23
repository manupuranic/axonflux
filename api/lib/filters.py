"""Reusable filter primitives for list/export endpoints.

Two layers:

1. Low-level `Filter` dataclasses + `build_where()`: take SQL-native operators
   (>=, ILIKE, =) and produce a parameterized WHERE fragment + bind params.
2. High-level `FieldSpec` + `parse_conditions()`: each endpoint declares a
   public field allowlist. Clients send `cond=key:op:value` strings; the parser
   validates field key + op against the spec, maps to the safe SQL column,
   and returns Filter instances ready for `build_where`.

Why two layers: the low layer stays simple to test (pure functions, no
parsing). The high layer lets each endpoint expose exactly the fields/ops it
wants without leaking SQL column names to the wire.

Example
-------
    LAPSED_FIELDS: dict[str, FieldSpec] = {
        "visits":      FieldSpec("m.total_bills",           "number"),
        "days_silent": FieldSpec("m.days_since_last_visit", "number"),
        "spend":       FieldSpec("m.total_revenue",         "number"),
        "payment":     FieldSpec("m.preferred_payment",     "enum",
                                  allowed_values=("cash","card","upi","credit")),
    }

    filters = parse_conditions(request_conds, LAPSED_FIELDS)
    where_sql, bind = build_where(filters)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

# ──────────────────────────────────────────────────────────────────────────────
# Low-level filter dataclasses
# ──────────────────────────────────────────────────────────────────────────────

NumericOp = Literal[">=", "<=", ">", "<", "=", "!="]
StringOp = Literal["eq", "neq", "ilike", "contains", "ncontains", "startswith", "endswith"]
BoolOp = Literal["eq"]

_ALLOWED_NUMERIC_OPS: set[str] = {">=", "<=", ">", "<", "=", "!="}
_ALLOWED_STRING_OPS: set[str] = {"eq", "neq", "ilike", "contains", "ncontains", "startswith", "endswith"}


@dataclass(frozen=True)
class NumericFilter:
    column: str
    op: NumericOp
    value: float | int | None

    def is_active(self) -> bool:
        return self.value is not None


@dataclass(frozen=True)
class StringFilter:
    column: str
    op: StringOp
    value: str | None

    def is_active(self) -> bool:
        return self.value is not None and self.value.strip() != ""


@dataclass(frozen=True)
class BoolFilter:
    column: str
    value: bool | None

    def is_active(self) -> bool:
        return self.value is not None


@dataclass(frozen=True)
class EnumFilter:
    column: str
    value: str | None
    allowed: tuple[str, ...]

    def is_active(self) -> bool:
        return self.value is not None and self.value in self.allowed


Filter = NumericFilter | StringFilter | BoolFilter | EnumFilter


def _validate_column(column: str) -> None:
    # Safety net against typos in caller code that would land f-string fragments
    # in a query. Columns are author-supplied, never user input.
    if not column or any(c in column for c in [";", " ", "'", '"', "--", "/*"]):
        raise ValueError(f"unsafe column identifier: {column!r}")


def _placeholder(idx: int) -> str:
    return f"flt_p_{idx}"


def build_where(filters: list[Filter]) -> tuple[str, dict[str, Any]]:
    """Build a parameterized WHERE fragment.

    Returns (" AND <expr> AND <expr>...", params) or ("", {}) when nothing active.
    Caller is expected to append directly after an existing WHERE clause.
    """
    fragments: list[str] = []
    params: dict[str, Any] = {}

    for idx, f in enumerate(filters):
        if not f.is_active():
            continue
        _validate_column(f.column)
        ph = _placeholder(idx)

        if isinstance(f, NumericFilter):
            if f.op not in _ALLOWED_NUMERIC_OPS:
                raise ValueError(f"unsupported numeric op: {f.op!r}")
            fragments.append(f"{f.column} {f.op} :{ph}")
            params[ph] = f.value

        elif isinstance(f, StringFilter):
            if f.op not in _ALLOWED_STRING_OPS:
                raise ValueError(f"unsupported string op: {f.op!r}")
            if f.op == "eq":
                fragments.append(f"{f.column} = :{ph}")
                params[ph] = f.value
            elif f.op == "neq":
                fragments.append(f"{f.column} <> :{ph}")
                params[ph] = f.value
            elif f.op == "ilike":
                fragments.append(f"{f.column} ILIKE :{ph}")
                params[ph] = f.value
            elif f.op == "contains":
                fragments.append(f"{f.column} ILIKE :{ph}")
                params[ph] = f"%{f.value}%"
            elif f.op == "ncontains":
                fragments.append(f"({f.column} IS NULL OR {f.column} NOT ILIKE :{ph})")
                params[ph] = f"%{f.value}%"
            elif f.op == "startswith":
                fragments.append(f"{f.column} ILIKE :{ph}")
                params[ph] = f"{f.value}%"
            elif f.op == "endswith":
                fragments.append(f"{f.column} ILIKE :{ph}")
                params[ph] = f"%{f.value}"

        elif isinstance(f, BoolFilter):
            fragments.append(f"{f.column} = :{ph}")
            params[ph] = f.value

        elif isinstance(f, EnumFilter):
            fragments.append(f"{f.column} = :{ph}")
            params[ph] = f.value

    if not fragments:
        return "", {}

    return " AND " + " AND ".join(fragments), params


# ──────────────────────────────────────────────────────────────────────────────
# High-level FieldSpec + condition parser
# ──────────────────────────────────────────────────────────────────────────────

FieldType = Literal["number", "string", "bool", "enum"]

# Public (wire-format) operator → SQL operator.
# These alphabetic codes are URL-safe and stable, so we keep the wire format
# decoupled from the SQL dialect.
NUMERIC_OPS_PUBLIC: dict[str, str] = {
    "eq":  "=",
    "neq": "!=",
    "gt":  ">",
    "gte": ">=",
    "lt":  "<",
    "lte": "<=",
}

# String ops are already alphabetic in StringFilter; the wire codes match.
STRING_OPS_PUBLIC: tuple[str, ...] = (
    "eq", "neq", "contains", "ncontains", "startswith", "endswith",
)

BOOL_OPS_PUBLIC: tuple[str, ...] = ("eq",)
ENUM_OPS_PUBLIC: tuple[str, ...] = ("eq", "neq")

# Default op allowlist per type — endpoints can narrow but typically don't.
DEFAULT_OPS_BY_TYPE: dict[FieldType, tuple[str, ...]] = {
    "number": tuple(NUMERIC_OPS_PUBLIC.keys()),
    "string": STRING_OPS_PUBLIC,
    "bool":   BOOL_OPS_PUBLIC,
    "enum":   ENUM_OPS_PUBLIC,
}


@dataclass(frozen=True)
class FieldSpec:
    """Public filter field declaration. One entry per filterable column.

    `key` is the public name exposed to the client (e.g. "visits"). The SQL
    column stays internal to this struct so the wire format never leaks it.
    """
    column: str
    type: FieldType
    allowed_ops: tuple[str, ...] = ()
    allowed_values: tuple[str, ...] = ()  # only meaningful for type=="enum"

    def __post_init__(self):
        # If caller did not customize ops, fall back to the type's defaults.
        # frozen dataclass — use object.__setattr__ to fill default.
        if not self.allowed_ops:
            object.__setattr__(self, "allowed_ops", DEFAULT_OPS_BY_TYPE[self.type])


def _coerce_number(raw: str) -> float | int:
    """Parse a number string; prefer int when possible (cleaner SQL plans)."""
    try:
        return int(raw)
    except ValueError:
        return float(raw)


def _coerce_bool(raw: str) -> bool:
    if raw.lower() in ("true", "1", "yes"):
        return True
    if raw.lower() in ("false", "0", "no"):
        return False
    raise ValueError(f"unrecognised bool value: {raw!r}")


def parse_conditions(conds: list[str], spec: dict[str, FieldSpec]) -> list[Filter]:
    """Parse `cond=key:op:value` strings into validated Filter objects.

    Each string must be `<field_key>:<op>:<value>`. Value may contain colons
    (only the first two colons are delimiters). Empty list → no filters.

    Raises ValueError if:
      - the format is malformed
      - the field key is not in `spec`
      - the operator is not in the field's allowed_ops
      - the value cannot be coerced to the field's type
      - an enum value is not in allowed_values
    """
    out: list[Filter] = []
    for raw in conds:
        if not raw:
            continue
        # Split on first two colons only — values may contain colons themselves.
        parts = raw.split(":", 2)
        if len(parts) != 3:
            raise ValueError(f"malformed condition (need key:op:value): {raw!r}")
        key, op, value = parts

        field_spec = spec.get(key)
        if field_spec is None:
            raise ValueError(f"unknown filter field: {key!r}")
        if op not in field_spec.allowed_ops:
            raise ValueError(
                f"operator {op!r} not allowed for field {key!r} "
                f"(allowed: {field_spec.allowed_ops})"
            )

        if field_spec.type == "number":
            try:
                num_val = _coerce_number(value)
            except ValueError as exc:
                raise ValueError(f"invalid number for field {key!r}: {value!r}") from exc
            sql_op = NUMERIC_OPS_PUBLIC[op]
            out.append(NumericFilter(column=field_spec.column, op=sql_op, value=num_val))  # type: ignore[arg-type]

        elif field_spec.type == "string":
            out.append(StringFilter(column=field_spec.column, op=op, value=value))  # type: ignore[arg-type]

        elif field_spec.type == "bool":
            try:
                b_val = _coerce_bool(value)
            except ValueError as exc:
                raise ValueError(f"invalid bool for field {key!r}: {value!r}") from exc
            out.append(BoolFilter(column=field_spec.column, value=b_val))

        elif field_spec.type == "enum":
            if value not in field_spec.allowed_values:
                raise ValueError(
                    f"value {value!r} not allowed for enum field {key!r} "
                    f"(allowed: {field_spec.allowed_values})"
                )
            if op == "eq":
                out.append(EnumFilter(
                    column=field_spec.column,
                    value=value,
                    allowed=field_spec.allowed_values,
                ))
            elif op == "neq":
                # neq is "not equal" — model as StringFilter to avoid expanding
                # EnumFilter's responsibilities. Same parameterized SQL output.
                out.append(StringFilter(column=field_spec.column, op="neq", value=value))

    return out
