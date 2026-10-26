-- Allow completed, gate-authorized unavailable intents without changing historical documents.
CREATE OR REPLACE FUNCTION ask.valid_routed_run(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $function$
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
  AND CASE WHEN d->>'state'='completed' THEN jsonb_typeof(d->'result')='object'
    AND ((d->'decision'->>'probability')::numeric>=0.85 OR jsonb_typeof(d->'confirmation')='object')
    AND (CASE WHEN d->'result'->>'kind'='unavailable_intent' THEN
      d->'result'=jsonb_build_object('kind','unavailable_intent','intent',d->'decision'->>'intent','reason','not_available')
      AND d->'decision'->>'intent' IN ('listing_search','property_history','region_statistics','comparables','unsupported')
      ELSE d->'result'->>'kind'='price_per_square_meter' AND d->'decision'->>'intent'='price_per_square_meter'
        AND d->'result'->'inputs'=CASE WHEN d->'confirmation'='null'::jsonb THEN d->'originalInputs' ELSE d->'confirmation'->'inputs' END END) ELSE d->'result'='null'::jsonb END
 ) IS TRUE;
$function$;
