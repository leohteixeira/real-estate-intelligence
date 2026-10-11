---
title: 'Rate limits, backoff and blocks at the source'
type: 'feature'
ticket: '6'
created: '2026-10-10'
status: done
baseline_revision: '22b8aad847a3d5784f2d6992e446e477e469e766'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 2.6 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`apps/worker/src/collection/collection-resilience.test.ts` passed deterministic fake-clock
429/rate/backoff/block refusal assertions. `integration/collection-resilience.integration.test.ts`
passed durable holds, pause/restart and real dependency failure boundaries.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`dd5eecd68420fb67142bda9bb0d028b19112d2b9`,
`346e55ed27107953fc908f81fc2822539a329969`,
`8bc0c4ce522cd9a92331f6844a7284259646c15f`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

# Collection Resilience Implementation Plan

**Goal:** Bound source and snapshot dependencies and stop a blocked source durably without losing
its committed checkpoint or repeating a forbidden request.

**Architecture:** Worker composition owns `@nestjs/resilience`; adapters still make one attempt.
Application-owned ports preserve durable source holds and explicit paused runs. Each transaction
changes one aggregate; source hold commits before run pause and before command acknowledgement.

**Tech Stack:** NestJS 12, TypeScript 6, Vitest, PostgreSQL, RabbitMQ, MinIO.

<intent-contract>

## Intent

**Problem:** Collection has checkpoints but no ADR 0013 policies around source/storage calls.
A login wall, CAPTCHA or block could be retried or disappear on worker restart.

**Approach:** Compose fallback, bulkhead, slow-call circuit breaker, retry, register-derived rate
limiter and attempt timeout around source acquisition and snapshot storage. Record a durable source
hold and pause an existing run at its committed checkpoint; preserve transient redelivery.

## Boundaries & Constraints

**Always:** ADRs 0011–0015; inward dependencies; application ports; closed sanitized failures;
one-attempt adapters; one transaction per aggregate; same-context state ownership; explicit inbox
after durable disposition; all three worker composition roots wrapped; cancellation in all waits;
store-before-parse; content-addressed idempotency; unchanged V1 events; existing coverage gates.

**Never:** Real sources, real-source enablement, ignored environment files, VPS, push/deploy,
invented frontend, retry inside adapters, retry of parsing or access refusals, policy bypass,
successful improvised fallback, logs with cursor/URL/object key/payload/credentials, old migration
edits, weakened tests, unrelated refactors, or ordinary enable clearing a hold.

## I/O & Edge-Case Matrix

| Scenario             | Input / state                                  | Observable result                                                 | Failure handling                            |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Healthy source       | Enabled source, eligible registry              | Single acquisition, store before parse                            | No manufactured quota for N/A fixture       |
| Rate limited         | Canonical transient + retry delay              | Fake clock proves retry honors delay and configured register rate | No deadline overrun                         |
| Transient dependency | Network/timeout/server failure                 | Factor-two full jitter, caps, five attempts and rolling budget    | Exhausted remains resumable                 |
| Forbidden access     | Canonical login-wall/CAPTCHA/block/403 refusal | Immediate breaker trip, durable disabled hold, current run paused | No further request, no completion           |
| Restart / enable     | Held registry survives new wrapper/process     | Ordinary enable refused; no new schedule or request               | Hold cleared only by explicit review        |
| In-flight stale page | Page prepared when a hold commits              | Page commit rolls back; checkpoint prefix unchanged               | No observations/outbox after hold           |
| Store down           | Snapshot store rejects/fails/exhausts          | Parser not called, checkpoint unchanged                           | Job redelivered; source not held            |
| Caller abort         | Waiting in queue/rate/backoff/attempt          | Signal propagates, no later request                               | No policy fallback claiming success         |
| Per-source isolation | One source blocks while another works          | Independent source pools/breakers/budgets                         | Storage isolated from source                |
| Scheduled pause      | Blocked run command redelivered                | Durable pause + inbox + matching slot disposition                 | Ack only after commits; no completion event |
| Legacy one-shot      | Existing CLI success/replay or access failure  | Existing output/idempotency retained, policies and hold applied   | No fabricated pre-I/O checkpoint            |

## Frozen Acceptance Criteria

