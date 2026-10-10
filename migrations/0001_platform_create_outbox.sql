CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE platform.outbox (
  event_id       uuid        PRIMARY KEY DEFAULT uuidv7(),
  event_type     text        NOT NULL,
  event_version  integer     NOT NULL CHECK (event_version > 0),
  aggregate_id   uuid        NOT NULL,
  occurred_at    timestamptz NOT NULL,
  trace_context  jsonb,
  payload        jsonb       NOT NULL,
  published_at   timestamptz,
  CONSTRAINT outbox_event_id_is_uuid_v7 CHECK (uuid_extract_version(event_id) = 7),
  CONSTRAINT outbox_aggregate_id_is_uuid_v7 CHECK (uuid_extract_version(aggregate_id) = 7),
  CONSTRAINT outbox_trace_context_is_object CHECK (
    trace_context IS NULL OR jsonb_typeof(trace_context) = 'object'
  ),
  CONSTRAINT outbox_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX outbox_pending_event_id_idx
  ON platform.outbox (event_id)
  WHERE published_at IS NULL;
