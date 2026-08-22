from datetime import date
from decimal import Decimal

from api.tools.item_combination_cleanup.purchases import (
    PurchaseIndex,
    barcode_key,
    barcode_identity_is_safe,
    mrp_key,
    parse_purchase_date,
)


def _index_with(*rows) -> PurchaseIndex:
    index = PurchaseIndex()
    for row in rows:
        index.add(**row)
    index.finalize()
    return index


def test_parse_slash_and_dash_dates():
    assert parse_purchase_date("12/07/2026") == date(2026, 7, 12)
    assert parse_purchase_date("12-07-2026") == date(2026, 7, 12)


def test_latest_supplier_wins_not_lexical():
    index = _index_with(
        dict(
            barcode="BC1",
            mrp=Decimal("10"),
            supplier="OLD CO",
            purchase_date=date(2025, 12, 31),
            purchase_id="1",
            invoice_no="A",
            source_file="a.xlsx",
        ),
        dict(
            barcode="BC1",
            mrp=Decimal("10"),
            supplier="NEW CO",
            purchase_date=date(2026, 1, 2),
            purchase_id="2",
            invoice_no="B",
            source_file="b.xlsx",
        ),
    )
    hit = index.lookup("BC1", Decimal("10.0000"))
    assert hit is not None
    assert hit.supplier_name == "NEW CO"
    assert hit.match_method == "barcode_mrp"
    assert hit.purchase_date == date(2026, 1, 2)


def test_barcode_mrp_preferred_over_barcode_fallback():
    index = _index_with(
        dict(
            barcode="BC2",
            mrp=Decimal("55"),
            supplier="MATCHED",
            purchase_date=date(2026, 1, 1),
            purchase_id="1",
            invoice_no="A",
            source_file="a.xlsx",
        ),
        dict(
            barcode="BC2",
            mrp=Decimal("49"),
            supplier="OTHER MRP",
            purchase_date=date(2026, 6, 1),
            purchase_id="2",
            invoice_no="B",
            source_file="b.xlsx",
        ),
    )
    hit = index.lookup("BC2", Decimal("55"))
    assert hit is not None
    assert hit.supplier_name == "MATCHED"
    assert hit.match_method == "barcode_mrp"


def test_mrp_mismatch_falls_back_to_barcode():
    index = _index_with(
        dict(
            barcode="BC3",
            mrp=Decimal("10"),
            supplier="SNACK SUPPLIER",
            purchase_date=date(2026, 2, 5),
            purchase_id="1",
            invoice_no="A",
            source_file="a.xlsx",
        ),
    )
    hit = index.lookup("BC3", Decimal("99"))
    assert hit is not None
    assert hit.match_method == "barcode"
    assert hit.supplier_name == "SNACK SUPPLIER"


def test_multiple_suppliers_latest_still_clear():
    index = _index_with(
        dict(
            barcode="BC4",
            mrp=Decimal("20"),
            supplier="FIRST",
            purchase_date=date(2026, 1, 1),
            purchase_id="1",
            invoice_no="A",
            source_file="a.xlsx",
        ),
        dict(
            barcode="BC4",
            mrp=Decimal("20"),
            supplier="SECOND",
            purchase_date=date(2026, 3, 1),
            purchase_id="2",
            invoice_no="B",
            source_file="b.xlsx",
        ),
    )
    hit = index.lookup("BC4", Decimal("20"))
    assert hit is not None
    assert hit.supplier_name == "SECOND"
    assert hit.supplier_count == 2


def test_barcode_keys_and_mrp_keys():
    assert barcode_key(8900000000001) == "8900000000001"
    assert mrp_key("55.0") == Decimal("55.0000")


def test_abc_only_purchase_history_has_no_supplier_evidence():
    index = _index_with(
        dict(
            barcode="ABC_ONLY",
            mrp=Decimal("10"),
            supplier="ABC",
            purchase_date=date(2026, 1, 1),
            purchase_id="1",
            invoice_no="A",
            source_file="a.xlsx",
        ),
    )

    assert index.lookup("ABC_ONLY", Decimal("10")) is None


def test_abc_plus_one_real_supplier_uses_only_the_real_supplier():
    index = _index_with(
        dict(
            barcode="ABC_REAL",
            mrp=Decimal("10"),
            supplier="ABC",
            purchase_date=date(2026, 2, 1),
            purchase_id="1",
            invoice_no="A",
            source_file="a.xlsx",
        ),
        dict(
            barcode="ABC_REAL",
            mrp=Decimal("10"),
            supplier="REAL SUPPLIER",
            purchase_date=date(2026, 1, 1),
            purchase_id="2",
            invoice_no="B",
            source_file="b.xlsx",
        ),
    )

    hit = index.lookup("ABC_REAL", Decimal("10"))
    assert hit is not None
    assert hit.supplier_name == "REAL SUPPLIER"
    assert hit.supplier_count == 1


def test_identity_safety_rejects_material_raw_name_or_pack_variants():
    assert barcode_identity_is_safe(
        purchase_names=["NEEM HONEY 1LTR", "NEEM HONEY 1KG"],
        purchase_sizes=[],
        item_names=["NEEM HONEY 1KG"],
        item_sizes=[],
    ) is False


def test_identity_safety_allows_duplicate_item_ids_with_same_identity_text():
    assert barcode_identity_is_safe(
        purchase_names=["ALMOND ROSE SOAP 125GM"],
        purchase_sizes=[],
        item_names=["ALMOND ROSE SOAP 125GM", "ALMOND ROSE SOAP 125GM"],
        item_sizes=[],
    ) is True