- Given a fake source and fake clock, when a canonical 429 transient is returned, then timestamped
  attempts prove `Retry-After`, register rate, remaining deadline and retry budget are all respected.
- Given login wall, CAPTCHA or block at page two after page one committed, when the operation runs,
  then the source is durably disabled/held, the same run is paused at checkpoint one, no additional
  request or page artifact exists, and neither completion event nor success is fabricated.
- Given the held source after wrapper recreation or process restart, when enable, schedule claim,
  command redelivery or another fetch is attempted, then no request reaches its adapter. Scheduled
  delivery is acknowledged only after its paused disposition is durable and idempotent.
- Given a prepared page racing source hold, when its transaction attempts commit, then no
  observation/event/checkpoint escapes rollback after the hold's durable linearization point.
- Given snapshot failure, when a run executes, then parsing never precedes successful storage,
  committed prefix is preserved, retries keep the same content identity, and redelivery remains
  possible without disabling a healthy source.
- Given all three composition roots and real isolated Compose services, when the new backend/operator
  campaign and previous collection campaigns execute, then source/store wrappers are exercised,
  the API omits held sources, local state survives restart, and all gates pass without real sources.

</intent-contract>

## Code Map

- `apps/worker/src/shared/resilience/resilient-event-publisher.ts` -- reuse public-policy composition
  ordering, terminal mapping and fake-clock patterns, not an unrelated publisher refactor.
- `apps/worker/src/shared/resilience/retry-budget.ts`, `slow-call-circuit-breaker.ts` -- reusable
  rolling budget and logical-call/slow-call breaker; installed breaker has public `trip()`.
- `apps/worker/src/shared/resilience/resilience-telemetry.ts` -- bounded allowlist currently only
  event-publisher; extend named dependency mapping for source/store without identifiers or errors.
- `apps/worker/src/collection/collection-resilience.settings.ts` -- new named configuration per D-012.
- `apps/worker/src/collection/resilient-listing-source.ts`, `resilient-raw-snapshot-store.ts` -- new
  policy wrappers; source state per ID; local parse delegates once; recheck registry after waits.
  Per-source acquisition admission retains a not-before instant from canonical Retry-After even
  when retry admission fails. Preserve remaining delay on terminal failures and recheck it before
  every later attempt. Start whole-call cancellation/deadline before initial registry lookup or
  pending-hold repair; no persistence wait may escape that scope.
- `packages/application/src/collection/listing-source.port.ts` -- canonical access refusal subtype,
  never HTTP/vendor status crossing boundary; keep existing page/parser shapes compatible.
- `packages/domain/src/collection/source-registration.ts` -- closed nullable hold metadata,
  validation and refusal before synthetic shortcut; preserve legal permission/rate rules.
- `packages/domain/src/collection/collection-run.ts` -- paused nonterminal state/metadata and
  explicit resume preserving run ID, checkpoint, counts and completion invariants.
- `packages/application/src/collection/source-register.repository.ts`,
  `collection-run.repository.ts` -- minimal hold/pause/resume capabilities, one aggregate per call.
- `packages/application/src/collection/collect-source-run.service.ts` -- hold-first pause/recovery,
  transient behavior and last-moment permission/transaction guard; existing completed replay intact.
- `packages/application/src/collection/consume-collection-run-request.service.ts` -- explicit paused
  result/disposition; inbox + matching slot after durable pause; preserve transient redelivery.
- `packages/infrastructure/src/collection/postgres-source-register.repository.ts`,
  `postgres-collection-run.repository.ts` -- strict hydration, hold/enable/pause/resume SQL and guard.
- `packages/infrastructure/src/collection/postgres-collection-schedule.repository.ts` -- claim only
  registered enabled/unheld sources; preserve SKIP LOCKED and canonical slot identities.
- `packages/infrastructure/src/collection/in-memory-collection.adapters.ts` -- faithful hold/pause
  fakes; existing source/store fake contracts remain useful.
- `migrations/4005_collection_add_resilience_holds.sql` -- append coherent hold/paused constraints;
  old migrations and four-ID synthetic allowlist unchanged; no real source enabled.
