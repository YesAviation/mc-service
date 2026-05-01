import type { Playlist } from "@music/shared";

export type CuratedSource = "human" | "ml";

export interface CuratedPlaylist {
  playlist: Playlist;
  source: CuratedSource;
}

const SYSTEM_PLAYLIST_NAMES = new Set(["favorites", "my library"]);

const mlSourcePattern = /\[ml\]|\bml\b|machine\s*learning|algorithmic|\bai\b|model/i;
const humanSourcePattern = /\[human\]|\bhuman\b|editor(?:ial)?|admin|curator|staff\s*picks?/i;
const curatedPattern = /curated|made\s*for\s*you|for\s*you|mix|recommended|discover/i;

function playlistText(playlist: Pick<Playlist, "name" | "description">): string {
  return `${playlist.name} ${playlist.description ?? ""}`.trim();
}

export function inferCuratedSource(
  playlist: Pick<Playlist, "name" | "description">,
): CuratedSource | null {
  const text = playlistText(playlist);

  if (mlSourcePattern.test(text)) {
    return "ml";
  }

  if (humanSourcePattern.test(text)) {
    return "human";
  }

  return null;
}

function isSystemPlaylist(playlist: Pick<Playlist, "name">): boolean {
  return SYSTEM_PLAYLIST_NAMES.has(playlist.name.trim().toLowerCase());
}

export function getCuratedPlaylists(playlists: Playlist[], limit: number): CuratedPlaylist[] {
  if (limit <= 0) {
    return [];
  }

  const curated = playlists
    .filter((playlist) => !isSystemPlaylist(playlist))
    .map((playlist) => {
      const text = playlistText(playlist);
      const source = inferCuratedSource(playlist);
      const looksCurated = curatedPattern.test(text) || source !== null;

      return {
        playlist,
        source: source ?? "human",
        looksCurated,
      };
    })
    .filter((entry) => entry.looksCurated)
    .sort((a, b) => {
      const scoreA = (a.source === "ml" ? 2 : 1) + a.playlist.tracks.length;
      const scoreB = (b.source === "ml" ? 2 : 1) + b.playlist.tracks.length;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return a.playlist.name.localeCompare(b.playlist.name, undefined, {
        sensitivity: "base",
      });
    })
    .slice(0, limit)
    .map((entry) => ({ playlist: entry.playlist, source: entry.source }));

  if (curated.length > 0) {
    return curated;
  }

  return playlists
    .filter((playlist) => !isSystemPlaylist(playlist))
    .sort((a, b) => {
      if (a.tracks.length !== b.tracks.length) {
        return b.tracks.length - a.tracks.length;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    })
    .slice(0, limit)
    .map((playlist, index) => ({
      playlist,
      source: index % 2 === 0 ? "human" : "ml",
    }));
}
