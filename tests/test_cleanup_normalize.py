from api.tools.item_combination_cleanup.normalize import (
    base_name,
    extract_size_from_name,
    normalize_item_name,
    normalize_size_token,
    propose_name_and_size,
)


def test_size_token_aliases():
    assert normalize_size_token("500GM") == "500G"
    assert normalize_size_token("500GMS") == "500G"
    assert normalize_size_token("500 G") == "500G"
    assert normalize_size_token("1 KG") == "1KG"
    assert normalize_size_token("1LTR") == "1L"
    assert normalize_size_token("1 LTR") == "1L"
    assert normalize_size_token("1000G") == "1KG"


def test_name_mechanical_formatting():
    assert normalize_item_name("same 1 kg") == "SAME 1KG"
    assert normalize_item_name("DABUR RED TOOTHPASTE 100GM") == "DABUR RED TOOTHPASTE 100G"
    assert normalize_item_name("cornflour  (weikfield)  100g") == "CORNFLOUR (WEIKFIELD) 100G"
    assert normalize_item_name("green tea 100gm") == "GREEN TEA 100G"
    assert extract_size_from_name(normalize_item_name("SAME 1KG")) == "1KG"


def test_does_not_strip_manufacturer_parens():
    assert "(WEIKFIELD)" in normalize_item_name("CORNFLOUR (WEIKFIELD) 100G")


def test_base_name_drops_loose_and_size():
    assert base_name("SAME LOOSE") == "SAME"
    assert base_name("SAME 1KG") == "SAME"
    assert base_name("same 500gm") == "SAME"


def test_propose_name_and_size_from_name():
    proposal = propose_name_and_size("SAME 500GM", None)
    assert proposal.proposed_name == "SAME 500G"
    assert proposal.proposed_size == "500G"
    assert proposal.evidence
