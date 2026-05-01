use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use prost_types::Timestamp;
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use music_common::auth::{generate_access_token, generate_refresh_token, validate_token, Role};
use music_common::config::JwtConfig;
use music_proto::auth::v1::auth_service_server::AuthService;
use music_proto::auth::v1::{
    AuthResponse, DeleteUserRequest, GetUserRequest, ListUsersRequest, ListUsersResponse,
    LoginRequest, RefreshTokenRequest, RegisterRequest, UpdateUserRequest, UserResponse,
    ValidateTokenRequest, ValidateTokenResponse,
};
use music_proto::common::v1::Empty;

use crate::models::{CreateUserParams, User, UserRole};
use crate::repository;

pub struct AuthServiceImpl {
    pool: PgPool,
    jwt_config: JwtConfig,
}

impl AuthServiceImpl {
    pub fn new(pool: PgPool, jwt_config: JwtConfig) -> Self {
        Self { pool, jwt_config }
    }

    /// Hash a plaintext password with argon2.
    fn hash_password(password: &str) -> Result<String, Status> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| Status::internal(format!("Failed to hash password: {e}")))?;
        Ok(hash.to_string())
    }

    /// Verify a plaintext password against a stored hash.
    fn verify_password(password: &str, hash: &str) -> Result<bool, Status> {
        let parsed_hash = PasswordHash::new(hash)
            .map_err(|e| Status::internal(format!("Invalid stored password hash: {e}")))?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }

    /// Generate an access + refresh token pair for a given user.
    fn generate_tokens(
        &self,
        user_id: Uuid,
        role: Role,
        remember_me: bool,
    ) -> Result<(String, String, i64), Status> {
        let access_ttl_secs = if remember_me {
            self.jwt_config.remember_me_ttl_secs
        } else {
            self.jwt_config.access_ttl_secs
        };

        let refresh_ttl_secs = if remember_me {
            self.jwt_config.remember_me_ttl_secs
        } else {
            self.jwt_config.refresh_ttl_secs
        };

        let access_token = generate_access_token(
            user_id,
            role.clone(),
            &self.jwt_config,
            access_ttl_secs,
            remember_me,
        )
            .map_err(|e| Status::internal(format!("Token generation failed: {e}")))?;
        let refresh_token = generate_refresh_token(
            user_id,
            role,
            &self.jwt_config,
            refresh_ttl_secs,
            remember_me,
        )
            .map_err(|e| Status::internal(format!("Token generation failed: {e}")))?;
        let expires_in = access_ttl_secs;
        Ok((access_token, refresh_token, expires_in))
    }

    /// Convert a domain `User` into the proto `UserResponse`.
    fn user_to_proto(user: &User) -> UserResponse {
        UserResponse {
            id: user.id.to_string(),
            username: user.username.clone(),
            email: user.email.clone(),
            role: user.role.as_str().to_string(),
            is_active: user.is_active,
            avatar_url: user.avatar_url.clone().unwrap_or_default(),
            created_at: Some(Timestamp {
                seconds: user.created_at.timestamp(),
                nanos: user.created_at.timestamp_subsec_nanos() as i32,
            }),
            updated_at: Some(Timestamp {
                seconds: user.updated_at.timestamp(),
                nanos: user.updated_at.timestamp_subsec_nanos() as i32,
            }),
        }
    }
}

#[tonic::async_trait]
impl AuthService for AuthServiceImpl {
    async fn register(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let req = request.into_inner();
        tracing::info!(username = %req.username, email = %req.email, "Register request");

        // Validate inputs
        if req.username.is_empty() {
            return Err(Status::invalid_argument("Username is required"));
        }
        if req.email.is_empty() {
            return Err(Status::invalid_argument("Email is required"));
        }
        if req.password.is_empty() {
            return Err(Status::invalid_argument("Password is required"));
        }
        if req.password.len() < 8 {
            return Err(Status::invalid_argument(
                "Password must be at least 8 characters",
            ));
        }

        // Check for existing username
        if repository::find_by_username(&self.pool, &req.username)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .is_some()
        {
            return Err(Status::already_exists("Username is already taken"));
        }

        // Check for existing email
        if repository::find_by_email(&self.pool, &req.email)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .is_some()
        {
            return Err(Status::already_exists("Email is already taken"));
        }

        // Hash password
        let password_hash = Self::hash_password(&req.password)?;

        // Bootstrap rule: the first registered user becomes admin.
        let user_count = repository::count_users(&self.pool)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?;
        let role = if user_count == 0 {
            UserRole::Admin
        } else {
            UserRole::User
        };

        // Create user
        let user_id = Uuid::new_v4();
        let params = CreateUserParams {
            id: user_id,
            username: req.username,
            email: req.email,
            password_hash,
            role,
        };

        let user = repository::create_user(&self.pool, &params)
            .await
            .map_err(|e| Status::internal(format!("Failed to create user: {e}")))?;

        tracing::info!(user_id = %user.id, "User registered successfully");

        // Generate tokens
        let role: Role = user.role.clone().into();
        let (access_token, refresh_token, expires_in) =
            self.generate_tokens(user.id, role, false)?;

        Ok(Response::new(AuthResponse {
            access_token,
            refresh_token,
            expires_in,
            user: Some(Self::user_to_proto(&user)),
        }))
    }

