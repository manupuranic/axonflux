# Tool Plugin System

## Purpose

Internal staff tools (pamphlet generator, cash closure, and future tools) are implemented as self-contained plugins. The core API and frontend have no hardcoded knowledge of individual tools — they discover them at startup via the registry.

## Adding a New Tool

### Backend (4 files)

Create `api/tools/<tool_name>/`:

```
api/tools/my_tool/
  __init__.py    ← declare MANIFEST (required)
  router.py      ← FastAPI APIRouter (required)
  service.py     ← business logic
  schemas.py     ← Pydantic models
  models.py      ← SQLAlchemy ORM model (if it needs a DB table)
```

**`__init__.py`** — declare the manifest:
```python
from api.tools.base import ToolManifest

MANIFEST = ToolManifest(
    id="my-tool",            # URL-safe slug → prefix: /api/tools/my-tool
    name="My Tool",
    description="What it does.",
    icon="Wrench",           # Lucide icon name
    required_role="staff",   # "staff" or "admin"
    tags=["ops"],
)
```

**`router.py`** — use the manifest ID as the prefix:
```python
from api.tools.my_tool import MANIFEST
router = APIRouter(prefix=f"/api/tools/{MANIFEST.id}", tags=[MANIFEST.name])
```

That's it. `api/tools/__init__.py:register_tools()` auto-discovers any subdirectory with both `__init__.py` (containing MANIFEST) and `router.py`. No changes to `main.py`.

### Frontend (2 steps)

1. Create `web/src/tools/my-tool/index.tsx` — the tool's UI entry component
2. Add its manifest entry to `web/src/tools/registry.ts`

The internal dashboard sidebar and routing update automatically.

## Discovery Mechanism

`api/tools/__init__.py:_discover_tools()` walks the `api/tools/` directory at startup:
- Skips directories starting with `_`
- Requires both `__init__.py` (with `MANIFEST`) and `router.py`
- Imports and registers the router

## Existing Tools

| Tool | ID | Tables Used | Required Role |
|---|---|---|---|
| Cash Closure | `cash-closure` | `app.cash_closure_records`, `raw.raw_sales_billwise` | staff |
| Pamphlet Generator | `pamphlets` | `app.pamphlets`, `app.pamphlet_items` | staff |

## `GET /api/tools` Endpoint

Returns all registered tool manifests as JSON. The frontend fetches this once on load to build the sidebar — no hardcoded tool names in the frontend bundle.

```json
[
  {
    "id": "cash-closure",
    "name": "Cash Closure",
    "description": "End-of-day cash reconciliation...",
    "icon": "Wallet",
    "required_role": "staff",
    "tags": ["finance", "daily-ops"]
  }
]
```
