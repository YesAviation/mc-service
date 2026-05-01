import { useEffect, useMemo, useState } from "react";
import { ApiError, catalogApi, playlistsApi } from "@music/shared";
import type { Album, Playlist, Track } from "@music/shared";
import { Clock3, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import clsx from "clsx";
import TrackRow, { type QuickActionAnchor } from "@/components/common/TrackRow";
import AlbumCard from "@/components/common/AlbumCard";
import AddToPlaylistModal from "@/components/common/AddToPlaylistModal";
import TrackActionsModal from "@/components/common/TrackActionsModal";
import { usePlayerStore } from "@/stores/player";
import { gradientFromSeed } from "@/lib/artwork";
import { getCuratedPlaylists, type CuratedSource } from "@/lib/curation";
import { useLibraryQuickAdd } from "@/hooks/useLibraryQuickAdd";

const DISCOVERY_PAGE_SIZE = 100;

type CuratedPlaylistCard = {
  id: string;
  name: string;
  description: string;
  source: CuratedSource;
  trackCount: number;
  artworkUrl: string;
  leadTrack: Track | null;
};

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function toTimestamp(value?: string): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function sourceLabel(source: CuratedSource): string {
  return source === "ml" ? "ML" : "Human";
}

function isAdminFavoritePlaylist(playlist: Playlist): boolean {
  const text = `${playlist.name} ${playlist.description ?? ""}`;
  return /admin\s*(favorites?|picks?)|featured|popular\s*(music|albums|tracks)?/i.test(text);
}

function sortPlaylistTrackIds(playlist: Playlist): string[] {
  return [...playlist.tracks]
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.track_id);
}

async function fetchAllTracks(
  onPage: (itemsLoaded: number, total: number) => void,
): Promise<Track[]> {
  const allTracks: Track[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await catalogApi.listTracks({ page, page_size: DISCOVERY_PAGE_SIZE });
    allTracks.push(...response.items);
    totalPages = Math.max(response.total_pages || 1, page);
    onPage(allTracks.length, response.total);
    page += 1;
  }

  return allTracks;
}

