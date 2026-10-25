-- Only Collection representation versions change; acquisition and correction roles remain distinct.
ALTER TABLE properties.incoming_fact
  DROP CONSTRAINT incoming_fact_event_version_check,
  ADD CONSTRAINT incoming_fact_event_version_check CHECK (event_version IN (1, 2, 3, 4));
