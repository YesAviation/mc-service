use anyhow::Result;
use music_common::config::AppConfig;
use music_common::db::create_pg_pool;
use music_common::telemetry;
use music_proto::playlist::v1::playlist_service_server::PlaylistServiceServer;
use tonic::transport::Server;

use music_playlist::server::PlaylistServiceImpl;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting playlist service...");

    let pool = create_pg_pool(&config.database).await?;
    let service = PlaylistServiceImpl::new(pool);
    let addr = format!("0.0.0.0:{}", config.services.playlist.grpc_port).parse()?;

    tracing::info!(%addr, "Playlist gRPC listening");

    Server::builder()
        .add_service(PlaylistServiceServer::new(service))
        .serve(addr)
        .await?;

    Ok(())
}
