# Listing browser campaign

Run listing-2026-10-22T07-48-07-075Z-34fce054; status complete; 7 semantic scenarios attempted.
Consult append-only attempts and independent parsed fixtures.

Source 48168094e0efa1c89524862485e8d49e0695799842d64a1fbc920dfec6ca0ce6; web artifact
71cc6f9f8d185e4def6fec5a3f511e211b5f5a05810902ab0c542aae48a558c0; base
be21042c84fab22bae0f120ec241e243e6aa37ea with dirty local implementation. Immutable surface bytes
and hashes live in surfaces.json.

Reproduce: pnpm exec vitest run --config vitest.integration.config.ts
integration/web-listing.integration.test.ts

Owned teardown: 2026-10-22T07:50:07.617Z. Prepared reads do not establish persisted
correction/revocation/expiry; the existing listing-provenance campaign remains necessary. Parent
authored-artboard comparison, detector, finish review/documenter and human
screen-reader/daylight/zoom review remain separate.
