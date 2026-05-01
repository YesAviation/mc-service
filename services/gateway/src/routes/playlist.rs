use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post, put};
use axum::{Extension, Json, Router};
use music_common::auth::Role;
use music_common::middleware::AuthUser;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
}

#[derive(Deserialize)]
pub struct CreatePlaylistRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub is_public: bool,
}

#[derive(Deserialize)]
pub struct UpdatePlaylistRequestBody {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_public: Option<bool>,
}

#[derive(Deserialize)]
pub struct AddTrackRequestBody {
    #[serde(alias = "trackId")]
    pub track_id: String,
}

#[derive(Deserialize)]
pub struct ReorderTracksRequestBody {
    #[serde(alias = "trackIds")]
    pub track_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct PlaylistTrackResponse {
    pub track_id: String,
    pub position: i32,
    pub added_at: Option<String>,
}

#[derive(Serialize)]
pub struct PlaylistResponse {
    pub id: String,
    pub name: String,
    pub user_id: String,
    pub description: String,
    pub is_public: bool,
    pub tracks: Vec<PlaylistTrackResponse>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize)]
pub struct PaginationResponse {
    pub total_items: i32,
    pub total_pages: i32,
    pub current_page: i32,
    pub page_size: i32,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_playlists).post(create_playlist))
        .route(
            "/{playlist_id}",
            get(get_playlist)
                .put(update_playlist)
                .delete(delete_playlist),
        )
        .route("/{playlist_id}/tracks", post(add_track))
        .route("/{playlist_id}/tracks/{track_id}", delete(remove_track))
        .route("/{playlist_id}/tracks/reorder", put(reorder_tracks))
}

