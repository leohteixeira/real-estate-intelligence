-- D-099: permanent identity/cause and normalized fingerprints contain no collected payload.
CREATE TABLE market.listing_suppression_receipt (
  source_id text NOT NULL,
  source_listing_id text NOT NULL,
  cause_event_id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(cause_event_id)=7),
  suppression_id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(suppression_id)=7),
  PRIMARY KEY(source_id,source_listing_id)
);
CREATE TABLE market.listing_erasure_identity (
  listing_id uuid PRIMARY KEY CHECK (uuid_extract_version(listing_id)=7),
  source_id text NOT NULL,
  source_listing_id text NOT NULL,
  FOREIGN KEY(source_id,source_listing_id) REFERENCES market.listing_suppression_receipt
);
CREATE TABLE market.erased_price_event (
  event_id uuid PRIMARY KEY,
  family text NOT NULL CHECK (family IN ('listing','property')),
  aggregate_id uuid NOT NULL,
  revision bigint NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  UNIQUE(family,aggregate_id,revision)
);
CREATE TABLE market.erased_listing_fact (
  listing_id uuid NOT NULL REFERENCES market.listing_erasure_identity,
  family text NOT NULL CHECK (family IN ('state','assignment')),
  revision bigint NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(listing_id,family,revision)
);
CREATE TABLE market.properties_suppression_receipt (
  event_id uuid PRIMARY KEY,
  cause_event_id uuid NOT NULL UNIQUE REFERENCES market.listing_suppression_receipt(cause_event_id),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$')
);
CREATE TABLE market.erased_anchor_redirect (
  previous_property_id uuid PRIMARY KEY,
  property_id uuid,
  cause_event_id uuid NOT NULL REFERENCES market.listing_suppression_receipt(cause_event_id),
  CHECK(property_id IS NULL OR property_id<>previous_property_id)
);
CREATE FUNCTION market.event_fingerprint(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') $$;
CREATE FUNCTION market.effective_property_id(original uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE current_id uuid := original; destination uuid; visited uuid[] := ARRAY[]::uuid[];
BEGIN
  LOOP
    IF current_id IS NULL THEN RETURN NULL; END IF;
    IF current_id=ANY(visited) THEN RAISE EXCEPTION 'Cyclic Market anchor redirect'; END IF;
    visited := array_append(visited,current_id);
    SELECT property_id INTO destination FROM market.erased_anchor_redirect WHERE previous_property_id=current_id;
    IF NOT FOUND THEN RETURN current_id; END IF;
    current_id := destination;
  END LOOP;
END;
$$;
-- Only an authenticated owner receipt and a matching transaction-local identity allow DELETE.
CREATE OR REPLACE FUNCTION market.reject_price_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE identity jsonb; matches boolean := false;
BEGIN
  identity := NULLIF(current_setting('market.listing_erasure_identity',true),'')::jsonb;
  IF TG_OP='DELETE' AND identity IS NOT NULL AND EXISTS (
    SELECT 1 FROM market.listing_suppression_receipt r
    WHERE r.source_id=identity->>'sourceId' AND r.source_listing_id=identity->>'sourceListingId'
      AND r.cause_event_id=(identity->>'causeEventId')::uuid
  ) THEN
    IF TG_TABLE_NAME IN ('price_event_evidence','listing_price_evidence') THEN
      matches := jsonb_path_exists(OLD.business_event,'$.** ? (@.sourceId == $sourceId && @.sourceListingId == $sourceListingId)',identity)
        OR EXISTS (SELECT 1 FROM market.listing_erasure_identity e WHERE e.source_id=identity->>'sourceId' AND e.source_listing_id=identity->>'sourceListingId'
          AND jsonb_path_exists(OLD.business_event,'$.** ? (@ == $listingId)',jsonb_build_object('listingId',e.listing_id::text)));
    ELSE
      matches := EXISTS (SELECT 1 FROM market.listing_erasure_identity e WHERE e.listing_id=OLD.listing_id
        AND e.source_id=identity->>'sourceId' AND e.source_listing_id=identity->>'sourceListingId');
    END IF;
    IF matches THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Market listing evidence is immutable';
END;
$$;
-- These permanent fences cannot themselves be changed by the erasure exception.
CREATE FUNCTION market.reject_erasure_fence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Market erasure fence is immutable'; END $$;
CREATE TRIGGER suppression_receipt_immutable BEFORE UPDATE OR DELETE ON market.listing_suppression_receipt FOR EACH ROW EXECUTE FUNCTION market.reject_erasure_fence_mutation();
CREATE TRIGGER erasure_identity_immutable BEFORE UPDATE OR DELETE ON market.listing_erasure_identity FOR EACH ROW EXECUTE FUNCTION market.reject_erasure_fence_mutation();
CREATE TRIGGER erased_price_event_immutable BEFORE UPDATE OR DELETE ON market.erased_price_event FOR EACH ROW EXECUTE FUNCTION market.reject_erasure_fence_mutation();
CREATE TRIGGER erased_listing_fact_immutable BEFORE UPDATE OR DELETE ON market.erased_listing_fact FOR EACH ROW EXECUTE FUNCTION market.reject_erasure_fence_mutation();
CREATE TRIGGER properties_suppression_receipt_immutable BEFORE UPDATE OR DELETE ON market.properties_suppression_receipt FOR EACH ROW EXECUTE FUNCTION market.reject_erasure_fence_mutation();
CREATE TRIGGER erased_anchor_redirect_immutable BEFORE UPDATE OR DELETE ON market.erased_anchor_redirect FOR EACH ROW EXECUTE FUNCTION market.reject_erasure_fence_mutation();
