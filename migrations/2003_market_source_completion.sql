-- D-098: completion is a source watermark, never a figure or an observation timestamp.
CREATE TABLE market.source_completion (
  source_id text PRIMARY KEY CHECK (source_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  completed_at timestamptz NOT NULL CHECK (isfinite(completed_at))
);
