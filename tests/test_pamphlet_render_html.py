from api.tools.pamphlets.render.html import render_pamphlet

SIMPLE_DSL = {
    "type": "page", "id": "p1", "theme_id": "minimal_light",
    "children": [{
        "type": "section", "id": "s1", "layout": "grid", "cols": 2,
        "children": [
            {"type": "text", "id": "t1", "content": "Sale!", "variant": "heading"},
            {"type": "product", "id": "pr1", "item_id": "item-abc"},
        ]
    }]
}
ITEMS = {"item-abc": {"display_name": "Rice 1kg", "offer_price": 55.0, "original_price": 70.0, "highlight_text": "Save Rs15", "image_url": None}}

def test_render_returns_html_string():
    html = render_pamphlet(SIMPLE_DSL, {}, ITEMS)
    assert "<!DOCTYPE html>" in html
    assert "Sale!" in html
    assert "Rice 1kg" in html

def test_render_includes_css_vars_from_theme():
    from api.tools.pamphlets.themes import load_theme
    theme = load_theme("monsoon")
    html = render_pamphlet(SIMPLE_DSL, theme, ITEMS)
    assert "--primary" in html
    assert "--accent" in html

def test_render_page_dimensions():
    html = render_pamphlet(SIMPLE_DSL, {}, ITEMS)
    assert "297mm" in html
    assert "210mm" in html
