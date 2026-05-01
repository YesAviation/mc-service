import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { catalogApi } from "@music/shared";
import type { Album, Artist, PaginatedResponse, Track } from "@music/shared";
import { Disc3, Loader2, Music, UserRound } from "lucide-react";
import { usePlayerStore } from "@/stores/player";
import { gradientFromSeed } from "@/lib/artwork";
import {
  ensureUserFavoritesPlaylist,
  getRecentlyAddedTrackIds,
} from "@/lib/library";

function emptyPaginated<T>(): PaginatedResponse<T> {
  return {
    items: [],
    total: 0,
    page: 1,
    page_size: 0,
    total_pages: 1,
  };
}

async function fetchRelatedArtists(track: Track): Promise<Artist[]> {
  if (track.genre?.trim()) {
    const byGenre = await catalogApi.listTracks({
      genre: track.genre,
      page: 1,
      page_size: 160,
    });

    const counts = new Map<string, { name: string; count: number }>();

    for (const item of byGenre.items) {
      if (!item.artist_id || item.artist_id === track.artist_id) {
        continue;
      }
      const existing = counts.get(item.artist_id);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(item.artist_id, { name: item.artist_name, count: 1 });
      }
    }

    const rankedIds = [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([artistId]) => artistId);

    if (rankedIds.length > 0) {
      const resolved = await Promise.all(
        rankedIds.map(async (artistId) => {
          try {
            return await catalogApi.getArtist(artistId);
          } catch {
            const fallback = counts.get(artistId);
            return {
              id: artistId,
              name: fallback?.name ?? "Unknown Artist",
              bio: "",
              image_url: "",
              album_count: 0,
              track_count: 0,
              created_at: new Date(0).toISOString(),
            } as Artist;
          }
        }),
      );

      return resolved;
    }
  }

  const artists = await catalogApi.listArtists({ page: 1, page_size: 12 });
  return artists.items
    .filter((artist) => artist.id !== track.artist_id)
    .slice(0, 6);
}

