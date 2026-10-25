-- Additive versions preserve all historical acquisition/correction bytes.
ALTER TABLE collection.parsed_event_evidence
  DROP CONSTRAINT parsed_event_evidence_event_version_check,
  ADD CONSTRAINT parsed_event_evidence_event_version_check CHECK (event_version IN (1, 2, 3, 4));
