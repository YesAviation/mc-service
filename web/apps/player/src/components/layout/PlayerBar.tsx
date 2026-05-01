import { useEffect, useRef, useCallback, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Music,
  Plus,
  MoreVertical,
} from "lucide-react";
import Hls from "hls.js";
import clsx from "clsx";
import { ApiError, streamApi } from "@music/shared";
import { usePlayerStore } from "@/stores/player";
import { formatTime } from "@/lib/format";
import AddToPlaylistModal from "@/components/common/AddToPlaylistModal";
import TrackActionsModal from "@/components/common/TrackActionsModal";
import { useLibraryQuickAdd } from "@/hooks/useLibraryQuickAdd";

type TrackActionAnchor = {
  x: number;
  y: number;
};

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export default function PlayerBar() {
  const { quickAddToLibrary, pendingTrackIds } = useLibraryQuickAdd();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const seekingRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const [actionsAnchor, setActionsAnchor] = useState<TrackActionAnchor | null>(null);
  const [playlistModalTrackId, setPlaylistModalTrackId] = useState<string | null>(null);

  const {
    currentTrack,
    isPlaying,
    volume,
    currentTime,
    duration,
    shuffle,
    repeat,
    togglePlay,
    next,
    previous,
    setVolume,
    seek,
    setCurrentTime,
    setDuration,
    toggleShuffle,
    toggleRepeat,
  } = usePlayerStore();

  // Create audio element once
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }

    const audio = audioRef.current;

    const onTimeUpdate = () => {
      if (!seekingRef.current) {
        setCurrentTime(audio.currentTime);
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      const playerState = usePlayerStore.getState();

      if (playerState.repeat === "one") {
        audio.currentTime = 0;
        playerState.setCurrentTime(0);
        if (playerState.isPlaying) {
          audio.play().catch(() => {});
        }
        return;
      }

      playerState.next();
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load track via HLS
  useEffect(() => {
    if (!currentTrack || !audioRef.current) return;

    const audio = audioRef.current;
    const requestId = ++loadRequestIdRef.current;

    // Immediately cut off the currently playing audio while the next track loads.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setCurrentTime(0);
    setDuration(0);

    const loadTrack = async () => {
      try {
        const { manifest_url } = await streamApi.getStreamUrl(currentTrack.id);

        // Ignore stale responses when the user skips tracks quickly.
        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });
          hlsRef.current = hls;
          hls.loadSource(manifest_url);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (requestId !== loadRequestIdRef.current) {
              return;
            }
            audio.play().catch(() => {});
          });
        } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
          if (requestId !== loadRequestIdRef.current) {
            return;
          }
          // Native HLS support (Safari)
          audio.src = manifest_url;
          audio.play().catch(() => {});
        }
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }
        if (isUnauthorizedError(err)) {
          return;
        }
        console.error("Failed to load stream:", err);
      }
    };

    loadTrack();
  }, [currentTrack, setCurrentTime, setDuration]);

  // Play / pause
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Seek handling
  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      seek(time);
      if (audioRef.current) {
        audioRef.current.currentTime = time;
      }
      seekingRef.current = false;
    },
    [seek],
  );

  const handleSeekStart = useCallback(() => {
    seekingRef.current = true;
  }, []);

  const progressPercent =
    duration > 0 ? (currentTime / duration) * 100 : 0;

  const prevVolume = useRef(volume);
  const toggleMute = useCallback(() => {
    if (volume > 0) {
      prevVolume.current = volume;
      setVolume(0);
    } else {
      setVolume(prevVolume.current || 0.8);
    }
  }, [volume, setVolume]);

  const handleOpenTrackActions = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!currentTrack) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setActionsAnchor({
      x: rect.right,
      y: rect.bottom,
    });
  }, [currentTrack]);

  return (
    <>
      <div className="app-player-dock z-40">
        <div className="app-player-inner flex items-center gap-3 sm:gap-4 px-3 sm:px-4">
            {/* Left: Track info */}
            <div className="flex items-center gap-3 w-[56%] sm:w-[32%] min-w-0">
              {currentTrack ? (
                <>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-md bg-bg-elevated flex items-center justify-center shrink-0 overflow-hidden">
                    {currentTrack.artwork_url ? (
                      <img
                        src={currentTrack.artwork_url}
                        alt={currentTrack.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music size={20} className="text-text-muted" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {currentTrack.title}
                    </p>
                    <p className="text-[11px] sm:text-xs text-text-secondary truncate">
                      {currentTrack.artist_name}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-sm bg-bg-elevated flex items-center justify-center">
                    <Music size={20} className="text-text-muted" />
                  </div>
                  <div>
                    <p className="text-sm text-text-muted">No track selected</p>
                  </div>
                </div>
              )}
            </div>

            {/* Center: Controls + progress */}
            <div className="flex-1 flex flex-col items-center gap-1 max-w-[44%] sm:max-w-[40%]">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={toggleShuffle}
                  className={clsx(
                    "hidden md:inline-flex p-1.5 rounded-md transition-colors",
                    shuffle
                      ? "text-accent"
                      : "text-text-muted hover:text-text-primary",
                  )}
                  title="Shuffle"
                >
                  <Shuffle size={16} />
                </button>

                <button
                  onClick={previous}
                  className="p-1.5 rounded-md text-text-secondary hover:text-text-primary"
                  title="Previous"
                >
                  <SkipBack size={18} fill="currentColor" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-text-primary flex items-center justify-center hover:scale-105 transition-transform text-bg-primary"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={18} fill="currentColor" className="ml-0.5" />
                  )}
                </button>

                <button
                  onClick={next}
                  className="p-1.5 rounded-md text-text-secondary hover:text-text-primary"
                  title="Next"
                >
                  <SkipForward size={18} fill="currentColor" />
                </button>

                <button
                  onClick={toggleRepeat}
                  className={clsx(
                    "hidden md:inline-flex p-1.5 rounded-md transition-colors",
                    repeat !== "off"
                      ? "text-accent"
                      : "text-text-muted hover:text-text-primary",
                  )}
                  title={`Repeat: ${repeat}`}
                >
                  {repeat === "one" ? (
                    <Repeat1 size={16} />
                  ) : (
                    <Repeat size={16} />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 w-full">
                <span className="hidden sm:block text-[11px] text-text-muted tabular-nums w-10 text-right">
                  {formatTime(currentTime)}
                </span>
                <div className="relative flex-1 group">
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-text-primary group-hover:bg-accent rounded-full transition-colors"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    onMouseDown={handleSeekStart}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <span className="hidden sm:block text-[11px] text-text-muted tabular-nums w-10">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Right: Volume + Queue */}
            <div className="hidden sm:flex items-center justify-end gap-2 w-[28%]">
              <button
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary"
                title="Queue"
              >
                <ListMusic size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!currentTrack) {
                    return;
                  }
                  void quickAddToLibrary(currentTrack);
                }}
                disabled={!currentTrack || pendingTrackIds.has(currentTrack.id)}
                className="w-7 h-7 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:bg-white/5 inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Add to Library"
                aria-label="Add to Library"
              >
                <Plus size={14} />
              </button>

              <button
                type="button"
                onClick={handleOpenTrackActions}
                disabled={!currentTrack}
                className="w-7 h-7 rounded-full border border-border-default text-text-secondary hover:text-text-primary hover:bg-white/5 inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Track actions"
                aria-label="Track actions"
              >
                <MoreVertical size={14} />
              </button>

              <button
                onClick={toggleMute}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary"
                title={volume === 0 ? "Unmute" : "Mute"}
              >
                {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>

              <div className="relative w-24 group">
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-text-secondary group-hover:bg-accent rounded-full transition-colors"
                    style={{ width: `${volume * 100}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>
        </div>
      </div>

      <AddToPlaylistModal
        trackId={playlistModalTrackId ?? ""}
        isOpen={playlistModalTrackId !== null}
        onClose={() => setPlaylistModalTrackId(null)}
      />

      <TrackActionsModal
        track={currentTrack}
        anchor={actionsAnchor}
        isOpen={Boolean(currentTrack && actionsAnchor)}
        onClose={() => setActionsAnchor(null)}
        onOpenPlaylistPicker={(track) => {
          setPlaylistModalTrackId(track.id);
        }}
      />
    </>
  );
}
