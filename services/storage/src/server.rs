use std::sync::Arc;

use hmac::{Hmac, Mac};
use prost_types::Timestamp;
use sha2::Sha256;
use sqlx::PgPool;
use tonic::{Request, Response, Status, Streaming};
use uuid::Uuid;

use music_common::config::JwtConfig;
use music_common::storage::StorageBackend;
use music_proto::common::v1::{Empty, PaginationResponse};
use music_proto::storage::v1::storage_service_server::StorageService;
use music_proto::storage::v1::store_file_request::Data;
use music_proto::storage::v1::{
    DeleteFileRequest, FileInfo, GetFileInfoRequest, GetSignedUrlRequest, ListFilesRequest,
    ListFilesResponse, SignedUrlResponse, StoreFileRequest, StoreFileResponse,
};

use crate::models::{CreateStorageFileParams, StorageBackendType, StorageFile};
use crate::repository;

type HmacSha256 = Hmac<Sha256>;

pub struct StorageServiceImpl {
    pool: PgPool,
    storage: Arc<dyn StorageBackend>,
    jwt_config: JwtConfig,
}

impl StorageServiceImpl {
    pub fn new(pool: PgPool, storage: Arc<dyn StorageBackend>, jwt_config: JwtConfig) -> Self {
        Self {
            pool,
            storage,
            jwt_config,
        }
    }

    /// Convert a domain StorageFile into the proto FileInfo.
    fn file_to_proto(file: &StorageFile) -> FileInfo {
        FileInfo {
            id: file.id.to_string(),
            original_filename: file.original_filename.clone(),
            content_type: file.content_type.clone(),
            size_bytes: file.size_bytes,
            storage_backend: file.storage_backend.as_str().to_string(),
            storage_path: file.storage_path.clone(),
            checksum: file.checksum.clone(),
            created_at: Some(Timestamp {
                seconds: file.created_at.timestamp(),
                nanos: file.created_at.timestamp_subsec_nanos() as i32,
            }),
        }
    }

    /// Generate an HMAC-SHA256 signed URL for a file.
    fn generate_signed_url(&self, file_id: &str, expires_at: i64) -> Result<String, Status> {
        let message = format!("{file_id}:{expires_at}");

        let mut mac = HmacSha256::new_from_slice(self.jwt_config.secret.as_bytes())
            .map_err(|e| Status::internal(format!("HMAC key error: {e}")))?;
        mac.update(message.as_bytes());
        let signature = mac.finalize().into_bytes();
        let sig_hex = hex::encode(signature);

        Ok(format!(
            "/stream/files/{file_id}?expires={expires_at}&sig={sig_hex}"
        ))
    }
}

#[tonic::async_trait]
impl StorageService for StorageServiceImpl {
    async fn store_file(
        &self,
        request: Request<Streaming<StoreFileRequest>>,
    ) -> Result<Response<StoreFileResponse>, Status> {
        let mut stream = request.into_inner();

        // The first message must contain metadata.
        let first_msg = stream
            .message()
            .await?
            .ok_or_else(|| Status::invalid_argument("Empty stream: expected metadata first"))?;

        let metadata = match first_msg.data {
            Some(Data::Metadata(meta)) => meta,
            _ => {
                return Err(Status::invalid_argument(
                    "First message must contain file metadata",
                ));
            }
        };

        if metadata.original_filename.is_empty() {
            return Err(Status::invalid_argument("original_filename is required"));
        }

        // Collect all subsequent chunks into a buffer.
        let mut file_data: Vec<u8> = Vec::new();
        while let Some(msg) = stream.message().await? {
            match msg.data {
                Some(Data::Chunk(bytes)) => {
                    file_data.extend_from_slice(&bytes);
                }
                Some(Data::Metadata(_)) => {
                    return Err(Status::invalid_argument(
                        "Metadata should only appear in the first message",
                    ));
                }
                None => {}
            }
        }

        // Compute checksum (SHA-256 of file content).
        use sha2::Digest;
        let checksum = hex::encode(sha2::Sha256::digest(&file_data));

        // Determine storage path: files/<uuid>/<original_filename>
        let file_id = Uuid::new_v4();
        let storage_path = format!("files/{}/{}", file_id, metadata.original_filename);

        // Write to storage backend.
        self.storage
            .store(&storage_path, &file_data)
            .await
            .map_err(|e| Status::internal(format!("Storage write failed: {e}")))?;

        let size_bytes = file_data.len() as i64;

        let backend_type = StorageBackendType::from_str(&metadata.storage_backend);

        // Record in database.
        let params = CreateStorageFileParams {
            id: file_id,
            original_filename: metadata.original_filename,
            content_type: metadata.content_type,
            size_bytes,
            storage_backend: backend_type,
            storage_path: storage_path.clone(),
            checksum: checksum.clone(),
        };

        repository::create_file(&self.pool, &params)
            .await
            .map_err(|e| Status::internal(format!("Database insert failed: {e}")))?;

        tracing::info!(file_id = %file_id, size_bytes, "File stored successfully");

        Ok(Response::new(StoreFileResponse {
            file_id: file_id.to_string(),
            storage_path,
            size_bytes,
            checksum,
        }))
    }

