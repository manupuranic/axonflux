import pytest
from api.tools.pamphlets.render.primitives import PageNode, SectionNode, ProductNode, TextNode, AnyNode
from pydantic import TypeAdapter

def test_page_node_defaults():
    p = PageNode(type="page", id="p1")
    assert p.width_mm == 297.0
    assert p.lang == "en"
    assert p.children == []

def test_section_grid():
    s = SectionNode(type="section", id="s1", layout="grid", cols=3)
    assert s.cols == 3

def test_product_node_requires_item_id():
    with pytest.raises(Exception):
        ProductNode(type="product", id="pr1")  # missing item_id

def test_discriminated_union_parses_text():
    adapter = TypeAdapter(AnyNode)
    node = adapter.validate_python({"type": "text", "id": "t1", "content": "Hello"})
    assert isinstance(node, TextNode)
    assert node.content == "Hello"

def test_style_overrides_rejects_bad_hex():
    from api.tools.pamphlets.render.primitives import StyleOverrides
    with pytest.raises(Exception):
        StyleOverrides(color_hex="notacolor").model_post_init(None)
