use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use lofty::file::{AudioFile, FileType, TaggedFileExt};
use lofty::tag::Accessor;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tokio::sync::Mutex;
use tonic::{Request, Response, Status};
use uuid::Uuid;
use walkdir::WalkDir;

use music_proto::catalog::v1::catalog_service_client::CatalogServiceClient;
use music_proto::catalog::v1::{CreateAlbumRequest, CreateArtistRequest, CreateTrackRequest};
use music_proto::ingestion::v1::ingestion_service_server::IngestionService;
use music_proto::ingestion::v1::{
    GetScanStatusRequest, IngestFileRequest, IngestResponse, IngestScanError, IngestScanRequest,
    IngestScanResponse, IngestedMetadata, ListScansRequest, ListScansResponse, ScanRequest,
    ScanResponse, ScanStatusResponse,
};
use music_proto::storage::v1::storage_service_client::StorageServiceClient;
use music_proto::storage::v1::{store_file_request::Data, FileMetadata, StoreFileRequest};

use crate::models::{is_audio_extension, AudioFileInfo, ExtractedMetadata};
use crate::repository;

/// Chunk size for streaming file data to the storage service (256 KB).
const STREAM_CHUNK_SIZE: usize = 256 * 1024;
/// Cap on how many error rows we return from a bulk ingest, so a thousand-file
/// failure mode doesn't produce an unmanageable payload.
const MAX_INGEST_SCAN_ERRORS: usize = 50;

pub struct IngestionServiceImpl {
    pool: PgPool,
    storage_client: Mutex<StorageServiceClient<tonic::transport::Channel>>,
    catalog_client: Mutex<CatalogServiceClient<tonic::transport::Channel>>,
    http_client: reqwest::Client,
    stream_http_base_url: String,
    /// In-memory cache of scan_id → discovered audio file paths. Populated by
    /// `scan_directory`; consumed by `ingest_scan`. Lost on restart, which is
    /// acceptable — the admin can re-scan in a couple of seconds.
    scans: Arc<Mutex<HashMap<Uuid, Vec<PathBuf>>>>,
}

