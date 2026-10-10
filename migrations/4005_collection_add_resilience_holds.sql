ALTER TABLE collection.source_register
  ADD COLUMN hold_reason text,
  ADD COLUMN held_at timestamptz,
  ADD CONSTRAINT source_register_hold_is_coherent CHECK (
    (hold_reason IS NULL AND held_at IS NULL)
    OR (hold_reason IS NOT NULL AND held_at IS NOT NULL
      AND hold_reason IN ('login-wall', 'captcha', 'block', 'access-denied')
      AND NOT enabled AND enabled_at IS NULL)
  );

ALTER TABLE collection.collection_run
  DROP CONSTRAINT collection_run_status_is_supported,
  DROP CONSTRAINT collection_run_terminal_state_is_coherent,
  ADD COLUMN pause_reason text,
  ADD COLUMN paused_at timestamptz,
  ADD CONSTRAINT collection_run_status_is_supported CHECK (status IN ('running', 'paused', 'completed')),
  ADD CONSTRAINT collection_run_pause_is_coherent CHECK (
    (status = 'paused' AND pause_reason IS NOT NULL AND paused_at IS NOT NULL
      AND pause_reason IN ('login-wall', 'captcha', 'block', 'access-denied'))
    OR (status <> 'paused' AND pause_reason IS NULL AND paused_at IS NULL)
  ),
  ADD CONSTRAINT collection_run_terminal_state_is_coherent CHECK (
    (status IN ('running', 'paused') AND completed_at IS NULL AND manifest_hash IS NULL AND completed_event_id IS NULL)
    OR (status = 'completed' AND completed_at IS NOT NULL AND completed_at >= started_at
      AND manifest_hash IS NOT NULL AND manifest_hash ~ '^sha256:[0-9a-f]{64}$' AND completed_event_id IS NOT NULL)
  );
