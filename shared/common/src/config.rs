use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;

pub const DEFAULT_JWT_SECRET_SENTINEL: &str = "change-me-in-production";
pub const MIN_JWT_SECRET_LEN: usize = 32;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub rabbitmq: RabbitmqConfig,
    pub jwt: JwtConfig,
    pub stream: StreamConfig,
    pub storage: StorageConfig,
    pub gateway: GatewayConfig,
    pub services: ServicesConfig,
    pub logging: LoggingConfig,
    pub transcoding: TranscodingConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub sqlite_path: String,
    pub max_connections: u32,
    pub min_connections: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RedisConfig {
    pub url: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RabbitmqConfig {
    pub url: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct JwtConfig {
    pub secret: String,
    pub access_ttl_secs: i64,
    pub refresh_ttl_secs: i64,
    pub remember_me_ttl_secs: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct StreamConfig {
    pub signed_url_ttl_secs: i64,
    /// Absolute base URL clients should use to reach the stream HTTP server
    /// (for example, `https://music.example.com` when fronted by a reverse
    /// proxy, or `http://192.168.1.10:6054` on a LAN). If not set the server
    /// falls back to `http://localhost:<port>`, which only works on the
    /// developer's local machine.
    #[serde(default)]
    pub public_base_url: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct StorageConfig {
    pub backend: String,
    pub local_path: String,
    pub s3: S3Config,
}

#[derive(Debug, Deserialize, Clone)]
pub struct S3Config {
    pub endpoint: String,
    pub access_key: String,
    pub secret_key: String,
    pub bucket: String,
    pub region: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GatewayConfig {
    pub port: u16,
    pub rate_limit_requests: u32,
    pub rate_limit_window_secs: u64,
    /// Explicit list of allowed browser origins for the gateway (and the
    /// stream HTTP server). Empty disables cross-origin access. Wildcards
    /// are rejected at startup because cookie-backed auth requires a
    /// concrete origin.
    #[serde(default)]
    pub cors_origins: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServicesConfig {
    pub auth: ServiceEndpoint,
    pub catalog: ServiceEndpoint,
    pub storage: ServiceEndpoint,
    pub stream: ServiceEndpoint,
    pub downloads: ServiceEndpoint,
    pub search: ServiceEndpoint,
    pub playlist: ServiceEndpoint,
    pub analytics: ServiceEndpoint,
    pub discovery: ServiceEndpoint,
    pub recommend: ServiceEndpoint,
    pub transcoding: ServiceEndpoint,
    pub ingestion: ServiceEndpoint,
    pub heartbeat: ServiceEndpoint,
    pub notification: ServiceEndpoint,
    pub sync: ServiceEndpoint,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServiceEndpoint {
    pub grpc_port: u16,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TranscodingConfig {
    pub ffmpeg_path: String,
    pub hls_segment_duration: u32,
    pub bitrates: Vec<u32>,
}

impl AppConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let _ = dotenvy::dotenv();

        let config = Config::builder()
            .add_source(File::with_name("configs/default").required(false))
            .add_source(File::with_name("configs/local").required(false))
            .add_source(
                Environment::default()
                    .separator("__")
                    .list_separator(",")
                    .with_list_parse_key("gateway.cors_origins")
                    .try_parsing(true),
            )
            .build()?;

        let cfg: Self = config.try_deserialize()?;
        cfg.validate()
            .map_err(|msg| ConfigError::Message(format!("config validation failed: {msg}")))?;
        Ok(cfg)
    }

    fn validate(&self) -> Result<(), String> {
        if self.jwt.secret == DEFAULT_JWT_SECRET_SENTINEL {
            return Err(format!(
                "jwt.secret is still the default sentinel '{DEFAULT_JWT_SECRET_SENTINEL}'; \
                 set JWT__SECRET to a random value of at least {MIN_JWT_SECRET_LEN} bytes"
            ));
        }
        if self.jwt.secret.len() < MIN_JWT_SECRET_LEN {
            return Err(format!(
                "jwt.secret is {} bytes; must be at least {MIN_JWT_SECRET_LEN}",
                self.jwt.secret.len()
            ));
        }
        if self.database.url.contains("REQUIRED") {
            return Err(
                "database.url is not configured; override DATABASE__URL with real credentials \
                 (e.g. postgres://user:pass@host:5432/music or sqlite:./music.db)"
                    .to_string(),
            );
        }
        for origin in &self.gateway.cors_origins {
            if origin == "*" {
                return Err(
                    "gateway.cors_origins cannot contain '*' — cookie-backed auth \
                     requires explicit origins"
                        .to_string(),
                );
            }
        }
        Ok(())
    }
}
