-- Extend only the two version discriminators in the existing validated predicates.
-- All exact-key, numeric-column, state, timestamp and history checks remain verbatim.
DO $migration$
DECLARE
  original_definition text;
  extended_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO STRICT original_definition
    FROM pg_constraint WHERE conrelid = 'ask.run'::regclass
    AND conname = 'run_document_is_structured';
  extended_definition := replace(original_definition,
    '= ''structured-price-v1''::text',
    '= ANY (ARRAY[''structured-price-v1''::text, ''text-price-v1''::text])');
  IF extended_definition = original_definition THEN
    RAISE EXCEPTION 'Ask document discriminator was not extended';
  END IF;
  ALTER TABLE ask.run DROP CONSTRAINT run_document_is_structured;
  EXECUTE 'ALTER TABLE ask.run ADD CONSTRAINT run_document_is_structured ' || extended_definition;

  SELECT pg_get_constraintdef(oid) INTO STRICT original_definition
    FROM pg_constraint WHERE conrelid = 'ask.run'::regclass
    AND conname = 'run_document_execution_history_matches';
  extended_definition := replace(original_definition,
    '= ''fixed-structured-v1''::text',
    '= CASE WHEN document->>''basis'' = ''text-price-v1'' THEN ''validated-text-v1''::text ELSE ''fixed-structured-v1''::text END');
  IF extended_definition = original_definition THEN
    RAISE EXCEPTION 'Ask decision discriminator was not extended';
  END IF;
  ALTER TABLE ask.run DROP CONSTRAINT run_document_execution_history_matches;
  EXECUTE 'ALTER TABLE ask.run ADD CONSTRAINT run_document_execution_history_matches ' || extended_definition;
END
$migration$;

ALTER TABLE ask.run_event ADD CONSTRAINT run_event_price_provenance_matches CHECK ((
  document->'run'->>'basis' IN ('structured-price-v1', 'text-price-v1')
  AND (document->'run'->'decision' = 'null'::jsonb OR
    document->'run'->'decision'->>'source' = CASE
      WHEN document->'run'->>'basis' = 'text-price-v1' THEN 'validated-text-v1'
      ELSE 'fixed-structured-v1' END)
) IS TRUE);
