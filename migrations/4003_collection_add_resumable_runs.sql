ALTER TABLE collection.source_register
  DROP CONSTRAINT source_register_synthetic_identity_is_consistent,
  DROP CONSTRAINT source_register_synthetic_policy_is_consistent,
  DROP CONSTRAINT source_register_enabled_requires_complete_gate;

ALTER TABLE collection.source_register
  ADD CONSTRAINT source_register_synthetic_identity_is_consistent CHECK (
    (source_id IN (
      'synthetic-data',
      'synthetic-portal-aurora',
      'synthetic-portal-brisa',
      'synthetic-portal-cobalto'
    )) = (source_category = 'synthetic-listing')
    AND (review_outcome = 'not-required') = (source_id IN (
      'synthetic-data',
      'synthetic-portal-aurora',
      'synthetic-portal-brisa',
      'synthetic-portal-cobalto'
    ))
    AND (access_method = 'repository-fixture') = (source_id IN (
      'synthetic-data',
      'synthetic-portal-aurora',
      'synthetic-portal-brisa',
      'synthetic-portal-cobalto'
    ))
  ),
  ADD CONSTRAINT source_register_synthetic_policy_is_consistent CHECK (
    source_id NOT IN (
      'synthetic-data',
      'synthetic-portal-aurora',
      'synthetic-portal-brisa',
      'synthetic-portal-cobalto'
    )
    OR (rate_status = 'not-applicable' AND licence_status = 'not-applicable')
  ),
  ADD CONSTRAINT source_register_enabled_requires_complete_gate CHECK (
    NOT enabled OR (
      source_id IN (
        'synthetic-data',
        'synthetic-portal-aurora',
        'synthetic-portal-brisa',
        'synthetic-portal-cobalto'
      )
      AND source_category = 'synthetic-listing'
      AND review_outcome = 'not-required'
      AND access_method = 'repository-fixture'
      AND collection_allowed
      AND licence_status = 'not-applicable'
      AND rate_status = 'not-applicable'
    ) OR (
      source_category <> 'synthetic-listing'
      AND review_outcome = 'allowed'
      AND reviewed_at IS NOT NULL
      AND access_method = 'remote-http'
      AND collection_allowed
      AND licence_status <> 'not-verified'
      AND rate_status = 'configured'
      AND rate_limit IS NOT NULL
      AND rate_window_seconds IS NOT NULL
      AND rate_limit > 0
      AND rate_window_seconds > 0
    )
  );

INSERT INTO collection.source_register (
  source_id,
  source_label,
  enabled,
  collection_allowed,
  image_fetching_allowed,
  listing_text_display_allowed,
  permission_evidence,
  reviewed_at,
  source_category,
  review_outcome,
  access_method,
  access_policy,
  rate_status,
  rate_limit,
  rate_window_seconds,
  licence_status,
  licence_label,
  licence_url,
  enabled_at
)
VALUES
  (
    'synthetic-portal-aurora', 'Synthetic data — Aurora', true, true, true, true,
    'Repository-owned deterministic fixture containing no personal data or photographs.', NULL,
    'synthetic-listing', 'not-required', 'repository-fixture',
    'Checked-in deterministic fixture; no external access occurs.', 'not-applicable', NULL, NULL,
    'not-applicable', 'Synthetic data', NULL, '2026-10-10T00:00:00Z'
  ),
  (
    'synthetic-portal-brisa', 'Synthetic data — Brisa', true, true, true, true,
    'Repository-owned deterministic fixture containing no personal data or photographs.', NULL,
    'synthetic-listing', 'not-required', 'repository-fixture',
    'Checked-in deterministic fixture; no external access occurs.', 'not-applicable', NULL, NULL,
    'not-applicable', 'Synthetic data', NULL, '2026-10-10T00:00:00Z'
  ),
  (
    'synthetic-portal-cobalto', 'Synthetic data — Cobalto', true, true, true, true,
    'Repository-owned deterministic fixture containing no personal data or photographs.', NULL,
    'synthetic-listing', 'not-required', 'repository-fixture',
    'Checked-in deterministic fixture; no external access occurs.', 'not-applicable', NULL, NULL,
    'not-applicable', 'Synthetic data', NULL, '2026-10-10T00:00:00Z'
  );

ALTER TABLE collection.collection_run
  DROP CONSTRAINT collection_run_status_is_completed,
  DROP CONSTRAINT collection_run_time_order,
  DROP CONSTRAINT collection_run_manifest_hash_is_canonical,
  ALTER COLUMN completed_at DROP NOT NULL,
  ALTER COLUMN manifest_hash DROP NOT NULL,
  ALTER COLUMN completed_event_id DROP NOT NULL,
  ADD COLUMN checkpoint_ordinal integer NOT NULL DEFAULT 0,
  ADD COLUMN checkpoint_cursor text,
  ADD COLUMN checkpointed_at timestamptz;

ALTER TABLE collection.snapshot_observation
  ADD COLUMN parsed_event_id uuid;

UPDATE collection.snapshot_observation AS observation
   SET parsed_event_id = run.parsed_event_id
  FROM collection.collection_run AS run
 WHERE run.run_id = observation.run_id;

ALTER TABLE collection.snapshot_observation
  ALTER COLUMN parsed_event_id SET NOT NULL,
  ADD CONSTRAINT snapshot_observation_parsed_event_id_is_uuid_v7 CHECK (
    uuid_extract_version(parsed_event_id) = 7
  ),
  ADD CONSTRAINT snapshot_observation_parsed_event_id_is_unique UNIQUE (parsed_event_id);

ALTER TABLE collection.collection_run
  DROP CONSTRAINT collection_run_parsed_event_id_is_uuid_v7,
  DROP COLUMN parsed_event_id,
  ADD CONSTRAINT collection_run_status_is_supported CHECK (status IN ('running', 'completed')),
  ADD CONSTRAINT collection_run_checkpoint_is_coherent CHECK (
    checkpoint_ordinal >= 0
    AND (
      checkpoint_cursor IS NULL
      OR (
        checkpoint_cursor ~ '^[!-~]+$'
        AND char_length(checkpoint_cursor) <= 300
      )
    )
    AND (checkpoint_ordinal <> 0 OR checkpoint_cursor IS NULL)
    AND (checkpoint_ordinal = 0 OR checkpointed_at IS NOT NULL)
  ),
  ADD CONSTRAINT collection_run_terminal_state_is_coherent CHECK (
    (
      status = 'running'
      AND completed_at IS NULL
      AND manifest_hash IS NULL
      AND completed_event_id IS NULL
    ) OR (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at >= started_at
      AND manifest_hash ~ '^sha256:[0-9a-f]{64}$'
      AND completed_event_id IS NOT NULL
    )
  );
