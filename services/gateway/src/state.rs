use std::sync::Arc;

use anyhow::Result;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_proto::auth::v1::auth_service_client::AuthServiceClient;
use music_proto::catalog::v1::catalog_service_client::CatalogServiceClient;
use music_proto::ingestion::v1::ingestion_service_client::IngestionServiceClient;
use music_proto::playlist::v1::playlist_service_client::PlaylistServiceClient;
use music_proto::storage::v1::storage_service_client::StorageServiceClient;
use music_proto::stream::v1::stream_service_client::StreamServiceClient;
use music_proto::transcoding::v1::transcoding_service_client::TranscodingServiceClient;
use sqlx::PgPool;
use tokio::sync::Mutex;
use tonic::transport::Channel;

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub db_pool: PgPool,
    pub auth_client: Arc<Mutex<AuthServiceClient<Channel>>>,
    pub catalog_client: Arc<Mutex<CatalogServiceClient<Channel>>>,
    pub storage_client: Arc<Mutex<StorageServiceClient<Channel>>>,
    pub stream_client: Arc<Mutex<StreamServiceClient<Channel>>>,
    pub ingestion_client: Arc<Mutex<IngestionServiceClient<Channel>>>,
    pub playlist_client: Arc<Mutex<PlaylistServiceClient<Channel>>>,
    pub transcoding_client: Arc<Mutex<TranscodingServiceClient<Channel>>>,
    /// Base URL of the stream service's HTTP server (no trailing slash). Used
    /// by the HLS proxy to forward signed manifest/segment requests.
    pub stream_http_base: String,
    /// Shared reqwest client for proxying HLS responses to the public.
    pub http_client: reqwest::Client,
}

impl AppState {
    pub async fn new(config: &AppConfig) -> Result<Self> {
        let db_pool = create_pg_pool(&config.database).await?;

        let auth_addr = grpc_endpoint("AUTH_GRPC_ADDR", config.services.auth.grpc_port);
        let catalog_addr = grpc_endpoint("CATALOG_GRPC_ADDR", config.services.catalog.grpc_port);
        let storage_addr = grpc_endpoint("STORAGE_GRPC_ADDR", config.services.storage.grpc_port);
        let stream_addr = grpc_endpoint("STREAM_GRPC_ADDR", config.services.stream.grpc_port);
        let ingestion_addr =
            grpc_endpoint("INGESTION_GRPC_ADDR", config.services.ingestion.grpc_port);
        let playlist_addr =
            grpc_endpoint("PLAYLIST_GRPC_ADDR", config.services.playlist.grpc_port);
        let transcoding_addr =
            grpc_endpoint("TRANSCODING_GRPC_ADDR", config.services.transcoding.grpc_port);

        tracing::info!(
            auth = %auth_addr,
            catalog = %catalog_addr,
            storage = %storage_addr,
            stream = %stream_addr,
            ingestion = %ingestion_addr,
            playlist = %playlist_addr,
            transcoding = %transcoding_addr,
            "Connecting to gRPC services"
        );

        let auth_client = AuthServiceClient::connect(auth_addr).await?;
        let catalog_client = CatalogServiceClient::connect(catalog_addr).await?;
        let storage_client = StorageServiceClient::connect(storage_addr).await?;
        let stream_client = StreamServiceClient::connect(stream_addr).await?;
        let ingestion_client = IngestionServiceClient::connect(ingestion_addr).await?;
        let playlist_client = PlaylistServiceClient::connect(playlist_addr).await?;
        let transcoding_client = TranscodingServiceClient::connect(transcoding_addr).await?;

        tracing::info!("Connected to all gRPC services");

        let stream_http_port = config.services.stream.grpc_port + 1000;
        let stream_http_base = std::env::var("STREAM_HTTP_ADDR")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| format!("http://127.0.0.1:{stream_http_port}"));

        let http_client = reqwest::Client::builder()
            .pool_idle_timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| anyhow::anyhow!("failed to build HLS proxy client: {e}"))?;

        tracing::info!(%stream_http_base, "HLS proxy will forward to stream HTTP");

        Ok(Self {
            config: config.clone(),
            db_pool,
            auth_client: Arc::new(Mutex::new(auth_client)),
            catalog_client: Arc::new(Mutex::new(catalog_client)),
            storage_client: Arc::new(Mutex::new(storage_client)),
            stream_client: Arc::new(Mutex::new(stream_client)),
            ingestion_client: Arc::new(Mutex::new(ingestion_client)),
            playlist_client: Arc::new(Mutex::new(playlist_client)),
            transcoding_client: Arc::new(Mutex::new(transcoding_client)),
            stream_http_base,
            http_client,
        })
    }
}

fn grpc_endpoint(env_key: &str, default_port: u16) -> String {
    std::env::var(env_key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("http://127.0.0.1:{default_port}"))
}
