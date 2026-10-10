-- Unknown legacy image evidence remains NULL until independently verified from stored bytes.
ALTER TABLE collection.snapshot_observation
  ADD COLUMN image_fingerprints jsonb,
  ADD COLUMN correction_order integer NOT NULL DEFAULT 0 CHECK (correction_order >= 0),
  ADD CONSTRAINT snapshot_observation_fingerprints_are_array CHECK (
    image_fingerprints IS NULL OR jsonb_typeof(image_fingerprints) = 'array'
  );

CREATE TABLE collection.snapshot_reparse (
  operation_key text PRIMARY KEY CHECK (operation_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  snapshot_id uuid NOT NULL REFERENCES collection.snapshot_observation (snapshot_id),
  parser_revision text NOT NULL CHECK (parser_revision ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  event_id uuid UNIQUE CHECK (uuid_extract_version(event_id) = 7),
  correction_order integer CHECK (correction_order > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK ((event_id IS NULL AND correction_order IS NULL AND completed_at IS NULL)
    OR (event_id IS NOT NULL AND correction_order IS NOT NULL AND completed_at IS NOT NULL)),
  UNIQUE (snapshot_id, correction_order)
);

CREATE FUNCTION collection.guard_snapshot_reparse()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE observation collection.snapshot_observation; generation collection.snapshot_generation;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.operation_key, NEW.snapshot_id, NEW.parser_revision, NEW.created_at)
      IS DISTINCT FROM (OLD.operation_key, OLD.snapshot_id, OLD.parser_revision, OLD.created_at)
      OR (OLD.event_id IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'Snapshot reparse identity and completed result are immutable';
    END IF;
  END IF;
  SELECT * INTO observation FROM collection.snapshot_observation WHERE snapshot_id = NEW.snapshot_id;
  IF NOT FOUND OR observation.outcome <> 'parsed' OR observation.parsed_event_id IS NULL
    OR observation.image_fingerprints IS NULL THEN
    RAISE EXCEPTION 'Original parsed observation evidence is unavailable';
  END IF;
  IF observation.object_key LIKE 'real/%' THEN
    SELECT * INTO generation FROM collection.snapshot_generation WHERE object_key = observation.object_key FOR SHARE;
    IF NOT FOUND OR NOT generation.available OR generation.deleted
      OR generation.expires_at <= clock_timestamp() OR generation.content_hash <> observation.content_hash
      OR generation.source_id <> (SELECT source_id FROM collection.collection_run WHERE run_id = observation.run_id) THEN
      RAISE EXCEPTION 'Real snapshot generation is unavailable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER snapshot_reparse_guard BEFORE INSERT OR UPDATE ON collection.snapshot_reparse
FOR EACH ROW EXECUTE FUNCTION collection.guard_snapshot_reparse();
CREATE CONSTRAINT TRIGGER snapshot_reparse_validate_at_commit
AFTER INSERT OR UPDATE ON collection.snapshot_reparse DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION collection.guard_snapshot_reparse();

CREATE FUNCTION collection.guard_original_fingerprints()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.image_fingerprints IS NOT NULL AND NEW.image_fingerprints IS DISTINCT FROM OLD.image_fingerprints THEN
    RAISE EXCEPTION 'Original image evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER snapshot_observation_guard_fingerprints BEFORE UPDATE ON collection.snapshot_observation
FOR EACH ROW EXECUTE FUNCTION collection.guard_original_fingerprints();
