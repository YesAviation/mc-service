use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Extension, Json, Router};
use music_common::middleware::AuthUser;
use music_proto::catalog::v1::GetTrackRequest;
use music_proto::stream::v1::{GetManifestRequest, GetStreamUrlRequest};
use music_proto::transcoding::v1::HlsRequest;
use serde::Serialize;

use crate::state::AppState;

// --- Response DTOs ---

#[derive(Serialize)]
pub struct StreamUrlResponse {
    pub manifest_url: String,
    pub expires_at: i64,
}

// --- Routes ---

pub fn routes() -> Router<AppState> {
    Router::new().route("/{track_id}", get(get_stream_url))
}

async fn get_stream_url(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(track_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = ensure_hls_available(&state, &track_id).await {
        return grpc_error_to_response(status);
    }

    let request = GetStreamUrlRequest {
        track_id,
        user_id: auth_user.user_id.to_string(),
    };

    let mut client = state.stream_client.lock().await;
    match client.get_stream_url(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let body = StreamUrlResponse {
                manifest_url: resp.manifest_url,
                expires_at: resp.expires_at,
            };
            Json(body).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

// --- Helpers ---

async fn ensure_hls_available(state: &AppState, track_id: &str) -> Result<(), tonic::Status> {
    // Fast path: if the master manifest already exists, no transcoding is needed.
    {
        let mut stream_client = state.stream_client.lock().await;
        if stream_client
            .get_manifest(GetManifestRequest {
                track_id: track_id.to_string(),
                signature: String::new(),
            })
            .await
            .is_ok()
        {
            return Ok(());
        }
    }

    // Manifest missing: fetch track storage file ID and generate HLS on-demand.
    let source_file_id = {
        let mut catalog_client = state.catalog_client.lock().await;
        let track = catalog_client
            .get_track(GetTrackRequest {
                track_id: track_id.to_string(),
            })
            .await?
            .into_inner();

        if track.storage_file_id.is_empty() {
            return Err(tonic::Status::failed_precondition(
                "Track does not have a source storage file",
            ));
        }

        track.storage_file_id
    };

    let mut transcoding_client = state.transcoding_client.lock().await;
    transcoding_client
        .generate_hls(HlsRequest {
            track_id: track_id.to_string(),
            source_file_id,
            // Use a single starter bitrate for fast first playback.
            // Additional variants can be generated later by background jobs/admin flows.
            bitrates: vec![128],
            segment_duration: 0,
        })
        .await?;

    Ok(())
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
