use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{CreateUserParams, User};

/// Create a new user in the database. Returns the full inserted row.
pub async fn create_user(pool: &PgPool, params: &CreateUserParams) -> Result<User, sqlx::Error> {
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, email, password_hash, role, is_active, avatar_url, created_at, updated_at
        "#,
    )
    .bind(params.id)
    .bind(&params.username)
    .bind(&params.email)
    .bind(&params.password_hash)
    .bind(params.role.clone())
    .fetch_one(pool)
    .await?;

    Ok(user)
}

/// Count all users in the database.
pub async fn count_users(pool: &PgPool) -> Result<i64, sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    Ok(count)
}

/// Look up a user by their username.
pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, email, password_hash, role, is_active, avatar_url, created_at, updated_at
        FROM users
        WHERE username = $1
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;

    Ok(user)
}

/// Look up a user by their id.
pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>, sqlx::Error> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, email, password_hash, role, is_active, avatar_url, created_at, updated_at
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(user)
}

/// Look up a user by their email.
pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, username, email, password_hash, role, is_active, avatar_url, created_at, updated_at
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;

    Ok(user)
}
