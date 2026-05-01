use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{CreateTranscodingJobParams, TranscodingJob, TranscodingStatus};

/// Insert a new transcoding job record. Returns the full row.
pub async fn create_job(
    pool: &PgPool,
    params: &CreateTranscodingJobParams,
) -> Result<TranscodingJob, sqlx::Error> {
    let job = sqlx::query_as::<_, TranscodingJob>(
        r#"
        INSERT INTO transcoding_jobs (id, track_id, status, bitrate, format, output_path)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, track_id, status, bitrate, format, output_path, error_message, progress, created_at, completed_at
        "#,
    )
    .bind(params.id)
    .bind(params.track_id)
    .bind(TranscodingStatus::Pending)
    .bind(params.bitrate)
    .bind(&params.format)
    .bind(&params.output_path)
    .fetch_one(pool)
    .await?;

    Ok(job)
}

/// Look up a transcoding job by its ID.
pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<TranscodingJob>, sqlx::Error> {
    let job = sqlx::query_as::<_, TranscodingJob>(
        r#"
        SELECT id, track_id, status, bitrate, format, output_path, error_message, progress, created_at, completed_at
        FROM transcoding_jobs
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(job)
}

/// Update the status of a transcoding job.
pub async fn update_status(
    pool: &PgPool,
    id: Uuid,
    status: &TranscodingStatus,
    error_message: Option<&str>,
) -> Result<Option<TranscodingJob>, sqlx::Error> {
    let job = sqlx::query_as::<_, TranscodingJob>(
        r#"
        UPDATE transcoding_jobs
        SET status = $2,
            error_message = $3,
            progress = CASE
                WHEN $2 = 'completed'::transcoding_status THEN 100.0
                WHEN $2 = 'processing'::transcoding_status THEN 50.0
                WHEN $2 = 'pending'::transcoding_status THEN 0.0
                WHEN $2 = 'failed'::transcoding_status THEN 0.0
                WHEN $2 = 'cancelled'::transcoding_status THEN 0.0
                ELSE progress
            END,
            completed_at = CASE
                WHEN $2 = 'completed'::transcoding_status
                  OR $2 = 'failed'::transcoding_status
                  OR $2 = 'cancelled'::transcoding_status THEN NOW()
                ELSE NULL
            END
        WHERE id = $1
        RETURNING id, track_id, status, bitrate, format, output_path, error_message, progress, created_at, completed_at
        "#,
    )
    .bind(id)
    .bind(status)
    .bind(error_message)
    .fetch_optional(pool)
    .await?;

    Ok(job)
}

/// List transcoding jobs with pagination and optional status filter.
pub async fn list_jobs(
    pool: &PgPool,
    status_filter: Option<&TranscodingStatus>,
    page: i32,
    page_size: i32,
) -> Result<(Vec<TranscodingJob>, i64), sqlx::Error> {
    let offset = (page - 1).max(0) as i64 * page_size as i64;
    let limit = page_size as i64;

    let (jobs, total): (Vec<TranscodingJob>, i64) = if let Some(status) = status_filter {
        let total: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM transcoding_jobs WHERE status = $1",
        )
        .bind(status)
        .fetch_one(pool)
        .await?;

        let jobs = sqlx::query_as::<_, TranscodingJob>(
            r#"
            SELECT id, track_id, status, bitrate, format, output_path, error_message, progress, created_at, completed_at
            FROM transcoding_jobs
            WHERE status = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        (jobs, total.0)
    } else {
        let total: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM transcoding_jobs")
                .fetch_one(pool)
                .await?;

        let jobs = sqlx::query_as::<_, TranscodingJob>(
            r#"
            SELECT id, track_id, status, bitrate, format, output_path, error_message, progress, created_at, completed_at
            FROM transcoding_jobs
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        (jobs, total.0)
    };

    Ok((jobs, total))
}
