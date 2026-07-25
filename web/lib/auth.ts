const TOKEN_KEY = "axonflux_token";
const USER_KEY = "axonflux_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(
  token: string,
  meta: { full_name: string | null; role: string }
): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(meta));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUser(): { full_name: string | null; role: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export type Role = "staff" | "manager" | "admin";

// Mirrors ROLE_LEVELS in api/dependencies.py — keep in sync.
const ROLE_LEVELS: Record<string, number> = { staff: 1, manager: 2, admin: 3 };

export function hasRole(min: Role): boolean {
  const user = getUser();
  return (ROLE_LEVELS[user?.role ?? ""] ?? 0) >= ROLE_LEVELS[min];
}
