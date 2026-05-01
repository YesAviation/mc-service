use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Playlist {
	pub id: Uuid,
	pub name: String,
	pub user_id: Uuid,
	pub description: Option<String>,
	pub is_public: bool,
	pub created_at: DateTime<Utc>,
	pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PlaylistTrack {
	pub playlist_id: Uuid,
	pub track_id: Uuid,
	pub position: i32,
	pub added_at: DateTime<Utc>,
}
