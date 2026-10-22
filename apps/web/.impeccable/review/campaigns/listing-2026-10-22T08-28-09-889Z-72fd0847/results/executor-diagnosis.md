# Append-only executor diagnosis

Reviewed after the separate final D-064 run `listing-2026-10-22T08-31-04-848Z-ae910bf5` completed.

`LISTING-004-4` remains **inconclusive**, diagnosed **executorError=true**. The original attempt,
its recorded executorError=false, and failed campaign are unchanged. The installed audit helper does
not apply executorError adjudication corrections; this separate linked diagnosis does not claim that
its historical counter changed or promote the attempt to approved. Scenarios005–007 remain
unexecuted in this run.

Session78499 ran
`pnpm exec vitest run --config vitest.integration.config.ts integration/web-listing.integration.test.ts`
and exited1 after75.69s. The stale-refetch alert assertion timed out. The
[original readback](../evidence/LISTING-004-4/readback.json) retains the populated cached Listing
and records no request hitting the stale-error route. The executor set the browser's already-fixed
clock using Node Date.now()+31,000 instead of advancing from the browser's own clock. The required
cache-staleness precondition was therefore not established. This evidence does not establish a
product recovery defect or prove a particular host-clock skew.

The parent-approved executor-only correction derives the next fixed time from browser Date.now(),
asserts an exact31,000ms browser delta, counts stale-route hits, and persists a clock receipt even
on failure. Retained DOM, manual recovery, no automatic retry, and private-body expectations are
unchanged. No product UI, fixture or business oracle was changed.

The independent
[new clock receipt](../../listing-2026-10-22T08-31-04-848Z-ae910bf5/evidence/LISTING-004-4/listing-stale-refetch-clock.json)
records browserBefore1792657952860, browserAfter1792657983860 and staleRefetches1. The
[new attempts](../../listing-2026-10-22T08-31-04-848Z-ae910bf5/results/attempts.jsonl) separately
approve all seven scenarios. Session72307 exited0 and its structural audit exited0. Both runs record
Listing source `1fae37a273fabe7a6c2d6c7ab628cb55d1b0d499404d3cae6c268a61e42fe4ae` and actual served
runtime artifact `339decf909fa03b9d18713294991163fcefc458127dd5766e1dd3d2c9334c033`; their
independently built image IDs are distinct.

The [original cleanup receipt](../teardown.json) confirms this exact owned project's containers,
volumes and networks were empty at2026-10-22T08:29:24.568Z, with the foreign baseline preserved.
