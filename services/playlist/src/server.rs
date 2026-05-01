use std::collections::HashSet;

use prost_types::Timestamp;
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use music_proto::common::v1::{Empty, PaginationResponse};
use music_proto::playlist::v1::playlist_service_server::PlaylistService;
use music_proto::playlist::v1::{
	AddTrackRequest, CreatePlaylistRequest, DeletePlaylistRequest, GetPlaylistRequest,
	ListPlaylistsRequest, ListPlaylistsResponse, Playlist as ProtoPlaylist,
	PlaylistTrack as ProtoPlaylistTrack, RemoveTrackRequest, ReorderTracksRequest,
	UpdatePlaylistRequest,
};

use crate::models::{Playlist, PlaylistTrack};
use crate::repository;

pub struct PlaylistServiceImpl {
	pool: PgPool,
}

impl PlaylistServiceImpl {
	pub fn new(pool: PgPool) -> Self {
		Self { pool }
	}

	fn track_to_proto(track: &PlaylistTrack) -> ProtoPlaylistTrack {
		ProtoPlaylistTrack {
			track_id: track.track_id.to_string(),
			position: track.position,
			added_at: Some(Timestamp {
				seconds: track.added_at.timestamp(),
				nanos: track.added_at.timestamp_subsec_nanos() as i32,
			}),
		}
	}

	fn playlist_to_proto(playlist: &Playlist, tracks: Vec<PlaylistTrack>) -> ProtoPlaylist {
		ProtoPlaylist {
			id: playlist.id.to_string(),
			name: playlist.name.clone(),
			user_id: playlist.user_id.to_string(),
			description: playlist.description.clone().unwrap_or_default(),
			is_public: playlist.is_public,
			tracks: tracks.iter().map(Self::track_to_proto).collect(),
			created_at: Some(Timestamp {
				seconds: playlist.created_at.timestamp(),
				nanos: playlist.created_at.timestamp_subsec_nanos() as i32,
			}),
			updated_at: Some(Timestamp {
				seconds: playlist.updated_at.timestamp(),
				nanos: playlist.updated_at.timestamp_subsec_nanos() as i32,
			}),
		}
	}

	async fn load_playlist_proto(&self, playlist_id: Uuid) -> Result<ProtoPlaylist, Status> {
		let playlist = repository::find_playlist_by_id(&self.pool, playlist_id)
			.await
			.map_err(db_error_to_status)?
			.ok_or_else(|| Status::not_found(format!("Playlist {playlist_id} not found")))?;

		let tracks = repository::list_playlist_tracks(&self.pool, playlist_id)
			.await
			.map_err(db_error_to_status)?;

		Ok(Self::playlist_to_proto(&playlist, tracks))
	}
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, Status> {
	value
		.parse::<Uuid>()
		.map_err(|_| Status::invalid_argument(format!("Invalid UUID for {field_name}: {value}")))
}

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

fn db_error_to_status(err: sqlx::Error) -> Status {
	match err {
		sqlx::Error::RowNotFound => Status::not_found("Record not found"),
		sqlx::Error::Database(db_err) => match db_err.code().as_deref() {
			Some("23503") => Status::not_found("Related record not found"),
			Some("23505") => Status::already_exists("Record already exists"),
			_ => Status::internal(format!("Database error: {db_err}")),
		},
		other => Status::internal(format!("Database error: {other}")),
	}
}

#[tonic::async_trait]
impl PlaylistService for PlaylistServiceImpl {
	async fn create_playlist(
		&self,
		request: Request<CreatePlaylistRequest>,
	) -> Result<Response<ProtoPlaylist>, Status> {
		let req = request.into_inner();

		if req.name.trim().is_empty() {
			return Err(Status::invalid_argument("name is required"));
		}

		let user_id = parse_uuid(&req.user_id, "user_id")?;
		let id = Uuid::new_v4();
		let description = if req.description.is_empty() {
			None
		} else {
			Some(req.description.as_str())
		};

		let playlist = repository::create_playlist(
			&self.pool,
			id,
			user_id,
			req.name.trim(),
			description,
			req.is_public,
		)
		.await
		.map_err(db_error_to_status)?;

		Ok(Response::new(Self::playlist_to_proto(&playlist, Vec::new())))
	}

	async fn get_playlist(
		&self,
		request: Request<GetPlaylistRequest>,
	) -> Result<Response<ProtoPlaylist>, Status> {
		let req = request.into_inner();
		let playlist_id = parse_uuid(&req.playlist_id, "playlist_id")?;
		let playlist = self.load_playlist_proto(playlist_id).await?;
		Ok(Response::new(playlist))
	}

