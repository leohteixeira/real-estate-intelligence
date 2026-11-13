-- ADR 0029: Ask calls Anthropic directly. The closed provider vocabulary is widened additively.
-- Every retained gateway row keeps its original predicate verbatim; no stored byte is rewritten.
-- A direct record names route 'anthropic-direct', model 'claude-haiku-5-5' and carries null privacy
-- evidence; a direct decision names source 'claude-haiku-v1' and carries null privacy evidence.
CREATE FUNCTION ask.valid_explanation_route(e jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $function$
 SELECT (CASE e->>'route'
   WHEN 'vercel-ai-gateway' THEN true
   WHEN 'anthropic-direct' THEN e->>'model'='claude-haiku-5-5' AND e->'privacyEvidenceId'='null'::jsonb
   ELSE false END) IS TRUE;
$function$;
CREATE OR REPLACE FUNCTION ask.valid_intent_decision(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $function$
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
     OR (d->>'source'='claude-haiku-v1' AND d->'degraded'='false'::jsonb AND d->'privacyEvidenceId'='null'::jsonb)
     OR (d->>'source'='gateway-jev-v1' AND d->'degraded'='false'::jsonb AND d->>'privacyEvidenceId' ~ '^[A-Za-z0-9_-]{16,128}$'))
   AND uuid_extract_version((d->>'receiptId')::uuid)=7 AND jsonb_typeof(d->'acceptedAt')='string') IS TRUE;
$function$;
CREATE OR REPLACE FUNCTION ask.valid_routed_explained_run(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $function$
 SELECT (d->>'basis'='routed-text-explanation-v1'
   AND d ? 'explanation'
   AND ask.valid_routed_run(jsonb_set(d-'explanation','{basis}','"routed-text-v1"'::jsonb))
   AND CASE WHEN d->>'state'='completed' AND d->'result'->>'kind'='price_per_square_meter' THEN
     jsonb_typeof(d->'explanation')='object'
     AND d->'explanation'->>'runId'=d->>'id'
     AND d->'explanation'->>'threadId'=d->>'threadId'
     AND d->'explanation'->>'locale'=d->>'locale'
     AND d->'explanation'->>'authorship'='model-written'
     AND ask.valid_explanation_route(d->'explanation')
     AND d->'explanation'->>'promptVersion'='price-explanation-prompt-v1'
     AND d->'explanation'->>'grammarVersion'='price-explanation-facts-v1'
     AND char_length(d->'explanation'->>'text') BETWEEN 1 AND 2048
     AND (d->'explanation'->>'outputTokens')::integer BETWEEN 1 AND 1000
   ELSE d->'explanation'='null'::jsonb END) IS TRUE;
$function$;
-- Table predicates are widened in place: only the provider clause changes, and the statement
-- fails instead of silently keeping the old vocabulary if a predicate is not the expected one.
DO $migration$
DECLARE target record; original text; widened text;
BEGIN
 FOR target IN SELECT * FROM (VALUES
   ('ask.run'::regclass, 'run_explanation_matches',
     '(((document -> ''explanation''::text) ->> ''route''::text) = ''vercel-ai-gateway''::text)',
     'ask.valid_explanation_route(document -> ''explanation''::text)'),
   ('ask.model_explanation'::regclass, 'model_explanation_identity_matches',
     '((document ->> ''route''::text) = ''vercel-ai-gateway''::text)',
     'ask.valid_explanation_route(document)'),
   ('ask.model_explanation'::regclass, 'model_explanation_identity_matches',
     '((document ->> ''model''::text) = ANY (ARRAY[''anthropic/claude-haiku-5.5''::text, ''deepseek/deepseek-v4-flash-0731''::text]))',
     '((document ->> ''route''::text) = ''anthropic-direct''::text OR (document ->> ''model''::text) = ANY (ARRAY[''anthropic/claude-haiku-5.5''::text, ''deepseek/deepseek-v4-flash-0731''::text]))'),
   ('ask.model_attempt'::regclass, 'model_attempt_document_matches',
     '((document ->> ''route''::text) = ''vercel-ai-gateway''::text)',
     '((document ->> ''route''::text) = ANY (ARRAY[''vercel-ai-gateway''::text, ''anthropic-direct''::text]))'),
   ('ask.model_attempt'::regclass, 'model_attempt_document_matches',
     '((document ->> ''model''::text) = ANY (ARRAY[''anthropic/claude-haiku-5.5''::text, ''deepseek/deepseek-v4-flash-0731''::text]))',
     '(CASE WHEN (document ->> ''route''::text) = ''anthropic-direct''::text THEN (document ->> ''model''::text) = ''claude-haiku-5-5''::text AND (document ->> ''purpose''::text) = ''explanation''::text ELSE (document ->> ''model''::text) = ANY (ARRAY[''anthropic/claude-haiku-5.5''::text, ''deepseek/deepseek-v4-flash-0731''::text]) END)')
 ) AS change(relation, name, historical, replacement) LOOP
   SELECT pg_get_constraintdef(oid) INTO STRICT original FROM pg_constraint
     WHERE conrelid=target.relation AND conname=target.name;
   widened := replace(original, target.historical, target.replacement);
   IF (length(original)-length(replace(original, target.historical, ''))) <> length(target.historical) THEN
     RAISE EXCEPTION 'Unexpected % predicate; provider vocabulary was not widened', target.name;
   END IF;
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target.relation, target.name);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', target.relation, target.name, widened);
 END LOOP;
END
$migration$;
