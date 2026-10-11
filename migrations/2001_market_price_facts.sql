CREATE SCHEMA IF NOT EXISTS market;

CREATE TABLE market.listing_price_evidence (
    event_id uuid PRIMARY KEY CHECK (substring(event_id::text, 15, 1) = '7'),
    listing_id uuid NOT NULL CHECK (substring(listing_id::text, 15, 1) = '7'),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    business_event jsonb NOT NULL CHECK (jsonb_typeof(business_event) = 'object'),
    UNIQUE (listing_id, revision),
    UNIQUE (listing_id, revision, event_id),
    CHECK ((business_event->>'eventId')::uuid = event_id),
    CHECK ((business_event->>'aggregateId')::uuid = listing_id),
    CHECK ((business_event->'payload'->>'revision')::bigint = revision),
    CHECK (business_event ?& ARRAY['eventId','type','version','aggregateId','occurredAt','payload']),
    CHECK (business_event->>'version' = '1'),
    CHECK (business_event->'payload'->'listing' ?& ARRAY[
        'listingId','propertyId','sourceId','sourceListingId','placeId','propertyType',
        'areaSquareMeters','status','askingPriceMinorUnits','currency','effectiveAt','provenance'
    ]),
    CHECK ((business_event->'payload'->'listing'->>'listingId')::uuid = listing_id),
    CHECK (business_event->'payload'->'listing'->>'currency' = 'BRL'),
    CHECK (business_event->'payload'->'listing'->>'status' IN ('active','removed')),
    CHECK ((business_event->'payload'->'listing'->>'askingPriceMinorUnits')::numeric
        BETWEEN 1 AND 9007199254740991),
    CHECK (business_event->'payload'->'listing'->'areaSquareMeters' = 'null'::jsonb OR
        (business_event->'payload'->'listing'->>'areaSquareMeters')::numeric BETWEEN 0.01 AND 1000000),
    CHECK (business_event->>'type' IN (
        'properties.listing.created', 'properties.listing.price-changed',
        'properties.listing.description-changed', 'properties.listing.removed',
        'properties.listing.reappeared'
    ))
);
CREATE FUNCTION market.reject_price_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Market listing evidence is immutable'; END $$;
CREATE TRIGGER listing_price_evidence_immutable BEFORE UPDATE OR DELETE
ON market.listing_price_evidence FOR EACH ROW EXECUTE FUNCTION market.reject_price_evidence_mutation();
CREATE TABLE market.listing_price_current (
    listing_id uuid PRIMARY KEY,
    revision bigint NOT NULL,
    event_id uuid NOT NULL UNIQUE,
    FOREIGN KEY (listing_id, revision, event_id)
        REFERENCES market.listing_price_evidence (listing_id, revision, event_id)
);
