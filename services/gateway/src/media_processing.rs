use music_common::config::AppConfig;
use music_proto::catalog::v1::{ListTracksRequest, Track};
use music_proto::common::v1::PaginationRequest;
use music_proto::stream::v1::GetManifestRequest;
use music_proto::transcoding::v1::{HlsRequest, TranscodeRequest};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tonic::Code;
use uuid::Uuid;

use crate::state::AppState;

const SETTINGS_ROW_ID: i16 = 1;
const TRACK_PAGE_SIZE: i32 = 200;
const TARGET_TRANSCODE_FORMAT: &str = "aac";

#[derive(Debug, Clone, Serialize)]
pub struct MediaProcessingSettings {
    pub auto_prewarm_on_scan_complete: bool,
    pub pretranscode_enabled: bool,
    pub prehls_enabled: bool,
    pub prewarm_bitrates: Vec<i32>,
    pub hls_segment_duration_secs: i32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MediaProcessingSettingsPatch {
    pub auto_prewarm_on_scan_complete: Option<bool>,
    pub pretranscode_enabled: Option<bool>,
    pub prehls_enabled: Option<bool>,
    pub prewarm_bitrates: Option<Vec<i32>>,
    pub hls_segment_duration_secs: Option<i32>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct MediaProcessingSettingsRow {
    auto_prewarm_on_scan_complete: bool,
    pretranscode_enabled: bool,
    prehls_enabled: bool,
    prewarm_bitrates: Vec<i32>,
    hls_segment_duration_secs: i32,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Default)]
struct PrewarmSummary {
    tracks_seen: usize,
    tracks_skipped_no_storage: usize,
    transcode_jobs_started: usize,
    transcode_jobs_skipped_cached: usize,
    transcode_errors: usize,
    hls_jobs_started: usize,
    hls_jobs_skipped_cached: usize,
    hls_errors: usize,
}

pub async fn get_media_processing_settings(
    pool: &PgPool,
    config: &AppConfig,
) -> Result<MediaProcessingSettings, sqlx::Error> {
    let row = get_media_processing_settings_row(pool, config).await?;
    Ok(map_settings_row(row))
}

pub async fn update_media_processing_settings(
    pool: &PgPool,
    config: &AppConfig,
    patch: MediaProcessingSettingsPatch,
    updated_by: Uuid,
) -> Result<MediaProcessingSettings, sqlx::Error> {
    let current = get_media_processing_settings_row(pool, config).await?;

    let next_auto_prewarm = patch
        .auto_prewarm_on_scan_complete
        .unwrap_or(current.auto_prewarm_on_scan_complete);
    let next_pretranscode = patch
        .pretranscode_enabled
        .unwrap_or(current.pretranscode_enabled);
    let next_prehls = patch.prehls_enabled.unwrap_or(current.prehls_enabled);

    let next_bitrates = patch
        .prewarm_bitrates
        .as_ref()
        .map(|values| normalize_bitrates(values, &default_bitrates(config)))
        .unwrap_or_else(|| current.prewarm_bitrates.clone());

    let next_segment_duration = patch
        .hls_segment_duration_secs
        .map(|value| value.max(1))
        .unwrap_or(current.hls_segment_duration_secs.max(1));

    let row = sqlx::query_as::<_, MediaProcessingSettingsRow>(
        r#"
        UPDATE media_processing_settings
        SET auto_prewarm_on_scan_complete = $2,
            pretranscode_enabled = $3,
            prehls_enabled = $4,
            prewarm_bitrates = $5,
            hls_segment_duration_secs = $6,
            updated_by = $7,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
            auto_prewarm_on_scan_complete,
            pretranscode_enabled,
            prehls_enabled,
            prewarm_bitrates,
            hls_segment_duration_secs,
            updated_at
        "#,
    )
    .bind(SETTINGS_ROW_ID)
    .bind(next_auto_prewarm)
    .bind(next_pretranscode)
    .bind(next_prehls)
    .bind(next_bitrates)
    .bind(next_segment_duration)
    .bind(updated_by)
    .fetch_one(pool)
    .await?;

    Ok(map_settings_row(row))
}

pub fn spawn_scan_completion_prewarm(state: AppState, scan_id: String) {
    tokio::spawn(async move {
        match get_media_processing_settings_row(&state.db_pool, &state.config).await {
            Ok(settings) => {
                if !settings.auto_prewarm_on_scan_complete {
                    tracing::info!(scan_id = %scan_id, "Skipping media prewarm because auto prewarm is disabled");
                    return;
                }

                if let Err(error) = run_prewarm_for_library(&state, &settings, &format!("scan:{scan_id}")).await {
                    tracing::error!(scan_id = %scan_id, error = %error, "Media prewarm failed after scan completion");
                }
            }
            Err(error) => {
                tracing::error!(scan_id = %scan_id, error = %error, "Failed to load media processing settings for scan prewarm");
            }
        }
    });
}

pub fn spawn_manual_prewarm(state: AppState, source: String) {
    tokio::spawn(async move {
        match get_media_processing_settings_row(&state.db_pool, &state.config).await {
            Ok(settings) => {
                if let Err(error) = run_prewarm_for_library(&state, &settings, &source).await {
                    tracing::error!(source = %source, error = %error, "Manual media prewarm failed");
                }
            }
            Err(error) => {
                tracing::error!(source = %source, error = %error, "Failed to load media processing settings for manual prewarm");
            }
        }
    });
}

async fn run_prewarm_for_library(
    state: &AppState,
    settings: &MediaProcessingSettingsRow,
    source: &str,
) -> Result<(), anyhow::Error> {
    if !settings.pretranscode_enabled && !settings.prehls_enabled {
        tracing::info!(source = %source, "Skipping media prewarm because all prewarm actions are disabled");
        return Ok(());
    }

    let tracks = list_all_tracks(state).await?;
    let mut summary = PrewarmSummary::default();

    for track in tracks {
        summary.tracks_seen += 1;

        if track.storage_file_id.trim().is_empty() {
            summary.tracks_skipped_no_storage += 1;
            continue;
        }

        if settings.pretranscode_enabled {
            for bitrate_kbps in &settings.prewarm_bitrates {
                let bitrate_bps = bitrate_kbps.saturating_mul(1000);
                if has_cached_transcode_job(&state.db_pool, &track.id, TARGET_TRANSCODE_FORMAT, bitrate_bps)
                    .await?
                {
                    summary.transcode_jobs_skipped_cached += 1;
                    continue;
                }

                let response = {
                    let mut client = state.transcoding_client.lock().await;
                    client
                        .transcode_track(TranscodeRequest {
                            track_id: track.id.clone(),
                            source_file_id: track.storage_file_id.clone(),
                            target_format: TARGET_TRANSCODE_FORMAT.to_string(),
                            target_bitrate: bitrate_bps,
                        })
                        .await
                };

                match response {
                    Ok(_) => {
                        summary.transcode_jobs_started += 1;
                    }
                    Err(status) => {
                        summary.transcode_errors += 1;
                        tracing::warn!(
                            source = %source,
                            track_id = %track.id,
                            bitrate_kbps = *bitrate_kbps,
                            error = %status,
                            "Failed to queue transcode prewarm job"
                        );
                    }
                }
            }
        }

        if settings.prehls_enabled {
            if hls_manifest_exists(state, &track.id).await? {
                summary.hls_jobs_skipped_cached += 1;
                continue;
            }

            let response = {
                let mut client = state.transcoding_client.lock().await;
                client
                    .generate_hls(HlsRequest {
                        track_id: track.id.clone(),
                        source_file_id: track.storage_file_id.clone(),
                        bitrates: settings.prewarm_bitrates.clone(),
                        segment_duration: settings.hls_segment_duration_secs,
                    })
                    .await
            };

            match response {
                Ok(_) => {
                    summary.hls_jobs_started += 1;
                }
                Err(status) => {
                    summary.hls_errors += 1;
                    tracing::warn!(
                        source = %source,
                        track_id = %track.id,
                        error = %status,
                        "Failed to queue HLS prewarm job"
                    );
                }
            }
        }
    }

    tracing::info!(
        source = %source,
        tracks_seen = summary.tracks_seen,
        tracks_skipped_no_storage = summary.tracks_skipped_no_storage,
        transcode_jobs_started = summary.transcode_jobs_started,
        transcode_jobs_skipped_cached = summary.transcode_jobs_skipped_cached,
        transcode_errors = summary.transcode_errors,
        hls_jobs_started = summary.hls_jobs_started,
        hls_jobs_skipped_cached = summary.hls_jobs_skipped_cached,
        hls_errors = summary.hls_errors,
        "Media prewarm job finished"
    );

    Ok(())
}

async fn list_all_tracks(state: &AppState) -> Result<Vec<Track>, tonic::Status> {
    let mut all_tracks = Vec::new();
    let mut page = 1;
    let mut total_pages = 1;

    while page <= total_pages {
        let response = {
            let mut client = state.catalog_client.lock().await;
            client
                .list_tracks(ListTracksRequest {
                    pagination: Some(PaginationRequest {
                        page,
                        page_size: TRACK_PAGE_SIZE,
                    }),
                    artist_id: None,
                    album_id: None,
                    genre: None,
                })
                .await?
                .into_inner()
        };

        total_pages = response
            .pagination
            .as_ref()
            .map(|p| p.total_pages.max(1))
            .unwrap_or(1);

        all_tracks.extend(response.tracks);
        page += 1;
    }

    Ok(all_tracks)
}

async fn hls_manifest_exists(state: &AppState, track_id: &str) -> Result<bool, anyhow::Error> {
    let result = {
        let mut client = state.stream_client.lock().await;
        client
            .get_manifest(GetManifestRequest {
                track_id: track_id.to_string(),
                signature: String::new(),
            })
            .await
    };

    match result {
        Ok(_) => Ok(true),
        Err(status) if status.code() == Code::NotFound => Ok(false),
        Err(status) => Err(anyhow::anyhow!(status.to_string())),
    }
}

async fn has_cached_transcode_job(
    pool: &PgPool,
    track_id: &str,
    target_format: &str,
    target_bitrate: i32,
) -> Result<bool, sqlx::Error> {
    let parsed_track_id = match Uuid::parse_str(track_id) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };

