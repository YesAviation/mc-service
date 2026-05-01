import { api } from "./client";
import type {
  Track,
  Album,
  Artist,
  PaginatedResponse,
  UpdateTrackRequest,
  UpdateAlbumRequest,
  UpdateArtistRequest,
} from "../types";

type ListParams = {
  page?: number;
  page_size?: number;
  artist_id?: string;
  album_id?: string;
  genre?: string;
};

type ApiPagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  page_size: number;
};

type ApiTrack = {
  id: string;
  title: string;
  artist_id: string;
  album_id: string;
  duration_secs: number;
  track_number: number;
  disc_number: number;
  genre: string;
  year: number;
  metadata_json: string;
  created_at?: string;
  manually_edited?: boolean;
};

type ApiAlbum = {
  id: string;
  title: string;
  artist_id: string;
  year: number;
  genre: string;
  artwork_url: string;
  metadata_json: string;
  created_at?: string;
  manually_edited?: boolean;
};

type ApiArtist = {
  id: string;
  name: string;
  bio: string;
  image_url: string;
  metadata_json: string;
  created_at?: string;
  manually_edited?: boolean;
  formed_date?: string;
  origin_country?: string;
};

type ApiTrackListResponse = {
  tracks: ApiTrack[];
  pagination?: ApiPagination;
};

type ApiAlbumListResponse = {
  albums: ApiAlbum[];
  pagination?: ApiPagination;
};

type ApiArtistListResponse = {
  artists: ApiArtist[];
  pagination?: ApiPagination;
};

type TrackMetadata = {
  artist?: string;
  album?: string;
  artwork_url?: string;
};

function parseMetadata(raw: string): TrackMetadata {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as TrackMetadata;
  } catch {
    return {};
  }
}

function toPaginatedResponse<T>(
  items: T[],
  pagination?: ApiPagination,
): PaginatedResponse<T> {
  return {
    items,
    total: pagination?.total_items ?? items.length,
    page: pagination?.current_page ?? 1,
    page_size: pagination?.page_size ?? items.length,
    total_pages: pagination?.total_pages ?? 1,
  };
}

async function fetchArtistsById(artistIds: string[]): Promise<Map<string, ApiArtist>> {
  const uniqueIds = [...new Set(artistIds.filter(Boolean))];
  const pairs = await Promise.all(
    uniqueIds.map(async (artistId) => {
      try {
        const artist = await api.get<ApiArtist>(`/catalog/artists/${artistId}`);
        return [artistId, artist] as const;
      } catch {
        return [artistId, null] as const;
      }
    }),
  );

  return new Map(
    pairs
      .filter((entry): entry is readonly [string, ApiArtist] => entry[1] !== null)
      .map(([id, artist]) => [id, artist]),
  );
}

async function fetchAlbumsById(albumIds: string[]): Promise<Map<string, ApiAlbum>> {
  const uniqueIds = [...new Set(albumIds.filter(Boolean))];
  const pairs = await Promise.all(
    uniqueIds.map(async (albumId) => {
      try {
        const album = await api.get<ApiAlbum>(`/catalog/albums/${albumId}`);
        return [albumId, album] as const;
      } catch {
        return [albumId, null] as const;
      }
    }),
  );

  return new Map(
    pairs
      .filter((entry): entry is readonly [string, ApiAlbum] => entry[1] !== null)
      .map(([id, album]) => [id, album]),
  );
}

function mapArtist(artist: ApiArtist): Artist {
  return {
    id: artist.id,
    name: artist.name,
    bio: artist.bio,
    image_url: artist.image_url,
    album_count: 0,
    track_count: 0,
    created_at: artist.created_at ?? new Date(0).toISOString(),
    metadata_json: artist.metadata_json,
    manually_edited: artist.manually_edited ?? false,
    formed_date: artist.formed_date ?? "",
    origin_country: artist.origin_country ?? "",
  };
}

function mapAlbum(album: ApiAlbum, artistName: string): Album {
  return {
    id: album.id,
    title: album.title,
    artist_id: album.artist_id,
    artist_name: artistName,
    year: album.year,
    genre: album.genre,
    artwork_url: album.artwork_url,
    track_count: 0,
    created_at: album.created_at ?? new Date(0).toISOString(),
    metadata_json: album.metadata_json,
    manually_edited: album.manually_edited ?? false,
  };
}

function mapTrack(
  track: ApiTrack,
  artistName: string,
  albumTitle: string,
  artworkUrl: string,
): Track {
  return {
    id: track.id,
    title: track.title,
    artist_id: track.artist_id,
    artist_name: artistName,
    album_id: track.album_id,
    album_title: albumTitle,
    duration_secs: track.duration_secs,
    track_number: track.track_number,
    disc_number: track.disc_number,
    genre: track.genre,
    year: track.year,
    artwork_url: artworkUrl,
    created_at: track.created_at ?? new Date(0).toISOString(),
    metadata_json: track.metadata_json,
    manually_edited: track.manually_edited ?? false,
  };
}

