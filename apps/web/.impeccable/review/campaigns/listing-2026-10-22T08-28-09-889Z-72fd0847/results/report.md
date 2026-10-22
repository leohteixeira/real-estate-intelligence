# Listing browser campaign

Run listing-2026-10-22T08-28-09-889Z-72fd0847; status failed; 4 semantic scenarios attempted.
Consult append-only attempts and independent parsed fixtures.

Source 1fae37a273fabe7a6c2d6c7ab628cb55d1b0d499404d3cae6c268a61e42fe4ae; web artifact
339decf909fa03b9d18713294991163fcefc458127dd5766e1dd3d2c9334c033; base
be21042c84fab22bae0f120ec241e243e6aa37ea with dirty local implementation. Immutable surface bytes
and hashes live in surfaces.json.

Reproduce: pnpm exec vitest run --config vitest.integration.config.ts
integration/web-listing.integration.test.ts

Owned teardown: 2026-10-22T08:29:24.568Z. Prepared reads do not establish persisted
correction/revocation/expiry; the existing listing-provenance campaign remains necessary. Parent
authored-artboard comparison, detector, finish review/documenter and human
screen-reader/daylight/zoom review remain separate.

Append-only triage: [executor clock-precondition diagnosis](executor-diagnosis.md). Scenario004
remains inconclusive; its original attempt and campaign verdict are preserved. A separately
identified new run supplies the corrected executor evidence.
