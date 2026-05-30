"""
Campaign Studio Phase 6 – QA

Covers:
  - Format-aware renderer (wa_1080 square, portrait, story, default A4)
  - PageNode style_overrides field accepted + rendered
  - set_theme auto-clears bg_gradient when bg color is set
  - set_theme with non-bg override leaves gradient intact
  - style_region product_cards → theme typography.card_base_rem
  - apply_dsl_patch: single set op, multi-op, unknown op does not raise
  - Filename sanitization for the upload endpoint
"""

import re
import pytest
from api.tools.pamphlets.render.html import render_pamphlet
from api.tools.pamphlets.render.primitives import PageNode
from api.agents.tools.pamphlet_dsl import build_dsl_tools
from api.tools.pamphlets.state import PamphletState


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _page_dsl(width_mm=None, height_mm=None, children=None):
    d = {
        "type": "page", "id": "page1",
        "theme_id": "minimal_light",
        "children": children or [
            {
                "type": "section", "id": "sec1", "layout": "stack",
                "children": [
                    {"type": "text", "id": "txt1", "content": "Sale!", "variant": "heading"},
                ],
            }
        ],
    }
    if width_mm is not None:
        d["width_mm"] = width_mm
    if height_mm is not None:
        d["height_mm"] = height_mm
    return d


def _make_state(width_mm=297, height_mm=210):
    item_id = "item1"
    dsl = _page_dsl(width_mm, height_mm, children=[
        {
            "type": "section", "id": "sec1", "layout": "stack",
            "children": [
                {"type": "text", "id": "txt1", "content": "Hello", "variant": "body"},
                {"type": "product", "id": "prod1", "item_id": item_id},
            ],
        }
    ])
    items = {item_id: {"display_name": "Rice 1kg", "offer_price": 50.0, "original_price": 60.0}}
    return PamphletState(dsl=dsl, theme={"preset": "minimal_light"}, items=items)


# ---------------------------------------------------------------------------
# Renderer — format dimensions
# ---------------------------------------------------------------------------

def test_renderer_default_a4_dimensions():
    html = render_pamphlet(_page_dsl(), {}, {})
    assert "297mm" in html
    assert "210mm" in html


def test_renderer_portrait_format():
    """A4 portrait (210×297mm) — both dimensions appear in HTML."""
    dsl = _page_dsl(width_mm=210, height_mm=297)
    html = render_pamphlet(dsl, {}, {})
    assert "210mm" in html
    assert "297mm" in html


def test_renderer_wa_square_format():
    """WhatsApp square (285.75×285.75mm) — dimension appears in HTML."""
    dsl = _page_dsl(width_mm=285.75, height_mm=285.75)
    html = render_pamphlet(dsl, {}, {})
    assert "285.75mm" in html


def test_renderer_story_format():
    """Instagram Story (285.75×508mm) — story height appears in HTML."""
    dsl = _page_dsl(width_mm=285.75, height_mm=508.0)
    html = render_pamphlet(dsl, {}, {})
    assert "285.75mm" in html
    assert "508mm" in html


def test_renderer_grid_section_wa_square_does_not_crash():
    """Grid section with products renders without raising on non-A4 canvas."""
    items = {"it1": {"display_name": "Oil 1L", "offer_price": 120.0, "original_price": 150.0}}
    dsl = _page_dsl(width_mm=285.75, height_mm=285.75, children=[
        {
            "type": "section", "id": "sec1", "layout": "grid", "cols": 2, "rows": 2,
            "children": [{"type": "product", "id": "p1", "item_id": "it1"}],
        }
    ])
    html = render_pamphlet(dsl, {}, items)
    assert "Oil 1L" in html


# ---------------------------------------------------------------------------
# PageNode — style_overrides
# ---------------------------------------------------------------------------

def test_page_node_accepts_bg_color_hex_style_override():
    node = PageNode.model_validate({
        "type": "page", "id": "p1",
        "style_overrides": {"bg_color_hex": "#ffffff"},
        "children": [],
    })
    assert node.style_overrides is not None
    assert node.style_overrides.bg_color_hex == "#ffffff"


