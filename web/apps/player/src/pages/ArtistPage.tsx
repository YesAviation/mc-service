import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ApiError, catalogApi } from "@music/shared";
import type { Album, Artist, Track } from "@music/shared";
import TrackRow, { type QuickActionAnchor } from "@/components/common/TrackRow";
import AlbumCard from "@/components/common/AlbumCard";
import AddToPlaylistModal from "@/components/common/AddToPlaylistModal";
import TrackActionsModal from "@/components/common/TrackActionsModal";
import { usePlayerStore } from "@/stores/player";
import { gradientFromSeed } from "@/lib/artwork";
import { formatDuration } from "@/lib/format";
import { useLibraryQuickAdd } from "@/hooks/useLibraryQuickAdd";
import {
  ArrowLeft,
  Disc3,
  Loader2,
  Mic2,
  Play,
  Shuffle,
} from "lucide-react";

const TOP_TRACK_LIMIT = 5;
const ARTIST_TRACK_PAGE_SIZE = 200;

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function toTimestamp(value?: string): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function uniqueBy<T, K>(items: T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { play, playAlbum } = usePlayerStore();
  const { quickAddToLibrary, pendingTrackIds } = useLibraryQuickAdd();

  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionsState, setActionsState] = useState<{
    track: Track;
    anchor: QuickActionAnchor;
  } | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [artistData, albumsRes, tracksRes] = await Promise.all([
          catalogApi.getArtist(id),
          catalogApi.listAlbums({ artist_id: id, page: 1, page_size: 100 }),
          catalogApi.listTracks({ artist_id: id, page: 1, page_size: ARTIST_TRACK_PAGE_SIZE }),
        ]);

        if (cancelled) return;

        setArtist(artistData);
        setAlbums(albumsRes.items);
        setTracks(tracksRes.items);
      } catch (err) {
        if (isUnauthorizedError(err)) return;
        console.error("Failed to load artist:", err);
        if (!cancelled) setError("We couldn't load this artist.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const sortedAlbums = useMemo(
    () =>
      [...albums].sort((a, b) => {
        if (b.year !== a.year) return (b.year || 0) - (a.year || 0);
        return toTimestamp(b.created_at) - toTimestamp(a.created_at);
      }),
    [albums],
  );

  const topTracks = useMemo(() => {
    const ownAlbumIds = new Set(albums.map((a) => a.id));
    const owned = tracks.filter((t) => ownAlbumIds.has(t.album_id));

    return uniqueBy(owned, (t) => t.title.toLowerCase())
      .sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))
      .slice(0, TOP_TRACK_LIMIT);
  }, [albums, tracks]);

  const appearsOn = useMemo(() => {
    const ownAlbumIds = new Set(albums.map((a) => a.id));
    const externalTracks = tracks.filter((t) => !ownAlbumIds.has(t.album_id));
    if (externalTracks.length === 0) return [] as Album[];

    const synthetic = new Map<string, Album>();
    for (const track of externalTracks) {
      if (synthetic.has(track.album_id)) continue;
      synthetic.set(track.album_id, {
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
    return [...synthetic.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
  }, [albums, tracks]);

  const stats = useMemo(() => {
    const totalDurationSecs = tracks.reduce((sum, t) => sum + t.duration_secs, 0);
    return {
      albumCount: sortedAlbums.length,
      trackCount: tracks.length,
      totalDurationSecs,
    };
  }, [sortedAlbums, tracks]);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    const [first, ...rest] = tracks;
    play(first, [first, ...rest]);
  };

  const handleShuffleAll = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playAlbum(shuffled);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted text-lg">{error ?? "Artist not found"}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-accent hover:text-accent-hover text-sm"
        >
          Go back
        </button>
      </div>
    );
  }

  const fallbackGradient = gradientFromSeed(`${artist.name}-${artist.id}`);

  return (
    <div className="space-y-7">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <section className="page-header pb-6 md:pb-8 flex flex-col md:flex-row gap-6 md:items-end">
        <div className="w-48 h-48 rounded-full overflow-hidden bg-bg-elevated shrink-0 ring-1 ring-border-subtle shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
          {artist.image_url ? (
            <img
              src={artist.image_url}
              alt={artist.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundImage: fallbackGradient }}
            >
              <Mic2 size={64} className="text-white/70" />
            </div>
          )}
        </div>

        <div className="flex flex-col justify-end min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-text-secondary font-medium mb-1">
            Artist
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-2 truncate">
            {artist.name}
          </h1>
          <p className="text-sm text-text-secondary">
            {stats.albumCount} album{stats.albumCount === 1 ? "" : "s"}
            {" \u00B7 "}
            {stats.trackCount} track{stats.trackCount === 1 ? "" : "s"}
            {stats.totalDurationSecs > 0 && (
              <>
                {" \u00B7 "}
                {formatDuration(stats.totalDurationSecs)}
              </>
            )}
          </p>

          {artist.bio && (
            <p className="mt-3 text-sm text-text-secondary max-w-2xl line-clamp-3">
              {artist.bio}
            </p>
          )}

          <div className="flex gap-3 mt-5">
            <button
              onClick={handlePlayAll}
              disabled={tracks.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Play size={16} fill="currentColor" />
              Play
            </button>
            <button
              onClick={handleShuffleAll}
              disabled={tracks.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:border-text-muted disabled:opacity-50 text-sm font-medium transition-colors"
            >
              <Shuffle size={16} />
              Shuffle
            </button>
          </div>
        </div>
      </section>

      {topTracks.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Top Tracks</h2>
          <div className="list-shell">
            <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
              <div className="w-8 text-center">#</div>
              <div className="flex-1">Title</div>
              <div className="hidden md:block w-[30%]">Album</div>
              <div className="w-12 text-right">Time</div>
            </div>
            {topTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index + 1}
                queue={topTracks}
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
        </section>
      )}

      {sortedAlbums.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {sortedAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      {appearsOn.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Appears On</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {appearsOn.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      {topTracks.length === 0 && sortedAlbums.length === 0 && appearsOn.length === 0 && (
        <div className="list-shell px-4 py-8 text-center text-text-secondary flex flex-col items-center gap-2">
          <Disc3 size={32} className="text-text-muted opacity-50" />
          No tracks, albums, or features found for this artist yet.
        </div>
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
