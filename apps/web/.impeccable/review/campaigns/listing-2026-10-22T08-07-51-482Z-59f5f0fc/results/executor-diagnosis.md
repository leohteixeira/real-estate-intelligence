# Append-only executor diagnosis

Reviewed on 2026-10-22 after the independent rerun `listing-2026-10-22T08-14-41-897Z-fa346fb5`
completed.

`LISTING-004-4` remains **inconclusive**, diagnosed **executorError=true**. Its original attempt and
run verdict are unchanged; this is not a promotion to approved. The original ledger recorded
`executorError=false` before triage. The installed audit helper applies adjudication status,
verification and final-UI replacements but does not apply an executorError correction, so this
linked diagnostic records the classification explicitly instead of rewriting historical bytes or
claiming its executor-error counter has changed.

The command
`pnpm exec vitest run --config vitest.integration.config.ts integration/web-listing.integration.test.ts`,
session64680, exited1 (80.08s). The capture helper unconditionally required the 600-weight Barlow
Condensed font on the mobile 404 page. After D-063 that page has no visible `.listing-head` consumer
and Chromium does not load the unused font. The required Barlow content font remained loaded. This
assertion stopped scenario004 before its full recovery checks and establishes no product defect.

Original observation: [scenario004 readback](../evidence/LISTING-004-4/readback.json) records the
404 URL/body and the failed boolean assertion. Original source and actual runtime hashes are
recorded in [artifact readback](../artifact-readback.json).

The executor-only correction in `integration/web-listing.integration.test.ts` records
`hasListingPlate`, requires Condensed600 only when a plate exists, keeps Barlow unconditional, and
explicitly requires exactly one populated plate after settled independent API/UI checks in all six
responsive views. No UI, fixture or expected business outcome changed.

Separate new evidence:
[same-source 404 geometry](../../listing-2026-10-22T08-14-41-897Z-fa346fb5/evidence/LISTING-004-4/listing-missing-390-pt-BR-interaction.json)
records `hasListingPlate=false`, `barlowLoaded=true`, `condensedLoaded=false`.
[New scenario004 attempt](../../listing-2026-10-22T08-14-41-897Z-fa346fb5/results/attempts.jsonl)
completed independently; it does not replace this failed attempt. New run session11486 exited0; its
structural audit exited0 with seven approved, zero executor errors and zero unexecuted cases. Both
runs have Listing source hash `3df3632cb7c620e1192394511d051145ea17b187038d57acfc033516013953c1` and
actual runtime artifact hash `0f90e2e7d618d7ff307767d15c1222aaf8eefee06fe83a3144241909cf2562e7`.

[Original teardown receipt](../teardown.json) confirms the exact owned project's containers, volumes
and networks were empty at 2026-10-22T08:09:09.838Z. Historical scenario004 remains inconclusive and
scenarios005–007 remain unexecuted in this run.
