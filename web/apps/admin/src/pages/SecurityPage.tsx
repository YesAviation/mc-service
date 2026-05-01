import { KeyRound, Lock, ShieldCheck, ShieldX } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

const secretInventory = [
  { name: "jwt-signing-key", rotation: "2026-05-01", state: "scheduled" },
  { name: "smtp-api-token", rotation: "2026-04-24", state: "scheduled" },
  { name: "s3-upload-secret", rotation: "2026-06-01", state: "ok" },
  { name: "webhook-signing-secret", rotation: "2026-04-18", state: "overdue" },
];

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Security"
        badge="Governance"
        description="Configure authentication policy, session hardening, network protections, secret rotation, and emergency response controls."
      />

      <Panel
        title="Authentication Policy"
        description="Control password policy and token/session lifetimes."
        action={<PrimaryAction label="Save Auth Policy" />}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="text-sm text-text-secondary">
            Access token TTL (minutes)
            <input
              type="number"
              defaultValue={15}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="text-sm text-text-secondary">
            Refresh token TTL (days)
            <input
              type="number"
              defaultValue={30}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="text-sm text-text-secondary">
            Session idle timeout (minutes)
            <input
              type="number"
              defaultValue={120}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            Require MFA for admin and curator roles
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            Force password reset every 90 days
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            Block compromised passwords via breach list
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            Notify on suspicious login behavior
          </label>
        </div>
      </Panel>

      <Panel
        title="Network Guardrails"
        description="Configure IP restrictions, rate limiting, and abuse controls."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="text-sm text-text-secondary">
            Admin allowlist CIDRs
            <textarea
              rows={6}
              defaultValue={"10.0.0.0/8\n192.168.0.0/16\n127.0.0.1/32"}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-xs text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Blocklist (IPs or CIDRs)
            <textarea
              rows={6}
              placeholder="203.0.113.0/24"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-xs text-text-primary"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="text-sm text-text-secondary">
            Global requests/min per IP
            <input
              type="number"
              defaultValue={900}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="text-sm text-text-secondary">
            Auth attempts/min per IP
            <input
              type="number"
              defaultValue={20}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="text-sm text-text-secondary">
            Burst window (seconds)
            <input
              type="number"
              defaultValue={30}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryAction label="Apply Network Policy" />
          <SecondaryAction label="Test Rules" />
        </div>
      </Panel>

      <Panel
        title="Secrets & Incident Response"
        description="Rotate secrets and execute emergency actions when compromise is suspected."
      >
        <div className="space-y-2">
          {secretInventory.map((secret) => (
            <div
              key={secret.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{secret.name}</p>
                  <p className="text-xs text-text-muted">Next rotation {secret.rotation}</p>
                </div>
              </div>

              <StatusPill
                label={secret.state}
                tone={
                  secret.state === "ok"
                    ? "success"
                    : secret.state === "scheduled"
                      ? "info"
                      : "warning"
                }
              />
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <ShieldCheck className="h-4 w-4" />
            Rotate Selected Secret
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <Lock className="h-4 w-4" />
            Rotate All Session Keys
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/15"
          >
            <ShieldX className="h-4 w-4" />
            Lock All Admin Sessions
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/15"
          >
            <ShieldX className="h-4 w-4" />
            Enter Security Lockdown
          </button>
        </div>
      </Panel>
    </div>
  );
}