export default function DiscoveryPage() {
  const { play } = usePlayerStore();
  const { quickAddToLibrary, pendingTrackIds } = useLibraryQuickAdd();
  const [loading, setLoading] = useState(true);
  const [loadingAllTracks, setLoadingAllTracks] = useState(false);
  const [tracksLoaded, setTracksLoaded] = useState(0);
  const [tracksTotal, setTracksTotal] = useState<number | null>(null);
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylistCard[]>([]);
  const [adminFavoriteAlbums, setAdminFavoriteAlbums] = useState<Album[]>([]);
  const [recentlyAddedTracks, setRecentlyAddedTracks] = useState<Track[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [actionsState, setActionsState] = useState<{
    track: Track;
    anchor: QuickActionAnchor;
  } | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setLoadingAllTracks(true);
      setTracksLoaded(0);
      setTracksTotal(null);

      try {
        const [playlistRes, tracks] = await Promise.all([
          playlistsApi.listPlaylists({ page: 1, page_size: 250 }),
          fetchAllTracks((loaded, total) => {
            if (!cancelled) {
              setTracksLoaded(loaded);
              setTracksTotal(total);
            }
          }),
        ]);

        if (cancelled) {
          return;
        }

        setAllTracks(tracks);

        const trackMap = new Map(tracks.map((track) => [track.id, track]));
        const playlists = playlistRes.playlists ?? [];

        const curated = getCuratedPlaylists(playlists, 12);
        const curatedCards = curated.map(({ playlist, source }) => {
          const leadTrackId = sortPlaylistTrackIds(playlist)[0];
          const leadTrack = leadTrackId ? (trackMap.get(leadTrackId) ?? null) : null;

          return {
            id: playlist.id,
            name: playlist.name,
            description: playlist.description?.trim() || "Curated for your next session.",
            source,
            trackCount: playlist.tracks.length,
            artworkUrl: leadTrack?.artwork_url ?? "",
            leadTrack,
          } satisfies CuratedPlaylistCard;
        });

        const recentTracks = [...tracks]
          .sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))
          .slice(0, 16);

        const adminPlaylists = playlists.filter(isAdminFavoritePlaylist);
        let adminAlbums: Album[] = [];

        if (adminPlaylists.length > 0) {
          const adminTrackIds = adminPlaylists
            .flatMap(sortPlaylistTrackIds)
            .filter((trackId, index, all) => all.indexOf(trackId) === index)
            .slice(0, 40);

          const albumById = new Map<string, Album>();
          for (const trackId of adminTrackIds) {
            const track = trackMap.get(trackId);
            if (!track || albumById.has(track.album_id)) {
              continue;
            }

            albumById.set(track.album_id, {
              id: track.album_id,
              title: track.album_title,
              artist_id: track.artist_id,
              artist_name: track.artist_name,
              year: track.year,
              genre: track.genre,
              artwork_url: track.artwork_url,
              track_count: 0,
              created_at: track.created_at,
            });
          }

          adminAlbums = [...albumById.values()].slice(0, 10);
        }

        if (adminAlbums.length === 0) {
          const fallbackAlbums = await catalogApi.listAlbums({ page: 1, page_size: 10 });
          adminAlbums = [...fallbackAlbums.items].sort((a, b) => b.track_count - a.track_count);
        }

        if (!cancelled) {
          setCuratedPlaylists(curatedCards);
          setRecentlyAddedTracks(recentTracks);
          setAdminFavoriteAlbums(adminAlbums);
        }
      } catch (err) {
        if (isUnauthorizedError(err)) {
          return;
        }
        console.error("Failed to fetch discovery data:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingAllTracks(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const allTracksQueue = useMemo(() => allTracks, [allTracks]);
  const recentQueue = useMemo(() => recentlyAddedTracks, [recentlyAddedTracks]);

  return (
    <div className="space-y-7">
      <section className="page-header">
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-2">Discovery</h1>
      </section>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <>
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">Curated Playlists</h2>
            </div>

            {curatedPlaylists.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                      "group overflow-hidden rounded-xl border border-border-subtle bg-black/10 text-left hover:bg-white/6 transition-colors",
                      !playlist.leadTrack && "opacity-80",
                    )}
                  >
                    <div className="relative aspect-[21/9] overflow-hidden">
                      {playlist.artworkUrl ? (
                        <img src={playlist.artworkUrl} alt={playlist.name} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundImage: gradientFromSeed(`${playlist.name}-${playlist.source}`) }}
                        />
                      )}
                      <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/90">
                        {sourceLabel(playlist.source)}
                      </span>
                    </div>

                    <div className="p-4">
                      <p className="text-base font-semibold text-text-primary truncate">{playlist.name}</p>
                      <p className="text-sm text-text-secondary mt-1 line-clamp-2 min-h-[2.5rem]">{playlist.description}</p>
                      <p className="text-xs text-text-muted mt-3">
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
              <ShieldCheck size={16} className="text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">Admin Favorites</h2>
            </div>

            {adminFavoriteAlbums.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {adminFavoriteAlbums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            ) : (
              <div className="list-shell px-4 py-5 text-sm text-text-secondary">
                Admin favorite albums are not configured yet.
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock3 size={16} className="text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">Recently Added Music</h2>
            </div>

            {recentlyAddedTracks.length > 0 ? (
              <div className="list-shell">
                <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
                  <div className="w-8 text-center">#</div>
                  <div className="flex-1">Title</div>
                  <div className="hidden md:block w-[30%]">Album</div>
                  <div className="w-12 text-right">Time</div>
                </div>
                {recentlyAddedTracks.map((track, index) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={index + 1}
                    queue={recentQueue}
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
                No recently added tracks found.
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold text-text-primary">All Music</h2>
              <p className="text-xs text-text-muted">
                {loadingAllTracks
                  ? `Loading ${tracksLoaded.toLocaleString()}${tracksTotal !== null ? ` / ${tracksTotal.toLocaleString()}` : ""}`
                  : `${allTracks.length.toLocaleString()} total tracks`}
              </p>
            </div>

            <div className="list-shell">
              <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
                <div className="w-8 text-center">#</div>
                <div className="flex-1">Title</div>
                <div className="hidden md:block w-[30%]">Album</div>
                <div className="w-12 text-right">Time</div>
              </div>
              {allTracks.length > 0 ? (
                allTracks.map((track, index) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={index + 1}
                    queue={allTracksQueue}
                    quickAddPending={pendingTrackIds.has(track.id)}
                    onQuickAddClick={(selectedTrack) => {
                      void quickAddToLibrary(selectedTrack);
                    }}
                    onQuickActionClick={(selectedTrack, anchor) => {
                      setActionsState({ track: selectedTrack, anchor });
                    }}
                  />
                ))
              ) : (
                <div className="py-12 text-center text-text-muted">No tracks found on the server.</div>
              )}
            </div>
          </section>
        </>
      )}

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