    let (exists,): (bool,) = sqlx::query_as(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM transcoding_jobs
            WHERE track_id = $1
              AND format = $2
              AND bitrate = $3
              AND status::text IN ('pending', 'processing', 'completed')
        )
        "#,
    )
    .bind(parsed_track_id)
    .bind(target_format)
    .bind(target_bitrate)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

async fn get_media_processing_settings_row(
    pool: &PgPool,
    config: &AppConfig,
) -> Result<MediaProcessingSettingsRow, sqlx::Error> {
    ensure_media_processing_settings(pool, config).await?;

    sqlx::query_as::<_, MediaProcessingSettingsRow>(
        r#"
        SELECT
            auto_prewarm_on_scan_complete,
            pretranscode_enabled,
            prehls_enabled,
            prewarm_bitrates,
            hls_segment_duration_secs,
            updated_at
        FROM media_processing_settings
        WHERE id = $1
        "#,
    )
    .bind(SETTINGS_ROW_ID)
    .fetch_one(pool)
    .await
}

async fn ensure_media_processing_settings(pool: &PgPool, config: &AppConfig) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO media_processing_settings (
            id,
            auto_prewarm_on_scan_complete,
            pretranscode_enabled,
            prehls_enabled,
            prewarm_bitrates,
            hls_segment_duration_secs
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(SETTINGS_ROW_ID)
    .bind(true)
    .bind(true)
    .bind(true)
    .bind(default_bitrates(config))
    .bind(default_segment_duration(config))
    .execute(pool)
    .await?;

    Ok(())
}

