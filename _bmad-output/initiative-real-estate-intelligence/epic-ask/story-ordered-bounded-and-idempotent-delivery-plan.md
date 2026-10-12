---
title: 'Ordered, bounded and idempotent delivery'
type: 'feature'
ticket: 7
created: '2026-10-12'
status: done
baseline_revision: '16363f5021067df106e96a9b06566bfde8e3bd81'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0026-ordered-bounded-ask-delivery.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
warnings: [oversized]
deferred: []
---

# Ordered, bounded and idempotent delivery — implementation plan

**Goal:** Enforce CAP-13 admission order, three-total pending capacity, fixed two-minute queued
expiry and replay-safe delivery through the public API and actual worker/broker.

**Architecture:** API-owned explicit SQL linearizes every Ask lifecycle transition using the
existing thread fence. Typed nonfailure deferral frees broker capacity without consuming retry
attempts; bounded API maintenance expires queued work without invoking the graph.

**Tech Stack:** NestJS 12, TypeScript 6, PostgreSQL, RabbitMQ, existing LangGraph remote saver;
Vitest, Supertest, Testcontainers, Nock and Execa under ADR 0020.

<intent-contract>

## Intent

**Problem:** Creation has no pending bound or durable order, and claims allow later commands to
overtake an interrupted running predecessor. Legitimate busy waiting occupies prefetch slots and
exhausts the five-failure budget; stale queued runs never expire.

**Approach:** Implement D-049 / ADR 0026 with numeric thread-locked admission, PostgreSQL-clock
120-second deadlines, truthful expired terminals and API maintenance. Replace Ask's forty-second
poll with explicit confirmed nonfailure scheduling deferral while retaining real-failure DLQ.

## Boundaries & Constraints

**Always:** Three total nonterminal runs, including running; replay before capacity and authority
before disclosure/mutation; oldest nonterminal admission sequence executes even after its running
lease expires. Preserve one run aggregate per transaction, retained tool/creation/delivery fences,
fresh grants, canonical remote state and pending writes, completed-before-terminal receipt reuse,
contiguous SSE, SQL-clock expiry, normal five-failure budget and shutdown cancellation. API alone
owns Ask SQL; Market remains behind its facade; AI receives no infrastructure credentials. All
integration campaigns/helpers/probes remain strict TypeScript with native Vitest and owned real
fixtures. Preserve 80% statements/functions/lines and 75% branches, every root gate and hooks.

**Never:** Edit applied 6001–6003, rewrite historical documents, run multiple aggregate mutations
in one transaction, hold locks across HTTP, invent decisions/calculations for expired work, skip a
recoverable running head, replay DLQ automatically, reset retry count on deferral, add TTL topology,
relax parser/SQL predicates, use schema fallback, lower coverage, skip/retry flaky tests, read or
modify `.env*`, touch foreign Docker resources, use real sources/providers, access VPS or deploy.
Jev, public confirmation/cancellation, quotas, explanations and UI are subsequent increments.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                                    | Expected Output / Behavior                                                                                                                      | Error Handling                                                                   |
| -------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Capacity             | Three queued or one running plus two queued; concurrent new keys | Exactly three total pending; fourth new POST is 429 `{code:'thread_pending_limit',limit:3}`; no rejected run/requested event/outbox/reservation | No invented reopening time or question echo                                      |
| Replay at capacity   | Same authorized key/body; terminal replay after retention        | Same original run/thread IDs, no new effect; snapshot exposes actual state                                                                      | Changed body 409; foreign capability 403 before occupancy disclosure             |
| Reverse delivery     | A3/A2 delivered before A1                                        | Only oldest numeric admitted unfinished run can receive execution authority                                                                     | Prompt nonfailure deferral, no executor/complete call                            |
| Expired active lease | Running A1 lease expired; A2 queued                              | Reclaim A1 with fresh scoped grants before A2; retain one receipt/checkpoint lineage                                                            | Old grants remain forbidden                                                      |
| Queue deadline       | Queued deadline <= SQL now                                       | Honest expired run, one expired step, null decision/result/authority, zero checkpoint/receipt                                                   | Atomic terminal SSE/outbox/inbox; no fabricated execution                        |
| Worker stopped       | Stale queued run, no deliveries                                  | API maintenance persists terminal; restart and SSE replay identical                                                                             | Bounded fair cancellable cycles, skip busy threads                               |
| Deferral             | More than five busy deliveries, possibly prior real failures     | Confirmed persistent source-tail transfer retains current attempt                                                                               | Ambiguous/failed transfer leaves source unsettled and retires generation         |
| Genuine failure      | Synthetic persistent executor/transport failure                  | Actual normal fifth failure reaches durable DLQ; no auto replay                                                                                 | Running head remains recoverable; successor waits/expires; other thread proceeds |
| Upgrade              | Populated genuine 6003 schema                                    | 6004 adds order/deadline only; original documents/events/receipts/fingerprints identical                                                        | No runtime schema detection or historical migration modification                 |

