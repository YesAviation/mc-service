import { apiRequest } from './client';
import type { Pagination, Playlist } from './types';

type PlaylistList = { playlists: Playlist[]; pagination: Pagination | null };

export const playlistsApi = {
  list: (q: { page?: number; page_size?: number } = {}) =>
    apiRequest<PlaylistList>('/api/playlists', { query: q }),
  get: (id: string) => apiRequest<Playlist>(`/api/playlists/${id}`),
  create: (body: { name: string; description?: string; is_public?: boolean }) =>
    apiRequest<Playlist>('/api/playlists', { method: 'POST', json: body }),
  update: (id: string, body: { name?: string; description?: string; is_public?: boolean }) =>
    apiRequest<Playlist>(`/api/playlists/${id}`, { method: 'PUT', json: body }),
  delete: (id: string) => apiRequest<void>(`/api/playlists/${id}`, { method: 'DELETE' }),
  addTrack: (id: string, trackId: string) =>
    apiRequest<Playlist>(`/api/playlists/${id}/tracks`, { method: 'POST', json: { trackId } }),
  removeTrack: (id: string, trackId: string) =>
    apiRequest<Playlist>(`/api/playlists/${id}/tracks/${trackId}`, { method: 'DELETE' }),
  reorder: (id: string, trackIds: string[]) =>
    apiRequest<Playlist>(`/api/playlists/${id}/tracks/reorder`, {
      method: 'PUT',
      json: { trackIds },
    }),
};
