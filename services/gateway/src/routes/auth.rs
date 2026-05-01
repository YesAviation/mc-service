use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::admin_control;
use crate::state::AppState;

// --- Request / Response DTOs ---

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub remember_me: bool,
}

#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub user: Option<UserResponse>,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: String,
    pub is_active: bool,
    pub avatar_url: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// --- Routes ---

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/refresh", post(refresh_token))
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> impl IntoResponse {
    match admin_control::is_user_registration_open(&state.db_pool).await {
        Ok(false) => {
            let body = serde_json::json!({
                "error": {
                    "code": 403,
                    "message": "Registration is disabled by server policy",
                }
            });

            return (StatusCode::FORBIDDEN, Json(body)).into_response();
        }
        Ok(true) => {}
        Err(error) => {
            tracing::error!(error = %error, "Failed to evaluate registration policy");
            let body = serde_json::json!({
                "error": {
                    "code": 500,
                    "message": "Internal server error",
                }
            });

            return (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response();
        }
    }

    let request = music_proto::auth::v1::RegisterRequest {
        username: body.username,
        email: body.email,
        password: body.password,
    };

    let mut client = state.auth_client.lock().await;
    match client.register(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let auth_resp = AuthResponse {
                access_token: resp.access_token,
                refresh_token: resp.refresh_token,
                expires_in: resp.expires_in,
                user: resp.user.map(map_user),
            };
            (StatusCode::CREATED, Json(auth_resp)).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> impl IntoResponse {
    let request = music_proto::auth::v1::LoginRequest {
        username: body.username,
        password: body.password,
        remember_me: body.remember_me,
    };

    let mut client = state.auth_client.lock().await;
    match client.login(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let auth_resp = AuthResponse {
                access_token: resp.access_token,
                refresh_token: resp.refresh_token,
                expires_in: resp.expires_in,
                user: resp.user.map(map_user),
            };
            Json(auth_resp).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn refresh_token(
    State(state): State<AppState>,
    Json(body): Json<RefreshRequest>,
) -> impl IntoResponse {
    let request = music_proto::auth::v1::RefreshTokenRequest {
        refresh_token: body.refresh_token,
    };

    let mut client = state.auth_client.lock().await;
    match client.refresh_token(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let auth_resp = AuthResponse {
                access_token: resp.access_token,
                refresh_token: resp.refresh_token,
                expires_in: resp.expires_in,
                user: resp.user.map(map_user),
            };
            Json(auth_resp).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

// --- Helpers ---

fn map_user(u: music_proto::auth::v1::UserResponse) -> UserResponse {
    UserResponse {
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        is_active: u.is_active,
        avatar_url: u.avatar_url,
        created_at: u.created_at.map(|ts| timestamp_to_string(&ts)),
        updated_at: u.updated_at.map(|ts| timestamp_to_string(&ts)),
    }
}

fn timestamp_to_string(ts: &prost_types::Timestamp) -> String {
    chrono::DateTime::from_timestamp(ts.seconds, ts.nanos as u32)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
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
