CREATE SCHEMA IF NOT EXISTS collection;

CREATE TABLE collection.source_register (
  source_id                     text        PRIMARY KEY,
  source_label                  text        NOT NULL,
  source_kind                   text        NOT NULL,
  enabled                       boolean     NOT NULL DEFAULT false,
  collection_allowed            boolean     NOT NULL DEFAULT false,
  image_fetching_allowed        boolean     NOT NULL DEFAULT false,
  listing_text_display_allowed  boolean     NOT NULL DEFAULT false,
  permission_evidence           text        NOT NULL,
  reviewed_at                   timestamptz NOT NULL,
  CONSTRAINT source_register_id_is_lower_kebab CHECK (
    source_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT source_register_label_is_bounded CHECK (
    char_length(source_label) BETWEEN 1 AND 200
  ),
  CONSTRAINT source_register_kind_is_supported CHECK (source_kind IN ('synthetic', 'real')),
  CONSTRAINT source_register_enabled_requires_permission CHECK (
    NOT enabled OR collection_allowed
  ),
  CONSTRAINT source_register_evidence_is_bounded CHECK (
    char_length(permission_evidence) BETWEEN 1 AND 1000
  )
);

CREATE TABLE collection.collection_run (
  run_id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  operation_key       text        NOT NULL UNIQUE,
  source_id           text        NOT NULL REFERENCES collection.source_register (source_id),
  status              text        NOT NULL,
  started_at          timestamptz NOT NULL,
  completed_at        timestamptz NOT NULL,
  observed_count      integer     NOT NULL,
  parsed_count        integer     NOT NULL,
  suppressed_count    integer     NOT NULL,
  failed_count        integer     NOT NULL,
  manifest_hash       text        NOT NULL,
  parsed_event_id     uuid        NOT NULL UNIQUE,
  completed_event_id  uuid        NOT NULL UNIQUE,
  CONSTRAINT collection_run_id_is_uuid_v7 CHECK (uuid_extract_version(run_id) = 7),
  CONSTRAINT collection_run_parsed_event_id_is_uuid_v7 CHECK (
    uuid_extract_version(parsed_event_id) = 7
  ),
  CONSTRAINT collection_run_completed_event_id_is_uuid_v7 CHECK (
    uuid_extract_version(completed_event_id) = 7
  ),
  CONSTRAINT collection_run_operation_key_is_bounded CHECK (
    char_length(operation_key) BETWEEN 1 AND 200
  ),
  CONSTRAINT collection_run_status_is_completed CHECK (status = 'completed'),
  CONSTRAINT collection_run_time_order CHECK (completed_at >= started_at),
  CONSTRAINT collection_run_counts_are_valid CHECK (
    observed_count >= 0
    AND parsed_count >= 0
    AND suppressed_count >= 0
    AND failed_count >= 0
    AND parsed_count + suppressed_count + failed_count <= observed_count
  ),
  CONSTRAINT collection_run_manifest_hash_is_canonical CHECK (
    manifest_hash ~ '^sha256:[0-9a-f]{64}$'
  )
);

CREATE INDEX collection_run_source_completed_idx
  ON collection.collection_run (source_id, completed_at, run_id);

CREATE TABLE collection.raw_object (
  content_hash  text        PRIMARY KEY,
  object_key    text        NOT NULL UNIQUE,
  byte_length   integer     NOT NULL,
  media_type    text        NOT NULL,
  synthetic     boolean     NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT raw_object_content_hash_is_canonical CHECK (
    content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  CONSTRAINT raw_object_key_is_content_addressed CHECK (
    object_key = 'synthetic/sha256/' || substring(content_hash FROM 8) || '.json'
  ),
  CONSTRAINT raw_object_length_is_positive CHECK (byte_length > 0),
  CONSTRAINT raw_object_media_type_is_json CHECK (media_type = 'application/json'),
  CONSTRAINT raw_object_is_synthetic CHECK (synthetic)
);

CREATE TABLE collection.snapshot_observation (
  snapshot_id        uuid        PRIMARY KEY DEFAULT uuidv7(),
  run_id             uuid        NOT NULL REFERENCES collection.collection_run (run_id),
  content_hash       text        NOT NULL REFERENCES collection.raw_object (content_hash),
  source_listing_id  text        NOT NULL,
  source_url         text        NOT NULL,
  observed_at        timestamptz NOT NULL,
  CONSTRAINT snapshot_observation_id_is_uuid_v7 CHECK (
    uuid_extract_version(snapshot_id) = 7
  ),
  CONSTRAINT snapshot_observation_source_listing_id_is_bounded CHECK (
    char_length(source_listing_id) BETWEEN 1 AND 300
  ),
  CONSTRAINT snapshot_observation_source_url_is_bounded CHECK (
    char_length(source_url) BETWEEN 1 AND 2048
  ),
  CONSTRAINT snapshot_observation_one_listing_per_run UNIQUE (run_id, source_listing_id)
);

CREATE INDEX snapshot_observation_content_hash_idx
  ON collection.snapshot_observation (content_hash, snapshot_id);

CREATE OR REPLACE FUNCTION collection.reject_raw_object_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'collection.raw_object is immutable';
END;
$$;

CREATE TRIGGER raw_object_reject_update
BEFORE UPDATE ON collection.raw_object
FOR EACH ROW EXECUTE FUNCTION collection.reject_raw_object_update();

INSERT INTO collection.source_register (
  source_id,
  source_label,
  source_kind,
  enabled,
  collection_allowed,
  image_fetching_allowed,
  listing_text_display_allowed,
  permission_evidence,
  reviewed_at
)
VALUES (
  'synthetic-data',
  'Labelled synthetic fixture',
  'synthetic',
  true,
  true,
  true,
  true,
  'Repository-owned deterministic fixture containing no personal data or photographs.',
  '2026-10-10T00:00:00Z'
);
