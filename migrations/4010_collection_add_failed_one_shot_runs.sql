ALTER TABLE collection.collection_run
  DROP CONSTRAINT collection_run_status_is_supported,
  DROP CONSTRAINT collection_run_terminal_state_is_coherent,
  ADD CONSTRAINT collection_run_status_is_supported CHECK (status IN ('running', 'paused', 'completed', 'failed')),
  ADD CONSTRAINT collection_run_terminal_state_is_coherent CHECK (
    (status IN ('running', 'paused', 'failed') AND completed_at IS NULL AND manifest_hash IS NULL AND completed_event_id IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND completed_at >= started_at
      AND manifest_hash IS NOT NULL AND completed_event_id IS NOT NULL)
  );
