use chrono::{DateTime, NaiveDate, Utc};
use uuid::Uuid;

/// A track row from the `tracks` table.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Track {
    pub id: Uuid,
    pub title: String,
    pub artist_id: Uuid,
    pub album_id: Uuid,
    pub duration_secs: i32,
    pub track_number: i32,
    pub disc_number: i32,
    pub genre: String,
    pub year: i32,
    pub file_hash: String,
    pub storage_file_id: Uuid,
    pub metadata_json: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub manually_edited: bool,
}

/// An album row from the `albums` table.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Album {
    pub id: Uuid,
    pub title: String,
    pub artist_id: Uuid,
    pub year: i32,
    pub genre: String,
    pub artwork_url: String,
    pub metadata_json: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub manually_edited: bool,
}

/// An artist row from the `artists` table.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Artist {
    pub id: Uuid,
    pub name: String,
    pub bio: String,
    pub image_url: String,
    pub metadata_json: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub manually_edited: bool,
    pub formed_date: Option<NaiveDate>,
    pub origin_country: Option<String>,
}
