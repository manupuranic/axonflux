# Pamphlet Generator Overhaul: Tool Registry, Image Agent, Three-Column UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild pamphlet generator with a two-layer agent tool registry, LLM-driven image agent, equal-height CSS grid cards, and a three-column UI (Chat | Products | Preview).

**Architecture:** `api/agents/` holds a two-layer tool registry — Layer 1: shared infra tools (`web_search` via Tavily, `fetch_url`); Layer 2: 6 collapsed DSL tools replacing the 18 pamphlet-specific tools. Image agent is Claude Haiku + infra tools, triggered automatically on product save and via a "scan all" button; progress streams via SSE. Frontend gains a ProductsPanel middle column with edit modal, up/down reorder, and scan button.

**Tech Stack:** FastAPI BackgroundTasks + threading, SSE via StreamingResponse, Tavily Search API, Open Food Facts API, shadcn Dialog, native `EventSource` for SSE.

---

## File Map

### Create
- `api/agents/__init__.py` — re-exports `tool`, `Tool`
- `api/agents/tools/__init__.py` — empty init
- `api/agents/tools/infra.py` — `web_search` (Tavily) + `fetch_url` + `build_infra_tools()`
- `api/agents/tools/pamphlet_dsl.py` — 6 collapsed DSL tools + `build_dsl_tools(state)`
- `api/agents/image_agent.py` — `ImageTask`, `find_image_for_product()`, `start_scan_task()`
- `api/agents/router.py` — FastAPI router: trigger + SSE endpoints
- `api/tools/pamphlets/state.py` — `PamphletState` + `_find_node` (extracted from ai_tools.py)
- `api/migrations/versions/010_pamphlet_items_category_unit.py`
- `web/components/pamphlet/ProductsPanel.tsx`

### Modify
- `api/tools/pamphlets/models.py` — add `category`, `unit` columns
- `api/tools/pamphlets/schemas.py` — add `category`, `unit` to all item schemas
- `api/tools/pamphlets/service.py` — persist category/unit; add barcode/category/unit to lookup
- `api/tools/pamphlets/ai_session.py` — import tools from `api.agents.tools.pamphlet_dsl`
- `api/tools/pamphlets/system_prompt.py` — update for 6 new tool names
- `api/tools/pamphlets/router.py` — trigger image agent on add_item when image_url empty; add BackgroundTasks
- `api/tools/pamphlets/render/html.py` — equal-height CSS grid cards + object-fit:cover
- `api/main.py` — register agents router
- `web/lib/pamphlet/types.ts` — add `PamphletItem` + `AgentTask` types
- `web/lib/pamphlet/api.ts` — add addItem, updateItem, removeItem, reorderItems, triggerImageScan, streamAgentTask
- `web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx` — three-column layout

### Delete
- `api/tools/pamphlets/ai_tools.py` — replaced by `api/agents/tools/pamphlet_dsl.py` + `state.py`

---

## Tasks

### Task 1: Migration 010 — add category + unit to pamphlet_items

**Files:**
- Create: `api/migrations/versions/010_pamphlet_items_category_unit.py`

- [ ] **Step 1: Write the migration**

```python
# api/migrations/versions/010_pamphlet_items_category_unit.py
"""010_pamphlet_items_category_unit

Revision ID: 010_pamphlet_items_category_unit
Revises: 009_pamphlet_dsl
Create Date: 2026-05-25 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "010_pamphlet_items_category_unit"
down_revision = "009_pamphlet_dsl"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pamphlet_items", sa.Column("category", sa.Text, nullable=True), schema="app")
    op.add_column("pamphlet_items", sa.Column("unit", sa.Text, nullable=True), schema="app")


def downgrade():
    op.drop_column("pamphlet_items", "unit", schema="app")
    op.drop_column("pamphlet_items", "category", schema="app")
```

- [ ] **Step 2: Run migration**

```bash
PYTHONPATH=. alembic upgrade head
```

Expected: `Running upgrade 009_pamphlet_dsl -> 010_pamphlet_items_category_unit`

- [ ] **Step 3: Commit**

```bash
git add api/migrations/versions/010_pamphlet_items_category_unit.py
git commit -m "feat(db): add category + unit to pamphlet_items"
```

---

### Task 2: Extract PamphletState + _find_node to shared state.py

**Files:**
- Create: `api/tools/pamphlets/state.py`

This must happen before Task 4 and Task 5, since both import `PamphletState` and `_find_node`.

- [ ] **Step 1: Create `api/tools/pamphlets/state.py`**

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass
class PamphletState:
    dsl: dict
    theme: dict
    items: dict[str, dict]
    dirty: bool = False
    db: "Session | None" = None
    pamphlet_id: str = ""


def _find_node(tree: dict, node_id: str) -> tuple[dict | None, list | None, int]:
    children = tree.get("children", [])
    for i, child in enumerate(children):
        if child.get("id") == node_id:
            return child, children, i
        found, lst, idx = _find_node(child, node_id)
        if found is not None:
            return found, lst, idx
    return None, None, -1
```

- [ ] **Step 2: Verify import**

```bash
PYTHONPATH=. python -c "from api.tools.pamphlets.state import PamphletState, _find_node; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add api/tools/pamphlets/state.py
git commit -m "refactor(pamphlets): extract PamphletState + _find_node to state.py"
```

---

### Task 3: Agent registry foundation

**Files:**
- Create: `api/agents/__init__.py`
- Create: `api/agents/tools/__init__.py`

- [ ] **Step 1: Create `api/agents/__init__.py`**

```python
from api.ai.tools import tool, Tool  # noqa: F401 — re-exported for agent modules

__all__ = ["tool", "Tool"]
```

- [ ] **Step 2: Create `api/agents/tools/__init__.py`**

```python
```

(empty file)

- [ ] **Step 3: Verify imports**

```bash
PYTHONPATH=. python -c "from api.agents import tool, Tool; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add api/agents/__init__.py api/agents/tools/__init__.py
git commit -m "feat(agents): bootstrap agent registry package"
```

---

### Task 4: Infra tools — web_search + fetch_url

**Files:**
- Create: `api/agents/tools/infra.py`
- Create: `tests/test_agents_infra.py`

Also add `TAVILY_API_KEY=tvly-...` to `.env` (get key at app.tavily.com — free tier, 1000 searches/month).

- [ ] **Step 1: Write failing test**

```python
# tests/test_agents_infra.py
from unittest.mock import patch, MagicMock
from api.agents.tools.infra import build_infra_tools


def test_web_search_calls_tavily():
    tools = build_infra_tools()
    web_search = next(t for t in tools if t.name == "web_search")

    mock_resp = MagicMock()
    mock_resp.raise_for_status = lambda: None
    mock_resp.json.return_value = {
        "results": [{"title": "Sugar 1kg", "url": "https://example.com/sugar", "content": "..."}],
        "images": ["https://example.com/sugar.jpg"],
    }

    with patch("httpx.post", return_value=mock_resp) as mock_post:
        result = web_search.func(query="Sugar 1kg product", num_results=3)

    mock_post.assert_called_once()
    call_json = mock_post.call_args.kwargs["json"]
    assert call_json["query"] == "Sugar 1kg product"
    assert call_json["max_results"] == 3
    assert len(result["results"]) == 1
    assert result["images"] == ["https://example.com/sugar.jpg"]


