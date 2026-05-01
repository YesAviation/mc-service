import { useEffect, useMemo, useState } from "react";
import { ApiError, api, catalogApi, useAuthStore } from "@music/shared";
import type { User } from "@music/shared";
import {
  AlertTriangle,
  Globe2,
  Info,
  KeyRound,
  LogOut,
  Paintbrush2,
  RotateCcw,
  Server,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import { accentThemes, densityOptions, useUiStore } from "@/stores/ui";
import { usePlayerStore } from "@/stores/player";

const USER_STORAGE_KEY = "user";

const localeOptions = [
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
  { value: "fr", label: "Francais" },
  { value: "ko", label: "Korean" },
  { value: "ja", label: "Japanese" },
];

type StatusTone = "success" | "error";

type StatusMessage = {
  tone: StatusTone;
  message: string;
};

type ServerStats = {
  totalTracks: number;
  totalAlbums: number;
  totalArtists: number;
};

type LegalDocuments = {
  privacyPolicy: string;
  termsOfService: string;
};

type LegalDocKind = "privacy" | "terms";

type DeveloperInfo = {
  name: string;
  role: string;
  contactEmail: string;
  website: string;
  github: string;
};

const PROGRAM_DEVELOPER_INFO: DeveloperInfo = {
  name: "Daniel",
  role: "Creator & Lead Developer",
  contactEmail: "",
  website: "",
  github: "",
};

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function readMaybeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseLegalDocs(payload: unknown): LegalDocuments {
  if (!payload || typeof payload !== "object") {
    return { privacyPolicy: "", termsOfService: "" };
  }

  const source = payload as Record<string, unknown>;
  return {
    privacyPolicy: readMaybeString(
      source.privacy_policy ?? source.privacyPolicy ?? source.privacy ?? source.policy,
    ),
    termsOfService: readMaybeString(
      source.terms_of_service ?? source.termsOfService ?? source.tos ?? source.terms,
    ),
  };
}

async function fetchLegalDocs(): Promise<LegalDocuments> {
  const endpoints = ["/settings/legal", "/settings/public/legal", "/public/legal", "/settings/documents"];

  for (const endpoint of endpoints) {
    try {
      const payload = await api.get<unknown>(endpoint);
      const parsed = parseLegalDocs(payload);
      if (parsed.privacyPolicy || parsed.termsOfService) {
        return parsed;
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw error;
      }
      if (error instanceof ApiError && [404, 405, 501].includes(error.status)) {
        continue;
      }
    }
  }

  return {
    privacyPolicy: "Privacy policy is not configured yet. Ask an administrator to publish it in the admin panel.",
    termsOfService: "Terms of service are not configured yet. Ask an administrator to publish them in the admin panel.",
  };
}

async function runApiMutation<T>(attempts: Array<() => Promise<T>>): Promise<T | null> {
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw error;
      }
      if (error instanceof ApiError && [404, 405, 501].includes(error.status)) {
        continue;
      }
      throw error;
    }
  }

  return null;
}

