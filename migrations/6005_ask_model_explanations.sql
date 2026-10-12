-- Historical JSON and checkpoints are retained verbatim. Only the new basis owns explanation.
DO $migration$
DECLARE name text; original text; normalized text;
BEGIN
  FOREACH name IN ARRAY ARRAY['run_document_is_structured','run_document_execution_history_matches'] LOOP
    SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint
      WHERE conrelid='ask.run'::regclass AND conname=name;
    normalized := replace(substring(original FROM 7), 'document',
      '(jsonb_set(document - ''explanation'', ''{basis}'', ''"text-price-v1"''::jsonb))');
    EXECUTE format('ALTER TABLE ask.run DROP CONSTRAINT %I', name);
    EXECUTE format('ALTER TABLE ask.run ADD CONSTRAINT %I CHECK (CASE WHEN document->>''basis'' = ''text-price-explanation-v1'' THEN document ? ''explanation'' AND (%s) ELSE (%s) END)', name, normalized, substring(original FROM 7));
  END LOOP;
END
$migration$;
ALTER TABLE ask.run ADD CONSTRAINT run_explanation_matches CHECK ((
  CASE WHEN document->>'basis' = 'text-price-explanation-v1' THEN
    CASE WHEN state = 'completed' THEN
      jsonb_typeof(document->'explanation') = 'object'
      AND document->'explanation'->>'runId' = id::text
      AND document->'explanation'->>'threadId' = thread_id::text
      AND document->'explanation'->>'eventId' = requested_event_id::text
      AND document->'explanation'->>'authorship' = 'model-written'
      AND document->'explanation'->>'locale' = document->>'locale'
      AND document->'explanation'->>'route' = 'vercel-ai-gateway'
      AND document->'explanation'->>'promptVersion' = 'price-explanation-prompt-v1'
      AND document->'explanation'->>'grammarVersion' = 'price-explanation-facts-v1'
      AND char_length(document->'explanation'->>'text') BETWEEN 1 AND 2048
      AND (document->'explanation'->>'outputTokens')::integer BETWEEN 1 AND 1000
    ELSE document->'explanation' = 'null'::jsonb END
  ELSE NOT (document ? 'explanation') END
) IS TRUE);
ALTER TABLE ask.run_event DROP CONSTRAINT run_event_price_provenance_matches;
ALTER TABLE ask.run_event ADD CONSTRAINT run_event_price_provenance_matches CHECK ((
  document->'run'->>'basis' IN ('structured-price-v1','text-price-v1','text-price-explanation-v1')
  AND (document->'run'->'decision' = 'null'::jsonb OR
    document->'run'->'decision'->>'source' = CASE
      WHEN document->'run'->>'basis' = 'structured-price-v1' THEN 'fixed-structured-v1'
      ELSE 'validated-text-v1' END)
) IS TRUE);
ALTER TABLE ask.graph_checkpoint DROP CONSTRAINT graph_checkpoint_graph_version_check;
ALTER TABLE ask.graph_checkpoint ADD CONSTRAINT graph_checkpoint_graph_version_check
  CHECK (graph_version IN ('price-v1','price-explanation-v1'));
