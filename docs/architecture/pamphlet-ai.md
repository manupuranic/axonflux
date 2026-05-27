# Pamphlet AI — Chat Architecture

How the pamphlet generator's chat assistant edits the DSL tree via natural language.

## Goals

1. Staff types "make it 4 columns" → DSL updates, preview refreshes
2. Reliability with weak LLMs (Haiku 4.5 default — chosen for cost/speed)
3. Zero new Python code for most future features

## Design history

The chat tool registry has evolved through three shapes:

| Version | Date | Approach | Why it broke |
|---|---|---|---|
| v1 | 2026-05-22 | 18 specialised tools (one per DSL op) | Tool-choice paralysis, context bloat |
| v2 | 2026-05-25 | 6 composable primitives | Worked with Sonnet, failed with Haiku — multi-step chains dropped |
| v3 | 2026-05-27 | Atomic semantic tools + universal patch + DSL in prompt | Current |

## The reliability problem

Haiku 4.5 cannot reliably chain `get_layout` → `update_node`. Symptom:
```
User: "Make it 4 cards per row"
LLM: <tool>get_layout()</tool>
LLM: "Done! Grid is now 4 columns." ← hallucinated; no update_node call
```

Root cause is model capability, not architecture. Fix has two layers:

### Layer 1 — Atomic semantic tools (collapse chains)

Each common operation gets a single tool that auto-discovers what it needs:

| Tool | What it does |
|---|---|
| `set_grid(cols, rows, image_width_pct)` | Auto-finds the product grid section, updates dimensions |
| `style_region(region, ...style)` | Resolves `footer|header|all_text|all_headings` to nodes, applies styles |
| `add_banner(headline, position, ...)` | Position `top|bottom`; `bottom` auto-detects footer location |

These collapse `get_layout → update_node × N` into one call. Weak models can't drop a step they don't need to take.

### Layer 2 — Universal `apply_dsl_patch(ops)`

One tool covers ALL DSL mutations. Op vocabulary:

```json
{"op": "set",    "node_id": "abc",       "field": "cols", "value": 4}
{"op": "style",  "node_id": "abc",       "style": {"font_size_px": 18}}
{"op": "insert", "parent_id": "page1",   "index": 0,      "node": {...}}
{"op": "remove", "node_id": "xyz"}
{"op": "move",   "node_id": "xyz",       "new_parent_id": "page1", "index": 5}
```

Why node IDs not JSON Pointers (`/children/3/style`): LLMs handle named references way better than positional paths. Per-op results returned individually — partial failure doesn't kill the batch.

### Layer 3 — DSL summary in system prompt

`build_system_prompt(title, count, dsl=...)` walks the DSL and emits a compact outline:

```
- [p1] page
  - [hdr] text variant=heading content="Puranic Health Mart"
  - [grid1] section layout=grid cols=5 rows=5 image_width_pct=38
    - [pr1] product item_id=i1
    - [pr2] product item_id=i2
    - ... (43 more product nodes)
    - [pr45] product item_id=i45
  - [banner1] offer_banner shape=ribbon headline="Monsoon offers"
  - [foot1] contact_strip phone address
```

LLM reads IDs from the prompt and emits `apply_dsl_patch(ops)` with no prior tool call. Eliminates the failure point (the missing `get_layout` round-trip).

Cost: ~500 extra prompt tokens per turn. Worth it — chat went from ~30% "did nothing" failure rate to near-zero.

## Defensive parsing

LLMs sometimes emit `ops` as a JSON string with Python-literal syntax:
```python
ops="[{op:'move',node_id:'abc'}]"  # bare keys, single quotes — invalid JSON
```

`_coerce_ops_list` handles this:
1. If `ops` is already a list → use it
2. If string → try `json.loads`
3. If fails → regex-repair (quote bare keys, single→double quotes) → retry
4. If still fails → return `{error, hint}` so LLM can self-correct

## Tool registration

```python
# api/tools/pamphlets/ai_session.py
session = ChatSession(
    provider=...,
    model=...,
    system_prompt=build_system_prompt(title, len(items), dsl=dsl),
    tools=build_dsl_tools(state) + build_item_tools(state),
    history=history,
)
```

Tools are closures over `PamphletState`. Each tool mutates `state.dsl` and sets `state.dirty = True`. The chat handler in `api/tools/pamphlets/router.py` checks `state.dirty` post-turn, validates via `render_pamphlet(...)` (Pydantic round-trip), and saves a new version if valid.

## Files

- `api/agents/tools/pamphlet_dsl.py` — all DSL tools + region resolver + lenient parser
- `api/agents/tools/pamphlet_items.py` — item management (staged for approval)
- `api/tools/pamphlets/system_prompt.py` — prompt text + DSL summarizer
- `api/tools/pamphlets/ai_session.py` — session factory
- `api/tools/pamphlets/router.py` — `/chat` endpoint, dirty-check, version save
- `api/tools/pamphlets/state.py` — `PamphletState`, `_find_node`

## Adding new capabilities

99% of the time: no new Python code needed. The LLM emits patches against existing DSL fields. Just add fields to the relevant `*Node` Pydantic model in `render/primitives.py`, render them in `render/html.py`, document them in the system prompt examples.

When to add an atomic tool: an operation needs cross-node discovery + multi-step coordination AND happens often enough to be worth the maintenance burden. Most "I want to add X" requests are one `apply_dsl_patch` call.

## Future

- **Strong-model upgrade**: switching chat default to Sonnet 4.5/4.6 would eliminate the need for atomic tools entirely (could keep `apply_dsl_patch` as the only mutation tool). Cost ~6× per turn, but worth it once chat usage grows.
- **Hybrid routing**: classifier picks Haiku for trivial ops, Sonnet for complex ones.
- **Per-page DSL**: current pagination is render-time. Making pages first-class DSL nodes would enable "banner on page 2 only" type requests without architecture changes.
