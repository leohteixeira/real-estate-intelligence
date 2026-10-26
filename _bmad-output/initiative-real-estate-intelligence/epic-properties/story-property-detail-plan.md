---
title: 'Property detail'
type: 'feature'
ticket: 9
created: '2026-10-25'
status: 'built'
baseline_revision: 'ba855609bdce1a517c6dc30062d0a11b41b9e6ba'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: ['/workspace/repos/real-estate-intelligence/docs/testing/integration.md']
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 3.9 requires the three-listing property's public detail to demonstrate all
CAP-7 elements together. Stories 3.5/3.6 already implement the behavior; prior campaigns prove
individual elements, but the genuine grouped HTTP response lacks an explicit complete assertion.

**Approach:** Extend the existing genuine resolution campaign with literal CAP-7 expectations:
the active minimum and its acquisition provenance, no recorded sale, dated percentage price
changes, exposure, all scalar/feature agreements and actual explainable match evidence. Reuse
unchanged history removal/return, permission, prepared-contract and browser evidence.

</intent-contract>

## Implementation Notes

- Oneshot: fewer than 100 added test lines in one existing campaign; no product defect identified.
  This closes an evidence limitation, without new fixtures, production behavior or abstractions.
- Given the genuine 39-run/115-acquisition catalog, when HTTP GET returns the Bela Vista property,
  then it contains exactly three listings, Aurora's BRL 780,000 active asking minimum with its
  provenance, no sale, the January/July reductions with dates/percentages, 365 exposure days,
  six attributed agreement rows including the retained neighborhood disagreement, both features
  and deterministic, explicitly uncalibrated matching reasons.
- Preserve original assertions, deadlines, coverage floors, hooks and synthetic-only boundaries.
  Run one heavy workload at a time; leave the landing and foreign resources untouched. Publication
  remains on feat/phase-1 through goal completion under the existing application prefix.

- The formatted addition is 103 test lines in the same file; the original oneshot estimate was
  below 100. No new implementation, abstraction or fixture was needed.
- Initial campaign failed at sandboxed browser launch in 61.43s, before the new assertions
  (`/tmp/rei-property-detail-resolution.log`). The documented SUID helper was omitted from the
  command environment. A direct sandboxed launch with the existing root-owned mode-4755 helper
  passed (Chromium 156.0.8078.4); the next campaign changes only that environment. No sandbox,
  assertion, retry or timeout is weakened. Fixture cleanup completed; the owned crash dump was
  moved out of the repository without inspection.

- Final genuine campaign passed 1/1 in 169.63s (172.71s total), including all new CAP-7
  assertions and all existing resolution/search/browser/concurrency/restart assertions; log:
  `/tmp/rei-property-detail-resolution-sandbox.log`. Strict integration typecheck, targeted ESLint
  and Prettier passed. Production source/dependency paths are unchanged from the baseline.

- Required all-files pre-commit gate passed all six groups (52.57s maximum job);
  `/tmp/rei-property-detail-hooks.log`. No product files were changed by formatters.

## Plan Change Log

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: independent quick inspection returned no findings. No patches, deferrals, rejections
  or further review pass are required.

## Verification

- Run strict integration type checking and targeted formatting/lint for the changed test.
- Run the existing resolution Vitest campaign with the documented
  `CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox` environment.
- Reuse story 3.8's final production source/dependency identity and approved unit/build/coverage,
  prepared HTTP/browser results. Reuse story 3.6's authentic absence/return and provenance
  campaigns; no relevant product code, migration, fixture or dependency changes here.
- Run required `lefthook run pre-commit --all-files`, independent quick inspection and normal
  commit hooks. Record exact results and any evidence limitation before ticket closure.

## Auto Run Result

- Implemented the missing combined CAP-7 proof in
  `integration/property-resolution.integration.test.ts`: three genuine persisted members,
  attributed active asking minimum, no recorded sale, two dated/signed reductions, exposure,
  six scalar agreements, feature percentages and actual matching configuration/reasons.
- This plan records acceptance, the executor failure and verified recovery, reused evidence
  and delivery. Only these two files changed; no product behavior was changed.
- Final campaign passed 1/1 with every original assertion retained; strict integration
  typechecking, targeted formatting/ESLint and the six required all-files hook groups passed.
- Reused approved lint/typecheck/unit/build/coverage for unchanged production source and
  dependencies from story 3.8; its plan records 2,829 unit tests across 239 files and all eight
  coverage floors. Existing story 3.6 history/provenance campaigns prove authentic removals,
  return gaps and current rights; prepared HTTP/browser compatibility is unchanged.
- Review: zero findings, patches, deferrals or rejections; patched high/medium/low counts 0/0/0.
  Follow-up review is false. The first sandbox launch is not counted as product evidence.
- Limit: synthetic isolated integration evidence only. Public deployment and HTTPS remain
  the separate production ticket's responsibility on feat/phase-1, without an intermediate
  main requirement. No claim of production acceptance is made here.
- Test delivery: `0837ed9a7881c6e6e74a0c1dc8c64be3d9532531` (normal hooks passed);
  the commit includes the initial plan already staged for the all-files gate. This documentation
  update records its completed review and gates without rewriting history.
