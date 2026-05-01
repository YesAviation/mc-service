CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE tracks ADD COLUMN search_vector tsvector;

CREATE OR REPLACE FUNCTION tracks_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.genre, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracks_search_vector_trigger
    BEFORE INSERT OR UPDATE ON tracks
    FOR EACH ROW EXECUTE FUNCTION tracks_search_vector_update();

CREATE INDEX idx_tracks_search_vector ON tracks USING GIN(search_vector);
CREATE INDEX idx_tracks_title_trgm ON tracks USING GIN(title gin_trgm_ops);
CREATE INDEX idx_artists_name_trgm ON artists USING GIN(name gin_trgm_ops);
CREATE INDEX idx_albums_title_trgm ON albums USING GIN(title gin_trgm_ops);
