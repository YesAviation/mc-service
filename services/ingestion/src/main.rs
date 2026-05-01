mod models;
mod repository;
mod server;

use anyhow::Result;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::telemetry;
use music_proto::catalog::v1::catalog_service_client::CatalogServiceClient;
use music_proto::ingestion::v1::ingestion_service_server::IngestionServiceServer;
use music_proto::storage::v1::storage_service_client::StorageServiceClient;
use tonic::transport::Server;

use crate::server::IngestionServiceImpl;

fn grpc_endpoint(env_key: &str, default_port: u16) -> String {
    std::env::var(env_key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("http://127.0.0.1:{default_port}"))
}

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting ingestion service...");

    // Initialize database connection pool
    let pool = create_pg_pool(&config.database).await?;
    tracing::info!("Database pool created");

    // Create gRPC client connections to dependent services
    let storage_addr = grpc_endpoint("STORAGE_GRPC_ADDR", config.services.storage.grpc_port);
    let catalog_addr = grpc_endpoint("CATALOG_GRPC_ADDR", config.services.catalog.grpc_port);
    let stream_http_base_url = std::env::var("STREAM_HTTP_BASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            format!(
                "http://127.0.0.1:{}",
                config.services.stream.grpc_port + 1000
            )
        });

    tracing::info!(storage = %storage_addr, catalog = %catalog_addr, stream_http = %stream_http_base_url, "Connecting to dependent services");

    let storage_client = StorageServiceClient::connect(storage_addr).await?;
    let catalog_client = CatalogServiceClient::connect(catalog_addr).await?;

    tracing::info!("Connected to storage and catalog services");

    // Build the gRPC service
    let ingestion_service = IngestionServiceImpl::new(
        pool,
        storage_client,
        catalog_client,
        stream_http_base_url,
    );

    let addr = format!("0.0.0.0:{}", config.services.ingestion.grpc_port).parse()?;
    tracing::info!(%addr, "Ingestion gRPC server listening");

    Server::builder()
        .add_service(IngestionServiceServer::new(ingestion_service))
        .serve(addr)
        .await?;

    Ok(())
}
