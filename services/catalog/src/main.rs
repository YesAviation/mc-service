mod models;
mod repository;
mod server;

use anyhow::Result;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::telemetry;
use music_proto::catalog::v1::catalog_service_server::CatalogServiceServer;
use tonic::transport::Server;

use crate::server::CatalogServiceImpl;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting catalog service...");

    // Initialize database connection pool
    let pool = create_pg_pool(&config.database).await?;
    tracing::info!("Database pool created");

    // Build the gRPC service
    let catalog_service = CatalogServiceImpl::new(pool);

    let addr = format!("0.0.0.0:{}", config.services.catalog.grpc_port).parse()?;
    tracing::info!(%addr, "Catalog gRPC server listening");

    Server::builder()
        .add_service(CatalogServiceServer::new(catalog_service))
        .serve(addr)
        .await?;

    Ok(())
}
