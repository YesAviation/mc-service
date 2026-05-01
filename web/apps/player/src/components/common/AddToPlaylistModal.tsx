import { useEffect, useMemo, useState } from "react";
import { ApiError, playlistsApi } from "@music/shared";
import type { Playlist } from "@music/shared";
import { Loader2, Plus, X } from "lucide-react";
import clsx from "clsx";

type AddToPlaylistModalProps = {
  trackId: string;
  isOpen: boolean;
  onClose: () => void;
};

function isConflictError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

export default function AddToPlaylistModal({
  trackId,
  isOpen,
  onClose,
}: AddToPlaylistModalProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [savingPlaylistId, setSavingPlaylistId] = useState<string | null>(null);
  const [savedPlaylistIds, setSavedPlaylistIds] = useState<Set<string>>(new Set());

  const playlistsSorted = useMemo(
    () =>
      [...playlists].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )
      .filter((playlist) => playlist.name.trim().toLowerCase() !== "my library"),
    [playlists],
  );

  useEffect(() => {
    if (!isOpen || !trackId) {
      return;
    }

    let cancelled = false;

    const loadPlaylists = async () => {
      setLoading(true);
      setError("");
      setSavedPlaylistIds(new Set());

      try {
        const { playlists: fetched } = await playlistsApi.listPlaylists({
          page: 1,
          page_size: 200,
        });
        if (!cancelled) {
          setPlaylists(fetched);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load playlists:", err);
          setError("Could not load playlists.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPlaylists();

    return () => {
      cancelled = true;
    };
  }, [isOpen, trackId]);

  if (!isOpen) {
    return null;
  }

  const handleCreatePlaylist = async () => {
    const trimmedName = newPlaylistName.trim();
    if (!trimmedName) {
      return;
    }

    setCreating(true);
    setError("");
    try {
      const created = await playlistsApi.createPlaylist({
        name: trimmedName,
        description: newPlaylistDescription.trim(),
        is_public: false,
      });
      setPlaylists((prev) => [created, ...prev]);
      setNewPlaylistName("");
      setNewPlaylistDescription("");
    } catch (err) {
      console.error("Failed to create playlist:", err);
      setError("Could not create playlist.");
    } finally {
      setCreating(false);
    }
  };

  const handleAddToPlaylist = async (playlist: Playlist) => {
    if (!trackId) {
      return;
    }

    if (savedPlaylistIds.has(playlist.id)) {
      return;
    }

    setSavingPlaylistId(playlist.id);
    setError("");

    try {
      await playlistsApi.addTrack(playlist.id, trackId);
      setSavedPlaylistIds((prev) => {
        const next = new Set(prev);
        next.add(playlist.id);
        return next;
      });
    } catch (err) {
      if (isConflictError(err)) {
        setSavedPlaylistIds((prev) => {
          const next = new Set(prev);
          next.add(playlist.id);
          return next;
        });
        return;
      }

      console.error("Failed to add track to playlist:", err);
      setError("Could not add to playlist.");
    } finally {
      setSavingPlaylistId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close add to playlist modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />

      <div className="relative w-full max-w-xl rounded-xl border border-border-default bg-bg-surface shadow-[0_18px_36px_-24px_rgba(0,0,0,0.7)] p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg md:text-xl font-semibold text-text-primary">
              Add To Playlist
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              Save this track to one of your playlists.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-bg-elevated/55 p-3 mb-4">
          <div className="grid gap-2">
            <input
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="New playlist name"
              className="w-full rounded-xl border border-border-default bg-bg-primary/80 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex gap-2">
              <input
                value={newPlaylistDescription}
                onChange={(e) => setNewPlaylistDescription(e.target.value)}
                placeholder="Description (optional)"
                className="flex-1 rounded-xl border border-border-default bg-bg-primary/80 px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="button"
                onClick={handleCreatePlaylist}
                disabled={creating || !newPlaylistName.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plus size={15} />
                )}
                Create
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-bg-elevated/45 max-h-72 overflow-auto">
          {loading ? (
            <div className="h-44 flex items-center justify-center">
              <Loader2 size={22} className="animate-spin text-text-muted" />
            </div>
          ) : playlistsSorted.length > 0 ? (
            <ul className="divide-y divide-border-subtle/80">
              {playlistsSorted.map((playlist) => {
                const isSaved = savedPlaylistIds.has(playlist.id);
                const isSaving = savingPlaylistId === playlist.id;

                return (
                  <li key={playlist.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {playlist.name}
                      </p>
                      <p className="text-xs text-text-secondary truncate">
                        {playlist.tracks.length} track{playlist.tracks.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving || isSaved}
                      onClick={() => handleAddToPlaylist(playlist)}
                      className={clsx(
                        "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
                        isSaved
                          ? "text-success border-success/40 bg-success/10"
                          : "text-accent border-accent/40 hover:bg-accent/10",
                      )}
                    >
                      {isSaving ? "Adding..." : isSaved ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-text-muted">
              No playlists yet. Create your first one above.
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger mt-3">{error}</p>}
      </div>
    </div>
  );
}
