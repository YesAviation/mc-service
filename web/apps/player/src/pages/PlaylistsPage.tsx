import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { playlistsApi } from "@music/shared";
import type { Playlist } from "@music/shared";
import { ListMusic, Loader2, Plus, X } from "lucide-react";
import {
  ensureUserFavoritesPlaylist,
  USER_FAVORITES_PLAYLIST_NAME,
} from "@/lib/library";

function isFavoritesPlaylist(playlist: Playlist): boolean {
  return (
    playlist.name.trim().toLowerCase() ===
    USER_FAVORITES_PLAYLIST_NAME.toLowerCase()
  );
}

function isLegacyLibraryPlaylist(playlist: Playlist): boolean {
  return playlist.name.trim().toLowerCase() === "my library";
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createSlotOpen, setCreateSlotOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [error, setError] = useState("");

  const visiblePlaylists = useMemo(
    () =>
      [...playlists].sort((a, b) =>
        isFavoritesPlaylist(a) === isFavoritesPlaylist(b)
          ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          : isFavoritesPlaylist(a)
            ? -1
            : 1,
      )
      .filter((playlist) => !isLegacyLibraryPlaylist(playlist)),
    [playlists],
  );

  const loadPlaylists = async () => {
    setLoading(true);
    setError("");

    try {
      await ensureUserFavoritesPlaylist();
      const response = await playlistsApi.listPlaylists({ page: 1, page_size: 200 });
      setPlaylists(response.playlists ?? []);
    } catch (err) {
      console.error("Failed to load playlists:", err);
      setError("Could not load playlists.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) {
      return;
    }

    setCreating(true);
    setError("");

    try {
      const playlist = await playlistsApi.createPlaylist({
        name,
        description: newPlaylistDescription.trim(),
        is_public: false,
      });

      setPlaylists((prev) => [playlist, ...prev]);
      setNewPlaylistName("");
      setNewPlaylistDescription("");
      setCreateSlotOpen(false);
    } catch (err) {
      console.error("Failed to create playlist:", err);
      setError("Could not create playlist.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="page-header">
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-2">
          Playlists
        </h1>
      </section>

      <section className="space-y-4">
        <div className="mb-2">
          <h2 className="text-base font-semibold text-text-primary">Your Collections</h2>
        </div>

        {error && !createSlotOpen && <p className="text-sm text-danger">{error}</p>}

        {loading ? (
          <div className="h-56 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {visiblePlaylists.map((playlist) => (
              <Link
                key={playlist.id}
                to={`/playlists/${playlist.id}`}
                className="aspect-square rounded-xl border border-border-subtle bg-black/10 p-4 hover:bg-bg-elevated/75 transition-colors flex flex-col"
              >
                <p className="text-sm font-semibold text-text-primary line-clamp-2 min-h-10">{playlist.name}</p>
                <p className="text-xs text-text-secondary mt-1 line-clamp-4 min-h-18">
                  {playlist.description?.trim() || "No description yet."}
                </p>
                <div className="flex items-center gap-1.5 mt-auto pt-3 text-xs text-text-muted">
                  <ListMusic size={13} />
                  {playlist.tracks.length} track{playlist.tracks.length === 1 ? "" : "s"}
                </div>
              </Link>
            ))}

            <article className="aspect-square rounded-xl border border-dashed border-border-default bg-black/5 p-4 flex">
              {createSlotOpen ? (
                <div className="space-y-3 w-full overflow-y-auto pr-1">
                  <p className="text-sm font-semibold text-text-primary">Create Playlist</p>
                  <input
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Playlist name"
                    className="w-full rounded-lg border border-border-default bg-bg-primary/75 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                    autoFocus
                  />
                  <input
                    value={newPlaylistDescription}
                    onChange={(e) => setNewPlaylistDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full rounded-lg border border-border-default bg-bg-primary/75 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCreatePlaylist}
                      disabled={creating || !newPlaylistName.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-white text-sm font-semibold px-3 py-2 disabled:opacity-50"
                    >
                      {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateSlotOpen(false);
                        setNewPlaylistName("");
                        setNewPlaylistDescription("");
                        setError("");
                      }}
                      disabled={creating}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-default text-text-secondary hover:text-text-primary px-3 py-2 text-sm"
                    >
                      <X size={14} />
                      Cancel
                    </button>
                  </div>
                  {error && <p className="text-sm text-danger">{error}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setCreateSlotOpen(true);
                  }}
                  className="w-full h-full flex flex-col items-center justify-center gap-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
                >
                  <span className="w-11 h-11 rounded-full border border-border-default flex items-center justify-center">
                    <Plus size={20} />
                  </span>
                  <span className="text-sm font-medium">Create Playlist</span>
                </button>
              )}
            </article>
          </div>
        )}
      </section>
    </div>
  );
}