</intent-contract>

## Code Map

- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` — `create()` has two creation-key
  transactions, separate recoverable thread preparation, no thread admission lock/count; `claim()`
  checks only live running leases. Reuse `stored`, `identity`, `append`, retained-key replay,
  `PostgresInbox` and terminal outbox. `thread()` currently orders IDs. Split focused expiry
  helpers if needed, preserving the existing flat context layout and transaction ownership.
- `packages/infrastructure/src/ask/ask-execution.authorization.ts` — reuse canonical
  `lockAskThread` and active-execution authorization; tool/checkpoint/claim/terminal use this fence.
- `migrations/6001_ask_create_structured_runs.sql`, `6002_ask_text_price_runs.sql`,
  `6003_ask_graph_checkpoints.sql` — read-only historical contracts. New 6004 must extend state,
  history, claim and run-event predicates only with a strict unexecuted expiry branch; retain
  every existing completed/failed/input/basis constraint. Historical order uses IDs; numeric
  sequence lookup must qualify the bigint column rather than order a `::text` alias.
- `packages/domain/src/ask/ask-live.types.ts`, `packages/contracts/src/ask/ask-live.dto.ts` —
  independent public/domain live types and closed parsers; currently no expired state. Preserve
  structured/text provenance and prepared read-only protocols. Exports flow through context/root
  indices, not deep cross-context imports.
- `packages/application/src/ask/ask-run.repository.ts`, `ask-live.facade.ts`, `ask-run.service.ts`
  — API application seam for lifecycle/expiry; `AskLiveError` currently maps busy to 503. Add a
  distinct capacity kind and bounded maintenance operation; reuse facade injection.
- `apps/api/src/ask/ask-live.controller.ts` — public `/api/v1/runs`; `liveAuthorized` maps errors.
  Both structured and text admission must expose the new closed capacity refusal. Accepted
  replay returns original IDs; current run state remains a separate authenticated inspection.
- `apps/api/src/ask/graph-checkpoint-retention.job.ts`, `graph-checkpoint-retention.settings.ts`
  — lifecycle/nonoverlap/deadline/cancellation/telemetry pattern for new queue-expiry job/settings.
  `ask.module.ts` owns DI. Do not expose public maintenance or give worker/AI expiry permissions.
- `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts` — terminal-turn selection
  currently recognizes completed/failed. Include expired in all terminal-turn semantics; no
  deletion of business runs, receipts, SSE, replay fingerprints or durable pruning fences.
- `packages/application/src/ask/consume-ask-run-request.service.ts`, `ask-admission.policy.ts`
  — remove admission polling while retaining signal/deadline and genuine executor classification.
  `apps/worker/src/ask/ask-run-request.consumer.ts` forwards the returned disposition.
- `packages/application/src/shared/event-subscriber.ts` — `EventHandler` currently returns void.
  Add a compatible explicit deferred result; unchanged collection/market/audit handlers stay void.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` — `handleDelivery` /
  `transferConfirmed` already implement persistent mandatory confirms, fixed attempts and
  generation retirement. Separate deferred-result settlement from the failure catch. Preserve
  source envelope, trace consistency, existing generation fencing and drain rules.
- `apps/worker/src/shared/messaging.module.ts`, `apps/worker/src/config.ts` — production prefetch
  is `COLLECTION_CONCURRENCY`, default 2; prove default progress and prefetch-one reverse delivery,
  not a test-only higher concurrency workaround. `consume-ask-run-timeout.test.ts` protects the
  independent bounded executor budget.
- `integration/ask-checkpoints.integration.test.ts` — real owned setup/barriers/restart/native
  saver probes and retention. Its populated-6002 upgrade currently invokes the current repository
  before 6003; replace only historical seeding with explicit genuine-schema fixture SQL/helper,
  preserve the meaningful 6002-to-6003 evidence and apply 6004 before current production calls.
- `integration/ask-price-run.integration.test.ts`, `ask-text-price-run.integration.test.ts` —
  receipt/inbox replay, durable SSE, transient/definitive failure, additive upgrade and mixed
  ownership examples. Preserve tests that prove real execution, rather than manufacturing finals.
