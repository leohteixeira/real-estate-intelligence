# Append-only executor diagnosis

Reviewed on 2026-10-22 after the independent rerun `listing-2026-10-22T08-14-41-897Z-fa346fb5`
completed.

`LISTING-006-6` remains **inconclusive**, diagnosed **executorError=true**. Original attempts and
the failed run are unchanged. The installed structural-audit adjudication path does not replace
executorError, so this separate linked diagnostic is the explicit triage record; it does not claim a
changed audit counter or approved historical attempt.

The command
`pnpm exec vitest run --config vitest.integration.config.ts integration/web-listing.integration.test.ts`,
session3489, exited1 (115.44s). Scenarios001–005 passed. The new explicit plate-existence assertion
called `locator('.listing-head').count()` immediately after `page.goto` and before the existing
`checkListing` awaited the real heading and independent API facts. It observed the asynchronous
loading render (count0), not a settled populated detail.
[Original scenario006 readback](../evidence/LISTING-006-6/readback.json) preserves the failure. No
populated scenario006 surfaces were claimed from this attempt.

The readiness-only correction moved the exact count===1 assertion after `checkListing`; no UI,
fixture or expected outcome changed.
[Separate new scenario006 evidence](../../listing-2026-10-22T08-14-41-897Z-fa346fb5/evidence/LISTING-006-6/readback.json)
and its six full/top/facts captures completed independently. The new session11486 exited0 (91.06s);
structural audit exited0 with seven approved cases. Both failed and new runs share Listing source
hash `3df3632cb7c620e1192394511d051145ea17b187038d57acfc033516013953c1` and actual runtime artifact
hash `0f90e2e7d618d7ff307767d15c1222aaf8eefee06fe83a3144241909cf2562e7`.

[Original teardown receipt](../teardown.json) confirms exact owned containers, volumes and networks
empty at 2026-10-22T08:13:33.598Z. Historical scenario006 remains inconclusive and scenario007
remains unexecuted in this run.
