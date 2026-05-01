use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{CreateStorageFileParams, StorageBackendType, StorageFile};

/// Insert a new file record into storage_files. Returns the full row.
pub async fn create_file(
    pool: &PgPool,
    params: &CreateStorageFileParams,
) -> Result<StorageFile, sqlx::Error> {
    let file = sqlx::query_as::<_, StorageFile>(
        r#"
        INSERT INTO storage_files (id, original_filename, content_type, size_bytes, storage_backend, storage_path, checksum)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, original_filename, content_type, size_bytes, storage_backend, storage_path, checksum, created_at, updated_at
        "#,
    )
    .bind(params.id)
    .bind(&params.original_filename)
    .bind(&params.content_type)
    .bind(params.size_bytes)
    .bind(&params.storage_backend)
    .bind(&params.storage_path)
    .bind(&params.checksum)
    .fetch_one(pool)
    .await?;

    Ok(file)
}

/// Look up a storage file by its ID.
pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<StorageFile>, sqlx::Error> {
    let file = sqlx::query_as::<_, StorageFile>(
        r#"
        SELECT id, original_filename, content_type, size_bytes, storage_backend, storage_path, checksum, created_at, updated_at
        FROM storage_files
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(file)
}

/// Delete a storage file record by ID. Returns true if a row was actually deleted.
pub async fn delete_by_id(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM storage_files WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

/// List storage files with pagination and optional backend filter.
pub async fn list_files(
    pool: &PgPool,
    backend: Option<&StorageBackendType>,
    page: i32,
    page_size: i32,
) -> Result<(Vec<StorageFile>, i64), sqlx::Error> {
    let offset = (page - 1).max(0) as i64 * page_size as i64;
    let limit = page_size as i64;

    let (files, total): (Vec<StorageFile>, i64) = if let Some(backend) = backend {
        let total: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM storage_files WHERE storage_backend = $1",
        )
        .bind(backend)
        .fetch_one(pool)
        .await?;

        let files = sqlx::query_as::<_, StorageFile>(
            r#"
            SELECT id, original_filename, content_type, size_bytes, storage_backend, storage_path, checksum, created_at, updated_at
            FROM storage_files
            WHERE storage_backend = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(backend)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        (files, total.0)
    } else {
        let total: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM storage_files")
                .fetch_one(pool)
                .await?;

        let files = sqlx::query_as::<_, StorageFile>(
            r#"
            SELECT id, original_filename, content_type, size_bytes, storage_backend, storage_path, checksum, created_at, updated_at
            FROM storage_files
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        (files, total.0)
    };

    Ok((files, total))
}
