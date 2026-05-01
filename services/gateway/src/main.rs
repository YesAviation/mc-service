mod admin_control;
mod media_processing;
mod routes;
mod state;

use anyhow::Result;
use axum::Router;
use music_common::config::AppConfig;
use music_common::shutdown::shutdown_signal;
use music_common::telemetry;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> Result<()> {
    let config = AppConfig::load()?;
    telemetry::init_telemetry(&config.logging);

    let port = config.gateway.port;
    tracing::info!("Starting API Gateway on port {port}");

    let app_state = state::AppState::new(&config).await?;

    let cors = music_common::cors::build_layer(&config.gateway.cors_origins)?;

    let app = Router::new()
        .nest("/api", routes::api_routes(app_state.config.clone()))
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let listener = TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    tracing::info!("API Gateway listening on 0.0.0.0:{port}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}
