use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Represents the `user_role` PostgreSQL enum.
/// Must match the DB enum values exactly.
#[derive(Debug, Clone, sqlx::Type)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    User,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserRole::Admin => "admin",
            UserRole::User => "user",
        }
    }
}

impl From<UserRole> for music_common::auth::Role {
    fn from(role: UserRole) -> Self {
        match role {
            UserRole::Admin => music_common::auth::Role::Admin,
            UserRole::User => music_common::auth::Role::User,
        }
    }
}

/// A user row from the `users` table.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: UserRole,
    pub is_active: bool,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Parameters for inserting a new user.
pub struct CreateUserParams {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: UserRole,
}
