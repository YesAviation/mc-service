CREATE TABLE media_processing_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    auto_prewarm_on_scan_complete BOOLEAN NOT NULL DEFAULT true,
    pretranscode_enabled BOOLEAN NOT NULL DEFAULT true,
    prehls_enabled BOOLEAN NOT NULL DEFAULT true,
    prewarm_bitrates INTEGER[] NOT NULL DEFAULT ARRAY[128, 256, 320],
    hls_segment_duration_secs INTEGER NOT NULL DEFAULT 10,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO media_processing_settings (
    id,
    auto_prewarm_on_scan_complete,
    pretranscode_enabled,
    prehls_enabled,
    prewarm_bitrates,
    hls_segment_duration_secs
)
VALUES (1, true, true, true, ARRAY[128, 256, 320], 10)
ON CONFLICT (id) DO NOTHING;
