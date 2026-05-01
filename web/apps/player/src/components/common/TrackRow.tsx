import { Play, Pause, Plus, MoreVertical } from "lucide-react";
import clsx from "clsx";
import type { Track } from "@music/shared";
import { usePlayerStore } from "@/stores/player";
import { formatDuration } from "@/lib/format";

export type QuickActionAnchor = {
  x: number;
  y: number;
};

interface TrackRowProps {
  track: Track;
  index?: number;
  showAlbum?: boolean;
  /** Full queue context for continuous playback */
  queue?: Track[];
  quickAddPending?: boolean;
  onQuickAddClick?: (track: Track) => void;
  quickActionDisabled?: boolean;
  onQuickActionClick?: (track: Track, anchor: QuickActionAnchor) => void;
}

export default function TrackRow({
  track,
  index,
  showAlbum = true,
  queue,
  quickAddPending = false,
  onQuickAddClick,
  quickActionDisabled = false,
  onQuickActionClick,
}: TrackRowProps) {
  const { currentTrack, isPlaying, play, pause, resume } = usePlayerStore();

  const isActive = currentTrack?.id === track.id;
  const isCurrentlyPlaying = isActive && isPlaying;

  const handleClick = () => {
    if (isActive) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      play(track, queue);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={clsx(
        "track-row group w-full flex items-center gap-4 rounded-xl transition-colors text-left cursor-pointer",
        isActive
          ? "bg-accent/12"
          : "hover:bg-bg-surface-hover/80",
      )}
    >
      {/* Track number / play icon */}
      <div className="w-8 text-center shrink-0">
        <span
          className={clsx(
            "text-sm tabular-nums group-hover:hidden",
            isActive ? "text-accent" : "text-text-muted",
          )}
        >
          {isActive && isPlaying ? (
            <span className="inline-flex gap-0.5 items-end h-3.5">
              <span className="w-0.5 bg-accent animate-pulse" style={{ height: "60%" }} />
              <span className="w-0.5 bg-accent animate-pulse" style={{ height: "100%", animationDelay: "0.15s" }} />
              <span className="w-0.5 bg-accent animate-pulse" style={{ height: "40%", animationDelay: "0.3s" }} />
            </span>
          ) : (
            index ?? track.track_number
          )}
        </span>
        <span className="hidden group-hover:inline text-text-primary">
          {isCurrentlyPlaying ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" className="ml-0.5" />
          )}
        </span>
      </div>

      {/* Title + Artist */}
      <div className="flex-1 min-w-0">
        <p
          className={clsx(
            "text-sm font-medium truncate",
            isActive ? "text-accent" : "text-text-primary",
          )}
        >
          {track.title}
        </p>
        <p className="text-xs text-text-secondary truncate">
          {track.artist_name}
        </p>
      </div>

      {/* Album */}
      {showAlbum && (
        <p className="hidden md:block text-sm text-text-secondary truncate w-[30%]">
          {track.album_title}
        </p>
      )}

      {/* Duration */}
      <span className="text-sm text-text-muted tabular-nums w-12 text-right shrink-0">
        {formatDuration(track.duration_secs)}
      </span>

      {(onQuickAddClick || onQuickActionClick) && (
        <div className="ml-2 shrink-0 flex items-center gap-1">
          {onQuickAddClick && (
            <button
              type="button"
              disabled={quickAddPending}
              onClick={(event) => {
                event.stopPropagation();
                onQuickAddClick(track);
              }}
              className="w-7 h-7 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:bg-white/5 inline-flex items-center justify-center transition-colors disabled:opacity-50"
              title="Add to Library"
              aria-label="Add to Library"
            >
              <Plus size={14} />
            </button>
          )}

          {onQuickActionClick && (
            <button
              type="button"
              disabled={quickActionDisabled}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                onQuickActionClick(track, {
                  x: rect.right,
                  y: rect.bottom,
                });
              }}
              className="w-7 h-7 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:bg-white/5 inline-flex items-center justify-center transition-colors disabled:opacity-50"
              title="Track actions"
              aria-label="Track actions"
            >
              <MoreVertical size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
