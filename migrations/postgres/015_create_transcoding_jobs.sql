CREATE TYPE transcoding_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

CREATE TABLE transcoding_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    status transcoding_status NOT NULL DEFAULT 'pending',
    bitrate INTEGER,
    format VARCHAR(20),
    output_path VARCHAR(1000),
    error_message TEXT,
    progress REAL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_transcoding_jobs_track_id ON transcoding_jobs(track_id);
CREATE INDEX idx_transcoding_jobs_status ON transcoding_jobs(status);