def test_fetch_url_returns_json():
    tools = build_infra_tools()
    fetch_url = next(t for t in tools if t.name == "fetch_url")

    mock_resp = MagicMock()
    mock_resp.raise_for_status = lambda: None
    mock_resp.headers = {"content-type": "application/json"}
    mock_resp.json.return_value = {"product": {"image_front_url": "https://img.com/sugar.jpg"}}

    with patch("httpx.get", return_value=mock_resp):
        result = fetch_url.func(url="https://world.openfoodfacts.org/api/v0/product/8901030012345.json")

    assert result["json"]["product"]["image_front_url"] == "https://img.com/sugar.jpg"
```

- [ ] **Step 2: Run to verify fail**

```bash
PYTHONPATH=. python -m pytest tests/test_agents_infra.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'api.agents.tools.infra'`

- [ ] **Step 3: Write `api/agents/tools/infra.py`**

```python
from __future__ import annotations
import os

import httpx

from api.ai.tools import tool, Tool


def build_infra_tools() -> list[Tool]:

    @tool(
        description=(
            "Search the web using Tavily. Returns results with title, url, content snippet, "
            "and an 'images' list of direct image URLs. "
            "Set include_images=true when looking for product photos."
        ),
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "num_results": {"type": "integer", "default": 5},
                "include_images": {"type": "boolean", "default": False},
            },
            "required": ["query"],
        },
    )
    def web_search(query: str, num_results: int = 5, include_images: bool = False) -> dict:
        api_key = os.environ.get("TAVILY_API_KEY", "")
        resp = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "include_images": include_images,
                "max_results": num_results,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "results": [
                {"title": r.get("title"), "url": r.get("url"), "content": r.get("content", "")[:300]}
                for r in data.get("results", [])
            ],
            "images": data.get("images", []),
        }

    @tool(
        description=(
            "Fetch the contents of a URL via HTTP GET. "
            "Returns JSON if response is JSON (e.g. Open Food Facts API), otherwise returns text. "
            "Use for barcode lookups: fetch_url('https://world.openfoodfacts.org/api/v0/product/{barcode}.json'). "
            "The OFF response has product.image_front_url and product.image_url."
        ),
        parameters={
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    )
    def fetch_url(url: str) -> dict:
        resp = httpx.get(url, follow_redirects=True, timeout=15)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "json" in content_type:
            return {"json": resp.json()}
        return {"text": resp.text[:2000], "content_type": content_type}

    return [web_search, fetch_url]
```

- [ ] **Step 4: Run tests**

```bash
PYTHONPATH=. python -m pytest tests/test_agents_infra.py -v
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add api/agents/tools/infra.py tests/test_agents_infra.py
git commit -m "feat(agents): infra tools — web_search (Tavily) + fetch_url"
```

---

### Task 5: Collapsed DSL tools (18 → 6)

**Files:**
- Create: `api/agents/tools/pamphlet_dsl.py`
- Create: `tests/test_agents_dsl.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_agents_dsl.py
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
```

- [ ] **Step 2: Run to verify fail**

```bash
PYTHONPATH=. python -m pytest tests/test_agents_dsl.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'api.agents.tools.pamphlet_dsl'`

- [ ] **Step 3: Write `api/agents/tools/pamphlet_dsl.py`**

```python
from __future__ import annotations
import copy
import uuid

from api.ai.tools import tool, Tool
from api.tools.pamphlets.state import PamphletState, _find_node
from api.tools.pamphlets.themes import PRESET_IDS


def build_dsl_tools(state: PamphletState) -> list[Tool]:

    @tool(
        description=(
            "Return the current DSL tree structure (node IDs, types, key fields) and all product items. "
            "ALWAYS call this first when you need node IDs before inserting, moving, or updating nodes."
        ),
        parameters={"type": "object", "properties": {}, "required": []},
    )
    def get_layout() -> dict:
        def _summarize(node: dict, depth: int = 0) -> dict:
            t = node.get("type", "?")
            s: dict = {"id": node.get("id"), "type": t}
            if t == "text":
                s["variant"] = node.get("variant")
                s["content"] = (node.get("content") or "")[:40]
            elif t == "section":
                s["layout"] = node.get("layout")
                s["cols"] = node.get("cols")
                s["rows"] = node.get("rows")
                s["children_count"] = len(node.get("children", []))
                if depth == 0 and node.get("children"):
                    ch = node["children"]
                    sample = ch[:2] + (ch[-1:] if len(ch) > 2 else [])
                    s["children_sample"] = [_summarize(c, depth + 1) for c in sample]
            elif t == "product":
                s["item_id"] = node.get("item_id")
            if depth < 2 and t not in ("section",) and node.get("children"):
                s["children"] = [_summarize(c, depth + 1) for c in node["children"]]
            return s

        return {
            "page_id": state.dsl.get("id"),
            "children": [_summarize(c) for c in state.dsl.get("children", [])],
            "items": [
                {"item_id": k, "name": v.get("display_name"), "offer_price": v.get("offer_price")}
                for k, v in state.items.items()
            ],
        }

    @tool(
        description=(
            "Structural tree operations: insert/remove/move/duplicate a node, or sort products. "
            "insert: parent_id, position (int), node (dict with type + fields). "
            "remove: node_id. "
            "move: node_id, new_parent_id, new_position. "
            "duplicate: node_id. "
            "sort: section_id, sort_by (price_asc|price_desc|name_asc|discount_pct_desc|category)."
        ),
        parameters={
            "type": "object",
            "properties": {
                "operation": {"type": "string", "enum": ["insert", "remove", "move", "duplicate", "sort"]},
                "node_id": {"type": "string"},
                "parent_id": {"type": "string"},
                "position": {"type": "integer"},
                "new_parent_id": {"type": "string"},
                "new_position": {"type": "integer"},
                "node": {"type": "object"},
                "section_id": {"type": "string"},
                "sort_by": {"type": "string", "enum": ["price_asc", "price_desc", "name_asc", "discount_pct_desc", "category"]},
            },
            "required": ["operation"],
        },
    )
    def edit_layout(
        operation: str,
        node_id: str | None = None,
        parent_id: str | None = None,
        position: int | None = None,
        new_parent_id: str | None = None,
        new_position: int | None = None,
        node: dict | None = None,
        section_id: str | None = None,
        sort_by: str | None = None,
    ) -> dict:
        if operation == "insert":
            if not parent_id or node is None:
                return {"error": "insert requires parent_id and node"}
            if "id" not in node:
                node["id"] = str(uuid.uuid4())[:8]
            parent, _, _ = _find_node(state.dsl, parent_id)
            if parent is None and state.dsl.get("id") == parent_id:
                parent = state.dsl
            if parent is None:
                return {"error": f"Parent {parent_id!r} not found"}
            children = parent.setdefault("children", [])
            pos = max(0, min(position or 0, len(children)))
            children.insert(pos, node)
            state.dirty = True
            return {"ok": True, "inserted_id": node["id"]}

        elif operation == "remove":
            if not node_id:
                return {"error": "remove requires node_id"}
            _, parent_children, idx = _find_node(state.dsl, node_id)
            if parent_children is None:
                return {"error": f"Node {node_id!r} not found"}
            parent_children.pop(idx)
            state.dirty = True
            return {"ok": True}

        elif operation == "move":
            if not node_id or not new_parent_id:
                return {"error": "move requires node_id and new_parent_id"}
            node_obj, parent_children, idx = _find_node(state.dsl, node_id)
            if node_obj is None:
                return {"error": f"Node {node_id!r} not found"}
            parent_children.pop(idx)
            new_parent, _, _ = _find_node(state.dsl, new_parent_id)
            if new_parent is None:
                return {"error": f"New parent {new_parent_id!r} not found"}
            children = new_parent.setdefault("children", [])
            pos = max(0, min(new_position or 0, len(children)))
            children.insert(pos, node_obj)
            state.dirty = True
            return {"ok": True}

        elif operation == "duplicate":
            if not node_id:
                return {"error": "duplicate requires node_id"}
            node_obj, parent_children, idx = _find_node(state.dsl, node_id)
            if node_obj is None:
                return {"error": f"Node {node_id!r} not found"}
            clone = copy.deepcopy(node_obj)
            clone["id"] = str(uuid.uuid4())[:8]
            parent_children.insert(idx + 1, clone)
            state.dirty = True
            return {"ok": True, "new_id": clone["id"]}

        elif operation == "sort":
            sid = section_id
            if not sid:
                return {"error": "sort requires section_id"}
            section, _, _ = _find_node(state.dsl, sid)
            if section is None:
                return {"error": f"Section {sid!r} not found"}
            by = sort_by or "name_asc"
            product_nodes = [c for c in section.get("children", []) if c.get("type") == "product"]
            other_nodes = [c for c in section.get("children", []) if c.get("type") != "product"]

            def key_fn(n):
                item = state.items.get(n.get("item_id", ""), {})
                offer = float(item.get("offer_price") or 0)
                mrp = float(item.get("original_price") or 0)
                name = (item.get("display_name") or "").lower()
                disc = ((mrp - offer) / mrp) if mrp > 0 else 0
                if by == "price_asc":    return offer
                if by == "price_desc":   return -offer
                if by == "discount_pct_desc": return -disc
                return name

            product_nodes.sort(key=key_fn)
            section["children"] = other_nodes + product_nodes
            state.dirty = True
            return {"ok": True}

        return {"error": f"Unknown operation: {operation!r}"}

    @tool(
        description=(
            "Update any fields on a DSL node by ID. "
            "patch can include: content, style_overrides, cols, rows, item_id, show_image, "
            "variant, gap, layout, headline, subtext, phone, address, and any other node field. "
            "Examples: update_node(id, {cols:4}) to resize grid; "
            "update_node(id, {style_overrides:{color_token:'accent'}}) for styling; "
            "update_node(id, {content:'New Title'}) to change text."
        ),
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string"},
                "patch": {"type": "object"},
            },
            "required": ["node_id", "patch"],
        },
    )
    def update_node(node_id: str, patch: dict) -> dict:
        node, _, _ = _find_node(state.dsl, node_id)
        if node is None and state.dsl.get("id") == node_id:
            node = state.dsl
        if node is None:
            return {"error": f"Node {node_id!r} not found"}
        node.update(patch)
        state.dirty = True
        return {"ok": True}

    @tool(
        description=(
            "Batch-update product item data stored in the DB: display_name, offer_price, "
            "original_price, highlight_text. Optionally sort all products in the pamphlet."
        ),
        parameters={
            "type": "object",
            "properties": {
                "updates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_id": {"type": "string"},
                            "display_name": {"type": "string"},
                            "offer_price": {"type": "number"},
                            "original_price": {"type": "number"},
                            "highlight_text": {"type": "string"},
                        },
                        "required": ["item_id"],
                    },
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["price_asc", "price_desc", "name_asc", "discount_pct_desc", "category"],
                },
            },
            "required": ["updates"],
        },
    )
    def update_products(updates: list, sort_by: str | None = None) -> dict:
        if not state.db or not state.pamphlet_id:
            return {"error": "DB not available"}
        from api.tools.pamphlets.models import PamphletItem
        changed = 0
        for u in updates:
            item = state.db.query(PamphletItem).filter(PamphletItem.id == u["item_id"]).first()
            if not item:
                continue
            for field in ("display_name", "offer_price", "original_price", "highlight_text"):
                if field in u:
                    setattr(item, field, u[field])
            state.items[u["item_id"]] = {
                **state.items.get(u["item_id"], {}),
                **{f: u[f] for f in ("display_name", "offer_price", "original_price", "highlight_text") if f in u},
            }
            changed += 1
        state.dirty = True
        return {"updated": changed}

    @tool(
        description=(
            "Apply a theme to the pamphlet. Provide one or more of: "
            "preset (named theme: minimal_light, minimal_dark, monsoon, diwali, summer), "
            "description (text like 'dark blue moody' — generates theme via AI), "
            "overrides (token overrides: {colors:{primary:'#hex'}, typography:{...}}), "
            "font_scale ({all|headings|prices|body: delta, e.g. 0.1 = 10% bigger})."
        ),
        parameters={
            "type": "object",
            "properties": {
                "preset": {"type": "string", "enum": PRESET_IDS},
                "description": {"type": "string"},
                "overrides": {"type": "object"},
                "font_scale": {"type": "object"},
            },
            "required": [],
        },
    )
    def set_theme(
        preset: str | None = None,
        description: str | None = None,
        overrides: dict | None = None,
        font_scale: dict | None = None,
    ) -> dict:
        if description:
            import os, json
            import anthropic as sdk
            client = sdk.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            prompt = (
                f'Generate a retail pamphlet color theme for: "{description}"\n'
                'Return ONLY valid JSON:\n'
                '{"colors":{"primary":"#hex","secondary":"#hex","accent":"#hex","bg":"#hex","surface":"#hex",'
                '"text":"#hex","text_muted":"#hex","border":"#hex","success":"#hex","danger":"#hex"},'
                '"decoration":{"bg_gradient":"linear-gradient(...)"}}'
            )
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=512,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = resp.content[0].text.strip().strip("```json").strip("```").strip()
            generated = json.loads(raw)
            state.theme = {"preset": "minimal_light", "overrides": generated}
            state.dsl["theme_id"] = "minimal_light"
            state.dirty = True
            return {"ok": True, "generated_tokens": generated}

        if preset:
            state.theme = {"preset": preset}
            state.dsl["theme_id"] = preset
            state.dirty = True

        if overrides:
            for section, tokens in overrides.items():
                state.theme.setdefault("overrides", {}).setdefault(section, {}).update(tokens)
            state.dirty = True

        if font_scale:
            state.theme.setdefault("font_scale", {}).update(font_scale)
            state.dirty = True

        return {"ok": True, "theme": state.theme.get("preset")}

    @tool(
        description=(
            "Ask the user a question when it cannot be resolved automatically — for clarification "
            "or to present options (e.g. title suggestions). "
            "Do NOT use this to ask for node IDs — call get_layout instead."
        ),
        parameters={
            "type": "object",
            "properties": {"question": {"type": "string"}},
            "required": ["question"],
        },
    )
    def ask_user(question: str) -> dict:
        return {"ask": question}

    return [get_layout, edit_layout, update_node, update_products, set_theme, ask_user]
