use std::collections::{BTreeSet, HashMap};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use sqlx::types::Json;
use sqlx::PgPool;
use uuid::Uuid;

const SETTINGS_ROW_ID: i16 = 1;
pub const MAIN_ADMIN_USERNAME: &str = "copilotcheck";

const ALLOWED_ENV_KEYS: &[&str] = &[
    "DATABASE__URL",
    "JWT__SECRET",
    "JWT__ACCESS_TTL_SECS",
    "JWT__REFRESH_TTL_SECS",
    "JWT__REMEMBER_ME_TTL_SECS",
    "GATEWAY__PORT",
    "AUTH_GRPC_ADDR",
    "CATALOG_GRPC_ADDR",
    "STORAGE_GRPC_ADDR",
    "STREAM_GRPC_ADDR",
    "INGESTION_GRPC_ADDR",
    "PLAYLIST_GRPC_ADDR",
    "TRANSCODING_GRPC_ADDR",
    "STREAM__SIGNED_URL_TTL_SECS",
];

#[derive(Debug)]
pub enum AdminControlError {
    Sql(sqlx::Error),
    BadRequest(String),
    Forbidden(String),
    NotFound(String),
}

impl From<sqlx::Error> for AdminControlError {
    fn from(value: sqlx::Error) -> Self {
        Self::Sql(value)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AdminUserAccount {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: String,
    pub is_active: bool,
    pub is_main_admin: bool,
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAdminUserRequest {
    pub username: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateAdminUserRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResetAdminUserPasswordRequest {
    pub new_password: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActionMessage {
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeEnvironmentVariable {
    pub key: String,
    pub value: String,
    pub source: String,
    pub is_sensitive: bool,
    pub override_value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerRuntimeSettings {
    pub maintenance_mode: bool,
    pub allow_user_registration: bool,
    pub default_user_role: String,
    pub max_upload_size_mb: i32,
    pub feature_flags: HashMap<String, bool>,
    pub environment_overrides: HashMap<String, String>,
    pub environment: Vec<RuntimeEnvironmentVariable>,
    pub main_admin_username: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateServerRuntimeSettingsRequest {
    pub maintenance_mode: Option<bool>,
    pub allow_user_registration: Option<bool>,
    pub default_user_role: Option<String>,
    pub max_upload_size_mb: Option<i32>,
    pub feature_flags: Option<HashMap<String, bool>>,
    pub environment_overrides: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct UserAccountRow {
    id: Uuid,
    username: String,
    email: String,
    role: String,
    is_active: bool,
    last_login_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct UserMinimalRow {
    id: Uuid,
    username: String,
    role: String,
    is_active: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct ServerRuntimeSettingsRow {
    maintenance_mode: bool,
    allow_user_registration: bool,
    default_user_role: String,
    max_upload_size_mb: i32,
    feature_flags: Json<HashMap<String, bool>>,
    env_overrides: Json<HashMap<String, String>>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_admin_users(pool: &PgPool) -> Result<Vec<AdminUserAccount>, AdminControlError> {
    let rows = sqlx::query_as::<_, UserAccountRow>(
        r#"
        SELECT
            u.id,
            u.username,
            u.email,
            u.role::text AS role,
            u.is_active,
            MAX(s.created_at) AS last_login_at,
            u.created_at,
            u.updated_at
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id
        GROUP BY u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.updated_at
        ORDER BY u.created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(map_admin_user_row).collect())
}

pub async fn update_admin_user(
    pool: &PgPool,
    user_id: Uuid,
    patch: UpdateAdminUserRequest,
) -> Result<AdminUserAccount, AdminControlError> {
    if patch.username.is_none()
        && patch.email.is_none()
        && patch.role.is_none()
        && patch.is_active.is_none()
    {
        return Err(AdminControlError::BadRequest(
            "At least one field must be provided".to_string(),
        ));
    }

    let current = get_user_minimal(pool, user_id).await?;

    let next_role = match patch.role.as_deref() {
        Some(value) => normalize_role(value)
            .ok_or_else(|| AdminControlError::BadRequest("Role must be 'admin' or 'user'".to_string()))?
            .to_string(),
        None => current.role.clone(),
    };

    let next_is_active = patch.is_active.unwrap_or(current.is_active);

    if is_main_admin_username(&current.username) && (next_role != "admin" || !next_is_active) {
        return Err(AdminControlError::Forbidden(
            "The main admin account cannot be demoted or deactivated".to_string(),
        ));
    }

    if current.role == "admin"
        && current.is_active
        && (next_role != "admin" || !next_is_active)
        && active_admin_count_excluding(pool, current.id).await? == 0
    {
        return Err(AdminControlError::Forbidden(
            "At least one active admin account is required".to_string(),
        ));
    }

    let username = patch.username.map(|value| value.trim().to_string());
    let email = patch.email.map(|value| value.trim().to_string());

    if let Some(value) = username.as_ref() {
        if value.is_empty() {
            return Err(AdminControlError::BadRequest(
                "Username cannot be empty".to_string(),
            ));
        }
    }

    if let Some(value) = email.as_ref() {
        if value.is_empty() {
            return Err(AdminControlError::BadRequest(
                "Email cannot be empty".to_string(),
            ));
        }
    }

    let update_result = sqlx::query(
        r#"
        UPDATE users
        SET username = COALESCE($2, username),
            email = COALESCE($3, email),
            role = COALESCE($4::user_role, role),
            is_active = COALESCE($5, is_active),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .bind(username)
    .bind(email)
    .bind(Some(next_role.as_str()))
    .bind(Some(next_is_active))
    .execute(pool)
    .await;

    if let Err(error) = update_result {
        if is_unique_violation(&error) {
            return Err(AdminControlError::BadRequest(
                "Username or email is already in use".to_string(),
            ));
        }

        return Err(AdminControlError::Sql(error));
    }

    get_admin_user_by_id(pool, user_id).await
}

pub async fn create_admin_user(
    pool: &PgPool,
    request: CreateAdminUserRequest,
) -> Result<AdminUserAccount, AdminControlError> {
    let username = request.username.trim().to_string();
    let email = request.email.trim().to_string();
    let password = request.password.trim();

    if username.is_empty() {
        return Err(AdminControlError::BadRequest(
            "Username is required".to_string(),
        ));
    }

    if email.is_empty() {
        return Err(AdminControlError::BadRequest(
            "Email is required".to_string(),
        ));
    }

    if password.len() < 8 {
        return Err(AdminControlError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    let role = match request.role.as_deref() {
        Some(value) => normalize_role(value)
            .ok_or_else(|| AdminControlError::BadRequest("Role must be 'admin' or 'user'".to_string()))?
            .to_string(),
        None => "user".to_string(),
    };

    let is_active = request.is_active.unwrap_or(true);
    let password_hash = hash_password(password)
        .map_err(|error| AdminControlError::BadRequest(error.to_string()))?;

    let user_id = Uuid::new_v4();
    let insert_result = sqlx::query(
        r#"
        INSERT INTO users (id, username, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, $5::user_role, $6)
        "#,
    )
    .bind(user_id)
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .bind(role)
    .bind(is_active)
    .execute(pool)
    .await;

    if let Err(error) = insert_result {
        if is_unique_violation(&error) {
            return Err(AdminControlError::BadRequest(
                "Username or email is already in use".to_string(),
            ));
        }

        return Err(AdminControlError::Sql(error));
    }

    get_admin_user_by_id(pool, user_id).await
}

pub async fn reset_admin_user_password(
    pool: &PgPool,
    user_id: Uuid,
    request: ResetAdminUserPasswordRequest,
) -> Result<ActionMessage, AdminControlError> {
    let new_password = request.new_password.trim();
    if new_password.len() < 8 {
        return Err(AdminControlError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    ensure_user_exists(pool, user_id).await?;
    let password_hash = hash_password(new_password)
        .map_err(|error| AdminControlError::BadRequest(error.to_string()))?;

    sqlx::query(
        r#"
        UPDATE users
        SET password_hash = $2,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .bind(password_hash)
    .execute(pool)
    .await?;

    Ok(ActionMessage {
        message: "Password reset successfully".to_string(),
    })
}

pub async fn delete_admin_user(pool: &PgPool, user_id: Uuid) -> Result<ActionMessage, AdminControlError> {
    let current = get_user_minimal(pool, user_id).await?;

    if is_main_admin_username(&current.username) {
        return Err(AdminControlError::Forbidden(
            "The main admin account cannot be deleted".to_string(),
        ));
    }

    if current.role == "admin"
        && current.is_active
        && active_admin_count_excluding(pool, current.id).await? == 0
    {
        return Err(AdminControlError::Forbidden(
            "At least one active admin account is required".to_string(),
        ));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AdminControlError::NotFound("User not found".to_string()));
    }

    Ok(ActionMessage {
        message: "User deleted".to_string(),
    })
}

pub async fn get_server_runtime_settings(pool: &PgPool) -> Result<ServerRuntimeSettings, AdminControlError> {
    let row = get_server_runtime_settings_row(pool).await?;
    Ok(map_runtime_settings_row(row))
}

pub async fn update_server_runtime_settings(
    pool: &PgPool,
    patch: UpdateServerRuntimeSettingsRequest,
    updated_by: Uuid,
) -> Result<ServerRuntimeSettings, AdminControlError> {
    let current = get_server_runtime_settings_row(pool).await?;

    let next_default_role = match patch.default_user_role.as_deref() {
        Some(value) => normalize_role(value)
            .ok_or_else(|| AdminControlError::BadRequest("Default role must be 'admin' or 'user'".to_string()))?
            .to_string(),
        None => current.default_user_role.clone(),
    };

    let next_max_upload_size_mb = patch
        .max_upload_size_mb
        .unwrap_or(current.max_upload_size_mb)
        .max(1);

    let next_feature_flags = patch
        .feature_flags
        .unwrap_or_else(|| current.feature_flags.0.clone());

    let next_env_overrides = match patch.environment_overrides {
        Some(overrides) => sanitize_environment_overrides(overrides)?,
        None => current.env_overrides.0.clone(),
    };

    let row = sqlx::query_as::<_, ServerRuntimeSettingsRow>(
        r#"
        UPDATE server_runtime_settings
        SET maintenance_mode = $2,
            allow_user_registration = $3,
            default_user_role = $4::user_role,
            max_upload_size_mb = $5,
            feature_flags = $6,
            env_overrides = $7,
            updated_by = $8,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
            maintenance_mode,
            allow_user_registration,
            default_user_role::text AS default_user_role,
            max_upload_size_mb,
            feature_flags,
            env_overrides,
            updated_at
        "#,
    )
    .bind(SETTINGS_ROW_ID)
    .bind(patch.maintenance_mode.unwrap_or(current.maintenance_mode))
    .bind(
        patch
            .allow_user_registration
            .unwrap_or(current.allow_user_registration),
    )
    .bind(next_default_role)
    .bind(next_max_upload_size_mb)
    .bind(Json(next_feature_flags))
    .bind(Json(next_env_overrides))
    .bind(updated_by)
    .fetch_one(pool)
    .await?;

    Ok(map_runtime_settings_row(row))
}

pub async fn is_user_registration_open(pool: &PgPool) -> Result<bool, sqlx::Error> {
    match get_server_runtime_settings_row(pool).await {
        Ok(row) => Ok(row.allow_user_registration && !row.maintenance_mode),
        Err(AdminControlError::Sql(error)) if is_undefined_table_error(&error) => {
            tracing::warn!(
                error = %error,
                "server_runtime_settings table not found; defaulting registration policy to open"
            );
            Ok(true)
        }
        Err(AdminControlError::Sql(error)) => Err(error),
        Err(_) => Ok(true),
    }
}

async fn get_server_runtime_settings_row(
    pool: &PgPool,
) -> Result<ServerRuntimeSettingsRow, AdminControlError> {
    ensure_server_runtime_settings(pool).await?;

    let row = sqlx::query_as::<_, ServerRuntimeSettingsRow>(
        r#"
        SELECT
            maintenance_mode,
            allow_user_registration,
            default_user_role::text AS default_user_role,
            max_upload_size_mb,
            feature_flags,
            env_overrides,
            updated_at
        FROM server_runtime_settings
        WHERE id = $1
        "#,
    )
    .bind(SETTINGS_ROW_ID)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

async fn ensure_server_runtime_settings(pool: &PgPool) -> Result<(), AdminControlError> {
    sqlx::query(
        r#"
        INSERT INTO server_runtime_settings (
            id,
            maintenance_mode,
            allow_user_registration,
            default_user_role,
            max_upload_size_mb,
            feature_flags,
            env_overrides
        )
        VALUES ($1, false, true, 'user', 512, '{}'::jsonb, '{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
        "#,
    )
    .bind(SETTINGS_ROW_ID)
    .execute(pool)
    .await?;

    Ok(())
}

fn map_runtime_settings_row(row: ServerRuntimeSettingsRow) -> ServerRuntimeSettings {
    let env_overrides = row.env_overrides.0;

    ServerRuntimeSettings {
        maintenance_mode: row.maintenance_mode,
        allow_user_registration: row.allow_user_registration,
        default_user_role: row.default_user_role,
        max_upload_size_mb: row.max_upload_size_mb,
        feature_flags: row.feature_flags.0,
        environment: build_environment_snapshot(&env_overrides),
        environment_overrides: env_overrides,
        main_admin_username: MAIN_ADMIN_USERNAME.to_string(),
        updated_at: row.updated_at.to_rfc3339(),
    }
}

fn build_environment_snapshot(overrides: &HashMap<String, String>) -> Vec<RuntimeEnvironmentVariable> {
    let keys = allowed_env_keys_sorted();

    keys.into_iter()
        .map(|key| {
            let override_value = overrides
                .get(key)
                .map(|value| value.trim().to_string())
                .unwrap_or_default();
            let process_value = std::env::var(key).unwrap_or_default();
            let source = if !override_value.is_empty() {
                "override"
            } else if !process_value.is_empty() {
                "process"
            } else {
                "unset"
            };

            let value = if !override_value.is_empty() {
                override_value.clone()
            } else {
                process_value
            };

            RuntimeEnvironmentVariable {
                key: key.to_string(),
                value,
                source: source.to_string(),
                is_sensitive: is_sensitive_env_key(key),
                override_value,
            }
        })
        .collect()
}

fn sanitize_environment_overrides(
    overrides: HashMap<String, String>,
) -> Result<HashMap<String, String>, AdminControlError> {
    let mut next = HashMap::new();

    for (key, value) in overrides {
        if !is_allowed_env_key(&key) {
            return Err(AdminControlError::BadRequest(format!(
                "Environment key '{key}' is not allowed",
            )));
        }

        let trimmed = value.trim();
        if !trimmed.is_empty() {
            next.insert(key, trimmed.to_string());
        }
    }

    Ok(next)
}

async fn get_admin_user_by_id(pool: &PgPool, user_id: Uuid) -> Result<AdminUserAccount, AdminControlError> {
    let row = sqlx::query_as::<_, UserAccountRow>(
        r#"
        SELECT
            u.id,
            u.username,
            u.email,
            u.role::text AS role,
            u.is_active,
            MAX(s.created_at) AS last_login_at,
            u.created_at,
            u.updated_at
        FROM users u
        LEFT JOIN sessions s ON s.user_id = u.id
        WHERE u.id = $1
        GROUP BY u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.updated_at
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    row.map(map_admin_user_row)
        .ok_or_else(|| AdminControlError::NotFound("User not found".to_string()))
}

async fn get_user_minimal(pool: &PgPool, user_id: Uuid) -> Result<UserMinimalRow, AdminControlError> {
    let row = sqlx::query_as::<_, UserMinimalRow>(
        r#"
        SELECT
            id,
            username,
            role::text AS role,
            is_active
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    row.ok_or_else(|| AdminControlError::NotFound("User not found".to_string()))
}

async fn ensure_user_exists(pool: &PgPool, user_id: Uuid) -> Result<(), AdminControlError> {
    let exists: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

    if exists.is_none() {
        return Err(AdminControlError::NotFound("User not found".to_string()));
    }

    Ok(())
}

async fn active_admin_count_excluding(pool: &PgPool, user_id: Uuid) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM users
        WHERE role::text = 'admin'
          AND is_active = true
          AND id <> $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
}

fn map_admin_user_row(row: UserAccountRow) -> AdminUserAccount {
    AdminUserAccount {
        id: row.id.to_string(),
        username: row.username.clone(),
        email: row.email,
        role: row.role,
        is_active: row.is_active,
        is_main_admin: is_main_admin_username(&row.username),
        last_login_at: row.last_login_at.map(|value| value.to_rfc3339()),
        created_at: row.created_at.to_rfc3339(),
        updated_at: row.updated_at.to_rfc3339(),
    }
}

fn normalize_role(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "admin" => Some("admin"),
        "user" => Some("user"),
        _ => None,
    }
}

fn is_main_admin_username(username: &str) -> bool {
    username.eq_ignore_ascii_case(MAIN_ADMIN_USERNAME)
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| format!("Failed to hash password: {error}"))?;

    Ok(hash.to_string())
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(
        error,
        sqlx::Error::Database(db_error)
            if db_error.code().as_deref() == Some("23505")
    )
}

fn is_undefined_table_error(error: &sqlx::Error) -> bool {
    matches!(
        error,
        sqlx::Error::Database(db_error)
            if db_error.code().as_deref() == Some("42P01")
    )
}

fn is_allowed_env_key(key: &str) -> bool {
    ALLOWED_ENV_KEYS
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(key))
}

fn allowed_env_keys_sorted() -> Vec<&'static str> {
    let mut ordered = BTreeSet::new();
    for key in ALLOWED_ENV_KEYS {
        ordered.insert(*key);
    }

    ordered.into_iter().collect()
}

fn is_sensitive_env_key(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();

    upper.contains("SECRET")
        || upper.contains("PASSWORD")
        || upper.contains("TOKEN")
        || upper.ends_with("_KEY")
        || upper.ends_with("KEY")
}
