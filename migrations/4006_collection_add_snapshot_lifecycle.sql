-- Historical content metadata remains immutable after a real generation is deleted.
CREATE TABLE collection.snapshot_content (
  content_hash text PRIMARY KEY CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  byte_length integer NOT NULL CHECK (byte_length > 0),
  media_type text NOT NULL CHECK (media_type = 'application/json')
);

INSERT INTO collection.snapshot_content (content_hash, byte_length, media_type)
SELECT content_hash, byte_length, media_type FROM collection.raw_object;

CREATE TRIGGER snapshot_content_reject_update
BEFORE UPDATE ON collection.snapshot_content
FOR EACH ROW EXECUTE FUNCTION collection.reject_raw_object_update();

CREATE SEQUENCE collection.snapshot_selection_order AS bigint MINVALUE 1 NO CYCLE;

CREATE TABLE collection.snapshot_generation (
  object_key text PRIMARY KEY,
  acquisition_scope text NOT NULL UNIQUE CHECK (acquisition_scope ~ '^[0-9a-f]{64}$'),
  source_id text NOT NULL REFERENCES collection.source_register (source_id),
  content_hash text NOT NULL REFERENCES collection.snapshot_content (content_hash),
  byte_length integer NOT NULL CHECK (byte_length > 0),
  media_type text NOT NULL CHECK (media_type = 'application/json'),
  key_id text NOT NULL CHECK (key_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  collected_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  available boolean NOT NULL DEFAULT false,
  deleted boolean NOT NULL DEFAULT false,
  next_reconciliation_at timestamptz,
  selection_order bigint NOT NULL DEFAULT 0 CHECK (selection_order >= 0),
  CONSTRAINT snapshot_generation_key CHECK (
    object_key = 'real/' || acquisition_scope || '/sha256/' || substring(content_hash FROM 8) || '.aead'
  ),
  CONSTRAINT snapshot_generation_fixed_expiry CHECK (expires_at = collected_at + interval '720 hours'),
  CONSTRAINT snapshot_generation_deleted_is_unavailable CHECK (NOT deleted OR NOT available)
);

CREATE INDEX snapshot_generation_reconciliation_idx ON collection.snapshot_generation
  (selection_order, object_key);

CREATE FUNCTION collection.guard_snapshot_generation_metadata()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.object_key, NEW.acquisition_scope, NEW.source_id, NEW.content_hash,
      NEW.byte_length, NEW.media_type, NEW.key_id, NEW.collected_at, NEW.expires_at)
     IS DISTINCT FROM
     (OLD.object_key, OLD.acquisition_scope, OLD.source_id, OLD.content_hash,
      OLD.byte_length, OLD.media_type, OLD.key_id, OLD.collected_at, OLD.expires_at)
     OR (OLD.deleted AND NOT NEW.deleted) THEN
    RAISE EXCEPTION 'collection.snapshot_generation metadata is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER snapshot_generation_guard_metadata
BEFORE UPDATE ON collection.snapshot_generation
FOR EACH ROW EXECUTE FUNCTION collection.guard_snapshot_generation_metadata();

ALTER TABLE collection.snapshot_observation ADD COLUMN object_key text;
UPDATE collection.snapshot_observation AS observation SET object_key = object.object_key
FROM collection.raw_object AS object WHERE object.content_hash = observation.content_hash;
ALTER TABLE collection.snapshot_observation ALTER COLUMN object_key SET NOT NULL,
  DROP CONSTRAINT snapshot_observation_content_hash_fkey,
  ADD CONSTRAINT snapshot_observation_content_hash_fkey FOREIGN KEY (content_hash)
    REFERENCES collection.snapshot_content (content_hash);

-- Preserve older synthetic writers and protect real commits with the same row lock as cleanup.
CREATE FUNCTION collection.validate_snapshot_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE generation collection.snapshot_generation;
BEGIN
  IF NEW.object_key IS NULL THEN
    SELECT object_key INTO NEW.object_key FROM collection.raw_object WHERE content_hash = NEW.content_hash;
  END IF;
  IF NEW.object_key LIKE 'real/%' THEN
    SELECT * INTO generation FROM collection.snapshot_generation WHERE object_key = NEW.object_key FOR SHARE;
    IF NOT FOUND OR NOT generation.available OR generation.deleted
       OR generation.expires_at <= clock_timestamp() OR generation.content_hash <> NEW.content_hash
       OR generation.source_id <> (SELECT source_id FROM collection.collection_run WHERE run_id = NEW.run_id) THEN
      RAISE EXCEPTION 'Real snapshot generation is unavailable';
    END IF;
  ELSIF NEW.object_key IS DISTINCT FROM 'synthetic/sha256/' || substring(NEW.content_hash FROM 8) || '.json' THEN
    RAISE EXCEPTION 'Snapshot reference is invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER snapshot_observation_validate_reference
BEFORE INSERT ON collection.snapshot_observation
FOR EACH ROW EXECUTE FUNCTION collection.validate_snapshot_reference();

CREATE CONSTRAINT TRIGGER snapshot_observation_validate_at_commit
AFTER INSERT ON collection.snapshot_observation DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION collection.validate_snapshot_reference();

CREATE FUNCTION collection.register_synthetic_snapshot_content()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO collection.snapshot_content (content_hash, byte_length, media_type)
  VALUES (NEW.content_hash, NEW.byte_length, NEW.media_type) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER raw_object_register_content AFTER INSERT ON collection.raw_object
FOR EACH ROW EXECUTE FUNCTION collection.register_synthetic_snapshot_content();