	async fn list_playlists(
		&self,
		request: Request<ListPlaylistsRequest>,
	) -> Result<Response<ListPlaylistsResponse>, Status> {
		let req = request.into_inner();
		let user_id = parse_uuid(&req.user_id, "user_id")?;
		let (page, page_size) = pagination_params(req.pagination.as_ref());
		let offset = ((page - 1) * page_size) as i64;

		let total = repository::count_playlists(&self.pool, user_id)
			.await
			.map_err(db_error_to_status)?;
		let playlists =
			repository::list_playlists(&self.pool, user_id, page_size as i64, offset)
				.await
				.map_err(db_error_to_status)?;

		let mut proto_playlists = Vec::with_capacity(playlists.len());
		for playlist in playlists {
			let tracks = repository::list_playlist_tracks(&self.pool, playlist.id)
				.await
				.map_err(db_error_to_status)?;
			proto_playlists.push(Self::playlist_to_proto(&playlist, tracks));
		}

		Ok(Response::new(ListPlaylistsResponse {
			playlists: proto_playlists,
			pagination: Some(build_pagination_response(total, page, page_size)),
		}))
	}

	async fn update_playlist(
		&self,
		request: Request<UpdatePlaylistRequest>,
	) -> Result<Response<ProtoPlaylist>, Status> {
		let req = request.into_inner();
		let playlist_id = parse_uuid(&req.playlist_id, "playlist_id")?;

		let name = req.name.as_deref().map(str::trim);
		if let Some(value) = name {
			if value.is_empty() {
				return Err(Status::invalid_argument("name cannot be empty"));
			}
		}

		let description = req.description.as_deref();

		let updated = repository::update_playlist(
			&self.pool,
			playlist_id,
			name,
			description,
			req.is_public,
		)
		.await
		.map_err(db_error_to_status)?;

		if updated.is_none() {
			return Err(Status::not_found(format!("Playlist {playlist_id} not found")));
		}

		let playlist = self.load_playlist_proto(playlist_id).await?;
		Ok(Response::new(playlist))
	}

	async fn delete_playlist(
		&self,
		request: Request<DeletePlaylistRequest>,
	) -> Result<Response<Empty>, Status> {
		let req = request.into_inner();
		let playlist_id = parse_uuid(&req.playlist_id, "playlist_id")?;

		let deleted = repository::delete_playlist(&self.pool, playlist_id)
			.await
			.map_err(db_error_to_status)?;

		if !deleted {
			return Err(Status::not_found(format!("Playlist {playlist_id} not found")));
		}

		Ok(Response::new(Empty {}))
	}

	async fn add_track(
		&self,
		request: Request<AddTrackRequest>,
	) -> Result<Response<ProtoPlaylist>, Status> {
		let req = request.into_inner();
		let playlist_id = parse_uuid(&req.playlist_id, "playlist_id")?;
		let track_id = parse_uuid(&req.track_id, "track_id")?;

		repository::add_track(&self.pool, playlist_id, track_id)
			.await
			.map_err(db_error_to_status)?;

		let playlist = self.load_playlist_proto(playlist_id).await?;
		Ok(Response::new(playlist))
	}

	async fn remove_track(
		&self,
		request: Request<RemoveTrackRequest>,
	) -> Result<Response<ProtoPlaylist>, Status> {
		let req = request.into_inner();
		let playlist_id = parse_uuid(&req.playlist_id, "playlist_id")?;
		let track_id = parse_uuid(&req.track_id, "track_id")?;

		let removed = repository::remove_track(&self.pool, playlist_id, track_id)
			.await
			.map_err(db_error_to_status)?;

		if !removed {
			return Err(Status::not_found(format!(
				"Track {track_id} not found in playlist {playlist_id}"
			)));
		}

		let playlist = self.load_playlist_proto(playlist_id).await?;
		Ok(Response::new(playlist))
	}

	async fn reorder_tracks(
		&self,
		request: Request<ReorderTracksRequest>,
	) -> Result<Response<ProtoPlaylist>, Status> {
		let req = request.into_inner();
		let playlist_id = parse_uuid(&req.playlist_id, "playlist_id")?;

		if req.track_ids.is_empty() {
			return Err(Status::invalid_argument("track_ids cannot be empty"));
		}

		let mut track_ids = Vec::with_capacity(req.track_ids.len());
		for track_id in req.track_ids {
			track_ids.push(parse_uuid(&track_id, "track_ids")?);
		}

		let existing_tracks = repository::list_playlist_tracks(&self.pool, playlist_id)
			.await
			.map_err(db_error_to_status)?;

		if existing_tracks.len() != track_ids.len() {
			return Err(Status::invalid_argument(
				"track_ids must include every track in the playlist exactly once",
			));
		}

		let existing_set: HashSet<Uuid> = existing_tracks.iter().map(|t| t.track_id).collect();
		let incoming_set: HashSet<Uuid> = track_ids.iter().copied().collect();
		if existing_set != incoming_set {
			return Err(Status::invalid_argument(
				"track_ids must include every track in the playlist exactly once",
			));
		}

		repository::reorder_tracks(&self.pool, playlist_id, &track_ids)
			.await
			.map_err(db_error_to_status)?;

		let playlist = self.load_playlist_proto(playlist_id).await?;
		Ok(Response::new(playlist))
	}
}
