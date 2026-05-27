import { create } from 'zustand';
import { ApiError, catalogApi, playlistsApi } from '@/lib/api';
import type { Playlist, Track } from '@/lib/api/types';

const FAVORITES_NAME = 'Favorites';

async function findOrCreateFavorites(): Promise<Playlist> {
  const res = await playlistsApi.list({ page: 1, page_size: 200 });
  const playlists = res.playlists ?? [];
  console.log('[library] /api/playlists returned', playlists.length, 'playlists:',
    playlists.map((p) => ({ id: p.id, name: p.name, trackCount: p.tracks?.length ?? 0 })),
  );

  const existing = playlists.find(
    (p) => p.name?.trim().toLowerCase() === FAVORITES_NAME.toLowerCase(),
  );

  if (existing) {
    // The list endpoint may return playlists without their full track membership.
    // Re-fetch by id to guarantee we have the populated tracks array.
    try {
      const full = await playlistsApi.get(existing.id);
      console.log('[library] full Favorites playlist:', {
        id: full.id,
        name: full.name,
        trackCount: full.tracks?.length ?? 0,
      });
      return full;
    } catch (err) {
      console.warn('[library] could not re-fetch Favorites by id, using list payload', err);
      return existing;
    }
  }

  console.log('[library] no Favorites playlist found, creating one');
  const created = await playlistsApi.create({
    name: FAVORITES_NAME,
    description: 'Tracks marked as favorites',
    is_public: false,
  });
  return created;
}

type LibraryState = {
  playlistId: string | null;
  ids: Set<string>;
  tracks: Track[];
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  ensure: () => Promise<void>;
  refresh: () => Promise<void>;
  toggle: (trackId: string) => Promise<boolean>;
  has: (trackId: string) => boolean;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  playlistId: null,
  ids: new Set(),
  tracks: [],
  hydrated: false,
  loading: false,
  error: null,

  ensure: async () => {
    if (get().playlistId) return;
    await get().refresh();
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const playlist = await findOrCreateFavorites();
      const playlistTracks = playlist.tracks ?? [];
      const ordered = [...playlistTracks].sort((a, b) => a.position - b.position);
      const ids = new Set(ordered.map((t) => t.track_id));
      set({ playlistId: playlist.id, ids });

      const fetched = await Promise.all(
        ordered.map((pt) => catalogApi.getTrack(pt.track_id).catch(() => null)),
      );
      const tracks = fetched.filter((t): t is Track => t !== null);
      console.log('[library] resolved', tracks.length, 'of', ordered.length, 'tracks');
      set({ tracks, hydrated: true, loading: false });
    } catch (err) {
      const message = err instanceof ApiError ? `${err.status} ${err.message}` : String(err);
      console.warn('[library] refresh failed:', message);
      set({ error: message, loading: false, hydrated: true });
    }
  },

  toggle: async (trackId) => {
    let id = get().playlistId;
    if (!id) {
      const playlist = await findOrCreateFavorites();
      id = playlist.id;
      set({ playlistId: id });
    }
    const wasFavorite = get().ids.has(trackId);
    const nextIds = new Set(get().ids);
    if (wasFavorite) nextIds.delete(trackId);
    else nextIds.add(trackId);
    set({ ids: nextIds });

    try {
      if (wasFavorite) {
        const updated = await playlistsApi.removeTrack(id, trackId);
        set({ tracks: get().tracks.filter((t) => t.id !== trackId) });
        const updatedIds = new Set((updated.tracks ?? []).map((pt) => pt.track_id));
        set({ ids: updatedIds });
      } else {
        await playlistsApi.addTrack(id, trackId);
        const track = await catalogApi.getTrack(trackId).catch(() => null);
        if (track) set({ tracks: [...get().tracks, track] });
      }
    } catch (err) {
      const reverted = new Set(get().ids);
      if (wasFavorite) reverted.add(trackId);
      else reverted.delete(trackId);
      set({ ids: reverted });
      throw err;
    }
    return !wasFavorite;
  },

  has: (trackId) => get().ids.has(trackId),
}));
