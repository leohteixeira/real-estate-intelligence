CREATE TABLE properties.source_work (
  source_id text PRIMARY KEY,
  last_started_at timestamptz,
  last_run_id uuid,
  listing_cursor text,
  original_cursor text,
  touched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((last_started_at IS NULL) = (last_run_id IS NULL))
);
CREATE TABLE properties.listing_current (
  listing_id uuid PRIMARY KEY REFERENCES properties.listing(listing_id),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  revision integer NOT NULL CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state->>'revision')::integer = revision)
);
CREATE TABLE properties.listing_acquisition (
  snapshot_id uuid PRIMARY KEY CHECK (uuid_extract_version(snapshot_id) = 7),
  listing_id uuid NOT NULL REFERENCES properties.listing(listing_id),
  event_id uuid NOT NULL UNIQUE REFERENCES properties.incoming_fact(event_id),
  observed_at timestamptz NOT NULL
);
CREATE TABLE properties.listing_event (
  listing_id uuid NOT NULL REFERENCES properties.listing(listing_id),
  revision integer NOT NULL CHECK (revision >= 1),
  event_id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(event_id) = 7),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  PRIMARY KEY (listing_id, revision),
  CHECK (event->>'eventId' = event_id::text),
  CHECK (event->>'aggregateId' = listing_id::text),
  CHECK ((event->'payload'->>'revision')::integer = revision)
);
CREATE TABLE properties.listing_run_effect (
  source_id text NOT NULL,
  source_listing_id text NOT NULL,
  run_id uuid NOT NULL CHECK (uuid_extract_version(run_id) = 7),
  disposition text NOT NULL DEFAULT 'applied' CHECK (disposition IN ('applied', 'rejected')),
  PRIMARY KEY (source_id, source_listing_id, run_id)
);
CREATE TABLE properties.correction_effect (
  event_id uuid PRIMARY KEY REFERENCES properties.incoming_fact(event_id),
  disposition text NOT NULL DEFAULT 'applied' CHECK (disposition IN ('applied','rejected'))
);
CREATE TABLE properties.original_effect (
  event_id uuid PRIMARY KEY REFERENCES properties.incoming_fact(event_id)
);
CREATE TRIGGER listing_acquisition_immutable BEFORE UPDATE ON properties.listing_acquisition
FOR EACH ROW EXECUTE FUNCTION properties.reject_initial_evidence_update();
CREATE TRIGGER listing_event_immutable BEFORE UPDATE ON properties.listing_event
FOR EACH ROW EXECUTE FUNCTION properties.reject_initial_evidence_update();
-- The application recovers retained legacy envelopes through the shared publication reader.
-- Properties migrations read and write only Properties-owned state.
-- Trust is checked through the Collection facade at reconciliation time.
INSERT INTO properties.source_work (source_id) SELECT DISTINCT source_id FROM properties.incoming_fact;
