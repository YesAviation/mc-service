mod handlers;
mod models;
mod repository;
mod server;

use std::sync::Arc;

use anyhow::Result;
use axum::Router;
use axum::routing::get;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::storage::LocalStorage;
use music_common::telemetry;
use music_proto::stream::v1::stream_service_server::StreamServiceServer;
use music_common::shutdown::shutdown_signal;
use tokio::net::TcpListener;
use tonic::transport::Server;
use tower_http::cors::CorsLayer;

use crate::handlers::StreamHttpState;
use crate::server::StreamServiceImpl;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting streaming service...");

    let pool = create_pg_pool(&config.database).await?;
    tracing::info!("Database pool created");

    let storage: Arc<dyn music_common::storage::StorageBackend> =
        Arc::new(LocalStorage::new(&config.storage.local_path));
    tracing::info!(path = %config.storage.local_path, "Local storage backend initialized");

    let grpc_port = config.services.stream.grpc_port;
    let http_port = grpc_port + 1000;

    let public_base_url = config
        .stream
        .public_base_url
        .clone()
        .unwrap_or_else(|| format!("http://localhost:{http_port}"));

    let grpc_service = StreamServiceImpl::new(
        Arc::clone(&storage),
        &config.jwt.secret,
        config.stream.signed_url_ttl_secs,
        public_base_url,
    )?;

    let grpc_addr = format!("0.0.0.0:{grpc_port}").parse()?;
    tracing::info!(%grpc_addr, "Stream gRPC server listening");

    let grpc_handle = tokio::spawn(async move {
        if let Err(e) = Server::builder()
            .add_service(StreamServiceServer::new(grpc_service))
            .serve_with_shutdown(grpc_addr, shutdown_signal())
            .await
        {
            tracing::error!(error = %e, "stream gRPC server exited with error");
        }
    });

    let http_state = StreamHttpState::new(pool, Arc::clone(&storage), &config.jwt.secret)?;

    let app = Router::new()
        .route("/stream/files/{file_id}", get(handlers::file_asset))
        .route(
            "/stream/{track_id}/master.m3u8",
            get(handlers::master_manifest),
        )
        .route(
            "/stream/{track_id}/{bitrate}/playlist.m3u8",
            get(handlers::variant_manifest),
        )
        .route(
            "/stream/{track_id}/{bitrate}/{segment}",
            get(handlers::segment),
        )
        .with_state(http_state)
        .layer(build_cors(&config.gateway.cors_origins)?);

    let http_addr = format!("0.0.0.0:{http_port}");
    let listener = TcpListener::bind(&http_addr).await?;
    tracing::info!(%http_addr, "Stream HTTP server listening");

    let http_handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(shutdown_signal())
            .await
        {
            tracing::error!(error = %e, "stream HTTP server exited with error");
        }
    });

    tokio::select! {
        res = grpc_handle => {
            if let Err(e) = res {
                tracing::error!(error = %e, "gRPC server task panicked");
            }
        }
        res = http_handle => {
            if let Err(e) = res {
                tracing::error!(error = %e, "HTTP server task panicked");
            }
        }
    }

    Ok(())
}

fn build_cors(origins: &[String]) -> Result<CorsLayer> {
    music_common::cors::build_layer(origins)
}