    async fn get_file_info(
        &self,
        request: Request<GetFileInfoRequest>,
    ) -> Result<Response<FileInfo>, Status> {
        let req = request.into_inner();

        if req.file_id.is_empty() {
            return Err(Status::invalid_argument("file_id is required"));
        }

        let file_id = Uuid::parse_str(&req.file_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid file_id UUID: {e}")))?;

        let file = repository::find_by_id(&self.pool, file_id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("File not found: {}", req.file_id)))?;

        Ok(Response::new(Self::file_to_proto(&file)))
    }

    async fn get_signed_url(
        &self,
        request: Request<GetSignedUrlRequest>,
    ) -> Result<Response<SignedUrlResponse>, Status> {
        let req = request.into_inner();

        if req.file_id.is_empty() {
            return Err(Status::invalid_argument("file_id is required"));
        }

        let file_id = Uuid::parse_str(&req.file_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid file_id UUID: {e}")))?;

        // Verify the file exists.
        repository::find_by_id(&self.pool, file_id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("File not found: {}", req.file_id)))?;

        // Default expiry: 1 hour if not specified.
        let expires_in_secs = if req.expires_in_secs > 0 {
            req.expires_in_secs
        } else {
            3600
        };

        let expires_at = chrono::Utc::now().timestamp() + expires_in_secs;
        let url = self.generate_signed_url(&req.file_id, expires_at)?;

        Ok(Response::new(SignedUrlResponse {
            url,
            expires_at: Some(Timestamp {
                seconds: expires_at,
                nanos: 0,
            }),
        }))
    }

    async fn delete_file(
        &self,
        request: Request<DeleteFileRequest>,
    ) -> Result<Response<Empty>, Status> {
        let req = request.into_inner();

        if req.file_id.is_empty() {
            return Err(Status::invalid_argument("file_id is required"));
        }

        let file_id = Uuid::parse_str(&req.file_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid file_id UUID: {e}")))?;

        // Fetch file record to get the storage path.
        let file = repository::find_by_id(&self.pool, file_id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("File not found: {}", req.file_id)))?;

        // Delete from storage backend.
        self.storage
            .delete(&file.storage_path)
            .await
            .map_err(|e| Status::internal(format!("Storage delete failed: {e}")))?;

        // Delete from database.
        repository::delete_by_id(&self.pool, file_id)
            .await
            .map_err(|e| Status::internal(format!("Database delete failed: {e}")))?;

        tracing::info!(file_id = %file_id, "File deleted successfully");

        Ok(Response::new(Empty {}))
    }

    async fn list_files(
        &self,
        request: Request<ListFilesRequest>,
    ) -> Result<Response<ListFilesResponse>, Status> {
        let req = request.into_inner();

        let (page, page_size) = match req.pagination {
            Some(p) => (if p.page < 1 { 1 } else { p.page }, if p.page_size < 1 { 20 } else { p.page_size }),
            None => (1, 20),
        };

        let backend_filter = req.storage_backend.as_deref().and_then(|s| {
            if s.is_empty() {
                None
            } else {
                Some(StorageBackendType::from_str(s))
            }
        });

        let (files, total) =
            repository::list_files(&self.pool, backend_filter.as_ref(), page, page_size)
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        let total_items = total as i32;
        let total_pages = (total_items + page_size - 1) / page_size;

        let file_infos: Vec<FileInfo> = files.iter().map(Self::file_to_proto).collect();

        Ok(Response::new(ListFilesResponse {
            files: file_infos,
            pagination: Some(PaginationResponse {
                total_items,
                total_pages,
                current_page: page,
                page_size,
            }),
        }))
    }
}
