# Listing browser campaign

Run listing-2026-10-22T08-31-04-848Z-ae910bf5; status complete; 7 semantic scenarios attempted.
Consult append-only attempts and independent parsed fixtures.

Source 1fae37a273fabe7a6c2d6c7ab628cb55d1b0d499404d3cae6c268a61e42fe4ae; web artifact
339decf909fa03b9d18713294991163fcefc458127dd5766e1dd3d2c9334c033; base
be21042c84fab22bae0f120ec241e243e6aa37ea with dirty local implementation. Immutable surface bytes
and hashes live in surfaces.json.

Reproduce: pnpm exec vitest run --config vitest.integration.config.ts
integration/web-listing.integration.test.ts

Owned teardown: 2026-10-22T08:33:06.002Z. Prepared reads do not establish persisted
correction/revocation/expiry; the existing listing-provenance campaign remains necessary. Parent
authored-artboard comparison, detector, finish review/documenter and human
screen-reader/daylight/zoom review remain separate.
