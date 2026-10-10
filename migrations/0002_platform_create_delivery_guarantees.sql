CREATE TABLE platform.inbox (
  consumer_name  text        NOT NULL,
  event_id       uuid        NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consumer_name, event_id),
  CONSTRAINT inbox_consumer_name_is_bounded CHECK (
    char_length(consumer_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT inbox_event_id_is_uuid_v7 CHECK (uuid_extract_version(event_id) = 7)
);

CREATE INDEX inbox_received_at_idx ON platform.inbox (received_at);

CREATE TABLE platform.idempotency_key (
  scope                text        NOT NULL,
  idempotency_key      text        NOT NULL,
  request_fingerprint  text        NOT NULL,
  result_reference     text,
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at           timestamptz NOT NULL,
  PRIMARY KEY (scope, idempotency_key),
  CONSTRAINT idempotency_key_scope_is_bounded CHECK (char_length(scope) BETWEEN 1 AND 100),
  CONSTRAINT idempotency_key_value_is_bounded CHECK (
    char_length(idempotency_key) BETWEEN 1 AND 500
  ),
  CONSTRAINT idempotency_key_fingerprint_is_bounded CHECK (
    char_length(request_fingerprint) BETWEEN 1 AND 200
  ),
  CONSTRAINT idempotency_key_result_reference_is_bounded CHECK (
    result_reference IS NULL OR char_length(result_reference) BETWEEN 1 AND 500
  ),
  CONSTRAINT idempotency_key_expiry_follows_creation CHECK (expires_at > created_at)
);

CREATE INDEX idempotency_key_expires_at_idx ON platform.idempotency_key (expires_at);

ALTER TABLE platform.outbox
  ADD COLUMN claim_id uuid,
  ADD COLUMN claim_expires_at timestamptz,
  ADD CONSTRAINT outbox_claim_is_complete CHECK (
    (claim_id IS NULL) = (claim_expires_at IS NULL)
  ),
  ADD CONSTRAINT outbox_claim_id_is_uuid_v7 CHECK (
    claim_id IS NULL OR uuid_extract_version(claim_id) = 7
  );

DROP INDEX platform.outbox_pending_event_id_idx;

CREATE INDEX outbox_pending_aggregate_head_idx
  ON platform.outbox (aggregate_id, event_id)
  WHERE published_at IS NULL;

CREATE INDEX outbox_pending_claim_expiry_idx
  ON platform.outbox (claim_expires_at, event_id)
  WHERE published_at IS NULL;

CREATE INDEX outbox_published_at_idx
  ON platform.outbox (published_at)
  WHERE published_at IS NOT NULL;
