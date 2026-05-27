import { apiRequest } from './client';
import type { Album, Artist, Pagination, Track } from './types';

type TrackList = { tracks: Track[]; pagination: Pagination | null };
type AlbumList = { albums: Album[]; pagination: Pagination | null };
type ArtistList = { artists: Artist[]; pagination: Pagination | null };

export const catalogApi = {
  listTracks: (q: { page?: number; page_size?: number; artist_id?: string; album_id?: string; genre?: string } = {}) =>
    apiRequest<TrackList>('/api/catalog/tracks', { query: q }),
  getTrack: (id: string) => apiRequest<Track>(`/api/catalog/tracks/${id}`),
  listAlbums: (q: { page?: number; page_size?: number; artist_id?: string; genre?: string } = {}) =>
    apiRequest<AlbumList>('/api/catalog/albums', { query: q }),
  getAlbum: (id: string) => apiRequest<Album>(`/api/catalog/albums/${id}`),
  listArtists: (q: { page?: number; page_size?: number } = {}) =>
    apiRequest<ArtistList>('/api/catalog/artists', { query: q }),
  getArtist: (id: string) => apiRequest<Artist>(`/api/catalog/artists/${id}`),
};
