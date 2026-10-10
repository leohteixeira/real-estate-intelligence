ALTER TABLE collection.collection_run
  ADD COLUMN changed_count integer NOT NULL DEFAULT 0;

ALTER TABLE collection.collection_run
  DROP CONSTRAINT collection_run_counts_are_valid,
  ADD CONSTRAINT collection_run_counts_are_valid CHECK (
    observed_count >= 0
    AND parsed_count >= 0
    AND changed_count >= 0
    AND suppressed_count >= 0
    AND failed_count >= 0
    AND changed_count <= parsed_count
    AND parsed_count + suppressed_count + failed_count <= observed_count
  );

ALTER TABLE collection.snapshot_observation
  ALTER COLUMN parsed_event_id DROP NOT NULL,
  ADD COLUMN outcome text NOT NULL DEFAULT 'parsed',
  ADD COLUMN changed boolean NOT NULL DEFAULT false,
  ADD COLUMN failure_reason text,
  ADD CONSTRAINT snapshot_observation_outcome_is_supported CHECK (
    outcome IN ('parsed', 'failed')
  ),
  ADD CONSTRAINT snapshot_observation_outcome_is_coherent CHECK (
    (
      outcome = 'parsed'
      AND parsed_event_id IS NOT NULL
      AND failure_reason IS NULL
    ) OR (
      outcome = 'failed'
      AND parsed_event_id IS NULL
      AND NOT changed
      AND failure_reason IS NOT NULL
      AND char_length(failure_reason) BETWEEN 1 AND 100
    )
  );

CREATE INDEX snapshot_observation_prior_completed_idx
  ON collection.snapshot_observation (source_listing_id, run_id, snapshot_id);

CREATE TABLE collection.collection_schedule (
  schedule_id              text        PRIMARY KEY,
  source_id                text        NOT NULL UNIQUE REFERENCES collection.source_register (source_id),
  interval_seconds         integer     NOT NULL,
  enabled                  boolean     NOT NULL DEFAULT false,
  next_run_at              timestamptz NOT NULL,
  in_flight_operation_key  text,
  in_flight_scheduled_for  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT collection_schedule_id_is_lower_kebab CHECK (
    schedule_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT collection_schedule_interval_is_bounded CHECK (
    interval_seconds BETWEEN 1 AND 604800
  ),
  CONSTRAINT collection_schedule_in_flight_is_coherent CHECK (
    (in_flight_operation_key IS NULL) = (in_flight_scheduled_for IS NULL)
    AND (
      in_flight_operation_key IS NULL
      OR (
        char_length(in_flight_operation_key) BETWEEN 1 AND 200
        AND in_flight_operation_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      )
    )
  )
);

CREATE INDEX collection_schedule_due_idx
  ON collection.collection_schedule (next_run_at, schedule_id)
  WHERE enabled AND in_flight_operation_key IS NULL;

INSERT INTO collection.collection_schedule (
  schedule_id,
  source_id,
  interval_seconds,
  enabled,
  next_run_at
)
VALUES
  ('synthetic-data', 'synthetic-data', 86400, false, '2026-10-11T00:00:00Z'),
  ('synthetic-portal-aurora', 'synthetic-portal-aurora', 86400, false, '2026-10-11T00:00:00Z'),
  ('synthetic-portal-brisa', 'synthetic-portal-brisa', 86400, false, '2026-10-11T00:00:00Z'),
  ('synthetic-portal-cobalto', 'synthetic-portal-cobalto', 86400, false, '2026-10-11T00:00:00Z');