- `integration/support/{fixture,http,cleanup,ask-diagnostics}.ts` — reuse unique owned projects,
  `allocatePorts`, `requestHttp`, `preserveCleanup`, `cleanupAll` and safe diagnostics. Only exact
  fixture run/event IDs may be aged/republished/faulted. Foreign metadata comparison remains.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/ask/ask-live.types.ts`, new
      `packages/domain/src/ask/ask-delivery.policy.ts` and `.test.ts` — define named three-total /
      120-second policy and expired shape; add deterministic boundary/state tests first. The expiry
      shape is one expired step, null decision/result and reason queue_expired, not execution failure.
- [x] `packages/contracts/src/ask/ask-live.dto.ts` and `.test.ts`, context/root export indices —
      add closed `AskPendingLimit` / `parseAskPendingLimit`, truthful expired run and event parsing;
      reject unknown keys, forged execution/decision/result/steps and wrong terminal reason. Preserve
      all completed/failed provenance/history tests and identity correlation in dispatch responses.
- [x] `migrations/6004_ask_ordered_delivery.sql` — persist unique numeric admission sequence,
      admitted_at and fixed queue_expires_at; backfill by retained historical ID order and creation
      time without rewriting business JSON. Sequence allocation happens under thread lock. Add
      indexed head/deadline queries and strict additive expiry constraints. One SQL clock observation
      defines new admission timestamp and 120-second deadline. Do not cast ordering to text.
- [x] `packages/application/src/ask/ask-run.repository.ts`, `ask-run.service.ts`, associated tests
      and test fakes — add capacity error and API-owned bounded expiry seam with cancellation. Keep
      application dependencies pure and avoid new general administrative dispatch authority.
- [x] `packages/infrastructure/src/ask/ask-run.pg-repository.ts` and `.test.ts`, focused new
      `ask-queue-expiry.pg.ts` / `.test.ts` if needed — serialize authorized final admission by
      thread; check retained replay first; clean stale siblings in separate per-run transactions;
      count all nonterminal work and reject the fourth. Claim verifies retained identity, returns
      terminals, expires overdue requested queued work before authority, and admits only the numeric
      head even with an expired running lease. Preserve tool/checkpoint reauthorization. Persist
      expiry state/event/outbox/inbox atomically for one run. Bounded maintenance scans rotate a
      frontier, skip occupied thread locks and recheck SQL time after lock acquisition; no network
      in transactions. Unit-test exact query/rollback/cancellation and replay branches before green.
- [x] `apps/api/src/ask/ask-live.controller.ts`, `ask-live.controllers.test.ts`, new
      `ask-queue-expiry.job.ts`, `.settings.ts`, `.job.test.ts`, `ask.module.ts` — map capacity to
      parsed HTTP 429 without fake quota reopening; wire nonoverlapping one-second /
      100-transition / five-second API expiry with deadline/shutdown cancellation and
      fixed-cardinality telemetry.
      Tests prove absent configuration does not break health/prepared fixtures or execute real work.
- [x] `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts` and `.test.ts` — include
      expired in terminal-turn rank without altering thirty-day horizon or deleting business history.
      Verify eight-turn pruning with expired terminals and active work independently.
- [x] `packages/application/src/shared/event-subscriber.ts`, shared/root exports,
      `packages/application/src/ask/consume-ask-run-request.service.ts` and `.test.ts`,
      `apps/worker/src/ask/ask-run-request.consumer.ts`, `consume-ask-run-timeout.test.ts` — introduce
      compatible nonfailure deferral; busy returns promptly without executor/complete, terminal
      bypasses AI, genuine transient failures still reject, definitive failures still terminalize,
      cancellation still propagates. Keep the unchanged named execution/HTTP budgets.
- [x] `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` and `.test.ts` —
      settle deferred results separately: one-second abortable delay, persistent mandatory confirmed
      source-tail transfer, same attempt, admission-deferred reason, ack only after confirm. Failure
      here must not fall into normal handler-retry increment. Test unconfirmed/unroutable/generation
      loss/shutdown behavior, retained prior attempt and more than five deferrals, plus unchanged
      five-normal-failure DLQ for void handlers. Check tracing wrapper result types without weakening
      telemetry or injecting sensitive labels.
- [x] `integration/ask-checkpoints.integration.test.ts`, focused historical fixture helper if
      shared — seed genuine 6002 without current-schema repository, retain byte-identical upgrade
      assertions and execute current production only after new migrations. Preserve every real
      restart, native pause, fork, pending-write gap, cancellation and retained-receipt scenario.
- [x] New `integration/ask-delivery.integration.test.ts`, `package.json` focused alias
      `test:integration:ask-delivery` — real PostgreSQL/Rabbit/API/worker/AI HTTP E2E cases below.
      Startup holds worker as needed; declare actual topology before controlled reverse publication;
      mark only owned requested outbox IDs published and republish the same envelopes via production
      broker. Production concurrency defaults must remain real. Use SQL-observed barriers scoped to
      one run, bounded `vi.waitFor`, explicit DTO/CLI/SQL shapes, no arbitrary JSON casts or Node
      harness. Compare foreign containers/volumes and clean every owned resource on failure.
- [x] `docs/api/ask-tracer.md`, `docs/api/ask-checkpoints.md`,
      `docs/testing/integration.md`, this plan — document verified capacity/expiry/deferral/FIFO/DLQ
      operational semantics and append actual gate/campaign evidence, without claiming later Ask,
      UI/VPS or final-initiative completion. Keep ADR 0026 and epic decision consistent with code.

**Acceptance Criteria:**

- Given three authorized queued runs with worker stopped, when distinct keys race through
  public `/api/v1/runs`, then only three total nonterminals persist and the fourth is the exact
  typed 429, with no rejected run/event/outbox/reservation; same-key replay still returns its
  original IDs and wrong capability remains forbidden. Repeat with one running plus two queued.
- Given real Rabbit deliveries A3/A2/A1 for one thread, when the production worker consumes them,
  then real graph/tool/calculating evidence occurs only in numeric admission order; a separately
  admitted B1 completes through public HTTP/SSE while A's oldest command is withheld and its
  two followers fill default prefetch. Prove prefetch-one progress as an additional case.
- Given waiting commands that defer more than five times and one with a previously incremented
  real-failure attempt, when they are consumed by the actual broker, then their attempt counter
  is unchanged, none enters DLQ solely for scheduling, and eventual release completes once.
- Given interrupted oldest A1 with an expired claim and a committed receipt/checkpoint, when
  A2 then A1 redeliver, then A1 recovers on its original thread/run before A2 executes; the actual
  retained Market receipt remains one and old grants fail. Public terminal/SSE and graph evidence
  are real, not fixture-created completions.
- Given a queued run at its fixed SQL deadline and another just before it, when claim/admission
  or maintenance observes them, then only eligible work expires, grants/effects stay absent, and
  already-running work is never queue-expired. SQL clock decides despite application-clock drift.
- Given worker and broker consumption stopped, when an owned queued deadline becomes stale,
  then actual API maintenance emits one parsed expired terminal and contiguous SSE/outbox/inbox;
  API restart, cursor replay and repeated original requested delivery preserve it without AI.
- Given a fixture-owned barrier or injected outbox/inbox failure during expiry, when cancellation
  or failure occurs, then real SQL has no partial terminal/effect, the leased backend is released
  or cancelled under the established statement-timeout semantics, and retry commits once. A busy
  thread cannot prevent an unrelated stale run from expiring.
- Given a run-scoped persistent synthetic execution/transport fault, when actual production
  consumption fails normally five times, then its original identity reaches the durable DLQ
  with attempt five and delivery-limit reason, no automatic replay or false public completion;
  its running head blocks successors, queued siblings can expire, and unrelated B completes.
- Given genuine populated 6003 structured/text history, when 6004 applies and new requests run,
  then historical documents/events/receipts/fingerprints/outbox/inbox are byte-identical, numeric
  order/backfill is stable, and normal creation/replay/recovery works. Genuine 6002-to-6003 and
  all story-5.6 restart/pending-write tests still pass without production schema fallback.
- Given terminal runs after delivery/inbox/idempotency pruning, when original commands redeliver,
  then no second run/tool/checkpoint/terminal outbox is created and exactly one inbox is restored.

## Implementation Notes

Admission, claim, tool-result and completion timestamps now use PostgreSQL observations so a
lagging application clock cannot violate the retained nondecreasing business timeline. The
capacity refusal has a dedicated typed HTTP exception: the global sanitizer preserves only this
closed response, while arbitrary exception payloads still receive the normal sanitized envelope.
Fixture aging uses one materialized SQL clock to preserve the exact fixed-deadline constraint.
Rabbit firehose observers parse the original envelope body and read publication headers from
trace metadata. Normal controlled publication loads the original retained outbox envelope and
uses the production broker; direct publication is limited to the explicit attempt-header fault.

### Verification checkpoint — 2026-10-11

- `pnpm run test`: all 1,998 tests passed across eight workspaces (API 187, worker 227,
  infrastructure 444, application 222, domain 644, contracts 163, AI 97 and web 14).
- `pnpm run test:coverage`: passed every unchanged workspace floor after the SQL-clock and
  global HTTP sanitizer fixes.
- `pnpm run build`, `pnpm run typecheck` and `pnpm run lint`: passed, including strict
  TypeScript integration checking, context boundaries and migration conventions.
- Existing structured tracer: one real-service campaign passed in 349.89 seconds, covering
  real graph/receipt execution, transactional failures, retained replay and restart boundaries.
- Initial two-case ordered-delivery campaign: prefetch-one reverse delivery passed. The other
  case exposed the global sanitizer's generic 429 response before reaching expiry; that defect
  was fixed and covered by two real Nest HTTP regressions. This run overlapped the tracer's
  teardown and correctly reported a foreign-inventory mismatch; subsequent campaigns are serial.
- Three changed documentation references pass `markdownlint-cli2 --no-globs`. Root Markdown
  lint still reports 1,377 preexisting errors solely in generated `_bmad/render` artifacts.
  Root format checking likewise reports unrelated generated artifacts; no configuration or
  ignored artifact was changed to bypass those gates.
- The expanded four-case delivery campaign, strengthened clock-drift boundary case, historical
  upgrade/expired-terminal retention and complete serial integration suite remain unverified
  at this checkpoint. No acceptance completion is claimed from unit-test success.

## Plan Change Log

### Verification checkpoint — 2026-10-12

- Current ordered-delivery campaign: all four real-service cases passed without skip or retry
  in 219.01 seconds (218.02 seconds in tests). Every owned fixture preserved the exact initial
  foreign container/volume inventory and metadata. The source was verified after all deadline,
  real-failure accounting, retained-envelope and post-pruning no-effect assertions were added.
- The expanded real campaigns first exposed a SQL error: PostgreSQL could evaluate the original
  object-key subtraction for an honest null-decision expired run. New 6004 now uses a state-based
  `CASE`, retaining the verbatim original predicate for every non-expired state. Inclusive SQL
  boundaries, application-clock drift, running-overdue exclusion, outbox/inbox rollback and
  cancellation all passed against real PostgreSQL after the fix.
- Native Testcontainers creates its reaper before Compose startup. Owned delivery/checkpoint
  helpers now initialize the public runtime/reaper APIs before recording foreign inventory;
  no inventory filtering, resource deletion or assertion relaxation was introduced.
- One serial run passed three cases but hit an isolated native `read ECONNRESET` during the
  prefetch-one fixture setup, with no application stack or declared queues. Fixture phase
  diagnostics now identify that surface on subsequent failures. A single bounded Rabbit
  application-start prerequisite was added before AMQP/public mutations, since the Compose
  ping establishes only runtime availability. The subsequent current four-case campaign passed;
  no public mutation or assertion was retried.
- Current focused checks passed: infrastructure Ask/messaging 130 tests; API Ask plus real HTTP
  sanitizer 44 tests; domain delivery policy two tests; retention SQL one test; integration support
  and cleanup 25 tests. Root lint, strict integration typing, exact source formatting and whitespace
  checks passed. Prettier has no SQL parser installed; SQL is checked by migration conventions
  and whitespace checks rather than by an invented formatter.
- Current checkpoint campaign: all six cases passed in 408.44 seconds (407.50 seconds in tests),
  including real API/worker/AI interruption, native saver pause/reclaim, fork/pending-write rollback,
  disconnected SQL cancellation, expired-terminal retention and genuine historical upgrade. Every
  owned fixture preserved exact foreign inventory. An expired ninth terminal occupies one of eight
  retained terminal positions, leaving seven graph lineages; unrelated active work and the fixed
  thirty-day boundary retain their existing behavior.
- The first expanded checkpoint campaign passed five cases but exposed a fixture module-identity
  error before historical seeding: a deep built transaction helper did not share the bundled
  infrastructure index's private transaction registry. Both historical seeders now use explicit
  leased SQL transactions, preserving primary/rollback/release failures and typed original requested
  envelope fields. No product fallback was added. Strict integration typing/lint passed, followed
  by the complete six-case green campaign. Its twelve structured/text historical runs preserve all
  retained digests through 6003 and 6004; numeric backfill crosses nine and new real execution works.
- Current text-price campaign: both cases passed in 92.88 seconds (91.61 seconds in tests), with
  actual PT/EN public admission, worker/graph/Market receipt/SSE, restart/replay and closed provenance
  rejection. The populated upgrade starts with genuine 6001-only columns, preserves full retained
  evidence digests through 6002 and then 6003/6004, and executes current repositories only afterward.
- Delivery four-case, checkpoint six-case and text-price two-case files were run serially in full,
  with no filtered, skipped or retried tests. There are no known incomplete implementation tasks.
  The parent will run the complete integration suite and repeat root gates/coverage after reading
  and staging the full diff. Those final verification and review tasks remain outstanding, not
  waived; this plan remains in progress rather than claiming story or initiative completion.

## Independent Verification

### Independent parent verification — 2026-10-12

- Read the complete staged baseline diff, including new files, before independent verification.
  Root lint, strict typecheck, all 1,998 unit tests, build and every unchanged coverage floor passed.
  The focused domain/contracts/application/infrastructure/API/worker sequence passed 246 tests.
- Exact changed-source Prettier and staged whitespace checks passed. The six changed Markdown
  files passed Markdown lint after wrapping one overlong plan line; no lint rules were relaxed.
- The parent ordered-delivery campaign passed all four cases in 242.24 seconds. The parent
  checkpoint campaign passed all six cases in 377.41 seconds. Both commands ran their complete
  files serially, without skipped, filtered or retried cases. Fixture assertions preserved exact
  foreign Docker inventory and metadata. Remaining aliases and the full suite are still running;
  this checkpoint does not claim their success, review completion or story acceptance.
- All six planned parent aliases subsequently passed: delivery 4/4 (242.24 seconds), checkpoints
  6/6 (377.41 seconds), structured tracer 1/1 (71.32 seconds), text-price 2/2 (77.70 seconds),
  executor 2/2 (54.28 seconds) and public Ask contracts 2/2 (34.37 seconds), totalling 17 cases.
  The full integration command rebuilt every workspace successfully and is now running the
  complete serial suite. Its terminal result and the mandatory review are still pending.
- The complete parent integration command subsequently exited successfully: 60/60 tests across
  28 files passed in 1,644.12 seconds (1,623.86 seconds in tests), with no skips or test retries.
  Every planned verification command has now passed. The complete suite includes 35 real-service
  cases and 25 support/convention/cleanup tests. Its normal negative-path sanitizer and retention
  warnings did not fail the tests. Read-only Docker inventory after completion found no remaining
  `rei-` containers or volumes. No foreign resources were deleted or modified.
  The matrix audit below is satisfied by both focused parent runs and the complete integration
  run; mandatory review is the only remaining workflow gate before authorized finalization.

### Matrix test audit — 2026-10-12

All nine intent-contract rows have a covering test that ran and passed in independent parent
verification. Integration references below belong to the complete four-case delivery or six-case
checkpoint campaign; broker/job regressions ran in the complete focused and root unit sequences.

- Capacity: the public capacity/replay case races three new keys, observes exactly two accepted
  responses and one closed 429 with three total pending rows, and verifies no refused effects.
  The same case checks one running plus two queued without changing durable counts.
- Replay at capacity: that case preserves original IDs, rejects changed bodies with 409 and
  foreign capabilities with 403, then prunes only owned temporary platform fences and proves
  original terminal replay restores exactly one inbox without another durable effect.
- Reverse delivery: the capacity/replay case and separate prefetch-one case release real
  unrelated-thread execution while A3/A2 wait for A1, then prove numeric order and actual results.
- Expired active lease: the capacity/replay case interrupts A1 after actual AI/tool/checkpoint
  persistence, ages its claim, proves A2 remains busy and recovers A1 with the same receipt ID;
  the old grant remains forbidden.
- Queue deadline: the capacity/replay and expiry-rollback cases prove fixed 120-second SQL
  lifetime, inclusive SQL deadline despite application-clock drift, null decision/result and no
  execution/checkpoint/receipt for expired work; overdue running work remains running.
- Worker stopped: those cases exercise autonomous API expiry before starting the worker,
  contiguous terminal SSE, retained inbox replay and unchanged API-restart snapshots. Busy-thread
  exclusion allows unrelated expiry; job tests prove bounded nonoverlap and shutdown cancellation.
- Deferral: the real default-prefetch and genuine-failure cases observe more than five source
  transfers with unchanged prior attempts. Broker tests verify persistent mandatory transfer,
  acknowledgement only after confirmation and unsettled source/generation retirement for
  unconfirmed, unroutable or generation-lost transfers, plus shutdown cancellation.
- Genuine failure: the run-scoped SQL executor-fault case observes actual handler attempts
  through the fifth durable DLQ transfer, retained original identity and no automatic replay;
  the running head blocks its successor, queued work expires and another thread completes.
- Upgrade: the genuine populated-6002 checkpoint case preserves all retained history digests
  through 6003 and 6004, checks numeric sequences 1–12 and fixed deadlines, replays historical
  public evidence and completes a new request through the actual worker after upgrade.

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free quick reviewer read the complete unified diff and surrounding
  callers, worker forwarding, traced subscriber results, scoped grants, DTO history predicates
  and historical SQL constraints. It reported no unmet criterion, broken rule or introduced bug.
- patches: none; deferred items: none; rejected findings: none.

## Design Notes

Full route is automatic: this cohesive persistence/contract/consumer/HTTP/maintenance change
exceeds 100 lines and five nonmechanical files. Risk remains high. D-049 resolves the pending
interpretation and the expired/DLQ behavior before coding. The owner mandate overrides skill
interactive pauses; use the BMAD plan and coding-agent handoff, not a second plan or task commits.
This is the implementation phase of an already rendered bmad-build-auto invocation: do not
render or invoke another build workflow, create a branch/worktree, edit ticket entries or commit.
The parent handles review and authorized auto-commit afterward. Before backend changes, read
`/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` fully and its architecture-patterns,
state-isolation, module-communication and testing-patterns references. D-012 / ADRs 0011–0013
and ADR 0026 override alternative stack, repository-port placement and interactive defaults.

Golden expiry and deferral shapes:

```ts
const terminal = { state: 'expired', reason: 'queue_expired', at } as const;
const steps = [{ sequence: 1, phase: 'expired', at }] as const;
// Existing handlers may keep returning void. Ask returns this only for valid busy admission.
type EventHandlerResult = void | { readonly disposition: 'deferred' };
// Source-transfer attempt must remain unchanged, even if it is already greater than one.
```

Numeric FIFO precedes lease replacement. The older running head remains pending after DLQ under
ADR 0025; this is a truthful operational limitation, not a reason to skip it. Terminal expired
turns participate in checkpoint retention's eight-terminal-run ranking. Single-run expiry
transactions preserve ADR 0012; cleanup cannot be folded into a multi-run admission transaction.

## Verification

Use TDD per task: add its regression, run the focused Vitest file and observe the missing-policy
failure, implement, then run it green. Do not weaken existing tests to accommodate a different
behavior. Record actual red/green evidence and unexpected fixture compatibility changes.

**Commands:**

- `pnpm --filter @rei/domain exec vitest run --dir src src/ask/ask-delivery.policy.test.ts` —
  deterministic limit/boundary tests pass.
- `pnpm --filter @rei/contracts exec vitest run --dir src src/ask/ask-live.dto.test.ts` — strict
  old/new run/event/refusal parsers pass.
- `pnpm --filter @rei/application exec vitest run --dir src src/ask` — admission/maintenance /
  consumer fakes and genuine-failure classification pass.
- `pnpm --filter @rei/infrastructure exec vitest run --dir src src/ask src/shared/messaging` —
  numeric FIFO, expiry/rollback/retention and confirmed nonfailure transfer regressions pass.
- `pnpm --filter @rei/api exec vitest run --dir src src/ask` and
  `pnpm --filter @rei/worker exec vitest run --dir src src/ask` — public HTTP error mapping, job
  lifecycle and unchanged executor budgets pass.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — every root gate
  succeeds, including strict integration typing; no omitted workspace.
- `pnpm run test:coverage` — all existing floors pass unchanged for every covered workspace.
- `pnpm run test:integration:ask-delivery` — all real-service outer-surface ACs pass with no skip
  or retry; attach case counts and elapsed time plus exact foreign-resource preservation evidence.
- `pnpm run test:integration:ask-checkpoints`, `pnpm run test:integration:ask-tracer`,
  `pnpm run test:integration:ask-text-price`, `pnpm run test:integration:run-executor` and
  `pnpm run test:integration:ask` — completed checkpoint/replay/public boundary evidence stays green.
- `pnpm run test:integration` — complete serial real-service suite passes, including unrelated
  broker/collection/Market historical campaigns and support cleanup tests.
- `pnpm exec prettier --check` on the exact changed files and `git diff --check` — clean formatting
  and whitespace; normal pre-commit hooks remain enabled when auto-commit is invoked after review.

## Auto Run Result

### Summary

Implemented D-049 / ADR 0026: thread-fenced numeric admission order, three-total pending capacity,
fixed SQL-clock queue deadlines, truthful unexecuted expiry, bounded API maintenance and confirmed
nonfailure broker deferral. Retained receipt/checkpoint/creation/delivery fences prevent duplicate
effects during redelivery and expired-lease recovery. Actual normal fifth-failure delivery still
reaches the durable DLQ; running predecessors remain recoverable rather than falsely terminalized.

### Changed files

- `apps/api/src/ask/ask-live.controller.ts` — map pending-capacity refusal to its closed HTTP 429.
- `apps/api/src/ask/ask.module.ts` — register the API-owned queue-expiry job.
- `apps/api/src/ask/ask-queue-expiry.job.ts` — bound, trace and cancel nonoverlapping expiry cycles.
- `apps/api/src/ask/ask-queue-expiry.settings.ts` — name interval, batch and deadline limits.
- `apps/api/src/http/api-exception.filter.ts` — preserve only the dedicated parsed capacity body.
- `apps/api/src/http/ask-pending-limit.exception.ts` — define the typed capacity exception.
- `migrations/6004_ask_ordered_delivery.sql` — add order/deadline metadata and strict expiry rules.
- `packages/application/src/ask/ask-run.repository.ts` — expose capacity errors and bounded expiry.
- `packages/application/src/ask/ask-run.service.ts` — delegate API expiry to the lifecycle port.
- `packages/application/src/ask/consume-ask-run-request.service.ts` — defer legitimate busy work.
- `packages/application/src/shared/event-subscriber.ts` — allow an explicit nonfailure disposition.
- `packages/application/src/shared/index.ts` — export the compatible subscriber-result contract.
- `packages/contracts/src/ask/ask-live.dto.ts` — parse truthful expiry and closed capacity refusal.
- `packages/domain/src/ask/ask-live.types.ts` — represent expired runs without executed evidence.
- `packages/domain/src/ask/index.ts` — export the deterministic delivery policy.
- `packages/domain/src/ask/ask-delivery.policy.ts` — name pending bound and queue lifetime.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` — enforce order, capacity and expiry.
- `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts` — rank expired terminal turns.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` — confirm busy deferral.
- `apps/api/src/ask/ask-live.controllers.test.ts` — cover typed capacity mapping and no executor.
- `apps/api/src/ask/ask-queue-expiry.job.test.ts` — cover nonoverlap, deadlines and shutdown.
- `apps/api/src/http/api-exception.filter.test.ts` — prove typed 429 and generic sanitization.
- `integration/ask-checkpoints.integration.test.ts` — prove retained expiry and genuine upgrades.
- `integration/ask-text-price-run.integration.test.ts` — seed genuine history and preserve digests.
- `integration/ask-delivery.integration.test.ts` — prove all delivery ACs through the real stack.
- `integration/support/ask-diagnostics.ts` — expose fixed owned order/deadline evidence.
- `package.json` — add the focused TypeScript/Vitest ordered-delivery alias.
- `packages/application/src/ask/ask-run.service.test.ts` — cover the bounded expiry seam.
- `packages/application/src/ask/consume-ask-run-request.service.test.ts` — prove prompt deferral.
- `packages/contracts/src/ask/ask-live.dto.test.ts` — reject forged expiry and refusal documents.
- `packages/domain/src/ask/ask-delivery.policy.test.ts` — prove capacity and deadline boundaries.
- `packages/infrastructure/src/ask/ask-run.pg-repository.test.ts` — cover fenced SQL transitions.
- `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.test.ts` — prove terminal ranking.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.test.ts` — prove settlement.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md` — record accepted D-049.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/`\
  `story-ordered-bounded-and-idempotent-delivery-plan.md` — retain intent and verified evidence.
