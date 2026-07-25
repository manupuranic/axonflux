# ADR 002: Staff Tools as Plugin System

**Status:** Accepted

## Context

The application needs internal staff tools (cash closure, pamphlet generator, and more to come). Options considered:
1. Hardcode each tool as routes in `main.py` and components in the frontend sidebar
2. Implement a plugin system where each tool is self-contained and auto-discovered

## Decision

Tools are self-contained plugins discovered at startup. Neither `main.py` nor the frontend sidebar has hardcoded tool names.

**Backend:** Each tool is a directory under `api/tools/<name>/` with a `MANIFEST` in `__init__.py` and an `APIRouter` in `router.py`. The `register_tools()` function in `api/tools/__init__.py` walks the directory and mounts all routers automatically.

**Frontend:** The sidebar's `links` array in `web/components/shared/Sidebar.tsx` lists nav entries, each with an optional `minRole`. `GET /api/tools` exists as a discovery endpoint but the frontend does not consume it — server-driven nav was designed and never wired, and the dead `required_role` manifest field was removed in 2026-07 rather than left looking authoritative (see ADR 006).

## Consequences

- **Adding a new tool** requires creating one directory with 2–4 files. No changes to `main.py`.
- **Removing a tool** is safe — just delete the directory. No orphaned route registrations.
- **Role-based access is NOT a manifest concern.** Each route declares its own guard (`require_staff` / `require_manager` / `require_admin`) — that is the enforcement boundary. Nav visibility is a separate, frontend-only question answered by `minRole` in the sidebar links array. A tool is not "a staff tool"; individual endpoints have individual gates (cash closure submits at staff, verifies at manager).
- **Slight startup overhead:** Directory scanning at startup is negligible (< 1ms for a handful of tools).
