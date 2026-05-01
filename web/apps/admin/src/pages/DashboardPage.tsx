import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { catalogApi, api } from "@music/shared";
import type { HealthResponse } from "@music/shared";
import {
  Activity,
  BrainCircuit,
  Music,
  Disc3,
  Users,
  HardDrive,
  AlertCircle,
  PlugZap,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from "lucide-react";
import clsx from "clsx";

interface DashboardStats {
  health: HealthResponse | null;
  totalTracks: number;
  totalAlbums: number;
  totalArtists: number;
  isLoading: boolean;
  error: string | null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    health: null,
    totalTracks: 0,
    totalAlbums: 0,
    totalArtists: 0,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const [health, tracks, albums, artists] = await Promise.allSettled([
          api.get<HealthResponse>("/health"),
          catalogApi.listTracks({ page: 1, page_size: 1 }),
          catalogApi.listAlbums({ page: 1, page_size: 1 }),
          catalogApi.listArtists({ page: 1, page_size: 1 }),
        ]);

        setStats({
          health: health.status === "fulfilled" ? health.value : null,
          totalTracks:
            tracks.status === "fulfilled" ? tracks.value.total : 0,
          totalAlbums:
            albums.status === "fulfilled" ? albums.value.total : 0,
          totalArtists:
            artists.status === "fulfilled" ? artists.value.total : 0,
          isLoading: false,
          error: null,
        });
      } catch {
        setStats((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to load dashboard data",
        }));
      }
    }

    fetchStats();
  }, []);

  const healthOk = stats.health?.status === "ok";

  const cards = [
    {
      label: "Server Health",
      value: stats.health ? (healthOk ? "Healthy" : stats.health.status) : "--",
      icon: Activity,
      color: healthOk ? "text-success" : "text-danger",
      bg: healthOk ? "bg-success/10" : "bg-danger/10",
      sub: stats.health?.version ? `v${stats.health.version}` : undefined,
    },
    {
      label: "Total Tracks",
      value: stats.totalTracks.toLocaleString(),
      icon: Music,
      color: "text-accent",
      bg: "bg-accent-muted",
    },
    {
      label: "Total Albums",
      value: stats.totalAlbums.toLocaleString(),
      icon: Disc3,
      color: "text-accent",
      bg: "bg-accent-muted",
    },
    {
      label: "Total Artists",
      value: stats.totalArtists.toLocaleString(),
      icon: Users,
      color: "text-accent",
      bg: "bg-accent-muted",
    },
    {
      label: "Storage",
      value: "--",
      icon: HardDrive,
      color: "text-text-secondary",
      bg: "bg-bg-surface-hover",
      sub: "Coming soon",
    },
  ];

  const controlDomains = [
    {
      title: "Users & Access",
      description: "Account management, role policy, password resets, and lockout actions.",
      to: "/users",
      icon: Users,
    },
    {
      title: "Curation",
      description: "Featured favorites, homepage shelf strategy, and campaign scheduling.",
      to: "/curation",
      icon: Sparkles,
    },
    {
      title: "Machine Learning",
      description: "Recommendation controls, signal weights, experiments, and retraining.",
      to: "/ml",
      icon: BrainCircuit,
    },
    {
      title: "Operations",
      description: "Service health, queue pressure, worker policies, and maintenance.",
      to: "/operations",
      icon: Workflow,
    },
    {
      title: "Security",
      description: "Auth hardening, network guardrails, and secret rotation workflows.",
      to: "/security",
      icon: Shield,
    },
    {
      title: "Integrations",
      description: "Webhooks, SSO providers, API clients, and outbound channels.",
      to: "/integrations",
      icon: PlugZap,
    },
    {
      title: "Audit Logs",
      description: "Compliance event search, exports, and retention policy controls.",
      to: "/audit",
      icon: ScrollText,
    },
    {
      title: "System Config",
      description: "Global runtime defaults, feature flags, and backup settings.",
      to: "/system",
      icon: SlidersHorizontal,
    },
  ];

  if (stats.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="page-header py-6 md:py-8">
        <h1 className="text-[1.85rem] md:text-[2rem] font-semibold tracking-tight text-text-primary">
          Dashboard
        </h1>
        <p className="text-sm md:text-[0.95rem] text-text-secondary mt-1.5 max-w-2xl">
          Overview of service health and catalog size for your music system.
        </p>
      </section>

      {stats.error && (
        <div className="surface-panel flex items-center gap-2 text-sm text-danger border border-danger/35 px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {stats.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="surface-panel p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text-secondary">{card.label}</span>
              <div
                className={clsx(
                  "w-9 h-9 rounded-lg flex items-center justify-center",
                  card.bg,
                )}
              >
                <card.icon className={clsx("w-4 h-4", card.color)} />
              </div>
            </div>
            <p className={clsx("text-2xl font-bold", card.color)}>
              {card.value}
            </p>
            {card.sub && (
              <p className="text-xs text-text-muted mt-1">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">Control Domains</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {controlDomains.map((domain) => (
            <Link
              key={domain.title}
              to={domain.to}
              className="surface-panel p-4 transition-colors hover:bg-bg-surface-hover/70"
            >
              <div className="flex items-center gap-2">
                <domain.icon className="h-4 w-4 text-accent" />
                <p className="text-sm font-semibold text-text-primary">{domain.title}</p>
              </div>
              <p className="mt-2 text-xs text-text-secondary leading-relaxed">
                {domain.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
