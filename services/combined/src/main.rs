use std::sync::Arc;

use anyhow::Result;
use axum::Router;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::shutdown::shutdown_signal;
use music_common::storage::LocalStorage;
use music_common::telemetry;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tonic::transport::Server;
use tower_http::trace::TraceLayer;

use music_proto::auth::v1::auth_service_server::AuthServiceServer;
use music_proto::catalog::v1::catalog_service_server::CatalogServiceServer;
use music_proto::ingestion::v1::ingestion_service_server::IngestionServiceServer;
use music_proto::playlist::v1::playlist_service_server::PlaylistServiceServer;
use music_proto::storage::v1::storage_service_server::StorageServiceServer;
use music_proto::stream::v1::stream_service_server::StreamServiceServer;
use music_proto::transcoding::v1::transcoding_service_server::TranscodingServiceServer;

use music_proto::catalog::v1::catalog_service_client::CatalogServiceClient;
use music_proto::storage::v1::storage_service_client::StorageServiceClient;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting Music Server (combined mode)");
    tracing::info!("Version: {}", env!("CARGO_PKG_VERSION"));

    let pool = create_pg_pool(&config.database).await?;
    tracing::info!("Database pool created");

    tracing::info!("Running database migrations...");
    sqlx::migrate!("../../migrations/postgres")
        .run(&pool)
        .await?;
    tracing::info!("Migrations complete");

    let storage: Arc<dyn music_common::storage::StorageBackend> =
        Arc::new(LocalStorage::new(&config.storage.local_path));
    tracing::info!(path = %config.storage.local_path, "Local storage backend initialized");

    // Each spawned server logs and exits its task on failure rather than
    // panicking the whole process. The top-level `select!` below waits on
    // either the main gateway shutting down OR a ctrl-c / SIGTERM.
    let mut task_handles: Vec<(&'static str, JoinHandle<()>)> = Vec::new();

    // Auth
    let auth_service =
        music_auth::server::AuthServiceImpl::new(pool.clone(), config.jwt.clone());
    let auth_addr = format!("0.0.0.0:{}", config.services.auth.grpc_port).parse()?;
    tracing::info!(%auth_addr, "Starting auth gRPC");
    task_handles.push((
        "auth",
        tokio::spawn(async move {
            if let Err(e) = Server::builder()
                .add_service(AuthServiceServer::new(auth_service))
                .serve_with_shutdown(auth_addr, shutdown_signal())
                .await
            {
                tracing::error!(service = "auth", error = %e, "gRPC server exited with error");
            }
        }),
    ));

    // Catalog
    let catalog_service = music_catalog::server::CatalogServiceImpl::new(pool.clone());
    let catalog_addr = format!("0.0.0.0:{}", config.services.catalog.grpc_port).parse()?;
    tracing::info!(%catalog_addr, "Starting catalog gRPC");
    task_handles.push((
        "catalog",
        tokio::spawn(async move {
            if let Err(e) = Server::builder()
                .add_service(CatalogServiceServer::new(catalog_service))
                .serve_with_shutdown(catalog_addr, shutdown_signal())
                .await
            {
                tracing::error!(service = "catalog", error = %e, "gRPC server exited with error");
            }
        }),
    ));

    // Storage
    let storage_service = music_storage::server::StorageServiceImpl::new(
        pool.clone(),
        Arc::clone(&storage),
        config.jwt.clone(),
    );
    let storage_addr = format!("0.0.0.0:{}", config.services.storage.grpc_port).parse()?;
    tracing::info!(%storage_addr, "Starting storage gRPC");
    task_handles.push((
        "storage",
        tokio::spawn(async move {
            if let Err(e) = Server::builder()
                .add_service(StorageServiceServer::new(storage_service))
                .serve_with_shutdown(storage_addr, shutdown_signal())
                .await
            {
                tracing::error!(service = "storage", error = %e, "gRPC server exited with error");
            }
        }),
    ));

    // Streaming (gRPC + HTTP)
    let stream_grpc_port = config.services.stream.grpc_port;
    let stream_http_port = stream_grpc_port + 1000;

    let stream_public_base_url = config
        .stream
        .public_base_url
        .clone()
        .unwrap_or_else(|| format!("http://localhost:{stream_http_port}"));

    let stream_service = music_stream::server::StreamServiceImpl::new(
        Arc::clone(&storage),
        &config.jwt.secret,
        config.stream.signed_url_ttl_secs,
        stream_public_base_url,
    )?;
    let stream_grpc_addr = format!("0.0.0.0:{stream_grpc_port}").parse()?;
    tracing::info!(%stream_grpc_addr, "Starting stream gRPC");
    task_handles.push((
        "stream-grpc",
        tokio::spawn(async move {
            if let Err(e) = Server::builder()
                .add_service(StreamServiceServer::new(stream_service))
                .serve_with_shutdown(stream_grpc_addr, shutdown_signal())
                .await
            {
                tracing::error!(service = "stream-grpc", error = %e, "gRPC server exited with error");
            }
        }),
    ));

    let stream_http_state = music_stream::handlers::StreamHttpState::new(
        pool.clone(),
        Arc::clone(&storage),
        &config.jwt.secret,
    )?;
    let stream_cors = music_common::cors::build_layer(&config.gateway.cors_origins)?;
    let stream_http_app = Router::new()
        .route(
            "/stream/files/{file_id}",
            axum::routing::get(music_stream::handlers::file_asset),
        )
        .route(
            "/stream/{track_id}/master.m3u8",
            axum::routing::get(music_stream::handlers::master_manifest),
        )
        .route(
            "/stream/{track_id}/{bitrate}/playlist.m3u8",
            axum::routing::get(music_stream::handlers::variant_manifest),
        )
        .route(
            "/stream/{track_id}/{bitrate}/{segment}",
            axum::routing::get(music_stream::handlers::segment),
        )
        .with_state(stream_http_state)
        .layer(stream_cors);

    let stream_http_addr = format!("0.0.0.0:{stream_http_port}");
    let stream_http_listener = TcpListener::bind(&stream_http_addr).await?;
    tracing::info!(%stream_http_addr, "Starting stream HTTP server");
    task_handles.push((
        "stream-http",
        tokio::spawn(async move {
            if let Err(e) = axum::serve(stream_http_listener, stream_http_app)
                .with_graceful_shutdown(shutdown_signal())
                .await
            {
                tracing::error!(service = "stream-http", error = %e, "HTTP server exited with error");
            }
        }),
    ));

    // Give gRPC servers a moment to bind before services that connect to them.
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Transcoding (needs Storage gRPC client)
    let storage_client_for_transcoding = StorageServiceClient::connect(format!(
        "http://127.0.0.1:{}",
        config.services.storage.grpc_port
    ))
    .await?;
    let transcoding_service = music_transcoding::server::TranscodingServiceImpl::new(
        pool.clone(),
        storage_client_for_transcoding,
        config.transcoding.clone(),
        config.storage.local_path.clone(),
    );
    let transcoding_addr =
        format!("0.0.0.0:{}", config.services.transcoding.grpc_port).parse()?;
    tracing::info!(%transcoding_addr, "Starting transcoding gRPC");
    task_handles.push((
        "transcoding",
        tokio::spawn(async move {
            if let Err(e) = Server::builder()
                .add_service(TranscodingServiceServer::new(transcoding_service))
                .serve_with_shutdown(transcoding_addr, shutdown_signal())
                .await
            {
                tracing::error!(service = "transcoding", error = %e, "gRPC server exited with error");
            }
        }),
    ));

    // Ingestion (needs Storage + Catalog gRPC clients)
    let storage_client_for_ingestion = StorageServiceClient::connect(format!(
        "http://127.0.0.1:{}",
        config.services.storage.grpc_port
    ))
    .await?;
    let catalog_client_for_ingestion = CatalogServiceClient::connect(format!(
        "http://127.0.0.1:{}",
        config.services.catalog.grpc_port
    ))
    .await?;
    let ingestion_service = music_ingestion::server::IngestionServiceImpl::new(
        pool.clone(),
        storage_client_for_ingestion,
        catalog_client_for_ingestion,
        format!("http://127.0.0.1:{stream_http_port}"),
    );
    let ingestion_addr =
        format!("0.0.0.0:{}", config.services.ingestion.grpc_port).parse()?;
    tracing::info!(%ingestion_addr, "Starting ingestion gRPC");
    task_handles.push((
        "ingestion",
        tokio::spawn(async move {
            if let Err(e) = Server::builder()
                .add_service(IngestionServiceServer::new(ingestion_service))
                .serve_with_shutdown(ingestion_addr, shutdown_signal())
                .await
            {
                tracing::error!(service = "ingestion", error = %e, "gRPC server exited with error");
            }
        }),
    ));

    // Playlist
    let playlist_service = music_playlist::server::PlaylistServiceImpl::new(pool.clone());
    let playlist_addr = format!("0.0.0.0:{}", config.services.playlist.grpc_port).parse()?;
    tracing::info!(%playlist_addr, "Starting playlist gRPC");
    task_handles.push((
        "playlist",
        tokio::spawn(async move {
            if let Err(e) = Server::builder()
                .add_service(PlaylistServiceServer::new(playlist_service))
                .serve_with_shutdown(playlist_addr, shutdown_signal())
                .await
            {
                tracing::error!(service = "playlist", error = %e, "gRPC server exited with error");
            }
        }),
    ));

    // API Gateway (main foreground server)
    let gateway_state = music_gateway::state::AppState::new(&config).await?;
    let gateway_cors = music_common::cors::build_layer(&config.gateway.cors_origins)?;
    let gateway_app = Router::new()
        .nest(
            "/api",
            music_gateway::routes::api_routes(config.clone()),
        )
        .with_state(gateway_state)
        .layer(TraceLayer::new_for_http())
        .layer(gateway_cors);

    let gateway_addr = format!("0.0.0.0:{}", config.gateway.port);
    let gateway_listener = TcpListener::bind(&gateway_addr).await?;
    tracing::info!(%gateway_addr, "API Gateway listening");
    tracing::info!("All services started. Music Server is ready.");

    axum::serve(gateway_listener, gateway_app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("Gateway shut down, waiting for background services to drain...");
    for (name, handle) in task_handles {
        if let Err(e) = handle.await {
            tracing::error!(service = %name, error = %e, "background task panicked");
        }
    }
    tracing::info!("Shutdown complete");

    Ok(())
}
