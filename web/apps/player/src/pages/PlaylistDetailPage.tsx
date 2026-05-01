import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { catalogApi, playlistsApi } from "@music/shared";
import type { Playlist, Track } from "@music/shared";
import {
  ArrowLeft,
  ListMusic,
  Loader2,
  Play,
  Shuffle,
} from "lucide-react";
import TrackRow, { type QuickActionAnchor } from "@/components/common/TrackRow";
import AddToPlaylistModal from "@/components/common/AddToPlaylistModal";
import TrackActionsModal from "@/components/common/TrackActionsModal";
import { formatDuration } from "@/lib/format";
import { useLibraryQuickAdd } from "@/hooks/useLibraryQuickAdd";
import { usePlayerStore } from "@/stores/player";

type ActionsState = {
  track: Track;
  anchor: QuickActionAnchor;
};

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playAlbum } = usePlayerStore();
  const { quickAddToLibrary, pendingTrackIds } = useLibraryQuickAdd();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionsState, setActionsState] = useState<ActionsState | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Playlist not found.");
      return;
    }

    let cancelled = false;

    const loadPlaylist = async () => {
      setLoading(true);
      setError("");

      try {
        const playlistData = await playlistsApi.getPlaylist(id);
        const orderedPlaylistTracks = [...(playlistData.tracks ?? [])].sort(
          (a, b) => a.position - b.position,
        );

        const uniqueTrackIds = [
          ...new Set(
            orderedPlaylistTracks
              .map((playlistTrack) => playlistTrack.track_id)
              .filter(Boolean),
          ),
        ];

        const fetchedTracks = await Promise.all(
          uniqueTrackIds.map(async (trackId) => {
            try {
              return [trackId, await catalogApi.getTrack(trackId)] as const;
            } catch {
              return null;
            }
          }),
        );

        const trackMap = new Map<string, Track>();
        for (const entry of fetchedTracks) {
          if (entry) {
            trackMap.set(entry[0], entry[1]);
          }
        }

        const orderedTracks = orderedPlaylistTracks
          .map((playlistTrack) => trackMap.get(playlistTrack.track_id))
          .filter((track): track is Track => Boolean(track));

        if (!cancelled) {
          setPlaylist(playlistData);
          setTracks(orderedTracks);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load playlist:", err);
          setError("Could not load this playlist.");
          setPlaylist(null);
          setTracks([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPlaylist();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const totalDuration = useMemo(
    () => tracks.reduce((sum, track) => sum + track.duration_secs, 0),
    [tracks],
  );

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playAlbum(tracks);
    }
  };

  const handleShuffle = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playAlbum(shuffled);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={30} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="space-y-4 py-10">
        <button
          type="button"
          onClick={() => navigate("/playlists")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Back to playlists
        </button>
        <p className="text-sm text-danger">{error || "Playlist not found."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate("/playlists")}
        className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        <ArrowLeft size={16} />
        Back to playlists
      </button>

      <section className="page-header pb-6 md:pb-8">
        <p className="text-xs uppercase tracking-wider text-text-secondary font-medium mb-2">
          Playlist
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-2">
          {playlist.name}
        </h1>
        <p className="text-sm text-text-secondary">
          {playlist.description?.trim() || "No description yet."}
        </p>
        <p className="text-sm text-text-secondary mt-2">
          {tracks.length} track{tracks.length === 1 ? "" : "s"} | {formatDuration(totalDuration)}
        </p>

        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Play size={16} fill="currentColor" />
            Play
          </button>
          <button
            type="button"
            onClick={handleShuffle}
            disabled={tracks.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:border-text-muted text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Shuffle size={16} />
            Shuffle
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      {tracks.length === 0 ? (
        <div className="list-shell p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-bg-elevated mb-3">
            <ListMusic size={20} className="text-text-muted" />
          </div>
          <p className="text-text-primary text-sm font-medium">No tracks in this playlist yet</p>
          <p className="text-text-secondary text-xs mt-1">
            Add songs from track actions to start listening.
          </p>
        </div>
      ) : (
        <div className="list-shell">
          <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
            <div className="w-8 text-center">#</div>
            <div className="flex-1">Title</div>
            <div className="hidden md:block w-[30%]">Album</div>
            <div className="w-12 text-right">Time</div>
          </div>

          {tracks.map((track, index) => (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              index={index + 1}
              showAlbum
              queue={tracks}
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
