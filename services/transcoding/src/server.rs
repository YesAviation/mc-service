use std::path::{Path, PathBuf};

use prost_types::Timestamp;
use sqlx::PgPool;
use tokio::sync::Mutex;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use music_common::config::TranscodingConfig;
use music_proto::common::v1::{Empty, PaginationResponse};
use music_proto::storage::v1::storage_service_client::StorageServiceClient;
use music_proto::storage::v1::{store_file_request::Data, FileMetadata, GetFileInfoRequest, StoreFileRequest};
use music_proto::transcoding::v1::transcoding_service_server::TranscodingService;
use music_proto::transcoding::v1::{
    CancelJobRequest, GetJobStatusRequest, HlsRequest, HlsResponse, JobStatusResponse,
    ListJobsRequest, ListJobsResponse, TranscodeRequest, TranscodeResponse,
};

use crate::models::{CreateTranscodingJobParams, TranscodingJob, TranscodingStatus};
use crate::repository;

/// Chunk size for streaming file data to the storage service (256 KB).
const STREAM_CHUNK_SIZE: usize = 256 * 1024;

pub struct TranscodingServiceImpl {
    pool: PgPool,
    storage_client: Mutex<StorageServiceClient<tonic::transport::Channel>>,
    config: TranscodingConfig,
    local_storage_root: PathBuf,
}

impl TranscodingServiceImpl {
    pub fn new(
        pool: PgPool,
        storage_client: StorageServiceClient<tonic::transport::Channel>,
        config: TranscodingConfig,
        local_storage_root: impl Into<PathBuf>,
    ) -> Self {
        Self {
            pool,
            storage_client: Mutex::new(storage_client),
            config,
            local_storage_root: local_storage_root.into(),
        }
    }

    fn bitrate_kbps(raw_bitrate: u32) -> u32 {
        if raw_bitrate >= 1000 {
            raw_bitrate / 1000
        } else {
            raw_bitrate
        }
    }

    fn bitrate_label(raw_bitrate: u32) -> String {
        format!("{}k", Self::bitrate_kbps(raw_bitrate))
    }

    /// Convert a domain TranscodingJob into the proto JobStatusResponse.
    fn job_to_proto(job: &TranscodingJob) -> JobStatusResponse {
        let completed_at = job.completed_at.as_ref().map(|ts| Timestamp {
            seconds: ts.timestamp(),
            nanos: ts.timestamp_subsec_nanos() as i32,
        });

        JobStatusResponse {
            job_id: job.id.to_string(),
            track_id: job.track_id.to_string(),
            status: job.status.as_str().to_string(),
            progress: job.progress,
            output_path: job.output_path.clone().unwrap_or_default(),
            error_message: job.error_message.clone().unwrap_or_default(),
            created_at: Some(Timestamp {
                seconds: job.created_at.timestamp(),
                nanos: job.created_at.timestamp_subsec_nanos() as i32,
            }),
            completed_at,
        }
    }

    /// Fetch the original audio file bytes from the Storage service.
    async fn fetch_source_file(&self, file_id: &str) -> Result<(Vec<u8>, String), Status> {
        // First, get the file info to find the storage path
        let file_info = {
            let mut client = self.storage_client.lock().await;
            client
                .get_file_info(Request::new(GetFileInfoRequest {
                    file_id: file_id.to_string(),
                }))
                .await
                .map_err(|e| Status::internal(format!("Storage service error (get_file_info): {e}")))?
                .into_inner()
        };

        // Read the file from disk via the storage path.
        // Since we are using a local storage backend, we read it directly.
        // In a production system this would use a streaming download RPC.
        let storage_path = file_info.storage_path.clone();
        let full_path = self.local_storage_root.join(&storage_path);
        let data = tokio::fs::read(&full_path)
            .await
            .map_err(|e| {
                Status::internal(format!(
                    "Failed to read source file at {}: {e}",
                    full_path.display()
                ))
            })?;

        Ok((data, file_info.original_filename))
    }

