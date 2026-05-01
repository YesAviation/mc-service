import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { catalogApi } from "@music/shared";
import type { Album, Track } from "@music/shared";
import TrackRow, { type QuickActionAnchor } from "@/components/common/TrackRow";
import AddToPlaylistModal from "@/components/common/AddToPlaylistModal";
import TrackActionsModal from "@/components/common/TrackActionsModal";
import { usePlayerStore } from "@/stores/player";
import { formatDuration } from "@/lib/format";
import { useLibraryQuickAdd } from "@/hooks/useLibraryQuickAdd";
import {
  Play,
  Shuffle,
  ArrowLeft,
  Disc3,
  Loader2,
} from "lucide-react";

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { playAlbum } = usePlayerStore();
  const { quickAddToLibrary, pendingTrackIds } = useLibraryQuickAdd();

  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionsState, setActionsState] = useState<{
    track: Track;
    anchor: QuickActionAnchor;
  } | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchAlbum = async () => {
      try {
        const [albumData, trackData] = await Promise.all([
          catalogApi.getAlbum(id),
          catalogApi.listTracks({ album_id: id, page: 1, page_size: 100 }),
        ]);
        setAlbum(albumData);
        // Sort tracks by disc number then track number
        const sorted = trackData.items.sort((a, b) => {
          if (a.disc_number !== b.disc_number)
            return a.disc_number - b.disc_number;
          return a.track_number - b.track_number;
        });
        setTracks(sorted);
      } catch (err) {
        console.error("Failed to fetch album:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlbum();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted text-lg">Album not found</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-accent hover:text-accent-hover text-sm"
        >
          Go back
        </button>
      </div>
    );
  }

  const totalDuration = tracks.reduce((sum, t) => sum + t.duration_secs, 0);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playAlbum(tracks);
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playAlbum(shuffled);
    }
  };

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Album header */}
      <div className="page-header pb-6 md:pb-8 flex gap-6">
        {/* Artwork */}
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-bg-elevated shrink-0">
          {album.artwork_url ? (
            <img
              src={album.artwork_url}
              alt={album.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-accent/30 via-accent/10 to-bg-elevated">
              <Disc3 size={64} className="text-text-muted opacity-40" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col justify-end min-w-0">
          <p className="text-xs uppercase tracking-wider text-text-secondary font-medium mb-1">
            Album
          </p>
          <h1 className="text-3xl font-bold text-text-primary mb-2 truncate">
            {album.title}
          </h1>
          <p className="text-sm text-text-secondary">
            {album.artist_name}
            {album.year ? ` \u00B7 ${album.year}` : ""}
            {" \u00B7 "}
            {tracks.length} track{tracks.length !== 1 ? "s" : ""}
            {" \u00B7 "}
            {formatDuration(totalDuration)}
          </p>

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              <Play size={16} fill="currentColor" />
              Play
            </button>
            <button
              onClick={handleShufflePlay}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:border-text-muted text-sm font-medium transition-colors"
            >
              <Shuffle size={16} />
              Shuffle
            </button>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="list-shell">
        <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-4 text-xs text-text-muted uppercase tracking-wider font-medium">
          <div className="w-8 text-center">#</div>
          <div className="flex-1">Title</div>
          <div className="w-12 text-right">Time</div>
        </div>
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            index={track.track_number}
            showAlbum={false}
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
