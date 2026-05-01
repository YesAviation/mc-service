use std::sync::Arc;

use hmac::{Hmac, Mac};
use sha2::Sha256;
use tonic::{Request, Response, Status};

use music_common::storage::StorageBackend;
use music_proto::stream::v1::stream_service_server::StreamService;
use music_proto::stream::v1::{
    GetManifestRequest, GetSegmentRequest, GetStreamUrlRequest, ManifestResponse, SegmentResponse,
    StreamUrlResponse,
};

type HmacSha256 = Hmac<Sha256>;

pub struct StreamServiceImpl {
    storage: Arc<dyn StorageBackend>,
    signed_url_ttl_secs: i64,
    /// Prebuilt keyed HMAC; cloned per request to avoid re-initialization.
    mac_template: HmacSha256,
    /// Absolute base URL (no trailing slash) used to build signed URLs.
    public_base_url: String,
}

impl StreamServiceImpl {
    /// Construct the stream gRPC service.
    ///
    /// Validates the HMAC key at construction so a misconfigured secret fails
    /// at startup rather than per-request.
    pub fn new(
        storage: Arc<dyn StorageBackend>,
        jwt_secret: &str,
        signed_url_ttl_secs: i64,
        public_base_url: String,
    ) -> Result<Self, anyhow::Error> {
        let mac_template = HmacSha256::new_from_slice(jwt_secret.as_bytes())
            .map_err(|e| anyhow::anyhow!("invalid HMAC key for stream signing: {e}"))?;
        Ok(Self {
            storage,
            signed_url_ttl_secs,
            mac_template,
            public_base_url: public_base_url.trim_end_matches('/').to_string(),
        })
    }

    /// Generate a signed URL for the master manifest of a track.
    fn generate_manifest_url(&self, track_id: &str, expires_at: i64) -> String {
        let message = format!("{track_id}:{expires_at}");
        let mut mac = self.mac_template.clone();
        mac.update(message.as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());

        format!(
            "{}/api/hls/{track_id}/master.m3u8?expires={expires_at}&sig={sig}",
            self.public_base_url
        )
    }
}

#[tonic::async_trait]
impl StreamService for StreamServiceImpl {
    /// Generate a signed URL pointing to the HTTP server's master manifest
    /// endpoint for the requested track.
    async fn get_stream_url(
        &self,
        request: Request<GetStreamUrlRequest>,
    ) -> Result<Response<StreamUrlResponse>, Status> {
        let req = request.into_inner();

        if req.track_id.is_empty() {
            return Err(Status::invalid_argument("track_id is required"));
        }
        if req.user_id.is_empty() {
            return Err(Status::invalid_argument("user_id is required"));
        }

        tracing::info!(
            track_id = %req.track_id,
            user_id = %req.user_id,
            "Generating stream URL"
        );

        let expires_at = chrono::Utc::now().timestamp() + self.signed_url_ttl_secs;
        let manifest_url = self.generate_manifest_url(&req.track_id, expires_at);

        Ok(Response::new(StreamUrlResponse {
            manifest_url,
            expires_at,
        }))
    }

    /// Return manifest content via gRPC. This is a convenience stub — the
    /// primary path is the HTTP endpoint.
    async fn get_manifest(
        &self,
        request: Request<GetManifestRequest>,
    ) -> Result<Response<ManifestResponse>, Status> {
        let req = request.into_inner();

        if req.track_id.is_empty() {
            return Err(Status::invalid_argument("track_id is required"));
        }

        let storage_path = format!("hls/{}/master.m3u8", req.track_id);
        let data = self
            .storage
            .retrieve(&storage_path)
            .await
            .map_err(|e| Status::not_found(format!("Manifest not found: {e}")))?;

        Ok(Response::new(ManifestResponse {
            content_type: "application/vnd.apple.mpegurl".to_string(),
            manifest_data: data,
        }))
    }

    /// Return a segment via gRPC. This is a convenience stub — the primary
    /// path is the HTTP endpoint.
    async fn get_segment(
        &self,
        request: Request<GetSegmentRequest>,
    ) -> Result<Response<SegmentResponse>, Status> {
        let req = request.into_inner();

        if req.track_id.is_empty() {
            return Err(Status::invalid_argument("track_id is required"));
        }
        if req.segment_id.is_empty() {
            return Err(Status::invalid_argument("segment_id is required"));
        }

        // segment_id is expected to encode the bitrate and segment name,
        // e.g. "128/segment_000.ts"
        let storage_path = format!("hls/{}/{}", req.track_id, req.segment_id);
        let data = self
            .storage
            .retrieve(&storage_path)
            .await
            .map_err(|e| Status::not_found(format!("Segment not found: {e}")))?;

        Ok(Response::new(SegmentResponse {
            content_type: "video/mp2t".to_string(),
            segment_data: data,
        }))
    }
}
