use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::media_processing;
use crate::state::AppState;

// --- Request / Response DTOs ---

#[derive(Deserialize)]
pub struct ScanDirectoryRequest {
    pub directory_path: String,
    #[serde(default)]
    pub recursive: bool,
}

#[derive(Serialize)]
pub struct ScanResponse {
    pub scan_id: String,
    pub status: String,
    pub files_found: i32,
}

#[derive(Deserialize)]
pub struct IngestFileRequest {
    pub file_path: String,
    #[serde(default)]
    pub force_reimport: bool,
}

#[derive(Serialize)]
pub struct IngestResponse {
    pub track_id: String,
    pub status: String,
    pub is_duplicate: bool,
    pub metadata: Option<IngestedMetadataResponse>,
}

#[derive(Serialize)]
pub struct IngestedMetadataResponse {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: i32,
    pub disc_number: i32,
    pub genre: String,
    pub year: i32,
    pub duration_secs: i32,
    pub format: String,
    pub bitrate: i32,
    pub sample_rate: i32,
}

#[derive(Deserialize, Default)]
pub struct IngestScanRequestBody {
    #[serde(default)]
    pub force_reimport: bool,
}

#[derive(Serialize)]
pub struct IngestScanResponse {
    pub scan_id: String,
    pub total: i32,
    pub imported: i32,
    pub duplicates: i32,
    pub failed: i32,
    pub errors: Vec<IngestScanErrorResponse>,
}

#[derive(Serialize)]
pub struct IngestScanErrorResponse {
    pub file_path: String,
    pub error: String,
}

// --- Routes ---

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/scan", post(scan_directory))
        .route("/scan/{scan_id}", post(ingest_scan))
        .route("/file", post(ingest_file))
}

async fn scan_directory(
    State(state): State<AppState>,
    Json(body): Json<ScanDirectoryRequest>,
) -> impl IntoResponse {
    let request = music_proto::ingestion::v1::ScanRequest {
        directory_path: body.directory_path,
        recursive: body.recursive,
    };

    let mut client = state.ingestion_client.lock().await;
    match client.scan_directory(request).await {
        Ok(response) => {
            let resp = response.into_inner();

            if resp.status.eq_ignore_ascii_case("completed") {
                media_processing::spawn_scan_completion_prewarm(
                    state.clone(),
                    resp.scan_id.clone(),
                );
            }

            let body = ScanResponse {
                scan_id: resp.scan_id,
                status: resp.status,
                files_found: resp.files_found,
            };
            (StatusCode::ACCEPTED, Json(body)).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn ingest_file(
    State(state): State<AppState>,
    Json(body): Json<IngestFileRequest>,
) -> impl IntoResponse {
    let request = music_proto::ingestion::v1::IngestFileRequest {
        file_path: body.file_path,
        force_reimport: body.force_reimport,
    };

    let mut client = state.ingestion_client.lock().await;
    match client.ingest_file(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let body = IngestResponse {
                track_id: resp.track_id,
                status: resp.status,
                is_duplicate: resp.is_duplicate,
                metadata: resp.metadata.map(map_metadata),
            };
            (StatusCode::CREATED, Json(body)).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn ingest_scan(
    State(state): State<AppState>,
    Path(scan_id): Path<String>,
    body: Option<Json<IngestScanRequestBody>>,
) -> impl IntoResponse {
    let body = body.map(|Json(b)| b).unwrap_or_default();

    let request = music_proto::ingestion::v1::IngestScanRequest {
        scan_id,
        force_reimport: body.force_reimport,
    };

    let mut client = state.ingestion_client.lock().await;
    match client.ingest_scan(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let body = IngestScanResponse {
                scan_id: resp.scan_id,
                total: resp.total,
                imported: resp.imported,
                duplicates: resp.duplicates,
                failed: resp.failed,
                errors: resp
                    .errors
                    .into_iter()
                    .map(|e| IngestScanErrorResponse {
                        file_path: e.file_path,
                        error: e.error,
                    })
                    .collect(),
            };
            Json(body).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

// --- Helpers ---

fn map_metadata(
    m: music_proto::ingestion::v1::IngestedMetadata,
) -> IngestedMetadataResponse {
    IngestedMetadataResponse {
        title: m.title,
        artist: m.artist,
        album: m.album,
        track_number: m.track_number,
        disc_number: m.disc_number,
        genre: m.genre,
        year: m.year,
        duration_secs: m.duration_secs,
        format: m.format,
        bitrate: m.bitrate,
        sample_rate: m.sample_rate,
    }
}

fn grpc_error_to_response(status: tonic::Status) -> axum::response::Response {
    let http_status = match status.code() {
        tonic::Code::NotFound => StatusCode::NOT_FOUND,
        tonic::Code::InvalidArgument => StatusCode::BAD_REQUEST,
        tonic::Code::AlreadyExists => StatusCode::CONFLICT,
        tonic::Code::Unauthenticated => StatusCode::UNAUTHORIZED,
        tonic::Code::PermissionDenied => StatusCode::FORBIDDEN,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };

    let body = serde_json::json!({
        "error": {
            "code": http_status.as_u16(),
            "message": status.message(),
        }
    });

    (http_status, Json(body)).into_response()
}