```

- [ ] **Step 4: Run tests**

```bash
PYTHONPATH=. python -m pytest tests/test_agents_dsl.py -v
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add api/agents/tools/pamphlet_dsl.py tests/test_agents_dsl.py
git commit -m "feat(agents): 6 collapsed DSL tools — replaces 18 pamphlet-specific tools"
```

---

### Task 6: Migrate pamphlet session + delete ai_tools.py

**Files:**
- Modify: `api/tools/pamphlets/ai_session.py`
- Modify: `api/tools/pamphlets/system_prompt.py`
- Delete: `api/tools/pamphlets/ai_tools.py`

- [ ] **Step 1: Replace `api/tools/pamphlets/ai_session.py`**

```python
from __future__ import annotations
from api.ai import ChatSession
from api.ai.config import get_default_provider, get_default_model
from api.ai.provider import Message
from api.tools.pamphlets.state import PamphletState
from api.agents.tools.pamphlet_dsl import build_dsl_tools
from api.tools.pamphlets.system_prompt import build_system_prompt


def make_pamphlet_session(
    dsl: dict,
    theme: dict,
    items: dict[str, dict],
    pamphlet_title: str,
    history: list[Message],
    provider: str | None = None,
    model: str | None = None,
    db=None,
    pamphlet_id: str = "",
) -> tuple[ChatSession, PamphletState]:
    state = PamphletState(dsl=dsl, theme=theme, items=items, db=db, pamphlet_id=pamphlet_id)
    tools = build_dsl_tools(state)
    session = ChatSession(
        provider=provider or get_default_provider(),
        model=model or get_default_model(),
        system_prompt=build_system_prompt(pamphlet_title, len(items)),
        tools=tools,
        history=history,
    )
    return session, state