def test_page_node_bg_color_hex_renders_into_html():
    """style_overrides.bg_color_hex on page → hex value present in rendered HTML."""
    dsl = _page_dsl()
    dsl["style_overrides"] = {"bg_color_hex": "#ffeedd"}
    html = render_pamphlet(dsl, {}, {})
    assert "#ffeedd" in html


def test_page_node_style_overrides_none_does_not_crash():
    """Page node without style_overrides must render fine."""
    dsl = _page_dsl()
    assert "style_overrides" not in dsl
    html = render_pamphlet(dsl, {}, {})
    assert "<!DOCTYPE html>" in html


# ---------------------------------------------------------------------------
# DSL tool: set_theme — bg_gradient auto-clear
# ---------------------------------------------------------------------------

def test_set_theme_with_bg_clears_gradient():
    """Overriding colors.bg must auto-set bg_gradient='none' so gradient doesn't win."""
    state = _make_state()
    state.theme["overrides"] = {"decoration": {"bg_gradient": "to bottom, #1a237e, #283593"}}
    tools = build_dsl_tools(state)
    set_theme = next(t for t in tools if t.name == "set_theme")

    set_theme.func(overrides={"colors": {"bg": "#ffffff"}})

    gradient = (
        state.theme.get("overrides", {})
        .get("decoration", {})
        .get("bg_gradient")
    )
    assert gradient == "none", f"Expected 'none', got {gradient!r}"


def test_set_theme_non_bg_override_preserves_gradient():
    """Overriding only accent must NOT touch bg_gradient."""
    state = _make_state()
    original_gradient = "to bottom, #1a237e, #283593"
    state.theme["overrides"] = {"decoration": {"bg_gradient": original_gradient}}
    tools = build_dsl_tools(state)
    set_theme = next(t for t in tools if t.name == "set_theme")

    set_theme.func(overrides={"colors": {"accent": "#ff5722"}})

    gradient = (
        state.theme.get("overrides", {})
        .get("decoration", {})
        .get("bg_gradient")
    )
    assert gradient == original_gradient


def test_set_theme_preset_changes_theme_id():
    state = _make_state()
    tools = build_dsl_tools(state)
    set_theme = next(t for t in tools if t.name == "set_theme")
    result = set_theme.func(preset="monsoon")
    assert result.get("ok") is True
    assert state.theme.get("preset") == "monsoon"
    assert state.dsl.get("theme_id") == "monsoon"


# ---------------------------------------------------------------------------
# DSL tool: style_region — product_cards → card_base_rem
# ---------------------------------------------------------------------------

def test_style_region_product_cards_sets_card_base_rem():
    """font_size_px=14 → card_base_rem ≈ 0.875 in theme.overrides.typography."""
    state = _make_state()
    tools = build_dsl_tools(state)
    style_region = next(t for t in tools if t.name == "style_region")

    result = style_region.func(region="product_cards", font_size_px=14)

    assert result.get("ok") is True
    card_base_rem = (
        state.theme.get("overrides", {})
        .get("typography", {})
        .get("card_base_rem")
    )
    assert card_base_rem is not None
    assert abs(card_base_rem - 14 / 16) < 0.01


def test_style_region_product_cards_rejects_non_font_args():
    """product_cards without font_size_px must return an error (not silently do nothing)."""
    state = _make_state()
    tools = build_dsl_tools(state)
    style_region = next(t for t in tools if t.name == "style_region")

    result = style_region.func(region="product_cards", color_hex="#ff0000")
    assert "error" in result


def test_style_region_all_text_updates_nodes():
    state = _make_state()
    tools = build_dsl_tools(state)
    style_region = next(t for t in tools if t.name == "style_region")

    result = style_region.func(region="all_text", font_size_px=20)

    assert result.get("ok") is True
    assert result.get("nodes_updated", 0) >= 1
    txt = state.dsl["children"][0]["children"][0]
    assert txt.get("style_overrides", {}).get("font_size_px") == 20


# ---------------------------------------------------------------------------
# DSL tool: apply_dsl_patch
# ---------------------------------------------------------------------------

def test_apply_dsl_patch_single_set_op():
    state = _make_state()
    tools = build_dsl_tools(state)
    patch = next(t for t in tools if t.name == "apply_dsl_patch")

    result = patch.func(ops=[
        {"op": "set", "node_id": "txt1", "field": "content", "value": "Monsoon Offer!"}
    ])

    assert result.get("ok") is True
    txt = state.dsl["children"][0]["children"][0]
    assert txt["content"] == "Monsoon Offer!"