    async fn write_local_storage(
        &self,
        relative_path: &str,
        data: &[u8],
    ) -> Result<(), Status> {
        let full_path = self.local_storage_root.join(relative_path);

        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| {
                Status::internal(format!(
                    "Failed to create directory {}: {e}",
                    parent.display()
                ))
            })?;
        }

        tokio::fs::write(&full_path, data).await.map_err(|e| {
            Status::internal(format!("Failed to write {}: {e}", full_path.display()))
        })?;

        Ok(())
    }

    /// Store a file via the Storage service using streaming upload.
    async fn store_file_via_storage(
        &self,
        filename: &str,
        content_type: &str,
        data: &[u8],
    ) -> Result<String, Status> {
        let mut messages: Vec<StoreFileRequest> = Vec::new();

        messages.push(StoreFileRequest {
            data: Some(Data::Metadata(FileMetadata {
                original_filename: filename.to_string(),
                content_type: content_type.to_string(),
                storage_backend: "local".to_string(),
            })),
        });

        for chunk in data.chunks(STREAM_CHUNK_SIZE) {
            messages.push(StoreFileRequest {
                data: Some(Data::Chunk(chunk.to_vec())),
            });
        }

        let stream = tokio_stream::iter(messages);

        let response = {
            let mut client = self.storage_client.lock().await;
            client
                .store_file(Request::new(stream))
                .await
                .map_err(|e| Status::internal(format!("Storage service error (store_file): {e}")))?
                .into_inner()
        };

        Ok(response.file_id)
    }

    /// Run FFmpeg to transcode a single file to the target format/bitrate.
    async fn run_ffmpeg_transcode(
        &self,
        input_path: &Path,
        output_path: &Path,
        format: &str,
        bitrate: i32,
    ) -> Result<(), Status> {
        let bitrate_str = format!("{}k", bitrate / 1000);

        let codec = match format {
            "aac" | "m4a" => "aac",
            "mp3" => "libmp3lame",
            "opus" => "libopus",
            "vorbis" | "ogg" => "libvorbis",
            _ => "aac",
        };

        let output = tokio::process::Command::new(&self.config.ffmpeg_path)
            .args([
                "-i",
                &input_path.to_string_lossy(),
                "-c:a",
                codec,
                "-b:a",
                &bitrate_str,
                "-y",
                &output_path.to_string_lossy(),
            ])
            .output()
            .await
            .map_err(|e| Status::internal(format!("Failed to execute FFmpeg: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Status::internal(format!("FFmpeg transcode failed: {stderr}")));
        }

        Ok(())
    }

    /// Run FFmpeg to generate HLS segments for a single bitrate.
    async fn run_ffmpeg_hls(
        &self,
        input_path: &Path,
        output_dir: &Path,
        bitrate: u32,
        segment_duration: u32,
    ) -> Result<(), Status> {
        let bitrate_str = format!("{}k", Self::bitrate_kbps(bitrate));
        let segment_pattern = output_dir.join("segment_%03d.ts");
        let playlist_path = output_dir.join("playlist.m3u8");

        // Create the output directory
        tokio::fs::create_dir_all(output_dir)
            .await
            .map_err(|e| Status::internal(format!("Failed to create HLS output directory: {e}")))?;

        let output = tokio::process::Command::new(&self.config.ffmpeg_path)
            .args([
                "-fflags",
                "+genpts",
                "-i",
                &input_path.to_string_lossy(),
                "-vn",
                "-map_metadata",
                "-1",
                "-c:a",
                "aac",
                "-b:a",
                &bitrate_str,
                "-hls_time",
                &segment_duration.to_string(),
                "-hls_playlist_type",
                "vod",
                "-hls_segment_type",
                "mpegts",
                "-hls_segment_filename",
                &segment_pattern.to_string_lossy(),
                "-f",
                "hls",
                &playlist_path.to_string_lossy(),
            ])
            .output()
            .await
            .map_err(|e| Status::internal(format!("Failed to execute FFmpeg for HLS: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Status::internal(format!("FFmpeg HLS generation failed: {stderr}")));
        }

        Ok(())
    }

    /// Generate the HLS master playlist that references each bitrate variant.
    fn generate_master_playlist(bitrates: &[u32]) -> String {
        let mut playlist = String::from("#EXTM3U\n");

        for &bitrate in bitrates {
            let bitrate_kbps = Self::bitrate_kbps(bitrate);
            let bandwidth = bitrate_kbps * 1000;
            let bitrate_label = Self::bitrate_label(bitrate);
            playlist.push_str(&format!(
                "#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},CODECS=\"mp4a.40.2\"\n{bitrate_label}/playlist.m3u8\n"
            ));
        }

        playlist
    }

    /// Upload all HLS segments and playlist from a local directory to Storage.
    async fn upload_hls_segments(
        &self,
        local_dir: &Path,
        track_id: &str,
        bitrate_label: &str,
    ) -> Result<(), Status> {
        let mut entries = tokio::fs::read_dir(local_dir)
            .await
            .map_err(|e| Status::internal(format!("Failed to read HLS output dir: {e}")))?;

        while let Some(entry) = entries.next_entry().await.map_err(|e| {
            Status::internal(format!("Failed to read dir entry: {e}"))
        })? {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if !file_name.ends_with(".ts") && !file_name.ends_with(".m3u8") {
                continue;
            }

            let data = tokio::fs::read(&path)
                .await
                .map_err(|e| Status::internal(format!("Failed to read HLS file {}: {e}", path.display())))?;

            let storage_filename = format!("hls/{track_id}/{bitrate_label}/{file_name}");
            self.write_local_storage(&storage_filename, &data).await?;
        }

        Ok(())
    }
}

#[tonic::async_trait]
impl TranscodingService for TranscodingServiceImpl {
    async fn transcode_track(
        &self,
        request: Request<TranscodeRequest>,
    ) -> Result<Response<TranscodeResponse>, Status> {
        let req = request.into_inner();
        tracing::info!(
            track_id = %req.track_id,
            source_file_id = %req.source_file_id,
            target_format = %req.target_format,
            target_bitrate = req.target_bitrate,
            "TranscodeTrack request"
        );

        if req.track_id.is_empty() {
            return Err(Status::invalid_argument("track_id is required"));
        }
        if req.source_file_id.is_empty() {
            return Err(Status::invalid_argument("source_file_id is required"));
        }

        let track_id = Uuid::parse_str(&req.track_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid track_id UUID: {e}")))?;

        let format = if req.target_format.is_empty() { "aac".to_string() } else { req.target_format };
        let bitrate = if req.target_bitrate <= 0 { 256000 } else { req.target_bitrate };

        let job_id = Uuid::new_v4();
        let output_path = format!("transcoded/{track_id}/{job_id}.{format}");

        // Create the job record
        let job = repository::create_job(
            &self.pool,
            &CreateTranscodingJobParams {
                id: job_id,
                track_id,
                bitrate,
                format: format.clone(),
                output_path: output_path.clone(),
            },
        )
        .await
        .map_err(|e| Status::internal(format!("Failed to create job record: {e}")))?;

        // Mark as processing
        repository::update_status(&self.pool, job.id, &TranscodingStatus::Processing, None)
            .await
            .map_err(|e| Status::internal(format!("Failed to update job status: {e}")))?;

        // Fetch the source file from Storage
        let (source_data, _original_name) = self.fetch_source_file(&req.source_file_id).await?;

        // Write source to a temp file for FFmpeg
        let temp_dir = tempfile::tempdir()
            .map_err(|e| Status::internal(format!("Failed to create temp dir: {e}")))?;
        let input_path = temp_dir.path().join("input");
        tokio::fs::write(&input_path, &source_data)
            .await
            .map_err(|e| Status::internal(format!("Failed to write temp input file: {e}")))?;

        let extension = match format.as_str() {
            "aac" => "aac",
            "mp3" => "mp3",
            "opus" => "opus",
            "ogg" | "vorbis" => "ogg",
            other => other,
        };
        let output_file_path = temp_dir.path().join(format!("output.{extension}"));

        // Run FFmpeg
        match self.run_ffmpeg_transcode(&input_path, &output_file_path, &format, bitrate).await {
            Ok(()) => {
                // Read the output and upload to Storage
                let output_data = tokio::fs::read(&output_file_path)
                    .await
                    .map_err(|e| Status::internal(format!("Failed to read transcoded output: {e}")))?;

                let content_type = match format.as_str() {
                    "aac" | "m4a" => "audio/aac",
                    "mp3" => "audio/mpeg",
                    "opus" => "audio/opus",
                    "ogg" | "vorbis" => "audio/ogg",
                    _ => "application/octet-stream",
                };

                self.store_file_via_storage(&output_path, content_type, &output_data).await?;

                repository::update_status(&self.pool, job.id, &TranscodingStatus::Completed, None)
                    .await
                    .map_err(|e| Status::internal(format!("Failed to update job status: {e}")))?;

                tracing::info!(job_id = %job.id, "Transcoding completed successfully");
            }
            Err(e) => {
                let error_msg = format!("{e}");
                repository::update_status(
                    &self.pool,
                    job.id,
                    &TranscodingStatus::Failed,
                    Some(&error_msg),
                )
                .await
                .map_err(|e2| Status::internal(format!("Failed to update job status: {e2}")))?;

                return Err(e);
            }
        }

        Ok(Response::new(TranscodeResponse {
            job_id: job.id.to_string(),
            status: "completed".to_string(),
        }))
    }

    async fn generate_hls(
        &self,
        request: Request<HlsRequest>,
    ) -> Result<Response<HlsResponse>, Status> {
        let req = request.into_inner();
        tracing::info!(
            track_id = %req.track_id,
            source_file_id = %req.source_file_id,
            bitrates = ?req.bitrates,
            segment_duration = req.segment_duration,
            "GenerateHls request"
        );

        if req.track_id.is_empty() {
            return Err(Status::invalid_argument("track_id is required"));
        }
        if req.source_file_id.is_empty() {
            return Err(Status::invalid_argument("source_file_id is required"));
        }

        let track_id = Uuid::parse_str(&req.track_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid track_id UUID: {e}")))?;

        // Use configured bitrates if none specified in request
        let bitrates: Vec<u32> = if req.bitrates.is_empty() {
            self.config.bitrates.clone()
        } else {
            req.bitrates.iter().map(|&b| b as u32).collect()
        };

        let segment_duration = if req.segment_duration <= 0 {
            self.config.hls_segment_duration
        } else {
            req.segment_duration as u32
        };

        // Create a parent job ID to track the overall HLS generation
        let parent_job_id = Uuid::new_v4();

        // Fetch the source file from Storage
        let (source_data, _original_name) = self.fetch_source_file(&req.source_file_id).await?;

        // Write source to a temp file for FFmpeg
        let temp_dir = tempfile::tempdir()
            .map_err(|e| Status::internal(format!("Failed to create temp dir: {e}")))?;
        let input_path = temp_dir.path().join("input");
        tokio::fs::write(&input_path, &source_data)
            .await
            .map_err(|e| Status::internal(format!("Failed to write temp input file: {e}")))?;

        let mut all_succeeded = true;
        let mut last_error: Option<String> = None;

        // Process each bitrate
        for &bitrate in &bitrates {
            let bitrate_label = Self::bitrate_label(bitrate);
            let output_dir = temp_dir.path().join(&bitrate_label);
            let hls_output_path = format!("hls/{}/{}", req.track_id, bitrate_label);

            // Create a job record for this bitrate
            let job = repository::create_job(
                &self.pool,
                &CreateTranscodingJobParams {
                    id: Uuid::new_v4(),
                    track_id,
                    bitrate: bitrate as i32,
                    format: "hls".to_string(),
                    output_path: hls_output_path.clone(),
                },
            )
            .await
            .map_err(|e| Status::internal(format!("Failed to create job record: {e}")))?;

            repository::update_status(&self.pool, job.id, &TranscodingStatus::Processing, None)
                .await
                .map_err(|e| Status::internal(format!("Failed to update job status: {e}")))?;

            match self.run_ffmpeg_hls(&input_path, &output_dir, bitrate, segment_duration).await {
                Ok(()) => {
                    // Upload all segments and playlist to Storage
                    match self.upload_hls_segments(&output_dir, &req.track_id, &bitrate_label).await {
                        Ok(()) => {
                            repository::update_status(
                                &self.pool,
                                job.id,
                                &TranscodingStatus::Completed,
                                None,
                            )
                            .await
                            .map_err(|e| Status::internal(format!("Failed to update job status: {e}")))?;

                            tracing::info!(
                                job_id = %job.id,
                                bitrate = %bitrate_label,
                                "HLS generation completed for bitrate"
                            );
                        }
                        Err(e) => {
                            let error_msg = format!("{e}");
                            repository::update_status(
                                &self.pool,
                                job.id,
                                &TranscodingStatus::Failed,
                                Some(&error_msg),
                            )
                            .await
                            .map_err(|e2| Status::internal(format!("Failed to update job status: {e2}")))?;
                            all_succeeded = false;
                            last_error = Some(error_msg);
                        }
                    }
                }
                Err(e) => {
                    let error_msg = format!("{e}");
                    repository::update_status(
                        &self.pool,
                        job.id,
                        &TranscodingStatus::Failed,
                        Some(&error_msg),
                    )
                    .await
                    .map_err(|e2| Status::internal(format!("Failed to update job status: {e2}")))?;
                    all_succeeded = false;
                    last_error = Some(error_msg);
                }
            }
        }

        // Generate and upload the master playlist
        if all_succeeded {
            let master_playlist = Self::generate_master_playlist(&bitrates);
            let master_path = format!("hls/{}/master.m3u8", req.track_id);
            self.write_local_storage(&master_path, master_playlist.as_bytes())
                .await?;

            tracing::info!(
                track_id = %req.track_id,
                parent_job_id = %parent_job_id,
                "HLS generation completed for all bitrates"
            );

            Ok(Response::new(HlsResponse {
                job_id: parent_job_id.to_string(),
                status: "completed".to_string(),
            }))
        } else {
            Err(Status::internal(format!(
                "HLS generation failed for one or more bitrates: {}",
                last_error.unwrap_or_default()
            )))
        }
    }

    async fn get_job_status(
        &self,
        request: Request<GetJobStatusRequest>,
    ) -> Result<Response<JobStatusResponse>, Status> {
        let req = request.into_inner();

        if req.job_id.is_empty() {
            return Err(Status::invalid_argument("job_id is required"));
        }

        let job_id = Uuid::parse_str(&req.job_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid job_id UUID: {e}")))?;

        let job = repository::find_by_id(&self.pool, job_id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Job not found: {}", req.job_id)))?;

        Ok(Response::new(Self::job_to_proto(&job)))
    }

    async fn list_jobs(
        &self,
        request: Request<ListJobsRequest>,
    ) -> Result<Response<ListJobsResponse>, Status> {
        let req = request.into_inner();

        let (page, page_size) = match req.pagination {
            Some(p) => (
                if p.page < 1 { 1 } else { p.page },
                if p.page_size < 1 { 20 } else { p.page_size },
            ),
            None => (1, 20),
        };

        let status_filter = req.status_filter.as_deref().and_then(|s| {
            if s.is_empty() {
                None
            } else {
                Some(TranscodingStatus::from_str(s))
            }
        });

        let (jobs, total) =
            repository::list_jobs(&self.pool, status_filter.as_ref(), page, page_size)
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        let total_items = total as i32;
        let total_pages = (total_items + page_size - 1) / page_size;

        let job_responses: Vec<JobStatusResponse> = jobs.iter().map(Self::job_to_proto).collect();

        Ok(Response::new(ListJobsResponse {
            jobs: job_responses,
            pagination: Some(PaginationResponse {
                total_items,
                total_pages,
                current_page: page,
                page_size,
            }),
        }))
    }

    async fn cancel_job(
        &self,
        request: Request<CancelJobRequest>,
    ) -> Result<Response<Empty>, Status> {
        let req = request.into_inner();

        if req.job_id.is_empty() {
            return Err(Status::invalid_argument("job_id is required"));
        }

        let job_id = Uuid::parse_str(&req.job_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid job_id UUID: {e}")))?;

        // Verify job exists
        let job = repository::find_by_id(&self.pool, job_id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Job not found: {}", req.job_id)))?;

        // Only cancel jobs that are pending or processing
        if job.status == TranscodingStatus::Completed
            || job.status == TranscodingStatus::Failed
            || job.status == TranscodingStatus::Cancelled
        {
            return Err(Status::failed_precondition(format!(
                "Cannot cancel job in '{}' status",
                job.status.as_str()
            )));
        }

        repository::update_status(
            &self.pool,
            job_id,
            &TranscodingStatus::Cancelled,
            Some("Cancelled by user"),
        )
        .await
        .map_err(|e| Status::internal(format!("Failed to update job status: {e}")))?;

        tracing::info!(job_id = %job_id, "Job cancelled");

        Ok(Response::new(Empty {}))
    }
}
