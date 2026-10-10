CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.event_log (
  event_id       uuid        PRIMARY KEY,
  event_type     text        NOT NULL,
  event_version  integer     NOT NULL CHECK (event_version > 0),
  aggregate_id   uuid        NOT NULL,
  occurred_at    timestamptz NOT NULL,
  trace_context  jsonb,
  payload        jsonb       NOT NULL,
  appended_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT event_log_event_id_is_uuid_v7 CHECK (uuid_extract_version(event_id) = 7),
  CONSTRAINT event_log_aggregate_id_is_uuid_v7 CHECK (uuid_extract_version(aggregate_id) = 7),
  CONSTRAINT event_log_trace_context_is_object CHECK (
    trace_context IS NULL OR jsonb_typeof(trace_context) = 'object'
  ),
  CONSTRAINT event_log_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE OR REPLACE FUNCTION audit.reject_event_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit.event_log is append-only';
END;
$$;

CREATE TRIGGER event_log_reject_update_or_delete
BEFORE UPDATE OR DELETE ON audit.event_log
FOR EACH ROW EXECUTE FUNCTION audit.reject_event_log_mutation();
