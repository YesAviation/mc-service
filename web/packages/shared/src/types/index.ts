// Auth
export interface LoginRequest {
  username: string;
  password: string;
  remember_me?: boolean;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  is_active: boolean;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

// Catalog
export interface Track {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_title: string;
  duration_secs: number;
  track_number: number;
  disc_number: number;
  genre: string;
  year: number;
  artwork_url: string;
  created_at: string;
  metadata_json?: string;
  manually_edited?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  year: number;
  genre: string;
  artwork_url: string;
  track_count: number;
  created_at: string;
  metadata_json?: string;
  manually_edited?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  bio: string;
  image_url: string;
  album_count: number;
  track_count: number;
  created_at: string;
  metadata_json?: string;
  manually_edited?: boolean;
  /** ISO-8601 calendar date the act was formed (e.g. "2022-03-28"). */
  formed_date?: string;
  /** Free-form origin country / region (e.g. "South Korea"). */
  origin_country?: string;
}

// Update payloads — admin metadata editing
export interface UpdateTrackRequest {
  title?: string;
  artist_id?: string;
  album_id?: string;
  track_number?: number;
  disc_number?: number;
  genre?: string;
  year?: number;
  metadata_json?: string;
  manually_edited?: boolean;
}

export interface UpdateAlbumRequest {
  title?: string;
  artist_id?: string;
  year?: number;
  genre?: string;
  artwork_url?: string;
  metadata_json?: string;
  manually_edited?: boolean;
}

export interface UpdateArtistRequest {
  name?: string;
  bio?: string;
  image_url?: string;
  metadata_json?: string;
  formed_date?: string;
  origin_country?: string;
  manually_edited?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Playlists
export interface PlaylistTrack {
  track_id: string;
  position: number;
  added_at?: string;
}

export interface Playlist {
  id: string;
  name: string;
  user_id: string;
  description: string;
  is_public: boolean;
  tracks: PlaylistTrack[];
  created_at?: string;
  updated_at?: string;
}

export interface PlaylistPagination {
  total_items: number;
  total_pages: number;
  current_page: number;
  page_size: number;
}

export interface ListPlaylistsResponse {
  playlists: Playlist[];
  pagination?: PlaylistPagination;
}

export interface CreatePlaylistRequest {
  name: string;
  description?: string;
  is_public?: boolean;
}

// Streaming
export interface StreamUrl {
  manifest_url: string;
  expires_at: number;
}

// Ingestion
export interface ScanRequest {
  path: string;
  recursive?: boolean;
}

export interface ScanResponse {
  scan_id: string;
  files_found: number;
  status: string;
}

export interface IngestRequest {
  file_path: string;
}

export interface IngestResponse {
  track_id: string;
  title: string;
  artist: string;
  album: string;
  duration_secs: number;
}

// Media processing settings
export interface MediaProcessingSettings {
  auto_prewarm_on_scan_complete: boolean;
  pretranscode_enabled: boolean;
  prehls_enabled: boolean;
  prewarm_bitrates: number[];
  hls_segment_duration_secs: number;
  updated_at: string;
}

export interface UpdateMediaProcessingSettingsRequest {
  auto_prewarm_on_scan_complete?: boolean;
  pretranscode_enabled?: boolean;
  prehls_enabled?: boolean;
  prewarm_bitrates?: number[];
  hls_segment_duration_secs?: number;
}

export interface StartMediaPrewarmResponse {
  started: boolean;
  message: string;
}

// Admin account management
export interface AdminUserAccount {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  is_active: boolean;
  is_main_admin: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateAdminUserRequest {
  username?: string;
  email?: string;
  role?: "admin" | "user";
  is_active?: boolean;
}

export interface CreateAdminUserRequest {
  username: string;
  email: string;
  password: string;
  role?: "admin" | "user";
  is_active?: boolean;
}

export interface ResetAdminUserPasswordRequest {
  new_password: string;
}

export interface AdminActionResponse {
  message: string;
}

// Server runtime settings
export interface RuntimeEnvironmentVariable {
  key: string;
  value: string;
  source: "override" | "process" | "unset";
  is_sensitive: boolean;
  override_value: string;
}

export interface ServerRuntimeSettings {
  maintenance_mode: boolean;
  allow_user_registration: boolean;
  default_user_role: "admin" | "user";
  max_upload_size_mb: number;
  feature_flags: Record<string, boolean>;
  environment_overrides: Record<string, string>;
  environment: RuntimeEnvironmentVariable[];
  main_admin_username: string;
  updated_at: string;
}

export interface UpdateServerRuntimeSettingsRequest {
  maintenance_mode?: boolean;
  allow_user_registration?: boolean;
  default_user_role?: "admin" | "user";
  max_upload_size_mb?: number;
  feature_flags?: Record<string, boolean>;
  environment_overrides?: Record<string, string>;
}

// Health
export interface HealthResponse {
  service: string;
  status: string;
  version: string;
}
