use sqlx::PgPool;
use tracing::info;

use crate::config::DatabaseConfig;

pub async fn create_pg_pool(config: &DatabaseConfig) -> Result<PgPool, sqlx::Error> {
    info!("Connecting to PostgreSQL at {}", config.url);

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .connect(&config.url)
        .await?;

    info!("PostgreSQL connection pool established");
    Ok(pool)
}

#[cfg(feature = "sqlite")]
pub async fn create_sqlite_pool(
    config: &DatabaseConfig,
) -> Result<sqlx::SqlitePool, sqlx::Error> {
    info!("Connecting to SQLite at {}", config.sqlite_path);

    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(config.max_connections)
        .connect(&format!("sqlite:{}", config.sqlite_path))
        .await?;

    info!("SQLite connection pool established");
    Ok(pool)
}
