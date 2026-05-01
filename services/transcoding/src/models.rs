use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Represents the `transcoding_status` PostgreSQL enum.
#[derive(Debug, Clone, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "transcoding_status", rename_all = "lowercase")]
pub enum TranscodingStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

impl TranscodingStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TranscodingStatus::Pending => "pending",
            TranscodingStatus::Processing => "processing",
            TranscodingStatus::Completed => "completed",
            TranscodingStatus::Failed => "failed",
            TranscodingStatus::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "processing" => TranscodingStatus::Processing,
            "completed" => TranscodingStatus::Completed,
            "failed" => TranscodingStatus::Failed,
            "cancelled" => TranscodingStatus::Cancelled,
            _ => TranscodingStatus::Pending,
        }
    }
}

/// A row from the `transcoding_jobs` table.
#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct TranscodingJob {
    pub id: Uuid,
    pub track_id: Uuid,
    pub status: TranscodingStatus,
    pub bitrate: Option<i32>,
    pub format: Option<String>,
    pub output_path: Option<String>,
    pub error_message: Option<String>,
    pub progress: f32,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// Parameters for inserting a new transcoding job record.
pub struct CreateTranscodingJobParams {
    pub id: Uuid,
    pub track_id: Uuid,
    pub bitrate: i32,
    pub format: String,
    pub output_path: String,
}
