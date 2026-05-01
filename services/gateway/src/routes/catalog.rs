use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Extension, Json, Router};
use music_common::auth::Role;
use music_common::middleware::AuthUser;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

// --- Request / Response DTOs ---

#[derive(Deserialize)]
pub struct ListTracksQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub artist_id: Option<String>,
    pub album_id: Option<String>,
    pub genre: Option<String>,
}

#[derive(Deserialize)]
pub struct ListAlbumsQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub artist_id: Option<String>,
    pub genre: Option<String>,
}

#[derive(Deserialize)]
pub struct ListArtistsQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
}

#[derive(Deserialize)]
pub struct CreateTrackRequest {
    pub title: String,
    pub artist_id: String,
    pub album_id: String,
    pub duration_secs: i32,
    pub track_number: i32,
    pub disc_number: i32,
    pub genre: String,
    pub year: i32,
    pub file_hash: String,
    pub storage_file_id: String,
    #[serde(default)]
    pub metadata_json: String,
}

#[derive(Deserialize)]
pub struct CreateAlbumRequest {
    pub title: String,
    pub artist_id: String,
    pub year: i32,
    pub genre: String,
    #[serde(default)]
    pub artwork_url: String,
    #[serde(default)]
    pub metadata_json: String,
}

#[derive(Deserialize)]
pub struct CreateArtistRequest {
    pub name: String,
    #[serde(default)]
    pub bio: String,
    #[serde(default)]
    pub image_url: String,
    #[serde(default)]
    pub metadata_json: String,
}

#[derive(Serialize)]
pub struct TrackResponse {
    pub id: String,
    pub title: String,
    pub artist_id: String,
    pub album_id: String,
    pub duration_secs: i32,
    pub track_number: i32,
    pub disc_number: i32,
    pub genre: String,
    pub year: i32,
    pub file_hash: String,
    pub storage_file_id: String,
    pub metadata_json: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub manually_edited: bool,
}

#[derive(Serialize)]
pub struct AlbumResponse {
    pub id: String,
    pub title: String,
    pub artist_id: String,
    pub year: i32,
    pub genre: String,
    pub artwork_url: String,
    pub metadata_json: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub manually_edited: bool,
}

#[derive(Serialize)]
pub struct ArtistResponse {
    pub id: String,
    pub name: String,
    pub bio: String,
    pub image_url: String,
    pub metadata_json: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub manually_edited: bool,
    pub formed_date: String,
    pub origin_country: String,
}

#[derive(Serialize)]
pub struct PaginationResponse {
    pub total_items: i32,
    pub total_pages: i32,
    pub current_page: i32,
    pub page_size: i32,
}

// --- Routes ---

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/tracks", get(list_tracks).post(create_track))
        .route("/tracks/{id}", get(get_track).patch(update_track))
        .route("/albums", get(list_albums).post(create_album))
        .route("/albums/{id}", get(get_album).patch(update_album))
        .route("/artists", get(list_artists).post(create_artist))
        .route("/artists/{id}", get(get_artist).patch(update_artist))
}

// --- Update DTOs (admin-curated metadata) ---

#[derive(Deserialize)]
pub struct UpdateTrackBody {
    pub title: Option<String>,
    pub artist_id: Option<String>,
    pub album_id: Option<String>,
    pub track_number: Option<i32>,
    pub disc_number: Option<i32>,
    pub genre: Option<String>,
    pub year: Option<i32>,
    pub metadata_json: Option<String>,
    pub manually_edited: Option<bool>,
}

#[derive(Deserialize)]
pub struct UpdateAlbumBody {
    pub title: Option<String>,
    pub artist_id: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub artwork_url: Option<String>,
    pub metadata_json: Option<String>,
    pub manually_edited: Option<bool>,
}

#[derive(Deserialize)]
pub struct UpdateArtistBody {
    pub name: Option<String>,
    pub bio: Option<String>,
    pub image_url: Option<String>,
    pub metadata_json: Option<String>,
    pub formed_date: Option<String>,
    pub origin_country: Option<String>,
    pub manually_edited: Option<bool>,
}

fn require_admin(auth_user: &AuthUser) -> Option<Response> {
    if !matches!(auth_user.role, Role::Admin) {
        let body = serde_json::json!({
            "error": { "code": 403, "message": "Admin access is required" }
        });
        return Some((StatusCode::FORBIDDEN, Json(body)).into_response());
    }
    None
}

// --- Track handlers ---

