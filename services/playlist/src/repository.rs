use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{Playlist, PlaylistTrack};

pub async fn create_playlist(
	pool: &PgPool,
	id: Uuid,
	user_id: Uuid,
	name: &str,
	description: Option<&str>,
	is_public: bool,
) -> Result<Playlist, sqlx::Error> {
	sqlx::query_as::<_, Playlist>(
		r#"
		INSERT INTO playlists (id, name, user_id, description, is_public)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, user_id, description, is_public, created_at, updated_at
		"#,
	)
	.bind(id)
	.bind(name)
	.bind(user_id)
	.bind(description)
	.bind(is_public)
	.fetch_one(pool)
	.await
}

pub async fn find_playlist_by_id(
	pool: &PgPool,
	playlist_id: Uuid,
) -> Result<Option<Playlist>, sqlx::Error> {
	sqlx::query_as::<_, Playlist>(
		r#"
		SELECT id, name, user_id, description, is_public, created_at, updated_at
		FROM playlists
		WHERE id = $1
		"#,
	)
	.bind(playlist_id)
	.fetch_optional(pool)
	.await
}

pub async fn list_playlists(
	pool: &PgPool,
	user_id: Uuid,
	limit: i64,
	offset: i64,
) -> Result<Vec<Playlist>, sqlx::Error> {
	sqlx::query_as::<_, Playlist>(
		r#"
		SELECT id, name, user_id, description, is_public, created_at, updated_at
		FROM playlists
		WHERE user_id = $1
		ORDER BY updated_at DESC
		LIMIT $2 OFFSET $3
		"#,
	)
	.bind(user_id)
	.bind(limit)
	.bind(offset)
	.fetch_all(pool)
	.await
}

pub async fn count_playlists(pool: &PgPool, user_id: Uuid) -> Result<i64, sqlx::Error> {
	let row: (i64,) = sqlx::query_as(
		r#"
		SELECT COUNT(*)
		FROM playlists
		WHERE user_id = $1
		"#,
	)
	.bind(user_id)
	.fetch_one(pool)
	.await?;

	Ok(row.0)
}

pub async fn update_playlist(
	pool: &PgPool,
	playlist_id: Uuid,
	name: Option<&str>,
	description: Option<&str>,
	is_public: Option<bool>,
) -> Result<Option<Playlist>, sqlx::Error> {
	sqlx::query_as::<_, Playlist>(
		r#"
		UPDATE playlists
		SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			is_public = COALESCE($4, is_public),
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, user_id, description, is_public, created_at, updated_at
		"#,
	)
	.bind(playlist_id)
	.bind(name)
	.bind(description)
	.bind(is_public)
	.fetch_optional(pool)
	.await
}

pub async fn delete_playlist(pool: &PgPool, playlist_id: Uuid) -> Result<bool, sqlx::Error> {
	let result = sqlx::query(
		r#"
		DELETE FROM playlists
		WHERE id = $1
		"#,
	)
	.bind(playlist_id)
	.execute(pool)
	.await?;

	Ok(result.rows_affected() > 0)
}

pub async fn list_playlist_tracks(
	pool: &PgPool,
	playlist_id: Uuid,
) -> Result<Vec<PlaylistTrack>, sqlx::Error> {
	sqlx::query_as::<_, PlaylistTrack>(
		r#"
		SELECT playlist_id, track_id, position, added_at
		FROM playlist_tracks
		WHERE playlist_id = $1
		ORDER BY position ASC
		"#,
	)
	.bind(playlist_id)
	.fetch_all(pool)
	.await
}

pub async fn add_track(
	pool: &PgPool,
	playlist_id: Uuid,
	track_id: Uuid,
) -> Result<(), sqlx::Error> {
	let mut tx = pool.begin().await?;

	let next_position: (i32,) = sqlx::query_as(
		r#"
		SELECT COALESCE(MAX(position), 0) + 1
		FROM playlist_tracks
		WHERE playlist_id = $1
		"#,
	)
	.bind(playlist_id)
	.fetch_one(&mut *tx)
	.await?;

	sqlx::query(
		r#"
		INSERT INTO playlist_tracks (playlist_id, track_id, position)
		VALUES ($1, $2, $3)
		"#,
	)
	.bind(playlist_id)
	.bind(track_id)
	.bind(next_position.0)
	.execute(&mut *tx)
	.await?;

	sqlx::query(
		r#"
		UPDATE playlists
		SET updated_at = NOW()
		WHERE id = $1
		"#,
	)
	.bind(playlist_id)
	.execute(&mut *tx)
	.await?;

	tx.commit().await?;
	Ok(())
}

pub async fn remove_track(
	pool: &PgPool,
	playlist_id: Uuid,
	track_id: Uuid,
) -> Result<bool, sqlx::Error> {
	let mut tx = pool.begin().await?;

	let removed: Option<(i32,)> = sqlx::query_as(
		r#"
		DELETE FROM playlist_tracks
		WHERE playlist_id = $1 AND track_id = $2
		RETURNING position
		"#,
	)
	.bind(playlist_id)
	.bind(track_id)
	.fetch_optional(&mut *tx)
	.await?;

	let existed = if let Some((removed_position,)) = removed {
		sqlx::query(
			r#"
			UPDATE playlist_tracks
			SET position = position - 1
			WHERE playlist_id = $1 AND position > $2
			"#,
		)
		.bind(playlist_id)
		.bind(removed_position)
		.execute(&mut *tx)
		.await?;

		sqlx::query(
			r#"
			UPDATE playlists
			SET updated_at = NOW()
			WHERE id = $1
			"#,
		)
		.bind(playlist_id)
		.execute(&mut *tx)
		.await?;

		true
	} else {
		false
	};

	tx.commit().await?;
	Ok(existed)
}

pub async fn reorder_tracks(
	pool: &PgPool,
	playlist_id: Uuid,
	ordered_track_ids: &[Uuid],
) -> Result<(), sqlx::Error> {
	let mut tx = pool.begin().await?;

	for (index, track_id) in ordered_track_ids.iter().enumerate() {
		let updated: Option<(i32,)> = sqlx::query_as(
			r#"
			UPDATE playlist_tracks
			SET position = $3
			WHERE playlist_id = $1 AND track_id = $2
			RETURNING position
			"#,
		)
		.bind(playlist_id)
		.bind(*track_id)
		.bind((index + 1) as i32)
		.fetch_optional(&mut *tx)
		.await?;

		if updated.is_none() {
			return Err(sqlx::Error::RowNotFound);
		}
	}

	sqlx::query(
		r#"
		UPDATE playlists
		SET updated_at = NOW()
		WHERE id = $1
		"#,
	)
	.bind(playlist_id)
	.execute(&mut *tx)
	.await?;

	tx.commit().await?;
	Ok(())
}
