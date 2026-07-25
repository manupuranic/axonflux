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
    tags=["ops"],
    # No role field — see "Access control" below.
)
```

**`router.py`** — use the manifest ID as the prefix:
```python
from api.tools.my_tool import MANIFEST
router = APIRouter(prefix=f"/api/tools/{MANIFEST.id}", tags=[MANIFEST.name])
```

That's it. `api/tools/__init__.py:register_tools()` auto-discovers any subdirectory with both `__init__.py` (containing MANIFEST) and `router.py`. No changes to `main.py`.

### Frontend (2 steps)

1. Create the page under `web/app/(internal)/tools/my-tool/page.tsx`
2. Add an entry to the `links` array in `web/components/shared/Sidebar.tsx`, with
   `minRole` if the nav entry should be hidden below a role

The sidebar is a static array, not server-driven — adding a tool is a deliberate
two-line frontend edit.

## Access control

Two separate questions, deliberately answered in two places:

| Question | Answered by | Nature |
|---|---|---|
| May this request proceed? | `Depends(require_staff / require_manager / require_admin)` on each route | Security boundary |
| Should this nav entry render? | `minRole` on the sidebar links array | UX only |

They are not duplicates of one fact. Endpoints inside a single tool can sit at
different levels — cash closure accepts submissions at staff and verifications at
manager — so "the tool's role" is not a well-formed concept. The manifest carries
no role field for exactly this reason; one existed until 2026-07, was read by
nothing, and made unguarded routes look protected.

## Discovery Mechanism

`api/tools/__init__.py:_discover_tools()` walks the `api/tools/` directory at startup:
- Skips directories starting with `_`
- Requires both `__init__.py` (with `MANIFEST`) and `router.py`
- Imports and registers the router

## Existing Tools

| Tool | ID | Tables Used | Route gates |
|---|---|---|---|
| Cash Closure | `cash-closure` | `app.cash_closure_records`, `raw.raw_sales_billwise` | staff; verify/reject at manager |
| Pamphlet Generator | `pamphlets` | `app.pamphlets`, `app.pamphlet_items` | staff |
| Campaign Studio | `campaign-studio` | `app.campaigns`, `app.campaign_products` | staff |
| Entity Resolution | `entity-resolution` | `app.product_aliases`, `app.product_merge_suggestions` | staff reads; confirm/reject at manager; recompute + alias delete at admin |
| BOM Manager | `bom` | `app.product_bom`, `app.product_bom_suggestions` | staff |

## `GET /api/tools` Endpoint

Returns all registered tool manifests as JSON (staff-gated). Intended for
server-driven nav; **currently unused** — the sidebar is a static array. Kept as a
discovery endpoint, but treat it as unproven until something reads it.

```json
[
  {
    "id": "cash-closure",
    "name": "Cash Closure",
    "description": "End-of-day cash reconciliation...",
    "icon": "Wallet",
    "tags": ["finance", "daily-ops"]
  }
]
```
