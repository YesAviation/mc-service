use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Represents the `storage_backend_type` PostgreSQL enum.
#[derive(Debug, Clone, sqlx::Type)]
#[sqlx(type_name = "storage_backend_type", rename_all = "lowercase")]
pub enum StorageBackendType {
    Local,
    S3,
}

impl StorageBackendType {
    pub fn as_str(&self) -> &'static str {
        match self {
            StorageBackendType::Local => "local",
            StorageBackendType::S3 => "s3",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "s3" => StorageBackendType::S3,
            _ => StorageBackendType::Local,
        }
    }
}

/// A row from the `storage_files` table.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct StorageFile {
    pub id: Uuid,
    pub original_filename: String,
    pub content_type: String,
    pub size_bytes: i64,
    pub storage_backend: StorageBackendType,
    pub storage_path: String,
    pub checksum: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Parameters for inserting a new storage file record.
pub struct CreateStorageFileParams {
    pub id: Uuid,
    pub original_filename: String,
    pub content_type: String,
    pub size_bytes: i64,
    pub storage_backend: StorageBackendType,
    pub storage_path: String,
    pub checksum: String,
}
