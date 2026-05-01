import { Download, Filter, ShieldAlert } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

const auditEvents = [
  {
    id: "evt_5001",
    actor: "daniel",
    action: "settings.media_processing.updated",
    target: "settings/media-processing",
    result: "success",
    timestamp: "2026-04-17 08:11:43",
  },
  {
    id: "evt_5002",
    actor: "eva",
    action: "curation.featured.publish",
    target: "discovery/home",
    result: "success",
    timestamp: "2026-04-17 07:58:10",
  },
  {
    id: "evt_5003",
    actor: "system",
    action: "security.webhook.signature_mismatch",
    target: "integrations/webhooks",
    result: "warning",
    timestamp: "2026-04-17 07:45:02",
  },
  {
    id: "evt_5004",
    actor: "ops-bot",
    action: "queue.transcode-backfill.threshold_exceeded",
    target: "ops/queues",
    result: "warning",
    timestamp: "2026-04-17 07:36:28",
  },
  {
    id: "evt_5005",
    actor: "daniel",
    action: "users.account.lock",
    target: "user:u_06",
    result: "success",
    timestamp: "2026-04-17 06:50:17",
  },
];

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Audit Logs"
        badge="Compliance"
        description="Inspect all administrative actions, security events, and automation outcomes with searchable retention controls."
      />

      <Panel
        title="Event Explorer"
        description="Filter by actor, action, target, and result to investigate changes quickly."
        action={<PrimaryAction label="Search Logs" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            type="text"
            placeholder="Actor"
            className="rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
          />
          <input
            type="text"
            placeholder="Action namespace"
            className="rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
          />
          <input
            type="text"
            placeholder="Target"
            className="rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
          />
          <select className="rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-secondary">
            <option>All results</option>
            <option>Success</option>
            <option>Warning</option>
            <option>Error</option>
          </select>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <Filter className="h-4 w-4" />
            Advanced filters
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((event) => (
                <tr key={event.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 text-text-muted">{event.id}</td>
                  <td className="px-3 py-2 font-medium text-text-primary">{event.actor}</td>
                  <td className="px-3 py-2 text-text-secondary">{event.action}</td>
                  <td className="px-3 py-2 text-text-secondary">{event.target}</td>
                  <td className="px-3 py-2">
                    <StatusPill
                      label={event.result}
                      tone={event.result === "success" ? "success" : "warning"}
                    />
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{event.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Retention & Export"
        description="Set retention windows and export events for external compliance systems."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="text-sm text-text-secondary">
            Retention period (days)
            <input
              type="number"
              defaultValue={365}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Export format
            <select className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary">
              <option>JSONL</option>
              <option>CSV</option>
              <option>Parquet</option>
            </select>
          </label>

          <label className="text-sm text-text-secondary">
            Destination
            <input
              type="text"
              placeholder="s3://audit-archive/music"
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Download className="h-4 w-4" />
            Export Logs Now
          </button>
          <SecondaryAction label="Schedule Nightly Export" />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-border-default px-3.5 py-2 text-sm font-medium text-text-secondary hover:bg-white/10"
          >
            <ShieldAlert className="h-4 w-4" />
            Open Security Timeline
          </button>
        </div>
      </Panel>
    </div>
  );
}
