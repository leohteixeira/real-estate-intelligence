CREATE SCHEMA IF NOT EXISTS properties;

CREATE TABLE properties.incoming_fact (
  event_id uuid PRIMARY KEY CHECK (uuid_extract_version(event_id) = 7),
  source_id text NOT NULL CHECK (source_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  source_listing_id text NOT NULL CHECK (char_length(source_listing_id) BETWEEN 1 AND 300),
  snapshot_id uuid NOT NULL CHECK (uuid_extract_version(snapshot_id) = 7),
  event_version integer NOT NULL CHECK (event_version IN (1, 2)),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (snapshot_id, event_id)
);

-- Processing state is separate so the future history projector never rewrites evidence.
CREATE TABLE properties.fact_disposition (
  event_id uuid PRIMARY KEY REFERENCES properties.incoming_fact(event_id),
  disposition text NOT NULL CHECK (disposition IN ('initial', 'pending-history', 'pending-correction'))
);

CREATE TABLE properties.property (
  property_id uuid PRIMARY KEY DEFAULT uuidv7() CHECK (uuid_extract_version(property_id) = 7),
  initial_event_id uuid NOT NULL UNIQUE REFERENCES properties.incoming_fact(event_id),
  resolved_place jsonb NOT NULL CHECK (jsonb_typeof(resolved_place) = 'object')
);

CREATE TABLE properties.listing (
  listing_id uuid PRIMARY KEY DEFAULT uuidv7() CHECK (uuid_extract_version(listing_id) = 7),
  property_id uuid NOT NULL UNIQUE REFERENCES properties.property(property_id),
  source_id text NOT NULL CHECK (source_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  source_listing_id text NOT NULL CHECK (char_length(source_listing_id) BETWEEN 1 AND 300),
  asking_price_minor_units bigint NOT NULL CHECK (asking_price_minor_units BETWEEN 1 AND 9007199254740991),
  currency text NOT NULL CHECK (currency = 'BRL'),
  area_square_meters double precision NOT NULL CHECK (area_square_meters BETWEEN 0.01 AND 1000000),
  UNIQUE (source_id, source_listing_id),
  CHECK (listing_id <> property_id)
);

CREATE FUNCTION properties.reject_initial_evidence_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Initial property evidence is immutable';
END;
$$;

CREATE TRIGGER incoming_fact_immutable BEFORE UPDATE ON properties.incoming_fact
FOR EACH ROW EXECUTE FUNCTION properties.reject_initial_evidence_update();
CREATE TRIGGER property_initial_immutable BEFORE UPDATE ON properties.property
FOR EACH ROW EXECUTE FUNCTION properties.reject_initial_evidence_update();
CREATE TRIGGER listing_initial_immutable BEFORE UPDATE ON properties.listing
FOR EACH ROW EXECUTE FUNCTION properties.reject_initial_evidence_update();
