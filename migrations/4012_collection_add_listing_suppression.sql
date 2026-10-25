-- Permanent identity authority; cleanup failure never rolls suppression back.
CREATE TABLE collection.listing_suppression (
  source_id text NOT NULL REFERENCES collection.source_register(source_id),
  source_listing_id text NOT NULL CHECK (char_length(source_listing_id) BETWEEN 1 AND 300),
  suppression_id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(suppression_id)=7),
  event_id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(event_id)=7),
  suppressed_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY(source_id,source_listing_id)
);
-- Only identity remains when an observation is erased or a discovered candidate is suppressed.
CREATE TABLE collection.run_listing_identity (
  run_id uuid NOT NULL REFERENCES collection.collection_run(run_id),
  source_listing_id text NOT NULL CHECK (char_length(source_listing_id) BETWEEN 1 AND 300),
  PRIMARY KEY(run_id,source_listing_id)
);
ALTER TABLE collection.snapshot_generation ADD COLUMN source_listing_id text,
  ADD COLUMN suppressed boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT snapshot_generation_suppressed_is_unavailable CHECK (NOT suppressed OR NOT available);
-- Historical orphan acquisition scopes are one-way hashes. Backfill only proven observation ownership.
UPDATE collection.snapshot_generation generation SET source_listing_id=observation.source_listing_id
FROM collection.snapshot_observation observation WHERE observation.object_key=generation.object_key;
CREATE TABLE collection.snapshot_upload_owner (
  object_key text NOT NULL,
  source_id text NOT NULL REFERENCES collection.source_register(source_id),
  source_listing_id text NOT NULL,
  PRIMARY KEY(object_key,source_id,source_listing_id)
);
INSERT INTO collection.snapshot_upload_owner SELECT DISTINCT observation.object_key,run.source_id,observation.source_listing_id
FROM collection.snapshot_observation observation JOIN collection.collection_run run USING(run_id)
WHERE observation.object_key LIKE 'synthetic/%';
-- Permanent object tombstones allow the existing retention job to reconcile a cancelled late PUT.
CREATE TABLE collection.synthetic_snapshot_cleanup (
  object_key text PRIMARY KEY,
  next_reconciliation_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  selection_order bigint NOT NULL DEFAULT 0
);
CREATE FUNCTION collection.assert_listing_not_suppressed(source_value text, listing_value text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('["collection.listing",' || to_json(source_value)::text || ',' || to_json(listing_value)::text || ']', 0));
  IF EXISTS (SELECT 1 FROM collection.listing_suppression WHERE source_id=source_value AND source_listing_id=listing_value) THEN
    RAISE EXCEPTION 'Listing is suppressed';
  END IF;
END;
$$;
CREATE FUNCTION collection.guard_suppressed_observation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_value text;
BEGIN
  SELECT source_id INTO source_value FROM collection.collection_run WHERE run_id=NEW.run_id;
  PERFORM collection.assert_listing_not_suppressed(source_value,NEW.source_listing_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER snapshot_observation_suppression_guard BEFORE INSERT OR UPDATE ON collection.snapshot_observation
FOR EACH ROW EXECUTE FUNCTION collection.guard_suppressed_observation();
CREATE FUNCTION collection.guard_suppressed_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_listing_id IS NOT NULL AND (TG_OP='INSERT' OR (NEW.available AND NOT OLD.available)) THEN
    PERFORM collection.assert_listing_not_suppressed(NEW.source_id,NEW.source_listing_id);
  END IF;
  IF TG_OP='UPDATE' AND NEW.source_listing_id IS DISTINCT FROM OLD.source_listing_id THEN
    RAISE EXCEPTION 'Snapshot listing identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER snapshot_generation_suppression_guard BEFORE INSERT OR UPDATE ON collection.snapshot_generation
FOR EACH ROW EXECUTE FUNCTION collection.guard_suppressed_generation();
