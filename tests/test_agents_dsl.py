import uuid
from api.agents.tools.pamphlet_dsl import build_dsl_tools
from api.tools.pamphlets.state import PamphletState


def _make_state():
    page_id = "page1"
    section_id = "sec1"
    product_id = "prod1"
    item_id = str(uuid.uuid4())
    dsl = {
        "id": page_id, "type": "page",
        "children": [{
            "id": section_id, "type": "section", "layout": "grid", "cols": 5, "rows": 5,
            "children": [{"id": product_id, "type": "product", "item_id": item_id}]
        }]
    }
    items = {item_id: {"display_name": "Sugar 1kg", "offer_price": 42.0, "original_price": 50.0}}
    return PamphletState(dsl=dsl, theme={"preset": "minimal_light"}, items=items), page_id, section_id, product_id, item_id


def test_get_layout_returns_structure_and_items():
    state, page_id, _, _, item_id = _make_state()
    tools = build_dsl_tools(state)
    get_layout = next(t for t in tools if t.name == "get_layout")
    result = get_layout.func()
    assert result["page_id"] == page_id
    assert len(result["children"]) == 1
    assert any(i["item_id"] == item_id for i in result["items"])


def test_update_node_patches_field():
    state, _, section_id, _, _ = _make_state()
    tools = build_dsl_tools(state)
    update_node = next(t for t in tools if t.name == "update_node")
    result = update_node.func(node_id=section_id, patch={"cols": 4})
    assert result["ok"] is True
    assert state.dirty is True
    assert state.dsl["children"][0]["cols"] == 4


def test_edit_layout_insert():
    state, page_id, _, _, _ = _make_state()
    tools = build_dsl_tools(state)
    edit_layout = next(t for t in tools if t.name == "edit_layout")
    new_node = {"id": "newtext", "type": "text", "variant": "heading", "content": "Hello"}
    result = edit_layout.func(operation="insert", parent_id=page_id, position=0, node=new_node)
    assert result["ok"] is True
    assert state.dsl["children"][0]["id"] == "newtext"


def test_edit_layout_remove():
    state, _, _, product_id, _ = _make_state()
    tools = build_dsl_tools(state)
    edit_layout = next(t for t in tools if t.name == "edit_layout")
    result = edit_layout.func(operation="remove", node_id=product_id)
    assert result["ok"] is True
    assert state.dsl["children"][0]["children"] == []


def test_set_theme_by_preset():
    state, _, _, _, _ = _make_state()
    tools = build_dsl_tools(state)
    set_theme = next(t for t in tools if t.name == "set_theme")
    result = set_theme.func(preset="monsoon")
    assert result["ok"] is True
    assert state.theme["preset"] == "monsoon"
    assert state.dirty is True
