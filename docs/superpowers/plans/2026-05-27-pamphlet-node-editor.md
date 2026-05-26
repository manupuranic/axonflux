# Pamphlet Inline Node Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click any node in the pamphlet preview → a slide-over panel opens with editable fields for that node → Save writes directly to DB without LLM involvement.

**Architecture:** Inject `data-node-id` + click script into preview HTML → `postMessage` to parent → React slide-over panel → direct `PATCH` endpoints (no versioning, no LLM).

**Tech Stack:** FastAPI (PATCH endpoint), Next.js (slide-over panel, postMessage listener), html.py (data attributes + injected JS)

---

### Task 1: Add `data-node-id` attributes + click script to preview HTML

**Files:**
- Modify: `api/tools/pamphlets/render/html.py`

Add `data-node-id="{id}" data-node-type="{type}"` to the root element of each editable node renderer:
- `_render_text` → on the `<p>` or `<div>` element
- `_render_product` → on the outer `.product-card` div
- `_render_offer_banner` → on the outer banner div
- `_render_section` → on the section/grid div (for cols/rows editing)
- `_render_image` → on the `<img>` wrapper div

Inject into the `<head>` of the rendered HTML:

```html
<style>
  [data-node-id] { cursor: pointer; }
  [data-node-id]:hover { outline: 1px dashed #93c5fd; outline-offset: 1px; }
  [data-node-id].node-selected { outline: 2px solid #3b82f6 !important; outline-offset: 2px; }
</style>
<script>
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-node-id]');
    document.querySelectorAll('.node-selected').forEach(function(n) { n.classList.remove('node-selected'); });
    if (!el) return;
    el.classList.add('node-selected');
    window.parent.postMessage({
      type: 'node-select',
      nodeId: el.dataset.nodeId,
      nodeType: el.dataset.nodeType
    }, '*');
  });
</script>
```

- [ ] Add `data-node-id` and `data-node-type` to `_render_text`
- [ ] Add to `_render_product`
- [ ] Add to `_render_offer_banner`
- [ ] Add to `_render_section` (grid sections only, add to the wrapper div)
- [ ] Add to `_render_image`
- [ ] Inject `<style>` block into `<head>` in `render_pamphlet()`
- [ ] Inject `<script>` block before `</body>` in `render_pamphlet()`
- [ ] Verify preview still renders correctly

```bash
git add api/tools/pamphlets/render/html.py
git commit -m "feat(pamphlet): inject node-select click script + data-node-id attributes into preview HTML"
```

---

### Task 2: Add general `PATCH /{pamphlet_id}/nodes/{node_id}` endpoint

**Files:**
- Modify: `api/tools/pamphlets/router.py`

The endpoint accepts `{patch: dict}` and deep-merges it into the node's fields in the DSL. Uses `_find_node` from `state.py` to locate the node.

```python
class NodePatch(BaseModel):
    patch: dict

@router.patch("/{pamphlet_id}/nodes/{node_id}")
def patch_node(
    pamphlet_id: str,
    node_id: str,
    body: NodePatch,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    import copy as _copy
    from sqlalchemy.orm.attributes import flag_modified
    from api.tools.pamphlets.state import _find_node
    pamphlet = svc.get_pamphlet(db, pamphlet_id)
    if not pamphlet or not pamphlet.template_dsl:
        raise HTTPException(404, "Pamphlet not found")
    dsl = _copy.deepcopy(pamphlet.template_dsl)
    node, _, _ = _find_node(dsl, node_id)
    if node is None:
        raise HTTPException(404, f"Node {node_id!r} not found")
    # Merge patch — handle style_overrides as sub-merge
    for k, v in body.patch.items():
        if k == "style_overrides" and isinstance(v, dict):
            existing = node.get("style_overrides") or {}
            node["style_overrides"] = {**existing, **v}
        else:
            node[k] = v
    pamphlet.template_dsl = dsl
    flag_modified(pamphlet, "template_dsl")
    db.commit()
    return {"ok": True, "node_id": node_id}
```

- [ ] Add `NodePatch` schema class
- [ ] Add `PATCH /{pamphlet_id}/nodes/{node_id}` endpoint
- [ ] Test: `curl -X PATCH .../nodes/{id} -d '{"patch": {"content": "hello"}}'`

```bash
git add api/tools/pamphlets/router.py
git commit -m "feat(pamphlet): add general PATCH /nodes/{node_id} endpoint for direct DSL edits"
```

---

### Task 3: Add `patchNode` to frontend API lib

**Files:**
- Modify: `web/lib/pamphlet/api.ts`
- Modify: `web/lib/pamphlet/types.ts`

```typescript
// types.ts — add
export interface NodeEditPanel_SelectedNode {
  nodeId: string;
  nodeType: string;
}

// api.ts — add
export async function patchNode(
  pamphletId: string,
  nodeId: string,
  patch: Record<string, unknown>
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/${pamphletId}/nodes/${nodeId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ patch }),
  });
  if (!res.ok) throw new Error("Node patch failed");
  return res.json();
}
```

- [ ] Add `patchNode` to `api.ts`
- [ ] Add `NodeEditPanel_SelectedNode` type to `types.ts`

