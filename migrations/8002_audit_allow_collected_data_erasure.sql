-- D-091: narrow privacy exception. Every other audit mutation remains forbidden.
CREATE TABLE audit.collection_erasure (
  source_id text NOT NULL,
  source_listing_id text NOT NULL,
  PRIMARY KEY(source_id,source_listing_id)
);
CREATE OR REPLACE FUNCTION audit.reject_event_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity jsonb;
BEGIN
  IF TG_OP='DELETE' AND OLD.event_type='collection.snapshot.parsed' THEN
    identity := NULLIF(current_setting('audit.collection_erasure_identity',true),'')::jsonb;
    IF identity->>'sourceId'=OLD.payload->'source'->>'sourceId'
       AND identity->>'sourceListingId'=OLD.payload->'source'->>'sourceListingId'
       AND EXISTS (SELECT 1 FROM audit.collection_erasure erased
         WHERE erased.source_id=identity->>'sourceId' AND erased.source_listing_id=identity->>'sourceListingId') THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit.event_log is append-only';
END;
$$;
