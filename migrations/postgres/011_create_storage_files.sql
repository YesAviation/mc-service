CREATE TYPE storage_backend_type AS ENUM ('local', 's3');

CREATE TABLE storage_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_backend storage_backend_type NOT NULL DEFAULT 'local',
    storage_path VARCHAR(1000) NOT NULL,
    checksum VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_files_checksum ON storage_files(checksum);

ALTER TABLE tracks
    ADD CONSTRAINT fk_tracks_storage_file
    FOREIGN KEY (storage_file_id) REFERENCES storage_files(id) ON DELETE SET NULL;