```bash
git add web/lib/pamphlet/api.ts web/lib/pamphlet/types.ts
git commit -m "feat(pamphlet): add patchNode API function"
```

---

### Task 4: Update PreviewIframe to emit selected node via callback

**Files:**
- Modify: `web/components/pamphlet/PreviewIframe.tsx`

Add a `onNodeSelect?: (nodeId: string, nodeType: string) => void` prop. Listen for `postMessage` from the iframe on the window. Filter by `event.data.type === 'node-select'`.

```typescript
useEffect(() => {
  function handleMessage(e: MessageEvent) {
    if (e.data?.type === 'node-select' && onNodeSelect) {
      onNodeSelect(e.data.nodeId, e.data.nodeType);
    }
  }
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, [onNodeSelect]);
```

- [ ] Add `onNodeSelect` prop to `PreviewIframe`
- [ ] Add `useEffect` postMessage listener
- [ ] Verify: clicking preview in browser triggers callback (check with console.log first)

```bash
git add web/components/pamphlet/PreviewIframe.tsx
git commit -m "feat(pamphlet): PreviewIframe emits onNodeSelect via postMessage listener"
```

---

### Task 5: Build `NodeEditPanel` slide-over component

**Files:**
- Create: `web/components/pamphlet/NodeEditPanel.tsx`

Panel slides in from the right, overlays the preview. Shows different fields per `nodeType`. On Save: calls `patchNode` for DSL fields, `updateItem` for product data fields (when nodeType === "product").

**Props:**
```typescript
interface Props {
  pamphletId: string;
  nodeId: string;
  nodeType: string;
  dsl: object;             // to find current node values
  items: PamphletItem[];   // to find product item data
  onClose: () => void;
  onSaved: () => void;     // triggers preview refresh
}
```

**Field map per nodeType:**

| nodeType | Fields shown |
|---|---|
| `text` | content (textarea), variant (select), align (select), font_size_token (select), font_weight (select: 400/600/700/900), color_token (select) |
| `offer_banner` | headline (input), subtext (input), shape (select: ribbon/badge/strip), accent_color_token (select) |
| `image` | src (input), fit (select: cover/contain), radius (select: none/sm/md/lg) |
| `section` | cols (number input), rows (number input), gap (select) |
| `product` | display_name (input), offer_price (number), original_price (number), highlight_text (input) — all from `pamphlet_items` via `updateItem` |

**Save logic:**
```typescript
async function handleSave() {
  if (nodeType === 'product') {
    // find item_id from node in DSL, then call updateItem
    await updateItem(pamphletId, itemId, { display_name, offer_price, original_price, highlight_text });
  } else {
    await patchNode(pamphletId, nodeId, patch);
  }
  onSaved();
}
```

**Layout:** fixed right-side overlay, 280px wide, full height, shadow-xl, close button top-right, scrollable form body, sticky Save button at bottom.

- [ ] Create `NodeEditPanel.tsx` with slide-over shell (fixed positioning, shadow, close button)
- [ ] Add field rendering per nodeType (switch on nodeType)
- [ ] Wire form state: initialize from current node values (walk DSL to find node by nodeId)
- [ ] For product nodes: look up item_id in DSL node, find item in items array, pre-populate fields
- [ ] Implement `handleSave` — routes to right endpoint per nodeType
- [ ] Add loading state on Save button

```bash
git add web/components/pamphlet/NodeEditPanel.tsx
git commit -m "feat(pamphlet): NodeEditPanel slide-over — per-node-type form, direct save, no LLM"
```

---

### Task 6: Wire NodeEditPanel into the editor page

**Files:**
- Modify: `web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx`

Add `selectedNode` state. Pass `onNodeSelect` to `PreviewIframe`. Render `NodeEditPanel` conditionally. `onSaved` calls `loadPamphlet()` + `setPreviewKey`.

```typescript
const [selectedNode, setSelectedNode] = useState<{ nodeId: string; nodeType: string } | null>(null);

// In JSX, preview column:
<div className="flex-1 overflow-auto min-w-0 bg-muted/20 relative">
  <PreviewIframe
    pamphletId={pamphletId}
    dsl={dsl}
    theme={theme}
    refreshKey={previewKey}
    onNodeSelect={(nodeId, nodeType) => setSelectedNode({ nodeId, nodeType })}
  />
  {selectedNode && (
    <NodeEditPanel
      pamphletId={pamphletId}
      nodeId={selectedNode.nodeId}
      nodeType={selectedNode.nodeType}
      dsl={dsl ?? {}}
      items={items}
      onClose={() => setSelectedNode(null)}
      onSaved={() => { handleItemsChange(); setPreviewKey(k => k + 1); }}
    />
  )}
</div>
```

- [ ] Add `selectedNode` state
- [ ] Pass `onNodeSelect` to `PreviewIframe`
- [ ] Render `NodeEditPanel` conditionally over preview column
- [ ] Wire `onSaved` to `handleItemsChange` + `setPreviewKey`
- [ ] Test: click text node → panel opens with correct content → edit → Save → preview refreshes

```bash
git add web/app/(internal)/tools/pamphlet-generator/[id]/page.tsx
git commit -m "feat(pamphlet): wire NodeEditPanel into editor page — click-to-edit any node"
```