- `apps/worker/src/collection/collection.module.ts`, `resumable-collection-command.module.ts`,
  `collection-command.module.ts` -- wrap both ports; preserve actual S3 adapter destroy lifecycle.
  Both operator roots must register lifecycle-managed `ResilienceTelemetry` without importing
  broker infrastructure. The worker must retain exactly one subscriber. Test real channel
  delivery and unsubscribe, not merely policy-name mapping or wrapper factory metadata.
- `apps/worker/src/collection/resumable-collection-command.ts` -- distinguish paused from completed
  without leaking private details. Update exported context indexes and existing tests as needed.
- `integration/collection-resilience.integration.mjs`, `package.json` -- isolated real PG/RabbitMQ/
  MinIO/API campaign using compiled wrappers with scripted synthetic adapter and restart proof;
  reuse cleanup coordinator and prior integration patterns.

## Tasks & Acceptance

**Execution:**

- [x] Add failing domain/port tests: held enable refuses, paused run preserves prefix, terminal
      fields stay null, resume is explicit. Implement hold/access/pause types and migration 4005.
- [x] Add failing application/persistence tests: durable source hold first, run pause recovery,
      no commit after hold, paused scheduled disposition/inbox, source-aware schedule claims,
      ordinary enable cannot clear hold. Extend faithful fakes and PostgreSQL adapters.
- [x] Add deterministic worker fake-clock tests before policy code: 429 delay/rate, jitter/caps,
      budget, logical and slow breaker, immediate access trip, hold persistence after recreation,
      deadline including queue/rate, cancellation, independent dependency pools and parse-once.
      Implement wrappers using public library policies and existing budget/breaker helpers.
- [x] Wrap source/store in all three module roots; add wiring/regression tests and bounded telemetry
      tests. Keep S3 maxAttempts=1, content identity and cleanup owner unchanged.
- [x] Add real isolated Compose backend/operator journey: commit first page, block second, inspect
      durable run/register/outbox/inbox/schedule, recreate wrappers and repeat, refuse enable,
      query API for enabled-only sources, prove store failure cannot parse/advance, and clean up.
- [x] Run focused red/green tests, new campaign and affected prior integration campaigns, coverage,
      full lint/typecheck/test/build, formatting, Markdown/diff checks, independent workflow review.
      Parent auto-commits logical groups only after story proof; never push.

## Implementation Notes

- Added canonical refusal/hold metadata, nonterminal paused runs, append-only migration 4005,
  explicit review-clearance/resume capabilities, and strict PostgreSQL hydration.
- Source holds commit before run pauses. A redelivery repairs an interrupted pause without source
  I/O; page transactions take a source shared lock before locking/updating the run aggregate.
- All three composition roots wrap acquisition and storage using named public resilience policies.
  Parsing remains single-attempt, and the actual S3 adapter remains the cleanup owner.
- Absolute command/broker deadlines now propagate through optional port/service parameters to
  retry admission, preserving existing callers and the earliest broker/run timeout.
- Deterministic tests exercise actual source/store concurrency and queue ceilings, queue expiry,
  retry/budget/rate timing, logical/slow breaker samples, cancellation, and durable holds.
- A failed source-hold write leaves a local pending refusal. Subsequent calls retry persistence
  only, even after the breaker reopen interval, until the durable hold can be committed.
  No successful paused disposition is returned while that write fails. Restart protection begins
  at the durable hold commit; a process crash before any successful write cannot preserve a
  refusal in unavailable persistence.
- The isolated real-service campaign proves page-two refusal, durable scheduled disposition,
  duplicate delivery, child-process restart, enabled-only API exclusion, a stale page/hold race,
  explicit review/resume, and actual MinIO outage/recovery with store-before-parse ordering.
- Verification exposed missing persistence coverage and an unsupported Compose `start --wait`
  flag; additional meaningful tests and scoped `up --detach --wait` recovery resolved both.
- One redundant concurrent integration rerun failed at RabbitMQ startup before story assertions.
  Teardown removed its broker logs, so the underlying cause is not established. Three isolated
  concurrent brokers later started successfully; no cgroup OOM event was recorded. The campaign
  now emits only a closed startup diagnostic code before teardown if this failure recurs.
- Process caveat: new tests accompanied implementation and regressions were repaired through
  failing/passing runs; a complete test-first chronology was not recorded for every slice.
