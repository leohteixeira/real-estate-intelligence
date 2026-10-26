---
title: 'Typed decision with the confidence gate'
type: 'feature'
ticket: '4'
created: '2026-10-26'
status: 'built'
baseline_revision: '2c5ebe51a9ee0a77e1b1cb0fc5fba4f7d0bb8a39'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/AGENTS.md'
  - '/home/vscode/.codex/skills/nestjs-modular-monolith/SKILL.md'
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0008-typed-query-routing-with-jev.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The durable text tracers assume a price intent and require operands before routing.
CAP-11 needs a typed decision and an enforceable confidence gate, without changing historical runs.

**Approach:** Add a versioned routed-text mode, an application-owned `IntentDecider` with Gateway
Jev and deterministic degraded fallback, and an API-owned durable decision receipt. Pause below
0.85; explicit confirmation resumes the same proposal without classifying again.

## Boundaries & Constraints

**Always:** Closed ADR 0008 taxonomy; chosen-label probability; deterministic Market operands and
arithmetic; API-only database authority; claim/grant/checkpoint fences; thread admission order and
three-total-pending limit; truthful SSE; D-100 fixed ten-minute PostgreSQL confirmation deadline.
Preserve all three historical mode/graph discriminators and existing migrations. Reuse receipt,
deferred delivery, remote saver and privacy-verification patterns. One heavy verification at a time.

**Never:** Route historical tracers through Jev; execute before gate satisfaction; call a decider
again after an accepted decision; infer missing numbers; give AI database/broker/storage access;
transmit user-derived content before verified Gateway ZDR evidence; introduce provider retries,
nonprivate fallback, payload telemetry, new dependencies or a reporting layer. No `.env*` access,
production changes, live model calls, generic public command/client implementation (5.8), typed
unavailable results (5.5), generative explanation or Ask screen integration in this slice.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                 | Expected Output / Behavior                   | Error Handling                 |
| ------------------------------ | --------------------------------------------- | -------------------------------------------- | ------------------------------ |
| Boundary                       | Price probability 0.85, valid operands        | Deterministic price tool executes            | Existing receipts              |
| Low confidence                 | Probability below 0.85                        | Durable proposal, awaiting, zero computation | No fabricated receipt          |
| Confirm                        | Authorized retained proposal, before deadline | Same intent; validated editable operands     | No second decision             |
| Refuse / expire                | Awaiting refusal / deadline reached           | Cancelled / expired, no later tool           | D-100 terminal reasons         |
| Provider unavailable           | Gateway/privacy evidence unavailable          | Versioned heuristic, degraded, same gate     | No unsafe transmission         |
| Invalid output / abort         | Invalid distribution / cancellation           | Reject output / stop execution               | No unsafe authorization        |
| Other label / missing operands | Gate satisfied but no executable price input  | Retain decision, no price effect             | Existing execution_unavailable |

</intent-contract>

## Code Map

- `packages/domain/src/ask/ask-live.types.ts`, `run-execution.types.ts`,
  `graph-checkpoint.types.ts` and `packages/contracts/src/ask/` own closed live/run/saver shapes.
  Prepared preview commands are models, not live handlers. Preserve historical discriminators.
- `packages/application/src/ask/ask-run.service.ts` currently extracts before admission;
  `consume-ask-run-request.service.ts` assumes final price evidence. Add routed admission and
  explicit paused evidence without inventing price inputs or treating pause as failure.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` owns transitions; reuse
  `lockAskThread()` / `authorizeAskExecution()` and existing fingerprinted replay. Include awaiting
  in every pending/head predicate, never reclaim it into running before explicit confirmation.
- `packages/infrastructure/src/ask/model-explanation.pg-repository.ts` and model explainer
  demonstrate API-owned retained get/reserve/accept receipts. Decision is a separate receipt,
  not an explanation or tool receipt. Authorize price tools against persisted decision/gate.
- `apps/ai/src/graph/`, `apps/ai/src/execution/execution.service.ts`, remote checkpoint saver and
  `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts` own graph recovery.
  Retained decisions precede checkpoints; persist the stopping checkpoint while lease is valid,
  then finalize pause at the dispatch boundary. Resume a paused checkpoint as pending work.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` already transfers
  deferred delivery to the source queue with publish confirmation, preserving identity and genuine
  failure attempts. Reuse it; do not ack away the only wakeup or introduce a new dispatch identity.
