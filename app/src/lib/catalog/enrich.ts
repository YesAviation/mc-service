import { catalogApi } from '@/lib/api';
import type { Album, Artist, Track } from '@/lib/api/types';
import type { EnrichedTrack } from '@/lib/player/store';

const albumCache = new Map<string, Album>();
const artistCache = new Map<string, Artist>();

export function cacheAlbums(albums: Album[]) {
  for (const a of albums) albumCache.set(a.id, a);
}
export function cacheArtists(artists: Artist[]) {
  for (const a of artists) artistCache.set(a.id, a);
}
export function getCachedAlbum(id: string) {
  return albumCache.get(id) ?? null;
}
export function getCachedArtist(id: string) {
  return artistCache.get(id) ?? null;
}

export async function enrichTracks(tracks: Track[]): Promise<EnrichedTrack[]> {
  const missingAlbums = new Set<string>();
  const missingArtists = new Set<string>();
  for (const t of tracks) {
    if (t.album_id && !albumCache.has(t.album_id)) missingAlbums.add(t.album_id);
    if (t.artist_id && !artistCache.has(t.artist_id)) missingArtists.add(t.artist_id);
  }

  await Promise.all([
    ...Array.from(missingAlbums).map((id) =>
      catalogApi
        .getAlbum(id)
        .then((a) => albumCache.set(id, a))
        .catch(() => {}),
    ),
    ...Array.from(missingArtists).map((id) =>
      catalogApi
        .getArtist(id)
        .then((a) => artistCache.set(id, a))
        .catch(() => {}),
    ),
  ]);

  return tracks.map((t) => {
    const album = t.album_id ? albumCache.get(t.album_id) ?? null : null;
    const artist = t.artist_id ? artistCache.get(t.artist_id) ?? null : null;
    return {
      ...t,
      album: album ? { id: album.id, title: album.title, artwork_url: album.artwork_url } : null,
      artist: artist ? { id: artist.id, name: artist.name } : null,
    };
  });
}
