import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, adminApi } from "@music/shared";
import type {
  RuntimeEnvironmentVariable,
  ServerRuntimeSettings,
} from "@music/shared";
import { Database, Save, Settings2 } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

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

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function SystemConfigPage() {
  const [settings, setSettings] = useState<ServerRuntimeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [allowUserRegistration, setAllowUserRegistration] = useState(true);
  const [defaultUserRole, setDefaultUserRole] = useState<"admin" | "user">("user");
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(512);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [environmentOverrides, setEnvironmentOverrides] = useState<Record<string, string>>({});

  const hydrate = useCallback((response: ServerRuntimeSettings) => {
    setSettings(response);
    setMaintenanceMode(response.maintenance_mode);
    setAllowUserRegistration(response.allow_user_registration);
    setDefaultUserRole(response.default_user_role);
    setMaxUploadSizeMb(response.max_upload_size_mb);
    setFeatureFlags(response.feature_flags);
    setEnvironmentOverrides(response.environment_overrides);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);

    try {
      const response = await adminApi.getServerRuntimeSettings();
      hydrate(response);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(error, "Failed to load server configuration."),
      });
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const sortedFeatureFlagKeys = useMemo(() => {
    return Object.keys(featureFlags).sort((a, b) => a.localeCompare(b));
  }, [featureFlags]);

  const handleToggleFeatureFlag = (key: string, value: boolean) => {
    setFeatureFlags((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleEnvironmentOverrideChange = (key: string, value: string) => {
    setEnvironmentOverrides((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (!settings || saving) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const response = await adminApi.updateServerRuntimeSettings({
        maintenance_mode: maintenanceMode,
        allow_user_registration: allowUserRegistration,
        default_user_role: defaultUserRole,
        max_upload_size_mb: Math.max(1, maxUploadSizeMb),
        feature_flags: featureFlags,
        environment_overrides: environmentOverrides,
      });

      hydrate(response);
      setFeedback({
        tone: "success",
        message: "Server runtime settings saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: apiErrorMessage(error, "Failed to save server configuration."),
      });
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = (key: string) => {
    setEnvironmentOverrides((previous) => ({
      ...previous,
      [key]: "",
    }));
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="System Configuration"
        badge="Platform"
        description="Control runtime policy, account onboarding behavior, feature flags, and environment override values from the admin panel."
      />

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

      {loading || !settings ? (
        <div className="surface-panel px-4 py-5 text-sm text-text-secondary">
          Loading server configuration...
        </div>
      ) : (
        <>
          <Panel
            title="Server Runtime Defaults"
            description="Critical runtime policy that applies immediately to gateway-controlled behavior."
            action={
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Runtime Config"}
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(event) => setMaintenanceMode(event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Maintenance mode
              </label>

              <label className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={allowUserRegistration}
                  onChange={(event) => setAllowUserRegistration(event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Allow user registration
              </label>

              <label className="text-sm text-text-secondary">
                Default role for new users
                <select
                  value={defaultUserRole}
                  onChange={(event) => setDefaultUserRole(event.target.value as "admin" | "user")}
                  className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label className="text-sm text-text-secondary">
                Max upload size (MB)
                <input
                  type="number"
                  value={maxUploadSizeMb}
                  onChange={(event) => setMaxUploadSizeMb(Number(event.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
                />
              </label>
            </div>

            <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-xs text-text-muted">
              <StatusPill label="main admin" tone="info" />
              Protected account: {settings.main_admin_username}
            </div>
          </Panel>

          <Panel
            title="Feature Flags"
            description="Toggle runtime feature switches without redeploying."
            action={<PrimaryAction label="Runtime controlled" disabled />}
          >
            {sortedFeatureFlagKeys.length === 0 ? (
              <p className="text-sm text-text-secondary">No feature flags configured yet.</p>
            ) : (
              <div className="space-y-2">
                {sortedFeatureFlagKeys.map((key) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary"
                  >
                    <span className="truncate">{key}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(featureFlags[key])}
                      onChange={(event) =>
                        handleToggleFeatureFlag(key, event.target.checked)
                      }
                      className="h-4 w-4 accent-accent"
                    />
                  </label>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Environment Variable Overrides"
            description="Edit allowlisted environment overrides. Changes are persisted and typically require a service restart to fully apply."
            action={
              <button
                type="button"
                onClick={() => {
                  void loadSettings();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10 hover:text-text-primary"
              >
                <Database className="h-4 w-4" />
                Reload Values
              </button>
            }
          >
            <div className="space-y-3">
              {settings.environment.map((entry: RuntimeEnvironmentVariable) => {
                const currentOverride = environmentOverrides[entry.key] ?? "";

                return (
                  <div
                    key={entry.key}
                    className="rounded-lg border border-border-subtle bg-white/5 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{entry.key}</p>
                        <p className="text-xs text-text-muted">
                          Source: {entry.source}
                        </p>
                      </div>
                      <StatusPill
                        label={entry.is_sensitive ? "sensitive" : "standard"}
                        tone={entry.is_sensitive ? "warning" : "neutral"}
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="text-xs text-text-secondary">
                        Effective value
                        <input
                          type={entry.is_sensitive ? "password" : "text"}
                          value={entry.value}
                          readOnly
                          className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-xs text-text-primary"
                        />
                      </label>

                      <label className="text-xs text-text-secondary">
                        Override value
                        <input
                          type={entry.is_sensitive ? "password" : "text"}
                          value={currentOverride}
                          onChange={(event) =>
                            handleEnvironmentOverrideChange(entry.key, event.target.value)
                          }
                          placeholder="Leave empty to inherit process/default"
                          className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-xs text-text-primary"
                        />
                      </label>
                    </div>

                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => clearOverride(entry.key)}
                        className="inline-flex items-center gap-1 rounded border border-border-default px-2 py-1 text-xs text-text-secondary hover:bg-white/10"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Clear override
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save All Runtime Settings"}
              </button>
              <SecondaryAction label="Apply then restart services" disabled />
            </div>

            <p className="mt-3 text-xs text-text-muted">
              Runtime/env changes are persisted now. Some values take effect immediately while others require process restart depending on service configuration loading behavior.
            </p>
          </Panel>

          <div className="rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-xs text-text-muted">
            Last updated: {formatTimestamp(settings.updated_at)}
          </div>
        </>
      )}
    </div>
  );
}
