---
title: 'Recognized intents without a capability'
type: 'feature'
ticket: '5'
created: '2026-10-26'
status: 'built'
baseline_revision: '04819728120b19ac5549a1a6b986abb811281d43'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/home/vscode/.codex/skills/nestjs-modular-monolith/SKILL.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-12 requires a named, typed unavailable result for all five non-executable labels.
Story 5.4 retains the decision but currently reports a generic execution failure with no result.

**Approach:** Complete a gate-authorized non-price run with the closed result
`{kind: 'unavailable_intent', intent: <retained label>, reason: 'not_available'}`. Derive it in the
API repository from the immutable decision and existing unavailable execution evidence. Reuse the
graph, dispatcher, terminal/outbox/inbox and read/SSE mechanisms.

## Boundaries & Constraints

**Always:** All five labels (`listing_search`, `property_history`, `region_statistics`,
`comparables`, `unsupported`); confidence gate and retained confirmation; matching decision receipt;
existing execution/thread fences; completed terminal with null reason and durable replay. Preserve
historical price contracts, prepared examples, existing migrations and earlier evidence. Missing
price operands stay a real execution failure. No tool or generative receipt for unavailable results.

**Never:** Execute these capabilities, generate explanatory prose, call models live, add dependencies,
new graph versions/states/queues/retries/timeouts or permanent diagnostics. No public command/UI
implementation, production action, broad audit, secret access or changes outside this slice.
One heavy verification at a time on the shared VPS.

## I/O & Edge-Case Matrix

| Scenario                     | Input / State                                           | Expected Output / Behavior                                                | Error Handling                           |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| Five unavailable labels      | Each accepted non-price label, probability at least .85 | Completed named unavailable result; zero tool/model receipts              | Existing execution authority             |
| Low confidence               | Non-price probability below .85                         | Awaiting, null result; confirm same proposal to finish unavailable        | Refusal/expiry unchanged                 |
| Forged completion            | Missing/wrong receipt, grant or label evidence          | No authorized result, no side effect                                      | Existing forbidden/contract rejection    |
| Historical or missing inputs | Price tracer or routed price with no operands           | Existing price result or execution failure                                | Never mislabel as unavailable intent     |
| Replay / upgrade             | Completed unavailable run and populated prior schema    | Identical retained result, one terminal effect; prior documents unchanged | Existing idempotency and SQL constraints |

</intent-contract>

## Code Map

- `packages/domain/src/ask/intent-decision.types.ts` and its contracts mirror define the routed run.
  Omit inherited `result` and add its routed-only PriceResult/unavailable-result union; do not widen
  historical or prepared result shapes. Export via existing Ask index facades if a named type helps.
