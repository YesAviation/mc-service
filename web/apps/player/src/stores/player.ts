import { create } from "zustand";
import type { Track } from "@music/shared";

const RECENTLY_PLAYED_KEY = "player_recently_played";
const RECENTLY_PLAYED_LIMIT = 80;

function loadRecentlyPlayed(): Track[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(RECENTLY_PLAYED_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is Track => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const candidate = entry as Partial<Track>;
      return typeof candidate.id === "string" && typeof candidate.title === "string";
    });
  } catch {
    return [];
  }
}

function persistRecentlyPlayed(tracks: Track[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(tracks));
  } catch {
    // Ignore storage quota or parsing-related issues.
  }
}

function pushRecentlyPlayed(history: Track[], track: Track): Track[] {
  const next = [track, ...history].slice(0, RECENTLY_PLAYED_LIMIT);
  persistRecentlyPlayed(next);
  return next;
}

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  recentlyPlayed: Track[];
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;

  // Actions
  play: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  setVolume: (volume: number) => void;
  seek: (time: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  addToQueue: (track: Track) => void;
  clearQueue: () => void;
  clearRecentlyPlayed: () => void;
  playAlbum: (tracks: Track[], startIndex?: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  recentlyPlayed: loadRecentlyPlayed(),
  isPlaying: false,
  volume: 0.8,
  currentTime: 0,
  duration: 0,
  shuffle: false,
  repeat: "off",

  play: (track, queue) => {
    set((state) => {
      const recentlyPlayed = pushRecentlyPlayed(state.recentlyPlayed, track);

      if (queue) {
        const index = queue.findIndex((t) => t.id === track.id);
        return {
          currentTrack: track,
          queue,
          queueIndex: index >= 0 ? index : 0,
          isPlaying: true,
          currentTime: 0,
          recentlyPlayed,
        };
      }

      return {
        currentTrack: track,
        isPlaying: true,
        currentTime: 0,
        recentlyPlayed,
      };
    });
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  togglePlay: () => {
    const { isPlaying, currentTrack } = get();
    if (currentTrack) {
      set({ isPlaying: !isPlaying });
    }
  },

  next: () => {
    const { queue, queueIndex, currentTrack, shuffle, repeat } = get();
    if (queue.length === 0) return;

    const activeIndex =
      queueIndex >= 0
        ? queueIndex
        : currentTrack
          ? queue.findIndex((track) => track.id === currentTrack.id)
          : -1;

    let nextIndex: number;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      const baseIndex = activeIndex >= 0 ? activeIndex : 0;
      nextIndex = baseIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeat === "all") {
          nextIndex = 0;
        } else {
          set({ isPlaying: false });
          return;
        }
      }
    }

    set((state) => {
      const nextTrack = queue[nextIndex];
      return {
        currentTrack: nextTrack,
        queueIndex: nextIndex,
        isPlaying: true,
        currentTime: 0,
        recentlyPlayed: pushRecentlyPlayed(state.recentlyPlayed, nextTrack),
      };
    });
  },

  previous: () => {
    const { queue, queueIndex, currentTrack, currentTime } = get();
    if (queue.length === 0) return;

    const activeIndex =
      queueIndex >= 0
        ? queueIndex
        : currentTrack
          ? queue.findIndex((track) => track.id === currentTrack.id)
          : -1;

    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }

    const prevIndex = activeIndex > 0 ? activeIndex - 1 : queue.length - 1;

    set((state) => {
      const previousTrack = queue[prevIndex];
      return {
        currentTrack: previousTrack,
        queueIndex: prevIndex,
        isPlaying: true,
        currentTime: 0,
        recentlyPlayed: pushRecentlyPlayed(state.recentlyPlayed, previousTrack),
      };
    });
  },

  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  seek: (time) => set({ currentTime: time }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),

  addToQueue: (track) =>
    set((state) => ({ queue: [...state.queue, track] })),

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

  clearRecentlyPlayed: () => {
    persistRecentlyPlayed([]);
    set({ recentlyPlayed: [] });
  },

  playAlbum: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;

    set((state) => {
      const track = tracks[startIndex];
      return {
        queue: tracks,
        queueIndex: startIndex,
        currentTrack: track,
        isPlaying: true,
        currentTime: 0,
        recentlyPlayed: pushRecentlyPlayed(state.recentlyPlayed, track),
      };
    });
  },

  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),

  toggleRepeat: () =>
    set((state) => {
      const modes: RepeatMode[] = ["off", "all", "one"];
      const currentIdx = modes.indexOf(state.repeat);
      return { repeat: modes[(currentIdx + 1) % modes.length] };
    }),
}));