fn map_settings_row(row: MediaProcessingSettingsRow) -> MediaProcessingSettings {
    MediaProcessingSettings {
        auto_prewarm_on_scan_complete: row.auto_prewarm_on_scan_complete,
        pretranscode_enabled: row.pretranscode_enabled,
        prehls_enabled: row.prehls_enabled,
        prewarm_bitrates: row.prewarm_bitrates,
        hls_segment_duration_secs: row.hls_segment_duration_secs,
        updated_at: row.updated_at.to_rfc3339(),
    }
}

fn default_bitrates(config: &AppConfig) -> Vec<i32> {
    let from_config: Vec<i32> = config
        .transcoding
        .bitrates
        .iter()
        .map(|value| *value as i32)
        .collect();

    normalize_bitrates(&from_config, &[128])
}

fn default_segment_duration(config: &AppConfig) -> i32 {
    (config.transcoding.hls_segment_duration as i32).max(1)
}

fn normalize_bitrates(values: &[i32], fallback: &[i32]) -> Vec<i32> {
    let mut cleaned = values
        .iter()
        .copied()
        .filter(|value| *value >= 32 && *value <= 4000)
        .collect::<Vec<_>>();

    cleaned.sort_unstable();
    cleaned.dedup();

    if cleaned.is_empty() {
        return fallback.to_vec();
    }

    cleaned
}