- `packages/contracts/src/ask/intent-decision.dto.ts` currently allows only `priceResultWire` and
  requires any nonnull result to have a price decision. Extend closed parsing with exact label,
  reason, completed state and gate/confirmation coherence; arbitrary model text remains forbidden.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts::completeRouted` already authenticates
  claim and decision receipt. Derive the unavailable result only from accepted non-price decision
  plus `execution-unavailable` evidence after the same gate. Preserve price receipt validation and
  failure behavior; adapt terminal replay's expected state. All side effects use existing append.
- `migrations/6006_ask_intent_decisions.sql::ask.valid_routed_run` supplies the closed SQL predicate.
  Add migration 6007 replacing only that function to permit the exact new completed variant;
  preserve all existing checks. Its callers validate both run and event documents. Never edit 6006.
- `apps/ai/src/graph/intent-routing.graph.ts`, `apps/ai/src/execution/execution.service.ts` already
  gate and emit receipt-identified unavailable evidence without a tool. Reuse unchanged if adequate.
- `integration/ask-intent-decision.integration.test.ts` owns real API/worker/AI/PG/broker, scripted
  decider, confirmation, restart and historical fences. Extend its existing scenario with all five
  named results and low-confidence non-price confirmation; retain its entire original matrix.
  `integration/fixtures/ask-intent-fixture-bootstrap.ts` supplies explicit deterministic label cases.
- Existing contract/repository/graph unit tests and `docs/ask-intent-decisions.md` cover affected
  behavior. Any price-result caller affected by union widening must narrow by kind, not cast.

## Tasks & Acceptance

**Execution:**

- [x] Domain/contracts routed types and parsers -- add and enforce the closed named variant without
      widening historical tracers; direct tests for every label, gate and malformed result.
- [x] Ask repository plus migration 6007 -- produce the fenced retained-decision result, preserve
      price/failure behavior and support durable replay; unit-test affected transitions.
- [x] Existing routed integration and scripted fixture -- prove five unavailable results, zero
      receipts, confirmation without reclassification, HTTP/events/replay and populated SQL upgrade.
      Keep all existing matrix assertions; narrow necessary price callers explicitly.
- [x] Existing operational doc and this plan -- update the former 5.4 limitation and record concise
      observed verification; no duplicate report or routine decision-ledger entry.

**Acceptance Criteria:**

- Given each of the five non-price decisions, when a real routed run passes its gate, then its live
  HTTP read and durable terminal event contain the same completed, intent-named unavailable result,
  with no model-generated answer, price tool receipt or explanation receipt.
- Given a below-gate non-price proposal, when the visitor confirms its retained decision, then the
  same run completes with that label and zero tool/model effects without another decider call;
  before confirmation its result remains null and refusal/expiry still prevent execution.
- Given forged execution evidence or malformed result JSON, when crossing the API/contract/SQL
  boundary, then it is rejected and no terminal effect is manufactured. Replaying a valid terminal
  preserves one result, terminal event, outbox and inbox effect.
- Given populated pre-6007 data and the unchanged price paths, when upgrading and exercising the
  routed campaign, then historical documents survive unchanged, golden price still completes and
  missing operands still fail with a null result.

## Implementation Notes

- Routed domain/contracts now own `PriceResult | UnavailableIntentResult | null`; historical and
  prepared shapes stay unchanged. Closed parsing binds the five allowed labels to the retained
  decision and confidence/confirmation gate, and rejects extra fields or explanatory text.
- The API derives the result from existing receipt-identified unavailable evidence, preserving
  execution/thread authority and the existing atomic terminal event/outbox/inbox path. Receipt
  mismatch is rejected before terminal replay. Existing failed non-price terminals replay unchanged;
  newly authorized non-price work completes with the named result. Missing price operands still fail.
- Additive migration 6007 replaces only `ask.valid_routed_run`; migration 6006 is unchanged. Its exact
  unavailable object is checked for both retained runs and event documents through existing callers.
- The existing campaign preserves its original scenarios and adds five-label HTTP/SSE/restart replay,
  zero tool/model receipts, one terminal effect, malformed SQL documents, retained non-price
  confirmation without a second decision, and a populated 6006-to-6007 upgrade retaining completed
  historical price documents/receipts/events and failed non-price evidence. Price-only integration
  callers now narrow the result by `kind`.

## Plan Change Log

- The first final routed attempt (`rei-intent-b2f45716-4eae-4c98-8512-4e2c1c4fbd2a`) exhausted
  the unchanged 600-second deadline after serial cold image preparation. Populated-upgrade,
  historical-price receipt/document/event preservation and failed non-price replay assertions passed;
  the complete delivery matrix was not established. All owned containers were reaped.
- Reused the existing readiness/prefix image-preparation pattern: a narrow serial script prepares
  migrations/API/AI/worker images before the bounded test, which tags them into its unique fixture.
  Standalone and aggregate pnpm paths include preparation. No product timeout, retry, assertion or
  generalized fixture abstraction changed. Cleanup removed the timed-out project images, and newer
  local images had no established source identity, so one serial preparation through the corrected
  command produces the final images before the bounded acceptance run.

Acceptance matrix audit: the final routed campaign observes all five labels over HTTP and SSE,
including zero receipts and restart replay. It covers retained low-confidence confirmation and
preserves refusal/expiry assertions. Contract/repository cases and SQL tampering cover forged or
malformed completions. Populated pre-6007 snapshots preserve historical documents and receipts;
golden price and missing-input behavior pass. Terminal replay verifies one durable terminal effect.

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Completed unavailable replay accepts contradictory price-calculated
    evidence — the terminal branch maps any price outcome to completed before retained-intent and
    stored-receipt checks, so the controller returns success despite the explicit forged-evidence
    rejection criterion. Bind replay to the retained result kind/intent with a direct forbidden,
    no-effects regression. The implementation now binds completed replay to the retained result
    kind/intent and preserves genuine unavailable and historical failed replay. All five contradictory
    price cases reproduced before the fix; the affected 34-test repository file passes after it.

## Design Notes

Estimated change exceeds 100 lines across typed contracts, repository, additive SQL and proof, so
full route applies. Risk rises from low to medium because this changes durable completion semantics.
A completed unavailable result is a successful bounded answer about capability, distinct from an
executor failure. Existing unavailable evidence already identifies the immutable routing decision;
no new graph outcome or result authority is necessary. D-012 / ADR 0020 override Nest example stack;
the owner requires existing BMAD planning and autonomous handoffs, without interactive confirmation.
The parent owns commits, independent quick review and ticket closure. The implementer must not
commit, push, delegate further or repeat unchanged campaigns merely for confidence.

## Verification

**Commands:**

- Scoped Vitest tests for contracts/repository/affected callers first -- all closed-result cases pass.
- `pnpm run build`, `pnpm run typecheck`, `pnpm run lint`, sequential -- no contract/SQL
  convention gaps.
- `pnpm run test:integration:ask-intent` (serial image preparation, then the unchanged bounded
  `pnpm exec vitest run --config vitest.integration.config.ts integration/ask-intent-decision.integration.test.ts`)
  -- entire final routed matrix passes with all new five-label assertions and preserved old scenarios.
- `pnpm run test:coverage` -- eight independent existing floors remain unchanged; retain valid results
  from unchanged packages if dependency identity allows, run affected workspaces sequentially.
- Prettier and markdownlint on owned files; normal hooks -- pass.

**Observed evidence:**

The first passing full campaign and eight-workspace coverage below precede the review correction.
They remain historical evidence. Only the infrastructure repository and its direct regression
changed afterward; the other seven workspace coverage results remain applicable. Final build,
typecheck, lint, infrastructure coverage, prepared images and the complete routed campaign are
refreshed for the corrected version below.

- Direct contract cases (9 tests), Ask repository suites (51 tests), and routed graph tests (5 tests)
  passed. The complete contracts suite passed 285 tests. Final product build, recursive and strict
  integration typechecks, ESLint, context boundaries and migration conventions passed.
- Serial `pnpm run test:integration:prepare-ask-intent` passed for the final source and unchanged
  dependency lockfile. The subsequent bounded command passed the complete routed scenario in
  162.73 seconds (166.73 seconds total), preserving the original 600-second timeout and full matrix.
  Project: `rei-intent-fdadd434-3331-4387-b3dd-77c70fdf0f9b`; all owned containers were removed.
- Prepared final image identities (tagged into that unique fixture without rebuilding):
  - migrations: `sha256:55fcc29b700b7276ca80a93aae6ab42c3d4eee170599b131fdd1243b42f838d4`
  - API: `sha256:6a37373a79fad04412c337a6911568b0f360d0213e1f3d90e8960a539009552c`
  - AI: `sha256:186b7fc98b0493dcd41550c9344c3e02ff9ed6fb1083579e47e2d0b224645153`
  - worker: `sha256:052fe3f989f752196e1bbb7cbe018672d4f6a3c3981deb95689263deb799fd0e`
- Product source and dependencies did not change between these image builds and the passing
  campaign. Root manifest changes are verification scripts only; no package or lockfile dependency
  changed. Later plan/document formatting does not require another product build or campaign.
- Final source/dependency tree fingerprint:
  `sha256:0a7d5ec6e14fdb83d0727e3cb437532cc9ec8b3ceca94459ec097abcefb1a114`.
  It hashes sorted tracked
  paths and bytes under `apps`, `packages`, `migrations`, `docker`, root package/lock/workspace and
  TypeScript manifests, plus migration 6007; no runtime/dependency file changed after final preparation.
- `pnpm run test:coverage` exited 0: 256 files and 3,086 tests across all eight workspaces. Existing
  per-workspace thresholds stayed at statements/lines/functions 80% and branches 75%.

| Workspace      | Tests | Statements | Branches | Functions |  Lines |
| -------------- | ----: | ---------: | -------: | --------: | -----: |
| contracts      |   285 |     90.68% |   89.69% |    92.50% | 92.65% |
| domain         |   697 |     95.36% |   91.03% |      100% | 96.24% |
| AI             |   270 |     93.21% |   87.15% |    91.08% | 95.66% |
| web            |   549 |     95.97% |   91.10% |    96.54% | 97.19% |
| application    |   293 |     91.25% |   90.20% |    95.60% | 92.65% |
| infrastructure |   535 |     83.29% |   76.92% |    89.28% | 85.13% |
| API            |   215 |     94.45% |   85.47% |    97.69% | 95.59% |
| worker         |   242 |     93.50% |   83.30% |    90.54% | 94.85% |

- After the preparation correction, targeted fixture ESLint and strict integration typechecking
  passed. Shell syntax, owned Prettier/markdownlint and the normal pre-commit jobs passed using an
  explicit owned-file list with automatic staging disabled. The hook's staged secret scan saw an
  empty index; the parent retains staging, final secret scanning, independent review and commits.

### Review correction verification

- The five contradictory price-outcome cases reproduce on the prior implementation and pass after
  the result-kind/decision-intent replay guard. The direct repository file passes all 34 cases;
  inspection confirms valid unavailable and legacy failed replay remain supported. No new public
  surface or terminal state was added. One independent quick pass; subsequent review is limited to
  this corrected behavior.
- Final product build, recursive/strict-integration typecheck and root lint pass after the correction.
- Infrastructure coverage passes all 535 tests in 51 files: statements 83.32%, branches 77.00%,
  functions 89.28%, lines 85.16%, with unchanged floors. The other seven workspaces and their tested
  dependencies are unchanged; their passing coverage above is reused. Final total remains 3,086.

- The corrected final full routed campaign passes: 179.62 seconds of tests / 183.27 seconds total,
  unchanged 600-second deadline, project `rei-intent-a8c80281-4eb6-4bfd-b829-c0c34a29d1af`.
  All original and new assertions remain active; owned containers and volumes are absent afterward.
- Corrected final prepared images: migrations
  `sha256:55fcc29b700b7276ca80a93aae6ab42c3d4eee170599b131fdd1243b42f838d4`, API
  `sha256:454fa3254531a12a428133cd9704388a70d01d7a2ecfc23f6269514afceda0e5`, AI
  `sha256:186b7fc98b0493dcd41550c9344c3e02ff9ed6fb1083579e47e2d0b224645153`, worker
  `sha256:74cea5ec4ea9af0d9984abc2931aa0a282fed4d3fef2bc658fefe28cd1a77f7b`.
- Corrected source/dependency fingerprint:
  `sha256:a889c6644ffe8f74d6d8378160b6f5624b796c0bf2238a2b3fbdedffa5772fcd`.
  For each sorted tracked product/dependency path, the hash consumes path, NUL, file bytes, NUL;
  scope is apps/packages/migrations/docker and root package, lockfile, workspace and TS manifests.
  Final verification logs remain `/tmp/rei-unavailable-reviewed-final-campaign.log`,
  `/tmp/rei-unavailable-final-infra-coverage.log`, and the corresponding final build/typecheck/lint
  and image-preparation logs. Later Markdown-only updates reuse this product evidence.

## Auto Run Result

Completed all five recognized non-price labels with an exact typed unavailable result, preserving
confidence/confirmation gates, authority, historical price documents and durable effects.

Files changed:

- `packages/domain/src/ask/intent-decision.types.ts` — routed-only unavailable result union.
- `packages/contracts/src/ask/intent-decision.types.ts` — matching closed public shape.
- `packages/contracts/src/ask/intent-decision.dto.ts` — exact label/result/gate parsing.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` — fenced completion and compatible replay.
- `migrations/6007_ask_unavailable_intents.sql` — additive closed SQL validation upgrade.
- `packages/contracts/src/ask/intent-decision.dto.test.ts` — all five result contract cases.
- `packages/infrastructure/src/ask/intent-decisions.pg-repository.test.ts` — terminal/gate/replay cases.
- `integration/ask-intent-decision.integration.test.ts` — full real routed delivery and upgrade proof.
- `integration/fixtures/ask-intent-fixture-bootstrap.ts` — deterministic non-price decision labels.
- `integration/ask-checkpoints.integration.test.ts` — explicit price-kind narrowing.
- `integration/ask-delivery.integration.test.ts` — explicit price-kind narrowing.
- `integration/ask-price-run.integration.test.ts` — explicit price-kind narrowing.
- `integration/ask-text-price-run.integration.test.ts` — explicit price-kind narrowing.
- `scripts/prepare-ask-intent-images.sh` — serial image preparation outside bounded delivery.
- `package.json` — standalone and aggregate preparation commands.
- `docs/ask-intent-decisions.md` — current unavailable behavior, replay and verification command.
- This plan — acceptance, one independent review, correction and observed final evidence.

Review: one medium patch applied, zero high/low patches, zero deferred or rejected findings.
Follow-up review recommendation: false. Targeted inspection and the five forbidden/no-effects
regressions resolve the reported replay mismatch; no specific unverified changed risk remains.

Verification: direct affected cases, final build/typecheck/lint, final full routed campaign, final
infrastructure coverage and seven unchanged workspace coverage results pass. Normal commit hooks
remain mandatory. No live model, UI, public generic command, production or optional audit is claimed.

Commit hooks for implementation `a08f07f` and tests `aafb758` pass, including staged secret
scans, formatting, ESLint, shell syntax and Conventional Commits. All 15 owned non-documentation
files retain the exact bytes verified in the final campaign; no product verification is repeated
for the following Markdown-only finalization.