    async fn login(
        &self,
        request: Request<LoginRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let req = request.into_inner();
        tracing::info!(username = %req.username, "Login request");

        if req.username.is_empty() {
            return Err(Status::invalid_argument("Username is required"));
        }
        if req.password.is_empty() {
            return Err(Status::invalid_argument("Password is required"));
        }

        // Find user
        let user = repository::find_by_username(&self.pool, &req.username)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::unauthenticated("Invalid username or password"))?;

        // Check active
        if !user.is_active {
            return Err(Status::permission_denied("Account is deactivated"));
        }

        // Verify password
        let valid = Self::verify_password(&req.password, &user.password_hash)?;
        if !valid {
            return Err(Status::unauthenticated("Invalid username or password"));
        }

        tracing::info!(user_id = %user.id, "User logged in successfully");

        let role: Role = user.role.clone().into();
        let (access_token, refresh_token, expires_in) =
            self.generate_tokens(user.id, role, req.remember_me)?;

        Ok(Response::new(AuthResponse {
            access_token,
            refresh_token,
            expires_in,
            user: Some(Self::user_to_proto(&user)),
        }))
    }

    async fn validate_token(
        &self,
        request: Request<ValidateTokenRequest>,
    ) -> Result<Response<ValidateTokenResponse>, Status> {
        let req = request.into_inner();

        if req.token.is_empty() {
            return Err(Status::invalid_argument("Token is required"));
        }

        match validate_token(&req.token, &self.jwt_config) {
            Ok(claims) => {
                tracing::info!(user_id = %claims.sub, "Token validated");
                Ok(Response::new(ValidateTokenResponse {
                    valid: true,
                    user_id: claims.sub.to_string(),
                    role: claims.role.to_string(),
                }))
            }
            Err(_) => Ok(Response::new(ValidateTokenResponse {
                valid: false,
                user_id: String::new(),
                role: String::new(),
            })),
        }
    }

    async fn refresh_token(
        &self,
        request: Request<RefreshTokenRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let req = request.into_inner();

        if req.refresh_token.is_empty() {
            return Err(Status::invalid_argument("Refresh token is required"));
        }

        // Validate the refresh token
        let claims = validate_token(&req.refresh_token, &self.jwt_config)
            .map_err(|_| Status::unauthenticated("Invalid or expired refresh token"))?;

        // Look up the user to make sure they still exist and are active
        let user = repository::find_by_id(&self.pool, claims.sub)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found("User no longer exists"))?;

        if !user.is_active {
            return Err(Status::permission_denied("Account is deactivated"));
        }

        tracing::info!(user_id = %user.id, "Token refreshed");

        let role: Role = user.role.clone().into();
        let (access_token, refresh_token, expires_in) =
            self.generate_tokens(user.id, role, claims.remember_me)?;

        Ok(Response::new(AuthResponse {
            access_token,
            refresh_token,
            expires_in,
            user: Some(Self::user_to_proto(&user)),
        }))
    }

    async fn get_user(
        &self,
        _request: Request<GetUserRequest>,
    ) -> Result<Response<UserResponse>, Status> {
        Err(Status::unimplemented("GetUser not yet implemented"))
    }

    async fn update_user(
        &self,
        _request: Request<UpdateUserRequest>,
    ) -> Result<Response<UserResponse>, Status> {
        Err(Status::unimplemented("UpdateUser not yet implemented"))
    }

    async fn delete_user(
        &self,
        _request: Request<DeleteUserRequest>,
    ) -> Result<Response<Empty>, Status> {
        Err(Status::unimplemented("DeleteUser not yet implemented"))
    }

    async fn list_users(
        &self,
        _request: Request<ListUsersRequest>,
    ) -> Result<Response<ListUsersResponse>, Status> {
        Err(Status::unimplemented("ListUsers not yet implemented"))
    }
}
