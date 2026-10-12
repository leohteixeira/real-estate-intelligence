-- Metadata only: retained business documents and delivery identities are never rewritten.
CREATE SEQUENCE ask.run_admission_sequence;
ALTER TABLE ask.run ADD COLUMN admission_sequence bigint,
  ADD COLUMN admitted_at timestamptz,
  ADD COLUMN queue_expires_at timestamptz;
WITH ordered AS (SELECT id, row_number() OVER (ORDER BY id) AS position FROM ask.run)
UPDATE ask.run r SET admission_sequence = ordered.position,
  admitted_at = (r.document->>'createdAt')::timestamptz,
  queue_expires_at = (r.document->>'createdAt')::timestamptz + interval '120 seconds'
FROM ordered WHERE ordered.id = r.id;
SELECT setval('ask.run_admission_sequence', GREATEST(1, COALESCE(max(admission_sequence),0)), count(*) > 0) FROM ask.run;
ALTER TABLE ask.run ALTER COLUMN admission_sequence SET NOT NULL,
  ALTER COLUMN admission_sequence SET DEFAULT nextval('ask.run_admission_sequence'),
  ALTER COLUMN admitted_at SET NOT NULL,
  ALTER COLUMN queue_expires_at SET NOT NULL,
  ADD CONSTRAINT run_admission_unique UNIQUE (admission_sequence),
  ADD CONSTRAINT run_queue_deadline_fixed CHECK (queue_expires_at = admitted_at + interval '120 seconds');
CREATE INDEX run_pending_head_idx ON ask.run(thread_id, admission_sequence) WHERE state IN ('queued','running');
CREATE INDEX run_queue_expiry_idx ON ask.run(admission_sequence) WHERE state = 'queued';
CREATE INDEX run_queue_deadline_idx ON ask.run(queue_expires_at, admission_sequence) WHERE state = 'queued';

-- Reuse the old predicates verbatim, admitting one precise unexecuted branch only.
CREATE FUNCTION ask.is_queue_expired(document jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $function$
  SELECT (document->>'state' = 'expired'
    AND document->'decision' = 'null'::jsonb AND document->'result' = 'null'::jsonb
    AND document->'terminal' = jsonb_build_object('state','expired','reason','queue_expired','at',document->>'updatedAt')
    AND document->'steps' = jsonb_build_array(jsonb_build_object('sequence',1,'phase','expired','at',document->>'updatedAt'))
    AND (document->>'createdAt')::timestamptz <= (document->>'updatedAt')::timestamptz) IS TRUE;
$function$;
ALTER TABLE ask.run DROP CONSTRAINT run_state_check;
ALTER TABLE ask.run ADD CONSTRAINT run_state_check CHECK (state IN ('queued','running','completed','failed','expired'));
DO $migration$
DECLARE name text; original text;
BEGIN
  FOREACH name IN ARRAY ARRAY['run_document_terminal_matches','run_document_execution_history_matches'] LOOP
    SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint
      WHERE conrelid='ask.run'::regclass AND conname=name;
    EXECUTE format('ALTER TABLE ask.run DROP CONSTRAINT %I', name);
    -- CASE is intentional: the old history branch subtracts keys from the decision object;
    -- evaluating it for an honest null-decision expiry would raise on the JSON scalar.
    EXECUTE format('ALTER TABLE ask.run ADD CONSTRAINT %I CHECK (CASE WHEN state = ''expired'' THEN ask.is_queue_expired(document) ELSE (%s) END)', name, substring(original FROM 7));
  END LOOP;
  SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint
    WHERE conrelid='ask.run_event'::regclass AND conname='run_event_identity_matches';
  ALTER TABLE ask.run_event DROP CONSTRAINT run_event_identity_matches;
  EXECUTE 'ALTER TABLE ask.run_event ADD CONSTRAINT run_event_identity_matches CHECK ((' || substring(original FROM 7) || ') OR ((document->>''runId'' = run_id::text AND document->''sequence'' = to_jsonb(sequence) AND document->''version'' = ''1''::jsonb AND document->>''id'' = run_id::text || '':v1:'' || sequence::text AND document->''run''->>''id'' = run_id::text AND document - ARRAY[''version'',''id'',''runId'',''sequence'',''event'',''terminal'',''run''] = ''{}''::jsonb AND document->''terminal'' = ''true''::jsonb AND document->>''event'' = ''ask.expired'' AND ask.is_queue_expired(document->''run'')) IS TRUE))';
END
$migration$;
ALTER TABLE ask.run DROP CONSTRAINT run_claim_matches_state;
ALTER TABLE ask.run ADD CONSTRAINT run_claim_matches_state CHECK ((state IN ('queued','expired')) = (execution_id IS NULL));
ALTER TABLE ask.run ADD CONSTRAINT run_expired_is_unexecuted CHECK (state <> 'expired' OR (
  execution_id IS NULL AND claim_expires_at IS NULL AND grant_digest IS NULL
  AND checkpoint_grant_digest IS NULL AND graph_started_at IS NULL
  AND graph_expires_at IS NULL AND graph_pruned_at IS NULL));
