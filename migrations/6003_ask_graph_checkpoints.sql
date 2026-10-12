-- Additive graph storage. Business history and existing constraints are preserved.
ALTER TABLE ask.thread ADD COLUMN principal_id uuid;
ALTER TABLE ask.run
  ADD COLUMN checkpoint_grant_digest text CHECK (checkpoint_grant_digest ~ '^[0-9a-f]{64}$'),
  ADD COLUMN graph_started_at timestamptz,
  ADD COLUMN graph_expires_at timestamptz,
  ADD COLUMN graph_pruned_at timestamptz,
  ADD CONSTRAINT run_graph_horizon_matches CHECK (
    (graph_started_at IS NULL AND graph_expires_at IS NULL AND graph_pruned_at IS NULL)
    OR (graph_started_at IS NOT NULL AND graph_expires_at IS NOT NULL AND graph_expires_at = graph_started_at + interval '30 days')
  );
CREATE TABLE ask.graph_checkpoint (
  run_id uuid NOT NULL REFERENCES ask.run(id),
  graph_version text NOT NULL CHECK (graph_version = 'price-v1'),
  namespace text NOT NULL CHECK (char_length(namespace) <= 256 AND namespace ~ '^[A-Za-z0-9_.:|<>-]*$'),
  checkpoint_id uuid NOT NULL CHECK (checkpoint_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-(6[0-9a-f]{3}-[0-9a-f]{4}|7[0-9a-f]{3}-[89ab][0-9a-f]{3})-[0-9a-f]{12}$'),
  parent_id uuid,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  checkpoint_type text NOT NULL CHECK (checkpoint_type IN ('json','bytes')),
  checkpoint_bytes bytea NOT NULL CHECK (octet_length(checkpoint_bytes) <= 262144),
  metadata_type text NOT NULL CHECK (metadata_type IN ('json','bytes')),
  metadata_bytes bytea NOT NULL CHECK (octet_length(metadata_bytes) <= 4096),
  content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (run_id,graph_version,namespace,checkpoint_id),
  FOREIGN KEY (run_id,graph_version,namespace,parent_id)
    REFERENCES ask.graph_checkpoint(run_id,graph_version,namespace,checkpoint_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX graph_checkpoint_latest_idx ON ask.graph_checkpoint(run_id,graph_version,namespace,sequence DESC);
CREATE TABLE ask.graph_pending_write (
  run_id uuid NOT NULL,
  graph_version text NOT NULL,
  namespace text NOT NULL,
  checkpoint_id uuid NOT NULL,
  task_id text NOT NULL CHECK (char_length(task_id) BETWEEN 1 AND 128 AND task_id ~ '^[A-Za-z0-9_.:|<>-]+$'),
  write_index integer NOT NULL CHECK (write_index BETWEEN -4 AND 31),
  channel text NOT NULL CHECK (char_length(channel) BETWEEN 1 AND 128 AND channel ~ '^[A-Za-z0-9_.:|<>-]+$'),
  value_type text NOT NULL CHECK (value_type IN ('json','bytes')),
  value_bytes bytea NOT NULL CHECK (octet_length(value_bytes) <= 262144),
  content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (run_id,graph_version,namespace,checkpoint_id,task_id,write_index),
  FOREIGN KEY (run_id,graph_version,namespace,checkpoint_id)
    REFERENCES ask.graph_checkpoint(run_id,graph_version,namespace,checkpoint_id) ON DELETE CASCADE,
  CONSTRAINT reserved_write_channel_matches CHECK (write_index >= 0 OR
    (write_index = -1 AND channel = '__error__') OR
    (write_index = -2 AND channel = '__scheduled__') OR
    (write_index = -3 AND channel = '__interrupt__') OR
    (write_index = -4 AND channel = '__resume__'))
);