CREATE TABLE ask.model_attempt (
  run_id uuid NOT NULL REFERENCES ask.run(id),
  id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(id) = 7),
  attempt_key text NOT NULL CHECK (attempt_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  execution_id uuid NOT NULL CHECK (uuid_extract_version(execution_id) = 7),
  max_output_tokens integer NOT NULL CHECK (max_output_tokens BETWEEN 1 AND 1000),
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id,id),
  UNIQUE (run_id,attempt_key),
  CONSTRAINT model_attempt_document_matches CHECK ((
    document->>'reservationId' = id::text AND document->>'attemptKey' = attempt_key
    AND document->>'route' = 'vercel-ai-gateway'
    AND document->>'purpose' IN ('privacy-probe','explanation')
    AND document->>'model' IN ('anthropic/claude-haiku-5.5','deepseek/deepseek-v4-flash-0731')
    AND document->'maxOutputTokens' = to_jsonb(max_output_tokens)
    AND (document->>'reservedTotal')::integer BETWEEN max_output_tokens AND 1000
    AND document ?& ARRAY['reservationId','attemptKey','purpose','model','route','maxOutputTokens','reservedTotal']
    AND document - ARRAY['reservationId','attemptKey','purpose','model','route','maxOutputTokens','reservedTotal'] = '{}'::jsonb
  ) IS TRUE)
);
CREATE TABLE ask.model_explanation (
  run_id uuid PRIMARY KEY REFERENCES ask.run(id),
  id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(id) = 7),
  tool_receipt_id uuid NOT NULL REFERENCES ask.tool_receipt(id),
  reservation_id uuid NOT NULL,
  document jsonb NOT NULL,
  FOREIGN KEY (run_id,reservation_id) REFERENCES ask.model_attempt(run_id,id),
  CONSTRAINT model_explanation_identity_matches CHECK ((
    document->>'runId' = run_id::text AND document->>'explanationId' = id::text
    AND document->>'toolReceiptId' = tool_receipt_id::text
    AND document->>'reservationId' = reservation_id::text
    AND document->>'authorship' = 'model-written'
    AND document->>'route' = 'vercel-ai-gateway'
    AND document->>'version' = '1'
    AND document->>'locale' IN ('en','pt-BR')
    AND document->>'model' IN ('anthropic/claude-haiku-5.5','deepseek/deepseek-v4-flash-0731')
    AND document->>'promptVersion' = 'price-explanation-prompt-v1'
    AND document->>'grammarVersion' = 'price-explanation-facts-v1'
    AND document ?& ARRAY['version','eventId','runId','threadId','explanationId','toolReceiptId','reservationId','authorship','promptVersion','grammarVersion','locale','text','model','route','privacyEvidenceId','outputTokens','acceptedAt']
    AND document - ARRAY['version','eventId','runId','threadId','explanationId','toolReceiptId','reservationId','authorship','promptVersion','grammarVersion','locale','text','model','route','privacyEvidenceId','outputTokens','acceptedAt'] = '{}'::jsonb
    AND char_length(document->>'text') BETWEEN 1 AND 2048
    AND (document->>'outputTokens')::integer BETWEEN 1 AND 1000
  ) IS TRUE)
);
CREATE FUNCTION ask.fence_model_attempt() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE target ask.run%ROWTYPE; total integer;
BEGIN
  SELECT * INTO STRICT target FROM ask.run WHERE id=NEW.run_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('ask:' || target.thread_id::text,0));
  SELECT * INTO STRICT target FROM ask.run WHERE id=NEW.run_id;
  IF target.document->>'basis' <> 'text-price-explanation-v1' OR target.state <> 'running'
    OR target.execution_id <> NEW.execution_id OR target.claim_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Model attempt authority unavailable';
  END IF;
  SELECT COALESCE(sum(max_output_tokens),0) + NEW.max_output_tokens INTO total FROM ask.model_attempt WHERE run_id=NEW.run_id;
  IF total > 1000 OR NEW.document->'reservedTotal' <> to_jsonb(total) THEN
    RAISE EXCEPTION 'Model attempt budget unavailable';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER model_attempt_fence BEFORE INSERT ON ask.model_attempt FOR EACH ROW EXECUTE FUNCTION ask.fence_model_attempt();
CREATE FUNCTION ask.fence_model_explanation() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE target ask.run%ROWTYPE; receipt ask.tool_receipt%ROWTYPE; attempt ask.model_attempt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT target FROM ask.run WHERE id=NEW.run_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('ask:' || target.thread_id::text,0));
  SELECT * INTO STRICT target FROM ask.run WHERE id=NEW.run_id;
  SELECT * INTO STRICT receipt FROM ask.tool_receipt WHERE id=NEW.tool_receipt_id AND run_id=NEW.run_id;
  SELECT * INTO STRICT attempt FROM ask.model_attempt WHERE id=NEW.reservation_id AND run_id=NEW.run_id;
  IF target.document->>'basis' <> 'text-price-explanation-v1' OR target.state <> 'running'
    OR target.claim_expires_at <= clock_timestamp() OR target.execution_id <> attempt.execution_id
    OR receipt.document->>'executionId' <> target.execution_id::text
    OR NEW.document->>'threadId' <> target.thread_id::text
    OR NEW.document->>'eventId' <> target.requested_event_id::text
    OR NEW.document->>'locale' <> target.document->>'locale'
    OR attempt.document->>'purpose' <> 'explanation'
    OR NEW.document->>'model' <> attempt.document->>'model'
    OR (NEW.document->>'outputTokens')::integer > attempt.max_output_tokens THEN
    RAISE EXCEPTION 'Model explanation authority unavailable';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER model_explanation_fence BEFORE INSERT ON ask.model_explanation FOR EACH ROW EXECUTE FUNCTION ask.fence_model_explanation();
CREATE FUNCTION ask.immutable_model_evidence() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'Model evidence is immutable';
END
$function$;
CREATE TRIGGER model_attempt_immutable BEFORE UPDATE OR DELETE ON ask.model_attempt FOR EACH ROW EXECUTE FUNCTION ask.immutable_model_evidence();
CREATE TRIGGER model_explanation_immutable BEFORE UPDATE OR DELETE ON ask.model_explanation FOR EACH ROW EXECUTE FUNCTION ask.immutable_model_evidence();