export const catalogApi = {
  // Tracks
  listTracks: async (params?: ListParams): Promise<PaginatedResponse<Track>> => {
    const response = await api.get<ApiTrackListResponse>("/catalog/tracks", params);
    const tracks = response.tracks ?? [];

    const metadataByTrack = tracks.map((track) => parseMetadata(track.metadata_json));
    const missingArtistIds = tracks
      .filter((_, index) => !metadataByTrack[index].artist?.trim())
      .map((track) => track.artist_id);
    const missingAlbumIds = tracks
      .filter(
        (_, index) =>
          !metadataByTrack[index].album?.trim() ||
          !metadataByTrack[index].artwork_url?.trim(),
      )
      .map((track) => track.album_id);

    const [artistMap, albumMap] = await Promise.all([
      missingArtistIds.length > 0
        ? fetchArtistsById(missingArtistIds)
        : Promise.resolve(new Map<string, ApiArtist>()),
      missingAlbumIds.length > 0
        ? fetchAlbumsById(missingAlbumIds)
        : Promise.resolve(new Map<string, ApiAlbum>()),
    ]);

    const mappedTracks = tracks.map((track, index) => {
      const metadata = metadataByTrack[index];
      const artist = artistMap.get(track.artist_id);
      const album = albumMap.get(track.album_id);

      return mapTrack(
        track,
        artist?.name ?? metadata.artist ?? "Unknown Artist",
        album?.title ?? metadata.album ?? "Unknown Album",
        album?.artwork_url ?? metadata.artwork_url ?? "",
      );
    });

    return toPaginatedResponse(mappedTracks, response.pagination);
  },

  getTrack: async (id: string): Promise<Track> => {
    const track = await api.get<ApiTrack>(`/catalog/tracks/${id}`);
    const metadata = parseMetadata(track.metadata_json);

    const [artist, album] = await Promise.all([
      track.artist_id
        ? api.get<ApiArtist>(`/catalog/artists/${track.artist_id}`).catch(() => null)
        : Promise.resolve(null),
      track.album_id
        ? api.get<ApiAlbum>(`/catalog/albums/${track.album_id}`).catch(() => null)
        : Promise.resolve(null),
    ]);

    return mapTrack(
      track,
      artist?.name ?? metadata.artist ?? "Unknown Artist",
      album?.title ?? metadata.album ?? "Unknown Album",
      album?.artwork_url ?? metadata.artwork_url ?? "",
    );
  },

  // Albums
  listAlbums: async (params?: ListParams): Promise<PaginatedResponse<Album>> => {
    const response = await api.get<ApiAlbumListResponse>("/catalog/albums", params);
    const albums = response.albums ?? [];
    const artistMap = await fetchArtistsById(albums.map((album) => album.artist_id));

    const mappedAlbums = albums.map((album) => {
      const artist = artistMap.get(album.artist_id);
      return mapAlbum(album, artist?.name ?? "Unknown Artist");
    });

    return toPaginatedResponse(mappedAlbums, response.pagination);
  },

  getAlbum: async (id: string): Promise<Album> => {
    const album = await api.get<ApiAlbum>(`/catalog/albums/${id}`);
    const artist = album.artist_id
      ? await api.get<ApiArtist>(`/catalog/artists/${album.artist_id}`).catch(() => null)
      : null;

    return mapAlbum(album, artist?.name ?? "Unknown Artist");
  },

  // Artists
  listArtists: async (params?: {
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Artist>> => {
    const response = await api.get<ApiArtistListResponse>("/catalog/artists", params);
    const artists = (response.artists ?? []).map(mapArtist);
    return toPaginatedResponse(artists, response.pagination);
  },

  getArtist: async (id: string): Promise<Artist> => {
    const artist = await api.get<ApiArtist>(`/catalog/artists/${id}`);
    return mapArtist(artist);
  },

  // ----- Admin metadata editing (PATCH) -----

  updateTrack: async (id: string, body: UpdateTrackRequest): Promise<Track> => {
    const updated = await api.patch<ApiTrack>(`/catalog/tracks/${id}`, body);
    const metadata = parseMetadata(updated.metadata_json);
    const [artist, album] = await Promise.all([
      updated.artist_id
        ? api.get<ApiArtist>(`/catalog/artists/${updated.artist_id}`).catch(() => null)
        : Promise.resolve(null),
      updated.album_id
        ? api.get<ApiAlbum>(`/catalog/albums/${updated.album_id}`).catch(() => null)
        : Promise.resolve(null),
    ]);
    return mapTrack(
      updated,
      artist?.name ?? metadata.artist ?? "Unknown Artist",
      album?.title ?? metadata.album ?? "Unknown Album",
      album?.artwork_url ?? metadata.artwork_url ?? "",
    );
  },

  updateAlbum: async (id: string, body: UpdateAlbumRequest): Promise<Album> => {
    const updated = await api.patch<ApiAlbum>(`/catalog/albums/${id}`, body);
    const artist = updated.artist_id
      ? await api.get<ApiArtist>(`/catalog/artists/${updated.artist_id}`).catch(() => null)
      : null;
    return mapAlbum(updated, artist?.name ?? "Unknown Artist");
  },

  updateArtist: async (id: string, body: UpdateArtistRequest): Promise<Artist> => {
    const updated = await api.patch<ApiArtist>(`/catalog/artists/${id}`, body);
    return mapArtist(updated);
  },
};
