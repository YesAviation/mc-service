mod models;
mod repository;
mod server;

use anyhow::Result;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::telemetry;
use music_proto::auth::v1::auth_service_server::AuthServiceServer;
use tonic::transport::Server;

use crate::server::AuthServiceImpl;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting auth service...");

    // Initialize database connection pool
    let pool = create_pg_pool(&config.database).await?;
    tracing::info!("Database pool created");

    // Build the gRPC service
    let auth_service = AuthServiceImpl::new(pool, config.jwt.clone());

    let addr = format!("0.0.0.0:{}", config.services.auth.grpc_port).parse()?;
    tracing::info!(%addr, "Auth gRPC server listening");

    Server::builder()
        .add_service(AuthServiceServer::new(auth_service))
        .serve(addr)
        .await?;

    Ok(())
}
