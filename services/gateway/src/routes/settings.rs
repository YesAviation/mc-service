use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use music_common::auth::Role;
use music_common::middleware::AuthUser;
use serde::Serialize;
use uuid::Uuid;

use crate::admin_control::{
    self, AdminControlError, CreateAdminUserRequest, ResetAdminUserPasswordRequest,
    UpdateAdminUserRequest,
    UpdateServerRuntimeSettingsRequest,
};
use crate::media_processing::{self, MediaProcessingSettingsPatch};
use crate::state::AppState;

#[derive(Serialize)]
struct StartPrewarmResponse {
    started: bool,
    message: String,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/media-processing",
            get(get_media_processing_settings).put(update_media_processing_settings),
        )
        .route("/media-processing/prewarm", post(start_manual_prewarm))
        .route("/users", get(list_admin_users).post(create_admin_user))
        .route(
            "/users/{user_id}",
            get(get_admin_user).put(update_admin_user).delete(delete_admin_user),
        )
        .route(
            "/users/{user_id}/reset-password",
            post(reset_admin_user_password),
        )
        .route(
            "/server-runtime",
            get(get_server_runtime_settings).put(update_server_runtime_settings),
        )
}

async fn get_media_processing_settings(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match media_processing::get_media_processing_settings(&state.db_pool, &state.config).await {
        Ok(settings) => Json(settings).into_response(),
        Err(error) => internal_error_response(error),
    }
}

async fn update_media_processing_settings(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(patch): Json<MediaProcessingSettingsPatch>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match media_processing::update_media_processing_settings(
        &state.db_pool,
        &state.config,
        patch,
        auth_user.user_id,
    )
    .await
    {
        Ok(settings) => Json(settings).into_response(),
        Err(error) => internal_error_response(error),
    }
}

async fn start_manual_prewarm(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    media_processing::spawn_manual_prewarm(state, format!("manual_admin:{}", auth_user.user_id));

    let body = StartPrewarmResponse {
        started: true,
        message: "Media prewarm job started".to_string(),
    };

    (
        StatusCode::ACCEPTED,
        Json(body),
    )
        .into_response()
}

async fn list_admin_users(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::list_admin_users(&state.db_pool).await {
        Ok(users) => Json(users).into_response(),
        Err(error) => admin_control_error_to_response(error),
    }
}

async fn create_admin_user(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(request): Json<CreateAdminUserRequest>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::create_admin_user(&state.db_pool, request).await {
        Ok(user) => (
            StatusCode::CREATED,
            Json(user),
        )
            .into_response(),
        Err(error) => admin_control_error_to_response(error),
    }
}

async fn get_admin_user(
    Path(user_id): Path<Uuid>,
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::list_admin_users(&state.db_pool).await {
        Ok(users) => {
            if let Some(user) = users.into_iter().find(|item| item.id == user_id.to_string()) {
                Json(user).into_response()
            } else {
                not_found_response("User not found")
            }
        }
        Err(error) => admin_control_error_to_response(error),
    }
}

async fn update_admin_user(
    Path(user_id): Path<Uuid>,
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(patch): Json<UpdateAdminUserRequest>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::update_admin_user(&state.db_pool, user_id, patch).await {
        Ok(user) => Json(user).into_response(),
        Err(error) => admin_control_error_to_response(error),
    }
}

async fn reset_admin_user_password(
    Path(user_id): Path<Uuid>,
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(payload): Json<ResetAdminUserPasswordRequest>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::reset_admin_user_password(&state.db_pool, user_id, payload).await {
        Ok(body) => Json(body).into_response(),
        Err(error) => admin_control_error_to_response(error),
    }
}

async fn delete_admin_user(
    Path(user_id): Path<Uuid>,
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::delete_admin_user(&state.db_pool, user_id).await {
        Ok(body) => Json(body).into_response(),
        Err(error) => admin_control_error_to_response(error),
    }
}

async fn get_server_runtime_settings(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::get_server_runtime_settings(&state.db_pool).await {
        Ok(settings) => Json(settings).into_response(),
        Err(error) => admin_control_error_to_response(error),
    }
}

async fn update_server_runtime_settings(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(patch): Json<UpdateServerRuntimeSettingsRequest>,
) -> impl IntoResponse {
    if let Some(response) = require_admin(&auth_user) {
        return response;
    }

    match admin_control::update_server_runtime_settings(&state.db_pool, patch, auth_user.user_id)
        .await
    {
        Ok(settings) => Json(settings).into_response(),
        Err(error) => admin_control_error_to_response(error),
    }
}

fn require_admin(auth_user: &AuthUser) -> Option<axum::response::Response> {
    if !matches!(auth_user.role, Role::Admin) {
        return Some(forbidden_response("Admin access is required"));
    }

    None
}

fn forbidden_response(message: &str) -> axum::response::Response {
    error_response(StatusCode::FORBIDDEN, message)
}

fn not_found_response(message: &str) -> axum::response::Response {
    error_response(StatusCode::NOT_FOUND, message)
}

fn internal_error_response(error: sqlx::Error) -> axum::response::Response {
    tracing::error!(error = %error, "Failed to process settings request");

    error_response(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
}

fn admin_control_error_to_response(error: AdminControlError) -> axum::response::Response {
    match error {
        AdminControlError::Sql(sql_error) => internal_error_response(sql_error),
        AdminControlError::BadRequest(message) => {
            error_response(StatusCode::BAD_REQUEST, &message)
        }
        AdminControlError::Forbidden(message) => {
            error_response(StatusCode::FORBIDDEN, &message)
        }
        AdminControlError::NotFound(message) => {
            error_response(StatusCode::NOT_FOUND, &message)
        }
    }
}

fn error_response(status: StatusCode, message: &str) -> axum::response::Response {
    let body = serde_json::json!({
        "error": {
            "code": status.as_u16(),
            "message": message,
        }
    });

    (status, Json(body)).into_response()
}