```

- [ ] **Step 2: Replace `api/tools/pamphlets/system_prompt.py`**

```python
from api.tools.pamphlets.themes import PRESET_IDS

SYSTEM_PROMPT = f"""You are a pamphlet design assistant for Puranic Health Mart, a supermarket in Bangalore.
You help staff create attractive promotional pamphlets by modifying a JSON DSL tree via tool calls.

## Your role
- Interpret natural-language design requests and translate them into precise tool calls
- Available themes: {", ".join(PRESET_IDS)}
- Never describe changes — always execute them via tools
- Multiple tools in one turn is encouraged

## Tools
- get_layout() — returns DSL tree structure + all product items. ALWAYS call first when you need node IDs.
- edit_layout(operation, ...) — insert/remove/move/duplicate nodes or sort products in a section
- update_node(node_id, patch) — update any field on a node (content, style_overrides, cols, rows, item_id, etc.)
- update_products(updates, sort_by?) — batch update product prices/names/badges in the DB
- set_theme(preset?, description?, overrides?, font_scale?) — apply/generate/override theme
- ask_user(question) — ask when truly unclear. NEVER ask for node IDs — use get_layout instead.

## Global vs per-node requests
- "Every product card", "all cards", "make them all equal" → GLOBAL. Update the section cols/rows via update_node.
- Specific nodes → call get_layout to find IDs, then use update_node or edit_layout.

## Layout principles
- Products should be in sections with layout=grid and both cols + rows set
- cols=5, rows=5 → auto-paginates into A4 pages (25 products/page)
- To change grid: update_node(section_id, {{cols: 5, rows: 5}})
- Offer banners: use slot with span_cols for full-width impact
- Contact strip always at bottom

## Tone
- Retail-friendly, not medical claims
- Badge text: punchy 2-6 words (e.g. "Save ₹8", "20% OFF", "Best Value")

## Examples

User: "Make it monsoon themed"
→ set_theme(preset="monsoon")

User: "Put a big sale banner at the top"
→ get_layout() to get page_id, then edit_layout(operation="insert", parent_id="<page_id>", position=0, node={{type:"offer_banner", id:"banner1", headline:"Big Sale!", shape:"ribbon"}})

User: "Sort products cheapest first"
→ get_layout() to find section_id, then edit_layout(operation="sort", section_id="<id>", sort_by="price_asc")

User: "Make the heading bigger"
→ get_layout() to find heading node_id, then update_node(node_id, {{style_overrides: {{font_size_token: "2xl"}}}})
"""


def build_system_prompt(pamphlet_title: str, item_count: int) -> str:
    return SYSTEM_PROMPT + f"\n\n## Current pamphlet\nTitle: {pamphlet_title}\nProducts: {item_count}"
```

- [ ] **Step 3: Delete `ai_tools.py`**

```bash
del api\tools\pamphlets\ai_tools.py
```

- [ ] **Step 4: Verify imports**

```bash
PYTHONPATH=. python -c "from api.tools.pamphlets.ai_session import make_pamphlet_session; print('ok')"
```

Expected: `ok`

- [ ] **Step 5: Run all agent tests**

```bash
PYTHONPATH=. python -m pytest tests/test_agents_dsl.py tests/test_agents_infra.py -v
```

Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add api/tools/pamphlets/ai_session.py api/tools/pamphlets/system_prompt.py
git commit -m "refactor(pamphlets): migrate pamphlet session to 6-tool registry, update system prompt"
```

---

### Task 7: CSS product card fix — equal height, object-fit cover

**Files:**
- Modify: `api/tools/pamphlets/render/html.py`

- [ ] **Step 1: Update product card CSS in `render_pamphlet()`**

In `render_pamphlet()`, find the `.product-card` block in the `<style>` section and replace these lines:

Old block (lines ~60–65):
```python
.product-card{{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md,8px);padding:8px;display:flex;flex-direction:column;gap:4px;height:100%;overflow:hidden;}}
.product-card .product-img{{width:100%;height:72px;object-fit:contain;flex-shrink:0;}}
.product-card .product-name{{font-size:0.75rem;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}}
.product-card .product-prices{{display:flex;gap:4px;align-items:baseline;margin-top:auto;flex-wrap:wrap;}}
.product-badge{{background:var(--accent);color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:99px;align-self:flex-start;}}
```

New block:
```python
.product-card{{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md,8px);padding:8px;display:flex;flex-direction:column;height:100%;overflow:hidden;min-height:0;}}
.product-card .product-img-wrap{{width:100%;height:90px;overflow:hidden;flex-shrink:0;border-radius:4px;background:var(--border);}}
.product-card .product-img{{width:100%;height:100%;object-fit:cover;}}
.product-card .product-name{{font-size:0.7rem;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;flex-shrink:0;margin-top:4px;}}
.product-card .product-prices{{display:flex;gap:4px;align-items:baseline;margin-top:auto;flex-wrap:wrap;padding-top:4px;}}
.product-badge{{background:var(--accent);color:#fff;font-size:0.6rem;padding:2px 5px;border-radius:99px;align-self:flex-start;flex-shrink:0;}}
```

- [ ] **Step 2: Update `_render_product()` to use image wrapper div**

In `_render_product()`, replace the `img_html` line:

Old:
```python
img_html = f'<img class="product-img" src="{img_url}" alt="{name}">' if (n.show_image and img_url) else ""
```

New:
```python
if n.show_image and img_url:
    img_html = f'<div class="product-img-wrap"><img class="product-img" src="{img_url}" alt="{name}"></div>'
else:
    img_html = '<div class="product-img-wrap"></div>'
```

Always render the wrapper div so all cards have identical flex structure regardless of image availability.

- [ ] **Step 3: Verify render output**

```bash
PYTHONPATH=. python -c "
from api.tools.pamphlets.render.html import render_pamphlet
dsl = {'id':'p1','type':'page','width_mm':297,'height_mm':210,'lang':'en','padding':'sm','theme_id':'minimal_light','children':[{'id':'s1','type':'section','layout':'grid','cols':5,'rows':5,'gap':'xs','children':[{'id':'pr1','type':'product','item_id':'i1','show_image':True,'show_badge':True,'show_mrp':True,'show_offer':True}]}]}
items = {'i1':{'display_name':'Sugar 1kg','offer_price':42,'original_price':50,'image_url':'https://via.placeholder.com/100','highlight_text':'Save Rs 8'}}
html = render_pamphlet(dsl, {}, items)
assert 'product-img-wrap' in html, 'Missing product-img-wrap'
assert 'object-fit:cover' in html, 'Missing object-fit:cover'
print('ok')
"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add api/tools/pamphlets/render/html.py
git commit -m "fix(pamphlets): equal-height product cards — fixed image wrapper + object-fit:cover"
```

---

### Task 8: Schemas, model, service — add category + unit

**Files:**
- Modify: `api/tools/pamphlets/models.py`
- Modify: `api/tools/pamphlets/schemas.py`
- Modify: `api/tools/pamphlets/service.py`
- Modify: `api/tools/pamphlets/router.py`

