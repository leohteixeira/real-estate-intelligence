-- Immutable listing.property_id remains the acquisition lineage. Only this table owns current membership.
CREATE TABLE properties.resolution_configuration (
  configuration_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  configuration jsonb NOT NULL,
  PRIMARY KEY (configuration_id, version)
);
CREATE TABLE properties.listing_assignment (
  listing_id uuid PRIMARY KEY REFERENCES properties.listing(listing_id),
  property_id uuid NOT NULL REFERENCES properties.property(property_id),
  assignment_revision integer NOT NULL DEFAULT 0 CHECK (assignment_revision >= 0),
  processed_revision integer NOT NULL CHECK (processed_revision > 0),
  market_fact jsonb NOT NULL,
  input_event_id uuid NOT NULL REFERENCES properties.incoming_fact(event_id),
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[a-f0-9]{64}$'),
  configuration_id text NOT NULL,
  configuration_version integer NOT NULL,
  FOREIGN KEY (configuration_id, configuration_version) REFERENCES properties.resolution_configuration(configuration_id, version)
);
CREATE INDEX listing_assignment_property ON properties.listing_assignment(property_id, listing_id);
-- Input references point to owned acquisitions, without copying descriptions or image strings.
CREATE TABLE properties.match_comparison (
  left_listing_id uuid NOT NULL REFERENCES properties.listing(listing_id),
  right_listing_id uuid NOT NULL REFERENCES properties.listing(listing_id),
  left_input_event_id uuid NOT NULL REFERENCES properties.incoming_fact(event_id),
  right_input_event_id uuid NOT NULL REFERENCES properties.incoming_fact(event_id),
  left_input_hash text NOT NULL CHECK (left_input_hash ~ '^sha256:[a-f0-9]{64}$'),
  right_input_hash text NOT NULL CHECK (right_input_hash ~ '^sha256:[a-f0-9]{64}$'),
  configuration_id text NOT NULL,
  configuration_version integer NOT NULL,
  evidence jsonb NOT NULL,
  review_event_id uuid,
  PRIMARY KEY (left_listing_id, right_listing_id, left_input_hash, right_input_hash, configuration_id, configuration_version),
  FOREIGN KEY (configuration_id, configuration_version) REFERENCES properties.resolution_configuration(configuration_id, version),
  CHECK (left_listing_id <> right_listing_id)
);
CREATE TABLE properties.resolution_property_state (
  property_id uuid PRIMARY KEY REFERENCES properties.property(property_id),
  revision integer NOT NULL CHECK (revision > 0)
);
CREATE TABLE properties.property_minimum_effect (
  effect_position bigint GENERATED ALWAYS AS IDENTITY,
  cause_event_id uuid NOT NULL REFERENCES properties.listing_event(event_id),
  property_id uuid NOT NULL REFERENCES properties.property(property_id),
  minimum_effect jsonb NOT NULL,
  publication_event_id uuid,
  PRIMARY KEY (cause_event_id, property_id)
);
