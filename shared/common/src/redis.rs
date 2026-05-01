use redis::aio::ConnectionManager;
use tracing::info;

use crate::config::RedisConfig;

pub async fn create_redis_connection(
    config: &RedisConfig,
) -> Result<ConnectionManager, redis::RedisError> {
    info!("Connecting to Redis at {}", config.url);

    let client = redis::Client::open(config.url.as_str())?;
    let manager = ConnectionManager::new(client).await?;

    info!("Redis connection established");
    Ok(manager)
}
