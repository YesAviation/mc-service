import { create } from 'zustand';
import { kvStorage } from '@/lib/storage';

const KEY = 'music.settings.v1';

export type SwipeAction = 'favorite' | 'queue-next' | 'queue-end' | 'add-to-playlist' | 'download' | 'none';

export const SWIPE_ACTION_LABELS: Record<SwipeAction, string> = {
  favorite: 'Favorite',
  'queue-next': 'Play Next',
  'queue-end': 'Add to Queue',
  'add-to-playlist': 'Add to Playlist',
  download: 'Download',
  none: 'None',
};

export const SWIPE_ACTION_ICONS: Record<SwipeAction, string> = {
  favorite: 'heart.fill',
  'queue-next': 'text.insert',
  'queue-end': 'text.append',
  'add-to-playlist': 'plus.square',
  download: 'arrow.down.circle.fill',
  none: 'xmark',
};

export const SWIPE_ACTION_COLORS: Record<SwipeAction, string> = {
  favorite: '#FF2D55',
  'queue-next': '#5856D6',
  'queue-end': '#5AC8FA',
  'add-to-playlist': '#FF9500',
  download: '#34C759',
  none: '#8E8E93',
};

type Settings = {
  leftSwipeAction: SwipeAction;
  rightSwipeAction: SwipeAction;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLeftSwipeAction: (a: SwipeAction) => Promise<void>;
  setRightSwipeAction: (a: SwipeAction) => Promise<void>;
};

const DEFAULTS = {
  leftSwipeAction: 'queue-end' as SwipeAction,
  rightSwipeAction: 'favorite' as SwipeAction,
};

async function persist(state: { leftSwipeAction: SwipeAction; rightSwipeAction: SwipeAction }) {
  await kvStorage.set(KEY, JSON.stringify(state));
}

export const useSettingsStore = create<Settings>((set, get) => ({
  leftSwipeAction: DEFAULTS.leftSwipeAction,
  rightSwipeAction: DEFAULTS.rightSwipeAction,
  hydrated: false,
  hydrate: async () => {
    const raw = await kvStorage.get(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS>;
        set({
          leftSwipeAction: parsed.leftSwipeAction ?? DEFAULTS.leftSwipeAction,
          rightSwipeAction: parsed.rightSwipeAction ?? DEFAULTS.rightSwipeAction,
        });
      } catch {
        // ignore malformed
      }
    }
    set({ hydrated: true });
  },
  setLeftSwipeAction: async (a) => {
    set({ leftSwipeAction: a });
    await persist({ leftSwipeAction: a, rightSwipeAction: get().rightSwipeAction });
  },
  setRightSwipeAction: async (a) => {
    set({ rightSwipeAction: a });
    await persist({ leftSwipeAction: get().leftSwipeAction, rightSwipeAction: a });
  },
}));
