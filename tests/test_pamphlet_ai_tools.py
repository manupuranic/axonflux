import uuid
from api.tools.pamphlets.ai_tools import build_tools, PamphletState

def _make_state():
    return PamphletState(
        dsl={
            "type": "page", "id": "p1", "theme_id": "minimal_light",
            "children": [{"type": "section", "id": "s1", "layout": "grid", "cols": 2, "children": []}]
        },
        theme={"preset": "minimal_light"},
        items={},
    )

def test_set_theme_changes_theme():
    state = _make_state()
    tools = {t.name: t for t in build_tools(state)}
    tools["set_theme"].func(name="monsoon")
    assert state.theme["preset"] == "monsoon"

def test_insert_node_adds_child():
    state = _make_state()
    tools = {t.name: t for t in build_tools(state)}
    tools["insert_node"].func(
        parent_id="s1",
        position=0,
        node={"type": "text", "id": "new-t", "content": "Hello"}
    )
    section = state.dsl["children"][0]
    assert section["children"][0]["id"] == "new-t"

def test_remove_node():
    state = _make_state()
    state.dsl["children"][0]["children"] = [{"type": "text", "id": "rem1", "content": "bye"}]
    tools = {t.name: t for t in build_tools(state)}
    tools["remove_node"].func(node_id="rem1")
    assert state.dsl["children"][0]["children"] == []
