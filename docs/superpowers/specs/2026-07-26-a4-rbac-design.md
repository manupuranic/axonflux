# A4 — Role-Based Access Control: Design

**Date:** 2026-07-26
**Status:** Approved (pending user spec review)
**Roadmap item:** Phase A4 (CLAUDE.md) / Academy Phase 1 "Production Backbone"

## Problem

JWT auth works and two roles exist (`staff`, `admin`), but the middle tier is missing.
The store manager must verify cash closures and approve sensitive actions without
holding developer-level admin access. Today those actions are gated `require_admin`
(equality check), so the manager either gets full admin or can't do their job.
Additionally, `app.users.role` has **no CHECK constraint** (CLAUDE.md claimed one
exists — it does not), and there is no way to create or manage users except
`scripts/create_admin.py` over SSH.

## Decisions (user-confirmed)

| Question | Decision |
|---|---|
| Pipeline trigger access | **manager+** (roadmap table said staff; superseded — staff can't hammer a long rebuild) |
| Role semantics | **Linear hierarchy** `staff(1) < manager(2) < admin(3)`, guard factory |
| User creation / role change | **Admin-only API + Settings UI section** |
| Frontend scope | **Central `hasRole` helper + show/hide gates**; backend 403 is the enforcement |

## Design

### 1. Guard factory (`api/dependencies.py`)

```python
ROLE_LEVELS = {"staff": 1, "manager": 2, "admin": 3}

def require_role(minimum: str):
    def guard(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if ROLE_LEVELS.get(current_user.role, 0) < ROLE_LEVELS[minimum]:
            raise HTTPException(status_code=403, detail=f"{minimum} access required")
        return current_user
    return guard

require_staff = require_role("staff")     # also rejects unknown/garbage roles (level 0)
require_manager = require_role("manager")
require_admin = require_role("admin")     # replaces equality version; same name → no import churn
```

- 401 = unknown caller (bad/expired/missing token). 403 = known caller, insufficient role.
- `get_current_user` currently defaults a missing `role` claim to `"staff"`
  (`payload.get("role", "staff")`). Tightened: default becomes `""` → level 0 → 403 on
  every guarded route. All legitimate tokens are minted by our login with the claim;
  the fallback only masks forged or malformed tokens.
- Adding a fixed role later = one dict line (+ CHECK migration + frontend mirror).
- Callsites declare intent (`require_manager`), not mechanism — a future swap of the
  guard internals (levels → permission sets) touches this one file only.

### 2. Migration 013 — role CHECK constraint

`ALTER TABLE app.users ADD CONSTRAINT users_role_check CHECK (role IN ('staff','manager','admin'))`.
Existing rows are only staff/admin, so it applies cleanly. Downgrade drops the constraint.

### 3. Endpoint audit matrix

| Endpoints | Gate | Change |
|---|---|---|
| Pipeline trigger + mutating ops (`api/routers/pipeline.py`) | manager+ | was admin |
| Pipeline status/history reads | staff+ | was admin |
| Cash closure submit (`api/tools/cash_closure/`) | staff+ | unchanged |
| Cash closure verify/reject | manager+ | was admin |
| Entity resolution confirm/reject (`api/tools/entity_resolution/`) | manager+ | was admin |
| Entity resolution reads/review | staff+ | unchanged |
| BOM confirm/reject (`api/tools/bom/`) | staff+ | explicit per roadmap |
| Pamphlets, Campaign Studio, analytics, customers, suppliers, products (incl. PATCH + image upload) | staff+ | unchanged (any authenticated) |
| User management (new) | admin | new |

`require_staff` replaces bare `get_current_user` on business routes so garbage roles
in a forged/stale token are rejected rather than treated as staff.

The exact route-by-route list is enumerated during implementation planning; the
matrix above is authoritative for any ambiguity.

### 4. User management (`api/routers/users.py`, admin-gated)

- `GET /api/users` — list (id, username, full_name, role, is_active, created_at, last_login_at)
- `POST /api/users` — create (username, password, full_name, role); role validated against `ROLE_LEVELS`
- `PATCH /api/users/{id}` — change role / is_active / full_name / reset password
- No DELETE — deactivate via `is_active=false`
- Safety rails: an admin cannot change their own role or deactivate themselves
- Login must reject `is_active=false` users (verify existing behavior; enforce if missing)
- Frontend: "Users" section on Settings page, rendered only for admin

### 5. Frontend gates (`web/lib/auth.ts` + pages)

- `hasRole(min: "staff" | "manager" | "admin"): boolean` — mirrors `ROLE_LEVELS`
- Replace ad-hoc `isAdmin` checks (entity-resolution page, cash-closure page)
- Hide below-threshold controls: cash verify/reject (manager+), entity confirm/reject
  (manager+), pipeline trigger / Refresh Data button (manager+), Users section (admin)
- UI hiding is UX only; backend 403 is the enforcement boundary

### 6. Tests

- `tests/test_dependencies_roles.py` — parametrized (role × guard) lattice matrix;
  unknown role → 403; token with missing role claim → 403 on all guarded routes
  (never silently treated as staff)
- `tests/conftest.py` — manager user + `manager_headers` fixture
- `tests/test_api_auth.py` — manager login; live-endpoint matrix: pipeline trigger
  (staff 403 / manager passes / admin passes), cash verify (staff 403 / manager passes),
  BOM confirm (staff passes), entity confirm (staff 403 / manager passes)
- `tests/test_api_users.py` — admin CRUD happy paths; staff and manager 403 on every
  user endpoint; invalid role rejected; self-demotion and self-deactivation blocked;
  deactivated user login → 401
- Existing `test_staff_cannot_access_admin_route` (staff 403 on pipeline trigger)
  remains valid under manager+

## Extension paths (explicitly scoped out)

- **Agent / machine identities are NOT roles.** Phase E MCP consumers authenticate via
  a separate API-key plane (machine credential, read-only scope). Machines are
  orthogonal to the human ladder — they don't fit a linear order and never enter
  `ROLE_LEVELS`.
- **Runtime custom roles** (admin invents roles in UI) require a permission-set model
  (`app.roles` + role→permission mapping). Flip point: the first pair of roles that
  are non-comparable (each can do something the other can't) breaks the linear
  lattice. Until then, levels win on simplicity. Guard callsites are already
  insulated from that future swap.
- **JWT role staleness:** role lives in the token; changes take effect at next
  login/expiry. Accepted for a single-store internal tool.

## Out of scope

- Refresh tokens, token revocation lists
- Phase E API-key auth plane
- Per-object ownership checks (e.g. "only the submitter can edit their closure")
