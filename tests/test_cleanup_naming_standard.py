from api.tools.item_combination_cleanup.naming_standard import suggest_name_standard
from api.tools.item_combination_cleanup.service import effective_name_for_phase5
from types import SimpleNamespace


class _DecisionQuery:
    def __init__(self, decision): self.decision = decision
    def filter_by(self, **_): return self
    def first(self): return self.decision


class _Db:
    def __init__(self, decision=None): self.decision = decision
    def query(self, _): return _DecisionQuery(self.decision)


def _row(original, proposed):
    return SimpleNamespace(run_id="run", item_id_key="item", original_item_name=original, proposed_item_name=proposed)


def test_phase5_effective_name_requires_an_accepted_name_decision():
    assert effective_name_for_phase5(_Db(), _row("ABC PRODUCT 1 KG", "ABC PRODUCT 1KG")) == "ABC PRODUCT 1 KG"
    assert effective_name_for_phase5(_Db(SimpleNamespace(decision="ACCEPTED", edited_value=None)), _row("ABC PRODUCT 1 KG", "ABC PRODUCT 1KG")) == "ABC PRODUCT 1KG"
    assert effective_name_for_phase5(_Db(SimpleNamespace(decision="ACCEPTED", edited_value="ABC PRODUCT 1KG")), _row("ABC PRODCT 1KG", "ABC PRODCT 1KG")) == "ABC PRODUCT 1KG"
    assert effective_name_for_phase5(_Db(SimpleNamespace(decision="REJECTED", edited_value=None)), _row("ABC PRODUCT 1 KG", "ABC PRODUCT 1KG")) == "ABC PRODUCT 1 KG"


def test_phase5_chains_from_accepted_name_without_reintroducing_old_tokens():
    base = effective_name_for_phase5(_Db(SimpleNamespace(decision="ACCEPTED", edited_value="HEAD&SHOULDE SILKY&BLACK SHAMPOO 340ML")), _row("HEAD&SHOULDE SILKY&BLACK SHMP 340ML", "ignored"))
    assert suggest_name_standard(base).suggested_name == "HEAD&SHOULDERS SILKY&BLACK SHAMPOO 340ML"


def test_canonical_and_abbreviation_transformations_are_token_safe():
    result = suggest_name_standard("ORGANIC JAVARI SAJJI SHMPO 1KG")
    assert result.suggested_name == "ORGANIC JAVARI SAJJE SHAMPOO 1KG"
    assert result.transformations == ["SAJJI → SAJJE", "SHMPO → SHAMPOO"]


def test_laundry_abbreviations_require_explicit_laundry_context():
    assert suggest_name_standard("TIDE MATIC FL 850ML LIQUID").suggested_name == "TIDE MATIC FRONT LOAD 850ML LIQUID"
    assert suggest_name_standard("FL POWER DRINK 250ML").suggested_name is None


def test_protected_terms_and_crem_are_unchanged():
    for name in ("JAWARI FLOUR 1KG", "POHA 500G", "PEANUT 500G"):
        assert suggest_name_standard(name).suggested_name is None


def test_human_verified_phase5b_mappings_are_exact_token_replacements():
    result = suggest_name_standard("HEAD&SHOULDE CHOCOLT LIQUD CHESE WIPERC 340ML")

    assert result.suggested_name == "HEAD&SHOULDERS CHOCOLATE LIQUID CHEESE WIPER 340ML"
    assert result.transformations == [
        "CHOCOLT → CHOCOLATE", "SHOULDE → SHOULDERS", "LIQUD → LIQUID",
        "CHESE → CHEESE", "WIPERC → WIPER",
    ]


def test_human_verified_phase5b_mappings_do_not_corrupt_substrings_or_semantic_negatives():
    for name in ("CHOCOLTY BAR", "SHOULDER BAG", "LIQUID SOAP", "CHEESECAKE", "WIPERX", "LIVON SREE KANJI MEAT"):
        assert suggest_name_standard(name).suggested_name is None
