use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{Album, Artist, Track};

const TRACK_COLS: &str = "id, title, artist_id, album_id, duration_secs, track_number, \
    disc_number, genre, year, file_hash, storage_file_id, metadata_json, \
    created_at, updated_at, manually_edited";

const ALBUM_COLS: &str = "id, title, artist_id, year, genre, artwork_url, metadata_json, \
    created_at, updated_at, manually_edited";

const ARTIST_COLS: &str = "id, name, bio, image_url, metadata_json, created_at, updated_at, \
    manually_edited, formed_date, origin_country";

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

pub async fn create_track(
    pool: &PgPool,
    id: Uuid,
    title: &str,
    artist_id: Uuid,
    album_id: Uuid,
    duration_secs: i32,
    track_number: i32,
    disc_number: i32,
    genre: &str,
    year: i32,
    file_hash: &str,
    storage_file_id: Uuid,
    metadata_json: Option<serde_json::Value>,
) -> Result<Track, sqlx::Error> {
    let sql = format!(
        "INSERT INTO tracks (id, title, artist_id, album_id, duration_secs, track_number, \
         disc_number, genre, year, file_hash, storage_file_id, metadata_json) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) \
         RETURNING {TRACK_COLS}"
    );
    sqlx::query_as::<_, Track>(&sql)
        .bind(id)
        .bind(title)
        .bind(artist_id)
        .bind(album_id)
        .bind(duration_secs)
        .bind(track_number)
        .bind(disc_number)
        .bind(genre)
        .bind(year)
        .bind(file_hash)
        .bind(storage_file_id)
        .bind(metadata_json)
        .fetch_one(pool)
        .await
}

