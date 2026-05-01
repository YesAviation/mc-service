mod models;
mod repository;
mod server;

use std::sync::Arc;

use anyhow::Result;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::storage::LocalStorage;
use music_common::telemetry;
use music_proto::storage::v1::storage_service_server::StorageServiceServer;
use tonic::transport::Server;

use crate::server::StorageServiceImpl;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting storage service...");

    // Initialize database connection pool
    let pool = create_pg_pool(&config.database).await?;
    tracing::info!("Database pool created");

    // Initialize storage backend
    let storage = Arc::new(LocalStorage::new(&config.storage.local_path));
    tracing::info!(path = %config.storage.local_path, "Local storage backend initialized");

    // Build the gRPC service
    let storage_service = StorageServiceImpl::new(pool, storage, config.jwt.clone());

    let addr = format!("0.0.0.0:{}", config.services.storage.grpc_port).parse()?;
    tracing::info!(%addr, "Storage gRPC server listening");

    Server::builder()
        .add_service(StorageServiceServer::new(storage_service))
        .serve(addr)
        .await?;

    Ok(())
}
