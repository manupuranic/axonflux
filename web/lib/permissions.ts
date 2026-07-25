import { hasRole, type Role } from "./auth";

/**
 * UI permission policy — the single place that answers "should this control render?".
 *
 * This is UX, not security. The server's per-route guards (api/dependencies.py)
 * are the enforcement boundary; every action listed here is independently gated
 * there. Hiding a control only prevents a user from clicking into a 403.
 *
 * Components name the action they gate ("verifyCashClosure"), never the role.
 * Changing who may do something is one edit here, mirroring the backend where
 * a route declares require_manager rather than comparing roles inline.
 */
export const PERMISSIONS = {
  runPipeline: "manager",
  verifyCashClosure: "manager",
  moderateAliases: "manager",
  recomputeSuggestions: "admin",
  deleteAlias: "admin",
  manageUsers: "admin",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

/** Read only inside useEffect — localStorage is unavailable during SSR. */
export function can(action: Permission): boolean {
  return hasRole(PERMISSIONS[action]);
}
