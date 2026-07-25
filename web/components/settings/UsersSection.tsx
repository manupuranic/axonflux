"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { usersApi } from "@/lib/api";
import type { AppUserOut } from "@/types/api";

const ROLES = ["staff", "manager", "admin"] as const;

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  staff: "bg-gray-100 text-gray-600",
};

function formatDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function UsersSection() {
  const [users, setUsers] = useState<AppUserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", full_name: "", role: "staff" as string });

  const refresh = useCallback(() => {
    return usersApi
      .list()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Shared mutation runner: clear stale error, run the call, refetch the list.
  // No optimistic updates — this list is small and mutations are infrequent,
  // so a refetch-after-write keeps the UI trivially consistent with the backend.
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    }
  }

  async function createUser() {
    setCreating(true);
    const ok = await run(() =>
      usersApi.create({ ...form, full_name: form.full_name || null })
    );
    if (ok) {
      setForm({ username: "", password: "", full_name: "", role: "staff" });
    }
    setCreating(false);
  }

  async function changeRole(u: AppUserOut, role: string) {
    setBusyId(u.id);
    await run(() => usersApi.patch(u.id, { role }));
    setBusyId(null);
  }

  async function toggleActive(u: AppUserOut) {
    setBusyId(u.id);
    await run(() => usersApi.patch(u.id, { is_active: !u.is_active }));
    setBusyId(null);
  }

  async function resetPassword(u: AppUserOut) {
    const pw = window.prompt(`New password for ${u.username} (min 8 chars):`);
    if (!pw) return;
    setBusyId(u.id);
    await run(() => usersApi.patch(u.id, { password: pw }));
    setBusyId(null);
  }

  return (
    <section className="rounded-md border p-4 sm:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Users</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create staff/manager/admin accounts, change roles, deactivate, or reset passwords.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left py-2 px-3 sm:px-4 font-medium text-gray-600">Username</th>
                <th className="text-left py-2 px-2 sm:px-4 font-medium text-gray-600">Full name</th>
                <th className="text-left py-2 px-2 sm:px-4 font-medium text-gray-600">Role</th>
                <th className="text-left py-2 px-2 sm:px-4 font-medium text-gray-600">Active</th>
                <th className="text-left py-2 px-2 sm:px-4 font-medium text-gray-600">Last login</th>
                <th className="py-2 px-2 sm:px-4" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-gray-400">
                    No users yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const rowBusy = busyId === u.id;
                  return (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 px-3 sm:px-4 font-medium text-gray-800 whitespace-nowrap">
                        {u.username}
                      </td>
                      <td className="py-2.5 px-2 sm:px-4 text-gray-700">
                        {u.full_name || "—"}
                      </td>
                      <td className="py-2.5 px-2 sm:px-4">
                        <select
                          value={u.role}
                          disabled={rowBusy}
                          onChange={(e) => changeRole(u, e.target.value)}
                          className={`h-7 rounded border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                            ROLE_BADGE_STYLES[u.role] ?? ""
                          }`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-2 sm:px-4">
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => toggleActive(u)}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
                            u.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {u.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 sm:px-4 text-gray-700 whitespace-nowrap">
                        {formatDateTime(u.last_login_at)}
                      </td>
                      <td className="py-2.5 px-2 sm:px-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs whitespace-nowrap"
                          disabled={rowBusy}
                          onClick={() => resetPassword(u)}
                        >
                          Reset password
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add user */}
      <div className="rounded-md border bg-muted/40 p-4 space-y-3">
        <p className="text-sm font-medium">Add user</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <input
            type="text"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            className="h-9 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="h-9 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="text"
            placeholder="Full name (optional)"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="h-9 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="h-9 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={createUser}
          disabled={creating || !form.username || form.password.length < 8}
        >
          {creating ? "Adding…" : "Add user"}
        </Button>
      </div>
    </section>
  );
}
