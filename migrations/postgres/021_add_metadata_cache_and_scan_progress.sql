-- iTunes metadata cache + bulk-scan progress + small KV state table.
--
-- metadata_cache:
--   Long-lived JSONB cache of iTunes Search API responses. Keyed by a
--   normalized query hash so identical lookups across tracks share cache
--   entries. We cache every response (including empty / "no match") so we
--   don't re-hit Apple for known-missing items.
--
-- metadata_kv:
--   Tiny key/value table for cross-restart state that doesn't justify its own
--   table. Today: `itunes_rate_limit_pause_until` (RFC3339 timestamp). On 403
--   from Apple we set this to NOW + 10 minutes; subsequent lookups bail until
--   the timestamp passes.
--
-- scan_progress:
--   Records the live state of a background scan/ingest job so the admin UI
--   can poll without holding the HTTP request open.

CREATE TABLE metadata_cache (
    query_hash CHAR(64) PRIMARY KEY,
    endpoint VARCHAR(32) NOT NULL,
    query_text TEXT NOT NULL,
    response_json JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_metadata_cache_endpoint ON metadata_cache(endpoint);
CREATE INDEX idx_metadata_cache_expires_at ON metadata_cache(expires_at);

CREATE TABLE metadata_kv (
    key VARCHAR(128) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scan_progress (
    id UUID PRIMARY KEY,
    directory_path TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    total INTEGER NOT NULL DEFAULT 0,
    processed INTEGER NOT NULL DEFAULT 0,
    imported INTEGER NOT NULL DEFAULT 0,
    duplicates INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_scan_progress_status ON scan_progress(status);
CREATE INDEX idx_scan_progress_started_at ON scan_progress(started_at DESC);
