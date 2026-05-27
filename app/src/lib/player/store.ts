import { create } from 'zustand';
import type { Album, Artist, Track } from '@/lib/api/types';

export type EnrichedTrack = Track & {
  album?: Pick<Album, 'id' | 'title' | 'artwork_url'> | null;
  artist?: Pick<Artist, 'id' | 'name'> | null;
};

export type RepeatMode = 'off' | 'all' | 'one';

type PlayerState = {
  queue: EnrichedTrack[];
  index: number;
  isPlaying: boolean;
  isBuffering: boolean;
  positionMillis: number;
  durationMillis: number;
  shuffle: boolean;
  repeat: RepeatMode;
  expandedOpen: boolean;

  volume: number;
  setQueue: (tracks: EnrichedTrack[], startAt?: number) => void;
  setIndex: (i: number) => void;
  setIsPlaying: (b: boolean) => void;
  setIsBuffering: (b: boolean) => void;
  setProgress: (positionMillis: number, durationMillis: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setExpandedOpen: (b: boolean) => void;
  setVolume: (v: number) => void;
  enqueueNext: (track: EnrichedTrack) => void;
  enqueueEnd: (track: EnrichedTrack) => void;
  current: () => EnrichedTrack | null;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  isPlaying: false,
  isBuffering: false,
  positionMillis: 0,
  durationMillis: 0,
  shuffle: false,
  repeat: 'off',
  expandedOpen: false,
  volume: 1.0,

  setQueue: (tracks, startAt = 0) =>
    set({
      queue: tracks,
      index: Math.max(0, Math.min(startAt, tracks.length - 1)),
      positionMillis: 0,
      durationMillis: 0,
    }),
  setIndex: (i) => set({ index: i, positionMillis: 0, durationMillis: 0 }),
  setIsPlaying: (b) => set({ isPlaying: b }),
  setIsBuffering: (b) => set({ isBuffering: b }),
  setProgress: (positionMillis, durationMillis) => set({ positionMillis, durationMillis }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
  setExpandedOpen: (b) => set({ expandedOpen: b }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  enqueueNext: (track) =>
    set((s) => {
      const insertAt = Math.min(s.queue.length, s.index + 1);
      const next = [...s.queue.slice(0, insertAt), track, ...s.queue.slice(insertAt)];
      return { queue: next };
    }),
  enqueueEnd: (track) =>
    set((s) => ({ queue: [...s.queue, track] })),
  current: () => {
    const { queue, index } = get();
    return queue[index] ?? null;
  },
}));
