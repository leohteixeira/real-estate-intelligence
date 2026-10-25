---
title: 'Thresholds calibrated on the labelled dataset'
type: 'feature'
ticket: 7
created: '2026-10-25'
status: done
baseline_revision: '4c31ec868a87ccd94be5751b12799319fb7715b4'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** D-092 supplies an initial versioned matching configuration, but no repeatable
calibration gate reports precision and recall against the fixture's exhaustive labelled pairs.

**Approach:** Add a focused native Vitest calibration test beside the existing infrastructure
fixture tests. Feed genuine replay events through NormalizedListing and the public production
comparison rule; labels score the resulting decisions only. Report precision/recall and the
confusion matrix for all 36 pairs at each of thirteen monthly retained-evidence states.
Pin precision and recall floors at 1.0 if the existing weights achieve them; retain the existing
configuration identity/weights when no adjustment improves the measured result. Keep 0.90/0.50
fixed and report whether these data justify a change. Record the result and its synthetic-only
limit in the existing plan, epic and API reference; never claim statistical probability calibration.
Do not change fixture bytes, inspect opaque fingerprint substrings, add runtime label access,
introduce an evaluation framework or rerun unchanged service/browser campaigns.

</intent-contract>

## Implementation Notes

Oneshot: approximately 90 lines of test code and concise updates to existing records; no new
production rule, transport, migration, component or abstraction is required. Risk remains medium.
Reuse `buildSyntheticSaoPauloReplay`, `SYNTHETIC_SAO_PAULO_MATCH_LABELS`, `NormalizedListing`,
`compareResolutionInputs` and `INITIAL_RESOLUTION_CONFIGURATION` through existing public exports.
The thirteen monthly views retain the last observed evidence for absent listings, matching the
existing rule that absence alone does not split identity. They are repeated observations of the
same nine identities, not independent validation samples. The test must check complete unique
unordered pair coverage and fail on missing identity inputs before counting metrics; zero
predicted positives must produce zero precision rather than an accidental passing ratio.

- Focused calibration passed 1/1 in 1.35s; existing dataset/replay plus calibration passed
  8/8 in 2.87s and domain resolution passed 17/17 in 0.55s. The default agent reporter hid
  passing console output, including with silent=false; local Vitest code identifies its agent
  default. Explicit verbose reporting emitted the full metrics (1/1, 1.26s). This is an evidence
  presentation limit, not a product failure or an assertion adjustment.
- Actual metrics in every view: TP=5, TN=31, FP=FN=0, precision=recall=1.0. D-093 records retaining
  the existing weights/configuration identity and the synthetic-only limitation. No production,
  fixture, dependency, migration or public contract changed. Focused logs are
  `/tmp/rei-calibration-{focused,regressions,domain,metrics}.log`.

- Final serial lint/typecheck/unit/build gates passed. The unit command ran 2,799 tests in
  237 files; the existing six coverage receipts and seven service/browser campaigns remain
  valid for unchanged production/fixture/dependency code. Logs:
  `/tmp/rei-calibration-final-{lint,typecheck,test,build}.log`. Changed Markdown formatting/lint
  passed, and the parent read the complete four-file diff. No matrix is present on this oneshot.

## Plan Change Log

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The independent Quick reviewer verified replay inputs, complete pair coverage,
  zero-positive handling, literal floors and honest configuration/threshold/dataset limits by
  inspection. No patch, rejection, deferral or additional review is required.

## Verification

- Focused calibration Vitest first: report configuration/dataset identities, fixed thresholds,
  per-month confusion matrices, precision/recall and an explicit threshold recommendation.
  Every month's precision/recall must meet literal recorded floors; missing/duplicate pairs
  or missing replay identities fail. Preserve the current thresholds and fixture.
- Run affected existing dataset and resolution tests to verify labels/replay and rule boundaries.
- Reuse 3.6's seven real-service/browser campaigns and six coverage receipts because all
  production source, fixture bytes and dependencies remain unchanged; no new UI/API journey
  is introduced by this test-only regression gate.
- Run final `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` serially with
  `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1`; changed Markdown formatting/lint and mandatory hooks.
- One required independent Quick review by inspection, scoped to these calibration requirements.

## Auto Run Result

- Built: a repeatable native calibration gate evaluates all 36 labelled pairs across thirteen
  monthly retained-evidence states through the actual normalizer/comparison rule. Each state
  records TP=5, TN=31, FP=FN=0, precision=recall=1.0; the existing weights/configuration and
  0.90/0.50 thresholds remain fixed. Both literal regression floors are 1.0.
- Files:
  - `packages/infrastructure/src/properties/property-resolution-calibration.test.ts`: complete
    pair/input validation, actual scoring, confusion matrices, metrics and regression floors.
  - `docs/api/properties-and-locations.md`: measured configuration, reproducible verbose command
    and bounded synthetic-only interpretation.
  - `epic-properties.md`: D-093 material decision and acceptance result.
  - This plan: preserved intent, execution receipts and review verdict.
- Review: one required independent Quick pass, no findings; patches high/medium/low 0/0/0,
  deferred/rejected none, follow-up recommendation false. No unverified changed-path risk remains.
- Verification: focused calibration and dataset suites 8/8; existing domain resolution 17/17;
  verbose metrics receipt 1/1; final serial lint/typecheck/test/build all passed, 2,799 tests in
  237 files. Changed Markdown formatting/lint passed. Mandatory commit hooks run at finalization.
  Prior 3.6 service/browser and coverage receipts remain valid for unchanged runtime dependencies.
- Limits: nine synthetic identities with repeated monthly views are not independent validation
  samples or statistical calibration. No uncertain-match labels calibrate the review threshold.
  No runtime/fixture/dependency/UI change, real source, model call, deploy or publication occurred.

### Orchestrator acceptance

- Story 3.7 accepted after its built workflow, complete passing gates and independent review.
  Test commit: `45a80b1862c0d3cd5054be4ded26cf0b1db482e2`;
  verified documentation: `a97b719a860ffb75a5da7a3a2c77bf6b623ae2e0`.
  All four reviewed files were committed after the original baseline with a clean tree;
  test/document hooks passed. Only this acceptance record changed afterward.