- Parent matrix audit: every row has executed, passing coverage, with no skipped covering tests.
  Healthy acquisition, rate limiting, transient failures, caller abort and dependency isolation
  are covered by `collection-resilience.test.ts`; refusal and restart/enable additionally have
  domain/application tests and the real resilience campaign. Prepared-page races and storage
  outage are covered by application tests and the real campaign. Scheduled pause is covered by
  `collection-schedule.service.test.ts` and real RabbitMQ duplicate delivery. Legacy one-shot
  behavior is covered by command/service tests and the prior synthetic collection campaign.

## Plan Change Log

### 2026-10-10 — Re-derived implementation

- Restored the explicitly retained KEEP slices without altering the acceptance criteria, then
  re-derived per-source admission and whole-call deadline scope against the amended plan.
- Canonical Retry-After updates a source-local not-before instant before retry admission, even
  on the final attempt. Later calls retain this cooldown when retry is denied by deadline,
  budget or attempts. Terminal exhausted failures expose the remaining canonical delay.
- Whole-call cancellation/deadline begins before registry lookup or pending-hold repair. A late
  persistence result cannot lead to a later adapter request after the caller has returned.
- Both operator contexts own a lifecycle telemetry subscriber; the worker retains its existing
  single subscriber. Real diagnostics channel tests prove delivery exactly once and unsubscribe.
- Six new regression cases failed against the restored KEEP implementation before the policy
  correction. The final worker suite adds fifteen cases over the previous attempt, including
  queue/cooldown cancellation, held-source rechecks, independent sources and rate rejection.

### 2026-10-10 — Review re-derivation 1

- Trigger: Retry-After was discarded when retry could not fit the deadline/budget; initial
  persistence preceded the deadline controller. Amend wrapper admission and deadline notes above.
- Avoid: a new call reaching the source before its requested not-before instant, and registry
  waits outliving the supplied absolute deadline. Add deterministic regression tests for both,
  including budget-denied retry, queue/cooldown cancellation, delayed registry/pending hold,
  and independent sources. Preserve canonical remaining delay without raw details.
- KEEP: durable disabled holds, explicit paused runs, hold-first recovery, shared source lock
  before run lock, per-aggregate transactions, immutable page prefix, explicit review/resume,
  all three roots, single-attempt adapters, deadline propagation and sanitized telemetry.
- KEEP: previous fake-clock coverage, real Compose refusal/restart/stale-page/store-outage
  campaign, cleanup diagnostics, all four prior integration campaigns and unchanged gates.
- Preserve the direct telemetry correction from this pass: subscribe/unsubscribe in both
  operator contexts and prove channel delivery without duplicate worker subscribers.
- Earlier verification describes the attempted implementation, not the reverted baseline;
  repeat the full verification and matrix audit after re-derivation.

## Review Triage Log

### 2026-10-10 — Re-derived review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. A cold independent quick reviewer checked the current diff, acceptance criteria,
  repository rules and surrounding source/persistence/scheduled paths and reported no findings.
- The first pass's three findings are addressed by re-derived source admission, whole-call
  deadline scope and lifecycle telemetry wiring, with executed regression tests.

### 2026-10-10 — Review pass

- verdicts: 3 findings — high 1, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Retry-After lost across logical calls — parent reproduced a 200ms
    source delay followed by a second adapter request after 1ms when deadline denied retry.
    Terminal mapping omitted retryAfterMs. Amend per-source admission and regression coverage;
    re-derive while retaining all KEEP instructions.
  - `[medium]` `[bad_plan]` Initial persistence escapes absolute deadline — parent reproduced
    a 25ms deadline returning only after the 150ms registry lookup (152ms elapsed). Amend whole-call
    scope before lookup/pending-hold repair and delayed-persistence regression coverage.
  - `[medium]` `[patch]` Missing operator policy telemetry — both command provider lists and
    PersistenceModule omit the subscriber, which only MessagingModule supplies. Retries and
    breaker events from these commands therefore have no policy signals. Direct correction is
    lifecycle registration in both command roots; the re-derivation applies it with wiring tests.

## Design Notes

