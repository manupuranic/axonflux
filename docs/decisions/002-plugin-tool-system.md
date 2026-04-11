# ADR 002: Staff Tools as Plugin System

**Status:** Accepted

## Context

The application needs internal staff tools (cash closure, pamphlet generator, and more to come). Options considered:
1. Hardcode each tool as routes in `main.py` and components in the frontend sidebar
2. Implement a plugin system where each tool is self-contained and auto-discovered

## Decision

Tools are self-contained plugins discovered at startup. Neither `main.py` nor the frontend sidebar has hardcoded tool names.

**Backend:** Each tool is a directory under `api/tools/<name>/` with a `MANIFEST` in `__init__.py` and an `APIRouter` in `router.py`. The `register_tools()` function in `api/tools/__init__.py` walks the directory and mounts all routers automatically.

**Frontend:** A `registry.ts` file holds a static list of tool manifests. The sidebar and routing are built from this list. `GET /api/tools` can optionally be used for server-driven feature flagging.

## Consequences

- **Adding a new tool** requires creating one directory with 2–4 files. No changes to `main.py` or `registry.ts` routing logic.
- **Removing a tool** is safe — just delete the directory. No orphaned route registrations.
- **Role-based access** is declared per-tool in the manifest (`required_role: "staff" | "admin"`). The frontend hides tools the current user doesn't have access to.
- **Slight startup overhead:** Directory scanning at startup is negligible (< 1ms for a handful of tools).
