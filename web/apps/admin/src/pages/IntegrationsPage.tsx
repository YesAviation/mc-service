import { Bell, Link2, Mail, PlugZap, Webhook } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

const webhookEndpoints = [
  { id: "wh_01", name: "discord-alerts", url: "https://hooks.example/discord", events: "service.error, queue.hot", enabled: true },
  { id: "wh_02", name: "pager-duty", url: "https://events.pagerduty.com/v2/enqueue", events: "security.lockdown", enabled: true },
  { id: "wh_03", name: "ops-archive", url: "https://ops.example/audit", events: "audit.exported", enabled: false },
];

const apiClients = [
  { id: "client_1", name: "Mobile Admin", scopes: "users:read settings:write", lastUsed: "2026-04-17 08:20", status: "active" },
  { id: "client_2", name: "Ops Console", scopes: "ops:* audit:*", lastUsed: "2026-04-17 07:58", status: "active" },
  { id: "client_3", name: "Legacy Sync", scopes: "catalog:read playlists:read", lastUsed: "2026-03-09 22:10", status: "stale" },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Integrations"
        badge="Connectivity"
        description="Manage external providers, webhook delivery, API clients, and outbound notification channels."
      />

      <Panel
        title="Identity Providers"
        description="Enable SSO and social login providers for the platform."
        action={<PrimaryAction label="Save Provider Config" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            "Google OAuth",
            "GitHub OAuth",
            "Azure AD SSO",
            "SAML Enterprise",
          ].map((provider) => (
            <label
              key={provider}
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary"
            >
              <input type="checkbox" defaultChecked={provider !== "SAML Enterprise"} className="h-4 w-4 accent-accent" />
              {provider}
            </label>
          ))}
        </div>
      </Panel>

      <Panel
        title="Webhook Routing"
        description="Send critical events to operations and automation systems."
        action={<SecondaryAction label="Create Webhook" />}
      >
        <div className="space-y-2">
          {webhookEndpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{endpoint.name}</p>
                  <p className="text-xs text-text-muted">{endpoint.url}</p>
                  <p className="text-xs text-text-muted">Events: {endpoint.events}</p>
                </div>
              </div>

              <StatusPill label={endpoint.enabled ? "enabled" : "disabled"} tone={endpoint.enabled ? "success" : "warning"} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Outbound Channels"
        description="Configure email, push, and messaging integrations."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary">
            <Mail className="h-4 w-4 text-accent" />
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            SMTP Notifications
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary">
            <Bell className="h-4 w-4 text-accent" />
            <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            Mobile Push Gateway
          </label>

          <label className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-sm text-text-secondary">
            <Link2 className="h-4 w-4 text-accent" />
            <input type="checkbox" className="h-4 w-4 accent-accent" />
            Slack Status Updates
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm text-text-secondary">
            SMTP host
            <input
              type="text"
              placeholder="smtp.example.com"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            SMTP sender
            <input
              type="email"
              placeholder="noreply@example.com"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Webhook signing algorithm
            <select className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary">
              <option>HMAC-SHA256</option>
              <option>HMAC-SHA512</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryAction label="Save Integration Settings" />
          <SecondaryAction label="Send Test Event" />
        </div>
      </Panel>

      <Panel
        title="API Clients"
        description="Manage machine-to-machine clients and permissions."
        action={<PrimaryAction label="Create API Client" />}
      >
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Scopes</th>
                <th className="px-3 py-2 font-medium">Last used</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiClients.map((client) => (
                <tr key={client.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-text-primary">{client.name}</td>
                  <td className="px-3 py-2 text-text-secondary">{client.scopes}</td>
                  <td className="px-3 py-2 text-text-secondary">{client.lastUsed}</td>
                  <td className="px-3 py-2">
                    <StatusPill label={client.status} tone={client.status === "active" ? "success" : "warning"} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-border-default px-2 py-1 text-xs text-text-secondary hover:bg-white/10"
                      >
                        Rotate key
                      </button>
                      <button
                        type="button"
                        className="rounded border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/15"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-white/5 px-3 py-2 text-xs text-text-muted">
          <PlugZap className="h-4 w-4 text-accent" />
          Client secrets are shown once on creation and must be copied to your secure vault.
        </div>
      </Panel>
    </div>
  );
}