impl IngestionServiceImpl {
    pub fn new(
        pool: PgPool,
        storage_client: StorageServiceClient<tonic::transport::Channel>,
        catalog_client: CatalogServiceClient<tonic::transport::Channel>,
        stream_http_base_url: String,
    ) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(6))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            pool,
            storage_client: Mutex::new(storage_client),
            catalog_client: Mutex::new(catalog_client),
            http_client,
            stream_http_base_url: stream_http_base_url.trim_end_matches('/').to_string(),
            scans: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn stream_file_url(&self, file_id: &str) -> String {
        format!("{}/stream/files/{file_id}", self.stream_http_base_url)
    }

    async fn store_blob(
        &self,
        original_filename: String,
        content_type: String,
        bytes: &[u8],
    ) -> Result<String, Status> {
        let mut messages: Vec<StoreFileRequest> = Vec::new();
        messages.push(StoreFileRequest {
            data: Some(Data::Metadata(FileMetadata {
                original_filename,
                content_type,
                storage_backend: "local".to_string(),
            })),
        });

        for chunk in bytes.chunks(STREAM_CHUNK_SIZE) {
            messages.push(StoreFileRequest {
                data: Some(Data::Chunk(chunk.to_vec())),
            });
        }

        let stream = tokio_stream::iter(messages);
        let store_response = {
            let mut client = self.storage_client.lock().await;
            client
                .store_file(Request::new(stream))
                .await
                .map_err(|e| Status::internal(format!("Storage service error: {e}")))?
                .into_inner()
        };

        Ok(store_response.file_id)
    }

    async fn upload_artwork_and_build_url(&self, artwork_data: &[u8]) -> Result<Option<String>, Status> {
        if artwork_data.is_empty() {
            return Ok(None);
        }

        let (content_type, extension) = detect_image_content_type(artwork_data);
        let file_id = self
            .store_blob(
                format!("artwork-{}.{}", Uuid::new_v4(), extension),
                content_type.to_string(),
                artwork_data,
            )
            .await?;

        Ok(Some(self.stream_file_url(&file_id)))
    }

    async fn lookup_itunes_track(&self, metadata: &ExtractedMetadata) -> Option<ItunesResult> {
        let mut terms = Vec::new();
        if !is_blank(&metadata.artist) {
            terms.push(metadata.artist.trim().to_string());
        }
        if !is_blank(&metadata.title) {
            terms.push(metadata.title.trim().to_string());
        }
        if !is_blank(&metadata.album) {
            terms.push(metadata.album.trim().to_string());
        }

        if terms.is_empty() {
            return None;
        }

        let term = terms.join(" ");
        let response = match self
            .http_client
            .get("https://itunes.apple.com/search")
            .query(&[("term", term.as_str()), ("entity", "song"), ("limit", "8")])
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(error) => {
                tracing::warn!(%error, "iTunes track lookup failed");
                return None;
            }
        };

        if !response.status().is_success() {
            tracing::warn!(status = %response.status(), "iTunes track lookup returned non-success");
            return None;
        }

        let payload = match response.json::<ItunesSearchResponse>().await {
            Ok(body) => body,
            Err(error) => {
                tracing::warn!(%error, "Failed to parse iTunes track lookup response");
                return None;
            }
        };

        choose_best_itunes_result(metadata, payload.results)
    }

    async fn lookup_itunes_artist_image(&self, artist_name: &str) -> Option<String> {
        if is_blank(artist_name) || artist_name.eq_ignore_ascii_case("Unknown Artist") {
            return None;
        }

        let response = match self
            .http_client
            .get("https://itunes.apple.com/search")
            .query(&[
                ("term", artist_name.trim()),
                ("entity", "album"),
                ("attribute", "artistTerm"),
                ("limit", "1"),
            ])
            .send()
            .await
        {
            Ok(resp) => resp,
            Err(error) => {
                tracing::warn!(%error, artist = %artist_name, "iTunes artist lookup failed");
                return None;
            }
        };

        if !response.status().is_success() {
            tracing::warn!(status = %response.status(), artist = %artist_name, "iTunes artist lookup returned non-success");
            return None;
        }

        let payload = match response.json::<ItunesSearchResponse>().await {
            Ok(body) => body,
            Err(error) => {
                tracing::warn!(%error, artist = %artist_name, "Failed to parse iTunes artist lookup response");
                return None;
            }
        };

        payload
            .results
            .into_iter()
            .find_map(|result| non_empty(&result.artwork_url_100).map(|url| upscale_itunes_artwork_url(&url)))
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
struct ItunesSearchResponse {
    results: Vec<ItunesResult>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
struct ItunesResult {
    #[serde(rename = "trackName")]
    track_name: String,
    #[serde(rename = "artistName")]
    artist_name: String,
    #[serde(rename = "collectionName")]
    collection_name: String,
    #[serde(rename = "artworkUrl100")]
    artwork_url_100: String,
    #[serde(rename = "primaryGenreName")]
    primary_genre_name: String,
    #[serde(rename = "releaseDate")]
    release_date: String,
}

fn choose_best_itunes_result(metadata: &ExtractedMetadata, results: Vec<ItunesResult>) -> Option<ItunesResult> {
    let mut best: Option<ItunesResult> = None;
    let mut best_score = i32::MIN;

    for result in results {
        let mut score = 0;
        if matches_normalized(&metadata.artist, &result.artist_name) {
            score += 5;
        }
        if matches_normalized(&metadata.album, &result.collection_name) {
            score += 3;
        }
        if matches_normalized(&metadata.title, &result.track_name) {
            score += 2;
        }

        if score > best_score {
            best_score = score;
            best = Some(result);
        }
    }

    best
}

fn matches_normalized(left: &str, right: &str) -> bool {
    if is_blank(left) || is_blank(right) {
        return false;
    }

    left.trim().eq_ignore_ascii_case(right.trim())
}

fn is_blank(value: &str) -> bool {
    value.trim().is_empty()
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_release_year(release_date: &str) -> Option<i32> {
    if release_date.len() < 4 {
        return None;
    }

    release_date.get(0..4)?.parse::<i32>().ok()
}

fn upscale_itunes_artwork_url(url: &str) -> String {
    let candidates = [
        "60x60bb",
        "100x100bb",
        "200x200bb",
        "600x600bb",
        "60x60",
        "100x100",
        "200x200",
        "600x600",
    ];

    for candidate in candidates {
        if url.contains(candidate) {
            return url.replace(candidate, "1200x1200bb");
        }
    }

    url.to_string()
}

/// Scan a directory for audio files, optionally recursively.
fn scan_directory_for_audio(dir: &str, recursive: bool) -> Result<Vec<AudioFileInfo>, Status> {
    let path = Path::new(dir);
    if !path.exists() {
        return Err(Status::not_found(format!(
            "Directory does not exist: {dir}"
        )));
    }
    if !path.is_dir() {
        return Err(Status::invalid_argument(format!(
            "Path is not a directory: {dir}"
        )));
    }

    let mut files = Vec::new();

    let walker = if recursive {
        WalkDir::new(dir)
    } else {
        WalkDir::new(dir).max_depth(1)
    };

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        let entry_path = entry.path();
        if !entry_path.is_file() {
            continue;
        }
        let ext = match entry_path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_lowercase(),
            None => continue,
        };
        if !is_audio_extension(&ext) {
            continue;
        }

        let file_name = entry_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);

        files.push(AudioFileInfo {
            path: entry_path.to_path_buf(),
            file_name,
            extension: ext,
            size_bytes,
        });
    }

    Ok(files)
}