- `docs/api/ask-checkpoints.md` — document expired-terminal retention semantics.
- `docs/api/ask-tracer.md` — document capacity, numeric FIFO, truthful expiry and durable DLQ.
- `docs/testing/integration.md` — describe the real ordered-delivery and historical campaigns.
- `specs/adrs/0026-ordered-bounded-ask-delivery.md` — capture the accepted delivery decision.

### Review result

The mandatory context-free quick lens reported zero findings. No patches, deferrals or rejected
claims exist. Patched entry counts are high 0, medium 0 and low 0. Follow-up review recommendation
is false: this pass introduced no corrective patch or named remaining unverified risk.

### Verification result

- Root lint, strict typecheck, test and build all passed. All 1,998 unit tests across eight
  workspaces passed; all unchanged 80% statements/functions/lines and 75% branches floors passed.
- Focused domain/contracts/application/infrastructure/API/worker verification passed 246 tests,
  including real Nest HTTP sanitizer regressions in addition to the planned Ask directories.
- All six complete parent aliases passed serially: delivery 4/4, checkpoints 6/6, tracer 1/1,
  text-price 2/2, executor 2/2 and public Ask 2/2. No skipped, retried or filtered cases.
- Complete `pnpm run test:integration` passed 60/60 tests across 28 files in 1,644.12 seconds,
  after successfully rebuilding all eight workspaces. All nine matrix rows have passing evidence.
