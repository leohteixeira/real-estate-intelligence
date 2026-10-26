---
title: 'Evaluation pack and live probe'
type: 'feature'
ticket: '13'
created: '2026-10-26'
status: done
baseline_revision: '70c1ab6ac331f40f8956e90d43baebccaa31ff40'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-17 has substantial behavioral tests, but no measured Jev/heuristic
comparison. Its optional live probe lacks accuracy, latency and cost reporting and
strict TypeScript coverage.

**Approach:** Reuse versioned public fixtures and existing adapters in a small offline
evaluation pack. Upgrade the existing explicitly enabled probe with sanitized,
honest measurements and a testable invocation boundary.

## Boundaries & Constraints

**Always:** Default tests and CI remain offline. Preserve ZDR verification before
classification, zero SDK retries, original deadlines and typed failure handling.
Report cost coverage, including privacy-probe calls; absent provider cost is
unavailable, never an invented zero. All measurements exclude keys, query text,
response bodies, arbitrary metadata and raw errors. One heavy operation at a time.

**Never:** Change production decision, graph, persistence or resilience behavior;
add billing/catalog requests, guessed pricing, new dependencies or reports;
read `.env*`; run live generative calls or a new persistence campaign.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                            | Expected Output / Behavior                         | Error Handling                                 |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Offline comparison | Versioned PT/EN rows and fake Jev                        | Accuracy, confidence, latency and cost comparison  | Failed decisions remain in denominator         |
| Cost evidence      | Valid numeric gateway cost, absent or malformed metadata | Validated scalar totals with explicit coverage     | Unknown spend stays unavailable                |
| Default CLI        | No explicit live switch, even without a build            | Opt-in instruction; no provider initialization     | No key required                                |
| Missing key        | Explicit live switch without key                         | Sanitized failure before provider initialization   | Nonzero exit                                   |
| Live probe         | Explicit switch and key; two fixed synthetic PT/EN rows  | Sequential bounded decisions and sanitized metrics | ZDR/failure remains visible; no false accuracy |

</intent-contract>

## Code Map

- `apps/ai/src/models/fixtures/ask-intents-v1.ts`: reuse 14 labeled rows;
  `intent-decider.ts`: `heuristicDecision`, `GatewayIntentDecider` and its injected
  `sdkDecide` constructor argument permit measurement without a production observer.
- `apps/ai/scripts/probe-intent-decision.ts`: preserve public invocation path;
  use guarded loading so default invocation needs no build/provider work.
- `packages/domain/src/ask/model-explanation.test.ts`: existing
  `price-explanation-facts-v1` valid/adversarial PT/EN dataset; extract reusable
  fixture only as necessary, preserving assertions.
- `apps/ai/src/models/intent-decider.test.ts`,
  `apps/ai/src/graph/intent-routing.graph.test.ts`: reuse invalid output and
  below/exact/above 0.85 proofs; extend existing boundary matrix only if needed.
- `apps/ai/src/models/receipt-model-explainer.test.ts`,
  `apps/ai/src/shared/ai-policy-matrix.test.ts`,
  `apps/ai/src/models/receipt-model-resilience.test.ts`: reuse explanation and
  failure-policy proofs without changing mechanisms.
- `integration/ask-intent-decision.integration.test.ts`,
  `integration/ask-checkpoints.integration.test.ts`,
  `integration/ask-model-explanation.integration.test.ts`,
  `integration/ask-delivery.integration.test.ts`: unchanged real-service proofs
  of checkpoint/confirmation/restart/idempotency; retain prior evidence.
- `apps/ai/package.json`, `tsconfig.integration.json`,
  `docs/ask-intent-decisions.md`: expose opt-in command, include every probe in
  strict checking, document required metrics and reused evidence concisely.

## Tasks & Acceptance

**Execution:**

- [x] `apps/ai/src/models/fixtures/ask-intents-v1.ts` and domain explanation
      fixtures/tests: retain versioned public datasets with safe case identifiers.
- [x] `apps/ai/src/models/` evaluation module and tests: compare fake Jev with
      existing heuristic; verify arithmetic, failures, confidence and cost coverage.
- [x] `apps/ai/scripts/probe-intent-decision.ts` and reusable AI runner/tests:
      enforce explicit opt-in and sanitized sequential measurement through the existing
      adapter; include both physical phases without changing business contracts.
- [x] `apps/ai/package.json`, `tsconfig.integration.json`: add a discoverable
      opt-in command and strict probe checking without weakening existing gates.
- [x] `docs/ask-intent-decisions.md`: record concise usage and evidence mapping;
      identify unavailable live evidence honestly.

**Acceptance Criteria:**

- Given no provider credentials or network, when repository `pnpm test` runs,
  then the versioned decision/explanation pack passes with fakes and proves
  accuracy/confidence/latency/cost arithmetic and incorrect/failed outcomes.
- Given the public probe command without `--live`, when invoked from a checkout,
  then it exits successfully without loading provider code or requiring a build.
- Given explicit `--live` with no key, when invoked, then it fails safely before
  provider initialization and exposes no supplied environment values.
