-- Admission metadata stays separate from immutable public documents and events.
ALTER TABLE ask.run ADD COLUMN visitor_digest text
  CHECK (visitor_digest IS NULL OR visitor_digest ~ '^[0-9a-f]{64}$');
-- Historical admissions retain NULL identity and continue counting towards the global cap.
CREATE INDEX run_daily_admission_idx ON ask.run (admitted_at) INCLUDE (visitor_digest);