- [ ] **Step 1: Add columns to `models.py`**

After `image_url = Column(Text)` in `PamphletItem`, add:

```python
    category = Column(Text, nullable=True)
    unit = Column(Text, nullable=True)
```

- [ ] **Step 2: Add fields to item schemas in `schemas.py`**

Add `category: str | None = None` and `unit: str | None = None` to:
- `PamphletItemCreate` (after `image_url`)
- `PamphletItemUpdate` (after `image_url`)
- `PamphletItemResponse` (after `image_url`)

- [ ] **Step 3: Update `service.py` — `add_item()`**

In `add_item()`, add after `image_url=item_data.image_url,`:
```python
        category=item_data.category,
        unit=item_data.unit,
```

In `create_pamphlet()` item loop, add after `image_url=item_data.image_url,`:
```python
            category=item_data.category,
            unit=item_data.unit,
```

In `duplicate_pamphlet()` item copy loop, add after `image_url=item.image_url,`:
```python
            category=item.category,
            unit=item.unit,
```

- [ ] **Step 4: Update `get_items_lookup()` in `service.py`**

Replace the return dict comprehension:

```python
def get_items_lookup(db: Session, pamphlet_id: str) -> dict:
    items = get_pamphlet_items(db, pamphlet_id)
    return {
        str(item.id): {
            "display_name": item.display_name,
            "offer_price": float(item.offer_price) if item.offer_price else None,
            "original_price": float(item.original_price) if item.original_price else None,
            "highlight_text": item.highlight_text,
            "image_url": item.image_url,
            "barcode": item.barcode,
            "category": item.category,
            "unit": item.unit,
        }
        for item in items
    }
```

- [ ] **Step 5: Update `_item_to_response()` in `router.py`**

Add `category` and `unit` at the end:

```python
def _item_to_response(item) -> PamphletItemResponse:
    return PamphletItemResponse(
        id=str(item.id),
        pamphlet_id=str(item.pamphlet_id),
        barcode=item.barcode,
        display_name=item.display_name,
        offer_price=float(item.offer_price) if item.offer_price is not None else None,
        original_price=float(item.original_price) if item.original_price is not None else None,
        highlight_text=item.highlight_text,
        sort_order=item.sort_order,
        image_url=item.image_url,
        category=item.category,
        unit=item.unit,
    )
```

- [ ] **Step 6: Verify**

```bash
PYTHONPATH=. python -c "
from api.tools.pamphlets.schemas import PamphletItemCreate
i = PamphletItemCreate(display_name='test', category='grains', unit='1kg')
print(i.category, i.unit)
"
```

Expected: `grains 1kg`

- [ ] **Step 7: Commit**

```bash
git add api/tools/pamphlets/models.py api/tools/pamphlets/schemas.py api/tools/pamphlets/service.py api/tools/pamphlets/router.py
git commit -m "feat(pamphlets): add category + unit to PamphletItem schema, model, service, response"
```

---

### Task 9: Image agent (LLM-driven)

**Files:**
- Create: `api/agents/image_agent.py`
- Create: `tests/test_image_agent.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_image_agent.py
from unittest.mock import patch, MagicMock
import asyncio


def test_find_image_uses_agent_with_name_and_barcode():
    mock_turn = MagicMock()
    mock_turn.assistant_text = "https://images.openfoodfacts.org/images/products/sugar.jpg"
    mock_turn.tool_executions = []

    with patch("api.agents.image_agent.ChatSession") as MockSession:
        instance = MockSession.return_value
        instance.send.return_value = mock_turn

        from api.agents.image_agent import find_image_for_product
        result = asyncio.get_event_loop().run_until_complete(
            find_image_for_product("Sugar 1kg", barcode="8901030012345", category="grocery", unit="1kg")
        )

    assert result == "https://images.openfoodfacts.org/images/products/sugar.jpg"
    sent_msg = instance.send.call_args[0][0]
    assert "Sugar 1kg" in sent_msg
    assert "8901030012345" in sent_msg


def test_find_image_returns_none_on_not_found():
    mock_turn = MagicMock()
    mock_turn.assistant_text = "I searched but could not find an image. NOT_FOUND"

    with patch("api.agents.image_agent.ChatSession") as MockSession:
        instance = MockSession.return_value
        instance.send.return_value = mock_turn

        from api.agents.image_agent import find_image_for_product
        result = asyncio.get_event_loop().run_until_complete(
            find_image_for_product("Unknown XYZ Product", barcode=None, category=None, unit=None)
        )

    assert result is None


def test_start_scan_task_creates_task():
    from api.agents.image_agent import start_scan_task, get_task

    with patch("api.agents.image_agent._run_scan_thread"):
        task_id = start_scan_task("pamphlet-123", [], lambda: None)

    task = get_task(task_id)
    assert task is not None
    assert task.pamphlet_id == "pamphlet-123"
```

- [ ] **Step 2: Run to verify fail**

```bash
PYTHONPATH=. python -m pytest tests/test_image_agent.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'api.agents.image_agent'`

- [ ] **Step 3: Write `api/agents/image_agent.py`**

```python
from __future__ import annotations
import asyncio
import threading
import uuid
from dataclasses import dataclass, field
from typing import Optional

from api.ai import ChatSession
from api.agents.tools.infra import build_infra_tools

_tasks: dict[str, "ImageTask"] = {}

_SYSTEM_PROMPT = """You are an image-finding agent for a supermarket product catalog.
Find a direct, publicly accessible product image URL for the given product.

Strategy (in order):
1. If barcode provided: call fetch_url("https://world.openfoodfacts.org/api/v0/product/{barcode}.json")
   - Parse JSON for: product.image_front_url or product.image_url
   - If found, use it directly without further searching.
2. If barcode missing or OFF had no image: call web_search with include_images=true
   - Query format: "{product_name} {unit} product photo"
   - Pick the most relevant image URL from the images list in the response.

Output rules:
- Your final message must contain the image URL on its own line.
- URL must be a direct image (.jpg, .jpeg, .png, .webp, .gif) or from a known image CDN.
- If no suitable image found after searching, output exactly: NOT_FOUND
"""


@dataclass
class ImageTask:
    task_id: str
    pamphlet_id: str
    status: str = "pending"
    current_product: str = ""
    total: int = 0
    done_count: int = 0
    updates: list[dict] = field(default_factory=list)
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "pamphlet_id": self.pamphlet_id,
            "status": self.status,
            "current_product": self.current_product,
            "total": self.total,
            "done_count": self.done_count,
            "updates": self.updates,
            "error": self.error,
        }


async def find_image_for_product(
    display_name: str,
    barcode: Optional[str],
    category: Optional[str],
    unit: Optional[str],
) -> Optional[str]:
    tools = build_infra_tools()
    session = ChatSession(
        provider="anthropic",
        model="claude-haiku-4-5-20251001",
        system_prompt=_SYSTEM_PROMPT,
        tools=tools,
        history=[],
    )
    msg = f"Find product image for: {display_name}"
    if barcode:
        msg += f"\nBarcode: {barcode}"
    if category:
        msg += f"\nCategory: {category}"
    if unit:
        msg += f"\nUnit/Size: {unit}"

    turn = session.send(msg)
    text = (turn.assistant_text or "").strip()

    if "NOT_FOUND" in text:
        return None

    for line in reversed(text.split("\n")):
        line = line.strip()
        if line.startswith("http"):
            return line
    return None


def _run_scan_thread(task: ImageTask, items: list[dict], db_factory) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_scan_items(task, items, db_factory))
    finally:
        loop.close()


async def _scan_items(task: ImageTask, items: list[dict], db_factory) -> None:
    task.status = "running"
    task.total = len(items)
    try:
        from api.tools.pamphlets.models import PamphletItem
        for item in items:
            task.current_product = item.get("display_name", "")
            url = await find_image_for_product(
                display_name=item.get("display_name", ""),
                barcode=item.get("barcode"),
                category=item.get("category"),
                unit=item.get("unit"),
            )
            if url:
                task.updates.append({
                    "item_id": item["id"],
                    "image_url": url,
                    "name": item.get("display_name"),
                })
                with db_factory() as db:
                    pi = db.query(PamphletItem).filter(PamphletItem.id == item["id"]).first()
                    if pi:
                        pi.image_url = url
                        db.commit()
            task.done_count += 1
        task.status = "done"
    except Exception as exc:
        task.status = "error"
        task.error = str(exc)


def start_scan_task(pamphlet_id: str, items: list[dict], db_factory) -> str:
    task_id = str(uuid.uuid4())[:8]
    task = ImageTask(task_id=task_id, pamphlet_id=pamphlet_id)
    _tasks[task_id] = task
    t = threading.Thread(
        target=_run_scan_thread, args=(task, items, db_factory), daemon=True
    )
    t.start()
    return task_id


def get_task(task_id: str) -> Optional[ImageTask]:
    return _tasks.get(task_id)
```