export default function ProfilePage() {
  const { user, logout } = useAuthStore();
  const clearRecentlyPlayed = usePlayerStore((state) => state.clearRecentlyPlayed);
  const { accentThemeId, locale, density, setAccentTheme, setLocale, setDensity } = useUiStore();

  const [profileForm, setProfileForm] = useState({
    username: user?.username ?? "",
    email: user?.email ?? "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [serverStats, setServerStats] = useState<ServerStats>({
    totalTracks: 0,
    totalAlbums: 0,
    totalArtists: 0,
  });

  const [legalDocs, setLegalDocs] = useState<LegalDocuments>({
    privacyPolicy: "",
    termsOfService: "",
  });

  const [legalDocOpen, setLegalDocOpen] = useState<LegalDocKind | null>(null);
  const [profileStatus, setProfileStatus] = useState<StatusMessage | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<StatusMessage | null>(null);
  const [accountStatus, setAccountStatus] = useState<StatusMessage | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [runningAccountAction, setRunningAccountAction] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  useEffect(() => {
    setProfileForm({
      username: user?.username ?? "",
      email: user?.email ?? "",
    });
  }, [user?.username, user?.email]);

  useEffect(() => {
    let cancelled = false;

    const loadPageMeta = async () => {
      try {
        const [tracks, albums, artists, docs] = await Promise.all([
          catalogApi.listTracks({ page: 1, page_size: 1 }),
          catalogApi.listAlbums({ page: 1, page_size: 1 }),
          catalogApi.listArtists({ page: 1, page_size: 1 }),
          fetchLegalDocs(),
        ]);

        if (!cancelled) {
          setServerStats({
            totalTracks: tracks.total,
            totalAlbums: albums.total,
            totalArtists: artists.total,
          });
          setLegalDocs(docs);
        }
      } catch (error) {
        if (isUnauthorizedError(error)) {
          return;
        }
        if (!cancelled) {
          console.error("Failed to load profile metadata:", error);
        }
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
        }
      }
    };

    void loadPageMeta();

    return () => {
      cancelled = true;
    };
  }, []);

  const memberSince = useMemo(() => {
    if (!user?.created_at) {
      return "Recently";
    }

    const date = new Date(user.created_at);
    if (Number.isNaN(date.getTime())) {
      return "Recently";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  }, [user?.created_at]);

  const activeLegalText = legalDocOpen === "privacy" ? legalDocs.privacyPolicy : legalDocs.termsOfService;
  const activeLegalTitle = legalDocOpen === "privacy" ? "Privacy Policy" : "Terms of Service";

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingProfile) {
      return;
    }

    setSavingProfile(true);
    setProfileStatus(null);

    try {
      const payload = {
        username: profileForm.username.trim(),
        email: profileForm.email.trim(),
      };

      const updatedUser = await runApiMutation<User>([
        () => api.put<User>("/users/me", payload),
        () => api.put<User>("/auth/me", payload),
        () => api.put<User>("/profile/me", payload),
      ]);

      if (!updatedUser) {
        setProfileStatus({
          tone: "error",
          message: "Profile update endpoint is not available on this server yet.",
        });
        return;
      }

      useAuthStore.setState({ user: updatedUser });
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser));
      setProfileStatus({ tone: "success", message: "Profile updated successfully." });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return;
      }

      setProfileStatus({ tone: "error", message: "Failed to update profile." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingPassword) {
      return;
    }

    if (!passwordForm.newPassword.trim()) {
      setPasswordStatus({ tone: "error", message: "New password cannot be empty." });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ tone: "error", message: "New password and confirmation must match." });
      return;
    }

    setSavingPassword(true);
    setPasswordStatus(null);

    try {
      const payload = {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      };

      const updated = await runApiMutation<unknown>([
        () => api.post<unknown>("/auth/change-password", payload),
        () => api.post<unknown>("/users/me/password", payload),
        () => api.post<unknown>("/account/password", payload),
      ]);

      if (updated === null) {
        setPasswordStatus({
          tone: "error",
          message: "Password change endpoint is not available on this server yet.",
        });
        return;
      }

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordStatus({ tone: "success", message: "Password updated successfully." });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return;
      }

      setPasswordStatus({ tone: "error", message: "Failed to update password." });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResetAccount = async () => {
    const confirmed = window.confirm("Reset account preferences and local listening state?");
    if (!confirmed || runningAccountAction) {
      return;
    }

    setRunningAccountAction(true);
    setAccountStatus(null);

    try {
      await runApiMutation<unknown>([
        () => api.post<unknown>("/users/me/reset", {}),
        () => api.post<unknown>("/account/reset", {}),
      ]);
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        console.warn("Account reset endpoint failed, applying local reset only:", error);
      }
    }

    setAccentTheme("glacier");
    setLocale("en");
    setDensity("balanced");
    clearRecentlyPlayed();

    setAccountStatus({
      tone: "success",
      message: "Account preferences were reset. Server-side reset applies when endpoint is available.",
    });
    setRunningAccountAction(false);
  };

  const handleDeleteAccount = async () => {
    if (runningAccountAction) {
      return;
    }

    const confirmation = window.prompt('Type "DELETE" to permanently delete your account.');
    if (confirmation !== "DELETE") {
      return;
    }

    setRunningAccountAction(true);
    setAccountStatus(null);

    try {
      const deleted = await runApiMutation<unknown>([
        () => api.delete<unknown>("/users/me"),
        () => api.delete<unknown>("/account"),
      ]);

      if (!deleted) {
        setAccountStatus({
          tone: "error",
          message: "Delete account endpoint is not available on this server yet.",
        });
        return;
      }

      logout();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return;
      }

      setAccountStatus({ tone: "error", message: "Failed to delete account." });
    } finally {
      setRunningAccountAction(false);
    }
  };

  return (
    <div className="space-y-7">
      <section className="page-header">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted mb-2">Profile</p>
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
          <div className="w-9 h-9 rounded-lg bg-accent/20 border border-accent/35 flex items-center justify-center overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              <UserRound size={18} className="text-accent" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold text-text-primary truncate">
              {user?.username ?? "Music Lover"}
            </h1>
            <p className="text-sm text-text-secondary truncate mt-1">{user?.email ?? "No email"}</p>
            <p className="text-xs text-text-muted mt-2">Member since {memberSince}</p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-black/10 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-white/6"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={handleSaveProfile} className="list-shell p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserRound size={16} className="text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Account</h2>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">Username</span>
            <input
              value={profileForm.username}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary/80 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">Email</span>
            <input
              type="email"
              value={profileForm.email}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary/80 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          <button
            type="submit"
            disabled={savingProfile}
            className="rounded-lg bg-accent text-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>

          {profileStatus && (
            <p className={clsx("text-sm", profileStatus.tone === "success" ? "text-success" : "text-danger")}>
              {profileStatus.message}
            </p>
          )}
        </form>

        <form onSubmit={handleChangePassword} className="list-shell p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Password</h2>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">Current Password</span>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary/80 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">New Password</span>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary/80 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.12em] text-text-muted">Confirm Password</span>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary/80 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          <button
            type="submit"
            disabled={savingPassword}
            className="rounded-lg bg-accent text-white px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {savingPassword ? "Updating..." : "Update Password"}
          </button>

          {passwordStatus && (
            <p className={clsx("text-sm", passwordStatus.tone === "success" ? "text-success" : "text-danger")}>
              {passwordStatus.message}
            </p>
          )}
        </form>
      </section>

      <section className="list-shell p-4">
        <div className="flex items-center gap-2 mb-4">
          <Server size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Server Stats</h2>
        </div>

        {loadingMeta ? (
          <p className="text-sm text-text-secondary">Loading server stats...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border-subtle bg-black/10 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Songs</p>
              <p className="text-lg font-semibold text-text-primary mt-1">{serverStats.totalTracks.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-black/10 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Albums</p>
              <p className="text-lg font-semibold text-text-primary mt-1">{serverStats.totalAlbums.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-black/10 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Artists</p>
              <p className="text-lg font-semibold text-text-primary mt-1">{serverStats.totalArtists.toLocaleString()}</p>
            </div>
          </div>
        )}
      </section>

      <section className="pt-1">
        <div className="flex items-center gap-2 mb-4">
          <Paintbrush2 size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Look And Feel</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {accentThemes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setAccentTheme(theme.id)}
              className={clsx(
                "rounded-xl border px-3 py-3 text-left transition-all",
                accentThemeId === theme.id
                  ? "border-accent/70 bg-accent/10"
                  : "border-border-subtle bg-black/10 hover:border-border-default hover:bg-bg-elevated/55",
              )}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.accent }} />
                <span className="text-sm font-medium text-text-primary">{theme.name}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ backgroundColor: theme.accentMuted }}>
                <div className="h-full rounded-full w-2/3" style={{ backgroundColor: theme.accent }} />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <label className="block text-xs uppercase tracking-[0.14em] text-text-muted mb-2">Interface Density</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {densityOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDensity(option.id)}
                className={clsx(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors",
                  density === option.id
                    ? "border-accent/70 bg-accent/10"
                    : "border-border-subtle bg-black/10 hover:border-border-default hover:bg-bg-elevated/55",
                )}
              >
                <p className="text-sm font-medium text-text-primary">{option.name}</p>
                <p className="text-xs text-text-secondary mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-1 border-t border-border-subtle">
        <div className="flex items-center gap-2 mb-4">
          <Globe2 size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Language (i18n)</h2>
        </div>

        <label className="block text-xs uppercase tracking-[0.14em] text-text-muted mb-2">Preferred Language</label>
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
          className="w-full md:w-80 rounded-xl border border-border-default bg-bg-primary/80 px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="mt-4 list-shell p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-accent" />
            <p className="text-sm font-medium text-text-primary">i18n rollout status</p>
          </div>
          <p className="text-sm text-text-secondary">
            Locale preference is active now. Full translated UI strings remain configurable from server translation packs.
          </p>
        </div>
      </section>

      <section className="list-shell p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Legal</h2>
        </div>
        <p className="text-sm text-text-secondary">
          Privacy policy and Terms of Service are loaded from admin-managed configuration when available.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLegalDocOpen("privacy")}
            className="rounded-lg border border-border-default bg-black/10 px-3 py-2 text-sm text-text-primary hover:bg-white/6"
          >
            View Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => setLegalDocOpen("terms")}
            className="rounded-lg border border-border-default bg-black/10 px-3 py-2 text-sm text-text-primary hover:bg-white/6"
          >
            View Terms of Service
          </button>
        </div>
      </section>

      <section className="list-shell p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Developer Information</h2>
        </div>

        <p className="text-sm text-text-secondary">
          This information is program metadata and is intentionally read-only.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border-subtle bg-black/10 px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Name</p>
            <p className="text-sm text-text-primary mt-1">{PROGRAM_DEVELOPER_INFO.name}</p>
          </div>

          <div className="rounded-lg border border-border-subtle bg-black/10 px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Role</p>
            <p className="text-sm text-text-primary mt-1">{PROGRAM_DEVELOPER_INFO.role}</p>
          </div>

          <div className="rounded-lg border border-border-subtle bg-black/10 px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Contact Email</p>
            <p className="text-sm text-text-primary mt-1">
              {PROGRAM_DEVELOPER_INFO.contactEmail || "Not provided"}
            </p>
          </div>

          <div className="rounded-lg border border-border-subtle bg-black/10 px-3 py-2.5">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">Website</p>
            <p className="text-sm text-text-primary mt-1">
              {PROGRAM_DEVELOPER_INFO.website || "Not provided"}
            </p>
          </div>

          <div className="rounded-lg border border-border-subtle bg-black/10 px-3 py-2.5 md:col-span-2">
            <p className="text-xs uppercase tracking-[0.12em] text-text-muted">GitHub</p>
            <p className="text-sm text-text-primary mt-1">
              {PROGRAM_DEVELOPER_INFO.github || "Not provided"}
            </p>
          </div>
        </div>
      </section>

      <section className="list-shell p-4 space-y-3 border border-danger/30 bg-danger/5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-danger" />
          <h2 className="text-lg font-semibold text-text-primary">Danger Zone</h2>
        </div>

        <p className="text-sm text-text-secondary">
          Reset account preferences or permanently delete your account.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleResetAccount}
            disabled={runningAccountAction}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-black/10 px-3 py-2 text-sm text-text-primary hover:bg-white/6 disabled:opacity-60"
          >
            <RotateCcw size={14} />
            Reset Account
          </button>

          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={runningAccountAction}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/60 bg-danger/15 px-3 py-2 text-sm text-danger hover:bg-danger/25 disabled:opacity-60"
          >
            <Trash2 size={14} />
            Delete Account
          </button>
        </div>

        {accountStatus && (
          <p className={clsx("text-sm", accountStatus.tone === "success" ? "text-success" : "text-danger")}>
            {accountStatus.message}
          </p>
        )}
      </section>

      {legalDocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setLegalDocOpen(null)}
            aria-label="Close legal document"
          />

          <div className="relative w-full max-w-2xl max-h-[80vh] rounded-xl border border-border-default bg-bg-surface p-5 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-lg font-semibold text-text-primary">{activeLegalTitle}</h3>
              <button
                type="button"
                onClick={() => setLegalDocOpen(null)}
                className="rounded-lg border border-border-default px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto max-h-[60vh] whitespace-pre-wrap text-sm text-text-secondary leading-relaxed pr-1">
              {activeLegalText || "No document content is available."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
