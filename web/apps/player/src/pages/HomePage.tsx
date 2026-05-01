import { useEffect, useMemo, useState } from "react";
import { ApiError, api, catalogApi, playlistsApi } from "@music/shared";
import type { Playlist, Track } from "@music/shared";
import { Disc3, Heart, History, Loader2, MoreVertical, Plus, Sparkles } from "lucide-react";
import clsx from "clsx";
import TrackRow, { type QuickActionAnchor } from "@/components/common/TrackRow";
import AddToPlaylistModal from "@/components/common/AddToPlaylistModal";
import TrackActionsModal from "@/components/common/TrackActionsModal";
import { usePlayerStore } from "@/stores/player";
import { gradientFromSeed } from "@/lib/artwork";
import { getCuratedPlaylists, type CuratedSource } from "@/lib/curation";
import { formatDuration } from "@/lib/format";
import { ensureUserFavoritesPlaylist, getRecentlyAddedTrackIds } from "@/lib/library";
import { useLibraryQuickAdd } from "@/hooks/useLibraryQuickAdd";

type CuratedPlaylistPreview = {
  id: string;
  name: string;
  description: string;
  source: CuratedSource;
  trackCount: number;
  artworkUrl: string;
  leadTrack: Track | null;
};

type PopularFavorite = {
  track: Track;
  playCount: number;
};

type PopularFavoriteApiEntry = {
  trackId: string;
  playCount: number;
};

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function sourceLabel(source: CuratedSource): string {
  return source === "ml" ? "ML" : "Human";
}

function parseCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return 0;
}

function normalizePopularFavoriteEntries(payload: unknown): PopularFavoriteApiEntry[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? [
          (payload as { items?: unknown }).items,
          (payload as { tracks?: unknown }).tracks,
          (payload as { data?: unknown }).data,
        ].find(Array.isArray) ?? []
      : [];

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const maybeTrackId =
        (item as { track_id?: unknown }).track_id ??
        (item as { trackId?: unknown }).trackId ??
        (item as { id?: unknown }).id;

      if (typeof maybeTrackId !== "string" || !maybeTrackId.trim()) {
        return null;
      }

      const playCount = parseCount(
        (item as { play_count?: unknown }).play_count ??
          (item as { playCount?: unknown }).playCount ??
          (item as { plays?: unknown }).plays ??
          (item as { count?: unknown }).count,
      );

      return {
        trackId: maybeTrackId,
        playCount,
      };
    })
    .filter((entry): entry is PopularFavoriteApiEntry => entry !== null)
    .sort((a, b) => b.playCount - a.playCount);
}

async function fetchPopularFavoritesFromAnalytics(limit: number): Promise<PopularFavoriteApiEntry[]> {
  const attempts: Array<() => Promise<unknown>> = [
    () => api.get<unknown>("/analytics/favorites/popular", { limit }),
    () => api.get<unknown>("/analytics/favorites/top", { limit }),
    () => api.get<unknown>("/analytics/popular-favorites", { limit }),
  ];

  for (const attempt of attempts) {
    try {
      const payload = await attempt();
      const parsed = normalizePopularFavoriteEntries(payload);
      if (parsed.length > 0) {
        return parsed.slice(0, limit);
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw error;
      }

      if (error instanceof ApiError && (error.status === 404 || error.status === 501)) {
        continue;
      }

      break;
    }
  }

  return [];
}

function sortPlaylistTracks(playlist: Playlist): string[] {
  return [...playlist.tracks]
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.track_id);
}