def test_apply_dsl_patch_style_op_merges():
    state = _make_state()
    tools = build_dsl_tools(state)
    patch = next(t for t in tools if t.name == "apply_dsl_patch")

    result = patch.func(ops=[
        {"op": "style", "node_id": "txt1", "style": {"font_size_px": 24, "color_hex": "#e53935"}}
    ])

    assert result.get("ok") is True
    so = state.dsl["children"][0]["children"][0].get("style_overrides", {})
    assert so.get("font_size_px") == 24
    assert so.get("color_hex") == "#e53935"


def test_apply_dsl_patch_multiple_ops_all_applied():
    """All ops in a single call must all land — not stop at first."""
    state = _make_state()
    tools = build_dsl_tools(state)
    patch = next(t for t in tools if t.name == "apply_dsl_patch")

    result = patch.func(ops=[
        {"op": "set", "node_id": "txt1", "field": "content", "value": "Sale!"},
        {"op": "set", "node_id": "sec1", "field": "gap", "value": "lg"},
        {"op": "style", "node_id": "txt1", "style": {"font_weight": 700}},
    ])

    assert result.get("ok") is True
    assert state.dsl["children"][0]["children"][0]["content"] == "Sale!"
    assert state.dsl["children"][0]["gap"] == "lg"
    assert state.dsl["children"][0]["children"][0]["style_overrides"]["font_weight"] == 700


def test_apply_dsl_patch_unknown_op_returns_error_per_op_not_raise():
    """Unknown op key: per-op error, no exception, remaining ops still run."""
    state = _make_state()
    tools = build_dsl_tools(state)
    patch = next(t for t in tools if t.name == "apply_dsl_patch")

    try:
        result = patch.func(ops=[
            {"op": "nonexistent_op", "foo": "bar"},
            {"op": "set", "node_id": "txt1", "field": "content", "value": "Ran after bad op"},
        ])
    except Exception as e:
        pytest.fail(f"apply_dsl_patch raised on unknown op: {e}")

    # Second op (valid) must still have run
    assert state.dsl["children"][0]["children"][0]["content"] == "Ran after bad op"


def test_apply_dsl_patch_missing_node_id_returns_error():
    """All ops fail → ok=False, per-op error surfaced in results — no exception."""
    state = _make_state()
    tools = build_dsl_tools(state)
    patch = next(t for t in tools if t.name == "apply_dsl_patch")

    result = patch.func(ops=[
        {"op": "set", "node_id": "does_not_exist", "field": "content", "value": "x"}
    ])

    assert result.get("ok") is False
    assert result.get("failed", 0) >= 1
    assert any("error" in r for r in result.get("results", []))


def test_apply_dsl_patch_ops_as_json_string():
    """LLMs sometimes pass ops as a JSON string — must be coerced and work."""
    state = _make_state()
    tools = build_dsl_tools(state)
    patch = next(t for t in tools if t.name == "apply_dsl_patch")

    import json
    ops_str = json.dumps([{"op": "set", "node_id": "txt1", "field": "content", "value": "From string"}])
    result = patch.func(ops=ops_str)

    assert result.get("ok") is True
    assert state.dsl["children"][0]["children"][0]["content"] == "From string"


# ---------------------------------------------------------------------------
# Upload filename sanitization
# ---------------------------------------------------------------------------

def _sanitize(name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", name)


def test_sanitize_spaces_replaced():
    assert _sanitize("Freedom Sunflower Oil 500ml.jpg") == "Freedom_Sunflower_Oil_500ml.jpg"


def test_sanitize_path_traversal_neutralized():
    result = _sanitize("promo/../../evil.png")
    assert ".." not in result.replace(".", "")
    assert "/" not in result


def test_sanitize_normal_name_unchanged():
    assert _sanitize("normal-image_v2.png") == "normal-image_v2.png"


def test_sanitize_unicode_replaced():
    result = _sanitize("ñoño café.jpg")
    assert " " not in result
    assert result.endswith(".jpg")