/// Extract audio metadata from a file using the lofty crate.
fn extract_metadata(file_path: &Path) -> Result<ExtractedMetadata, Status> {
    let tagged_file = lofty::read_from_path(file_path)
        .map_err(|e| Status::internal(format!("Failed to read audio tags from {}: {e}", file_path.display())))?;

    let properties = tagged_file.properties();
    let duration_secs = properties.duration().as_secs() as i32;
    let bitrate = properties.audio_bitrate().unwrap_or(0) as i32;
    let sample_rate = properties.sample_rate().unwrap_or(0) as i32;

    let format = match tagged_file.file_type() {
        FileType::Mpeg => "mp3".to_string(),
        FileType::Flac => "flac".to_string(),
        FileType::Wav => "wav".to_string(),
        FileType::Mp4 => "m4a".to_string(),
        FileType::Vorbis => "ogg".to_string(),
        FileType::Aac => "aac".to_string(),
        other => format!("{other:?}").to_lowercase(),
    };

    // Try to get the primary tag, or fall back to the first tag found.
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let mut meta = ExtractedMetadata {
        duration_secs,
        format,
        bitrate,
        sample_rate,
        ..Default::default()
    };

    if let Some(tag) = tag {
        meta.title = tag.title().map(|s: std::borrow::Cow<'_, str>| s.to_string()).unwrap_or_default();
        meta.artist = tag.artist().map(|s: std::borrow::Cow<'_, str>| s.to_string()).unwrap_or_default();
        meta.album = tag.album().map(|s: std::borrow::Cow<'_, str>| s.to_string()).unwrap_or_default();
        meta.track_number = tag.track().unwrap_or(0) as i32;
        meta.disc_number = tag.disk().unwrap_or(0) as i32;
        meta.genre = tag.genre().map(|s: std::borrow::Cow<'_, str>| s.to_string()).unwrap_or_default();
        meta.year = tag.year().unwrap_or(0) as i32;

        if let Some(picture) = tag.pictures().first() {
            meta.artwork_data = Some(picture.data().to_vec());
        }
    }

    // If no title was found in tags, use the filename (minus extension).
    if meta.title.is_empty() {
        meta.title = file_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string());
    }

    Ok(meta)
}

/// Determine image MIME type and extension from bytes.
fn detect_image_content_type(data: &[u8]) -> (&'static str, &'static str) {
    if data.len() >= 8
        && data[0] == 0x89
        && data[1] == b'P'
        && data[2] == b'N'
        && data[3] == b'G'
        && data[4] == 0x0D
        && data[5] == 0x0A
        && data[6] == 0x1A
        && data[7] == 0x0A
    {
        return ("image/png", "png");
    }

    if data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
        return ("image/jpeg", "jpg");
    }

    if data.len() >= 6 && (&data[0..6] == b"GIF87a" || &data[0..6] == b"GIF89a") {
        return ("image/gif", "gif");
    }

    if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return ("image/webp", "webp");
    }

    ("image/jpeg", "jpg")
}

/// Compute SHA-256 hash of the given data and return it as a hex string.
fn compute_sha256(data: &[u8]) -> String {
    let hash = Sha256::digest(data);
    hex::encode(hash)
}

/// Determine MIME content type from a file extension.
fn content_type_for_extension(ext: &str) -> &'static str {
    match ext {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "aac" => "audio/aac",
        _ => "application/octet-stream",
    }
}

