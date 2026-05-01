-- Manual-metadata override flag and extra artist fields.
--
-- When `manually_edited` is TRUE, the iTunes (or any future automated)
-- enrichment job MUST NOT overwrite the record's mutable metadata fields.
-- Admin-triggered "Refetch from iTunes" flips the flag back to FALSE and
-- re-runs ingestion for that record.

ALTER TABLE artists
    ADD COLUMN manually_edited BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN formed_date DATE,
    ADD COLUMN origin_country VARCHAR(100);

ALTER TABLE albums
    ADD COLUMN manually_edited BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tracks
    ADD COLUMN manually_edited BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_artists_manually_edited ON artists(manually_edited);
CREATE INDEX idx_albums_manually_edited  ON albums(manually_edited);
CREATE INDEX idx_tracks_manually_edited  ON tracks(manually_edited);
