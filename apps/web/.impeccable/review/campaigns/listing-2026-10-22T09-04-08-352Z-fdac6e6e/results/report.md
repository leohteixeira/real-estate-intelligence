# Listing browser campaign

Run listing-2026-10-22T09-04-08-352Z-fdac6e6e; status complete; 7 semantic scenarios attempted.
Consult append-only attempts and independent parsed fixtures.

Source f5d06b588919250fcc09faf2f138145a74e6a6c0b8a0877143009ab29cf07103; web artifact
d33f5be918b36c6ec08cec0d4c9463dd2724b51a0bf4e2b8f469943921b910b3; base
be21042c84fab22bae0f120ec241e243e6aa37ea with dirty local implementation. Immutable surface bytes
and hashes live in surfaces.json.

Reproduce: pnpm exec vitest run --config vitest.integration.config.ts
integration/web-listing.integration.test.ts

Owned teardown: 2026-10-22T09:06:48.628Z. Prepared reads do not establish persisted
correction/revocation/expiry; the existing listing-provenance campaign remains necessary. Parent
authored-artboard comparison, detector, finish review/documenter and human
screen-reader/daylight/zoom review remain separate.
