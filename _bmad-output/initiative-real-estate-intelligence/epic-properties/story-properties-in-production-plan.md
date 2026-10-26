---
title: 'Properties in production'
type: 'chore'
ticket: '13'
created: '2026-10-26'
status: 'built'
baseline_revision: 'f8ca60b9d46d29e0e387edf7c6c20c60394d7318'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 2.12 has populated the published stack, but CAP-6/7/8 still lack observed
public endpoint evidence for the genuinely resolved three-listing property and its history.

**Approach:** Use a small explicit read-only TypeScript probe against the authorized HTTPS prefix,
reusing frozen public DTO parsers, Supertest and the synthetic catalog as the independent oracle.
Record exact source identity, dated response captures and assertions in the existing plan and
runbook. Correct only a demonstrated acceptance defect, if any appears.

</intent-contract>

## Implementation Notes

- Oneshot estimate: at most 100 probe lines, no runtime changes. This closes an evidence gap;
  earlier genuine collection/resolution/history/permission campaigns remain valid.
- Continuity: completed 3.7–3.12 establish calibration limits, persisted search, grouped detail,
  current rights, original reductions and suppression. Preserve all historical notes and gates.
- Add `integration/fixtures/probe-properties-production.ts`: explicit manual read-only command,
  included in strict integration typecheck but outside automatic local test discovery. No new
  harness, fixture, deployment, model call, database write or persistent diagnostic is needed.
- Acceptance: public persisted search returns five groups; the Bela Vista group has exactly
  AUR-BV-001, BRI-BV-001 and COB-BV-001, all pointing at one property; evidence identifies the
  deterministic rule, not prepared matching; authentic dated prices, descriptions, per-source
  provenance, rights and collected history match the existing catalog. Capture every detail.
- Compare acquisitions against catalog dates rather than receipt time. Scheduled no-op collection
  must not invent a new price or description history event. No sale is claimed.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Restricted Quick review

- Verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0.
- `[medium]` `[patch]` The probe did not prove every original price/description transition,
  description version or field date, nor exclude scheduled no-op duplicate events. Verified the
  missing assertions; add exact catalog-derived comparisons and complete event-count checks.
- `[medium]` `[patch]` Conditional permitted-text checking could accept incorrectly denied
  synthetic text. Verified the missing expected permission; compare the public source register
  and require allowed descriptions for these authorized sources before checking all versions.

### 2026-10-26 — Targeted patch follow-up

- Verdicts: 0 new findings. Independent inspection confirmed both original gaps resolved and
  found no concrete regression in the patches. No further broad review was opened.

## Verification

- Execute the explicit probe once against `https://leohteixeira.com/real-estate-intelligence`;
  preserve timestamped JSON responses and observed assertions in a protected host receipt.
- Run strict integration typecheck and focused ESLint/Prettier for the probe, normal commit hooks
  and `git diff --check`. Reuse Story 2.12 final product gates and prior genuine campaigns because
  this story changes no product, dependencies or fixtures.
- Required independent Quick review checks the probe and the observed evidence/dispositions only.

Execution note: the first probe captured all 15 successful endpoint responses, then rejected the
first listing because its count omitted the already accepted native scheduled acquisition.
Actual provenance identifies exactly the three Story 2.12 scheduled run IDs. Correct the oracle
to catalog acquisitions plus that one acquisition per listing, with exact scheduled run identity;
retain dates and event checks. This is an executor defect, not a product defect. Initial captures
remain at `/tmp/rei-properties-production-first-captures.json`. The first typecheck also caught a
probe field typo (`datasetVersion` versus frozen `fixtureVersion`); corrected without DTO changes.
Formatting expanded the initially under-100-line estimate to 114 lines in one mechanical probe;
there is no product change or additional harness. No broad investigation or campaign restart.

The second mismatch triggered a model reassessment, not another product patch. The seed plan
explicitly forbids a clock override. `ListingChronology.remove` uses the authentic completed-run
clock; reappearance uses the received observation date, and canonical history supports decreasing
effective dates. A directed read-only production query confirms April's missing-listing run
`01a179c7-4ee8-7de8-a29c-6a9144ca035a` completed at
`2026-10-26T19:54:27.864Z`, exactly the removal event date returned publicly. The probe now pins
that independently verified run clock, retaining June's authentic reappearance date. This evidence
does not claim an April-dated production removal or a historical April/May exposure gap. Original
HTTP captures and immutable events remain preserved; no data repair or new runtime model is needed.

Observed acceptance: 15 actual trusted HTTPS responses passed on 2026-10-26: one persisted search,
five property details and nine listing details. Exactly five groups/nine identities,
one three-listing
Bela Vista property `01a179c6-fc86-7a92-b01f-6b4ebf11623d`, genuine deterministic uncalibrated
matching, BRL 780,000 asking minimum from Aurora, original January/July reductions, thirteen
catalog months plus each recorded native acquisition, exact current per-listing provenance and
public/detail membership agreement. No sale is recorded. Removal/reappearance dates follow their
separately verified completion/observation authority as explained above.

Protected receipt and the exact probe are under
`/var/backups/portfolio/rei-production-collection-20261026T195350Z/`:
`properties-public.json` and `properties-public-probe.ts`. The receipt identifies delivered source
`b570a09427bea39ea03d4dda93c7dc0e0c502899`. No product code changed after that release.
Strict integration typecheck, focused ESLint/Prettier and diff whitespace passed; logs for both
initial rejected oracles and the successful final typecheck remain under `/tmp` as named above.
No production write, deployment, model call or optional general investigation was needed.

The review patches change only acceptance assertions in the explicit probe. Its final execution
will include one additional source-register GET, all original history values/hashes/dates and
exact event counts. Preserve the earlier receipt as the first completed narrower proof, rather
than overwrite it. Final follow-up is restricted to the two patched oracle gaps.

The patched probe passed 16 actual HTTPS reads: all original price and description transitions,
before/after values and hashes, permitted description versions, field-effective dates, exact
history counts without scheduled duplicates and expected source text rights. Preserve this
expanded proof as `properties-public-reviewed.json` and its exact
`properties-public-reviewed-probe.ts`, alongside the earlier narrower receipt. No behavior,
fixture, deadline, retry or assertion was weakened. The public read interval is recorded in each
capture; run identity remains the original b570a094 publication.

## Auto Run Result

- Built the explicit read-only production acceptance probe; no runtime code or data changed.
- Files: the probe validates public Properties against the catalog; this plan records triage and
  bounded chronology evidence; `docs/operations/deployment.md` preserves the operational receipt.
- Review: two medium patches applied, zero deferred or rejected findings; the required Quick
  review and targeted patch follow-up completed. Follow-up recommendation: false; no named
  unverified patch risk remains.
- Verification: final 16-response HTTPS probe passed; strict integration typecheck exited zero
  (`/tmp/rei-properties-production-review-typecheck.log`); focused ESLint passed. Formatting,
  scoped Markdown checks and normal commit hooks apply to the final files. Reuse unchanged
  runtime gates from Story 2.12 and the existing collection/history/rights campaigns.
- Limits: acceptance pins the recorded acquisitions and delivered source; it is not a perpetual
  scheduler health check. Production removal uses actual run completion, not a simulated April
  clock. The protected reviewed receipt and executed source remain preserved separately from
  subsequent formatting-only changes.