- [ ] **Step 4: Run tests**

```bash
PYTHONPATH=. python -m pytest tests/test_image_agent.py -v
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add api/agents/image_agent.py tests/test_image_agent.py
git commit -m "feat(agents): LLM-driven image agent — Claude Haiku + Tavily, SSE-ready task tracking"
```

---

### Task 10: Agent router — SSE stream + trigger endpoints

**Files:**
- Create: `api/agents/router.py`

- [ ] **Step 1: Identify SessionLocal import path**

```bash
PYTHONPATH=. python -c "from api.config.db import SessionLocal; print('api.config.db')" 2>/dev/null || python -c "from config.db import SessionLocal; print('config.db')"
```

Use whichever succeeds. Substitute that path wherever `SessionLocal` is imported in this task.

- [ ] **Step 2: Write `api/agents/router.py`**

```python
from __future__ import annotations
import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer

from api.dependencies import get_db, get_current_user
from api.tools.pamphlets import service as pamphlet_svc
from api.agents.image_agent import start_scan_task, get_task

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _token_auth(
    token: str | None = Query(default=None),
    credentials=Depends(HTTPBearer(auto_error=False)),
):
    raw = credentials.credentials if credentials else token
    if not raw:
        raise HTTPException(401, "Not authenticated")
    from api.core.security import decode_access_token
    payload = decode_access_token(raw)
    if not payload.get("sub"):
        raise HTTPException(401, "Invalid token")
    return payload


@router.post("/image/scan-all/{pamphlet_id}")
def trigger_image_scan(
    pamphlet_id: str,
    db=Depends(get_db),
    _=Depends(get_current_user),
):
    pamphlet = pamphlet_svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(404, "Pamphlet not found")

    all_items = pamphlet_svc.get_pamphlet_items(db, pamphlet_id)
    items_needing_images = [
        {
            "id": str(item.id),
            "display_name": item.display_name or "",
            "barcode": item.barcode,
            "category": item.category,
            "unit": item.unit,
        }
        for item in all_items
        if not item.image_url
    ]

    if not items_needing_images:
        return {"task_id": None, "message": "All items already have images", "count": 0}

    from api.config.db import SessionLocal  # update path if needed (see Step 1)
    task_id = start_scan_task(pamphlet_id, items_needing_images, SessionLocal)
    return {"task_id": task_id, "count": len(items_needing_images)}


@router.post("/image/scan-one/{pamphlet_id}/{item_id}")
def trigger_single_image(
    pamphlet_id: str,
    item_id: str,
    db=Depends(get_db),
    _=Depends(get_current_user),
):
    from api.tools.pamphlets.models import PamphletItem
    item = db.query(PamphletItem).filter(PamphletItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")

    from api.config.db import SessionLocal  # update path if needed
    items = [{
        "id": str(item.id),
        "display_name": item.display_name or "",
        "barcode": item.barcode,
        "category": item.category,
        "unit": item.unit,
    }]
    task_id = start_scan_task(pamphlet_id, items, SessionLocal)
    return {"task_id": task_id}


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str, _=Depends(_token_auth)):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    async def sse_generator() -> AsyncGenerator[str, None]:
        while True:
            t = get_task(task_id)
            if not t:
                break
            yield f"data: {json.dumps(t.to_dict())}\n\n"
            if t.status in ("done", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.get("/tasks/{task_id}")
def get_task_status(task_id: str, _=Depends(get_current_user)):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task.to_dict()
```

- [ ] **Step 3: Commit**

```bash
git add api/agents/router.py
git commit -m "feat(agents): agent router — scan-all, scan-one, SSE task stream"
```

---

### Task 11: Hook auto image fetch to pamphlet item add

**Files:**
- Modify: `api/tools/pamphlets/router.py`

- [ ] **Step 1: Add `BackgroundTasks` to `add_item` endpoint**

Add `BackgroundTasks` to the import at the top of `router.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
```

Replace the `add_item` endpoint:

```python
@router.post("/{pamphlet_id}/items", response_model=PamphletItemResponse, status_code=201)
def add_item(
    pamphlet_id: str,
    body: PamphletItemCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    pamphlet = service.get_pamphlet(db, pamphlet_id)
    if not pamphlet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pamphlet not found")
    item = service.add_item(db, pamphlet_id, body)
    db.commit()
    db.refresh(item)

    if not item.image_url:
        from api.config.db import SessionLocal  # update path if needed
        from api.agents.image_agent import start_scan_task
        start_scan_task(
            pamphlet_id=pamphlet_id,
            items=[{
                "id": str(item.id),
                "display_name": item.display_name or "",
                "barcode": item.barcode,
                "category": item.category,
                "unit": item.unit,
            }],
            db_factory=SessionLocal,
        )

    return _item_to_response(item)
```

- [ ] **Step 2: Verify import**

```bash
PYTHONPATH=. python -c "from api.tools.pamphlets.router import router; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add api/tools/pamphlets/router.py
git commit -m "feat(pamphlets): auto-trigger image agent on item add when image_url is empty"
```

---

### Task 12: Register agent router in main.py

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Find existing router registrations**

```bash
PYTHONPATH=. python -c "
import ast
src = open('api/main.py').read()
for n in ast.walk(ast.parse(src)):
    if isinstance(n, ast.Call) and 'include_router' in ast.unparse(n):
        print(n.lineno, ast.unparse(n))
"
```

- [ ] **Step 2: Add agent router near other router imports/registrations**

Add import:
```python
from api.agents.router import router as agents_router
```

Add registration (near other `app.include_router(...)` calls):
```python
app.include_router(agents_router)
```

- [ ] **Step 3: Start API and verify routes**

```bash
PYTHONPATH=. python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

Visit `http://localhost:8000/api/docs` — confirm `/api/agents/image/scan-all/{pamphlet_id}` and `/api/agents/tasks/{task_id}/stream` appear.

- [ ] **Step 4: Commit**

```bash
git add api/main.py
git commit -m "feat(api): register agent router at /api/agents"
```

---

### Task 13: Frontend types update

**Files:**
- Modify: `web/lib/pamphlet/types.ts`

- [ ] **Step 1: Add `PamphletItem` and `AgentTask` types**

Add to `web/lib/pamphlet/types.ts`:

