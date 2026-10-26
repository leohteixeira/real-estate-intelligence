-- Validate the new basis through the historical routed contract without rewriting stored bytes.
CREATE FUNCTION ask.valid_routed_explained_run(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $function$
 SELECT (d->>'basis'='routed-text-explanation-v1'
   AND d ? 'explanation'
   AND ask.valid_routed_run(jsonb_set(d-'explanation','{basis}','"routed-text-v1"'::jsonb))
   AND CASE WHEN d->>'state'='completed' AND d->'result'->>'kind'='price_per_square_meter' THEN
     jsonb_typeof(d->'explanation')='object'
     AND d->'explanation'->>'runId'=d->>'id'
     AND d->'explanation'->>'threadId'=d->>'threadId'
     AND d->'explanation'->>'locale'=d->>'locale'
     AND d->'explanation'->>'authorship'='model-written'
     AND d->'explanation'->>'route'='vercel-ai-gateway'
     AND d->'explanation'->>'promptVersion'='price-explanation-prompt-v1'
     AND d->'explanation'->>'grammarVersion'='price-explanation-facts-v1'
     AND char_length(d->'explanation'->>'text') BETWEEN 1 AND 2048
     AND (d->'explanation'->>'outputTokens')::integer BETWEEN 1 AND 1000
   ELSE d->'explanation'='null'::jsonb END) IS TRUE;
$function$;
DO $migration$
DECLARE name text; original text; normalized text;
BEGIN
 FOREACH name IN ARRAY ARRAY['run_document_is_structured','run_document_terminal_matches','run_document_execution_history_matches','run_claim_matches_state','run_expired_is_unexecuted','historical_operands_required','run_routed_matches'] LOOP
   SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint WHERE conrelid='ask.run'::regclass AND conname=name;
   normalized := replace(substring(original FROM 7), 'document', '(jsonb_set(document-''explanation'',''{basis}'',''"routed-text-v1"''::jsonb))');
   EXECUTE format('ALTER TABLE ask.run DROP CONSTRAINT %I',name);
   EXECUTE format('ALTER TABLE ask.run ADD CONSTRAINT %I CHECK (CASE WHEN document->>''basis''=''routed-text-explanation-v1'' THEN ask.valid_routed_explained_run(document) AND (%s) ELSE (%s) END)',name,normalized,substring(original FROM 7));
 END LOOP;
 SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint WHERE conrelid='ask.run'::regclass AND conname='run_explanation_matches';
 ALTER TABLE ask.run DROP CONSTRAINT run_explanation_matches;
 EXECUTE 'ALTER TABLE ask.run ADD CONSTRAINT run_explanation_matches CHECK (CASE WHEN document->>''basis''=''routed-text-explanation-v1'' THEN ask.valid_routed_explained_run(document) AND (document->''explanation''=''null''::jsonb OR document->''explanation''->>''eventId''=requested_event_id::text) ELSE (' || substring(original FROM 7) || ') END)';
 FOREACH name IN ARRAY ARRAY['run_event_identity_matches','run_event_price_provenance_matches'] LOOP
   SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint WHERE conrelid='ask.run_event'::regclass AND conname=name;
   normalized := replace(substring(original FROM 7), 'document', '(jsonb_set(document,''{run}'',jsonb_set((document->''run'')-''explanation'',''{basis}'',''"routed-text-v1"''::jsonb)))');
   EXECUTE format('ALTER TABLE ask.run_event DROP CONSTRAINT %I',name);
   EXECUTE format('ALTER TABLE ask.run_event ADD CONSTRAINT %I CHECK (CASE WHEN document->''run''->>''basis''=''routed-text-explanation-v1'' THEN ask.valid_routed_explained_run(document->''run'') AND (%s) ELSE (%s) END)',name,normalized,substring(original FROM 7));
 END LOOP;
END
$migration$;
ALTER TABLE ask.graph_checkpoint DROP CONSTRAINT graph_checkpoint_graph_version_check;
ALTER TABLE ask.graph_checkpoint ADD CONSTRAINT graph_checkpoint_graph_version_check CHECK
 (graph_version IN ('price-v1','price-explanation-v1','intent-routing-v1','intent-price-explanation-v1'));
-- Retain every original budget, immutable evidence and active-lease fence.
DO $migration$
DECLARE name text; original text;
BEGIN
 FOREACH name IN ARRAY ARRAY['fence_model_attempt','fence_model_explanation'] LOOP
   SELECT pg_get_functiondef(p.oid) INTO STRICT original FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ask' AND p.proname=name;
   EXECUTE replace(original, 'target.document->>''basis'' <> ''text-price-explanation-v1''', 'target.document->>''basis'' NOT IN (''text-price-explanation-v1'',''routed-text-explanation-v1'')');
 END LOOP;
END
$migration$;
