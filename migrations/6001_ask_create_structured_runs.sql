CREATE SCHEMA IF NOT EXISTS ask;

CREATE TABLE ask.thread (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  authority_digest text NOT NULL CHECK (authority_digest ~ '^[0-9a-f]{64}$'),
  preparation_key text UNIQUE CHECK (preparation_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT thread_id_is_uuid_v7 CHECK (uuid_extract_version(id) = 7)
);
CREATE TABLE ask.run (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES ask.thread(id),
  creation_key text NOT NULL UNIQUE CHECK (creation_key ~ '^[0-9a-f]{64}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  requested_event_id uuid NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('queued','running','completed','failed')),
  price_minor_units bigint NOT NULL CHECK (price_minor_units BETWEEN 1 AND 9007199254740991),
  area_square_meters double precision NOT NULL CHECK (area_square_meters > 0 AND area_square_meters <= 1000000),
  execution_id uuid,
  claim_expires_at timestamptz,
  grant_digest text CHECK (grant_digest ~ '^[0-9a-f]{64}$'),
  document jsonb NOT NULL,
  CONSTRAINT run_id_is_uuid_v7 CHECK (uuid_extract_version(id) = 7),
  CONSTRAINT requested_event_id_is_uuid_v7 CHECK (uuid_extract_version(requested_event_id) = 7),
  CONSTRAINT execution_id_is_uuid_v7 CHECK (execution_id IS NULL OR uuid_extract_version(execution_id) = 7),
  CONSTRAINT run_document_state_matches CHECK ((document->>'state' = state AND document->>'id' = id::text AND document->>'threadId' = thread_id::text) IS TRUE),
  CONSTRAINT run_document_is_structured CHECK (
    (jsonb_typeof(document) = 'object'
     AND document ?& ARRAY['basis','id','threadId','principalId','question','locale','placeId','createdAt','updatedAt','state','originalInputs','decision','result','terminal','steps']
     AND document - ARRAY['basis','id','threadId','principalId','question','locale','placeId','createdAt','updatedAt','state','originalInputs','decision','result','terminal','steps'] = '{}'::jsonb
     AND document->>'basis' = 'structured-price-v1'
     AND document->'principalId' = 'null'::jsonb
     AND jsonb_typeof(document->'question') = 'string'
     AND char_length(document->>'question') BETWEEN 1 AND 16000
     AND document->>'locale' IN ('en','pt-BR')
     AND jsonb_typeof(document->'originalInputs') = 'object'
     AND (document->'originalInputs') - ARRAY['priceMinorUnits','currency','areaSquareMeters'] = '{}'::jsonb
     AND jsonb_typeof(document->'originalInputs'->'priceMinorUnits') = 'number'
     AND jsonb_typeof(document->'originalInputs'->'areaSquareMeters') = 'number'
     AND document->'originalInputs'->>'currency' = 'BRL'
     AND (document->'originalInputs'->>'priceMinorUnits')::numeric = price_minor_units
     AND (document->'originalInputs'->>'areaSquareMeters')::double precision = area_square_meters
     AND jsonb_typeof(document->'steps') = 'array'
     AND jsonb_typeof(document->'createdAt') = 'string'
     AND jsonb_typeof(document->'updatedAt') = 'string'
     AND (document->>'createdAt')::timestamptz <= (document->>'updatedAt')::timestamptz) IS TRUE
  ),
  CONSTRAINT run_document_terminal_matches CHECK ((
    (state = 'queued' AND document->'decision' = 'null'::jsonb AND jsonb_array_length(document->'steps') = 0 AND document->'terminal' = 'null'::jsonb AND document->'result' = 'null'::jsonb)
    OR (state = 'running' AND jsonb_typeof(document->'decision') = 'object' AND jsonb_array_length(document->'steps') = 1 AND document->'terminal' = 'null'::jsonb AND document->'result' = 'null'::jsonb)
    OR (state = 'completed' AND jsonb_typeof(document->'decision') = 'object' AND jsonb_array_length(document->'steps') = 2 AND document->'terminal'->>'state' = 'completed' AND document->'terminal'->'reason' = 'null'::jsonb AND document->'terminal'->>'at' = document->>'updatedAt' AND document->'result'->>'kind' = 'price_per_square_meter' AND document->'result'->>'currency' = 'BRL' AND document->'result'->>'areaUnit' = 'm2' AND document->'result'->'inputs' = document->'originalInputs' AND (document->'result'->>'minorUnits')::numeric BETWEEN 1 AND 9007199254740991)
    OR (state = 'failed' AND jsonb_typeof(document->'decision') = 'object' AND jsonb_array_length(document->'steps') = 2 AND document->'terminal'->>'state' = 'failed' AND document->'terminal'->>'reason' = 'execution_unavailable' AND document->'terminal'->>'at' = document->>'updatedAt' AND document->'result' = 'null'::jsonb)
  ) IS TRUE),
  CONSTRAINT run_document_execution_history_matches CHECK ((state = 'queued' OR (
    (document->'decision') - ARRAY['source','intent','decidedAt'] = '{}'::jsonb
    AND document->'decision'->>'source' = 'fixed-structured-v1'
    AND document->'decision'->>'intent' = 'price_per_square_meter'
    AND document->'decision'->>'decidedAt' = document->'steps'->0->>'at'
    AND (document->'decision'->>'decidedAt')::timestamptz BETWEEN (document->>'createdAt')::timestamptz AND (document->>'updatedAt')::timestamptz
    AND (document->'steps'->0) - ARRAY['sequence','phase','at'] = '{}'::jsonb
    AND document->'steps'->0->'sequence' = '1'::jsonb
    AND document->'steps'->0->>'phase' = 'calculating'
    AND (state = 'running' OR (
      (document->'steps'->1) - ARRAY['sequence','phase','at'] = '{}'::jsonb
      AND document->'steps'->1->'sequence' = '2'::jsonb
      AND document->'steps'->1->>'phase' = state
      AND document->'steps'->1->>'at' = document->>'updatedAt'
      AND (document->'terminal') - ARRAY['state','reason','at'] = '{}'::jsonb
    ))
    AND (state <> 'completed' OR (
      (document->'result') - ARRAY['kind','minorUnits','currency','areaUnit','inputs','computedAt'] = '{}'::jsonb
      AND jsonb_typeof(document->'result'->'minorUnits') = 'number'
      AND (document->'result'->>'minorUnits')::numeric = trunc((document->'result'->>'minorUnits')::numeric)
      AND (document->'result'->>'computedAt')::timestamptz BETWEEN (document->'decision'->>'decidedAt')::timestamptz AND (document->>'updatedAt')::timestamptz
    ))
  )) IS TRUE),
  CONSTRAINT run_claim_matches_state CHECK ((state = 'queued') = (execution_id IS NULL)),
  CONSTRAINT run_claim_is_complete CHECK ((execution_id IS NULL) = (claim_expires_at IS NULL) AND (execution_id IS NULL) = (grant_digest IS NULL))
);
CREATE INDEX run_thread_idx ON ask.run(thread_id, id);
CREATE TABLE ask.run_event (
  run_id uuid NOT NULL REFERENCES ask.run(id),
  sequence integer NOT NULL CHECK (sequence > 0),
  document jsonb NOT NULL,
  PRIMARY KEY (run_id, sequence),
  CONSTRAINT run_event_identity_matches CHECK ((document->>'runId' = run_id::text AND document->'sequence' = to_jsonb(sequence) AND document->'version' = '1'::jsonb AND document->>'id' = run_id::text || ':v1:' || sequence::text AND document->'run'->>'id' = run_id::text AND jsonb_typeof(document->'terminal') = 'boolean' AND document - ARRAY['version','id','runId','sequence','event','terminal','run'] = '{}'::jsonb AND ((document->'terminal' = 'false'::jsonb AND document->>'event' = 'ask.progress' AND document->'run'->>'state' IN ('queued','running')) OR (document->'terminal' = 'true'::jsonb AND document->>'event' = 'ask.' || (document->'run'->>'state') AND document->'run'->>'state' IN ('completed','failed')))) IS TRUE)
);
CREATE TABLE ask.tool_receipt (
  run_id uuid PRIMARY KEY REFERENCES ask.run(id),
  id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(id) = 7),
  document jsonb NOT NULL,
  CONSTRAINT tool_receipt_identity_matches CHECK ((document->>'runId' = run_id::text AND document->>'receiptId' = id::text AND document->'version' = '1'::jsonb AND document->>'operation' = 'price-per-square-meter' AND document->>'provenance' = 'market-domain-v1' AND document ?& ARRAY['version','eventId','runId','threadId','executionId','operation','inputs','receiptId','provenance','result'] AND document - ARRAY['version','eventId','runId','threadId','executionId','operation','inputs','receiptId','provenance','result'] = '{}'::jsonb AND uuid_extract_version((document->>'eventId')::uuid) = 7 AND uuid_extract_version((document->>'threadId')::uuid) = 7 AND uuid_extract_version((document->>'executionId')::uuid) = 7 AND jsonb_typeof(document->'result') = 'object' AND document->'result'->>'kind' = 'price_per_square_meter' AND document->'result'->>'currency' = 'BRL' AND document->'result'->>'areaUnit' = 'm2' AND jsonb_typeof(document->'result'->'minorUnits') = 'number' AND (document->'result'->>'minorUnits')::numeric BETWEEN 1 AND 9007199254740991 AND (document->'result'->>'minorUnits')::numeric = trunc((document->'result'->>'minorUnits')::numeric) AND document->'result'->'inputs' = document->'inputs') IS TRUE)
);
