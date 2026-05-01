CREATE TABLE server_runtime_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    maintenance_mode BOOLEAN NOT NULL DEFAULT false,
    allow_user_registration BOOLEAN NOT NULL DEFAULT true,
    default_user_role user_role NOT NULL DEFAULT 'user',
    max_upload_size_mb INTEGER NOT NULL DEFAULT 512,
    feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    env_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO server_runtime_settings (
    id,
    maintenance_mode,
    allow_user_registration,
    default_user_role,
    max_upload_size_mb,
    feature_flags,
    env_overrides
)
VALUES (
    1,
    false,
    true,
    'user',
    512,
    '{}'::jsonb,
    '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
