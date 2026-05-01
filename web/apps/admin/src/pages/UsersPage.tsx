import { useEffect, useMemo, useState } from "react";
import { ApiError, adminApi } from "@music/shared";
import type { AdminUserAccount } from "@music/shared";
import { KeyRound, RefreshCw, Search, ShieldUser, Trash2 } from "lucide-react";
import { PageHero, Panel, StatusPill } from "@/components/admin/AdminPrimitives";

type UserRoleFilter = "all" | "admin" | "user";
type UserStatusFilter = "all" | "active" | "inactive";

type Feedback = {
  tone: "success" | "error";
  message: string;
};

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  const errorBody = error.body as { error?: { message?: string } } | null;
  return errorBody?.error?.message ?? fallback;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "Never";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState("");

  const [editingUsername, setEditingUsername] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [editingRole, setEditingRole] = useState<"admin" | "user">("user");
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "user">("user");
  const [createIsActive, setCreateIsActive] = useState(true);

  const [savingUser, setSavingUser] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const loadUsers = async () => {
    setLoadingUsers(true);

    try {
      const response = await adminApi.listUsers();
      setUsers(response);

      if (response.length > 0) {
        setSelectedUserId((current) => {
          if (current && response.some((item) => item.id === current)) {
            return current;
          }
          return response[0].id;
        });
      } else {
        setSelectedUserId("");
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(error, "Failed to load users."),
      });
      setUsers([]);
      setSelectedUserId("");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        user.username.toLowerCase().includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery);

      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? user.is_active : !user.is_active);

      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [users, query, roleFilter, statusFilter]);

  const selectedUser = useMemo(() => {
    const selected = filteredUsers.find((user) => user.id === selectedUserId);
    if (selected) {
      return selected;
    }

    return filteredUsers[0] ?? null;
  }, [filteredUsers, selectedUserId]);

  useEffect(() => {
    if (!selectedUser) {
      return;
    }

    setEditingUsername(selectedUser.username);
    setEditingEmail(selectedUser.email);
    setEditingRole(selectedUser.role);
    setEditingIsActive(selectedUser.is_active);
    setNewPassword("");
  }, [selectedUser]);

  const adminCount = users.filter((user) => user.role === "admin").length;
  const activeCount = users.filter((user) => user.is_active).length;

  const handleSaveUser = async () => {
    if (!selectedUser || savingUser) {
      return;
    }

    setSavingUser(true);
    setFeedback(null);

    try {
      const updatedUser = await adminApi.updateUser(selectedUser.id, {
        username: editingUsername.trim(),
        email: editingEmail.trim(),
        role: editingRole,
        is_active: editingIsActive,
      });

      setUsers((previous) =>
        previous.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      setFeedback({ tone: "success", message: "User updated successfully." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(error, "Failed to update user."),
      });
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateUser = async () => {
    if (creatingUser) {
      return;
    }

    if (
      createUsername.trim().length === 0 ||
      createEmail.trim().length === 0 ||
      createPassword.trim().length < 8
    ) {
      setFeedback({
        tone: "error",
        message:
          "Username, email, and an 8+ character password are required to create an account.",
      });
      return;
    }

    setCreatingUser(true);
    setFeedback(null);

    try {
      const createdUser = await adminApi.createUser({
        username: createUsername.trim(),
        email: createEmail.trim(),
        password: createPassword,
        role: createRole,
        is_active: createIsActive,
      });

      setUsers((previous) => [...previous, createdUser]);
      setSelectedUserId(createdUser.id);

      setCreateUsername("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("user");
      setCreateIsActive(true);

      setFeedback({
        tone: "success",
        message: "User account created.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(error, "Failed to create user account."),
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || resettingPassword) {
      return;
    }

    if (newPassword.trim().length < 8) {
      setFeedback({
        tone: "error",
        message: "New password must be at least 8 characters.",
      });
      return;
    }

    setResettingPassword(true);
    setFeedback(null);

    try {
      await adminApi.resetUserPassword(selectedUser.id, {
        new_password: newPassword,
      });
      setNewPassword("");
      setFeedback({ tone: "success", message: "Password reset successfully." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(error, "Failed to reset password."),
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser || deletingUser) {
      return;
    }

    if (selectedUser.is_main_admin) {
      setFeedback({
        tone: "error",
        message: "The main admin account cannot be deleted.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Delete user '${selectedUser.username}'? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingUser(true);
    setFeedback(null);

    try {
      await adminApi.deleteUser(selectedUser.id);
      await loadUsers();
      setFeedback({ tone: "success", message: "User deleted." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(error, "Failed to delete user."),
      });
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Users & Access"
        badge="Identity"
        description="Manage admin and normal user accounts, role assignments, activation state, and password recovery controls."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Total users</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{users.length}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Active users</p>
          <p className="mt-1 text-2xl font-semibold text-success">{activeCount}</p>
        </div>
        <div className="surface-panel p-4">
          <p className="text-sm text-text-secondary">Admin users</p>
          <p className="mt-1 text-2xl font-semibold text-accent">{adminCount}</p>
        </div>
      </div>

      {feedback ? (
        <div
          className={
            feedback.tone === "success"
              ? "surface-panel border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
              : "surface-panel border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          }
        >
          {feedback.message}
        </div>
      ) : null}

      <Panel
        title="Create Account"
        description="Create a new admin or normal user account directly from the control panel."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm text-text-secondary">
            Username
            <input
              type="text"
              value={createUsername}
              onChange={(event) => setCreateUsername(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Email
            <input
              type="email"
              value={createEmail}
              onChange={(event) => setCreateEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Password
            <input
              type="password"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Role
            <select
              value={createRole}
              onChange={(event) => setCreateRole(event.target.value as "admin" | "user")}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 self-end rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={createIsActive}
              onChange={(event) => setCreateIsActive(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Active
          </label>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleCreateUser}
            disabled={creatingUser}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <ShieldUser className="h-4 w-4" />
            {creatingUser ? "Creating..." : "Create User"}
          </button>
        </div>
      </Panel>

      <Panel
        title="User Directory"
        description="Search and select accounts for management."
        action={
          <button
            type="button"
            onClick={() => {
              void loadUsers();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.5fr_repeat(2,minmax(0,1fr))]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search username or email"
              className="w-full rounded-lg border border-border-default bg-bg-primary py-2 pl-9 pr-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as UserRoleFilter)}
            className="rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-secondary focus:border-accent focus:outline-none"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as UserStatusFilter)}
            className="rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-secondary focus:border-accent focus:outline-none"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-text-secondary">
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-text-secondary">
                    No users match the current filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUser?.id === user.id;

                  return (
                    <tr key={user.id} className={isSelected ? "bg-accent/10" : "hover:bg-white/5"}>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(user.id)}
                          className="text-left font-medium text-text-primary hover:text-accent"
                        >
                          {user.username}
                        </button>
                        {user.is_main_admin ? (
                          <div className="mt-1">
                            <StatusPill label="main admin" tone="info" />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{user.email}</td>
                      <td className="px-3 py-2 capitalize text-text-secondary">{user.role}</td>
                      <td className="px-3 py-2">
                        <StatusPill
                          label={user.is_active ? "active" : "inactive"}
                          tone={user.is_active ? "success" : "warning"}
                        />
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {formatTimestamp(user.last_login_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Account Controls"
        description="Update selected account role/state and execute immediate security actions."
      >
        {selectedUser ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="text-sm text-text-secondary">
                Username
                <input
                  type="text"
                  value={editingUsername}
                  onChange={(event) => setEditingUsername(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </label>

              <label className="text-sm text-text-secondary">
                Email
                <input
                  type="email"
                  value={editingEmail}
                  onChange={(event) => setEditingEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </label>

              <label className="text-sm text-text-secondary">
                Role
                <select
                  value={editingRole}
                  onChange={(event) => setEditingRole(event.target.value as "admin" | "user")}
                  disabled={selectedUser.is_main_admin}
                  className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2 self-end text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={editingIsActive}
                  onChange={(event) => setEditingIsActive(event.target.checked)}
                  disabled={selectedUser.is_main_admin}
                  className="h-4 w-4 accent-accent disabled:opacity-50"
                />
                Account is active
              </label>
            </div>

            {selectedUser.is_main_admin ? (
              <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-soft">
                This is the protected main admin account ({selectedUser.username}). Role and active state are locked.
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={savingUser}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <ShieldUser className="h-4 w-4" />
                {savingUser ? "Saving..." : "Save Account"}
              </button>

              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deletingUser || selectedUser.is_main_admin}
                className="inline-flex items-center gap-2 rounded-lg border border-danger/40 px-3.5 py-2 text-sm text-danger hover:bg-danger/15 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deletingUser ? "Deleting..." : "Delete User"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_auto]">
              <label className="text-sm text-text-secondary">
                Set new password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
              </label>

              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resettingPassword}
                className="inline-flex items-center gap-2 self-end rounded-lg border border-border-default px-3.5 py-2 text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {resettingPassword ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Select a user to manage account controls.</p>
        )}
      </Panel>
    </div>
  );
}
