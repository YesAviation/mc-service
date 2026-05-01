//! Persistence for iTunes metadata cache, scan progress, and small KV state.
//!
//! These are infrastructure rows the ingestion service owns directly — the
//! catalog service has no business knowing they exist.

use chrono::{DateTime, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// metadata_cache
// ---------------------------------------------------------------------------

/// Compute a stable cache key from an endpoint + canonical query string.
/// Using SHA-256 hex (64 chars) so the column type stays fixed-width.
pub fn cache_key(endpoint: &str, query: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(endpoint.as_bytes());
    hasher.update(b"|");
    hasher.update(query.trim().to_lowercase().as_bytes());
    hex::encode(hasher.finalize())
}

#[derive(Debug, Clone)]
pub struct CachedMetadata {
    pub response_json: Value,
    #[allow(dead_code)]
    pub fetched_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

pub async fn get_cached(
    pool: &PgPool,
    key: &str,
) -> Result<Option<CachedMetadata>, sqlx::Error> {
    let row: Option<(Value, DateTime<Utc>, Option<DateTime<Utc>>)> = sqlx::query_as(
        r#"
        SELECT response_json, fetched_at, expires_at
        FROM metadata_cache
        WHERE query_hash = $1
        "#,
    )
    .bind(key)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(response_json, fetched_at, expires_at)| CachedMetadata {
        response_json,
        fetched_at,
        expires_at,
    }))
}

pub async fn put_cached(
    pool: &PgPool,
    key: &str,
    endpoint: &str,
    query_text: &str,
    response_json: &Value,
    expires_at: Option<DateTime<Utc>>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO metadata_cache (query_hash, endpoint, query_text, response_json, fetched_at, expires_at)
        VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (query_hash) DO UPDATE SET
            response_json = EXCLUDED.response_json,
            fetched_at = NOW(),
            expires_at = EXCLUDED.expires_at
        "#,
    )
    .bind(key)
    .bind(endpoint)
    .bind(query_text)
    .bind(response_json)
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(())
}

// ---------------------------------------------------------------------------
// metadata_kv (rate-limit pause + future small flags)
// ---------------------------------------------------------------------------

pub async fn get_kv(pool: &PgPool, key: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM metadata_kv WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(v,)| v))
}

pub async fn set_kv(pool: &PgPool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO metadata_kv (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

pub const KEY_ITUNES_PAUSE_UNTIL: &str = "itunes_rate_limit_pause_until";

// ---------------------------------------------------------------------------
// scan_progress
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub id: Uuid,
    pub directory_path: String,
    pub status: String,
    pub total: i32,
    pub processed: i32,
    pub imported: i32,
    pub duplicates: i32,
    pub failed: i32,
    pub errors_json: Value,
    pub started_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

pub async fn create_scan(
    pool: &PgPool,
    id: Uuid,
    directory_path: &str,
    total: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO scan_progress (id, directory_path, status, total)
        VALUES ($1, $2, 'pending', $3)
        "#,
    )
    .bind(id)
    .bind(directory_path)
    .bind(total)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_running(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE scan_progress SET status = 'running', updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn record_progress(
    pool: &PgPool,
    id: Uuid,
    processed: i32,
    imported: i32,
    duplicates: i32,
    failed: i32,
    errors_json: &Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE scan_progress SET
            processed = $2,
            imported = $3,
            duplicates = $4,
            failed = $5,
            errors_json = $6,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(processed)
    .bind(imported)
    .bind(duplicates)
    .bind(failed)
    .bind(errors_json)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_completed(
    pool: &PgPool,
    id: Uuid,
    failed: bool,
) -> Result<(), sqlx::Error> {
    let status = if failed { "failed" } else { "completed" };
    sqlx::query(
        r#"
        UPDATE scan_progress SET
            status = $2,
            updated_at = NOW(),
            completed_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(status)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_scan(pool: &PgPool, id: Uuid) -> Result<Option<ScanProgress>, sqlx::Error> {
    let row: Option<(
        Uuid,
        String,
        String,
        i32,
        i32,
        i32,
        i32,
        i32,
        Value,
        DateTime<Utc>,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
    )> = sqlx::query_as(
        r#"
        SELECT id, directory_path, status, total, processed, imported, duplicates, failed,
               errors_json, started_at, updated_at, completed_at
        FROM scan_progress
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(
            id,
            directory_path,
            status,
            total,
            processed,
            imported,
            duplicates,
            failed,
            errors_json,
            started_at,
            updated_at,
            completed_at,
        )| ScanProgress {
            id,
            directory_path,
            status,
            total,
            processed,
            imported,
            duplicates,
            failed,
            errors_json,
            started_at,
            updated_at,
            completed_at,
        },
    ))
}