- Given explicit `--live` with the configured key, when the bounded synthetic
  PT/EN probe runs, then its output measures accuracy and latency and reports
  observed cost or explicit unavailable coverage, including privacy calls;
  provider/privacy failure is observed rather than presented as a passing probe.
- Given root type checking and affected coverage/build/lint gates, when run on
  the stabilized version, then scripts and affected workspaces pass without skips,
  automatic retries, weakened assertions or increased timeouts.

## Implementation Notes

- Added stable identifiers to the existing 14 intent rows and extracted the public
  `price-explanation-facts-v1` corpus without changing its valid/adversarial assertions.
- Measurement stays outside production decision, graph, persistence and resilience behavior.
  The probe wraps the injected SDK call and retains only scalar cost and latency per physical
  phase. Failed cases remain in accuracy/confidence expectation denominators.
- The CLI guards opt-in and key presence before dynamically loading the built runner. Strict
  integration TypeScript now includes `apps/ai/scripts/probe-*.ts`; existing integration probes
  retain their original coverage. The separate generative provider key checker is unchanged.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; independent quick inspection returned an empty findings list.

## Verification

- Run directly affected offline tests first, then affected AI/domain coverage
  through existing scripts. Reuse results of unchanged workspaces and integration
  dependencies; do not restart Docker for unchanged proofs.
- Run repository build, strict typecheck, lint and changed-file formatting gates
  sequentially. Verify actual default CLI and missing-key invocation.
- Run exactly one bounded explicitly enabled live Jev probe using authorized
  process environment loading; retain only sanitized results and observed limits.
- Obtain one required independent quick review of the final diff and affected risks.

### Recorded implementation evidence

- Direct offline tests: new AI evaluation/probe tests passed (22 cases on final version);
  extracted domain explanation fidelity tests passed (45 cases).
- Root `pnpm test`: passed all 3,198 tests across 259 files and eight workspaces, offline.
- Affected coverage ran sequentially using the exact flags, exclusions and thresholds from
  `scripts/test-coverage.sh`, filtered to `@rei/domain` and `@rei/ai`: domain 96.27% lines /
  91.06% branches; AI 96.01% lines / 89.36% branches. Targeted evaluation/probe module coverage
  also passed at 100% statements, branches, functions and lines.
- Final `pnpm run build`, `pnpm run typecheck` and `pnpm run lint`: passed sequentially.
  Existing web bundle size advisory remains unchanged. Changed-file Prettier check and
  `pnpm exec markdownlint-cli2 --no-globs docs/ask-intent-decisions.md`: passed.
  An initial markdownlint command without `--no-globs` also selected generated BMAD caches and
  reported their existing formatting issues; the correct changed-file command passed.
- Actual `pnpm --filter @rei/ai probe:intent`: passed without opt-in. Actual
  `AI_GATEWAY_API_KEY= pnpm --filter @rei/ai probe:intent --live`: expected sanitized exit 1
  before provider loading. Fresh-process tests additionally prove these guards with no build
  or provider modules present and redact initialization failures.
- Exactly one authorized live invocation ran on 2026-10-26:
  `node --env-file-if-exists=.env apps/ai/scripts/probe-intent-decision.ts --live`.
  Only Node loaded the authorized environment file; the agent did not inspect its contents.
  Exit 1, `passed: false`: both fixed cases failed with typed `policy` during privacy;
  2 privacy calls, zero classification calls, zero retries. Privacy was not verified.
  Elapsed total 1,152.740239 ms, mean 576.3701195 ms, nearest-rank p95 925.791613 ms.
  Both calls lacked cost evidence: observed/total USD are unavailable (`null`), not zero.
  Live classification accuracy/confidence remain unmeasured; reported case accuracy 0 reflects
  the two failures in the denominator. The fixed-case heuristic returned 2/2 correct.
- No generative live calls, new persistence campaign, production mechanism changes, new
  dependencies, commits or remote operations were performed.
- Required independent quick review passed with zero findings; parent read the complete diff
  and matched all five matrix rows to the executed evaluation/probe tests.

## Auto Run Result

- Implemented reusable versioned intent/explanation fixtures, offline measured comparison and
  an explicitly guarded synthetic live probe. Production adapters and business behavior are unchanged.
- Files: intent fixtures/evaluator/probe and public CLI implement the pack; AI package command
  and root integration tsconfig expose/check it; domain fixtures/tests preserve fidelity;
  AI tests prove measurements and guards; usage documentation records evidence and limits.
- Independent quick review: zero findings, zero patches, zero deferred/rejected items.
  Follow-up review is not recommended; review loop remains zero.
- Final offline verification: 3,198 tests; affected coverage, build, strict typecheck, lint,
  formatting and Markdown gates passed. Existing persistence evidence is reused unchanged.
- One live attempt failed policy before either classification; no live classifier accuracy
  or billed spend is claimed. This is an observed provider/privacy evidence limit, not a
  reason to loosen the product privacy contract or repeat the probe.
- No optional improvement or material architecture decision was introduced.

- Delivery revision: `e4721f3d1e0459fd4b82a614a351b15026d0704a`. All 13 reviewed
  paths are committed after the baseline, non-Markdown identities remain unchanged through
  normal hooks, and the working copy was clean before ticket closure. Story 5.13 is done;
  no push or deployment was performed for this evaluation-only slice.
