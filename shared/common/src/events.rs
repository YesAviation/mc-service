use lapin::{
    options::{BasicConsumeOptions, BasicPublishOptions, QueueDeclareOptions},
    types::FieldTable,
    BasicProperties, Channel, Connection, ConnectionProperties,
};
use tracing::info;

use crate::config::RabbitmqConfig;
use crate::error::AppError;

pub struct EventBus {
    connection: Connection,
}

impl EventBus {
    pub async fn connect(config: &RabbitmqConfig) -> Result<Self, AppError> {
        info!("Connecting to RabbitMQ at {}", config.url);

        let connection =
            Connection::connect(&config.url, ConnectionProperties::default())
                .await
                .map_err(AppError::Rabbitmq)?;

        info!("RabbitMQ connection established");
        Ok(Self { connection })
    }

    pub async fn create_channel(&self) -> Result<Channel, AppError> {
        self.connection
            .create_channel()
            .await
            .map_err(AppError::Rabbitmq)
    }

    pub async fn publish(
        &self,
        channel: &Channel,
        exchange: &str,
        routing_key: &str,
        payload: &[u8],
    ) -> Result<(), AppError> {
        channel
            .basic_publish(
                exchange,
                routing_key,
                BasicPublishOptions::default(),
                payload,
                BasicProperties::default()
                    .with_content_type("application/json".into()),
            )
            .await
            .map_err(AppError::Rabbitmq)?
            .await
            .map_err(AppError::Rabbitmq)?;

        Ok(())
    }

    pub async fn declare_queue(
        &self,
        channel: &Channel,
        queue_name: &str,
    ) -> Result<(), AppError> {
        channel
            .queue_declare(
                queue_name,
                QueueDeclareOptions::default(),
                FieldTable::default(),
            )
            .await
            .map_err(AppError::Rabbitmq)?;

        Ok(())
    }

    pub async fn consume(
        &self,
        channel: &Channel,
        queue_name: &str,
        consumer_tag: &str,
    ) -> Result<lapin::Consumer, AppError> {
        let consumer = channel
            .basic_consume(
                queue_name,
                consumer_tag,
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await
            .map_err(AppError::Rabbitmq)?;

        Ok(consumer)
    }
}
