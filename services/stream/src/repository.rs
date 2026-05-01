use sqlx::PgPool;
use uuid::Uuid;

/// Minimal storage file record needed by HTTP asset serving.
#[derive(Debug, Clone)]
pub struct StorageFileLookup {
	pub storage_path: String,
	pub content_type: String,
}

/// Find a storage file by ID.
pub async fn find_storage_file_by_id(
	pool: &PgPool,
	file_id: Uuid,
) -> Result<Option<StorageFileLookup>, sqlx::Error> {
	let row: Option<(String, String)> = sqlx::query_as(
		r#"
		SELECT storage_path, content_type
		FROM storage_files
		WHERE id = $1
		LIMIT 1
		"#,
	)
	.bind(file_id)
	.fetch_optional(pool)
	.await?;

	Ok(row.map(|(storage_path, content_type)| StorageFileLookup {
		storage_path,
		content_type,
	}))
}
