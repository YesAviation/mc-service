import { api } from "./client";
import type {
  CreatePlaylistRequest,
  ListPlaylistsResponse,
  Playlist,
} from "../types";

type ListPlaylistsParams = {
  page?: number;
  page_size?: number;
};

export const playlistsApi = {
  listPlaylists: async (
    params?: ListPlaylistsParams,
  ): Promise<ListPlaylistsResponse> => {
    const response = await api.get<ListPlaylistsResponse>("/playlists", params);
    return {
      playlists: response.playlists ?? [],
      pagination: response.pagination,
    };
  },

  createPlaylist: (data: CreatePlaylistRequest): Promise<Playlist> =>
    api.post<Playlist>("/playlists", {
      name: data.name,
      description: data.description ?? "",
      is_public: data.is_public ?? false,
    }),

  getPlaylist: (playlistId: string): Promise<Playlist> =>
    api.get<Playlist>(`/playlists/${playlistId}`),

  addTrack: (playlistId: string, trackId: string): Promise<Playlist> =>
    api.post<Playlist>(`/playlists/${playlistId}/tracks`, {
      trackId,
    }),

  removeTrack: (playlistId: string, trackId: string): Promise<Playlist> =>
    api.delete<Playlist>(`/playlists/${playlistId}/tracks/${trackId}`),
};
