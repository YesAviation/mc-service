export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  avatar_url: string;
  created_at?: string;
  updated_at?: string;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser | null;
};

export type Track = {
  id: string;
  title: string;
  artist_id: string;
  album_id: string;
  duration_secs: number;
  track_number: number;
  disc_number: number;
  genre: string;
  year: number;
  file_hash: string;
  storage_file_id: string;
  metadata_json: string;
  created_at?: string;
  updated_at?: string;
};

export type Album = {
  id: string;
  title: string;
  artist_id: string;
  year: number;
  genre: string;
  artwork_url: string;
  metadata_json: string;
  created_at?: string;
  updated_at?: string;
};

export type Artist = {
  id: string;
  name: string;
  bio: string;
  image_url: string;
  metadata_json: string;
  created_at?: string;
  updated_at?: string;
};

export type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  page_size: number;
};

export type Paginated<T, K extends string> = { pagination: Pagination | null } & Record<K, T[]>;

export type PlaylistTrack = {
  track_id: string;
  position: number;
  added_at?: string;
};

export type Playlist = {
  id: string;
  name: string;
  user_id: string;
  description: string;
  is_public: boolean;
  tracks: PlaylistTrack[];
  created_at?: string;
  updated_at?: string;
};

export type StreamUrl = {
  manifest_url: string;
  expires_at: number;
};

export type ApiError = { code: number; message: string };