```typescript
export interface PamphletItem {
  id: string;
  pamphlet_id: string;
  barcode: string | null;
  display_name: string | null;
  offer_price: number | null;
  original_price: number | null;
  highlight_text: string | null;
  sort_order: number;
  image_url: string | null;
  category: string | null;
  unit: string | null;
}

export interface AgentTask {
  task_id: string;
  pamphlet_id: string;
  status: "pending" | "running" | "done" | "error";
  current_product: string;
  total: number;
  done_count: number;
  updates: Array<{ item_id: string; image_url: string; name?: string }>;
  error: string;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to new types.

- [ ] **Step 3: Commit**

```bash
git add web/lib/pamphlet/types.ts
git commit -m "feat(web): add PamphletItem and AgentTask types"
```

---

### Task 14: Frontend API lib — item CRUD + agent calls

**Files:**
- Modify: `web/lib/pamphlet/api.ts`

- [ ] **Step 1: Add item CRUD + agent functions to `api.ts`**

Add after the existing `listModels` function:

```typescript
import { PamphletItem, AgentTask } from "./types";

export async function addItem(
  pamphletId: string,
  item: Partial<PamphletItem>
): Promise<PamphletItem> {
  const res = await fetch(`${BASE}/${pamphletId}/items`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Add item failed");
  return res.json();
}

export async function updateItem(
  pamphletId: string,
  itemId: string,
  patch: Partial<PamphletItem>
): Promise<PamphletItem> {
  const res = await fetch(`${BASE}/${pamphletId}/items/${itemId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Update item failed");
  return res.json();
}

export async function removeItem(pamphletId: string, itemId: string): Promise<void> {
  const res = await fetch(`${BASE}/${pamphletId}/items/${itemId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Remove item failed");
}

export async function reorderItems(pamphletId: string, orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      fetch(`${BASE}/${pamphletId}/items/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ sort_order: index }),
      })
    )
  );
}

export async function triggerImageScan(
  pamphletId: string
): Promise<{ task_id: string | null; count: number; message?: string }> {
  const res = await fetch(`/api/agents/image/scan-all/${pamphletId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Scan trigger failed");
  return res.json();
}

export function streamAgentTask(
  taskId: string,
  onUpdate: (task: AgentTask) => void,
  onDone: () => void
): () => void {
  const token = getToken() ?? "";
  const source = new EventSource(`/api/agents/tasks/${taskId}/stream?token=${encodeURIComponent(token)}`);
  source.onmessage = (e) => {
    const task: AgentTask = JSON.parse(e.data);
    onUpdate(task);
    if (task.status === "done" || task.status === "error") {
      source.close();
      onDone();
    }
  };
  source.onerror = () => {
    source.close();
    onDone();
  };
  return () => source.close();
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/lib/pamphlet/api.ts
git commit -m "feat(web): add item CRUD, reorder, image scan trigger + SSE stream to pamphlet API lib"
```

---

### Task 15: Frontend ProductsPanel component

**Files:**
- Create: `web/components/pamphlet/ProductsPanel.tsx`

- [ ] **Step 1: Create `ProductsPanel.tsx`**

```tsx
"use client";
import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Image, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PamphletItem } from "@/lib/pamphlet/types";
import {
  addItem,
  updateItem,
  removeItem,
  reorderItems,
  triggerImageScan,
  streamAgentTask,
} from "@/lib/pamphlet/api";

interface Props {
  pamphletId: string;
  initialItems: PamphletItem[];
  onItemsChange: () => void;
}

const EMPTY_FORM = {
  display_name: "",
  barcode: "",
  offer_price: "",
  original_price: "",
  highlight_text: "",
  image_url: "",
  category: "",
  unit: "",
};

const ITEM_FIELDS: [keyof typeof EMPTY_FORM, string][] = [
  ["display_name", "Name *"],
  ["barcode", "Barcode"],
  ["category", "Category"],
  ["unit", "Unit (e.g. 1kg, 500g)"],
  ["offer_price", "Offer Price (₹)"],
  ["original_price", "MRP (₹)"],
  ["highlight_text", "Badge Text"],
  ["image_url", "Image URL"],
];

export function ProductsPanel({ pamphletId, initialItems, onItemsChange }: Props) {
  const [items, setItems] = useState<PamphletItem[]>(initialItems);
  const [editItem, setEditItem] = useState<PamphletItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const filtered = items.filter((i) =>
    (i.display_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleSaveEdit() {
    if (!editItem) return;
    setSaving(true);
    try {
      const updated = await updateItem(pamphletId, editItem.id, {
        display_name: editItem.display_name,
        offer_price: editItem.offer_price,
        original_price: editItem.original_price,
        highlight_text: editItem.highlight_text,
        image_url: editItem.image_url,
        category: editItem.category,
        unit: editItem.unit,
      });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditItem(null);
      onItemsChange();
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!form.display_name.trim()) return;
    setSaving(true);
    try {
      const created = await addItem(pamphletId, {
        display_name: form.display_name,
        barcode: form.barcode || null,
        offer_price: form.offer_price ? parseFloat(form.offer_price) : null,
        original_price: form.original_price ? parseFloat(form.original_price) : null,
        highlight_text: form.highlight_text || null,
        image_url: form.image_url || null,
        category: form.category || null,
        unit: form.unit || null,
        sort_order: items.length,
      });
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      onItemsChange();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(itemId: string) {
    await removeItem(pamphletId, itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    onItemsChange();
  }

  async function handleMove(index: number, dir: -1 | 1) {
    const newItems = [...items];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[index], newItems[swapIdx]] = [newItems[swapIdx], newItems[index]];
    setItems(newItems);
    await reorderItems(pamphletId, newItems.map((i) => i.id));
    onItemsChange();
  }

  async function handleScanAll() {
    setScanning(true);
    setScanStatus("Starting scan...");
    try {
      const { task_id, count, message } = await triggerImageScan(pamphletId);
      if (!task_id) {
        setScanStatus(message ?? "All images already present.");
        setScanning(false);
        return;
      }
      setScanStatus(`Scanning ${count} products...`);
      streamAgentTask(
        task_id,
        (task) => {
          if (task.current_product) {
            setScanStatus(`${task.current_product} (${task.done_count}/${task.total})`);
          }
          if (task.updates.length > 0) {
            setItems((prev) =>
              prev.map((item) => {
                const upd = task.updates.find((u) => u.item_id === item.id);
                return upd ? { ...item, image_url: upd.image_url } : item;
              })
            );
          }
        },
        () => {
          setScanStatus("Scan complete.");
          setScanning(false);
          onItemsChange();
        }
      );
    } catch {
      setScanStatus("Scan failed.");
      setScanning(false);
    }
  }

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 shrink-0">
        <span className="text-xs font-semibold flex-1">Products ({items.length})</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowAdd(true)} title="Add product">
          <Plus className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={handleScanAll}
          disabled={scanning}
          title="Auto-fetch missing images"
        >
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {scanStatus && (
        <div className="px-3 py-1 text-[10px] text-muted-foreground bg-muted/20 border-b truncate">
          {scanStatus}
        </div>
      )}

      <div className="px-2 pt-2 shrink-0">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="h-7 text-xs"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-xs group"
          >
            {item.image_url ? (
              <img src={item.image_url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded bg-muted shrink-0 flex items-center justify-center">
                <Image className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.display_name}</p>
              <p className="text-muted-foreground">
                {item.offer_price != null ? `₹${item.offer_price}` : "—"}
                {item.original_price != null ? ` / ₹${item.original_price}` : ""}
              </p>
            </div>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleMove(index, -1)}>
                <ChevronUp className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleMove(index, 1)}>
                <ChevronDown className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditItem({ ...item })}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-8">
            {search ? "No matches." : "No products yet. Click + to add."}
          </p>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="grid gap-3 py-2">
              {(ITEM_FIELDS as [keyof PamphletItem, string][]).map(([field, label]) => (
                <div key={String(field)} className="grid grid-cols-3 items-center gap-2">
                  <Label className="text-xs text-right">{label}</Label>
                  <Input
                    className="col-span-2 h-8 text-xs"
                    value={(editItem[field] as string | number | null) ?? ""}
                    onChange={(e) =>
                      setEditItem({ ...editItem, [field]: e.target.value || null })
                    }
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {ITEM_FIELDS.map(([field, label]) => (
              <div key={field} className="grid grid-cols-3 items-center gap-2">
                <Label className="text-xs text-right">{label}</Label>
                <Input
                  className="col-span-2 h-8 text-xs"
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !form.display_name.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
```

Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add web/components/pamphlet/ProductsPanel.tsx
git commit -m "feat(web): ProductsPanel — product list with edit modal, reorder, image scan"
```

---

### Task 16: Frontend three-column layout

**Files:**
- Modify: `web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx`

- [ ] **Step 1: Replace editor page with three-column layout**

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, ImageIcon, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/pamphlet/ChatPanel";
import { PreviewIframe } from "@/components/pamphlet/PreviewIframe";
import { HistoryDrawer } from "@/components/pamphlet/HistoryDrawer";
import { ProductsPanel } from "@/components/pamphlet/ProductsPanel";
import { sendChatMessage, exportPdf, exportImage } from "@/lib/pamphlet/api";
import { PamphletItem } from "@/lib/pamphlet/types";
import { getToken } from "@/lib/auth";

export default function PamphletEditorPage() {
  const params = useParams();
  const router = useRouter();
  const pamphletId = params.id as string;

  const [dsl, setDsl] = useState<object | null>(null);
  const [theme, setTheme] = useState<object | null>(null);
  const [items, setItems] = useState<PamphletItem[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [exporting, setExporting] = useState<"pdf" | "img" | null>(null);
  const [title, setTitle] = useState("Pamphlet");

  const loadPamphlet = useCallback(() => {
    const token = getToken();
    fetch(`/api/tools/pamphlets/${pamphletId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) { router.replace("/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setTitle(data.title ?? "Pamphlet");
        setItems(data.items ?? []);
        if (!data.template_dsl && data.template_type !== "dsl") {
          router.replace(`/tools/pamphlet-generator/${pamphletId}/legacy`);
        } else {
          setDsl(data.template_dsl);
          setTheme(data.theme);
        }
      })
      .catch(console.error);
  }, [pamphletId, router]);

  useEffect(() => { loadPamphlet(); }, [loadPamphlet]);

  const handleDslUpdate = useCallback((newDsl: object, newTheme: object) => {
    setDsl(newDsl);
    setTheme(newTheme);
    setPreviewKey((k) => k + 1);
  }, []);

  const handleSend = useCallback(
    (message: string, provider: string, model: string) =>
      sendChatMessage(pamphletId, message, provider, model),
    [pamphletId]
  );

  const handleItemsChange = useCallback(() => {
    loadPamphlet();
    setPreviewKey((k) => k + 1);
  }, [loadPamphlet]);

  async function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    setExporting("pdf");
    try {
      const blob = await exportPdf(pamphletId);
      await triggerDownload(blob, `${title}.pdf`);
    } catch (e: unknown) {
      alert(`PDF export failed: ${e instanceof Error ? e.message : e}`);
    } finally { setExporting(null); }
  }

  async function handleExportImage() {
    setExporting("img");
    try {
      const blob = await exportImage(pamphletId);
      await triggerDownload(blob, `${title}.png`);
    } catch (e: unknown) {
      alert(`Image export failed: ${e instanceof Error ? e.message : e}`);
    } finally { setExporting(null); }
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/tools/pamphlet-generator")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-sm font-semibold flex-1 truncate">{title}</h1>
        <HistoryDrawer pamphletId={pamphletId} onRestore={() => setPreviewKey((k) => k + 1)} />
        <Button size="sm" variant="outline" onClick={handleExportImage} disabled={!!exporting || !dsl} className="gap-1">
          <ImageIcon className="w-4 h-4" />
          {exporting === "img" ? "Exporting..." : "PNG"}
        </Button>
        <Button size="sm" onClick={handleExportPdf} disabled={!!exporting || !dsl} className="gap-1">
          <Download className="w-4 h-4" />
          {exporting === "pdf" ? "Exporting..." : "PDF"}
        </Button>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat — 25% */}
        <div className="w-[25%] min-w-[220px] max-w-[320px] flex flex-col overflow-hidden shrink-0">
          <ChatPanel
            pamphletId={pamphletId}
            onDslUpdate={handleDslUpdate}
            onSend={handleSend}
          />
        </div>

        {/* Products — 22% */}
        <div className="w-[22%] min-w-[200px] max-w-[280px] flex flex-col overflow-hidden shrink-0">
          <ProductsPanel
            pamphletId={pamphletId}
            initialItems={items}
            onItemsChange={handleItemsChange}
          />
        </div>

        {/* Preview — remaining */}
        <div className="flex-1 overflow-auto min-w-0 bg-muted/20">
          <PreviewIframe
            pamphletId={pamphletId}
            dsl={dsl}
            theme={theme}
            refreshKey={previewKey}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 3: Start dev server and verify**

```bash
cd web && npm run dev
```

Open `http://localhost:3000/tools/pamphlet-generator/{any-id}` and confirm:
- Three columns visible (Chat | Products | Preview)
- Products panel shows list with thumbnail, name, price
- Hover a product → up/down/edit/delete buttons appear
- Click edit → modal opens with all 8 fields
- Click + → add dialog opens
- Image icon in header → triggers scan (check console for task_id response)

- [ ] **Step 4: Commit**

```bash
git add "web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx"
git commit -m "feat(web): three-column pamphlet editor — Chat | Products | Preview"
```

---

## Self-Review

### Spec coverage
1. ✅ Edit/move/add products — `ProductsPanel` with edit modal, add dialog, up/down reorder, delete
2. ✅ Equal-height flex cards — CSS Grid `grid-auto-rows:1fr`, fixed `product-img-wrap` 90px height, `object-fit:cover`
3. ✅ Image agent — LLM-driven Claude Haiku + Tavily; auto on item add (no `image_url`); scan-all button with SSE live progress
4. ✅ Foundational tools — two-layer registry in `api/agents/`; Layer 1: `web_search`+`fetch_url`; Layer 2: 6 DSL tools; any future agent imports from `api.agents.tools.infra`
5. ✅ Global scalable architecture — `api/agents/` package; `@tool` decorator re-exported; new agents add a file in `api/agents/`, register tools from `api.agents.tools.*`

### Placeholder scan
None — every step has actual code, exact commands, or expected output.

### Type consistency
- `PamphletState` imported from `api.tools.pamphlets.state` everywhere ✅
- `_find_node` imported from `api.tools.pamphlets.state` in `pamphlet_dsl.py` ✅
- `build_infra_tools()` → `list[Tool]` ✅
- `build_dsl_tools(state: PamphletState)` → `list[Tool]` ✅
- `ImageTask.to_dict()` keys match `AgentTask` TypeScript interface ✅
- `PamphletItemResponse` has `category` + `unit` ✅
- `streamAgentTask` callback receives `AgentTask` ✅
- `_item_to_response()` in `router.py` includes `category` + `unit` ✅
