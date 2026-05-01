use prost_types::Timestamp;
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use music_proto::catalog::v1::catalog_service_server::CatalogService;
use music_proto::catalog::v1::{
    Album as ProtoAlbum, Artist as ProtoArtist, CreateAlbumRequest, CreateArtistRequest,
    CreateTrackRequest, DeleteAlbumRequest, DeleteArtistRequest, DeleteTrackRequest,
    GetAlbumRequest, GetArtistRequest, GetTrackRequest, ListAlbumsRequest, ListAlbumsResponse,
    ListArtistsRequest, ListArtistsResponse, ListTracksRequest, ListTracksResponse,
    Track as ProtoTrack, UpdateAlbumRequest, UpdateArtistRequest, UpdateTrackRequest,
};
use music_proto::common::v1::{Empty, PaginationResponse};

use crate::models::{Album, Artist, Track};
use crate::repository;

pub struct CatalogServiceImpl {
    pool: PgPool,
}

impl CatalogServiceImpl {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    fn track_to_proto(track: &Track) -> ProtoTrack {
        ProtoTrack {
            id: track.id.to_string(),
            title: track.title.clone(),
            artist_id: track.artist_id.to_string(),
            album_id: track.album_id.to_string(),
            duration_secs: track.duration_secs,
            track_number: track.track_number,
            disc_number: track.disc_number,
            genre: track.genre.clone(),
            year: track.year,
            file_hash: track.file_hash.clone(),
            storage_file_id: track.storage_file_id.to_string(),
            metadata_json: track
                .metadata_json
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_default(),
            created_at: Some(Timestamp {
                seconds: track.created_at.timestamp(),
                nanos: track.created_at.timestamp_subsec_nanos() as i32,
            }),
            updated_at: Some(Timestamp {
                seconds: track.updated_at.timestamp(),
                nanos: track.updated_at.timestamp_subsec_nanos() as i32,
            }),
            manually_edited: track.manually_edited,
        }
    }

    fn album_to_proto(album: &Album) -> ProtoAlbum {
        ProtoAlbum {
            id: album.id.to_string(),
            title: album.title.clone(),
            artist_id: album.artist_id.to_string(),
            year: album.year,
            genre: album.genre.clone(),
            artwork_url: album.artwork_url.clone(),
            metadata_json: album
                .metadata_json
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_default(),
            created_at: Some(Timestamp {
                seconds: album.created_at.timestamp(),
                nanos: album.created_at.timestamp_subsec_nanos() as i32,
            }),
            updated_at: Some(Timestamp {
                seconds: album.updated_at.timestamp(),
                nanos: album.updated_at.timestamp_subsec_nanos() as i32,
            }),
            manually_edited: album.manually_edited,
        }
    }

    fn artist_to_proto(artist: &Artist) -> ProtoArtist {
        ProtoArtist {
            id: artist.id.to_string(),
            name: artist.name.clone(),
            bio: artist.bio.clone(),
            image_url: artist.image_url.clone(),
            metadata_json: artist
                .metadata_json
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_default(),
            created_at: Some(Timestamp {
                seconds: artist.created_at.timestamp(),
                nanos: artist.created_at.timestamp_subsec_nanos() as i32,
            }),
            updated_at: Some(Timestamp {
                seconds: artist.updated_at.timestamp(),
                nanos: artist.updated_at.timestamp_subsec_nanos() as i32,
            }),
            manually_edited: artist.manually_edited,
            formed_date: artist
                .formed_date
                .map(|d| d.format("%Y-%m-%d").to_string())
                .unwrap_or_default(),
            origin_country: artist.origin_country.clone().unwrap_or_default(),
        }
    }
}

/// Parse a UUID from a string, returning a gRPC `INVALID_ARGUMENT` status on failure.
fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, Status> {
    value
        .parse::<Uuid>()
        .map_err(|_| Status::invalid_argument(format!("Invalid UUID for {field_name}: {value}")))
}

