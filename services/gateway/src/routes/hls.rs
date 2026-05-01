//! Public HLS proxy.
//!
//! Forwards requests under `/api/hls/{track_id}/...` to the internal stream
//! service's HTTP server. The signed query string travels through unchanged so
//! the stream service still validates each request.
//!
//! No auth middleware is applied here — the HMAC signature on each URL is the
//! authorization mechanism. The signed URL was originally minted by an
//! authenticated call to `GET /api/stream/{track_id}`.
use axum::body::Body;
use axum::extract::{Path, RawQuery, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;

use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/{track_id}/master.m3u8", get(proxy_master))
        .route(
            "/{track_id}/{bitrate}/playlist.m3u8",
            get(proxy_variant),
        )
        .route("/{track_id}/{bitrate}/{segment}", get(proxy_segment))
}

async fn proxy_master(
    State(state): State<AppState>,
    Path(track_id): Path<String>,
    RawQuery(query): RawQuery,
) -> Response {
    let path = format!("/stream/{track_id}/master.m3u8");
    forward(&state, &path, query.as_deref()).await
}

async fn proxy_variant(
    State(state): State<AppState>,
    Path((track_id, bitrate)): Path<(String, String)>,
    RawQuery(query): RawQuery,
) -> Response {
    let path = format!("/stream/{track_id}/{bitrate}/playlist.m3u8");
    forward(&state, &path, query.as_deref()).await
}

async fn proxy_segment(
    State(state): State<AppState>,
    Path((track_id, bitrate, segment)): Path<(String, String, String)>,
    RawQuery(query): RawQuery,
) -> Response {
    let path = format!("/stream/{track_id}/{bitrate}/{segment}");
    forward(&state, &path, query.as_deref()).await
}

async fn forward(state: &AppState, path: &str, query: Option<&str>) -> Response {
    let base = state.stream_http_base.trim_end_matches('/');
    let url = match query {
        Some(q) if !q.is_empty() => format!("{base}{path}?{q}"),
        _ => format!("{base}{path}"),
    };

    let upstream = match state.http_client.get(&url).send().await {
        Ok(r) => r,
        Err(error) => {
            tracing::warn!(%error, %url, "HLS proxy upstream request failed");
            return (StatusCode::BAD_GATEWAY, "Upstream unreachable").into_response();
        }
    };

    let status = StatusCode::from_u16(upstream.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_owned());

    let cache_control = upstream
        .headers()
        .get(reqwest::header::CACHE_CONTROL)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_owned());

    let stream = upstream.bytes_stream();
    let body = Body::from_stream(stream);

    let mut response = Response::builder().status(status);
    let headers = response.headers_mut().expect("builder headers");
    if let Some(ct) = content_type.as_deref() {
        if let Ok(v) = HeaderValue::from_str(ct) {
            headers.insert(header::CONTENT_TYPE, v);
        }
    }
    if let Some(cc) = cache_control.as_deref() {
        if let Ok(v) = HeaderValue::from_str(cc) {
            headers.insert(header::CACHE_CONTROL, v);
        }
    }

    match response.body(body) {
        Ok(r) => r,
        Err(error) => {
            tracing::error!(%error, "Failed to assemble HLS proxy response");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