#[tonic::async_trait]
impl IngestionService for IngestionServiceImpl {
    async fn scan_directory(
        &self,
        request: Request<ScanRequest>,
    ) -> Result<Response<ScanResponse>, Status> {
        let req = request.into_inner();
        tracing::info!(directory = %req.directory_path, recursive = req.recursive, "ScanDirectory request");

        if req.directory_path.is_empty() {
            return Err(Status::invalid_argument("directory_path is required"));
        }

        let files = scan_directory_for_audio(&req.directory_path, req.recursive)?;
        let files_found = files.len() as i32;
        let scan_uuid = Uuid::new_v4();

        // Retain the discovered paths so a subsequent IngestScan call can
        // process them without the caller having to enumerate them again.
        {
            let paths: Vec<PathBuf> = files.iter().map(|f| PathBuf::from(&f.path)).collect();
            let mut scans = self.scans.lock().await;
            scans.insert(scan_uuid, paths);
        }

        tracing::info!(scan_id = %scan_uuid, files_found, "Directory scan complete");

        Ok(Response::new(ScanResponse {
            scan_id: scan_uuid.to_string(),
            status: "completed".to_string(),
            files_found,
        }))
    }

    async fn ingest_file(
        &self,
        request: Request<IngestFileRequest>,
    ) -> Result<Response<IngestResponse>, Status> {
        let req = request.into_inner();
        tracing::info!(file_path = %req.file_path, force = req.force_reimport, "IngestFile request");

        if req.file_path.is_empty() {
            return Err(Status::invalid_argument("file_path is required"));
        }

        let file_path = Path::new(&req.file_path);
        if !file_path.exists() {
            return Err(Status::not_found(format!(
                "File does not exist: {}",
                req.file_path
            )));
        }
        if !file_path.is_file() {
            return Err(Status::invalid_argument(format!(
                "Path is not a file: {}",
                req.file_path
            )));
        }

        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        if !is_audio_extension(&ext) {
            return Err(Status::invalid_argument(format!(
                "Unsupported audio format: .{ext}"
            )));
        }

        // 1. Read file bytes
        let file_data = tokio::fs::read(file_path)
            .await
            .map_err(|e| Status::internal(format!("Failed to read file: {e}")))?;

        // 2. Compute SHA-256 hash for deduplication
        let file_hash = compute_sha256(&file_data);

        // 3. Check for duplicate (unless force_reimport)
        if !req.force_reimport {
            if let Some(existing_track_id) =
                repository::find_track_by_file_hash(&self.pool, &file_hash)
                    .await
                    .map_err(|e| Status::internal(format!("Database error: {e}")))?
            {
                tracing::info!(track_id = %existing_track_id, "Duplicate file detected, skipping");
                return Ok(Response::new(IngestResponse {
                    track_id: existing_track_id,
                    status: "duplicate".to_string(),
                    is_duplicate: true,
                    metadata: None,
                }));
            }
        }

        // 4. Extract metadata using lofty
        let mut metadata = extract_metadata(file_path)?;

        // Prefer local metadata; only use iTunes to fill missing pieces.
        let mut artist_name = if is_blank(&metadata.artist) {
            "Unknown Artist".to_string()
        } else {
            metadata.artist.trim().to_string()
        };
        let mut album_title = if is_blank(&metadata.album) {
            "Unknown Album".to_string()
        } else {
            metadata.album.trim().to_string()
        };

        let mut existing_artist = repository::find_artist_by_name(&self.pool, &artist_name)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        let mut existing_album = if let Some((existing_artist_id, _)) = existing_artist.as_ref() {
            let existing_artist_uuid = Uuid::parse_str(existing_artist_id)
                .map_err(|e| Status::internal(format!("Invalid artist ID in database: {e}")))?;
            repository::find_album_by_artist_and_title(&self.pool, existing_artist_uuid, &album_title)
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?
        } else {
            None
        };

        let existing_artist_image_url = existing_artist
            .as_ref()
            .and_then(|(_, url)| url.as_deref())
            .and_then(non_empty);
        let existing_album_artwork_url = existing_album
            .as_ref()
            .and_then(|(_, url)| url.as_deref())
            .and_then(non_empty);

        let needs_core_metadata = is_blank(&metadata.title)
            || is_blank(&metadata.artist)
            || is_blank(&metadata.album);
        let needs_album_artwork = metadata.artwork_data.is_none() && existing_album_artwork_url.is_none();
        let needs_artist_image = existing_artist_image_url.is_none();

        let mut itunes_used = false;
        let mut itunes_result: Option<ItunesResult> = None;
        let mut fallback_artwork_url: Option<String> = None;
        let mut fallback_artist_image_url: Option<String> = None;

        if needs_core_metadata || needs_album_artwork || needs_artist_image {
            if let Some(result) = self.lookup_itunes_track(&metadata).await {
                if is_blank(&metadata.artist) {
                    if let Some(v) = non_empty(&result.artist_name) {
                        metadata.artist = v;
                        itunes_used = true;
                    }
                }
                if is_blank(&metadata.album) {
                    if let Some(v) = non_empty(&result.collection_name) {
                        metadata.album = v;
                        itunes_used = true;
                    }
                }
                if is_blank(&metadata.genre) {
                    if let Some(v) = non_empty(&result.primary_genre_name) {
                        metadata.genre = v;
                        itunes_used = true;
                    }
                }
                if metadata.year <= 0 {
                    if let Some(year) = parse_release_year(&result.release_date) {
                        metadata.year = year;
                        itunes_used = true;
                    }
                }

                fallback_artwork_url = non_empty(&result.artwork_url_100)
                    .map(|url| upscale_itunes_artwork_url(&url));
                if fallback_artwork_url.is_some() {
                    itunes_used = true;
                }
                fallback_artist_image_url = fallback_artwork_url.clone();
                itunes_result = Some(result);
            }

            let artist_for_lookup = if is_blank(&metadata.artist) {
                artist_name.clone()
            } else {
                metadata.artist.trim().to_string()
            };

            if let Some(artist_image) = self.lookup_itunes_artist_image(&artist_for_lookup).await {
                fallback_artist_image_url = Some(artist_image);
                itunes_used = true;
            }
        }

        artist_name = if is_blank(&metadata.artist) {
            "Unknown Artist".to_string()
        } else {
            metadata.artist.trim().to_string()
        };
        album_title = if is_blank(&metadata.album) {
            "Unknown Album".to_string()
        } else {
            metadata.album.trim().to_string()
        };
        metadata.artist = artist_name.clone();
        metadata.album = album_title.clone();

        // Re-query after fallback because artist/album names may have changed.
        existing_artist = repository::find_artist_by_name(&self.pool, &artist_name)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        existing_album = if let Some((existing_artist_id, _)) = existing_artist.as_ref() {
            let existing_artist_uuid = Uuid::parse_str(existing_artist_id)
                .map_err(|e| Status::internal(format!("Invalid artist ID in database: {e}")))?;
            repository::find_album_by_artist_and_title(&self.pool, existing_artist_uuid, &album_title)
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?
        } else {
            None
        };

        let existing_artist_image_url = existing_artist
            .as_ref()
            .and_then(|(_, url)| url.as_deref())
            .and_then(non_empty);
        let existing_album_artwork_url = existing_album
            .as_ref()
            .and_then(|(_, url)| url.as_deref())
            .and_then(non_empty);

        let mut album_artwork_url = existing_album_artwork_url.clone();
        if album_artwork_url.is_none() {
            if let Some(artwork_data) = metadata.artwork_data.as_deref() {
                album_artwork_url = self.upload_artwork_and_build_url(artwork_data).await?;
            }
        }
        if album_artwork_url.is_none() {
            album_artwork_url = fallback_artwork_url.clone();
        }

        let mut artist_image_url = existing_artist_image_url.clone();
        if artist_image_url.is_none() {
            artist_image_url = fallback_artist_image_url.clone();
        }
        if artist_image_url.is_none() {
            artist_image_url = album_artwork_url.clone();
        }

        let itunes_metadata = itunes_result.as_ref().map(|result| {
            json!({
                "track_name": result.track_name,
                "artist_name": result.artist_name,
                "album_name": result.collection_name,
                "artwork_url_100": result.artwork_url_100,
                "primary_genre_name": result.primary_genre_name,
                "release_date": result.release_date,
            })
        });

        let artist_metadata_json = json!({
            "name": artist_name.clone(),
            "image_url": artist_image_url.clone(),
            "source": {
                "itunes_fallback_used": itunes_used,
            },
            "itunes": itunes_metadata.clone(),
        });

        let album_metadata_json = json!({
            "title": album_title.clone(),
            "artist": artist_name.clone(),
            "year": metadata.year,
            "genre": metadata.genre.clone(),
            "artwork_url": album_artwork_url.clone(),
            "source": {
                "local_embedded_artwork": metadata.artwork_data.as_ref().is_some_and(|data| !data.is_empty()),
                "itunes_fallback_used": itunes_used,
            },
            "itunes": itunes_metadata.clone(),
        });

        let track_metadata_json = json!({
            "title": metadata.title.clone(),
            "artist": artist_name.clone(),
            "album": album_title.clone(),
            "track_number": metadata.track_number,
            "disc_number": metadata.disc_number,
            "genre": metadata.genre.clone(),
            "year": metadata.year,
            "duration_secs": metadata.duration_secs,
            "format": metadata.format.clone(),
            "bitrate": metadata.bitrate,
            "sample_rate": metadata.sample_rate,
            "artwork_url": album_artwork_url.clone(),
            "artist_image_url": artist_image_url.clone(),
            "source": {
                "local_tags": true,
                "local_embedded_artwork": metadata.artwork_data.as_ref().is_some_and(|data| !data.is_empty()),
                "itunes_fallback_used": itunes_used,
            },
            "itunes": itunes_metadata,
        });

        // 5. Stream file to Storage service
        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let content_type = content_type_for_extension(&ext).to_string();

        // Build the stream: first message = metadata, then chunks
        let mut messages: Vec<StoreFileRequest> = Vec::new();

        // First message: file metadata
        messages.push(StoreFileRequest {
            data: Some(Data::Metadata(FileMetadata {
                original_filename: file_name.clone(),
                content_type,
                storage_backend: "local".to_string(),
            })),
        });

        // Subsequent messages: file data chunks
        for chunk in file_data.chunks(STREAM_CHUNK_SIZE) {
            messages.push(StoreFileRequest {
                data: Some(Data::Chunk(chunk.to_vec())),
            });
        }

        let stream = tokio_stream::iter(messages);

        let store_response = {
            let mut client = self.storage_client.lock().await;
            client
                .store_file(Request::new(stream))
                .await
                .map_err(|e| Status::internal(format!("Storage service error: {e}")))?
                .into_inner()
        };

        tracing::info!(
            file_id = %store_response.file_id,
            size_bytes = store_response.size_bytes,
            "File stored successfully"
        );

        // 6. Reuse existing artist if possible; otherwise create a new one.
        let artist_id = if let Some((existing_artist_id, existing_image_url)) = existing_artist.as_ref() {
            let artist_uuid = Uuid::parse_str(existing_artist_id)
                .map_err(|e| Status::internal(format!("Invalid artist ID from database: {e}")))?;

            let has_existing_image = existing_image_url
                .as_deref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);

            if !has_existing_image {
                repository::update_artist_enrichment_if_missing(
                    &self.pool,
                    artist_uuid,
                    artist_image_url.as_deref(),
                    Some(artist_metadata_json.clone()),
                )
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?;
            }

            existing_artist_id.clone()
        } else {
            let artist_response = {
                let mut client = self.catalog_client.lock().await;
                client
                    .create_artist(Request::new(CreateArtistRequest {
                        name: artist_name.clone(),
                        bio: String::new(),
                        image_url: artist_image_url.clone().unwrap_or_default(),
                        metadata_json: artist_metadata_json.to_string(),
                    }))
                    .await
                    .map_err(|e| Status::internal(format!("Catalog service error (create artist): {e}")))?
                    .into_inner()
            };

            artist_response.id
        };

