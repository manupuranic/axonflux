# ADR 006 — RBAC: linear role lattice, not permission sets; machines are not roles

**Date:** 2026-07-26
**Status:** Accepted (shipped as Phase A4)
**Spec:** `docs/superpowers/specs/2026-07-26-a4-rbac-design.md`

## Context

Three kinds of humans use one dashboard: counter staff, the store manager, and the
developer/admin. JWT auth existed with two roles enforced by a single equality-check
`require_admin`. The manager either got full admin or couldn't verify cash closures.
`app.users.role` was an unconstrained TEXT column, and a missing role claim in a
token silently became `"staff"`.

## Decision

1. **Linear lattice, one source of truth.** `ROLE_LEVELS = {staff: 1, manager: 2, admin: 3}`
   in `api/dependencies.py`; a `require_role(minimum)` factory generates all guards.
   Anything not in the dict maps to level 0 and fails every gate — garbage or missing
   role claims are rejected, never treated as implicit staff.
2. **Per-route declaration, not middleware.** Guards are FastAPI dependencies in each
   route signature: policy is visible where the route is defined, greppable, and
   testable in isolation.
3. **Machine identities are NOT roles.** Phase E MCP consumers will authenticate with
   scoped API keys on a separate plane. Machines are orthogonal to the human ladder
   (may read analytics, must never verify cash) — non-comparable access breaks a
   linear order.
4. **Runtime custom roles rejected (YAGNI).** The flip point is nameable: the first
   pair of roles where each can do something the other can't kills the total order,
   and the design must switch to permission sets (`app.roles` + role→permission).
   Callsites already declare intent (`require_manager`), so that future swap touches
   one file.

## Consequences

- Adding a fixed role = one dict line + a CHECK-constraint migration + the frontend
  mirror in `web/lib/auth.ts`. No callsite changes.
- Role lives in the JWT: role changes apply at next login. Accepted staleness for a
  three-person internal tool.
- Migration 013 pins `role IN ('staff','manager','admin')` at the DB.

## Lesson from the audit (worth remembering)

The endpoint audit was executed as a grep-driven sweep over `Depends(get_current_user)`.
That replaces existing guards perfectly — and is structurally blind to routes that
never had a guard. The final whole-branch review found `/api/documentation/*` fully
unauthenticated and two SSE query-token side-door helpers (agents stream, pamphlet
preview) still carrying the old default-to-staff fallback. Enforcement audits must
enumerate the whole surface (every route, every auth helper), not just diff the
guards that already exist.