/// Extract pagination parameters (page, page_size) with sensible defaults.
fn pagination_params(
    pagination: Option<&music_proto::common::v1::PaginationRequest>,
) -> (i32, i32) {
    let page = pagination.map(|p| p.page).unwrap_or(1).max(1);
    let page_size = pagination.map(|p| p.page_size).unwrap_or(20).clamp(1, 100);
    (page, page_size)
}

fn build_pagination_response(total_items: i64, page: i32, page_size: i32) -> PaginationResponse {
    let total_pages = ((total_items as f64) / (page_size as f64)).ceil() as i32;
    PaginationResponse {
        total_items: total_items as i32,
        total_pages,
        current_page: page,
        page_size,
    }
}

/// Try to parse `metadata_json` from request string into a `serde_json::Value`.
/// Returns `None` for empty strings, an error `Status` for invalid JSON.
fn parse_metadata_json(raw: &str) -> Result<Option<serde_json::Value>, Status> {
    if raw.is_empty() {
        return Ok(None);
    }
    serde_json::from_str(raw)
        .map(Some)
        .map_err(|e| Status::invalid_argument(format!("Invalid metadata_json: {e}")))
}

#[tonic::async_trait]
impl CatalogService for CatalogServiceImpl {
    // -----------------------------------------------------------------------
    // Tracks
    // -----------------------------------------------------------------------

    async fn create_track(
        &self,
        request: Request<CreateTrackRequest>,
    ) -> Result<Response<ProtoTrack>, Status> {
        let req = request.into_inner();
        tracing::info!(title = %req.title, "CreateTrack request");

        if req.title.is_empty() {
            return Err(Status::invalid_argument("Title is required"));
        }

        let artist_id = parse_uuid(&req.artist_id, "artist_id")?;
        let album_id = parse_uuid(&req.album_id, "album_id")?;
        let storage_file_id = parse_uuid(&req.storage_file_id, "storage_file_id")?;
        let metadata = parse_metadata_json(&req.metadata_json)?;

        let id = Uuid::new_v4();
        let track = repository::create_track(
            &self.pool,
            id,
            &req.title,
            artist_id,
            album_id,
            req.duration_secs,
            req.track_number,
            req.disc_number,
            &req.genre,
            req.year,
            &req.file_hash,
            storage_file_id,
            metadata,
        )
        .await
        .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        tracing::info!(track_id = %track.id, "Track created");
        Ok(Response::new(Self::track_to_proto(&track)))
    }

