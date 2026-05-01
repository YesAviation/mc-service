use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("RabbitMQ error: {0}")]
    Rabbitmq(#[from] lapin::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            AppError::Database(e) => {
                tracing::error!("Database error: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            AppError::Redis(e) => {
                tracing::error!("Redis error: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            AppError::Jwt(_) => (StatusCode::UNAUTHORIZED, "Invalid token".to_string()),
            AppError::Serialization(e) => {
                tracing::error!("Serialization error: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            AppError::Rabbitmq(e) => {
                tracing::error!("RabbitMQ error: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
        };

        let body = axum::Json(json!({
            "error": {
                "code": status.as_u16(),
                "message": message,
            }
        }));

        (status, body).into_response()
    }
}

impl From<AppError> for tonic::Status {
    fn from(error: AppError) -> Self {
        match error {
            AppError::NotFound(msg) => tonic::Status::not_found(msg),
            AppError::Unauthorized(msg) => tonic::Status::unauthenticated(msg),
            AppError::Forbidden(msg) => tonic::Status::permission_denied(msg),
            AppError::BadRequest(msg) => tonic::Status::invalid_argument(msg),
            AppError::Conflict(msg) => tonic::Status::already_exists(msg),
            AppError::Internal(msg) => tonic::Status::internal(msg),
            AppError::Database(e) => tonic::Status::internal(format!("Database error: {e}")),
            AppError::Redis(e) => tonic::Status::internal(format!("Redis error: {e}")),
            AppError::Jwt(_) => tonic::Status::unauthenticated("Invalid token"),
            AppError::Serialization(e) => {
                tonic::Status::internal(format!("Serialization error: {e}"))
            }
            AppError::Rabbitmq(e) => tonic::Status::internal(format!("RabbitMQ error: {e}")),
        }
    }
}
