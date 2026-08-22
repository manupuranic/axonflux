from api.tools.item_combination_cleanup.naming_standard import suggest_name_standard


def test_canonical_and_abbreviation_transformations_are_token_safe():
    result = suggest_name_standard("ORGANIC JAVARI SAJJI SHMPO 1KG")
    assert result.suggested_name == "ORGANIC JAVARI SAJJE SHAMPOO 1KG"
    assert result.transformations == ["SAJJI → SAJJE", "SHMPO → SHAMPOO"]


def test_laundry_abbreviations_require_explicit_laundry_context():
    assert suggest_name_standard("TIDE MATIC FL 850ML LIQUID").suggested_name == "TIDE MATIC FRONT LOAD 850ML LIQUID"
    assert suggest_name_standard("FL POWER DRINK 250ML").suggested_name is None


def test_protected_terms_and_crem_are_unchanged():
    for name in ("JAWARI FLOUR 1KG", "POHA 500G", "PEANUT 500G", "CHOCOLT CREM 100G"):
        assert suggest_name_standard(name).suggested_name is None
