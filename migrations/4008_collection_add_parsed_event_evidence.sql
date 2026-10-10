-- New publications only: legacy events are never reconstructed from retained outbox rows.
CREATE TABLE collection.parsed_event_evidence (
  event_id uuid PRIMARY KEY CHECK (uuid_extract_version(event_id) = 7),
  snapshot_id uuid NOT NULL REFERENCES collection.snapshot_observation(snapshot_id),
  event_version integer NOT NULL CHECK (event_version IN (1, 2)),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (event->>'eventId' = event_id::text),
  CHECK (event->>'type' = 'collection.snapshot.parsed'),
  CHECK ((event->>'version')::integer = event_version),
  CHECK (event->'payload'->'snapshot'->>'snapshotId' = snapshot_id::text)
);

CREATE FUNCTION collection.reject_parsed_event_evidence_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Parsed publication evidence is immutable';
END;
$$;
CREATE TRIGGER parsed_event_evidence_immutable BEFORE UPDATE ON collection.parsed_event_evidence
FOR EACH ROW EXECUTE FUNCTION collection.reject_parsed_event_evidence_update();
-- Deletion remains possible for the later suppression/removal capability (ADR 0015).