    async fn get_track(
        &self,
        request: Request<GetTrackRequest>,
    ) -> Result<Response<ProtoTrack>, Status> {
        let req = request.into_inner();
        let id = parse_uuid(&req.track_id, "track_id")?;

        let track = repository::find_track_by_id(&self.pool, id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Track {id} not found")))?;

        Ok(Response::new(Self::track_to_proto(&track)))
    }

    async fn list_tracks(
        &self,
        request: Request<ListTracksRequest>,
    ) -> Result<Response<ListTracksResponse>, Status> {
        let req = request.into_inner();
        let (page, page_size) = pagination_params(req.pagination.as_ref());
        let offset = ((page - 1) * page_size) as i64;

        let artist_id = if let Some(ref id) = req.artist_id {
            Some(parse_uuid(id, "artist_id")?)
        } else {
            None
        };
        let album_id = if let Some(ref id) = req.album_id {
            Some(parse_uuid(id, "album_id")?)
        } else {
            None
        };
        let genre = req.genre.as_deref();

        let total = repository::count_tracks(&self.pool, artist_id, album_id, genre)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        let tracks = repository::list_tracks(
            &self.pool,
            artist_id,
            album_id,
            genre,
            page_size as i64,
            offset,
        )
        .await
        .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        Ok(Response::new(ListTracksResponse {
            tracks: tracks.iter().map(Self::track_to_proto).collect(),
            pagination: Some(build_pagination_response(total, page, page_size)),
        }))
    }

    async fn update_track(
        &self,
        request: Request<UpdateTrackRequest>,
    ) -> Result<Response<ProtoTrack>, Status> {
        let req = request.into_inner();
        let id = parse_uuid(&req.track_id, "track_id")?;

        let artist_id = if let Some(ref s) = req.artist_id {
            Some(parse_uuid(s, "artist_id")?)
        } else {
            None
        };
        let album_id = if let Some(ref s) = req.album_id {
            Some(parse_uuid(s, "album_id")?)
        } else {
            None
        };

        let metadata_json = req
            .metadata_json
            .as_deref()
            .map(parse_metadata_json)
            .transpose()?
            .flatten();

        // Default to manually_edited = true so any admin save freezes the
        // record from automated overwrites; an explicit false in the request
        // (e.g. the "Refetch from iTunes" admin action) clears the freeze.
        let manually_edited = Some(req.manually_edited.unwrap_or(true));

        let params = repository::UpdateTrackParams {
            title: req.title,
            artist_id,
            album_id,
            track_number: req.track_number,
            disc_number: req.disc_number,
            genre: req.genre,
            year: req.year,
            metadata_json,
            manually_edited,
        };

        let updated = repository::update_track(&self.pool, id, &params)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Track {id} not found")))?;

        tracing::info!(track_id = %updated.id, "Track updated");
        Ok(Response::new(Self::track_to_proto(&updated)))
    }

    async fn delete_track(
        &self,
        _request: Request<DeleteTrackRequest>,
    ) -> Result<Response<Empty>, Status> {
        Err(Status::unimplemented("DeleteTrack not yet implemented"))
    }

    // -----------------------------------------------------------------------
    // Albums
    // -----------------------------------------------------------------------

    async fn create_album(
        &self,
        request: Request<CreateAlbumRequest>,
    ) -> Result<Response<ProtoAlbum>, Status> {
        let req = request.into_inner();
        tracing::info!(title = %req.title, "CreateAlbum request");

        if req.title.is_empty() {
            return Err(Status::invalid_argument("Title is required"));
        }

        let artist_id = parse_uuid(&req.artist_id, "artist_id")?;
        let metadata = parse_metadata_json(&req.metadata_json)?;

        let id = Uuid::new_v4();
        let album = repository::create_album(
            &self.pool,
            id,
            &req.title,
            artist_id,
            req.year,
            &req.genre,
            &req.artwork_url,
            metadata,
        )
        .await
        .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        tracing::info!(album_id = %album.id, "Album created");
        Ok(Response::new(Self::album_to_proto(&album)))
    }

    async fn get_album(
        &self,
        request: Request<GetAlbumRequest>,
    ) -> Result<Response<ProtoAlbum>, Status> {
        let req = request.into_inner();
        let id = parse_uuid(&req.album_id, "album_id")?;

        let album = repository::find_album_by_id(&self.pool, id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Album {id} not found")))?;

        Ok(Response::new(Self::album_to_proto(&album)))
    }

    async fn list_albums(
        &self,
        request: Request<ListAlbumsRequest>,
    ) -> Result<Response<ListAlbumsResponse>, Status> {
        let req = request.into_inner();
        let (page, page_size) = pagination_params(req.pagination.as_ref());
        let offset = ((page - 1) * page_size) as i64;

        let artist_id = if let Some(ref id) = req.artist_id {
            Some(parse_uuid(id, "artist_id")?)
        } else {
            None
        };
        let genre = req.genre.as_deref();

        let total = repository::count_albums(&self.pool, artist_id, genre)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        let albums =
            repository::list_albums(&self.pool, artist_id, genre, page_size as i64, offset)
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        Ok(Response::new(ListAlbumsResponse {
            albums: albums.iter().map(Self::album_to_proto).collect(),
            pagination: Some(build_pagination_response(total, page, page_size)),
        }))
    }

    async fn update_album(
        &self,
        request: Request<UpdateAlbumRequest>,
    ) -> Result<Response<ProtoAlbum>, Status> {
        let req = request.into_inner();
        let id = parse_uuid(&req.album_id, "album_id")?;

        let artist_id = if let Some(ref s) = req.artist_id {
            Some(parse_uuid(s, "artist_id")?)
        } else {
            None
        };

        let metadata_json = req
            .metadata_json
            .as_deref()
            .map(parse_metadata_json)
            .transpose()?
            .flatten();

        let manually_edited = Some(req.manually_edited.unwrap_or(true));

        let params = repository::UpdateAlbumParams {
            title: req.title,
            artist_id,
            year: req.year,
            genre: req.genre,
            artwork_url: req.artwork_url,
            metadata_json,
            manually_edited,
        };

        let updated = repository::update_album(&self.pool, id, &params)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Album {id} not found")))?;

        tracing::info!(album_id = %updated.id, "Album updated");
        Ok(Response::new(Self::album_to_proto(&updated)))
    }

    async fn delete_album(
        &self,
        _request: Request<DeleteAlbumRequest>,
    ) -> Result<Response<Empty>, Status> {
        Err(Status::unimplemented("DeleteAlbum not yet implemented"))
    }

    // -----------------------------------------------------------------------
    // Artists
    // -----------------------------------------------------------------------

    async fn create_artist(
        &self,
        request: Request<CreateArtistRequest>,
    ) -> Result<Response<ProtoArtist>, Status> {
        let req = request.into_inner();
        tracing::info!(name = %req.name, "CreateArtist request");

        if req.name.is_empty() {
            return Err(Status::invalid_argument("Name is required"));
        }

        let metadata = parse_metadata_json(&req.metadata_json)?;

        let id = Uuid::new_v4();
        let artist =
            repository::create_artist(&self.pool, id, &req.name, &req.bio, &req.image_url, metadata)
                .await
                .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        tracing::info!(artist_id = %artist.id, "Artist created");
        Ok(Response::new(Self::artist_to_proto(&artist)))
    }

    async fn get_artist(
        &self,
        request: Request<GetArtistRequest>,
    ) -> Result<Response<ProtoArtist>, Status> {
        let req = request.into_inner();
        let id = parse_uuid(&req.artist_id, "artist_id")?;

        let artist = repository::find_artist_by_id(&self.pool, id)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Artist {id} not found")))?;

        Ok(Response::new(Self::artist_to_proto(&artist)))
    }

    async fn list_artists(
        &self,
        request: Request<ListArtistsRequest>,
    ) -> Result<Response<ListArtistsResponse>, Status> {
        let req = request.into_inner();
        let (page, page_size) = pagination_params(req.pagination.as_ref());
        let offset = ((page - 1) * page_size) as i64;

        let total = repository::count_artists(&self.pool)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        let artists = repository::list_artists(&self.pool, page_size as i64, offset)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?;

        Ok(Response::new(ListArtistsResponse {
            artists: artists.iter().map(Self::artist_to_proto).collect(),
            pagination: Some(build_pagination_response(total, page, page_size)),
        }))
    }

    async fn update_artist(
        &self,
        request: Request<UpdateArtistRequest>,
    ) -> Result<Response<ProtoArtist>, Status> {
        let req = request.into_inner();
        let id = parse_uuid(&req.artist_id, "artist_id")?;

        let metadata_json = req
            .metadata_json
            .as_deref()
            .map(parse_metadata_json)
            .transpose()?
            .flatten();

        let formed_date = req
            .formed_date
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(|s| {
                chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| {
                    Status::invalid_argument(format!("Invalid formed_date '{s}': {e}"))
                })
            })
            .transpose()?;

        let manually_edited = Some(req.manually_edited.unwrap_or(true));

        let params = repository::UpdateArtistParams {
            name: req.name,
            bio: req.bio,
            image_url: req.image_url,
            metadata_json,
            formed_date,
            origin_country: req.origin_country,
            manually_edited,
        };

        let updated = repository::update_artist(&self.pool, id, &params)
            .await
            .map_err(|e| Status::internal(format!("Database error: {e}")))?
            .ok_or_else(|| Status::not_found(format!("Artist {id} not found")))?;

        tracing::info!(artist_id = %updated.id, "Artist updated");
        Ok(Response::new(Self::artist_to_proto(&updated)))
    }

    async fn delete_artist(
        &self,
        _request: Request<DeleteArtistRequest>,
    ) -> Result<Response<Empty>, Status> {
        Err(Status::unimplemented("DeleteArtist not yet implemented"))
    }
}
