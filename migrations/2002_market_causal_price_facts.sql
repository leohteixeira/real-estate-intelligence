-- Additive upgrade: deployed v1 evidence and its references remain untouched.
CREATE TABLE market.price_event_evidence (
    event_id uuid PRIMARY KEY CHECK (substring(event_id::text, 15, 1) = '7'),
    aggregate_id uuid NOT NULL CHECK (substring(aggregate_id::text, 15, 1) = '7'),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    family text NOT NULL CHECK (family IN ('listing', 'property')),
    business_event jsonb NOT NULL CHECK (jsonb_typeof(business_event) = 'object'),
    UNIQUE (family, aggregate_id, revision),
    CHECK ((business_event->>'eventId')::uuid = event_id),
    CHECK ((business_event->>'aggregateId')::uuid = aggregate_id),
    CHECK ((business_event->'payload'->>'revision')::bigint = revision),
    CHECK (business_event->>'version' IN ('1','2'))
);
INSERT INTO market.price_event_evidence SELECT event_id, listing_id, revision, 'listing', business_event FROM market.listing_price_evidence;
CREATE TABLE market.listing_price_identity (
    listing_id uuid PRIMARY KEY CHECK (substring(listing_id::text, 15, 1) = '7'),
    source_id text NOT NULL,
    source_listing_id text NOT NULL
);
INSERT INTO market.listing_price_identity SELECT DISTINCT listing_id,
    business_event->'payload'->'listing'->>'sourceId', business_event->'payload'->'listing'->>'sourceListingId'
FROM market.listing_price_evidence;
CREATE TABLE market.listing_state_evidence (
    listing_id uuid NOT NULL REFERENCES market.listing_price_identity (listing_id),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    listing jsonb NOT NULL CHECK (jsonb_typeof(listing) = 'object' AND NOT listing ? 'propertyId'),
    PRIMARY KEY (listing_id, revision),
    CHECK ((listing->>'listingId')::uuid = listing_id)
);
-- Canonicalize parsed UUID identity in new causal facts only; legacy envelopes stay untouched.
INSERT INTO market.listing_state_evidence
SELECT listing_id, revision,
    ((business_event->'payload'->'listing') - 'propertyId') || jsonb_build_object(
        'listingId', listing_id,
        'provenance', (business_event->'payload'->'listing'->'provenance') || jsonb_build_object(
            'runId', (business_event->'payload'->'listing'->'provenance'->>'runId')::uuid,
            'snapshotId', (business_event->'payload'->'listing'->'provenance'->>'snapshotId')::uuid
        )
    )
FROM market.listing_price_evidence;
CREATE TABLE market.listing_state_current (
    listing_id uuid PRIMARY KEY,
    revision bigint NOT NULL,
    FOREIGN KEY (listing_id, revision) REFERENCES market.listing_state_evidence (listing_id, revision)
);
INSERT INTO market.listing_state_current SELECT listing_id, max(revision) FROM market.listing_state_evidence GROUP BY listing_id;
CREATE TABLE market.listing_assignment_evidence (
    listing_id uuid NOT NULL REFERENCES market.listing_price_identity (listing_id),
    revision bigint NOT NULL CHECK (revision BETWEEN 0 AND 9007199254740991),
    property_id uuid NOT NULL CHECK (substring(property_id::text, 15, 1) = '7'),
    PRIMARY KEY (listing_id, revision),
    UNIQUE (listing_id, revision, property_id)
);
INSERT INTO market.listing_assignment_evidence SELECT DISTINCT listing_id, 0, (business_event->'payload'->'listing'->>'propertyId')::uuid FROM market.listing_price_evidence;
CREATE TABLE market.listing_assignment_current (
    listing_id uuid PRIMARY KEY,
    revision bigint NOT NULL,
    property_id uuid NOT NULL,
    FOREIGN KEY (listing_id, revision, property_id) REFERENCES market.listing_assignment_evidence (listing_id, revision, property_id)
);
INSERT INTO market.listing_assignment_current SELECT * FROM market.listing_assignment_evidence;
CREATE TABLE market.property_price_current (
    property_id uuid PRIMARY KEY CHECK (substring(property_id::text, 15, 1) = '7'),
    selected_listing jsonb,
    CHECK (selected_listing IS NULL OR (jsonb_typeof(selected_listing) = 'object' AND
        (selected_listing->>'propertyId')::uuid = property_id AND selected_listing->>'status' = 'active'))
);
INSERT INTO market.property_price_current
SELECT DISTINCT ON (a.property_id) a.property_id,
    CASE WHEN e.listing->>'status' = 'active' THEN e.listing || jsonb_build_object('propertyId', a.property_id) ELSE NULL END
FROM market.listing_assignment_current a
JOIN market.listing_state_current c ON c.listing_id = a.listing_id
JOIN market.listing_state_evidence e ON e.listing_id = c.listing_id AND e.revision = c.revision
ORDER BY a.property_id, (e.listing->>'status' = 'active') DESC, (e.listing->>'askingPriceMinorUnits')::bigint, a.listing_id;
CREATE TRIGGER price_event_evidence_immutable BEFORE UPDATE OR DELETE ON market.price_event_evidence FOR EACH ROW EXECUTE FUNCTION market.reject_price_evidence_mutation();
CREATE TRIGGER listing_price_identity_immutable BEFORE UPDATE OR DELETE ON market.listing_price_identity FOR EACH ROW EXECUTE FUNCTION market.reject_price_evidence_mutation();
CREATE TRIGGER listing_state_evidence_immutable BEFORE UPDATE OR DELETE ON market.listing_state_evidence FOR EACH ROW EXECUTE FUNCTION market.reject_price_evidence_mutation();
CREATE TRIGGER listing_assignment_evidence_immutable BEFORE UPDATE OR DELETE ON market.listing_assignment_evidence FOR EACH ROW EXECUTE FUNCTION market.reject_price_evidence_mutation();
