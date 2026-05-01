import { useEffect, useMemo, useState } from "react";
import { ApiError, catalogApi } from "@music/shared";
import type { Track } from "@music/shared";
import TrackRow, { type QuickActionAnchor } from "@/components/common/TrackRow";
import AddToPlaylistModal from "@/components/common/AddToPlaylistModal";
import TrackActionsModal from "@/components/common/TrackActionsModal";
import { Loader2, Music } from "lucide-react";
import { ensureUserFavoritesPlaylist } from "@/lib/library";
import { useLibraryQuickAdd } from "@/hooks/useLibraryQuickAdd";

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

type LibrarySortMode = "alphabetical" | "album" | "artist" | "recent";

const librarySortOptions: Array<{ id: LibrarySortMode; label: string }> = [
  { id: "alphabetical", label: "Alphabetical" },
  { id: "album", label: "By Album" },
  { id: "artist", label: "By Artist" },
  { id: "recent", label: "Recently Added" },
];

function trackTimestamp(track: Track): number {
  const parsed = Date.parse(track.created_at);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export default function LibraryPage() {
  const { quickAddToLibrary, pendingTrackIds } = useLibraryQuickAdd();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sortMode, setSortMode] = useState<LibrarySortMode>("alphabetical");
  const [actionsState, setActionsState] = useState<{
    track: Track;
    anchor: QuickActionAnchor;
  } | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  const loadLibrary = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const playlist = await ensureUserFavoritesPlaylist();

      if (playlist.tracks.length === 0) {
        setTracks([]);
        return;
      }

      const orderedTrackIds = [...playlist.tracks]
        .sort((a, b) => a.position - b.position)
        .map((item) => item.track_id);

      const resolvedTracks = await Promise.all(
        orderedTrackIds.map(async (trackId) => {
          try {
            return await catalogApi.getTrack(trackId);
          } catch {
            return null;
          }
        }),
      );

      setTracks(
        resolvedTracks.filter((track): track is Track => track !== null),
      );
    } catch (err) {
      if (isUnauthorizedError(err)) {
        return;
      }
      console.error("Failed to load user favorites:", err);
      setLoadError("Failed to load your favorites.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const sortedTracks = useMemo(() => {
    const items = [...tracks];

    const baseLocale = { sensitivity: "base" } as const;
    switch (sortMode) {
      case "album":
        return items.sort((a, b) => {
          const albumCmp = a.album_title.localeCompare(b.album_title, undefined, baseLocale);
          if (albumCmp !== 0) {
            return albumCmp;
          }

          const trackNumberCmp = a.track_number - b.track_number;
          if (trackNumberCmp !== 0) {
            return trackNumberCmp;
          }

          return a.title.localeCompare(b.title, undefined, baseLocale);
        });

      case "artist":
        return items.sort((a, b) => {
          const artistCmp = a.artist_name.localeCompare(b.artist_name, undefined, baseLocale);
          if (artistCmp !== 0) {
            return artistCmp;
          }
          return a.title.localeCompare(b.title, undefined, baseLocale);
        });

      case "recent":
        return items.sort((a, b) => trackTimestamp(b) - trackTimestamp(a));

      case "alphabetical":
      default:
        return items.sort((a, b) => a.title.localeCompare(b.title, undefined, baseLocale));
    }
  }, [tracks, sortMode]);

  return (
    <div className="space-y-6">
      <section className="page-header">
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-2">Library</h1>

        <div className="mt-4 flex items-center gap-2">
          <label htmlFor="library-sort" className="text-xs uppercase tracking-[0.12em] text-text-muted">
            Sort
          </label>
          <select
            id="library-sort"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as LibrarySortMode)}
            className="rounded-lg border border-border-default bg-bg-primary/75 px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {librarySortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="list-shell">
          <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
            <div className="w-8 text-center">#</div>
            <div className="flex-1">Title</div>
            <div className="hidden md:block w-[30%]">Album</div>
            <div className="w-12 text-right">Time</div>
          </div>

          {loadError && (
            <div className="px-4 py-3 text-sm text-danger border-b border-border-subtle">
              {loadError}
            </div>
          )}

          {sortedTracks.length > 0 ? (
            sortedTracks.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                index={i + 1}
                queue={sortedTracks}
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
            <div className="py-12 text-center text-text-muted flex flex-col items-center gap-2">
              <Music size={32} className="text-text-muted opacity-50" />
              Your library is empty.
              <span className="text-xs text-text-muted">
                Go to Discovery and add tracks you want to keep.
              </span>
            </div>
          )}
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
        onLibraryStateChange={(trackId, inLibrary) => {
          if (!inLibrary) {
            setTracks((prev) => prev.filter((track) => track.id !== trackId));
          }
        }}
      />
    </div>
  );
}
