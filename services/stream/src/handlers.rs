use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sqlx::PgPool;
use uuid::Uuid;

use music_common::storage::StorageBackend;

use crate::repository;

type HmacSha256 = Hmac<Sha256>;

/// Shared state for the HTTP streaming server.
///
/// `mac_template` is built once at startup from the signing secret; each
/// handler clones it before calling `.update(...)`, avoiding a per-request
/// panic surface when the secret is misconfigured.
#[derive(Clone)]
pub struct StreamHttpState {
    pub pool: PgPool,
    pub storage: Arc<dyn StorageBackend>,
    pub mac_template: HmacSha256,
}

impl StreamHttpState {
    pub fn new(
        pool: PgPool,
        storage: Arc<dyn StorageBackend>,
        signing_secret: &str,
    ) -> Result<Self, anyhow::Error> {
        let mac_template = HmacSha256::new_from_slice(signing_secret.as_bytes())
            .map_err(|e| anyhow::anyhow!("invalid HMAC key for stream signing: {e}"))?;
        Ok(Self {
            pool,
            storage,
            mac_template,
        })
    }
}

/// Query parameters for signed URL validation.
#[derive(serde::Deserialize)]
pub struct SignedParams {
    pub expires: i64,
    pub sig: String,
}

/// Query parameters for optional signed URL validation.
#[derive(serde::Deserialize)]
pub struct MaybeSignedParams {
    pub expires: Option<i64>,
    pub sig: Option<String>,
}

// ---------------------------------------------------------------------------
// Signature helpers
// ---------------------------------------------------------------------------