        // 7. Reuse existing album for this artist/title if possible; otherwise create.
        let album_id = if let Some((existing_album_id, existing_artwork_url)) = existing_album.as_ref() {
            let album_uuid = Uuid::parse_str(existing_album_id)
                .map_err(|e| Status::internal(format!("Invalid album ID from database: {e}")))?;

            let has_existing_artwork = existing_artwork_url
                .as_deref()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);

            if !has_existing_artwork {
                repository::update_album_enrichment_if_missing(
                    &self.pool,
                    album_uuid,
                    album_artwork_url.as_deref(),
                    Some(album_metadata_json.clone()),
                )
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?;
            }

            existing_album_id.clone()
        } else {
            let album_response = {
                let mut client = self.catalog_client.lock().await;
                client
                    .create_album(Request::new(CreateAlbumRequest {
                        title: album_title.clone(),
                        artist_id: artist_id.clone(),
                        year: metadata.year,
                        genre: metadata.genre.clone(),
                        artwork_url: album_artwork_url.clone().unwrap_or_default(),
                        metadata_json: album_metadata_json.to_string(),
                    }))
                    .await
                    .map_err(|e| Status::internal(format!("Catalog service error (create album): {e}")))?
                    .into_inner()
            };

            album_response.id
        };

        // 8. Create track in Catalog
        let track_response = {
            let mut client = self.catalog_client.lock().await;
            client
                .create_track(Request::new(CreateTrackRequest {
                    title: metadata.title.clone(),
                    artist_id: artist_id.clone(),
                    album_id: album_id.clone(),
                    duration_secs: metadata.duration_secs,
                    track_number: metadata.track_number,
                    disc_number: metadata.disc_number,
                    genre: metadata.genre.clone(),
                    year: metadata.year,
                    file_hash: file_hash.clone(),
                    storage_file_id: store_response.file_id.clone(),
                    metadata_json: track_metadata_json.to_string(),
                }))
                .await
                .map_err(|e| Status::internal(format!("Catalog service error (create track): {e}")))?
                .into_inner()
        };

        let track_id = track_response.id;
        tracing::info!(track_id = %track_id, title = %metadata.title, "Track ingested successfully");

        Ok(Response::new(IngestResponse {
            track_id,
            status: "ingested".to_string(),
            is_duplicate: false,
            metadata: Some(IngestedMetadata {
                title: metadata.title,
                artist: metadata.artist,
                album: metadata.album,
                track_number: metadata.track_number,
                disc_number: metadata.disc_number,
                genre: metadata.genre,
                year: metadata.year,
                duration_secs: metadata.duration_secs,
                format: metadata.format,
                bitrate: metadata.bitrate,
                sample_rate: metadata.sample_rate,
            }),
        }))
    }

    async fn ingest_scan(
        &self,
        request: Request<IngestScanRequest>,
    ) -> Result<Response<IngestScanResponse>, Status> {
        let req = request.into_inner();
        let scan_uuid = Uuid::parse_str(&req.scan_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid scan_id: {e}")))?;

        // Take the paths out of the cache so a re-run with the same scan_id
        // doesn't duplicate work; if the caller wants to retry, they re-scan.
        let paths = {
            let mut scans = self.scans.lock().await;
            scans.remove(&scan_uuid)
        };

        let paths = paths.ok_or_else(|| {
            Status::not_found(format!(
                "Scan {scan_uuid} not found or already consumed. Re-run ScanDirectory first."
            ))
        })?;

        let total = paths.len() as i32;
        tracing::info!(scan_id = %scan_uuid, total, "IngestScan starting");

        let mut imported = 0i32;
        let mut duplicates = 0i32;
        let mut failed = 0i32;
        let mut errors: Vec<IngestScanError> = Vec::new();

        for path in &paths {
            let file_path_str = path.to_string_lossy().to_string();
            let inner_req = IngestFileRequest {
                file_path: file_path_str.clone(),
                force_reimport: req.force_reimport,
            };

            match self.ingest_file(Request::new(inner_req)).await {
                Ok(response) => {
                    let resp = response.into_inner();
                    if resp.is_duplicate {
                        duplicates += 1;
                    } else {
                        imported += 1;
                    }
                }
                Err(status) => {
                    failed += 1;
                    if errors.len() < MAX_INGEST_SCAN_ERRORS {
                        errors.push(IngestScanError {
                            file_path: file_path_str,
                            error: status.message().to_string(),
                        });
                    }
                }
            }
        }

        tracing::info!(
            scan_id = %scan_uuid,
            total, imported, duplicates, failed,
            "IngestScan complete"
        );

        Ok(Response::new(IngestScanResponse {
            scan_id: scan_uuid.to_string(),
            total,
            imported,
            duplicates,
            failed,
            errors,
        }))
    }

    async fn get_scan_status(
        &self,
        _request: Request<GetScanStatusRequest>,
    ) -> Result<Response<ScanStatusResponse>, Status> {
        Err(Status::unimplemented(
            "GetScanStatus not yet implemented (MVP)",
        ))
    }

    async fn list_scans(
        &self,
        _request: Request<ListScansRequest>,
    ) -> Result<Response<ListScansResponse>, Status> {
        Err(Status::unimplemented(
            "ListScans not yet implemented (MVP)",
        ))
    }
}
