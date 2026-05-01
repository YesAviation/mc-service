CREATE TABLE setup_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    is_complete BOOLEAN NOT NULL DEFAULT false,
    admin_user_id UUID REFERENCES users(id),
    storage_backend VARCHAR(50) NOT NULL DEFAULT 'local',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
