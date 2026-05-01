import { useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { playlistsApi } from "@music/shared";
import type { Playlist } from "@music/shared";
import {
  Home,
  Compass,
  Library,
  Music2,
} from "lucide-react";
import clsx from "clsx";
import { USER_FAVORITES_PLAYLIST_NAME } from "@/lib/library";

const navItems = [
  {
    to: "/",
    icon: Home,
    label: "Home",
  },
  {
    to: "/discovery",
    icon: Compass,
    label: "Discovery",
  },
  {
    to: "/library",
    icon: Library,
    label: "Library",
  },
];

function isFavoritesPlaylist(playlist: Playlist): boolean {
  return (
    playlist.name.trim().toLowerCase() ===
    USER_FAVORITES_PLAYLIST_NAME.toLowerCase()
  );
}

function isLegacyLibraryPlaylist(playlist: Playlist): boolean {
  return playlist.name.trim().toLowerCase() === "my library";
}

export default function Sidebar() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadPlaylists = async () => {
      setLoadingPlaylists(true);

      try {
        const response = await playlistsApi.listPlaylists({ page: 1, page_size: 200 });

        if (!cancelled) {
          setPlaylists(response.playlists ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load sidebar playlists:", err);
          setPlaylists([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingPlaylists(false);
        }
      }
    };

    void loadPlaylists();

    return () => {
      cancelled = true;
    };
  }, []);

  const sidebarPlaylists = useMemo(
    () =>
      [...playlists]
        .filter((playlist) => !isLegacyLibraryPlaylist(playlist))
        .sort((a, b) =>
          isFavoritesPlaylist(a) === isFavoritesPlaylist(b)
            ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            : isFavoritesPlaylist(a)
              ? -1
              : 1,
        )
        .slice(0, 6),
    [playlists],
  );

  return (
    <>
      <aside className="hidden lg:block app-sidebar">
        <div className="app-sidebar-panel h-full overflow-y-auto">
          <div className="flex items-center gap-3 app-brand-row">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
              <Music2 size={20} className="text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              Music
            </span>
          </div>

          <nav className="flex-1 px-3 mt-2">
            <p className="px-1 mb-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">Browse</p>
            <ul className="space-y-1.5">
              {navItems.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/"}
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

            <div className="mt-5">
              <div className="px-1 mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Your Playlists</p>
                <Link
                  to="/playlists"
                  className="text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-text-primary"
                >
                  See all
                </Link>
              </div>

              {loadingPlaylists ? (
                <p className="px-1 text-xs text-text-muted">Loading playlists...</p>
              ) : sidebarPlaylists.length > 0 ? (
                <ul className="space-y-1">
                  {sidebarPlaylists.map((playlist) => (
                    <li key={playlist.id}>
                      <Link
                        to={`/playlists/${playlist.id}`}
                        className="block rounded-lg px-2 py-1.5 hover:bg-white/8 transition-colors"
                      >
                        <p className="text-xs text-text-primary truncate font-medium">{playlist.name}</p>
                        <p className="text-[11px] text-text-muted truncate">
                          {playlist.tracks.length} track{playlist.tracks.length === 1 ? "" : "s"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Link
                  to="/playlists"
                  className="block px-1 text-xs text-text-muted hover:text-text-primary"
                >
                  Create your first playlist
                </Link>
              )}
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
            <p className="text-sm font-semibold text-text-primary truncate">Music</p>
          </div>

          <nav className="mt-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex items-center gap-2 min-w-max pr-1">
              {navItems.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/"}
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
