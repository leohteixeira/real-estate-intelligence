# Listing browser campaign

Run listing-2026-10-22T08-07-51-482Z-59f5f0fc; status failed; 4 semantic scenarios attempted.
Consult append-only attempts and independent parsed fixtures.

Source 3df3632cb7c620e1192394511d051145ea17b187038d57acfc033516013953c1; web artifact
0f90e2e7d618d7ff307767d15c1222aaf8eefee06fe83a3144241909cf2562e7; base
be21042c84fab22bae0f120ec241e243e6aa37ea with dirty local implementation. Immutable surface bytes
and hashes live in surfaces.json.

Reproduce: pnpm exec vitest run --config vitest.integration.config.ts
integration/web-listing.integration.test.ts

Owned teardown: 2026-10-22T08:09:09.838Z. Prepared reads do not establish persisted
correction/revocation/expiry; the existing listing-provenance campaign remains necessary. Parent
authored-artboard comparison, detector, finish review/documenter and human
screen-reader/daylight/zoom review remain separate.

Post-run append-only triage: [executor diagnosis](executor-diagnosis.md) classifies LISTING-004-4 as
inconclusive with executorError=true, preserves the original attempt unchanged, and links
same-source independent rerun evidence. This historical run is not promoted to approved.
