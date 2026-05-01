mod models;
mod repository;
mod server;

use anyhow::Result;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::telemetry;
use music_proto::storage::v1::storage_service_client::StorageServiceClient;
use music_proto::transcoding::v1::transcoding_service_server::TranscodingServiceServer;
use tonic::transport::Server;

use crate::server::TranscodingServiceImpl;

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

    tracing::info!("Starting transcoding service...");

    // Initialize database connection pool
    let pool = create_pg_pool(&config.database).await?;
    tracing::info!("Database pool created");

    // Create gRPC client connection to Storage service
    let storage_addr = grpc_endpoint("STORAGE_GRPC_ADDR", config.services.storage.grpc_port);

    tracing::info!(storage = %storage_addr, "Connecting to storage service");

    let storage_client = StorageServiceClient::connect(storage_addr).await?;

    tracing::info!("Connected to storage service");

    // Build the gRPC service
    let transcoding_service = TranscodingServiceImpl::new(
        pool,
        storage_client,
        config.transcoding.clone(),
        config.storage.local_path.clone(),
    );

    let addr = format!("0.0.0.0:{}", config.services.transcoding.grpc_port).parse()?;
    tracing::info!(%addr, "Transcoding gRPC server listening");

    Server::builder()
        .add_service(TranscodingServiceServer::new(transcoding_service))
        .serve(addr)
        .await?;

    Ok(())
}