- Decision: D-013 corrects source cooldown across calls, deadline scope and command telemetry
  while preserving existing public contracts and the frozen intent (agent, on the owner's behalf,
  2026-10-10). Cooldown remains process-local; durable holds remain restart-safe.
- Compatibility clarification: the existing synthetic operator command's structured stdout is
  its caller-facing output contract, not policy/application telemetry. Preserve that established
  synthetic result shape. The no-object-key logging constraint prohibits adding object keys to
  telemetry, failure messages or paused output; no new output surface may expose them.
- Decision: durable holds and explicit paused runs follow D-012; source hold commits before run
  pause in separate aggregate transactions, and a redelivery repairs the intermediate state before
  acknowledgement (agent, on the owner's behalf, 2026-10-10).
- Decision: ADRs override skill examples: ports in application, SQL not Prisma, Vitest not Jest,
  existing pnpm workspace not NX, facade queries allowed, RabbitMQ/outbox not EventEmitter
  (agent, on the owner's behalf, 2026-10-10).
- Named defaults: source backoff 1s/5min, store 100ms/30s, factor two/full jitter, five attempts;
  10% retry budget over 60s with one reserve; 50% failed/slow of minimum20 in10s, open30s/probe1;
  source bulkhead1+queue4, store4+queue8, queue1s; source attempt30s/store5s. Deadline/abort wins.
- N/A synthetic rates stay N/A. Configured remote rate behavior is proven against fake registry
  ports, without changing synthetic legal identity or enabling a real source.
- Estimate exceeds 100 lines and five files: full implementation subagent route. No UI changed.

## Verification

Reproducible focused commands:

```sh
pnpm --filter @rei/domain test
pnpm --filter @rei/application test
pnpm --filter @rei/infrastructure test
pnpm --filter @rei/worker test
```

Reproducible full gates:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run test:coverage
```

Reproducible prior campaigns:

```sh
pnpm run test:integration:collection
pnpm run test:integration:resumable-collection
pnpm run test:integration:scheduled-collection
pnpm run test:integration:source-register
```

### Re-derived implementation evidence — 2026-10-10

- Parent post-handoff verification independently passed full lint, typecheck, all 665 tests,
  build, coverage and all four focused suites on the re-derived tree. The parent also ran all
  five real-service campaigns serially; each passed and scoped fixtures were removed.
- Parent repeated the eleven-row matrix audit against executed tests: source/store timing,
  cancellation, isolation and legacy paths are covered in the focused suites; durable refusal,
  restart, stale-page rollback, scheduled redelivery and storage outage additionally pass with
  real services. No matrix covering test was skipped or unregistered.
- Changed-file Prettier, direct scoped Markdown checks using repository rules, staged and
  unstaged diff checks pass. An initial CLI Markdown invocation included configured global
  globs and reported unrelated historical documentation errors; the scoped check passes.
- Six regression cases failed before correcting the restored KEEP policies; all pass after
  re-derivation. The final focused suites pass: domain 199, application 70, infrastructure 173,
  worker 166 tests. The final full workspace run passes all 665 tests.
- Full `lint`, `typecheck`, `test`, `build` and `test:coverage` scripts pass with unchanged gates.
  After the last two worker regressions, worker build/typecheck and the same coverage gate passed
  again: 94.73% statements / 84.82% branches. Infrastructure remains 85.68% / 78.44%.
- The isolated real PostgreSQL/RabbitMQ/MinIO/API resilience campaign passes on the final compiled
  wrappers: durable refusal/pause, redelivery, restart, API exclusion, stale-page rollback,
  explicit review/resume and real storage outage/recovery are exercised.
- All four prior campaigns pass serially on this implementation: synthetic collection,
  resumable crash/restart, scheduled SIGTERM/restart and source register, including its five
  cleanup coordinator tests.
- Changed-file Prettier, scoped plan/epic Markdown lint and `git diff --check` pass. No matching
  campaign fixture containers or volumes remain after scoped teardown.
- The existing web chunk-size warning is unchanged. Cooldown is process-local by D-013; durable
  holds survive restart after a successful hold commit. No real source was enabled or contacted.
- Independent workflow review, parent post-handoff verification and authorized commits remain
  the parent workflow's next steps; this implementation subagent did not review or commit.

### Previous attempt evidence

These earlier records describe the attempt before review re-derivation, not the current baseline.

- Focused suites pass: domain 199, application 70, infrastructure 173, worker 151 tests.
- `pnpm run test:integration:collection-resilience` -- real service journey and teardown pass.
  Two consecutive serial runs passed after the final fail-closed change.
- Prior collection, resumable-collection, scheduled-collection and source-register integration
  scripts all pass, including SIGTERM/restart and scoped teardown.
- Full `lint`, `typecheck`, `test` and `build` scripts pass. Build retains the existing visual
  portfolio chunk-size warning; no threshold was changed.
- `pnpm run test:coverage` -- current per-workspace thresholds unchanged and passing.
  Infrastructure: 85.68% statements / 78.44% branches; worker: 93.43% / 83.93%.
- Changed-file formatting, plan Markdown lint, diff checks and scoped container/volume audits pass.
- Independent workflow review and commit hooks remain the parent workflow's next steps.
- Parent verification repeated all full/focused gates and all five integration campaigns in
  sequence successfully after implementation. The full suite ran 650 tests; coverage thresholds
  remained unchanged. The resilience campaign left no matching fixture containers or volumes.

## Auto Run Result

- Implemented ADR 0013 source/store policies, persistent source holds, nonterminal checkpoint
  pauses, explicit review/resume, hold-first recovery and safe scheduled acknowledgements.
- Review: the initial high and medium admission/deadline findings triggered one re-derivation;
  its telemetry correction was retained. The current independent quick pass reports no findings.
  Current-pass patches: high 0, medium 0, low 0. Deferred items: none. Rejected findings: none.
- Follow-up review recommendation: false; no current-pass patch introduces an unverified risk.
- Verification: parent full lint/typecheck/test/build/coverage, 665 tests, all four focused suites,
  five real-service campaigns, changed-file formatting, scoped Markdown and diff checks pass.
  All eleven matrix rows have executed coverage; no covering test is skipped or unregistered.
- Residual risks: cooldown is process-local; restart protection requires a committed durable
  hold. A refusal cannot survive a crash before its first successful persistence write when the
  database is unavailable. Existing web chunk-size warning remains. VPS and real sources were
  not accessed; no source was enabled outside the synthetic fixtures and no changes are pushed.
- Authorized finalization groups implementation, tests and documentation into separate English
  Conventional Commits, preserving the pre-existing stash and checking the final working copy.

### Changed files

| File                                                                                                                          | Change                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/worker/src/collection/collection-dependency-policies.ts`                                                                | Public policy chain, admission cooldown and whole-call deadline.      |
| `apps/worker/src/collection/collection-resilience.settings.ts`                                                                | Named source/store calibration defaults.                              |
| `apps/worker/src/collection/resilient-listing-source.ts`                                                                      | Per-source policies, eligibility and pending durable hold repair.     |
| `apps/worker/src/collection/resilient-raw-snapshot-store.ts`                                                                  | Bounded storage attempts with stable defensive bytes.                 |
| `apps/worker/src/collection/collection-command.module.ts`                                                                     | Legacy command wrappers and lifecycle telemetry.                      |
| `apps/worker/src/collection/resumable-collection-command.module.ts`                                                           | Resumable command wrappers and lifecycle telemetry.                   |
| `apps/worker/src/collection/collection.module.ts`                                                                             | Scheduled worker source/store policy composition.                     |
| `apps/worker/src/collection/collection-run-request.consumer.ts`                                                               | Propagate the absolute broker deadline.                               |
| `apps/worker/src/collection/resumable-collection-command.ts`                                                                  | Report paused dispositions and propagate command deadline.            |
| `apps/worker/src/collection/synthetic-collection-command.ts`                                                                  | Preserve legacy output while propagating deadline.                    |
| `apps/worker/src/shared/resilience/resilience-telemetry.ts`                                                                   | Allowlisted collection dependency policy signals.                     |
| `packages/application/src/collection/collect-source-once.service.ts`                                                          | Eligibility checks and legacy durable hold handling.                  |
| `packages/application/src/collection/collect-source-run.service.ts`                                                           | Hold-first pause recovery and guarded page commits.                   |
| `packages/application/src/collection/collection-run.repository.ts`                                                            | Explicit pause and resume port capabilities.                          |
| `packages/application/src/collection/consume-collection-run-request.service.ts`                                               | Durable paused inbox/slot disposition and deadline propagation.       |
| `packages/application/src/collection/listing-source.port.ts`                                                                  | Canonical refusal and optional absolute deadline.                     |
| `packages/application/src/collection/raw-snapshot-store.port.ts`                                                              | Optional storage deadline.                                            |
| `packages/application/src/collection/source-register.repository.ts`                                                           | Durable hold, explicit clearance and transaction guard ports.         |
| `packages/application/src/collection/index.ts`                                                                                | Export canonical refusal.                                             |
| `packages/domain/src/collection/collection-run.ts`                                                                            | Validated paused state and explicit resume.                           |
| `packages/domain/src/collection/source-registration.ts`                                                                       | Immutable source holds and held enable refusal.                       |
| `packages/domain/src/collection/index.ts`                                                                                     | Export hold and pause domain capabilities.                            |
| `packages/infrastructure/src/collection/in-memory-collection.adapters.ts`                                                     | In-memory hold/pause adapter support.                                 |
| `packages/infrastructure/src/collection/postgres-collection-run.repository.ts`                                                | Strict pause hydration and guarded SQL transitions.                   |
| `packages/infrastructure/src/collection/postgres-source-register.repository.ts`                                               | Durable hold/clearance and shared source locks.                       |
| `packages/infrastructure/src/collection/postgres-collection-schedule.repository.ts`                                           | Exclude disabled and held sources from due claims.                    |
| `migrations/4005_collection_add_resilience_holds.sql`                                                                         | Append coherent hold and paused-run constraints.                      |
| `apps/worker/src/collection/collection-resilience.test.ts`                                                                    | Deterministic policy, timing, cancellation and isolation regressions. |
| `apps/worker/src/collection/collection-resilience-wiring.test.ts`                                                             | Actual composition-root telemetry and cleanup proofs.                 |
| `apps/worker/src/collection/collection-run-request.consumer.test.ts`                                                          | Broker deadline regression.                                           |
| `apps/worker/src/collection/resumable-collection-command.test.ts`                                                             | Paused output and deadline regression.                                |
| `apps/worker/src/collection/synthetic-collection-command.test.ts`                                                             | Legacy deadline wiring regression.                                    |
| `apps/worker/src/shared/resilience/resilience-telemetry.test.ts`                                                              | Bounded policy-name mapping regression.                               |
| `packages/application/src/collection/collect-source-once.service.test.ts`                                                     | Legacy refusal and held replay tests.                                 |
| `packages/application/src/collection/collect-source-run.service.test.ts`                                                      | Prefix, refusal, pause repair and stale-page tests.                   |
| `packages/application/src/collection/collection-schedule.service.test.ts`                                                     | Idempotent paused inbox and matching slot tests.                      |
| `packages/application/src/collection/enable-source.service.test.ts`                                                           | Extended register test double.                                        |
| `packages/domain/src/collection/collection-run.test.ts`                                                                       | Paused state and resume invariants.                                   |
| `packages/domain/src/collection/source-registration.test.ts`                                                                  | Held enablement and hold validation invariants.                       |
| `packages/infrastructure/src/collection/collection-adapters.test.ts`                                                          | Hold/clearance and pause/resume adapter tests.                        |
| `packages/infrastructure/src/collection/postgres-collection-run.repository.test.ts`                                           | SQL pause/resume and hydration tests.                                 |
| `packages/infrastructure/src/collection/postgres-source-register.repository.test.ts`                                          | Lock, hold, cancellation and sanitization tests.                      |
| `integration/collection-resilience.integration.mjs`                                                                           | Isolated real-service refusal/restart/race/outage journey.            |
| `package.json`                                                                                                                | Expose the real-service resilience campaign.                          |
| `_bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md`                                         | Mirror D-012/D-013 owner decisions in English.                        |
| `_bmad-output/initiative-real-estate-intelligence/epic-collection/story-rate-limits-backoff-and-blocks-at-the-source-plan.md` | Plan, matrix, review triage, decisions and verification evidence.     |
