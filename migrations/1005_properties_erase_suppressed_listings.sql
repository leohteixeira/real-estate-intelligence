-- Keep an erased group's survivors together until substantive matching evidence changes.
ALTER TABLE properties.listing_assignment ADD COLUMN suppression_continuity_hash text CHECK (suppression_continuity_hash ~ '^sha256:[a-f0-9]{64}$');

-- Permanent minimal identity/cause receipts outlive the transport inbox. No listing payload is retained.
CREATE TABLE properties.listing_suppression_receipt (
  source_id text NOT NULL,
  source_listing_id text NOT NULL,
  cause_event_id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(cause_event_id) = 7),
  suppression_id uuid NOT NULL UNIQUE CHECK (uuid_extract_version(suppression_id) = 7),
  listing_id uuid CHECK (uuid_extract_version(listing_id) = 7),
  original_property_id uuid CHECK (uuid_extract_version(original_property_id) = 7),
  PRIMARY KEY (source_id, source_listing_id),
  CHECK ((listing_id IS NULL) = (original_property_id IS NULL))
);