- Exact changed-source formatting, changed Markdown lint and staged/unstaged whitespace passed.
  New SQL follows migration conventions; no unavailable SQL formatter is claimed.
- Real owned fixture assertions preserved foreign Docker inventory and metadata. Read-only final
  inventory found no remaining `rei-` containers or volumes; no foreign resource was modified.

### Residual risks and boundaries

A deadlettered running head remains recoverable and blocks its successors until authorized
operational recovery, as ADRs 0025/0026 require. Queued successors still expire and other threads
progress. This story does not implement Jev, public confirmation/cancellation, daily quotas,
model explanations, UI, real sources or production/VPS verification; their tickets remain separate.
Owner-blocked VPS work stays blocked. No push, deployment or external action was performed.

The preexisting large web-chunk warning and generated-render Markdown/format findings remain
unchanged; no rule, threshold, hook or assertion was weakened. Temporary parent campaign logs
remain local verification artifacts, not committed payloads. Story acceptance and the next ticket
are orchestrator steps after this built artifact is committed; the initiative is not complete.

### Orchestrator acceptance — 2026-10-12

The build workflow finished with status built and a clean working copy. Every one of the forty
reviewed files appears in the committed change set after the preserved canonical baseline.
The orchestrator marks only story 5.7 done: its public redelivery/capacity/expiry verification,
every root gate, unchanged coverage and the mandatory zero-finding review passed independently.

- Implementation: `5e64443` — `feat: enforce ordered and bounded Ask delivery`.
- Tests: `c63df56` — `test: verify Ask capacity expiry and replay guarantees`.
- Documentation: `9d71166` — `docs: record verified ordered Ask delivery`.
- Normal secrets, formatting, ESLint/Markdown and Conventional Commit hooks passed for each
  applicable commit; no hook changed the verified implementation or tests.
- No push, deployment, VPS access or external action occurred. Production stories remain for
  the owner to unblock. Remaining initiative stories and the final E2E campaign are not complete.
