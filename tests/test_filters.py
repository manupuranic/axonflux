"""Unit tests for api.lib.filters — pure, no DB."""

import pytest

from api.lib.filters import (
    BoolFilter,
    EnumFilter,
    FieldSpec,
    NumericFilter,
    StringFilter,
    build_where,
    parse_conditions,
)


class TestNumericFilter:
    def test_inactive_when_value_none(self):
        f = NumericFilter(column="m.total_bills", op=">=", value=None)
        assert not f.is_active()

    def test_active_when_value_zero(self):
        # Zero is a valid filter target (e.g. min_spend=0), only None deactivates.
        f = NumericFilter(column="m.total_bills", op=">=", value=0)
        assert f.is_active()

    def test_active_when_value_positive(self):
        f = NumericFilter(column="m.total_bills", op=">=", value=4)
        assert f.is_active()


class TestStringFilter:
    def test_inactive_when_value_none(self):
        f = StringFilter(column="d.display_name", op="contains", value=None)
        assert not f.is_active()

    def test_inactive_when_value_empty(self):
        f = StringFilter(column="d.display_name", op="contains", value="")
        assert not f.is_active()

    def test_inactive_when_value_whitespace(self):
        f = StringFilter(column="d.display_name", op="contains", value="   ")
        assert not f.is_active()

    def test_active_when_value_present(self):
        f = StringFilter(column="d.display_name", op="contains", value="raj")
        assert f.is_active()


class TestEnumFilter:
    def test_inactive_when_value_none(self):
        f = EnumFilter(column="t.tier", value=None, allowed=("active", "lost"))
        assert not f.is_active()

    def test_inactive_when_value_not_in_allowed(self):
        f = EnumFilter(column="t.tier", value="bogus", allowed=("active", "lost"))
        assert not f.is_active()

    def test_active_when_value_in_allowed(self):
        f = EnumFilter(column="t.tier", value="active", allowed=("active", "lost"))
        assert f.is_active()


class TestBuildWhereEmpty:
    def test_no_filters(self):
        sql, params = build_where([])
        assert sql == ""
        assert params == {}

    def test_all_filters_inactive(self):
        sql, params = build_where([
            NumericFilter(column="m.total_bills", op=">=", value=None),
            StringFilter(column="d.display_name", op="contains", value=""),
            BoolFilter(column="d.is_member", value=None),
        ])
        assert sql == ""
        assert params == {}


class TestBuildWhereNumeric:
    def test_single_numeric_filter(self):
        sql, params = build_where([
            NumericFilter(column="m.total_bills", op=">=", value=4),
        ])
        assert sql == " AND m.total_bills >= :flt_p_0"
        assert params == {"flt_p_0": 4}

    def test_multiple_numeric_filters_joined_by_and(self):
        sql, params = build_where([
            NumericFilter(column="m.total_bills",          op=">=", value=4),
            NumericFilter(column="m.days_since_last_visit", op="<=", value=365),
            NumericFilter(column="m.total_revenue",         op=">=", value=2000),
        ])
        assert sql == (
            " AND m.total_bills >= :flt_p_0"
            " AND m.days_since_last_visit <= :flt_p_1"
            " AND m.total_revenue >= :flt_p_2"
        )
        assert params == {"flt_p_0": 4, "flt_p_1": 365, "flt_p_2": 2000}

    def test_skips_inactive_preserves_indices(self):
        sql, params = build_where([
            NumericFilter(column="m.total_bills", op=">=", value=None),
            NumericFilter(column="m.total_revenue", op=">=", value=2000),
        ])
        assert sql == " AND m.total_revenue >= :flt_p_1"
        assert params == {"flt_p_1": 2000}

    def test_rejects_unknown_op(self):
        with pytest.raises(ValueError, match="unsupported numeric op"):
            build_where([
                NumericFilter(column="m.total_bills", op="LIKE", value=4),  # type: ignore[arg-type]
            ])


class TestBuildWhereString:
    def test_eq(self):
        sql, params = build_where([
            StringFilter(column="m.preferred_payment", op="eq", value="cash"),
        ])
        assert sql == " AND m.preferred_payment = :flt_p_0"
        assert params == {"flt_p_0": "cash"}

    def test_ilike_passes_through(self):
        sql, params = build_where([
            StringFilter(column="d.display_name", op="ilike", value="raj%"),
        ])
        assert sql == " AND d.display_name ILIKE :flt_p_0"
        assert params == {"flt_p_0": "raj%"}

    def test_contains_wraps_with_percent(self):
        sql, params = build_where([
            StringFilter(column="d.display_name", op="contains", value="raj"),
        ])
        assert sql == " AND d.display_name ILIKE :flt_p_0"
        assert params == {"flt_p_0": "%raj%"}