/// Validate a signed URL by checking HMAC-SHA256 and expiration.
fn validate_signature(
    mac_template: &HmacSha256,
    track_id: &str,
    params: &SignedParams,
) -> Result<(), (StatusCode, &'static str)> {
    // Check expiration.
    let now = chrono::Utc::now().timestamp();
    if params.expires <= now {
        return Err((StatusCode::FORBIDDEN, "Signed URL has expired"));
    }

    // Compute expected signature by cloning the prebuilt keyed MAC.
    let message = format!("{track_id}:{}", params.expires);
    let mut mac = mac_template.clone();
    mac.update(message.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    if expected != params.sig {
        return Err((StatusCode::FORBIDDEN, "Invalid signature"));
    }

    Ok(())
}

/// Generate a signed query string for a given track_id and expiration.
fn sign_path(mac_template: &HmacSha256, track_id: &str, expires: i64) -> String {
    let message = format!("{track_id}:{expires}");
    let mut mac = mac_template.clone();
    mac.update(message.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    format!("expires={expires}&sig={sig}")
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /stream/{track_id}/master.m3u8?expires=X&sig=Y
///
/// Fetches the master playlist from storage, rewrites variant playlist URLs
/// to include signed query parameters, and returns it.
pub async fn master_manifest(
    State(state): State<StreamHttpState>,
    Path(track_id): Path<String>,
    Query(params): Query<SignedParams>,
) -> Response {
    if let Err((status, msg)) = validate_signature(&state.mac_template, &track_id, &params) {
        return (status, msg).into_response();
    }

    let storage_path = format!("hls/{track_id}/master.m3u8");
    let data = match state.storage.retrieve(&storage_path).await {
        Ok(d) => d,
        Err(e) => {
            tracing::error!(error = %e, %track_id, "Failed to retrieve master manifest");
            return (StatusCode::NOT_FOUND, "Master manifest not found").into_response();
        }
    };

    let manifest = match String::from_utf8(data) {
        Ok(s) => s,
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid manifest encoding")
                .into_response()
        }
    };

    // Rewrite variant playlist references so the player can follow signed URLs.
    // Lines that reference a bitrate playlist look like: `128/playlist.m3u8`
    let rewritten =
        rewrite_master_manifest(&manifest, &track_id, &state.mac_template, params.expires);

    (
        [(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")],
        rewritten,
    )
        .into_response()
}

/// GET /stream/{track_id}/{bitrate}/playlist.m3u8?expires=X&sig=Y
///
/// Fetches the variant playlist from storage, rewrites segment URLs to
/// include signed query parameters, and returns it.
pub async fn variant_manifest(
    State(state): State<StreamHttpState>,
    Path((track_id, bitrate)): Path<(String, String)>,
    Query(params): Query<SignedParams>,
) -> Response {
    if let Err((status, msg)) = validate_signature(&state.mac_template, &track_id, &params) {
        return (status, msg).into_response();
    }

    let storage_path = format!("hls/{track_id}/{bitrate}/playlist.m3u8");
    let data = match state.storage.retrieve(&storage_path).await {
        Ok(d) => d,
        Err(e) => {
            tracing::error!(error = %e, %track_id, %bitrate, "Failed to retrieve variant manifest");
            return (StatusCode::NOT_FOUND, "Variant manifest not found").into_response();
        }
    };

    let manifest = match String::from_utf8(data) {
        Ok(s) => s,
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid manifest encoding")
                .into_response()
        }
    };

    // Rewrite segment references (e.g. `segment_000.ts`) to be signed.
    let rewritten = rewrite_variant_manifest(
        &manifest,
        &track_id,
        &bitrate,
        &state.mac_template,
        params.expires,
    );

    (
        [(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")],
        rewritten,
    )
        .into_response()
}

/// GET /stream/{track_id}/{bitrate}/{segment}.ts?expires=X&sig=Y
///
/// Validates the signature, fetches the TS segment from storage, and
/// returns it with the appropriate MPEG-TS content type.
pub async fn segment(
    State(state): State<StreamHttpState>,
    Path((track_id, bitrate, segment)): Path<(String, String, String)>,
    Query(params): Query<SignedParams>,
) -> Response {
    if let Err((status, msg)) = validate_signature(&state.mac_template, &track_id, &params) {
        return (status, msg).into_response();
    }

    let storage_path = format!("hls/{track_id}/{bitrate}/{segment}");
    let data = match state.storage.retrieve(&storage_path).await {
        Ok(d) => d,
        Err(e) => {
            tracing::error!(error = %e, %track_id, %bitrate, %segment, "Failed to retrieve segment");
            return (StatusCode::NOT_FOUND, "Segment not found").into_response();
        }
    };

    ([(header::CONTENT_TYPE, "video/mp2t")], data).into_response()
}

/// GET /stream/files/{file_id}[?expires=X&sig=Y]
///
/// Serves arbitrary stored files (for example, extracted artwork). Signature
/// validation is optional; if query params are present they must be valid.
pub async fn file_asset(
    State(state): State<StreamHttpState>,
    Path(file_id): Path<String>,
    Query(params): Query<MaybeSignedParams>,
) -> Response {
    if let (Some(expires), Some(sig)) = (params.expires, params.sig.as_deref()) {
        let signed = SignedParams {
            expires,
            sig: sig.to_string(),
        };
        if let Err((status, msg)) = validate_signature(&state.mac_template, &file_id, &signed) {
            return (status, msg).into_response();
        }
    }

    let parsed_file_id = match Uuid::parse_str(&file_id) {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid file id").into_response(),
    };

    let file = match repository::find_storage_file_by_id(&state.pool, parsed_file_id).await {
        Ok(Some(file)) => file,
        Ok(None) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
        Err(error) => {
            tracing::error!(%error, %file_id, "Failed to query storage file record");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response();
        }
    };

    let data = match state.storage.retrieve(&file.storage_path).await {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::error!(%error, %file_id, path = %file.storage_path, "Failed to retrieve file bytes from storage");
            return (StatusCode::NOT_FOUND, "File content not found").into_response();
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&file.content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );

    (headers, data).into_response()
}

// ---------------------------------------------------------------------------
// Manifest rewriting
// ---------------------------------------------------------------------------

/// Rewrite a master manifest so that variant playlist references become
/// signed URLs that resolve relative to the manifest's URL.
///
/// Example input line:  `128/playlist.m3u8`
/// Example output line: `128/playlist.m3u8?expires=X&sig=Y`
///
/// The relative form lets the same manifest serve correctly whether fetched
/// directly from the stream service or proxied through the gateway.
fn rewrite_master_manifest(
    manifest: &str,
    track_id: &str,
    mac_template: &HmacSha256,
    expires: i64,
) -> String {
    let qs = sign_path(mac_template, track_id, expires);
    let mut output = String::with_capacity(manifest.len() * 2);

    for line in manifest.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() && !trimmed.starts_with('#') {
            output.push_str(&format!("{trimmed}?{qs}"));
        } else {
            output.push_str(line);
        }
        output.push('\n');
    }

    output
}

/// Rewrite a variant playlist so segment references carry a signed query
/// string while staying relative to the playlist URL.
fn rewrite_variant_manifest(
    manifest: &str,
    track_id: &str,
    _bitrate: &str,
    mac_template: &HmacSha256,
    expires: i64,
) -> String {
    let qs = sign_path(mac_template, track_id, expires);
    let mut output = String::with_capacity(manifest.len() * 2);

    for line in manifest.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() && !trimmed.starts_with('#') {
            output.push_str(&format!("{trimmed}?{qs}"));
        } else {
            output.push_str(line);
        }
        output.push('\n');
    }

    output
}