async fn list_tracks(
    State(state): State<AppState>,
    Query(params): Query<ListTracksQuery>,
) -> impl IntoResponse {
    let pagination = Some(music_proto::common::v1::PaginationRequest {
        page: params.page.unwrap_or(1),
        page_size: params.page_size.unwrap_or(20),
    });

    let request = music_proto::catalog::v1::ListTracksRequest {
        pagination,
        artist_id: params.artist_id,
        album_id: params.album_id,
        genre: params.genre,
    };

    let mut client = state.catalog_client.lock().await;
    match client.list_tracks(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let tracks: Vec<TrackResponse> = resp.tracks.into_iter().map(map_track).collect();
            let pagination = resp.pagination.map(map_pagination);
            let body = serde_json::json!({
                "tracks": tracks,
                "pagination": pagination,
            });
            Json(body).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn get_track(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let request = music_proto::catalog::v1::GetTrackRequest { track_id: id };

    let mut client = state.catalog_client.lock().await;
    match client.get_track(request).await {
        Ok(response) => {
            let track = map_track(response.into_inner());
            Json(track).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn create_track(
    State(state): State<AppState>,
    Json(body): Json<CreateTrackRequest>,
) -> impl IntoResponse {
    let request = music_proto::catalog::v1::CreateTrackRequest {
        title: body.title,
        artist_id: body.artist_id,
        album_id: body.album_id,
        duration_secs: body.duration_secs,
        track_number: body.track_number,
        disc_number: body.disc_number,
        genre: body.genre,
        year: body.year,
        file_hash: body.file_hash,
        storage_file_id: body.storage_file_id,
        metadata_json: body.metadata_json,
    };

    let mut client = state.catalog_client.lock().await;
    match client.create_track(request).await {
        Ok(response) => {
            let track = map_track(response.into_inner());
            (StatusCode::CREATED, Json(track)).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn update_track(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateTrackBody>,
) -> Response {
    if let Some(resp) = require_admin(&auth_user) {
        return resp;
    }

    let request = music_proto::catalog::v1::UpdateTrackRequest {
        track_id: id,
        title: body.title,
        artist_id: body.artist_id,
        album_id: body.album_id,
        track_number: body.track_number,
        disc_number: body.disc_number,
        genre: body.genre,
        year: body.year,
        metadata_json: body.metadata_json,
        manually_edited: body.manually_edited,
    };

    let mut client = state.catalog_client.lock().await;
    match client.update_track(request).await {
        Ok(response) => Json(map_track(response.into_inner())).into_response(),
        Err(status) => grpc_error_to_response(status),
    }
}

// --- Album handlers ---

async fn list_albums(
    State(state): State<AppState>,
    Query(params): Query<ListAlbumsQuery>,
) -> impl IntoResponse {
    let pagination = Some(music_proto::common::v1::PaginationRequest {
        page: params.page.unwrap_or(1),
        page_size: params.page_size.unwrap_or(20),
    });

    let request = music_proto::catalog::v1::ListAlbumsRequest {
        pagination,
        artist_id: params.artist_id,
        genre: params.genre,
    };

    let mut client = state.catalog_client.lock().await;
    match client.list_albums(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let albums: Vec<AlbumResponse> = resp.albums.into_iter().map(map_album).collect();
            let pagination = resp.pagination.map(map_pagination);
            let body = serde_json::json!({
                "albums": albums,
                "pagination": pagination,
            });
            Json(body).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn get_album(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let request = music_proto::catalog::v1::GetAlbumRequest { album_id: id };

    let mut client = state.catalog_client.lock().await;
    match client.get_album(request).await {
        Ok(response) => {
            let album = map_album(response.into_inner());
            Json(album).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn create_album(
    State(state): State<AppState>,
    Json(body): Json<CreateAlbumRequest>,
) -> impl IntoResponse {
    let request = music_proto::catalog::v1::CreateAlbumRequest {
        title: body.title,
        artist_id: body.artist_id,
        year: body.year,
        genre: body.genre,
        artwork_url: body.artwork_url,
        metadata_json: body.metadata_json,
    };

    let mut client = state.catalog_client.lock().await;
    match client.create_album(request).await {
        Ok(response) => {
            let album = map_album(response.into_inner());
            (StatusCode::CREATED, Json(album)).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn update_album(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateAlbumBody>,
) -> Response {
    if let Some(resp) = require_admin(&auth_user) {
        return resp;
    }

    let request = music_proto::catalog::v1::UpdateAlbumRequest {
        album_id: id,
        title: body.title,
        artist_id: body.artist_id,
        year: body.year,
        genre: body.genre,
        artwork_url: body.artwork_url,
        metadata_json: body.metadata_json,
        manually_edited: body.manually_edited,
    };

    let mut client = state.catalog_client.lock().await;
    match client.update_album(request).await {
        Ok(response) => Json(map_album(response.into_inner())).into_response(),
        Err(status) => grpc_error_to_response(status),
    }
}

// --- Artist handlers ---

async fn list_artists(
    State(state): State<AppState>,
    Query(params): Query<ListArtistsQuery>,
) -> impl IntoResponse {
    let pagination = Some(music_proto::common::v1::PaginationRequest {
        page: params.page.unwrap_or(1),
        page_size: params.page_size.unwrap_or(20),
    });

    let request = music_proto::catalog::v1::ListArtistsRequest { pagination };

    let mut client = state.catalog_client.lock().await;
    match client.list_artists(request).await {
        Ok(response) => {
            let resp = response.into_inner();
            let artists: Vec<ArtistResponse> = resp.artists.into_iter().map(map_artist).collect();
            let pagination = resp.pagination.map(map_pagination);
            let body = serde_json::json!({
                "artists": artists,
                "pagination": pagination,
            });
            Json(body).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn create_artist(
    State(state): State<AppState>,
    Json(body): Json<CreateArtistRequest>,
) -> impl IntoResponse {
    let request = music_proto::catalog::v1::CreateArtistRequest {
        name: body.name,
        bio: body.bio,
        image_url: body.image_url,
        metadata_json: body.metadata_json,
    };

    let mut client = state.catalog_client.lock().await;
    match client.create_artist(request).await {
        Ok(response) => {
            let artist = map_artist(response.into_inner());
            (StatusCode::CREATED, Json(artist)).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn get_artist(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let request = music_proto::catalog::v1::GetArtistRequest { artist_id: id };

    let mut client = state.catalog_client.lock().await;
    match client.get_artist(request).await {
        Ok(response) => {
            let artist = map_artist(response.into_inner());
            Json(artist).into_response()
        }
        Err(status) => grpc_error_to_response(status),
    }
}

async fn update_artist(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateArtistBody>,
) -> Response {
    if let Some(resp) = require_admin(&auth_user) {
        return resp;
    }

    let request = music_proto::catalog::v1::UpdateArtistRequest {
        artist_id: id,
        name: body.name,
        bio: body.bio,
        image_url: body.image_url,
        metadata_json: body.metadata_json,
        formed_date: body.formed_date,
        origin_country: body.origin_country,
        manually_edited: body.manually_edited,
    };

    let mut client = state.catalog_client.lock().await;
    match client.update_artist(request).await {
        Ok(response) => Json(map_artist(response.into_inner())).into_response(),
        Err(status) => grpc_error_to_response(status),
    }
}

// --- Mapping helpers ---

fn map_track(t: music_proto::catalog::v1::Track) -> TrackResponse {
    TrackResponse {
        id: t.id,
        title: t.title,
        artist_id: t.artist_id,
        album_id: t.album_id,
        duration_secs: t.duration_secs,
        track_number: t.track_number,
        disc_number: t.disc_number,
        genre: t.genre,
        year: t.year,
        file_hash: t.file_hash,
        storage_file_id: t.storage_file_id,
        metadata_json: t.metadata_json,
        created_at: t.created_at.map(|ts| timestamp_to_string(&ts)),
        updated_at: t.updated_at.map(|ts| timestamp_to_string(&ts)),
        manually_edited: t.manually_edited,
    }
}

fn map_album(a: music_proto::catalog::v1::Album) -> AlbumResponse {
    AlbumResponse {
        id: a.id,
        title: a.title,
        artist_id: a.artist_id,
        year: a.year,
        genre: a.genre,
        artwork_url: a.artwork_url,
        metadata_json: a.metadata_json,
        created_at: a.created_at.map(|ts| timestamp_to_string(&ts)),
        updated_at: a.updated_at.map(|ts| timestamp_to_string(&ts)),
        manually_edited: a.manually_edited,
    }
}

fn map_artist(a: music_proto::catalog::v1::Artist) -> ArtistResponse {
    ArtistResponse {
        id: a.id,
        name: a.name,
        bio: a.bio,
        image_url: a.image_url,
        metadata_json: a.metadata_json,
        created_at: a.created_at.map(|ts| timestamp_to_string(&ts)),
        updated_at: a.updated_at.map(|ts| timestamp_to_string(&ts)),
        manually_edited: a.manually_edited,
        formed_date: a.formed_date,
        origin_country: a.origin_country,
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