- `apps/api/src/ask/` composes facades, internal execution/receipt/tool/saver routes and bounded
  queue maintenance. Extend maintenance for confirmation expiry with the worker stopped.
- `apps/ai/src/models/gateway-privacy.verifier.ts` verifies routing acknowledgement after a
  fixed public probe. Reuse a minimal neutral projection for decision response metadata.
  Installed `ai@7.0.137` / `@ai-sdk/gateway@4.0.94` support typed decision/evaluation aliases;
  selected probability is distinct from provider confidence. SDK retry default must be disabled.
- `integration/ask-*.integration.test.ts`, `integration/support/ask-campaign.ts` and checkpoint
  fresh-process probe provide real services, restart, upgrade and synthetic fixture mechanisms.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/ask/`, `packages/application/src/ask/` -- define vendor-free decision
      port, closed result/provenance and routed commands/evidence; reuse deterministic Market
      validation and expose confirm/refuse in the application facade -- enable CAP-11 without 5.8.
- [x] `packages/contracts/src/ask/`, `migrations/` -- add closed routed
      shapes and the next additive migration after 6005; preserve populated historical constraints
      and separate original inputs, accepted decision, confirmation, pause deadline and terminal reason.
- [x] `packages/infrastructure/src/ask/`, `apps/api/src/ask/` -- persist/fence decision receipts,
      tool authorization, pause/confirm/refuse/expiry, ordered pending claims and bounded maintenance;
      reuse internal authenticated routes and deferred delivery -- survive crashes and race outcomes.
- [x] `apps/ai/src/graph/`, `apps/ai/src/execution/`, `packages/application/src/ask/consume-ask-run-request.service.ts`
      -- add a separately versioned routing graph, retained decision recovery and explicit pause result;
      keep authority out of checkpoints and reuse the existing price tool -- no second classification.
- [x] `apps/ai/src/models/`, `apps/ai/src/` composition -- implement Gateway Jev over closed
      criteria, validated probabilities, verified ZDR probe, single attempt and bounded cancellation;
      deterministic PT/EN heuristic with versioned provenance -- same gate on degraded paths.
- [x] `apps/ai/` tests and versioned evaluation fixtures, `integration/ask-intent-decision.integration.test.ts`
      -- cover matrix, offline taxonomy evaluation, opt-in live probe, real pause/restart/confirm,
      refusal/expiry races, ordering and preserved historical upgrades -- reuse existing harnesses.
- [x] `specs/adrs/0008-typed-query-routing-with-jev.md`, `docs/`, epic Notes and this plan -- record
      D-100, operational boundary and observed evidence concisely; preserve prior evidence.

**Acceptance Criteria:**

- Given the real application composition and fake deciders at 0.85 and below, when routed requests
  execute, then the first computes the golden price and the second persists awaiting confirmation
  with zero tool/explanation receipts, observable through persisted run/event reads.
- Given an awaiting run and retained decision, when services restart and an authorized visitor
  confirms before expiry, then execution uses the same label and validated operands exactly once,
  without another decider invocation; another thread continues while this thread remains ordered.
- Given an unavailable primary, when deterministic fallback returns either side of the gate, then
  persisted degraded provenance and execution/pause follow the same threshold; malformed output,
  absent privacy proof and cancellation never silently authorize unsafe work.
- Given awaiting work, when refusal or expiry races confirmation under the database clock, then
  one durable transition wins, deadlines never renew and no tool runs after cancellation/expiry;
  bounded API maintenance expires waiting work with the worker stopped and releases successors.
- Given populated historical tracers, when applying the additive migration and affected campaigns,
  then retained runs/checkpoints/SSE/provenance and existing three-mode behavior remain valid.

## Implementation Notes

- Added independent `routed-text-v1` / `intent-routing-v1` discriminators. Decisions use immutable
  API get/reserve/accept receipts. A dynamic graph interrupt is checkpointed under the active lease;
  dispatch then persists the pause and defers the original delivery. Confirmation resumes pending
  work with fresh grants. No new queue identity, dependency, public command or reporting layer.
- Original Market operands remain separate from validated confirmation operands. Awaiting work
  participates in admission capacity/order. The first PostgreSQL pause fixes D-100's deadline;
  thread locking resolves confirmation/refusal/expiry and bounded API maintenance releases it.
- Observed pinned SDK gap: `ai@7.0.137` normalizes decision state to typed content parts, while
  `@ai-sdk/gateway@4.0.94`'s typed `evaluation()` alias exposes `doEvaluate` with string/JSON state
  (its provider package is 4.0.18 versus the AI SDK's 4.0.26). Direct assignment failed TypeScript.
  A text-only, statically checked `doDecide` bridge projects normalized text into `doEvaluate`;
  it introduces no casts or dependency changes. Real SDK/offline HTTP tests verified the
  `/evaluation-model` wire body, fixed criteria, ZDR options, chosen-label distribution, two-call
  probe/classification ordering and one SDK attempt. The initial SDK matrix passed 33 tests.
- Provider warnings are rejected before the SDK can log provider-supplied text. Missing/false
  privacy acknowledgements prevent the user-bearing request; invalid output and caller abort
  cannot silently select the heuristic. The explicit live probe was added but not run.
- Receipt comparisons use key-order-independent deep equality because PostgreSQL JSONB reorders
  keys across the API/AI transport. Historical upgrade digests exclude only the new nullable
  confirmation-deadline metadata; historical documents and original predicates remain intact.
- Initial full build passed. Typecheck exposed widened historical execution unions and facade
  doubles; historical callers now narrow explicitly and the execution service retains a typed
  historical overload. Final verification results are recorded below when complete.

- Crash recovery correction: a durable interrupted checkpoint can precede dispatch's pause commit.
  A replay with no API-retained confirmation now returns the existing awaiting evidence instead of
  sending a resume command; only retained confirmation authorizes resume. The source graph matrix
  passed 5 tests including replay, edited operands, lost accept acknowledgement and malformed output.
- Returned decider values are validated at the graph boundary. A non-finite selected probability
  now produces the existing rejected failure (HTTP 400), with no accepted receipt or tool call.
  Only contract parsing is translated; adapter transport and cancellation failures retain their
  existing classification. The direct regression passed. The final affected AI build, AI typecheck,
  integration TypeScript and scoped ESLint passed after this correction.
- The initial real campaign failed during concurrent AI/worker image export at the fixture's
  240-second build deadline; fresh migration 6006 succeeded but no routing acceptance was claimed.
  Owned resources were cleaned. Subsequent fixture builds serialize AI then worker. The final
  campaign rebuilds images after the interrupt and malformed-output corrections; the scripted
  decider replaces only that capability and uses the freshly built production AI application.

- The second campaign (`rei-intent-3e19bb50-7dbd-45ff-8d26-d71777e8d853`) reached the unchanged
  600-second scenario limit during preparation, before acceptance assertions. BuildKit history
  records API build 164 seconds, AI build 229 seconds, and successful worker compilation/deploy
  in 100 seconds followed by cancelled runtime COPY. Ryuk removed its owned resources/images.
  Runtime/test sources stayed frozen (48-file SHA256 manifest
  `37c663ff70ce132117a378b83b9131e58f8a1514950639d8003d42808b582e64`); scoped Prettier passed.
  The next execution condition separates serial preparation under an owned preparation project
  from the bounded unchanged scenario, retaining BuildKit layers and prepared image identities.

- Final routed campaign passed in 132 seconds with warm prepared layers:
  `rei-intent-4de12761-8a3d-42b2-a7fe-d526cb479e05` (Vitest session 96681). Production API/worker,
  PostgreSQL/RabbitMQ and the freshly built production AI AppModule exercised the complete routing
  matrix with only the IntentDecider capability replaced. It proved .85 golden execution, durable
  below-gate pause with zero tool/explanation receipts, API/AI restart, edited-input confirmation
  without reclassification, ordering/capacity, both degraded outcomes, malformed rejection,
  refusal/confirmation and expiry races, SQL-only observation of API maintenance with worker
  stopped, successor release and retained historical constraint/authentication fences. Cleanup passed.
  Prepared image IDs: API `2c9ae75c71a0`, AI `7782531ed22d`, worker `71d0a49aaaef`, migrations
  `6d80f27888da`. Frozen runtime/test manifest remained unchanged throughout.

- Historical structured tracer passed (1 test, 119 seconds); text-price plus populated upgrade passed
  (2 tests, 124 seconds). Explanation regression passed its first 12 scenarios, then exposed an
  executor defect in historical preparation: today's repository was being called before migration
  6006 against an intentionally pre-6005 schema. Preparation now follows the existing checkpoint
  upgrade fixture's explicit historical SQL model, retaining queued/running events, admission,
  idempotency/outbox identity and grants. It executes the same native graph before upgrade and
  preserves every post-upgrade digest/recovery assertion. Integration typecheck and scoped lint
  passed; the directly failed populated-upgrade case passed in 48 seconds. The other 12 cases are
  reused without a confidence-only rerun. Runtime sources are unchanged; only this fixture changed.

- Historical checkpoint campaign retained 5 passing scenarios: automatic worker/AI SIGKILL recovery,
  grant fencing, fresh-process native pause/reclaim/retention and populated historical upgrade.
  Isolated API SIGKILL exposed a fixture timing assumption: API readiness took 6.4 seconds, longer
  than the existing five genuine one-second redeliveries. ADR 0025/0026 intentionally sends exhausted
  delivery to DLQ and leaves the run recoverable. The API fixture now demonstrates that boundary,
  observes the original message at attempt 5 with zero tool receipts, then performs explicit
  operator-assisted recovery after readiness using the existing mandatory confirmed transfer of
  identical message bytes/properties. It acknowledges DLQ only after confirmation. Automatic
  worker/AI recovery and every API identity, receipt, native checkpoint, outbox and SSE assertion
  remain unchanged; no runtime retry, attempt reset or timeout change was introduced.
  Formatting, integration TypeScript and scoped lint passed. The affected API restart scenario
  passed in 62 seconds (`rei-ask-checkpoints-f34c4dd9-b16a-40ac-8b6d-bd0db21dd2d4`), including
  observed attempt-5 exhaustion, readiness, explicit same-message recovery and all retained assertions.
  Runtime sources/images remain unchanged. The two narrow historical fixture corrections are
  captured by the final 49-file source manifest
  `77165f874f972ae6ef535608298851b80dd0f88e321677e253cd0346b35ae80e`.

- Verification gates: root build, root typecheck (including integration TypeScript) and root lint
  passed. After the final malformed-output correction, affected AI build/typecheck, integration
  TypeScript and scoped lint passed. Unchanged SDK/adapter tests passed 53 cases; the final graph
  matrix passed 5. Contracts passed 4 and API decision/live controllers passed 25 tests. The two
  later historical fixture-only corrections each passed formatting, integration TypeScript and
  scoped lint before their direct regression; they do not change production build dependencies.

- Historical delivery campaign passed all 4 tests in 295 seconds, including ordered admission,
  capacity/replay, SQL expiry/rollback/cancellation, production prefetch-one progress and genuine
  attempt-5 DLQ with retained recovery. Frozen source formatting also passed after both fixture
  corrections.

- The mandatory coverage campaign passed contracts, domain, AI, web and application independently.
  Infrastructure tests passed but initially missed the unchanged 80% statement / 75% branch floors
  (79.46% / 72.08%): real integration coverage is not part of that unit instrumentation. Added 27
  focused repository tests covering retained receipt reservation/replay/fencing, edited/null
  confirmation, refusal, expiry and transition-time crossing, checkpoint-before-pause and authority
  rejection. The direct matrix passed. Production sources remained unchanged; the additional
  test file extends the final source manifest to 50 files:
  `0c80be00d3dfdb34656cef26b2851f78f2478a8e2f7bdd6f9039fb89725de03a`.
  Only infrastructure and the still-unexecuted API/worker workspaces reran with the script's exact
  mandatory flags, exclusions and floors; the first five passing results were retained. All eight
  independent gates passed, totaling 3,074 tests. Infrastructure finished at 83.23% statements,
  76.60% branches, 89.28% functions and 85.06% lines. The final per-workspace evidence follows
  (statement / branch / function / line percentages):

  | Workspace      | Tests | Coverage                      |
  | -------------- | ----: | ----------------------------- |
  | Contracts      |   280 | 90.48 / 88.62 / 92.45 / 92.44 |
  | Domain         |   697 | 95.36 / 91.03 / 100 / 96.24   |
  | AI             |   270 | 93.21 / 87.15 / 91.08 / 95.66 |
  | Web            |   549 | 95.97 / 91.10 / 96.54 / 97.19 |
  | Application    |   293 | 91.25 / 90.20 / 95.60 / 92.65 |
  | Infrastructure |   528 | 83.23 / 76.60 / 89.28 / 85.06 |
  | API            |   215 | 94.45 / 85.47 / 97.69 / 95.59 |
  | Worker         |   242 | 93.50 / 83.30 / 90.54 / 94.85 |

- Final scoped infrastructure typecheck/ESLint passed after the additional unit coverage. All 50
  runtime/test source files matched their retained manifest; owned TypeScript and four documents
  passed Prettier, the four documents passed Markdown lint and `git diff --check` passed. The live
  compatibility probe remains deliberately unexecuted; public commands/UI and the other declared
  later slices remain outside this implementation. No dependencies, historical migrations,
  production configuration or delivery retry budgets changed.

## Plan Change Log

The independent review's retention correction adds no new mechanism: cancellation now participates
in the same four terminal-state sets. The targeted unit test and PostgreSQL-only checkpoint
campaign passed (1 selected scenario, 19.76 seconds); the latter preserves run/event/decision/tool
digests while proving the exact eighth/ninth-turn pruning boundaries. Scoped infrastructure build,
integration TypeScript, ESLint and formatting passed. Infrastructure coverage passed again with
528 tests and unchanged floors/results; all seven unaffected workspace results remain valid.
The final 51-file runtime/test manifest is
`384a39fa8987f72d974afc000c95ea56c74bc91fcc9d3e24c9c8f97b66f79566`.

The complete final routed campaign passed after that correction: 1/1 test, 474.26 seconds including
sequential image preparation, project `rei-intent-6163ef54-5ae2-47cb-979e-1cb4af29dbb5`. The complete
confidence/confirmation/restart/expiry matrix and cleanup passed against the final source manifest.
Observed image IDs: API `58bbee800f14`, AI `421d59c21cfa`, worker `afc330c97eec`. Earlier historical
results are retained; the added cancellation regression covers the only changed retention behavior.

## Review Triage Log

The parent read the complete staged unified diff against `2c5ebe51` and audited all seven matrix
rows against executed passing tests: boundary, low confidence and confirmation use the real routed
campaign; refusal/expiry use that campaign plus the repository transition-time tests; degraded
availability uses SDK/unit and real routed cases; invalid output/abort use SDK, graph and routed
cases; other labels/missing operands use the real routed campaign. Historical regression and
coverage evidence above remains valid for the frozen source manifest. No matrix row is untested.

### 2026-10-26 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Cancelled runs were absent from checkpoint retention terminal sets —
    confirmed against refusal transitions and ADR 0025. Added `cancelled` to candidate/recheck
    and both newer-turn counts. The existing unit check and a real PostgreSQL scenario passed:
    the eighth cancellation prunes an older completed turn, the ninth prunes the oldest cancelled
    turn, and all business-history digests remain unchanged. One independent review; no other findings.

## Design Notes

D-100 was recorded before implementation in the owner's append-only ledger and mirrored in ADR
0008 / epic Notes. Generic public routing/commands remain 5.8; this story's outer surface is the
application facade exercised with real API/worker/AI/SQL/broker composition, not a prepared UI.
Non-executable labels retain their decision and fail `execution_unavailable` until 5.5.
The full route is required by nonmechanical cross-layer SQL/graph/contract changes over 100 lines.
One independent quick review is pinned by the goal; review history is cumulative per story.
The parent workflow owns staging, commits, independent review and ticket transitions. The
implementer does not commit, push, spawn additional agents or modify unrelated files. Retain
command outcomes and existing concise evidence in Implementation Notes; no new report. Run
heavy commands sequentially and report any long-running campaign identity for orderly recovery.

## Auto Run Result

Implemented typed routed decisions, immutable API receipts and the 0.85 gate, with durable
confirmation/refusal/expiry and deterministic degraded routing. Historical modes remain versioned.

Files changed: the Code Map describes the 35 runtime files across domain, contracts, application,
API, AI and persistence, including migration 6006 and the opt-in probe. Sixteen test/fixture files
cover SDK transport, graph recovery, contract parsing, receipt transitions and real-service journeys;
four documents retain the ADR, operational behavior, epic decisions and this delivery evidence.

Independent quick review: one medium retention defect patched; zero deferred or rejected findings.
Targeted inspection confirmed all four terminal sets now include cancellation while preserving
thread locking, eight-turn eligibility and the fixed horizon. Patched counts: high 0, medium 1,
low 0. Follow-up review recommended: false; no unverified review risk remains.

Verification: all seven intent-matrix rows have executed passing coverage. Build/typecheck/lint,
historical campaigns and eight workspace coverage gates passed as recorded above; only affected
checks were repeated after the retention patch; the complete final routed campaign also passed.
No live provider or production acceptance is claimed. Public command/UI,
typed unavailable responses and production verification remain the subsequent tickets' work.

Delivery commits: runtime `90604de`, tests `e4ca713`. Normal pre-commit and Conventional Commit
hooks passed without changing runtime/test bytes; the source manifest binds the observed campaigns
to these commits. The orchestrator records ticket closure separately after the reviewed delivery.

## Verification

**Commands:**

- Repository workspace Vitest commands scoped to modified modules first -- matrix passes.
- `pnpm run build`, `pnpm run typecheck`, `pnpm run lint` sequentially -- all pass.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/ask-intent-decision.integration.test.ts`
  -- real routing/confirmation/recovery/expiry and historical upgrade assertions pass.
- Existing affected Ask tracer, text, explanation, checkpoint and delivery campaign scripts, run
  sequentially after final stabilization -- historical regressions pass; reuse unchanged fixture
  contracts and previously valid unrelated UI/Market evidence, no browser campaign for no UI change.
- `pnpm run test:coverage` -- all eight workspaces retain required assertions and coverage floors.
- `pnpm exec prettier --check <owned files>` and `pnpm exec markdownlint-cli2 --no-globs <owned docs>`
  -- scoped formatting/docs pass; normal commit hooks remain enabled.