class TestBuildWhereBoolEnum:
    def test_bool_true(self):
        sql, params = build_where([BoolFilter(column="d.is_member", value=True)])
        assert sql == " AND d.is_member = :flt_p_0"
        assert params == {"flt_p_0": True}

    def test_bool_false(self):
        # False is a valid filter (e.g. "non-members only"), unlike None.
        sql, params = build_where([BoolFilter(column="d.is_member", value=False)])
        assert sql == " AND d.is_member = :flt_p_0"
        assert params == {"flt_p_0": False}

    def test_enum_only_allowed_value_emits_sql(self):
        sql, params = build_where([
            EnumFilter(column="t.tier", value="active", allowed=("active", "lost")),
        ])
        assert sql == " AND t.tier = :flt_p_0"
        assert params == {"flt_p_0": "active"}


class TestBuildWhereStringExtraOps:
    def test_neq(self):
        sql, params = build_where([
            StringFilter(column="m.preferred_payment", op="neq", value="cash"),
        ])
        assert sql == " AND m.preferred_payment <> :flt_p_0"
        assert params == {"flt_p_0": "cash"}

    def test_ncontains_wraps_with_percent_and_nullable_guard(self):
        # NOT ILIKE returns NULL when column is NULL, which Postgres treats as
        # "unknown" and drops from the result. We want "this row doesn't match"
        # to include NULLs (a customer with NULL name shouldn't be filtered out
        # by a 'name doesn't contain X' filter).
        sql, params = build_where([
            StringFilter(column="d.display_name", op="ncontains", value="raj"),
        ])
        assert sql == " AND (d.display_name IS NULL OR d.display_name NOT ILIKE :flt_p_0)"
        assert params == {"flt_p_0": "%raj%"}

    def test_startswith(self):
        sql, params = build_where([
            StringFilter(column="d.display_name", op="startswith", value="raj"),
        ])
        assert sql == " AND d.display_name ILIKE :flt_p_0"
        assert params == {"flt_p_0": "raj%"}

    def test_endswith(self):
        sql, params = build_where([
            StringFilter(column="d.display_name", op="endswith", value="raj"),
        ])
        assert sql == " AND d.display_name ILIKE :flt_p_0"
        assert params == {"flt_p_0": "%raj"}


class TestColumnSafety:
    @pytest.mark.parametrize("bad_col", [
        "m.total_bills; DROP TABLE users",
        "m.total_bills --",
        "m.total_bills /* comment */",
        "m.col'",
        "m.col\"",
        "m.total bills",  # space
        "",
    ])
    def test_rejects_unsafe_column_identifier(self, bad_col):
        with pytest.raises(ValueError, match="unsafe column identifier"):
            build_where([NumericFilter(column=bad_col, op=">=", value=1)])

    def test_accepts_simple_table_qualified_column(self):
        sql, params = build_where([
            NumericFilter(column="m.total_bills", op=">=", value=1),
        ])
        assert "m.total_bills" in sql
        assert params == {"flt_p_0": 1}


# ──────────────────────────────────────────────────────────────────────────────
# High-level parse_conditions
# ──────────────────────────────────────────────────────────────────────────────


LAPSED_FIELDS: dict[str, FieldSpec] = {
    "visits":      FieldSpec(column="m.total_bills",           type="number"),
    "days_silent": FieldSpec(column="m.days_since_last_visit", type="number"),
    "spend":       FieldSpec(column="m.total_revenue",         type="number"),
    "name":        FieldSpec(column="d.display_name",          type="string"),
    "is_member":   FieldSpec(column="d.is_member",             type="bool"),
    "payment":     FieldSpec(
        column="m.preferred_payment",
        type="enum",
        allowed_values=("cash", "card", "upi", "credit"),
    ),
}


class TestParseConditionsEmpty:
    def test_empty_list(self):
        assert parse_conditions([], LAPSED_FIELDS) == []

    def test_skips_empty_string(self):
        assert parse_conditions(["", ""], LAPSED_FIELDS) == []


