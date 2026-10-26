-- Routed requests have their own closed document; historical predicates stay verbatim.
ALTER TABLE ask.run ALTER COLUMN price_minor_units DROP NOT NULL,
  ALTER COLUMN area_square_meters DROP NOT NULL,
  ADD COLUMN confirmation_deadline timestamptz;
ALTER TABLE ask.run DROP CONSTRAINT run_state_check;
ALTER TABLE ask.run ADD CONSTRAINT run_state_check CHECK (state IN ('queued','running','awaiting_confirmation','completed','failed','expired','cancelled'));
DO $migration$
DECLARE name text; original text;
BEGIN
  FOREACH name IN ARRAY ARRAY['run_document_is_structured','run_document_terminal_matches','run_document_execution_history_matches','run_claim_matches_state','run_expired_is_unexecuted'] LOOP
    SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint WHERE conrelid='ask.run'::regclass AND conname=name;
    EXECUTE format('ALTER TABLE ask.run DROP CONSTRAINT %I',name);
    EXECUTE format('ALTER TABLE ask.run ADD CONSTRAINT %I CHECK (CASE WHEN document->>''basis'' = ''routed-text-v1'' THEN true ELSE (%s) END)',name,substring(original FROM 7));
  END LOOP;
END
$migration$;
ALTER TABLE ask.run ADD CONSTRAINT historical_operands_required CHECK (document->>'basis'='routed-text-v1' OR (price_minor_units IS NOT NULL AND area_square_meters IS NOT NULL));
CREATE FUNCTION ask.valid_intent_decision(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $function$
 SELECT (jsonb_typeof(d)='object'
   AND d ?& ARRAY['intent','probability','probabilities','source','degraded','taxonomyVersion','privacyEvidenceId','receiptId','acceptedAt']
   AND d - ARRAY['intent','probability','probabilities','source','degraded','taxonomyVersion','privacyEvidenceId','receiptId','acceptedAt']='{}'::jsonb
   AND d->>'intent' IN ('price_per_square_meter','listing_search','property_history','region_statistics','comparables','unsupported')
   AND d->>'taxonomyVersion'='ask-intents-v1'
   AND jsonb_typeof(d->'probability')='number' AND (d->>'probability')::numeric BETWEEN 0 AND 1
   AND jsonb_typeof(d->'probabilities')='object'
   AND (d->'probabilities') ?& ARRAY['price_per_square_meter','listing_search','property_history','region_statistics','comparables','unsupported']
   AND (d->'probabilities') - ARRAY['price_per_square_meter','listing_search','property_history','region_statistics','comparables','unsupported']='{}'::jsonb
   AND NOT EXISTS (SELECT 1 FROM jsonb_each(d->'probabilities') p WHERE jsonb_typeof(p.value)<>'number' OR (p.value::text)::numeric NOT BETWEEN 0 AND 1)
   AND abs((SELECT sum((p.value::text)::numeric) FROM jsonb_each(d->'probabilities') p)-1)<=0.000001
   AND d->'probability'=d->'probabilities'->(d->>'intent')
   AND ((d->>'source'='heuristic-v1' AND d->'degraded'='true'::jsonb AND d->'privacyEvidenceId'='null'::jsonb)
     OR (d->>'source'='gateway-jev-v1' AND d->'degraded'='false'::jsonb AND d->>'privacyEvidenceId' ~ '^[A-Za-z0-9_-]{16,128}$'))
   AND uuid_extract_version((d->>'receiptId')::uuid)=7 AND jsonb_typeof(d->'acceptedAt')='string') IS TRUE;
$function$;
CREATE FUNCTION ask.valid_routed_run(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $function$
 SELECT (jsonb_typeof(d)='object'
  AND d ?& ARRAY['basis','id','threadId','principalId','question','locale','placeId','createdAt','updatedAt','state','originalInputs','decision','confirmation','confirmationDeadline','result','terminal','steps']
  AND d - ARRAY['basis','id','threadId','principalId','question','locale','placeId','createdAt','updatedAt','state','originalInputs','decision','confirmation','confirmationDeadline','result','terminal','steps']='{}'::jsonb
  AND d->>'basis'='routed-text-v1' AND d->'principalId'='null'::jsonb
  AND jsonb_typeof(d->'question')='string' AND char_length(d->>'question') BETWEEN 1 AND 16000
  AND d->>'locale' IN ('en','pt-BR') AND jsonb_typeof(d->'steps')='array'
  AND (d->>'createdAt')::timestamptz<=(d->>'updatedAt')::timestamptz
  AND (d->'originalInputs'='null'::jsonb OR (jsonb_typeof(d->'originalInputs')='object' AND d->'originalInputs'->>'currency'='BRL' AND (d->'originalInputs')-ARRAY['priceMinorUnits','currency','areaSquareMeters']='{}'::jsonb AND (d->'originalInputs'->>'priceMinorUnits')::numeric BETWEEN 1 AND 9007199254740991 AND (d->'originalInputs'->>'areaSquareMeters')::numeric>0 AND (d->'originalInputs'->>'areaSquareMeters')::numeric<=1000000))
  AND (d->'decision'='null'::jsonb OR (ask.valid_intent_decision(d->'decision') AND (d->'decision'->>'acceptedAt')::timestamptz BETWEEN (d->>'createdAt')::timestamptz AND (d->>'updatedAt')::timestamptz))
  AND (d->'confirmationDeadline'='null'::jsonb OR ((d->'decision'->>'probability')::numeric<0.85 AND (d->>'confirmationDeadline')::timestamptz=(SELECT (s->>'at')::timestamptz+interval '10 minutes' FROM jsonb_array_elements(d->'steps') s WHERE s->>'phase'='awaiting_confirmation' LIMIT 1)))
  AND (d->'confirmation'='null'::jsonb OR (jsonb_typeof(d->'confirmation')='object' AND (d->'confirmation')-ARRAY['decisionReceiptId','inputs','at']='{}'::jsonb AND d->'confirmation'->>'decisionReceiptId'=d->'decision'->>'receiptId' AND (d->'confirmation'->>'at')::timestamptz<(d->>'confirmationDeadline')::timestamptz))
  AND CASE WHEN d->>'state' IN ('queued','running','awaiting_confirmation') THEN d->'terminal'='null'::jsonb AND d->'result'='null'::jsonb
    ELSE jsonb_typeof(d->'terminal')='object' AND d->'terminal'=jsonb_build_object('state',d->>'state','reason',CASE d->>'state' WHEN 'completed' THEN NULL WHEN 'failed' THEN 'execution_unavailable' WHEN 'cancelled' THEN 'visitor_cancelled' ELSE CASE WHEN d->'decision'='null'::jsonb THEN 'queue_expired' ELSE 'confirmation_expired' END END,'at',d->>'updatedAt') END
  AND (d->>'state'<>'awaiting_confirmation' OR (ask.valid_intent_decision(d->'decision') AND (d->'decision'->>'probability')::numeric<0.85 AND d->'confirmation'='null'::jsonb AND jsonb_typeof(d->'confirmationDeadline')='string'))
  AND CASE WHEN d->>'state'='completed' THEN jsonb_typeof(d->'result')='object' AND d->'result'->>'kind'='price_per_square_meter' AND d->'decision'->>'intent'='price_per_square_meter' AND ((d->'decision'->>'probability')::numeric>=0.85 OR jsonb_typeof(d->'confirmation')='object') AND d->'result'->'inputs'=CASE WHEN d->'confirmation'='null'::jsonb THEN d->'originalInputs' ELSE d->'confirmation'->'inputs' END ELSE d->'result'='null'::jsonb END
 ) IS TRUE;
$function$;
ALTER TABLE ask.run ADD CONSTRAINT run_routed_matches CHECK ((CASE WHEN document->>'basis'='routed-text-v1' THEN
 ask.valid_routed_run(document)
 AND ((document->>'confirmationDeadline')::timestamptz IS NOT DISTINCT FROM confirmation_deadline)
 AND ((document->'originalInputs'->>'priceMinorUnits')::bigint IS NOT DISTINCT FROM price_minor_units)
 AND ((document->'originalInputs'->>'areaSquareMeters')::double precision IS NOT DISTINCT FROM area_square_meters)
 AND (state<>'running' OR (execution_id IS NOT NULL AND checkpoint_grant_digest IS NOT NULL))
 ELSE confirmation_deadline IS NULL END) IS TRUE);
DROP INDEX ask.run_pending_head_idx;
CREATE INDEX run_pending_head_idx ON ask.run(thread_id,admission_sequence) WHERE state IN ('queued','running','awaiting_confirmation');
CREATE INDEX run_confirmation_expiry_idx ON ask.run(confirmation_deadline,admission_sequence) WHERE state='awaiting_confirmation';
DO $migration$
DECLARE original text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint WHERE conrelid='ask.run_event'::regclass AND conname='run_event_identity_matches';
 ALTER TABLE ask.run_event DROP CONSTRAINT run_event_identity_matches;
 EXECUTE 'ALTER TABLE ask.run_event ADD CONSTRAINT run_event_identity_matches CHECK (CASE WHEN document->''run''->>''basis''=''routed-text-v1'' THEN (document->>''runId''=run_id::text AND document->''sequence''=to_jsonb(sequence) AND document->''version''=''1''::jsonb AND document->>''id''=run_id::text || '':v1:'' || sequence::text AND document->''run''->>''id''=run_id::text AND document-ARRAY[''version'',''id'',''runId'',''sequence'',''event'',''terminal'',''run'']=''{}''::jsonb AND ask.valid_routed_run(document->''run'') AND document->''terminal''=to_jsonb(document->''run''->''terminal''<>''null''::jsonb) AND document->>''event''=CASE WHEN document->''terminal''=''true''::jsonb THEN ''ask.'' || (document->''run''->>''state'') ELSE ''ask.progress'' END) IS TRUE ELSE (' || substring(original FROM 7) || ') END)';
 SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint WHERE conrelid='ask.run_event'::regclass AND conname='run_event_price_provenance_matches';
 ALTER TABLE ask.run_event DROP CONSTRAINT run_event_price_provenance_matches;
 EXECUTE 'ALTER TABLE ask.run_event ADD CONSTRAINT run_event_price_provenance_matches CHECK (CASE WHEN document->''run''->>''basis''=''routed-text-v1'' THEN ask.valid_routed_run(document->''run'') ELSE (' || substring(original FROM 7) || ') END)';
END
$migration$;
ALTER TABLE ask.graph_checkpoint DROP CONSTRAINT graph_checkpoint_graph_version_check;
ALTER TABLE ask.graph_checkpoint ADD CONSTRAINT graph_checkpoint_graph_version_check CHECK (graph_version IN ('price-v1','price-explanation-v1','intent-routing-v1'));
CREATE TABLE ask.decision_attempt (
 run_id uuid NOT NULL REFERENCES ask.run(id), id uuid NOT NULL UNIQUE CHECK(uuid_extract_version(id)=7),
 attempt_key text NOT NULL CHECK(attempt_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 execution_id uuid NOT NULL CHECK(uuid_extract_version(execution_id)=7), PRIMARY KEY(run_id,id), UNIQUE(run_id,attempt_key)
);
CREATE TABLE ask.decision_receipt (
 run_id uuid PRIMARY KEY REFERENCES ask.run(id), id uuid NOT NULL UNIQUE CHECK(uuid_extract_version(id)=7),
 reservation_id uuid NOT NULL, document jsonb NOT NULL,
 FOREIGN KEY(run_id,reservation_id) REFERENCES ask.decision_attempt(run_id,id),
 CHECK(ask.valid_intent_decision(document) AND document->>'receiptId'=id::text)
);
CREATE TRIGGER decision_attempt_immutable BEFORE UPDATE OR DELETE ON ask.decision_attempt FOR EACH ROW EXECUTE FUNCTION ask.immutable_model_evidence();
CREATE TRIGGER decision_receipt_immutable BEFORE UPDATE OR DELETE ON ask.decision_receipt FOR EACH ROW EXECUTE FUNCTION ask.immutable_model_evidence();
