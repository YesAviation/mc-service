mod server;
mod models;
mod repository;

use anyhow::Result;
use music_common::config::AppConfig;
use music_common::telemetry;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    tracing::info!("Starting service...");

    // TODO: Initialize database connection
    // TODO: Start gRPC server

    Ok(())
}