class TestParseConditionsNumeric:
    def test_single_gte(self):
        out = parse_conditions(["visits:gte:4"], LAPSED_FIELDS)
        assert out == [NumericFilter(column="m.total_bills", op=">=", value=4)]

    def test_translates_all_numeric_ops(self):
        ops_to_sql = {"eq": "=", "neq": "!=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
        for public, sql_op in ops_to_sql.items():
            out = parse_conditions([f"visits:{public}:5"], LAPSED_FIELDS)
            assert out[0].op == sql_op, f"{public} should map to {sql_op}"

    def test_coerces_int_when_possible(self):
        out = parse_conditions(["visits:gte:4"], LAPSED_FIELDS)
        assert isinstance(out[0].value, int)
        assert out[0].value == 4

    def test_coerces_float_when_decimal(self):
        out = parse_conditions(["spend:gte:2000.5"], LAPSED_FIELDS)
        assert isinstance(out[0].value, float)
        assert out[0].value == 2000.5

    def test_rejects_non_numeric(self):
        with pytest.raises(ValueError, match="invalid number"):
            parse_conditions(["visits:gte:abc"], LAPSED_FIELDS)


class TestParseConditionsString:
    def test_contains(self):
        out = parse_conditions(["name:contains:raj"], LAPSED_FIELDS)
        assert out == [StringFilter(column="d.display_name", op="contains", value="raj")]

    def test_value_may_contain_colon(self):
        # Only first two colons are delimiters; values like "raj:1" preserved.
        out = parse_conditions(["name:eq:raj:1"], LAPSED_FIELDS)
        assert out[0].value == "raj:1"


class TestParseConditionsBool:
    def test_true(self):
        out = parse_conditions(["is_member:eq:true"], LAPSED_FIELDS)
        assert out == [BoolFilter(column="d.is_member", value=True)]

    def test_false_alias_zero(self):
        out = parse_conditions(["is_member:eq:0"], LAPSED_FIELDS)
        assert out == [BoolFilter(column="d.is_member", value=False)]

    def test_rejects_garbage(self):
        with pytest.raises(ValueError, match="invalid bool"):
            parse_conditions(["is_member:eq:maybe"], LAPSED_FIELDS)


class TestParseConditionsEnum:
    def test_eq(self):
        out = parse_conditions(["payment:eq:cash"], LAPSED_FIELDS)
        assert isinstance(out[0], EnumFilter)
        assert out[0].column == "m.preferred_payment"
        assert out[0].value == "cash"

    def test_neq_models_as_string_filter(self):
        out = parse_conditions(["payment:neq:cash"], LAPSED_FIELDS)
        assert isinstance(out[0], StringFilter)
        assert out[0].op == "neq"
        assert out[0].value == "cash"

    def test_rejects_value_not_in_allowed(self):
        with pytest.raises(ValueError, match="not allowed for enum field"):
            parse_conditions(["payment:eq:bitcoin"], LAPSED_FIELDS)


class TestParseConditionsValidation:
    def test_rejects_unknown_field(self):
        with pytest.raises(ValueError, match="unknown filter field"):
            parse_conditions(["bogus:gte:1"], LAPSED_FIELDS)

    def test_rejects_disallowed_op(self):
        # ncontains isn't in number's allowed_ops.
        with pytest.raises(ValueError, match="not allowed for field"):
            parse_conditions(["visits:ncontains:4"], LAPSED_FIELDS)

    def test_rejects_malformed(self):
        with pytest.raises(ValueError, match="malformed condition"):
            parse_conditions(["visits-gte-4"], LAPSED_FIELDS)


class TestParseConditionsRoundTrip:
    def test_multiple_conditions_compose_with_build_where(self):
        conds = [
            "visits:gte:4",
            "days_silent:lte:365",
            "spend:gte:2000",
            "is_member:eq:true",
        ]
        filters = parse_conditions(conds, LAPSED_FIELDS)
        sql, params = build_where(filters)
        # Every filter should appear with the correct SQL operator.
        assert "m.total_bills >= :flt_p_0" in sql
        assert "m.days_since_last_visit <= :flt_p_1" in sql
        assert "m.total_revenue >= :flt_p_2" in sql
        assert "d.is_member = :flt_p_3" in sql
        assert params == {
            "flt_p_0": 4,
            "flt_p_1": 365,
            "flt_p_2": 2000,
            "flt_p_3": True,
        }