async fn list_playlists(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Query(params): Query<PaginationQuery>,
) -> impl IntoResponse {
    let pagination = Some(music_proto::common::v1::PaginationRequest {
        page: params.page.unwrap_or(1),
        page_size: params.page_size.unwrap_or(20),
    });

    let request = music_proto::playlist::v1::ListPlaylistsRequest {
        user_id: auth_user.user_id.to_string(),
        pagination,
    };

    let mut client = state.playlist_client.lock().await;
    match client.list_playlists(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let playlists: Vec<PlaylistResponse> =
                resp.playlists.into_iter().map(map_playlist).collect();
            let pagination = resp.pagination.map(map_pagination);

            let body = serde_json::json!({
                "playlists": playlists,
                "pagination": pagination,
            });
            Json(body).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn create_playlist(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<CreatePlaylistRequest>,
) -> impl IntoResponse {
    let request = music_proto::playlist::v1::CreatePlaylistRequest {
        user_id: auth_user.user_id.to_string(),
        name: body.name,
        description: body.description,
        is_public: body.is_public,
    };

    let mut client = state.playlist_client.lock().await;
    match client.create_playlist(request).await {
        Ok(response) => {
            let playlist = map_playlist(response.into_inner());
            (
                StatusCode::CREATED,
                Json(playlist),
            )
                .into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn get_playlist(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(playlist_id): Path<String>,
) -> impl IntoResponse {
    let request = music_proto::playlist::v1::GetPlaylistRequest { playlist_id };

    let mut client = state.playlist_client.lock().await;
    match client.get_playlist(request).await {
        Ok(response) => {
            let playlist = response.into_inner();
            if !can_view_playlist(&auth_user, &playlist) {
                return forbidden_response("You do not have access to this playlist");
            }

            Json(map_playlist(playlist)).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn update_playlist(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(playlist_id): Path<String>,
    Json(body): Json<UpdatePlaylistRequestBody>,
) -> impl IntoResponse {
    let mut client = state.playlist_client.lock().await;

    match client
        .get_playlist(music_proto::playlist::v1::GetPlaylistRequest {
            playlist_id: playlist_id.clone(),
        })
        .await
    {
        Ok(response) => {
            let playlist = response.into_inner();
            if !can_modify_playlist(&auth_user, &playlist) {
                return forbidden_response("You cannot modify this playlist");
            }
        }
        Err(status) => return grpc_error_to_response(status),
    }

    let request = music_proto::playlist::v1::UpdatePlaylistRequest {
        playlist_id,
        name: body.name,
        description: body.description,
        is_public: body.is_public,
    };

    match client.update_playlist(request).await {
        Ok(response) => {
            let playlist = map_playlist(response.into_inner());
            Json(playlist).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn delete_playlist(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(playlist_id): Path<String>,
) -> impl IntoResponse {
    let mut client = state.playlist_client.lock().await;

    match client
        .get_playlist(music_proto::playlist::v1::GetPlaylistRequest {
            playlist_id: playlist_id.clone(),
        })
        .await
    {
        Ok(response) => {
            let playlist = response.into_inner();
            if !can_modify_playlist(&auth_user, &playlist) {
                return forbidden_response("You cannot delete this playlist");
            }
        }
        Err(status) => return grpc_error_to_response(status),
    }

    let request = music_proto::playlist::v1::DeletePlaylistRequest { playlist_id };
    match client.delete_playlist(request).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(status) => grpc_error_to_response(status),
    }
}

async fn add_track(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(playlist_id): Path<String>,
    Json(body): Json<AddTrackRequestBody>,
) -> impl IntoResponse {
    let mut client = state.playlist_client.lock().await;

    match client
        .get_playlist(music_proto::playlist::v1::GetPlaylistRequest {
            playlist_id: playlist_id.clone(),
        })
        .await
    {
        Ok(response) => {
            let playlist = response.into_inner();
            if !can_modify_playlist(&auth_user, &playlist) {
                return forbidden_response("You cannot modify this playlist");
            }
        }
        Err(status) => return grpc_error_to_response(status),
    }

    let request = music_proto::playlist::v1::AddTrackRequest {
        playlist_id,
        track_id: body.track_id,
    };

    match client.add_track(request).await {
        Ok(response) => {
            let playlist = map_playlist(response.into_inner());
            Json(playlist).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn remove_track(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((playlist_id, track_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let mut client = state.playlist_client.lock().await;

    match client
        .get_playlist(music_proto::playlist::v1::GetPlaylistRequest {
            playlist_id: playlist_id.clone(),
        })
        .await
    {
        Ok(response) => {
            let playlist = response.into_inner();
            if !can_modify_playlist(&auth_user, &playlist) {
                return forbidden_response("You cannot modify this playlist");
            }
        }
        Err(status) => return grpc_error_to_response(status),
    }

    let request = music_proto::playlist::v1::RemoveTrackRequest {
        playlist_id,
        track_id,
    };

    match client.remove_track(request).await {
        Ok(response) => {
            let playlist = map_playlist(response.into_inner());
            Json(playlist).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn reorder_tracks(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(playlist_id): Path<String>,
    Json(body): Json<ReorderTracksRequestBody>,
) -> impl IntoResponse {
    let mut client = state.playlist_client.lock().await;

    match client
        .get_playlist(music_proto::playlist::v1::GetPlaylistRequest {
            playlist_id: playlist_id.clone(),
        })
        .await
    {
        Ok(response) => {
            let playlist = response.into_inner();
            if !can_modify_playlist(&auth_user, &playlist) {
                return forbidden_response("You cannot modify this playlist");
            }
        }
        Err(status) => return grpc_error_to_response(status),
    }

    let request = music_proto::playlist::v1::ReorderTracksRequest {
        playlist_id,
        track_ids: body.track_ids,
    };

    match client.reorder_tracks(request).await {
        Ok(response) => {
            let playlist = map_playlist(response.into_inner());
            Json(playlist).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

fn can_view_playlist(
    auth_user: &AuthUser,
    playlist: &music_proto::playlist::v1::Playlist,
) -> bool {
    if matches!(auth_user.role, Role::Admin) {
        return true;
    }

    playlist.user_id == auth_user.user_id.to_string() || playlist.is_public
}

fn can_modify_playlist(
    auth_user: &AuthUser,
    playlist: &music_proto::playlist::v1::Playlist,
) -> bool {
    matches!(auth_user.role, Role::Admin) || playlist.user_id == auth_user.user_id.to_string()
}

fn forbidden_response(message: &str) -> axum::response::Response {
    let body = serde_json::json!({
        "error": {
            "code": 403,
            "message": message,
        }
    });

    (StatusCode::FORBIDDEN, Json(body)).into_response()
}

fn map_playlist(p: music_proto::playlist::v1::Playlist) -> PlaylistResponse {
    PlaylistResponse {
        id: p.id,
        name: p.name,
        user_id: p.user_id,
        description: p.description,
        is_public: p.is_public,
        tracks: p.tracks.into_iter().map(map_playlist_track).collect(),
        created_at: p.created_at.as_ref().map(timestamp_to_string),
        updated_at: p.updated_at.as_ref().map(timestamp_to_string),
    }
}

fn map_playlist_track(t: music_proto::playlist::v1::PlaylistTrack) -> PlaylistTrackResponse {
    PlaylistTrackResponse {
        track_id: t.track_id,
        position: t.position,
        added_at: t.added_at.as_ref().map(timestamp_to_string),
    }
}

fn map_pagination(p: music_proto::common::v1::PaginationResponse) -> PaginationResponse {
    PaginationResponse {
        total_items: p.total_items,
        total_pages: p.total_pages,
        current_page: p.current_page,
        page_size: p.page_size,
    }
}

fn timestamp_to_string(ts: &prost_types::Timestamp) -> String {
    chrono::DateTime::from_timestamp(ts.seconds, ts.nanos as u32)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

fn grpc_error_to_response(status: tonic::Status) -> axum::response::Response {
    let http_status = match status.code() {
        tonic::Code::NotFound => StatusCode::NOT_FOUND,
        tonic::Code::InvalidArgument => StatusCode::BAD_REQUEST,
        tonic::Code::AlreadyExists => StatusCode::CONFLICT,
        tonic::Code::Unauthenticated => StatusCode::UNAUTHORIZED,
        tonic::Code::PermissionDenied => StatusCode::FORBIDDEN,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };

    let body = serde_json::json!({
        "error": {
            "code": http_status.as_u16(),
            "message": status.message(),
        }
    });

    (http_status, Json(body)).into_response()
}