pub async fn find_track_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Track>, sqlx::Error> {
    let sql = format!("SELECT {TRACK_COLS} FROM tracks WHERE id = $1");
    sqlx::query_as::<_, Track>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn list_tracks(
    pool: &PgPool,
    artist_id: Option<Uuid>,
    album_id: Option<Uuid>,
    genre: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Track>, sqlx::Error> {
    let sql = format!(
        "SELECT {TRACK_COLS} FROM tracks \
         WHERE ($1::uuid IS NULL OR artist_id = $1) \
           AND ($2::uuid IS NULL OR album_id = $2) \
           AND ($3::text IS NULL OR genre = $3) \
         ORDER BY created_at DESC LIMIT $4 OFFSET $5"
    );
    sqlx::query_as::<_, Track>(&sql)
        .bind(artist_id)
        .bind(album_id)
        .bind(genre)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
}

pub async fn count_tracks(
    pool: &PgPool,
    artist_id: Option<Uuid>,
    album_id: Option<Uuid>,
    genre: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM tracks
        WHERE ($1::uuid IS NULL OR artist_id = $1)
          AND ($2::uuid IS NULL OR album_id = $2)
          AND ($3::text IS NULL OR genre = $3)
        "#,
    )
    .bind(artist_id)
    .bind(album_id)
    .bind(genre)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

#[derive(Debug, Default)]
pub struct UpdateTrackParams {
    pub title: Option<String>,
    pub artist_id: Option<Uuid>,
    pub album_id: Option<Uuid>,
    pub track_number: Option<i32>,
    pub disc_number: Option<i32>,
    pub genre: Option<String>,
    pub year: Option<i32>,
    pub metadata_json: Option<serde_json::Value>,
    /// When `Some`, override the manually_edited flag explicitly. When `None`,
    /// the catalog server will default to true (because an admin edit is
    /// happening) — see `crate::server::update_track`.
    pub manually_edited: Option<bool>,
}

pub async fn update_track(
    pool: &PgPool,
    id: Uuid,
    params: &UpdateTrackParams,
) -> Result<Option<Track>, sqlx::Error> {
    let sql = format!(
        "UPDATE tracks SET \
            title = COALESCE($2, title), \
            artist_id = COALESCE($3, artist_id), \
            album_id = COALESCE($4, album_id), \
            track_number = COALESCE($5, track_number), \
            disc_number = COALESCE($6, disc_number), \
            genre = COALESCE($7, genre), \
            year = COALESCE($8, year), \
            metadata_json = COALESCE($9, metadata_json), \
            manually_edited = COALESCE($10, manually_edited), \
            updated_at = NOW() \
         WHERE id = $1 \
         RETURNING {TRACK_COLS}"
    );
    sqlx::query_as::<_, Track>(&sql)
        .bind(id)
        .bind(&params.title)
        .bind(params.artist_id)
        .bind(params.album_id)
        .bind(params.track_number)
        .bind(params.disc_number)
        .bind(&params.genre)
        .bind(params.year)
        .bind(&params.metadata_json)
        .bind(params.manually_edited)
        .fetch_optional(pool)
        .await
}

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

pub async fn create_album(
    pool: &PgPool,
    id: Uuid,
    title: &str,
    artist_id: Uuid,
    year: i32,
    genre: &str,
    artwork_url: &str,
    metadata_json: Option<serde_json::Value>,
) -> Result<Album, sqlx::Error> {
    let sql = format!(
        "INSERT INTO albums (id, title, artist_id, year, genre, artwork_url, metadata_json) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         RETURNING {ALBUM_COLS}"
    );
    sqlx::query_as::<_, Album>(&sql)
        .bind(id)
        .bind(title)
        .bind(artist_id)
        .bind(year)
        .bind(genre)
        .bind(artwork_url)
        .bind(metadata_json)
        .fetch_one(pool)
        .await
}

pub async fn find_album_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Album>, sqlx::Error> {
    let sql = format!("SELECT {ALBUM_COLS} FROM albums WHERE id = $1");
    sqlx::query_as::<_, Album>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn list_albums(
    pool: &PgPool,
    artist_id: Option<Uuid>,
    genre: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<Album>, sqlx::Error> {
    let sql = format!(
        "SELECT {ALBUM_COLS} FROM albums \
         WHERE ($1::uuid IS NULL OR artist_id = $1) \
           AND ($2::text IS NULL OR genre = $2) \
         ORDER BY created_at DESC LIMIT $3 OFFSET $4"
    );
    sqlx::query_as::<_, Album>(&sql)
        .bind(artist_id)
        .bind(genre)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
}

pub async fn count_albums(
    pool: &PgPool,
    artist_id: Option<Uuid>,
    genre: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*)
        FROM albums
        WHERE ($1::uuid IS NULL OR artist_id = $1)
          AND ($2::text IS NULL OR genre = $2)
        "#,
    )
    .bind(artist_id)
    .bind(genre)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

#[derive(Debug, Default)]
pub struct UpdateAlbumParams {
    pub title: Option<String>,
    pub artist_id: Option<Uuid>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub artwork_url: Option<String>,
    pub metadata_json: Option<serde_json::Value>,
    pub manually_edited: Option<bool>,
}

pub async fn update_album(
    pool: &PgPool,
    id: Uuid,
    params: &UpdateAlbumParams,
) -> Result<Option<Album>, sqlx::Error> {
    let sql = format!(
        "UPDATE albums SET \
            title = COALESCE($2, title), \
            artist_id = COALESCE($3, artist_id), \
            year = COALESCE($4, year), \
            genre = COALESCE($5, genre), \
            artwork_url = COALESCE($6, artwork_url), \
            metadata_json = COALESCE($7, metadata_json), \
            manually_edited = COALESCE($8, manually_edited), \
            updated_at = NOW() \
         WHERE id = $1 \
         RETURNING {ALBUM_COLS}"
    );
    sqlx::query_as::<_, Album>(&sql)
        .bind(id)
        .bind(&params.title)
        .bind(params.artist_id)
        .bind(params.year)
        .bind(&params.genre)
        .bind(&params.artwork_url)
        .bind(&params.metadata_json)
        .bind(params.manually_edited)
        .fetch_optional(pool)
        .await
}

// ---------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------

pub async fn create_artist(
    pool: &PgPool,
    id: Uuid,
    name: &str,
    bio: &str,
    image_url: &str,
    metadata_json: Option<serde_json::Value>,
) -> Result<Artist, sqlx::Error> {
    let sql = format!(
        "INSERT INTO artists (id, name, bio, image_url, metadata_json) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING {ARTIST_COLS}"
    );
    sqlx::query_as::<_, Artist>(&sql)
        .bind(id)
        .bind(name)
        .bind(bio)
        .bind(image_url)
        .bind(metadata_json)
        .fetch_one(pool)
        .await
}

pub async fn find_artist_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Artist>, sqlx::Error> {
    let sql = format!("SELECT {ARTIST_COLS} FROM artists WHERE id = $1");
    sqlx::query_as::<_, Artist>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn list_artists(
    pool: &PgPool,
    limit: i64,
    offset: i64,
) -> Result<Vec<Artist>, sqlx::Error> {
    let sql = format!(
        "SELECT {ARTIST_COLS} FROM artists ORDER BY created_at DESC LIMIT $1 OFFSET $2"
    );
    sqlx::query_as::<_, Artist>(&sql)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
}

pub async fn count_artists(pool: &PgPool) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*) FROM artists
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

#[derive(Debug, Default)]
pub struct UpdateArtistParams {
    pub name: Option<String>,
    pub bio: Option<String>,
    pub image_url: Option<String>,
    pub metadata_json: Option<serde_json::Value>,
    pub formed_date: Option<NaiveDate>,
    pub origin_country: Option<String>,
    pub manually_edited: Option<bool>,
}

pub async fn update_artist(
    pool: &PgPool,
    id: Uuid,
    params: &UpdateArtistParams,
) -> Result<Option<Artist>, sqlx::Error> {
    let sql = format!(
        "UPDATE artists SET \
            name = COALESCE($2, name), \
            bio = COALESCE($3, bio), \
            image_url = COALESCE($4, image_url), \
            metadata_json = COALESCE($5, metadata_json), \
            formed_date = COALESCE($6, formed_date), \
            origin_country = COALESCE($7, origin_country), \
            manually_edited = COALESCE($8, manually_edited), \
            updated_at = NOW() \
         WHERE id = $1 \
         RETURNING {ARTIST_COLS}"
    );
    sqlx::query_as::<_, Artist>(&sql)
        .bind(id)
        .bind(&params.name)
        .bind(&params.bio)
        .bind(&params.image_url)
        .bind(&params.metadata_json)
        .bind(params.formed_date)
        .bind(&params.origin_country)
        .bind(params.manually_edited)
        .fetch_optional(pool)
        .await
}
