import { useEffect, useState } from "react";
import { ApiError, playlistsApi } from "@music/shared";
import type { Playlist, Track } from "@music/shared";
import { useNavigate } from "react-router-dom";
import { Disc3, FolderPlus, LibraryBig, ListMusic, Play, UserRound } from "lucide-react";
import { ensureUserFavoritesPlaylist, playlistContainsTrack } from "@/lib/library";
import { usePlayerStore } from "@/stores/player";

type TrackActionAnchor = {
  x: number;
  y: number;
};

type TrackActionsModalProps = {
  track: Track | null;
  anchor: TrackActionAnchor | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenPlaylistPicker?: (track: Track) => void;
  onLibraryStateChange?: (trackId: string, inLibrary: boolean) => void;
};

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export default function TrackActionsModal({
  track,
  anchor,
  isOpen,
  onClose,
  onOpenPlaylistPicker,
  onLibraryStateChange,
}: TrackActionsModalProps) {
  const navigate = useNavigate();
  const { play, addToQueue } = usePlayerStore();
  const [favoritesPlaylist, setFavoritesPlaylist] = useState<Playlist | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !track) {
      return;
    }

    let cancelled = false;

    const loadFavoritesPlaylist = async () => {
      setLoadingLibrary(true);
      setError("");

      try {
        const playlist = await ensureUserFavoritesPlaylist();
        if (!cancelled) {
          setFavoritesPlaylist(playlist);
        }
      } catch (err) {
        if (isUnauthorizedError(err)) {
          return;
        }
        if (!cancelled) {
          console.error("Failed to load favorites playlist:", err);
          setError("Could not load your library state.");
        }
      } finally {
        if (!cancelled) {
          setLoadingLibrary(false);
        }
      }
    };

    loadFavoritesPlaylist();

    return () => {
      cancelled = true;
    };
  }, [isOpen, track]);

  if (!isOpen || !track) {
    return null;
  }

  const panelWidth = 248;
  const panelHeight = 312;
  const edgeGap = 12;

  let left = 16;
  let top = 16;

  if (typeof window !== "undefined") {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const anchorX = anchor?.x ?? viewportWidth / 2;
    const anchorY = anchor?.y ?? viewportHeight / 2;

    left = Math.max(
      edgeGap,
      Math.min(anchorX - panelWidth, viewportWidth - panelWidth - edgeGap),
    );

    const preferredTop = anchorY + 6;
    const aboveTop = anchorY - panelHeight - 6;
    top = preferredTop + panelHeight <= viewportHeight - edgeGap
      ? preferredTop
      : Math.max(edgeGap, aboveTop);
  }

  const isInLibrary = playlistContainsTrack(favoritesPlaylist, track.id);

  const closeAndNavigate = (to: string) => {
    onClose();
    navigate(to);
  };

  const handleToggleLibrary = async () => {
    if (!track.id || savingLibrary) {
      return;
    }

    setSavingLibrary(true);
    setError("");

    try {
      const playlist = favoritesPlaylist ?? (await ensureUserFavoritesPlaylist());
      const updated = isInLibrary
        ? await playlistsApi.removeTrack(playlist.id, track.id)
        : await playlistsApi.addTrack(playlist.id, track.id);

      setFavoritesPlaylist(updated);
      onLibraryStateChange?.(track.id, !isInLibrary);
      onClose();
    } catch (err) {
      if (isConflictError(err)) {
        onLibraryStateChange?.(track.id, true);
        return;
      }
      if (isUnauthorizedError(err)) {
        return;
      }
      console.error("Failed to update library state:", err);
      setError("Could not update library.");
    } finally {
      setSavingLibrary(false);
    }
  };

  const handlePlayNow = () => {
    play(track, [track]);
    onClose();
  };

  const handleQueueTrack = () => {
    addToQueue(track);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close track actions"
        onClick={onClose}
        className="absolute inset-0 bg-transparent"
      />

      <div
        className="absolute w-[248px] rounded-xl border border-border-default bg-bg-surface p-2 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.8)]"
        style={{ left, top }}
      >
        <div className="px-2 pb-2 border-b border-border-subtle">
          <p className="text-[11px] uppercase tracking-[0.1em] text-text-muted">Track Actions</p>
          <p className="text-sm font-medium text-text-primary truncate mt-1">{track.title}</p>
          <p className="text-xs text-text-secondary truncate">{track.artist_name}</p>
        </div>

        <div className="mt-2 space-y-1">
          <button
            type="button"
            onClick={handlePlayNow}
            className="w-full rounded-lg px-2.5 py-2 text-sm text-text-primary hover:bg-white/8 text-left inline-flex items-center gap-2"
          >
            <Play size={14} />
            Play Now
          </button>

          <button
            type="button"
            onClick={handleQueueTrack}
            className="w-full rounded-lg px-2.5 py-2 text-sm text-text-primary hover:bg-white/8 text-left inline-flex items-center gap-2"
          >
            <ListMusic size={14} />
            Add to Queue
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenPlaylistPicker?.(track);
              onClose();
            }}
            className="w-full rounded-lg px-2.5 py-2 text-sm text-text-primary hover:bg-white/8 text-left inline-flex items-center gap-2"
          >
            <FolderPlus size={14} />
            Add to Playlist
          </button>

          <button
            type="button"
            onClick={handleToggleLibrary}
            disabled={loadingLibrary || savingLibrary}
            className="w-full rounded-lg px-2.5 py-2 text-sm text-text-primary hover:bg-white/8 text-left inline-flex items-center gap-2 disabled:opacity-60"
          >
            <LibraryBig size={14} />
            {loadingLibrary
              ? "Checking Favorites..."
              : isInLibrary
                ? "Remove from Favorites"
                : "Save to Favorites"}
          </button>

          <button
            type="button"
            onClick={() => closeAndNavigate(`/discovery?tab=artists&artist_id=${track.artist_id}`)}
            disabled={!track.artist_id}
            className="w-full rounded-lg px-2.5 py-2 text-sm text-text-primary hover:bg-white/8 text-left inline-flex items-center gap-2 disabled:opacity-60"
          >
            <UserRound size={14} />
            View Artist
          </button>

          <button
            type="button"
            onClick={() => closeAndNavigate(`/album/${track.album_id}`)}
            disabled={!track.album_id}
            className="w-full rounded-lg px-2.5 py-2 text-sm text-text-primary hover:bg-white/8 text-left inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Disc3 size={14} />
            View Album
          </button>
        </div>

        {error && <p className="text-xs text-danger mt-2 px-2">{error}</p>}
      </div>
    </div>
  );
}
