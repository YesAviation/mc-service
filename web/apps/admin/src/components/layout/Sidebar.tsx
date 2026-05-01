import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "@music/shared";
import {
  Activity,
  BrainCircuit,
  FolderSearch,
  Library,
  LayoutDashboard,
  ListMusic,
  Music2,
  PenSquare,
  PlugZap,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      { label: "System Config", to: "/system", icon: SlidersHorizontal },
    ],
  },
  {
    label: "People & Content",
    items: [
      { label: "Users & Access", to: "/users", icon: Users },
      { label: "Curation", to: "/curation", icon: Sparkles },
      { label: "Playlists", to: "/playlists", icon: ListMusic },
      { label: "Browse Library", to: "/library", icon: Library },
      { label: "Metadata Editor", to: "/library/metadata", icon: PenSquare },
      { label: "Scan & Import", to: "/library/scan", icon: FolderSearch },
    ],
  },
  {
    label: "Intelligence",
    items: [{ label: "Machine Learning", to: "/ml", icon: BrainCircuit }],
  },
  {
    label: "Platform",
    items: [
      { label: "Operations", to: "/operations", icon: Activity },
      { label: "Security", to: "/security", icon: Shield },
      { label: "Integrations", to: "/integrations", icon: PlugZap },
      { label: "Audit Logs", to: "/audit", icon: ScrollText },
      { label: "Media Processing", to: "/settings", icon: Settings },
    ],
  },
];

const mobileNavItems = navSections.flatMap((section) => section.items);

export default function Sidebar() {
  const { user } = useAuthStore();

  return (
    <>
      <aside className="hidden lg:block app-sidebar">
        <div className="app-sidebar-panel h-full overflow-y-auto">
          <div className="flex items-center gap-3 app-brand-row">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
              <Music2 size={20} className="text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              Music Admin
            </span>
          </div>

          <nav className="flex-1 px-3 mt-2">
            <div className="space-y-4">
              {navSections.map((section) => (
                <div key={section.label}>
                  <p className="px-1 mb-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                    {section.label}
                  </p>
                  <ul className="space-y-1.5">
                    {section.items.map(({ to, icon: Icon, label }) => (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={to === "/dashboard"}
                          className={({ isActive }) =>
                            clsx(
                              "sidebar-nav-link flex items-center gap-3 text-sm transition-colors",
                              isActive
                                ? "bg-white/12 text-text-primary"
                                : "text-text-secondary hover:text-text-primary hover:bg-white/7",
                            )
                          }
                        >
                          <Icon size={18} className="shrink-0" />
                          <span className="font-semibold leading-tight">{label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="px-1 mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  Account
                </p>
                <Link
                  to="/settings"
                  className="text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-text-primary"
                >
                  Settings
                </Link>
              </div>

              <div className="rounded-lg px-2 py-1.5 bg-white/8">
                <p className="text-xs text-text-primary truncate font-medium">
                  {user?.username ?? "Administrator"}
                </p>
                <p className="text-[11px] text-text-muted truncate">
                  {user?.email ?? "admin@music.local"}
                </p>
              </div>
            </div>
          </nav>
        </div>
      </aside>

      <div className="lg:hidden app-mobile-nav px-3 pt-3">
        <div className="list-shell px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
              <Music2 size={16} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-text-primary truncate">
              Music Admin
            </p>
          </div>

          <nav className="mt-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex items-center gap-2 min-w-max pr-1">
              {mobileNavItems.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/dashboard"}
                    className={({ isActive }) =>
                      clsx(
                        "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-accent/18 text-accent"
                          : "text-text-secondary bg-bg-elevated/45",
                      )
                    }
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
