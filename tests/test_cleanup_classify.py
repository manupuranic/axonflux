from datetime import date

from api.tools.item_combination_cleanup.classify import build_loose_anchors, classify
from api.tools.item_combination_cleanup.normalize import (
    detect_external_brand_marker,
    propose_name_and_size,
)
from api.tools.item_combination_cleanup.purchases import PurchaseHit


def _hit(method: str, supplier: str = "SRI BALAJI TRADERS", suppliers: int = 1) -> PurchaseHit:
    return PurchaseHit(
        supplier_name=supplier,
        purchase_date=date(2026, 7, 12),
        purchase_id="PO-1",
        invoice_no="INV-1",
        source_file_name="purchases.xlsx",
        match_method=method,
        supplier_count=suppliers,
    )


def test_same_loose_with_purchase():
    result = classify(
        normalized_name="SAME LOOSE",
        original_brand=None,
        purchase=_hit("barcode_mrp"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "LOOSE"
    assert result.proposed_brand == "SRI BALAJI TRADERS"
    assert result.confidence == "HIGH"
    assert result.review_status == "AUTO_APPROVED"


def test_loose_without_purchase_needs_review():
    result = classify(
        normalized_name="RICE LOOSE",
        original_brand="KEEPME",
        purchase=None,
        barcode_mrp_item_id_count=0,
        loose_anchors={},
    )
    assert result.product_type == "LOOSE"
    assert result.proposed_brand == "KEEPME"
    assert result.keep_original_brand is True
    assert result.review_status == "NEEDS_REVIEW"


def test_loose_wins_over_phm():
    result = classify(
        normalized_name="TOOR DAL LOOSE (PHM)",
        original_brand=None,
        purchase=_hit("barcode_mrp"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "LOOSE"
    assert result.evidence["has_phm_marker"] is True
    assert result.proposed_brand == "SRI BALAJI TRADERS"


def test_purchased_item():
    result = classify(
        normalized_name="ADUKALE NIPPATTU",
        original_brand=None,
        purchase=_hit("barcode_mrp", "ADUKALE FOODS"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.proposed_brand == "ADUKALE FOODS"
    assert result.confidence == "HIGH"


def test_brand_pkg_with_purchase_is_not_packed():
    result = classify(
        normalized_name="SUNFLOWER OIL 1L",
        original_brand="PKG",
        purchase=_hit("barcode_mrp", "OIL DISTRIBUTORS"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.proposed_brand == "OIL DISTRIBUTORS"


def test_phm_finished_good_purchase_is_not_manufactured():
    result = classify(
        normalized_name="WHEAT FLOUR (PHM) 1KG",
        original_brand=None,
        purchase=_hit("barcode_mrp", "EXTERNAL MILLERS"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.proposed_brand != "PHM"
    assert result.evidence["has_phm_marker"] is True


def test_packed_from_exact_loose_base():
    name = propose_name_and_size("SAME 1KG", None).proposed_name
    anchors = build_loose_anchors([
        ("1001", "ICC2_SAME_LOOSE", "SAME LOOSE", True),
    ])
    result = classify(
        normalized_name=name,
        original_brand="PKG",
        purchase=None,
        barcode_mrp_item_id_count=0,
        loose_anchors=anchors,
    )
    assert result.product_type == "PACKED"
    assert result.proposed_brand == "PKG"
    assert result.confidence == "HIGH"
    assert result.review_status == "NEEDS_REVIEW"


def test_packed_external_brand_marker_is_medium_and_keeps_evidence():
    anchors = build_loose_anchors([
        ("1001", "ICC2_AMLA_LOOSE", "AMLA POWDER LOOSE", True),
    ])
    result = classify(
        normalized_name="AMLA POWDER (FOUR SEASONS) 100G",
        original_brand=None,
        purchase=None,
        barcode_mrp_item_id_count=0,
        loose_anchors=anchors,
    )
    assert result.product_type == "PACKED"
    assert result.proposed_brand == "PKG"
    assert result.confidence == "MEDIUM"
    assert result.review_status == "NEEDS_REVIEW"
    assert result.evidence["has_external_brand_signal"] is True
    assert result.evidence["external_brand_candidates"] == ["FOUR SEASONS"]
    assert result.evidence["source_loose_item_id"] == "1001"
    assert result.evidence["source_loose_purchase_exists"] is True
    assert result.evidence["base_name_match"] == "exact"


def test_phm_parenthetical_is_not_an_external_brand_marker():
    evidence = detect_external_brand_marker("SAME 1KG (PHM)")
    assert evidence.has_external_brand_signal is False
    assert evidence.brand_candidates == ()

    anchors = build_loose_anchors([
        ("1001", "ICC2_SAME_LOOSE", "SAME LOOSE", True),
    ])
    result = classify(
        normalized_name="SAME 1KG (PHM)",
        original_brand=None,
        purchase=None,
        barcode_mrp_item_id_count=0,
        loose_anchors=anchors,
    )
    assert result.product_type == "PACKED"
    assert result.confidence == "HIGH"
    assert result.evidence["has_external_brand_signal"] is False


def test_packed_with_external_marker_on_loose_source_is_medium():
    anchors = build_loose_anchors([
        ("1001", "ICC2_SAME_LOOSE", "SAME (EXTERNAL) LOOSE", True),
    ])
    result = classify(
        normalized_name="SAME 1KG",
        original_brand=None,
        purchase=None,
        barcode_mrp_item_id_count=0,
        loose_anchors=anchors,
    )
    assert result.product_type == "PACKED"
    assert result.confidence == "MEDIUM"
    assert result.evidence["has_external_brand_signal"] is True
    assert result.evidence["external_brand_candidates"] == ["EXTERNAL"]
    assert result.evidence["external_brand_signal_source"] == "source_loose"


def test_purchased_external_brand_is_not_packed():
    result = classify(
        normalized_name="CORNFLOUR (WEIKFIELD) 100G",
        original_brand=None,
        purchase=_hit("barcode_mrp", "FOOD SUPPLIER"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.proposed_brand == "FOOD SUPPLIER"


def test_existing_pkg_with_purchase_remains_purchased():
    result = classify(
        normalized_name="CHIROTI RAWA 500G",
        original_brand="PKG",
        purchase=_hit("barcode_mrp", "RAW MATERIALS LTD"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.proposed_brand == "RAW MATERIALS LTD"


def test_fuzzy_name_is_unknown_not_packed():
    anchors = build_loose_anchors([
        ("1001", "ICC2_SAME_LOOSE", "SAME LOOSE", True),
    ])
    result = classify(
        normalized_name="SAM 1KG",
        original_brand="PKG",
        purchase=None,
        barcode_mrp_item_id_count=0,
        loose_anchors=anchors,
    )
    assert result.product_type == "UNKNOWN"
    assert result.keep_original_brand is True


def test_no_purchase_fmcg_unknown():
    result = classify(
        normalized_name="GREEN TEA 100G",
        original_brand=None,
        purchase=None,
        barcode_mrp_item_id_count=0,
        loose_anchors={},
    )
    assert result.product_type == "UNKNOWN"


def test_shared_barcode_mrp_is_low():
    result = classify(
        normalized_name="SOAP A 100G",
        original_brand=None,
        purchase=_hit("barcode_mrp"),
        barcode_mrp_item_id_count=2,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.confidence == "LOW"
    assert result.review_status == "NEEDS_REVIEW"


def test_barcode_only_is_medium():
    result = classify(
        normalized_name="BISCUIT PACK 50G",
        original_brand=None,
        purchase=_hit("barcode", "SNACK SUPPLIER"),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.confidence == "MEDIUM"


def test_stable_barcode_supplier_with_missing_mrp_is_high_and_batch_reviewable():
    result = classify(
        normalized_name="NOVA MUG 1000ML",
        original_brand=None,
        purchase=_hit("barcode", "VAMSHI DISTRIBUTORS"),
        barcode_mrp_item_id_count=0,
        barcode_identity_safe=True,
        loose_anchors={},
    )
    assert result.confidence == "HIGH"
    assert result.review_status == "AUTO_APPROVED"


def test_stable_loose_barcode_supplier_is_high_and_batch_reviewable():
    result = classify(
        normalized_name="GREEN PEAS LOOSE",
        original_brand=None,
        purchase=_hit("barcode", "Vasavi Traders"),
        barcode_mrp_item_id_count=0,
        barcode_identity_safe=True,
        loose_anchors={},
    )
    assert result.product_type == "LOOSE"
    assert result.confidence == "HIGH"
    assert result.review_status == "AUTO_APPROVED"


def test_stable_barcode_supplier_with_changed_historical_mrp_is_high():
    result = classify(
        normalized_name="ALMOND ROSE SOAP 125GM",
        original_brand=None,
        purchase=_hit("barcode", "SRI BALAJI AGENCIES"),
        barcode_mrp_item_id_count=1,
        barcode_identity_safe=True,
        loose_anchors={},
    )
    assert result.confidence == "HIGH"
    assert result.review_status == "AUTO_APPROVED"


def test_old_barcode_only_evidence_is_not_downgraded():
    old = PurchaseHit(
        supplier_name="DABSTER INTERNATIONAL PRIVATE LIMITED",
        purchase_date=date(2025, 6, 5),
        purchase_id="PO-OLD",
        invoice_no="INV-OLD",
        source_file_name="purchases.xlsx",
        match_method="barcode",
        supplier_count=1,
    )
    result = classify(
        normalized_name="DECOR STICKER 2PC",
        original_brand=None,
        purchase=old,
        barcode_mrp_item_id_count=0,
        barcode_identity_safe=True,
        loose_anchors={},
    )
    assert result.confidence == "HIGH"
    assert result.review_status == "AUTO_APPROVED"


def test_internal_barcode_is_not_a_confidence_downgrade():
    result = classify(
        normalized_name="AMLA JUICE 750ML",
        original_brand=None,
        purchase=_hit("barcode", "SREE SUBRAMANYA AGENCY"),
        barcode_mrp_item_id_count=0,
        barcode_identity_safe=True,
        loose_anchors={},
    )
    assert result.confidence == "HIGH"
    assert result.review_status == "AUTO_APPROVED"


def test_barcode_only_multiple_real_suppliers_stays_reviewable():
    result = classify(
        normalized_name="GREEN PEAS LOOSE",
        original_brand=None,
        purchase=_hit("barcode", "LATEST", suppliers=2),
        barcode_mrp_item_id_count=0,
        barcode_identity_safe=True,
        loose_anchors={},
    )
    assert result.confidence == "MEDIUM"
    assert result.review_status == "NEEDS_REVIEW"


def test_barcode_only_identity_conflict_stays_reviewable():
    result = classify(
        normalized_name="NEEM HONEY 1KG",
        original_brand=None,
        purchase=_hit("barcode", "LOCAL PURCHASE"),
        barcode_mrp_item_id_count=0,
        barcode_identity_safe=False,
        loose_anchors={},
    )
    assert result.confidence == "MEDIUM"
    assert result.review_status == "NEEDS_REVIEW"


def test_multiple_suppliers_medium():
    result = classify(
        normalized_name="OIL 1L",
        original_brand=None,
        purchase=_hit("barcode_mrp", "LATEST", suppliers=2),
        barcode_mrp_item_id_count=1,
        loose_anchors={},
    )
    assert result.product_type == "PURCHASED"
    assert result.confidence == "HIGH"
    assert result.review_status == "AUTO_APPROVED"
