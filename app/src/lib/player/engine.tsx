import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { streamApi } from '@/lib/api';
import { useServerStore } from '@/lib/servers/store';
import { ensureAbsoluteUrl } from '@/lib/format';
import { usePlayerStore, type EnrichedTrack } from './store';

let player: AudioPlayer | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let loadToken = 0;
let lastErrorAlertAt = 0;

async function ensureMode() {
  try {
    // `doNotMix` is required when using setActiveForLockScreen so the system
    // hands us full transport control rather than ducking under other audio.
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  } catch (err) {
    console.warn('[player] setAudioModeAsync failed', err);
  }
}

function buildMetadata(track: EnrichedTrack) {
  const baseUrl = useServerStore.getState().active()?.baseUrl;
  return {
    title: track.title,
    artist: track.artist?.name ?? 'Unknown Artist',
    albumTitle: track.album?.title ?? '',
    artworkUrl: ensureAbsoluteUrl(baseUrl, track.album?.artwork_url ?? null) ?? undefined,
  };
}

function applyLockScreen(p: AudioPlayer, track: EnrichedTrack, makeActive: boolean) {
  try {
    const meta = buildMetadata(track);
    const anyPlayer = p as unknown as {
      setActiveForLockScreen?: (active: boolean, metadata?: unknown, options?: unknown) => void;
      updateLockScreenMetadata?: (metadata: unknown) => void;
    };
    if (makeActive && anyPlayer.setActiveForLockScreen) {
      anyPlayer.setActiveForLockScreen(true, meta, {
        showSeekForward: true,
        showSeekBackward: true,
      });
    } else if (anyPlayer.updateLockScreenMetadata) {
      anyPlayer.updateLockScreenMetadata(meta);
    }
  } catch (err) {
    console.warn('[player] lock screen wiring failed', err);
  }
}

function clearLockScreen(p: AudioPlayer) {
  try {
    const anyPlayer = p as unknown as { clearLockScreenControls?: () => void };
    anyPlayer.clearLockScreenControls?.();
  } catch {
    // ignore
  }
}

function disposePlayer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  if (player) {
    try {
      clearLockScreen(player);
      player.pause();
      player.remove();
    } catch {
      // ignore
    }
    player = null;
  }
}

function startProgressLoop() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!player) return;
    const pos = (player.currentTime ?? 0) * 1000;
    const dur = (player.duration ?? 0) * 1000;
    usePlayerStore.getState().setProgress(pos, dur);

    if (dur > 0 && pos >= dur - 250 && player.playing) {
      playerEngine.next();
    }
  }, 500);
}

function showStreamError(message: string) {
  const now = Date.now();
  if (now - lastErrorAlertAt < 4000) return;
  lastErrorAlertAt = now;
  Alert.alert('Playback failed', message);
}

async function loadTrack(track: EnrichedTrack, autoPlay: boolean) {
  await ensureMode();
  const myToken = ++loadToken;
  usePlayerStore.getState().setIsBuffering(true);

  try {
    const { manifest_url } = await streamApi.getUrl(track.id);
    if (myToken !== loadToken) return;

    const baseUrl = useServerStore.getState().active()?.baseUrl;
    let resolved = ensureAbsoluteUrl(baseUrl, manifest_url) ?? manifest_url;

    if (baseUrl) {
      try {
        const m = new URL(resolved);
        const b = new URL(baseUrl);
        const isLoopback =
          m.hostname === 'localhost' ||
          m.hostname === '127.0.0.1' ||
          m.hostname === '0.0.0.0' ||
          m.hostname === '::1';
        if (isLoopback && m.hostname !== b.hostname) {
          m.protocol = b.protocol;
          m.hostname = b.hostname;
          resolved = m.toString();
        }
      } catch {
        // leave resolved as-is
      }
    }

    console.log('[player] loading', resolved);

    disposePlayer();
    player = createAudioPlayer({ uri: resolved });
    try {
      player.volume = usePlayerStore.getState().volume;
    } catch {
      // ignore
    }
    applyLockScreen(player, track, true);

    try {
      const anyPlayer = player as unknown as {
        addListener?: (event: string, cb: (data: unknown) => void) => unknown;
      };
      anyPlayer.addListener?.('playbackStatusUpdate', (status: unknown) => {
        const s = status as { error?: { message?: string } | string | null } | null;
        const errMsg =
          typeof s?.error === 'string' ? s.error : s?.error?.message ?? null;
        if (errMsg) {
          console.warn('[player] playback error', errMsg);
          showStreamError(errMsg);
          usePlayerStore.getState().setIsPlaying(false);
        }
      });
    } catch {
      // listener not supported on this version
    }

    startProgressLoop();
    if (autoPlay) {
      player.play();
      usePlayerStore.getState().setIsPlaying(true);
    } else {
      usePlayerStore.getState().setIsPlaying(false);
    }
  } catch (err) {
    console.warn('[player] failed to load track', err);
    usePlayerStore.getState().setIsPlaying(false);
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'Could not start the stream.';
    showStreamError(msg);
  } finally {
    if (myToken === loadToken) {
      usePlayerStore.getState().setIsBuffering(false);
    }
  }
}

export const playerEngine = {
  async playTracks(tracks: EnrichedTrack[], startAt = 0) {
    usePlayerStore.getState().setQueue(tracks, startAt);
    const t = tracks[startAt];
    if (t) await loadTrack(t, true);
  },
  async play() {
    if (!player) {
      const cur = usePlayerStore.getState().current();
      if (cur) await loadTrack(cur, true);
      return;
    }
    player.play();
    usePlayerStore.getState().setIsPlaying(true);
  },
  pause() {
    if (player) {
      player.pause();
      usePlayerStore.getState().setIsPlaying(false);
    }
  },
  toggle() {
    const playing = usePlayerStore.getState().isPlaying;
    if (playing) this.pause();
    else this.play();
  },
  async next() {
    const { queue, index, repeat, shuffle } = usePlayerStore.getState();
    if (!queue.length) return;
    let nextIndex: number;
    if (repeat === 'one') {
      nextIndex = index;
    } else if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (index >= queue.length - 1) {
      if (repeat === 'all') nextIndex = 0;
      else {
        this.pause();
        return;
      }
    } else {
      nextIndex = index + 1;
    }
    usePlayerStore.getState().setIndex(nextIndex);
    const t = queue[nextIndex];
    if (t) await loadTrack(t, true);
  },
  async previous() {
    const { queue, index, positionMillis } = usePlayerStore.getState();
    if (positionMillis > 3000 && player) {
      player.seekTo(0);
      return;
    }
    if (index <= 0) {
      if (player) player.seekTo(0);
      return;
    }
    const prevIndex = index - 1;
    usePlayerStore.getState().setIndex(prevIndex);
    const t = queue[prevIndex];
    if (t) await loadTrack(t, true);
  },
  seekTo(millis: number) {
    if (player) player.seekTo(millis / 1000);
  },
  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    usePlayerStore.getState().setVolume(clamped);
    if (player) {
      try {
        player.volume = clamped;
      } catch {
        // ignore
      }
    }
  },
  stop() {
    disposePlayer();
    usePlayerStore.getState().setIsPlaying(false);
    usePlayerStore.getState().setProgress(0, 0);
  },
};

export function PlayerEngineProvider({ children }: { children: React.ReactNode }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      disposePlayer();
    };
  }, []);
  return <>{children}</>;
}