export default function RightSidebar() {
  const navigate = useNavigate();
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const play = usePlayerStore((state) => state.play);

  const [recentLikedTrack, setRecentLikedTrack] = useState<Track | null>(null);
  const [currentArtist, setCurrentArtist] = useState<Artist | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [otherAlbums, setOtherAlbums] = useState<Album[]>([]);
  const [relatedArtists, setRelatedArtists] = useState<Artist[]>([]);
  const [loadingRecentLiked, setLoadingRecentLiked] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState("");

  const displayTrack = currentTrack ?? recentLikedTrack;

  useEffect(() => {
    if (currentTrack) {
      return;
    }

    let cancelled = false;

    const loadRecentLikedTrack = async () => {
      setLoadingRecentLiked(true);

      try {
        // TODO(analytics): Replace this favorites-based fallback with music-analytics recent-like history endpoint.
        const favorites = await ensureUserFavoritesPlaylist();
        const recentTrackIds = getRecentlyAddedTrackIds(favorites, 1);

        if (recentTrackIds.length === 0) {
          if (!cancelled) {
            setRecentLikedTrack(null);
          }
          return;
        }

        const track = await catalogApi.getTrack(recentTrackIds[0]).catch(() => null);
        if (!cancelled) {
          setRecentLikedTrack(track);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load recent liked fallback:", err);
          setRecentLikedTrack(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingRecentLiked(false);
        }
      }
    };

    void loadRecentLikedTrack();

    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  useEffect(() => {
    if (!displayTrack) {
      setCurrentArtist(null);
      setAlbum(null);
      setAlbumTracks([]);
      setOtherAlbums([]);
      setRelatedArtists([]);
      setError("");
      return;
    }

    let cancelled = false;

    const loadDetails = async () => {
      setLoadingDetails(true);
      setError("");

      try {
        const [albumData, tracksData, albumsData, artistData, related] = await Promise.all([
          displayTrack.album_id
            ? catalogApi.getAlbum(displayTrack.album_id)
            : Promise.resolve<Album | null>(null),
          displayTrack.album_id
            ? catalogApi.listTracks({
                album_id: displayTrack.album_id,
                page: 1,
                page_size: 120,
              })
            : Promise.resolve(emptyPaginated<Track>()),
          displayTrack.artist_id
            ? catalogApi.listAlbums({
                artist_id: displayTrack.artist_id,
                page: 1,
                page_size: 18,
              })
            : Promise.resolve(emptyPaginated<Album>()),
          displayTrack.artist_id
            ? catalogApi.getArtist(displayTrack.artist_id).catch(() => null)
            : Promise.resolve<Artist | null>(null),
          fetchRelatedArtists(displayTrack),
        ]);

        if (cancelled) {
          return;
        }

        const sortedTracks = [...tracksData.items].sort((a, b) => {
          if (a.disc_number !== b.disc_number) {
            return a.disc_number - b.disc_number;
          }
          return a.track_number - b.track_number;
        });

        setCurrentArtist(artistData ?? null);
        setAlbum(albumData);
        setAlbumTracks(sortedTracks);
        setOtherAlbums(
          albumsData.items
            .filter((item) => item.id !== displayTrack.album_id)
            .slice(0, 8),
        );
        setRelatedArtists(related);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load right sidebar details:", err);
          setError("Could not load song details.");
        }
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
        }
      }
    };

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [displayTrack]);

  const panelArtwork = useMemo(() => {
    return (
      displayTrack?.artwork_url ||
      album?.artwork_url ||
      currentArtist?.image_url ||
      ""
    );
  }, [album?.artwork_url, currentArtist?.image_url, displayTrack?.artwork_url]);

  const panelGradient = useMemo(() => {
    return gradientFromSeed(
      `${displayTrack?.title ?? ""}-${displayTrack?.artist_name ?? ""}`,
    );
  }, [displayTrack?.artist_name, displayTrack?.title]);

  const siblingTracks = displayTrack
    ? albumTracks.filter((track) => track.id !== displayTrack.id)
    : [];

  return (
    <aside className="hidden lg:block app-right-sidebar">
      <div className="app-right-sidebar-panel relative overflow-hidden">
        {panelArtwork ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-42 scale-110 blur-[1.5px]"
            style={{ backgroundImage: `url(${panelArtwork})` }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundImage: panelGradient }}
          />
        )}
        <div className="absolute inset-0 opacity-58" style={{ backgroundImage: panelGradient }} />

        {!displayTrack ? (
          <div
            className="relative z-10 ml-3 flex flex-col items-center justify-center text-center h-[56vh] min-h-80"
            style={{ paddingBottom: "calc(var(--player-height) + 1rem)" }}
          >
            {loadingRecentLiked ? (
              <Loader2 size={24} className="animate-spin text-white/80" />
            ) : (
              <>
                <Music size={28} className="text-white/80" />
                <p className="text-sm text-white/85 mt-2">No liked songs yet</p>
              </>
            )}
          </div>
        ) : (
          <div className="relative z-10 ml-3">
            <section className="relative h-[62vh] min-h-100">
              {displayTrack.artwork_url ? (
                <img
                  src={displayTrack.artwork_url}
                  alt={displayTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundImage: gradientFromSeed(`${displayTrack.title}-${displayTrack.artist_name}`) }}
                >
                  <Disc3 size={52} className="text-white/70" />
                </div>
              )}

              <div className="absolute inset-0 bg-linear-to-t from-[#0b0f17] via-[#0b0f17]/72 to-black/0" />

              <div className="absolute inset-x-0 bottom-0 px-4 pb-5">
                <p className="text-base font-semibold text-white truncate">{displayTrack.title}</p>
                <button
                  type="button"
                  onClick={() => navigate(`/discovery?tab=artists&artist_id=${displayTrack.artist_id}`)}
                  className="text-xs text-white/90 hover:text-white mt-0.5"
                >
                  {displayTrack.artist_name}
                </button>
                {album && (
                  <button
                    type="button"
                    onClick={() => navigate(`/album/${album.id}`)}
                    className="block text-xs text-accent-soft hover:text-white mt-1"
                  >
                    {album.title}
                  </button>
                )}
              </div>
            </section>

            <div
              className="relative bg-[#0b0f17] px-4 pt-5 space-y-5"
              style={{ paddingBottom: "calc(var(--player-height) + 1rem)" }}
            >
              {loadingDetails ? (
                <div className="py-8 flex items-center justify-center">
                  <Loader2 size={22} className="animate-spin text-text-muted" />
                </div>
              ) : (
                <>
                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.12em] text-text-muted mb-2">From This Album</h3>
                    {siblingTracks.length > 0 ? (
                      <div className="space-y-0.5">
                        {siblingTracks.slice(0, 8).map((track, i) => (
                          <button
                            key={track.id}
                            type="button"
                            onClick={() => play(track, albumTracks)}
                            className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/10 transition-colors bg-transparent"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-text-muted w-5 text-right tabular-nums">{i + 1}</span>
                              <div className="min-w-0">
                                <p className="text-sm text-text-primary truncate">{track.title}</p>
                                <p className="text-[11px] text-text-muted truncate">Track {track.track_number}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">No additional songs in this album.</p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.12em] text-text-muted mb-2">More By This Artist</h3>
                    {otherAlbums.length > 0 ? (
                      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {otherAlbums.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigate(`/album/${item.id}`)}
                            className="text-left w-24 shrink-0"
                          >
                            <div className="aspect-square rounded-lg overflow-hidden bg-bg-elevated shadow-[0_10px_24px_-16px_rgba(0,0,0,0.9)]">
                              {item.artwork_url ? (
                                <img
                                  src={item.artwork_url}
                                  alt={item.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  style={{ backgroundImage: gradientFromSeed(`${item.title}-${item.artist_name}`) }}
                                >
                                  <Disc3 size={20} className="text-white/70" />
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-text-primary truncate mt-1">{item.title}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">No other albums found.</p>
                    )}
                  </section>

                  {currentArtist && (
                    <section>
                      <h3 className="text-[11px] uppercase tracking-[0.12em] text-text-muted mb-2">About {currentArtist.name}</h3>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        {currentArtist.bio?.trim() || `Explore albums, tracks, and related artists for ${currentArtist.name}.`}
                      </p>
                    </section>
                  )}

                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.12em] text-text-muted mb-2">Related Artists</h3>
                    {relatedArtists.length > 0 ? (
                      <div className="space-y-1">
                        {relatedArtists.map((artist) => (
                          <button
                            key={artist.id}
                            type="button"
                            onClick={() => navigate(`/discovery?tab=artists&artist_id=${artist.id}`)}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/12 bg-transparent transition-colors flex items-center gap-2.5"
                          >
                            <div className="w-8 h-8 rounded-md bg-bg-elevated/75 overflow-hidden shrink-0 flex items-center justify-center">
                              {artist.image_url ? (
                                <img
                                  src={artist.image_url}
                                  alt={artist.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <UserRound size={14} className="text-text-muted" />
                              )}
                            </div>
                            <p className="text-sm text-text-primary truncate">{artist.name}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">No related artists available yet.</p>
                    )}
                  </section>
                </>
              )}

              {error && <p className="text-xs text-danger mt-2">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
