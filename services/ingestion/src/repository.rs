use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Check whether a track with the given file hash already exists.
/// Returns `Some(track_id)` if a duplicate is found, `None` otherwise.
pub async fn find_track_by_file_hash(
    pool: &PgPool,
    file_hash: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(uuid::Uuid,)> = sqlx::query_as(
        r#"
        SELECT id FROM tracks WHERE file_hash = $1 LIMIT 1
        "#,
    )
    .bind(file_hash)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id,)| id.to_string()))
}

/// Find an existing artist by normalized name and return id + image_url.
pub async fn find_artist_by_name(
    pool: &PgPool,
    artist_name: &str,
) -> Result<Option<(String, Option<String>)>, sqlx::Error> {
    let row: Option<(Uuid, Option<String>)> = sqlx::query_as(
        r#"
        SELECT id, image_url
        FROM artists
        WHERE lower(btrim(name)) = lower(btrim($1))
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        "#,
    )
    .bind(artist_name)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id, image_url)| (id.to_string(), image_url)))
}

/// Find an existing album by artist + normalized title and return id + artwork_url.
pub async fn find_album_by_artist_and_title(
    pool: &PgPool,
    artist_id: Uuid,
    album_title: &str,
) -> Result<Option<(String, Option<String>)>, sqlx::Error> {
    let row: Option<(Uuid, Option<String>)> = sqlx::query_as(
        r#"
        SELECT id, artwork_url
        FROM albums
        WHERE artist_id = $1
          AND lower(btrim(title)) = lower(btrim($2))
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        "#,
    )
    .bind(artist_id)
    .bind(album_title)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id, artwork_url)| (id.to_string(), artwork_url)))
}

/// Update enrichment fields for an artist only when they are currently missing.
pub async fn update_artist_enrichment_if_missing(
    pool: &PgPool,
    artist_id: Uuid,
    image_url: Option<&str>,
    metadata_json: Option<Value>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE artists
        SET image_url = CASE
                WHEN (image_url IS NULL OR btrim(image_url) = '')
                     AND COALESCE($2, '') <> ''
                    THEN $2
                ELSE image_url
            END,
            metadata_json = CASE
                WHEN (metadata_json IS NULL OR metadata_json = '{}'::jsonb)
                     AND $3::jsonb IS NOT NULL
                    THEN $3::jsonb
                ELSE metadata_json
            END,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(artist_id)
    .bind(image_url)
    .bind(metadata_json)
    .execute(pool)
    .await?;

    Ok(())
}

/// Update enrichment fields for an album only when they are currently missing.
pub async fn update_album_enrichment_if_missing(
    pool: &PgPool,
    album_id: Uuid,
    artwork_url: Option<&str>,
    metadata_json: Option<Value>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE albums
        SET artwork_url = CASE
                WHEN (artwork_url IS NULL OR btrim(artwork_url) = '')
                     AND COALESCE($2, '') <> ''
                    THEN $2
                ELSE artwork_url
            END,
            metadata_json = CASE
                WHEN (metadata_json IS NULL OR metadata_json = '{}'::jsonb)
                     AND $3::jsonb IS NOT NULL
                    THEN $3::jsonb
                ELSE metadata_json
            END,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(album_id)
    .bind(artwork_url)
    .bind(metadata_json)
    .execute(pool)
    .await?;

    Ok(())
}
