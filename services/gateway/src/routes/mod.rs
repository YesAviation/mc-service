pub mod auth;
pub mod catalog;
pub mod health;
pub mod hls;
pub mod ingestion;
pub mod playlist;
pub mod settings;
pub mod stream;

use axum::middleware;
use axum::Router;
use music_common::middleware::auth_middleware;

use crate::state::AppState;

pub fn api_routes(config: music_common::config::AppConfig) -> Router<AppState> {
    let jwt_config = config.jwt.clone();

    Router::new()
        .nest("/auth", auth::routes())
        .nest("/catalog", {
            // Catalog endpoints all require authentication. The PATCH endpoints
            // additionally check `auth_user.role == Admin` inside their handler.
            let jwt_config = config.jwt.clone();
            catalog::routes().layer(middleware::from_fn(move |req, next| {
                let cfg = jwt_config.clone();
                auth_middleware(cfg, req, next)
            }))
        })
        .nest("/hls", hls::routes())
        .nest(
            "/playlists",
            {
                let jwt_config = config.jwt.clone();
                playlist::routes().layer(middleware::from_fn(move |req, next| {
                    let cfg = jwt_config.clone();
                    auth_middleware(cfg, req, next)
                }))
            },
        )
        .nest(
            "/stream",
            stream::routes().layer(middleware::from_fn(move |req, next| {
                let cfg = jwt_config.clone();
                auth_middleware(cfg, req, next)
            })),
        )
        .nest("/ingest", {
            let jwt_config = config.jwt.clone();
            ingestion::routes().layer(middleware::from_fn(move |req, next| {
                let cfg = jwt_config.clone();
                auth_middleware(cfg, req, next)
            }))
        })
        .nest("/settings", {
            let jwt_config = config.jwt.clone();
            settings::routes().layer(middleware::from_fn(move |req, next| {
                let cfg = jwt_config.clone();
                auth_middleware(cfg, req, next)
            }))
        })
        .merge(health::routes())
}
