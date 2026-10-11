-- Authority survives delivery/outbox retention; never backfill missing legacy publications.
CREATE TABLE collection.completed_event_evidence (
  event_id uuid PRIMARY KEY CHECK (uuid_extract_version(event_id) = 7),
  run_id uuid NOT NULL UNIQUE REFERENCES collection.collection_run(run_id),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  observed_source_listing_ids jsonb NOT NULL CHECK (jsonb_typeof(observed_source_listing_ids) = 'array'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (event->>'eventId' = event_id::text),
  CHECK (event->>'aggregateId' = run_id::text),
  CHECK (event->>'type' = 'collection.run.completed'),
  CHECK ((event->>'version')::integer = 1)
);
CREATE TRIGGER completed_event_evidence_immutable BEFORE UPDATE ON collection.completed_event_evidence
FOR EACH ROW EXECUTE FUNCTION collection.reject_parsed_event_evidence_update();
