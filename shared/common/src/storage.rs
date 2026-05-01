use async_trait::async_trait;

use crate::error::AppError;

#[async_trait]
pub trait StorageBackend: Send + Sync {
    /// serd - not serialize/deserialize, just found my naming ironic for the functions
    async fn store(&self, path: &str, data: &[u8]) -> Result<(), AppError>;
    async fn retrieve(&self, path: &str) -> Result<Vec<u8>, AppError>;
    async fn delete(&self, path: &str) -> Result<(), AppError>;
    async fn exists(&self, path: &str) -> Result<bool, AppError>;
}

pub struct LocalStorage {
    base_path: std::path::PathBuf,
}

impl LocalStorage {
    pub fn new(base_path: impl Into<std::path::PathBuf>) -> Self {
        Self {
            base_path: base_path.into(),
        }
    }
}

#[async_trait]
impl StorageBackend for LocalStorage {
    async fn store(&self, path: &str, data: &[u8]) -> Result<(), AppError> {
        let full_path = self.base_path.join(path);
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to create directory: {e}")))?;
        }
        tokio::fs::write(&full_path, data)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;
        Ok(())
    }

    async fn retrieve(&self, path: &str) -> Result<Vec<u8>, AppError> {
        let full_path = self.base_path.join(path);
        tokio::fs::read(&full_path)
            .await
            .map_err(|e| AppError::NotFound(format!("File not found: {e}")))
    }

    async fn delete(&self, path: &str) -> Result<(), AppError> {
        let full_path = self.base_path.join(path);
        tokio::fs::remove_file(&full_path)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to delete file: {e}")))?;
        Ok(())
    }

    async fn exists(&self, path: &str) -> Result<bool, AppError> {
        let full_path = self.base_path.join(path);
        Ok(full_path.exists())
    }
}
