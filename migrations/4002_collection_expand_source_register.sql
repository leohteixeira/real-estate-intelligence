ALTER TABLE collection.source_register
  DROP CONSTRAINT source_register_enabled_requires_permission,
  ALTER COLUMN reviewed_at DROP NOT NULL,
  ADD COLUMN source_category text,
  ADD COLUMN review_outcome text,
  ADD COLUMN access_method text,
  ADD COLUMN access_policy text,
  ADD COLUMN rate_status text,
  ADD COLUMN rate_limit integer,
  ADD COLUMN rate_window_seconds integer,
  ADD COLUMN licence_status text,
  ADD COLUMN licence_label text,
  ADD COLUMN licence_url text,
  ADD COLUMN enabled_at timestamptz;

INSERT INTO collection.source_register (
  source_id,
  source_label,
  source_kind,
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
    'synthetic-data', 'Labelled synthetic fixture', 'synthetic', true, true, true, true,
    'Repository-owned deterministic fixture containing no personal data or photographs.', NULL,
    'synthetic-listing', 'not-required', 'repository-fixture',
    'Checked-in deterministic fixture; no external access occurs.', 'not-applicable', NULL, NULL,
    'not-applicable', 'Synthetic data', NULL, '2026-10-10T00:00:00Z'
  ),
  (
    'geosampa-fiscal-blocks', 'GeoSampa fiscal blocks', 'real', false, true, false, false,
    'CC BY-SA 4.0 review; reference geography only and not ingested in the MVP.',
    '2026-10-09T00:00:00Z', 'reference-geography', 'allowed', 'remote-http',
    'Published WFS endpoint; product use is deferred to the V2 block layer.', 'unconfigured', NULL, NULL,
    'licensed', 'CC BY-SA 4.0',
    'https://creativecommons.org/licenses/by-sa/4.0/', NULL
  ),
  (
    'geosampa-iptu', 'GeoSampa IPTU base', 'real', false, false, false, false,
    'CC BY-SA 4.0 review; human download is CAPTCHA-bound and the cadastre is not used.',
    '2026-10-09T00:00:00Z', 'cadastral-file', 'allowed', 'manual-download',
    'A person may download the file; automation must not work around the CAPTCHA.',
    'not-applicable', NULL, NULL, 'licensed', 'CC BY-SA 4.0',
    'https://creativecommons.org/licenses/by-sa/4.0/', NULL
  ),
  (
    'sao-paulo-itbi-transactions', 'São Paulo ITBI transactions', 'real', false, false, false, false,
    'The publisher page states no licence; written reuse permission is still required.',
    '2026-10-09T00:00:00Z',
    'transaction', 'not-verified', 'remote-http', 'Publisher-hosted spreadsheet download.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  ),
  (
    'caixa-property-list', 'Caixa property list', 'real', false, false, false, false,
    'No terms or licence granting reuse were found; written permission is still required.',
    '2026-10-09T00:00:00Z',
    'listing', 'not-verified', 'remote-http', 'Publisher-hosted state CSV download.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  ),
  (
    'olx', 'OLX', 'real', false, false, false, false,
    'Reviewed terms forbid web crawling and reuse without prior express authorization.',
    '2026-10-09T00:00:00Z', 'listing', 'forbidden', 'remote-http',
    'Public website; no authorized collection interface.', 'unconfigured', NULL, NULL,
    'not-verified', NULL, NULL, NULL
  ),
  (
    'quintoandar', 'QuintoAndar', 'real', false, false, false, false,
    'Reviewed terms forbid extracting data by web scraping and copying content.',
    '2026-10-09T00:00:00Z', 'listing', 'forbidden', 'remote-http',
    'Public website; no authorized collection interface.', 'unconfigured', NULL, NULL,
    'not-verified', NULL, NULL, NULL
  ),
  (
    'chaves-na-mao', 'Chaves na Mão', 'real', false, false, false, false,
    'Reviewed terms forbid bots and scraping; the assistant endpoint does not authorize storage.',
    '2026-10-09T00:00:00Z', 'listing', 'forbidden', 'remote-http',
    'Public website and assistant endpoint; neither permits scheduled storage.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  ),
  (
    'zap-imoveis', 'ZAP Imóveis', 'real', false, false, false, false,
    'Current terms could not be read; no permission for collection was established.',
    '2026-10-09T00:00:00Z',
    'listing', 'not-verified', 'remote-http', 'Public website; current access policy unverified.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  ),
  (
    'viva-real', 'Viva Real', 'real', false, false, false, false,
    'Terms pages were unreadable and no permission for collection was established.',
    '2026-10-09T00:00:00Z',
    'listing', 'not-verified', 'remote-http', 'Public website; current access policy unverified.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  ),
  (
    'imovelweb', 'Imovelweb', 'real', false, false, false, false,
    'The terms could not be read and no permission for collection was established.',
    '2026-10-09T00:00:00Z',
    'listing', 'not-verified', 'remote-http', 'Public website; current access policy unverified.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  ),
  (
    'loft', 'Loft', 'real', false, false, false, false,
    'No terms addressed to visitors were found and no permission was established.',
    '2026-10-09T00:00:00Z',
    'listing', 'not-verified', 'remote-http', 'Public website; visitor access policy unverified.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  ),
  (
    'mercado-livre', 'Mercado Livre', 'real', false, false, false, false,
    'General and developer terms could not be read; no permission was established.',
    '2026-10-09T00:00:00Z',
    'listing', 'not-verified', 'remote-http', 'Public website and authenticated developer interface.',
    'unconfigured', NULL, NULL, 'not-verified', NULL, NULL, NULL
  )
ON CONFLICT (source_id) DO UPDATE SET
  source_label = EXCLUDED.source_label,
  source_kind = EXCLUDED.source_kind,
  enabled = EXCLUDED.enabled,
  collection_allowed = EXCLUDED.collection_allowed,
  image_fetching_allowed = EXCLUDED.image_fetching_allowed,
  listing_text_display_allowed = EXCLUDED.listing_text_display_allowed,
  permission_evidence = EXCLUDED.permission_evidence,
  reviewed_at = EXCLUDED.reviewed_at,
  source_category = EXCLUDED.source_category,
  review_outcome = EXCLUDED.review_outcome,
  access_method = EXCLUDED.access_method,
  access_policy = EXCLUDED.access_policy,
  rate_status = EXCLUDED.rate_status,
  rate_limit = EXCLUDED.rate_limit,
  rate_window_seconds = EXCLUDED.rate_window_seconds,
  licence_status = EXCLUDED.licence_status,
  licence_label = EXCLUDED.licence_label,
  licence_url = EXCLUDED.licence_url,
  enabled_at = COALESCE(collection.source_register.enabled_at, EXCLUDED.enabled_at);

ALTER TABLE collection.source_register
  ALTER COLUMN source_category SET NOT NULL,
  ALTER COLUMN review_outcome SET NOT NULL,
  ALTER COLUMN access_method SET NOT NULL,
  ALTER COLUMN access_policy SET NOT NULL,
  ALTER COLUMN rate_status SET NOT NULL,
  ALTER COLUMN licence_status SET NOT NULL,
  DROP COLUMN source_kind,
  ADD CONSTRAINT source_register_id_is_bounded CHECK (
    char_length(source_id) BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT source_register_category_is_supported CHECK (
    source_category IN ('synthetic-listing', 'listing', 'reference-geography', 'cadastral-file', 'transaction')
  ),
  ADD CONSTRAINT source_register_review_is_consistent CHECK (
    (review_outcome IN ('allowed', 'forbidden') AND reviewed_at IS NOT NULL)
    OR review_outcome = 'not-verified'
    OR (review_outcome = 'not-required' AND reviewed_at IS NULL)
  ),
  ADD CONSTRAINT source_register_synthetic_identity_is_consistent CHECK (
    (source_id = 'synthetic-data') = (source_category = 'synthetic-listing')
    AND (review_outcome = 'not-required') = (source_id = 'synthetic-data')
    AND (access_method = 'repository-fixture') = (source_id = 'synthetic-data')
  ),
  ADD CONSTRAINT source_register_synthetic_policy_is_consistent CHECK (
    source_id <> 'synthetic-data'
    OR (rate_status = 'not-applicable' AND licence_status = 'not-applicable')
  ),
  ADD CONSTRAINT source_register_access_is_supported CHECK (
    access_method IN ('repository-fixture', 'remote-http', 'manual-download')
    AND char_length(access_policy) BETWEEN 1 AND 500
  ),
  ADD CONSTRAINT source_register_rate_is_consistent CHECK (
    (rate_status IN ('not-applicable', 'unconfigured') AND rate_limit IS NULL AND rate_window_seconds IS NULL)
    OR (rate_status = 'configured'
      AND rate_limit IS NOT NULL
      AND rate_window_seconds IS NOT NULL
      AND rate_limit > 0
      AND rate_window_seconds > 0)
  ),
  ADD CONSTRAINT source_register_licence_is_consistent CHECK (
    (licence_status = 'licensed'
      AND licence_label IS NOT NULL
      AND licence_url IS NOT NULL
      AND char_length(licence_label) BETWEEN 1 AND 200
      AND char_length(licence_url) BETWEEN 1 AND 2048
      AND char_length(split_part(substring(lower(licence_url) FROM '^https?://([^/?#]+)'), ':', 1)) BETWEEN 1 AND 253
      AND split_part(substring(lower(licence_url) FROM '^https?://([^/?#]+)'), ':', 1) ~ '[a-z]'
      AND licence_url ~* '^https?://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:([0-9]{1,4}|[0-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?([/?#][a-z0-9._~:/?#@!$&''()*+,;=%-]*)?$')
    OR (licence_status = 'not-verified' AND licence_label IS NULL AND licence_url IS NULL)
    OR (licence_status = 'not-applicable'
      AND licence_label IS NOT NULL
      AND char_length(licence_label) BETWEEN 1 AND 200
      AND licence_url IS NULL)
  ),
  ADD CONSTRAINT source_register_enablement_time_is_consistent CHECK (
    enabled = (enabled_at IS NOT NULL)
  ),
  ADD CONSTRAINT source_register_enabled_requires_complete_gate CHECK (
    NOT enabled OR (
      source_id = 'synthetic-data'
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
