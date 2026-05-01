import { Activity, RefreshCcw, Server, TimerReset, Workflow } from "lucide-react";
import {
  PageHero,
  Panel,
  PrimaryAction,
  SecondaryAction,
  StatusPill,
} from "@/components/admin/AdminPrimitives";

const services = [
  { name: "gateway", host: "gateway:8080", health: "healthy", p95: "113ms", errorRate: "0.14%" },
  { name: "catalog", host: "catalog:50053", health: "healthy", p95: "87ms", errorRate: "0.09%" },
  { name: "auth", host: "auth:50052", health: "healthy", p95: "62ms", errorRate: "0.03%" },
  { name: "transcoding", host: "transcoding:50066", health: "degraded", p95: "420ms", errorRate: "1.90%" },
  { name: "search", host: "search:50061", health: "healthy", p95: "140ms", errorRate: "0.21%" },
];

const queues = [
  { name: "hls-prewarm", depth: 122, workers: 6, target: "<= 150", state: "stable" },
  { name: "transcode-backfill", depth: 381, workers: 12, target: "<= 200", state: "hot" },
  { name: "analytics-flush", depth: 24, workers: 3, target: "<= 80", state: "stable" },
  { name: "notification-dispatch", depth: 7, workers: 2, target: "<= 50", state: "stable" },
];

const jobs = [
  { id: "job_2101", name: "Nightly Backup", cron: "0 2 * * *", lastRun: "2026-04-17 02:00", state: "success" },
  { id: "job_2102", name: "Metadata Reindex", cron: "0 */6 * * *", lastRun: "2026-04-17 06:00", state: "running" },
  { id: "job_2103", name: "Search Snapshot", cron: "0 */2 * * *", lastRun: "2026-04-17 08:00", state: "success" },
  { id: "job_2104", name: "Inactive Session Cleanup", cron: "*/30 * * * *", lastRun: "2026-04-17 08:30", state: "success" },
];

export default function OperationsPage() {
  return (
    <div className="space-y-6">
      <PageHero
        title="Operations"
        badge="Runtime"
        description="Monitor service health, queue pressure, job execution, and maintenance controls across the full server runtime."
      />

      <Panel
        title="Service Health"
        description="Live service status and runtime control actions."
        action={<PrimaryAction label="Refresh Status" />}
      >
        <div className="space-y-2">
          {services.map((service) => (
            <div
              key={service.name}
              className="grid grid-cols-1 gap-3 rounded-lg border border-border-subtle bg-white/5 p-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.06em] text-text-primary">{service.name}</p>
                <p className="text-xs text-text-muted">{service.host}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-text-muted">Health</p>
                <StatusPill
                  label={service.health}
                  tone={service.health === "healthy" ? "success" : "warning"}
                />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-text-muted">P95 latency</p>
                <p className="text-sm text-text-secondary">{service.p95}</p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-text-muted">Error rate</p>
                <p className="text-sm text-text-secondary">{service.errorRate}</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border-default px-2.5 py-1.5 text-xs text-text-secondary hover:bg-white/10"
                >
                  Restart
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border-default px-2.5 py-1.5 text-xs text-text-secondary hover:bg-white/10"
                >
                  Drain
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Queue Management"
        description="Track worker depth and tune concurrency in real time."
      >
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.08em] text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Queue</th>
                <th className="px-3 py-2 font-medium">Depth</th>
                <th className="px-3 py-2 font-medium">Workers</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => (
                <tr key={queue.name} className="hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-text-primary">{queue.name}</td>
                  <td className="px-3 py-2 text-text-secondary">{queue.depth}</td>
                  <td className="px-3 py-2 text-text-secondary">{queue.workers}</td>
                  <td className="px-3 py-2 text-text-secondary">{queue.target}</td>
                  <td className="px-3 py-2">
                    <StatusPill
                      label={queue.state}
                      tone={queue.state === "hot" ? "warning" : "success"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm text-text-secondary">
            Global worker cap
            <input
              type="number"
              defaultValue={36}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Retry backoff (seconds)
            <input
              type="number"
              defaultValue={30}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>

          <label className="text-sm text-text-secondary">
            Dead-letter threshold
            <input
              type="number"
              defaultValue={5}
              className="mt-1 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryAction label="Apply Queue Policy" />
          <SecondaryAction label="Pause All Workers" />
        </div>
      </Panel>

      <Panel
        title="Scheduled Jobs"
        description="Cron jobs for maintenance, backups, and platform operations."
      >
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white/5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{job.name}</p>
                  <p className="text-xs text-text-muted">
                    {job.id} • cron {job.cron} • last run {job.lastRun}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusPill
                  label={job.state}
                  tone={job.state === "success" ? "success" : "info"}
                />
                <button
                  type="button"
                  className="rounded-lg border border-border-default px-2.5 py-1.5 text-xs text-text-secondary hover:bg-white/10"
                >
                  Run now
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <Server className="h-4 w-4" />
            Rolling Restart
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" />
            Flush Caches
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <Activity className="h-4 w-4" />
            Trigger Health Sweep
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary hover:bg-white/10"
          >
            <TimerReset className="h-4 w-4" />
            Enter Maintenance Mode
          </button>
        </div>
      </Panel>
    </div>
  );
}