export default function HomePage() {
  const { play } = usePlayerStore();
  const { quickAddToLibrary, pendingTrackIds } = useLibraryQuickAdd();
  const recentlyPlayedHistory = usePlayerStore((state) => state.recentlyPlayed);
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylistPreview[]>([]);
  const [favoritesPlaylist, setFavoritesPlaylist] = useState<Playlist | null>(null);
  const [analyticsFavoriteEntries, setAnalyticsFavoriteEntries] = useState<PopularFavoriteApiEntry[]>([]);
  const [popularFavorites, setPopularFavorites] = useState<PopularFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionsState, setActionsState] = useState<{
    track: Track;
    anchor: QuickActionAnchor;
  } | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  const recentlyPlayed = useMemo(() => {
    const uniqueTracks = new Map<string, Track>();

    for (const track of recentlyPlayedHistory) {
      if (!uniqueTracks.has(track.id)) {
        uniqueTracks.set(track.id, track);
      }

      if (uniqueTracks.size >= 12) {
        break;
      }
    }

    return [...uniqueTracks.values()];
  }, [recentlyPlayedHistory]);

  const popularFavoriteQueue = useMemo(
    () => popularFavorites.map((entry) => entry.track),
    [popularFavorites],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [playlistRes, favorites] = await Promise.all([
          playlistsApi.listPlaylists({ page: 1, page_size: 200 }),
          ensureUserFavoritesPlaylist(),
        ]);

        const curated = getCuratedPlaylists(playlistRes.playlists ?? [], 8);

        const curatedPreviews = await Promise.all(
          curated.map(async ({ playlist, source }) => {
            const firstTrackId = sortPlaylistTracks(playlist)[0];
            let leadTrack: Track | null = null;

            if (firstTrackId) {
              try {
                leadTrack = await catalogApi.getTrack(firstTrackId);
              } catch {
                leadTrack = null;
              }
            }

            return {
              id: playlist.id,
              name: playlist.name,
              description: playlist.description?.trim() || "Fresh recommendations from your music cloud.",
              source,
              trackCount: playlist.tracks.length,
              artworkUrl: leadTrack?.artwork_url ?? "",
              leadTrack,
            } satisfies CuratedPlaylistPreview;
          }),
        );

        const analyticsEntries = await fetchPopularFavoritesFromAnalytics(5);

        if (!cancelled) {
          setCuratedPlaylists(curatedPreviews);
          setFavoritesPlaylist(favorites);
          setAnalyticsFavoriteEntries(analyticsEntries);
        }
      } catch (err) {
        if (isUnauthorizedError(err)) {
          return;
        }
        console.error("Failed to fetch home data:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolvePopularFavorites = async () => {
      if (!favoritesPlaylist) {
        setPopularFavorites([]);
        return;
      }

      const favoritesSet = new Set(favoritesPlaylist.tracks.map((entry) => entry.track_id));
      if (favoritesSet.size === 0) {
        setPopularFavorites([]);
        return;
      }

      let ranked = analyticsFavoriteEntries
        .filter((entry) => favoritesSet.has(entry.trackId))
        .slice(0, 5);

      if (ranked.length === 0) {
        const localCounts = new Map<string, number>();

        for (const track of recentlyPlayedHistory) {
          if (!favoritesSet.has(track.id)) {
            continue;
          }

          localCounts.set(track.id, (localCounts.get(track.id) ?? 0) + 1);
        }

        ranked = [...localCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([trackId, playCount]) => ({ trackId, playCount }));
      }

      if (ranked.length === 0) {
        ranked = getRecentlyAddedTrackIds(favoritesPlaylist, 5).map((trackId, index) => ({
          trackId,
          playCount: Math.max(1, 5 - index),
        }));
      }

      const tracks = await Promise.all(
        ranked.map(async (entry) => {
          try {
            const track = await catalogApi.getTrack(entry.trackId);
            return {
              track,
              playCount: entry.playCount,
            } satisfies PopularFavorite;
          } catch {
            return null;
          }
        }),
      );

      if (!cancelled) {
        setPopularFavorites(tracks.filter((entry): entry is PopularFavorite => entry !== null));
      }
    };

    void resolvePopularFavorites();

    return () => {
      cancelled = true;
    };
  }, [favoritesPlaylist, analyticsFavoriteEntries, recentlyPlayedHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <section className="pt-1">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-accent" />
          <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Home</p>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-1">Your Music Home</h1>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Made For You</h2>
        </div>

        {curatedPlaylists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {curatedPlaylists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => {
                  if (playlist.leadTrack) {
                    play(playlist.leadTrack, [playlist.leadTrack]);
                  }
                }}
                disabled={!playlist.leadTrack}
                className={clsx(
                  "group text-left rounded-xl overflow-hidden bg-white/6 hover:bg-white/10 transition-colors",
                  !playlist.leadTrack && "opacity-80",
                )}
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  {playlist.artworkUrl ? (
                    <img src={playlist.artworkUrl} alt={playlist.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ backgroundImage: gradientFromSeed(`${playlist.name}-${playlist.source}`) }}
                    >
                      <Disc3 size={26} className="text-white/80" />
                    </div>
                  )}
                  <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-white/90">
                    {sourceLabel(playlist.source)}
                  </span>
                </div>

                <div className="p-3">
                  <p className="text-sm font-semibold text-text-primary truncate">{playlist.name}</p>
                  <p className="text-xs text-text-secondary mt-1 line-clamp-2 min-h-[2rem]">{playlist.description}</p>
                  <p className="text-[11px] text-text-muted mt-2">
                    {playlist.trackCount} track{playlist.trackCount === 1 ? "" : "s"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="list-shell px-4 py-5 text-sm text-text-secondary">
            Curated playlists are not available yet.
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Heart size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Favorites</h2>
        </div>

        {popularFavorites.length > 0 ? (
          <div className="list-shell">
            <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
              <div className="w-8 text-center">#</div>
              <div className="flex-1">Title</div>
              <div className="hidden sm:block w-24 text-right">Plays</div>
              <div className="w-12 text-right">Time</div>
              <div className="w-17" />
            </div>

            {popularFavorites.map((entry, index) => (
              <div
                key={entry.track.id}
                role="button"
                tabIndex={0}
                onClick={() => play(entry.track, popularFavoriteQueue)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    play(entry.track, popularFavoriteQueue);
                  }
                }}
                className="track-row group w-full flex items-center gap-4 rounded-xl transition-colors text-left cursor-pointer hover:bg-bg-surface-hover/80"
              >
                <div className="w-8 text-center shrink-0 text-sm text-text-muted tabular-nums">{index + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{entry.track.title}</p>
                  <p className="text-xs text-text-secondary truncate">{entry.track.artist_name}</p>
                </div>
                <div className="hidden sm:block w-24 text-right text-xs text-text-secondary tabular-nums">
                  {entry.playCount.toLocaleString()}
                </div>
                <span className="text-sm text-text-muted tabular-nums w-12 text-right shrink-0">
                  {formatDuration(entry.track.duration_secs)}
                </span>
                <div className="w-17 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void quickAddToLibrary(entry.track);
                    }}
                    disabled={pendingTrackIds.has(entry.track.id)}
                    className="w-7 h-7 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:bg-white/5 inline-flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Add to Library"
                    aria-label="Add to Library"
                  >
                    <Plus size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setActionsState({
                        track: entry.track,
                        anchor: {
                          x: rect.right,
                          y: rect.bottom,
                        },
                      });
                    }}
                    className="w-7 h-7 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:bg-white/5 inline-flex items-center justify-center transition-colors"
                    title="Track actions"
                    aria-label="Track actions"
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="list-shell px-4 py-5 text-sm text-text-secondary">
            Play and favorite tracks to build your top favorites preview.
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Recently Played</h2>
        </div>

        {recentlyPlayed.length > 0 ? (
          <div className="list-shell">
            <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
              <div className="w-8 text-center">#</div>
              <div className="flex-1">Title</div>
              <div className="hidden md:block w-[30%]">Album</div>
              <div className="w-12 text-right">Time</div>
            </div>
            {recentlyPlayed.map((track, i) => (
              <TrackRow
                key={`${track.id}-${i}`}
                track={track}
                index={i + 1}
                queue={recentlyPlayed}
                quickAddPending={pendingTrackIds.has(track.id)}
                onQuickAddClick={(selectedTrack) => {
                  void quickAddToLibrary(selectedTrack);
                }}
                onQuickActionClick={(selectedTrack, anchor) => {
                  setActionsState({ track: selectedTrack, anchor });
                }}
              />
            ))}
          </div>
        ) : (
          <div className="list-shell px-4 py-5 text-sm text-text-secondary">
            Recently played tracks will appear here once you start listening.
          </div>
        )}
      </section>

      <AddToPlaylistModal
        trackId={playlistModalTrackId ?? ""}
        isOpen={playlistModalTrackId !== null}
        onClose={() => setPlaylistModalTrackId(null)}
      />

      <TrackActionsModal
        track={actionsState?.track ?? null}
        anchor={actionsState?.anchor ?? null}
        isOpen={actionsState !== null}
        onClose={() => setActionsState(null)}
        onOpenPlaylistPicker={(track) => {
          setPlaylistModalTrackId(track.id);
        }}
      />
    </div>
  );
}
