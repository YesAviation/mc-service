import { ApiError, playlistsApi } from "@music/shared";
import type { Playlist } from "@music/shared";

export const USER_FAVORITES_PLAYLIST_NAME = "Favorites";
export type SaveToLibraryResult = "added" | "already-saved";

async function ensureNamedPlaylist(
  playlistName: string,
  description: string,
): Promise<Playlist> {
  const { playlists } = await playlistsApi.listPlaylists({ page: 1, page_size: 200 });

  const existing = playlists.find(
    (playlist) =>
      playlist.name.trim().toLowerCase() ===
      playlistName.trim().toLowerCase(),
  );

  if (existing) {
    return existing;
  }

  return playlistsApi.createPlaylist({
    name: playlistName,
    description,
    is_public: false,
  });
}

export async function ensureUserFavoritesPlaylist(): Promise<Playlist> {
  return ensureNamedPlaylist(
    USER_FAVORITES_PLAYLIST_NAME,
    "Tracks marked as favorites",
  );
}

export async function saveTrackToLibrary(trackId: string): Promise<SaveToLibraryResult> {
  const favorites = await ensureUserFavoritesPlaylist();

  try {
    await playlistsApi.addTrack(favorites.id, trackId);
    return "added";
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return "already-saved";
    }
    throw error;
  }
}

export function playlistContainsTrack(
  playlist: Playlist | null,
  trackId: string | null | undefined,
): boolean {
  if (!playlist || !trackId) {
    return false;
  }

  return playlist.tracks.some((track) => track.track_id === trackId);
}

function toTimestamp(value?: string): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function getRecentlyAddedTrackIds(
  playlist: Playlist | null,
  limit: number,
): string[] {
  if (!playlist || limit <= 0) {
    return [];
  }

  return [...playlist.tracks]
    .sort((a, b) => {
      const timeDelta = toTimestamp(b.added_at) - toTimestamp(a.added_at);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return b.position - a.position;
    })
    .map((track) => track.track_id)
    .filter((trackId, index, all) => all.indexOf(trackId) === index)
    .slice(0, limit);
}
