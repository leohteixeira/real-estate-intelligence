---
title: 'A price-per-square-meter run end to end'
type: 'feature'
ticket: '2'
created: '2026-10-11'
status: done
baseline_revision: '3b86404cf3e4f674980739bcc6800eaded71a362'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0023-structured-ask-tracer-and-scoped-authority.md
warnings: [oversized]
deferred: []
---

# Structured Ask Tracer Implementation Plan

**Goal:** A run created with BRL 785,000 and 68 m² on owned real Compose services reaches a
persisted terminal SSE event carrying the domain result, R$ 11,544.12/m².

**Architecture:** API-owned Ask lifecycle and PostgreSQL event log; transactional requested
outbox; production worker broker consumer through a typed scoped HTTP dispatch port; existing
RunExecutor; actual fixed-decision LangGraph; a typed HTTP backend tool through Market facade.
Live metadata remains distinct from prepared fixtures. D-045/ADR 0023 precede code.

**Tech Stack:** TypeScript, NestJS 12, LangGraph, explicit pg SQL, RabbitMQ, existing named
`@nestjs/resilience`, Vitest, Supertest, Testcontainers-owned Compose and Nock. This cohesive
cross-layer story exceeds 100 changed lines and five files (estimate 2,500–4,500 lines), so the
bmad-build-auto full route and high risk apply. Its sole-source plan/handoff supersedes the
writing-plans default path, unavailable superpowers subskills and per-task commits. Parent owns
verification/review/source-tests-docs commits; no approval is requested under the owner's mandate.

<intent-contract>

## Intent

**Problem:** Story 5.2 (Ask entry 2, after entry 17, CAP-10/13/14) requires every actual layer to
connect. Existing Ask routes only read prepared fixtures; RunExecutor only proves a no-op graph.
Neither can be represented as a completed durable price run.

**Approach:** Add an explicitly structured price-run command and additive live contracts, persist
its lifecycle/events, consume its command with the real worker and execute a real fixed-decision
graph that calls a scoped typed HTTP backend capability. Public reads and resumable SSE report
stored evidence. Retain immutable request/result identity to make redelivery safe after retention.

## Boundaries & Constraints

**Always:** ADRs 0003–0005/0007–0014/0020/0023, D-012/D-043–D-045 win over skill examples.
Application depends only on domain; context-to-context access uses public indexes/facades.
API owns every Ask mutation; AI has no infrastructure dependency/DB/broker/storage credentials.
One aggregate per transaction, outbox in the same transaction as effects, inbox in terminal commit,
ack only after API commit. No network work inside SQL transactions. Fixed origins/paths, no
redirects, single-attempt adapters, bounded deadlines/body reads and named resilience. Caller
authority, dispatch signature and ephemeral tool grant are independent. All repository content
English, pnpm only, no `.env*` reads/searches/edits. Strict TypeScript integration with native
Vitest/Supertest and real owned services; preserve all existing assertions that remain meaningful,
coverage floors, hooks, primary/cleanup failures and foreign Docker resources.

**Never:** Live collection, VPS/server/deploy/push, unrelated context changes, UI/headless client,
model calls, Jev/text extraction, confirmation/cancellation implementation, complete remote
checkpoint recovery or final queue/quota policy claims. No fixture relabeling, operator-token
backdoor, capability in URL/log/event/outbox, plaintext secret in database, arithmetic in AI,
fake production provider, unchecked JSON cast, disabled tests, Node test/assert/custom integration
HTTP/process/port harness. Shutdown abort cannot fabricate a failed terminal. A transport failure
after SSE headers cannot manufacture a stored terminal or leak exceptions.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                                                                               | Expected Output / Behavior                                                                                                                  | Error Handling                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Actual tracer             | Configured owned Compose, structured 78500000 BRL / 68, pt-BR or en                                         | 202 queued; actual requested outbox/broker worker/AI decision/tool; terminal completed with 1154412 minor units/m², no model                | Strict correlated evidence                                      |
| Fixture compatibility     | Existing seven-state catalogue and foundation command                                                       | Identical prepared contracts; fixture reads and foundation hop change no SQL including new Ask tables                                       | Keep existing auth/preview failure behavior                     |
| Create authority          | Missing/malformed/short capability, wrong existing-thread grant, foreign replay key                         | No live history/execution/authority issuance; 401 or 403; never retrieve another grant                                                      | Canonical sanitized envelope                                    |
| Input boundary            | Extra/missing fields, no structured mode, invalid units/UUID/locale/query, tiny area yielding unsafe result | Reject before acceptance/dispatch; fixed decision never guesses numbers from query                                                          | 400, unstructured mode unavailable                              |
| Create replay             | Same key/authority/body, concurrently and after temporary reservation cleanup; changed body                 | Same run/thread IDs, one requested event; changed body409; foreign authority403                                                             | Retained request fence independent of temporary platform rows   |
| Creation atomicity        | Inject requested outbox failure                                                                             | No run, run_event, reservation or requested event committed; same retry recovers prepared thread                                            | Roll back all run aggregate effects                             |
| Delivery identity         | Foreign event/run/thread/revision or same event after terminal and inbox/outbox pruning                     | Reject contradiction; retained terminal replay restores inbox without executor/tool/event duplication                                       | Closed rejection or committed replay                            |
| Claim/fence               | Concurrent duplicate/thread claims, expired claim and stale terminal/tool grant                             | One active claim per thread, short transactions; takeover fences old execution, cached tool receipt reused                                  | Busy is retryable, stale claim rejected                         |
| Tool authorization        | Missing/wrong/expired/foreign grant, mismatched inputs or operation, redirect/malformed response            | No calculation/result disclosure; only exact active run/claim inputs allowed                                                                | 401/403/400 or closed ExternalFailure                           |
| Terminal trust/atomicity  | Forged AI result, injected terminal outbox or inbox failure                                                 | No accepted invented value; no partial state/event/inbox; replay recovers same retained tool receipt                                        | Safe failure/rollback, broker not acked early                   |
| Dependency failure        | Missing dispatch config, absent/wrong AI token, network/5xx or sanitized execution failure                  | Live creation503 if dispatch disabled; otherwise explicit stored failed terminal for definitive execution failure, never fake price success | Collection/health/fixtures remain available                     |
| Cancellation              | Worker shutdown/generation loss, deadline, disconnected tool/stream                                         | Bounded work, no lease/listener leak; controlled abort remains recoverable and unacked                                                      | Preserve original cancellation; no permanent fabricated failure |
| Durable SSE               | Subscribe before processing, reconnect after queued/running, API restart, terminal cursor                   | Stored ordered v1 rows, no gaps/duplicates, explicit retained terminal; empty after final cursor then close                                 | Cancel polling on disconnect                                    |
| SSE/history authorization | Missing/wrong capability, cross-run/version/future/malformed cursor                                         | Refuse before history/headers; no live IDs or payload via fixture catalogue                                                                 | Canonical 401/403/400                                           |
| Privacy/isolation         | Full success and failures with random secrets and synthetic query                                           | Logs/traces/outbox omit query, grant, signing key and bearer; AI lacks infra credentials; traces correlate safe IDs and graph/tool nodes    | Retain every teardown failure                                   |

</intent-contract>

## Code Map

- `packages/domain/src/ask/ask-read.types.ts` / `packages/contracts/src/ask/ask.read.types.ts`
  are independent strict fixture types. Add `ask-live.types.ts` rather than relax synthetic
  metadata or decision source. Existing AskResult is reusable. Original parsers can remain
  fixture-specific; add union/live parsers for routes. Contracts cannot import domain.
- `packages/contracts/src/ask/ask.command.dto.ts`, `ask.read.dto.ts`, `ask.sse.dto.ts` use closed
  wire objects. `askInputsWire` means safe positive integer cents, BRL, finite positive area
  <=1,000,000. Every added wire parser must also enforce semantic state/sequence/result invariants.
- `packages/application/src/ask/ask.facade.ts` / `ask-query.service.ts` authorize prepared reads
  before history. Preserve that service; add distinct live facade and repository/dispatch ports.
- `apps/api/src/ask/ask.controller.ts` serves existing versioned routes; `askPreviewStream` is
  finite fixture logic only, not live storage recovery. Add live routing without breaking its
  direct unit-test construction or inadvertently advertising fixture execution.
- `apps/api/src/persistence/persistence.module.ts` exports DATABASE_CONNECTION, TRANSACTION_RUNNER,
  OUTBOX_APPEND_PORT, UUID_V7_GENERATOR. API Ask may locally provide PostgresInbox for dispatch
  terminal transactions; do not grant AI or the HTTP worker adapter SQL access.
- `migrations/0002_platform_create_delivery_guarantees.sql` defines idempotency but no reservation
  adapter. New Ask migrations start at 6001. Durable identity belongs in Ask, not only expiring
  platform reservations or outbox. Own-schema FKs only.
- `packages/infrastructure/src/shared/persistence/postgres-transaction.ts` supplies the opaque
  transaction bridge and cancellation. `PostgresOutbox`, `PostgresInbox`, existing repository
  adapters/fakes and consumer tests show atomic insertion, rollback and retained event fences.
- `packages/application/src/shared/event-subscriber.ts` carries broker signal/deadline; RabbitMQ
  ack follows resolved handler. `apps/worker/src/main.ts` explicitly starts subscriptions before
  brokerSupervisor.start(). Register the new exported Ask consumer there; provider alone is inert.
- `packages/domain/src/ask/run-execution.types.ts` / contracts `run-execution.dto.ts` are currently
  foundation-only. Extend through discriminated price request/evidence, retaining no-op paths.
- `packages/infrastructure/src/ask/http-run-executor.adapter.ts` already has fixed one-attempt
  POST, manual redirects, body cap, deadlines, sanitized errors and run/thread/step correlation.
  Extend its validated branches; never bypass it by worker fetch.
- `apps/worker/src/ask/ask.module.ts`, `resilient-run-executor.ts`, configuration/settings and safe
  resilience telemetry supply actual production DI and named policies. Missing AI token remains
  safe for collection. A separate dispatch adapter/policy is needed; no hidden adapter retries.
- `apps/ai/src/graph/no-op.graph.ts`, `execution/execution.service.ts`, `execution.http.ts` contain
  actual foundation traversal and auth-before-body middleware. Preserve all their regressions.
  `config.ts` currently lacks API_BASE_URL despite Compose providing it. AI tool implementations
  stay local to AI, behind neutral ports/fakes, never in @rei/infrastructure.
- `packages/domain/src/market/price-per-square-meter.ts` exports pricePerSquareMeter with
  Math.round(priceInCents / areaInSquareMeters). Public Market facade currently has only reads.
  Add a pure calculation facade/provider; tool lives at the Ask grant boundary and calls Market
  through its index. No reciprocal Nest-module dependency or foreign schema access.
- `integration/support/fixture.ts`, `http.ts`, `network.ts` own Testcontainers, Supertest, Execa,
  get-port and Nock. Existing Ask integration asserts no tables/POST: only those obsolete checks
  change; preserve stronger zero-mutation fixture snapshots including Ask tables. RunExecutor
  integration must still prove noOp zero SQL and unchanged prepared availability.

## Tasks & Acceptance

**Execution:**

- [x] Load `/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` and its five required
      references (architecture-patterns, module-communication, state-isolation, testing-patterns,
      authentication) fully before backend edits. Parent already read them independently. This
      plan belongs to an active build-auto run: do not render/invoke another workflow, spawn
      agents, commit/push/mark tickets or change the intent-contract. Use apply_patch for edits.
- [x] `packages/domain/src/ask/ask-live.types.ts`, `ask-run-requested.event.ts`,
      `run-execution.types.ts`, Ask/root indexes — define framework-free live types and exact
      retained requested-event identity; distinguish structured step from foundation. Live states
      for this increment are queued/running/completed/failed, with principalId:null, original
      inputs, fixed decision provenance, result/terminal and ordered steps. Never relabel fixtures.
- [x] `packages/contracts/src/ask/ask-live.dto.ts`, `ask.command.dto.ts`,
      `run-execution.dto.ts`, Ask/root indexes — exact live read/thread/event/create/dispatch/tool
      parsers and independent types. Create branch has `mode:'structured-price-v1'` plus existing
      threadId/placeId/query/locale and inputs. Foundation parsers retain prior behavior. Define
      explicit wire shapes for claim/replay/complete and tool request/receipt; validate safe outputs,
      IDs, timestamps, evidence/node path, state/result coherence and cross-message identity.
- [ ] Adjacent domain/contracts `*.test.ts` — first write/run failing golden and invalid cases,
      implement, rerun. Prove closed recursive fields, unsafe arithmetic, original-input equality,
      UUID/date/sequence/state coherence, no secrets in public/event shapes and foundation parity.

      ```ts
      const inputs = { priceMinorUnits: 78_500_000, currency: 'BRL', areaSquareMeters: 68 };
      expect(parseAskLiveRun(completedWire).result?.minorUnits).toBe(1_154_412);
      expect(() => parseAskLiveRun({ ...completedWire, unexpected: true })).toThrow();
      ```

- [x] `packages/application/src/ask/ask-run.repository.ts`, `ask-live.facade.ts`,
      `ask-run.service.ts`, `run-dispatch.port.ts`, `consume-ask-run-request.service.ts`, indexes —
      capability-authorized creation/read/events and typed worker orchestrator. Port functions
      explicitly cover create/read/events/claim/tool receipt/complete; use opaque transactions,
      neutral types/ExternalFailure and cancellation. Worker validates event, claims through HTTP,
      invokes RUN_EXECUTOR outside SQL, commits terminal through HTTP before returning. Retained
      terminal replay skips executor. Abort/shutdown must not enter definitive-failure branch.
- [x] `packages/application/src/market/market-calculation.facade.ts`,
      `price-per-square-meter.service.ts`, index and adjacent tests — pure backend capability calls
      only existing domain rule, validates safe inputs/output, returns cloned canonical result.
      No AI arithmetic or foreign repositories.
- [x] `migrations/6001_ask_create_structured_runs.sql`, `migrations/README.md`,
      `packages/infrastructure/src/ask/ask-run.pg-repository.ts`, `ask-authority.ts`,
      `in-memory-ask-run.repository.ts`, indexes — API-owned threads/runs/run_event/tool receipt,
      UUIDv7/FK/state/unique sequence/request identity/centavo constraints. Store authority/grant
      digests only. Globally keyed hashed creation key refuses foreign replay and changed body;
      recover thread preparation then atomically create run/event/reservation/outbox. Retain key
      and fingerprint in run after temporary reservation expiry. Use transaction-local locks for
      concurrent creation and per-thread claim, not open transaction during remote work. Claim
      lease is 30 seconds, bounded active worker operation at most 10 seconds; new random executionId
      fences expired claims. Tool grants expire with the claim; fresh grants on takeover reuse
      retained same-input receipts. Terminal verifies run/thread/event/execution identity and the
      stored receipt, then state/event/outbox/inbox commit atomically. Duplicate terminal restores
      inbox without additional terminal rows. PostgreSQL constraints and adapter errors sanitize.
- [x] `packages/infrastructure/src/ask/http-run-dispatch.adapter.ts`,
      `in-memory-run-dispatch.adapter.ts`, indexes and adjacent tests — fixed API origin/routes,
      HMAC request-event-scoped proof (dedicated ASK_DISPATCH_SECRET), one attempt, no redirects,
      strict response correlation, bounded bodies/deadlines, no raw secrets/errors. The wire proof
      binds exact version/eventId/runId/threadId; API compares in constant time and checks stored
      requested identity. No arbitrary path/tool privilege. Fakes clone and emulate failure/replay.
- [x] `apps/api/src/ask/ask.module.ts`, `ask.controller.ts`, new
      `ask-live.controller.ts`, `ask-dispatch.controller.ts`, `ask-tool.controller.ts`,
      `ask-live-stream.ts`, `ask.config.ts`; `apps/api/src/market/market.module.ts` — inject real
      repository/live facade, preserve fixture facade. Public POST `/api/v1/runs` requires strong
      Bearer >=43 bounded ASCII characters and Idempotency-Key; 202 acceptance only after commit,
      409 changed body, 401 malformed auth, 403 foreign authority, 400 malformed request, 503
      dispatch absent. Live reads reuse `/runs/:id`, `/threads/:id`, `/runs/:id/events` with union
      dispatch preserving fixture callers. Private claim/complete routes live only under
      `/api/v1/internal/ask/runs/:id`, tool route under `/api/v1/ask/runs/:id/tools/price-per-square-meter`.
      Grant authorization in Ask precedes invoking exported Market calculation facade, with no
      reciprocal module imports. Expose truthful separate structured availability, not change
      prepared metadata. Parse/authorize cursor before headers; poll ordered persisted rows every
      100 ms with one outstanding read, cancellation/unsubscription cleanup and safe after-header
      transport termination. A terminal cursor closes without duplicates. Never use fixture
      preview failure frames as persisted state.
- [x] `apps/worker/src/ask/ask-run-request.consumer.ts`, `ask.module.ts`,
      `run-dispatch.config.ts`, `resilient-run-dispatch.ts`,
      `run-dispatch-resilience.settings.ts`, `apps/worker/src/main.ts`, Ask index/telemetry —
      real durable subscription `ask.structured-run`, event `ask.run.requested`, started offline
      before supervisor. Actual DI dispatch/executor/orchestrator; safe disabled config and
      collection startup. Named ordered policy uses the existing RunExecutor limits, no retry
      hidden in adapter; broker redelivery is the durable retry. Signals/deadlines reach all hops.
      A typed busy claim reports bounded lease/admission delay; the consumer waits cancellably
      before retrying claim within at most 40 seconds and the broker delivery deadline, then starts
      the active 10-second budget. This is admission, not replaying execution or hidden HTTP retry.
      Do not burn the broker's five one-second failure transfers on a valid 30-second lease.
      Success/replay resolves only after committed API receipt. No SQL access in this consumer.
- [x] `apps/ai/src/graph/price-per-square-meter.graph.ts`, `graph.module.ts`,
      `tools/price-per-square-meter.port.ts`, `http-price-per-square-meter.tool.ts`,
      `resilient-price-per-square-meter.tool.ts`, fake/settings/module,
      `execution/execution.service.ts`, `config.ts` — actual START→fixedDecision→priceTool→END
      path, collected actual node visits. Typed tool uses only configured API_BASE_URL and fixed
      scoped path; ephemeral grant in Bearer only, exact accepted inputs and run/claim identity.
      Single-attempt adapter with named ADR-ordered policy; initially retry attempts1. Validate
      correlated receipt with real calculation provenance. Never import domain arithmetic, public
      thread authority, dispatch key or infrastructure. Preserve foundation graph/auth. Bound AI
      execution through signal/deadline; configurable tracer deadline <= worker10s, no leaked work.
- [x] `compose.yaml`, AI/worker Dockerfile/manifests/lock where actual new edges require,
      root `package.json` — API/worker ASK_DISPATCH_SECRET empty safe default, API fixed origin
      configuration in worker and AI, existing worker→AI token stays separate, no AI dispatch
      secret/infra credentials, no fixed secret or `.env` edit. New focused alias
      `test:integration:ask-tracer` runs the new TypeScript campaign. Preserve OTel preload and
      no unconditional AI dependency for collection. Safe tracing records request/event/run/
      graph-node/tool identifiers and propagation, never question/inputs/secret payloads.
- [x] Adjacent application/infrastructure/API/worker/AI `*.test.ts` — deterministic fakes and
      TDD cover every matrix row: auth/replay/failure/rollback/fence, dependency errors, actual graph
      nodes, request/response mutation isolation, one-attempt counts and abort/cleanup. Name tests
      so parent can audit rows against executed outputs. Do not lower any coverage threshold.
- [x] `integration/ask-price-run.integration.test.ts` — native Vitest real production Compose
      API/worker/AI/PostgreSQL/RabbitMQ and necessary existing MinIO dependency, random ephemeral
      credentials/keys/grants in memory, no `.env`, unique owned project. Prove golden public
      POST→live SSE plus read/thread, queued/event/outbox atomicity before worker start, actual
      fixed graph and backend tool (stored receipt/visited-node evidence), pt-BR/en, replay/body
      mismatch/foreign grants, concurrent claims, SSE follow/reconnect/API restart/disconnect,
      retained identity after exact fixture-owned inbox/published-outbox pruning, bad dispatch/tool
      grants, safe AI-token failure and rollback triggers. SQL/broker may inspect/inject owned test
      failure states, but main success journey must enter through public POST and actual production
      worker, not test-instantiated adapters. Teardown retains primary plus all cleanup errors.
- [x] `integration/ask-contracts.integration.test.ts`, `run-executor.integration.test.ts` — replace
      obsolete no-Ask-tables/no-create-handler checks with no fixture mutations including Ask tables
      and explicit rejection of unsupported text-only create. Keep absent confirm/cancel routes,
      foundation noOp zero mutations, all strict auth and semantic fixture checks.
- [x] `docs/api/ask-tracer.md`, existing Ask/RunExecutor/integration references and this plan —
      documentation-writer reference for exact commands/shapes/statuses/config/new variables,
      minor-unit conversion, authority scopes, receipts/events/retention, tracer non-goals and
      independent real E2E evidence. No checkpoint/model/quota-ready claim. Parent closes built
      then commits source/tests/docs with normal hooks; only then outer ticket orchestration done.

**Acceptance Criteria:**

- Given owned configured real Compose services, when a caller creates the structured 78500000/68
  run and follows `/api/v1/runs/:id/events`, then an explicit stored terminal event is completed
  with 1154412 BRL minor units/m² after actual production worker→AI graph→typed backend tool.
- Given queued creation before worker startup, when SQL/outbox are observed and worker is started,
  then queued state and requested event are atomic and advance into genuine durable progress;
  an injected creation append failure leaves no accepted run or requested event.
- Given the completed run, when same-key creation and requested-event delivery are replayed after
  owned inbox/outbox/reservation pruning, then HTTP returns the same IDs and exactly one logical
  result/terminal event without executing the graph again; conflicting body or authority refuses.
- Given valid or invalid public/grant authority and SSE cursors, when public and internal HTTP
  routes are exercised, then only the correctly scoped caller observes live history/tool evidence
  and persisted resumption; fixture previews remain distinguishable and read-only.
- Given shutdown, dependency faults, stale claims or terminal persistence faults, when the actual
  system is exercised, then no fake result/early ack/partial terminal is accepted and controlled
  abort can be retried safely with every primary/cleanup failure retained.
- Given the complete real journey, when process configuration/logs/traces are inspected, then AI
  has no DB/broker/storage edge and safe trace identity follows all exercised layers without
  exposing query, bearer, tool grant or dispatch key; no VPS or provider call occurs.

## Implementation Notes

- Parent investigation found ADR 0017 bounds ordinary handler failures at five with one-second
  delay; worker broker handler timeout defaults to 120 seconds. Busy claim admission must therefore
  wait cancellably for the retained 30-second lease inside the delivery deadline, rather than
  immediately dead-letter recoverable work. The active execute/commit budget remains 10 seconds;
  admission is separately bounded at 40 seconds. Intent-contract is unchanged.
- Real startup exposed a missing `CREATE SCHEMA ask` in migration 6001; corrected before
  accepting any real-service result. Focused campaigns are re-executed from clean owned fixtures.
- Default Markdown discovery also includes git-ignored `_bmad/render` local instruction snapshots,
  producing 1,377 baseline generated-artifact errors. Verification selects all versioned/new
  product Markdown with `--no-globs`, preserving every lint rule and normal staged hooks; no
  generated workflow snapshot is reformatted or added to Git.
- The expanded worker Ask module initially made the standalone foundation command instantiate
  the broker consumer without its subscriber. Extracted a shared executor-only Nest module;
  the full worker owns durable consumption while the command remains infrastructure-independent.
  Actual Nest context regression tests and the production Compose command now pass.
- AI telemetry shutdown uses an SDK-free bridge to the preload and a Nest lifecycle hook;
  shutdown flushes once and retains failures without reflecting sensitive exception text.

## Plan Change Log

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 3 findings — high 2, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Retained-key replay prepared a foreign thread before authorization —
    independently traced both production transactions: an existing-thread run had no preparation
    row, so a foreign null-thread request inserted and committed one before the retained-run guard.
    Moved the owner/fingerprint check before preparation under the existing key lock, preserving
    the second fence. Targeted tests verify no insertion, forbidden foreign replay and owner conflict.
  - `[high]` `[patch]` Valid terminal snapshots exceeded the dispatch response cap — parent
    reproduced a valid 99,650-byte create yielding a 100,427-byte terminal claim rejected by the
    compiled adapter. One named 128-KiB cap now covers maximum escaped query/slug and wrapper,
    while advertised and streamed oversized responses still fail in one attempt. Unit regressions
    cover large completion/replay; the real campaign adds completed and AI-off replay evidence.
  - `[medium]` `[patch]` New public routes accepted forbidden URL queries — checked the controller
    and existing `readQuery` guard: both new handlers lacked rejection before persistence.
    Both now use the existing closed-query guard. Actual handler tests and real HTTP assertions
    cover unknown, meaningful and repeated query parameters without thread preparation.

Each fix is local, adds no public surface and protects only the reproduced state. No finding
required an intent change, plan re-derivation or deferral. Complete parent verification is rerun
after the patches; their presence alone is not a passed real-service result.

### 2026-10-11 — Follow-up review verification

- verdicts: 5 findings — high 1, medium 1, low 0, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` Repeated retained-key preparation finding described the old transaction —
    the current first transaction locks the creation key, reads the retained run and checks its
    owner and request fingerprint before any preparation insertion. Recording-client regressions
    pass with no insertion for foreign replay and changed owner requests; the second fence remains.
  - `[false]` `[reject]` Repeated response-limit finding described the removed 100,000-byte cap —
    both advertised and streamed response bounds now use the same 128-KiB constant. Passing adapter
    regressions admit large terminal completion and replay with or without Content-Length and
    reject over-limit responses in one attempt. The post-repair real campaign now confirms large
    terminal completion and replay with AI stopped.
  - `[false]` `[reject]` Repeated public-query finding described handlers before their repair —
    both capability and creation handlers now call the existing closed-query guard before their
    service. Passing handler tests reject unknown, meaningful and repeated query parameters;
    the real campaign independently checks that these requests prepare no thread.
  - `[high]` `[patch]` Executor policy timeout becomes an acknowledged permanent failure —
    independently traced the five-second policy mapping to exhausted before the ten-second active
    budget. A parent reproduction against the compiled production consumer and resilient executor,
    shortening only the attempt timeout to five milliseconds, resolved and submitted one failed
    completion with null evidence. The smallest repair must propagate exhausted policy failures,
    as it already propagates cancellation, without committing a terminal or acknowledging delivery.
    The original implementation agent repaired the catch to propagate exhausted alongside cancelled
    unchanged. Two targeted application regressions preserve the original failure and forbid
    completion; an actual worker executor/consumer regression uses the unchanged five-second
    policy inside the ten-second consumer budget and verifies one attempt and no completion.
    These targeted cases and all post-repair local gates pass; the focused real campaign also
    passes. The post-repair full suite subsequently passed all 25 files and 44 cases.
  - `[medium]` `[patch]` The real thread-history assertion omits a second accepted run —
    the campaign creates existingThreadRun in golden.threadId, while the repository returns all
    runs ordered by id. Its later expected singleton history therefore cannot pass. The smallest
    repair must await the second run's actual terminal, verify its result and exactly-once SQL
    evidence, and assert both complete history entries in retained order. Do not remove the replay
    regression or loosen the history assertion. The original implementation agent added bounded
    terminal waiting, exact second-run result/input/receipt provenance and 3/1/1/1 SQL counts,
    and strict ordered two-snapshot history. Targeted strict TypeScript/lint/format checks pass;
    the focused real campaign now passes with both terminal snapshots and all exact counts.
    The post-repair full suite subsequently passed all 25 files and 44 cases.

The fresh context-free reviewer has finished. The parent read all 7,351 lines of the latest
baseline diff and independently confirmed both new findings. The full integration command
finished before any product repair or parallel owned campaign: 24 files and 43 cases passed,
while the tracer failed at its singleton thread-history assertion with the second accepted run
still queued. This independently confirms the history finding; it does not establish completion
of either pending repair. Container inventories are byte-identical before/after, and volume
inventories contain exactly the same entries after canonical sorting. The original implementation
agent completed both minimal repairs. The parent read the complete repair delta and the new
actual-policy regression, confirmed the unchanged public surface and timings, and started the
complete local gates and focused owned real-service campaign. No reviewer or implementer remains
running. Full-suite post-repair verification follows the focused campaign and owned cleanup.
Lint, strict typecheck, build, all 1,605 unit cases in 161 files, unchanged coverage floors and
the 21 support cases passed before this follow-up. Infrastructure coverage is now 84.66%
statements, 79.64% branches, 89.30% functions and 86.54% lines. These are local gate results,
not a substitute for post-repair real-service evidence.

### Post-repair parent verification — 2026-10-11

- The parent rewrote and independently read all 7,518 lines of the repaired baseline diff,
  including the untracked actual-policy regression. The lockfile's complete text diff was also
  inspected independently; the binary diff representation is not treated as dependency evidence.
- Root lint, strict typecheck, unit tests and build passed after both follow-up repairs. All eight
  workspaces ran 162 test files and 1,608 cases: web 14, contracts 146, domain 379, application
  212, AI 42, infrastructure 422, API 166 and worker 227. Logs are retained under
  `/tmp/rei-ask-verify-PL6a36/` as `lint-repaired.log`, `typecheck-repaired.log`,
  `test-repaired.log` and `build-repaired.log`. Build retains the existing web chunk-size warning.
- `coverage-repaired.log` passed every unchanged workspace threshold. Statement/branch/function/
  line percentages are contracts 94.02/93.79/97.77/96.34, domain 94.97/91.38/100/95.39,
  AI 97.26/88.15/91.66/98.34, application 91.65/86.38/98.55/93.18,
  infrastructure 84.66/79.64/89.30/86.54, API 93.13/85.53/97.84/94.51,
  worker 94.42/84.77/91.52/95.66 and web 100/100/100/100.
- The fixture/support command passed 4 files and 21 cases (`support-repaired.log`). Formatting
  and all 116 versioned/new product Markdown files passed without changing rules
  (`format-repaired.log`, `markdown-repaired.log`). The implementation agent separately checked
  formatting of the newly untracked worker regression; final all-file formatting included it.
  All 98 changed supported files and all 116 product Markdown files passed after result drafting
  (`format-final.log`, `markdown-final.log`).
- The focused owned campaign passed 3 files and 5 cases in 303.57 seconds
  (`focused-repaired.log`). This includes actual second-run terminal/receipt/count/history,
  maximum accepted escaped-query dispatch completion and terminal replay with AI stopped.
  All foreign containers and all volumes are preserved. The immediate post-exit inventory
  contained only the campaign's Testcontainers Ryuk janitor in addition to the original inventory;
  it subsequently disappeared automatically.
- The complete root `pnpm run test:integration` passed after the repairs: 25 files and 44 cases,
  exit code 0, 910.21 seconds (`full-repaired.log`). This command independently rebuilds the
  eight workspaces, then runs every integration campaign and fixture/support case. The
  production error-filter and retention warnings come from exercised fault scenarios, not
  failed cases. All original foreign containers and volumes remain unchanged. The owned
  Testcontainers Ryuk janitor subsequently disappeared automatically; the final container
  inventory is byte-identical to the foreign baseline captured before the focused campaign.
  Canonically sorted full-suite volume inventories are byte-identical. The full-suite pre-start
  inventory included the previous campaign's transient janitor, so it is not mislabeled as the
  foreign-resource baseline. No manual resource removal was performed.
- Normal pre-commit scanning rejected an inline synthetic PostgreSQL credential in the worker
  composition test. The fixture now uses a credential-free invalid host; the same four actual
  Nest context tests pass and still assert no SQL query or broker connection. Targeted ESLint and
  formatting pass (`fixture-hook-test.log`). No scanner allowlist, rule or hook was bypassed;
  no production source or integration campaign changed after the complete suite passed.

## Design Notes

Private dispatch is machine authority for one retained event, not an operator credential. An HMAC
over a canonical versioned event/run/thread tuple is replay-safe only together with retained state,
lease fencing and commit-before-ack. Capability digests never grant authority by themselves.
The fixed-decision tracer uses structured inputs, not an inferred natural-language intent. Existing
fixture result validators must not silently accept live provenance. Persisted receipt verification
is the independent witness that the backend—not AI—produced the result. One tool call can be
reissued after a crash, but retained receipts prevent a second logical effect; do not claim exactly
once network execution. API polling is a real durable event follower, not a scripted preview.

## Verification

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — every workspace
  and strict integration typecheck passes; append actual command/result evidence.
- `pnpm run test:coverage` — all eight workspace floors stay at 80/80/80/75 or existing stronger
  values; no excluded new production branches to manufacture coverage.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/support integration/source-register-cleanup.test.ts`
  — native fixture/HTTP/network/cleanup conventions remain green.
- Focused real-service command below — actual public tracer, security/failure cases and existing
  foundation/fixture regressions pass.
- `pnpm run test:integration` — complete owned real-service suite after review, no skip, no weakened
  assertions and no foreign resources removed. Capture Docker inventory before/after each campaign.
- `pnpm exec prettier --check <all changed nonignored supported files>` and
  `pnpm run lint:md --no-globs <all tracked and new story Markdown>` —
  exact changed code/docs formatting and Markdown pass; normal pre-commit hooks must run at commit.

Parent independently stages/reads the full baseline diff including new files, reruns gates after
any code repair, audits all matrix rows against passed named tests, and applies workflow step-04
review before finalizing. Product runner failures are investigated and fixed, never hidden by
skips/retries/coverage changes. Test fixtures own only unique rei-prefixed Compose resources.

### Pre-review results and matrix audit — 2026-10-11

- Root lint, typecheck (including strict integration TypeScript), test and build: passed.
  Eight workspaces ran 160 test files and 1,595 unit cases. Coverage passed every unchanged floor;
  the lowest workspace statement/branch coverage was infrastructure at 83.41%/78.85%.
- Fixture/support and source-register cleanup: 4 files, 21 cases passed.
- Focused real-service campaign: 3 files, 5 cases passed in 227.48 seconds. Its named scenarios
  were the real structured tracer, both Ask catalogue journeys and both RunExecutor boundaries.
  Docker container and volume inventories were byte-identical before and after the campaign.
- Independent verbose matrix checks: application 21, API 15, infrastructure 39, AI 16,
  worker 7 and contracts 15 cases passed. Formatting passed every changed supported file;
  Markdown lint passed all 116 versioned/new Markdown files with no rule changes.
- The parent read all 6,910 lines of the staged baseline diff, including new files, after
  the final production repair. Full integration remains the scheduled post-review gate.

The following are executed tests, not planned coverage. The `tracer` below means the passed
`Ask structured tracer E2E: real graph/tool, atomic SQL, fenced claims, durable SSE and safe failure`
in `integration/ask-price-run.integration.test.ts`.

| Matrix row                | Passed evidence                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actual tracer             | `tracer`: public creation through production broker/worker/AI/tool, retained 1154412 result and terminal SSE; AI graph test records actual fixedDecision and priceTool visits.                                                                               |
| Fixture compatibility     | Both named Ask contracts journeys and both RunExecutor scenarios: prepared responses, foundation traversal and zero SQL changes.                                                                                                                             |
| Create authority          | `tracer`: missing/short bearer, foreign creation replay and thread ownership; scoped API controller creation tests.                                                                                                                                          |
| Input boundary            | Closed wire contracts reject invalid money/area and hidden fields; `tracer` rejects unsupported mode and unsafe arithmetic before acceptance.                                                                                                                |
| Create replay             | `tracer`: concurrent same-key requests, body conflict, foreign authority and replay after owned reservation cleanup.                                                                                                                                         |
| Creation atomicity        | `tracer`: requested-outbox failure leaves no accepted aggregate/event/reservation, retry recovers.                                                                                                                                                           |
| Delivery identity         | `tracer`: wrong signed/stored identity rejected; terminal redelivery after owned inbox/outbox pruning restores acknowledgement without extra execution.                                                                                                      |
| Claim/fence               | `tracer`: thread contention, expired-claim takeover, stale grant/completion rejection and retained receipt reuse; admission unit tests bound busy waits.                                                                                                     |
| Tool authorization        | `tracer`: grant/input mismatch and stale grants; fixed-origin tool tests reject substitutions, redirects, oversized/malformed responses in one attempt.                                                                                                      |
| Terminal trust/atomicity  | `tracer`: forged result refused, injected terminal-outbox/inbox faults roll back, valid replay yields one terminal; application test waits for persisted acknowledgement.                                                                                    |
| Dependency failure        | `tracer`: stopped AI yields explicit safe failed terminal; disabled creation API test and one-attempt dispatch/executor error tests.                                                                                                                         |
| Cancellation              | Application tests preserve cancellation/shutdown and clear busy timers; actual worker executor/consumer test preserves five-second exhausted failure without completion; API tests release disconnect/poll listeners; transports bound ignored AbortSignals. |
| Durable SSE               | `tracer`: follow, reconnect, terminal cursor and API restart; SSE unit tests close terminal replay without fabricated frames or extra polling.                                                                                                               |
| SSE/history authorization | `tracer`: foreign capability and cross-run/version/future/malformed cursors reject before stream history; existing catalogue authority journey passes.                                                                                                       |
| Privacy/isolation         | `tracer`: correlated safe IDs, no secret/query in logs/outbox and AI without infrastructure credentials; categorical telemetry and cleanup tests pass.                                                                                                       |

    pnpm exec vitest run --config vitest.integration.config.ts integration/ask-price-run.integration.test.ts integration/ask-contracts.integration.test.ts integration/run-executor.integration.test.ts

## Auto Run Result

Status: done. Implementation, independent review, all local gates and the complete post-repair
real-service suite passed. Source, tests and documentation are finalized as separate normal-hook
commits. The outer orchestrator verified the evidence and recorded the done transition on
2026-10-11 under the owner's unattended execution mandate.

### Implemented change

Added the actual structured price tracer across API-owned PostgreSQL lifecycle/events, requested
outbox, RabbitMQ worker dispatch, RunExecutor, fixed-decision LangGraph and scoped typed Market
tool. Public history and SSE expose retained canonical calculation evidence. Creation replay,
fenced execution, receipt reuse and atomic terminal/inbox/outbox effects remain independent of
temporary delivery retention. Prepared catalogue and foundation execution remain strictly separate.
The focused real journey produces 1,154,412 BRL minor units/m² from 78,500,000 / 68.

Implementation deviations do not change the intent: existing root package indexes already export
context indexes and required no edits; existing `ask.command.dto.ts` remains fixture-only; the
migration guide already describes generic discovery and required no story-specific change. Tests
use typed inline recording repository fakes rather than adding a production-exported
`in-memory-ask-run.repository.ts`. The standalone command required the shared executor-only Nest
module; it must not accidentally instantiate a broker consumer. No UI was opened or altered.

### Files changed

Paths below are relative to the repository; each reviewed file is listed independently.

- `README.md`
  — link the separate real structured Ask tracer.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md`
  — record D-045 and tracer scope.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/story-a-price-per-square-meter-run-end-to-end-plan.md`
  — preserve intent, implementation, review triage and executed evidence.
- `apps/ai/README.md`
  — explain fixed graph, typed tool and isolated configuration.
- `apps/ai/package.json`
  — add named resilience and telemetry dependencies and preload.
- `apps/ai/src/app.module.ts`
  — register telemetry lifecycle.
- `apps/ai/src/config.test.ts`
  — validate safe fixed API origin and defaults.
- `apps/ai/src/config.ts`
  — expose bounded tracer and API tool configuration.
- `apps/ai/src/execution/execution.controller.ts`
  — propagate cancellation/deadlines through execution.
- `apps/ai/src/execution/execution.service.ts`
  — dispatch foundation and structured graphs separately.
- `apps/ai/src/graph/graph.module.ts`
  — register actual price graph and typed tool dependencies.
- `apps/ai/src/graph/price-per-square-meter.graph.test.ts`
  — prove real node visits, correlation and cancellation.
- `apps/ai/src/graph/price-per-square-meter.graph.ts`
  — traverse fixed decision and backend price tool.
- `apps/ai/src/graph/price-telemetry.ts`
  — trace graph nodes without question or grant payloads.
- `apps/ai/src/otel.ts`
  — preload isolated AI telemetry.
- `apps/ai/src/telemetry-lifecycle.test.ts`
  — verify once-only shutdown and safe failure retention.
- `apps/ai/src/telemetry-lifecycle.ts`
  — flush the preload from Nest shutdown.
- `apps/ai/src/telemetry-shutdown.ts`
  — bridge shutdown without duplicate SDK initialization.
- `apps/ai/src/telemetry.module.ts`
  — provide the lifecycle hook.
- `apps/ai/src/tools/http-price-per-square-meter.tool.test.ts`
  — exercise fixed origin, closed receipts and bounded transport failures.
- `apps/ai/src/tools/http-price-per-square-meter.tool.ts`
  — make one scoped authenticated backend tool attempt.
- `apps/ai/src/tools/in-memory-price-per-square-meter.tool.ts`
  — supply an isolated cloned test double.
- `apps/ai/src/tools/price-per-square-meter-resilience.settings.ts`
  — name and bound tool policies.
- `apps/ai/src/tools/price-per-square-meter.port.ts`
  — define a neutral typed capability.
- `apps/ai/src/tools/price-tool.telemetry.test.ts`
  — prove categorical sanitized tool diagnostics.
- `apps/ai/src/tools/price-tool.telemetry.ts`
  — report safe policy and tool identity.
- `apps/ai/src/tools/resilient-price-per-square-meter.tool.ts`
  — compose ADR-ordered bounded resilience.
- `apps/ai/src/tools/tools.module.ts`
  — wire the tool and policy wrapper.
- `apps/api/src/ask/ask-dispatch.controller.ts`
  — authenticate retained event-scoped claim and completion.
- `apps/api/src/ask/ask-live-stream.test.ts`
  — verify persisted SSE replay, terminal close and cancellation.
- `apps/api/src/ask/ask-live-stream.ts`
  — follow ordered durable events with cancellable bounded polling.
- `apps/api/src/ask/ask-live.controller.ts`
  — publish truthful availability and authorized closed creation.
- `apps/api/src/ask/ask-live.controllers.test.ts`
  — verify authority, disabled admission and query rejection.
- `apps/api/src/ask/ask-request-signal.test.ts`
  — verify request disconnect cleanup.
- `apps/api/src/ask/ask-request-signal.ts`
  — bind HTTP lifetime to cancellation.
- `apps/api/src/ask/ask-tool.controller.ts`
  — validate ephemeral price-tool authority.
- `apps/api/src/ask/ask.config.ts`
  — safely disable live creation without dispatch configuration.
- `apps/api/src/ask/ask.controller.test.ts`
  — preserve prepared reads while routing live views separately.
- `apps/api/src/ask/ask.controller.ts`
  — route fixture or authorized live reads and streams.
- `apps/api/src/ask/ask.module.ts`
  — own lifecycle repository, facade and private controllers.
- `apps/api/src/market/index.ts`
  — export only the public calculation module boundary.
- `apps/api/src/market/market.module.ts`
  — provide canonical Market calculation.
- `apps/worker/src/ask/ask-run-request.consumer.ts`
  — subscribe durably and resolve only after API commit.
- `apps/worker/src/ask/ask.module.ts`
  — compose consumer, dispatch and executor without Ask SQL writes.
- `apps/worker/src/ask/consume-ask-run-timeout.test.ts`
  — reproduce actual five-second exhaustion inside the ten-second consumer budget.
- `apps/worker/src/ask/index.ts`
  — expose the worker consumer boundary.
- `apps/worker/src/ask/resilient-run-dispatch.test.ts`
  — verify scoped dispatch policy mapping and cancellation.
- `apps/worker/src/ask/resilient-run-dispatch.ts`
  — wrap dispatch with named bounded policies.
- `apps/worker/src/ask/run-command.module.test.ts`
  — compile actual standalone command DI without a broker subscriber.
- `apps/worker/src/ask/run-command.module.ts`
  — depend on executor-only wiring.
- `apps/worker/src/ask/run-dispatch-resilience.settings.ts`
  — define dispatch policy names and timing.
- `apps/worker/src/ask/run-dispatch.config.ts`
  — validate fixed origin and safe disabled configuration.
- `apps/worker/src/ask/run-executor.module.ts`
  — share executor wiring independently of durable consumption.
- `apps/worker/src/main.ts`
  — register Ask consumption before broker supervision starts.
- `apps/worker/src/shared/resilience/resilience-telemetry.ts`
  — admit safe dispatch policy categories.
- `compose.yaml`
  — wire distinct API/worker dispatch authority and isolated AI origin.
- `docker/ai.Dockerfile`
  — preserve AI telemetry preload in production startup.
- `docs/api/ask-tracer.md`
  — document exact tracer contracts, authority, recovery and non-goals.
- `docs/api/ask.md`
  — distinguish prepared views from live tracer behavior.
- `docs/api/run-executor.md`
  — document the additive structured execution step.
- `docs/testing/integration.md`
  — describe actual owned tracer E2E evidence.
- `integration/ask-contracts.integration.test.ts`
  — retain strict prepared contracts and expand zero-mutation evidence to Ask tables.
- `integration/ask-price-run.integration.test.ts`
  — prove real tracer, SQL atomicity, history, authority, replay, SSE and isolated cleanup.
- `migrations/6001_ask_create_structured_runs.sql`
  — create own-schema constrained threads, runs, events and tool receipts.
- `package.json`
  — expose the focused typed integration campaign.
- `packages/application/src/ask/ask-live.facade.ts`
  — define authorized live capabilities.
- `packages/application/src/ask/ask-run.repository.ts`
  — define neutral lifecycle persistence operations and safe errors.
- `packages/application/src/ask/ask-run.service.test.ts`
  — verify facade validation, authority and typed delegation.
- `packages/application/src/ask/ask-run.service.ts`
  — orchestrate authorized live Ask operations.
- `packages/application/src/ask/consume-ask-run-request.service.test.ts`
  — verify replay, commit ordering, busy admission and original timeout/cancellation propagation.
- `packages/application/src/ask/consume-ask-run-request.service.ts`
  — execute outside SQL and preserve recoverable exhausted failures without completion.
- `packages/application/src/ask/index.ts`
  — export only the public Ask application boundary.
- `packages/application/src/ask/run-dispatch.port.ts`
  — define typed scoped worker-to-API dispatch.
- `packages/application/src/market/index.ts`
  — expose canonical calculation through the public context boundary.
- `packages/application/src/market/market-calculation.facade.ts`
  — define pure backend calculation capability.
- `packages/application/src/market/price-per-square-meter.service.test.ts`
  — verify canonical rounding, safe arithmetic and defensive inputs.
- `packages/application/src/market/price-per-square-meter.service.ts`
  — call the existing deterministic domain calculation.
- `packages/contracts/src/ask/ask-live.dto.test.ts`
  — reject hidden fields and inconsistent identity, inputs, state or history.
- `packages/contracts/src/ask/ask-live.dto.ts`
  — define independently owned closed live wire contracts and semantic guards.
- `packages/contracts/src/ask/index.ts`
  — export additive live contracts.
- `packages/contracts/src/ask/run-execution.dto.ts`
  — discriminate foundation and structured execution wire shapes.
- `packages/domain/src/ask/ask-live.types.ts`
  — define framework-free structured lifecycle/evidence types.
- `packages/domain/src/ask/ask-run-requested.event.test.ts`
  — verify immutable exact requested identity and primitive payloads.
- `packages/domain/src/ask/ask-run-requested.event.ts`
  — retain the requested run/thread/event identity.
- `packages/domain/src/ask/index.ts`
  — expose the public domain Ask boundary.
- `packages/domain/src/ask/run-execution.types.ts`
  — distinguish foundation and structured execution types.
- `packages/infrastructure/src/ask/ask-authority.ts`
  — hash capabilities and sign exact scoped identity.
- `packages/infrastructure/src/ask/ask-run.pg-repository.test.ts`
  — prove retained authorization precedes preparation and both transaction fences remain.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts`
  — own durable lifecycle, claim fencing, receipts and atomic terminal delivery effects.
- `packages/infrastructure/src/ask/http-run-dispatch.adapter.test.ts`
  — prove exact scope, maximum valid snapshots and one-attempt bounded rejection.
- `packages/infrastructure/src/ask/http-run-dispatch.adapter.ts`
  — use fixed authenticated dispatch with a named 128-KiB response bound.
- `packages/infrastructure/src/ask/http-run-executor.adapter.ts`
  — validate structured correlation and propagate safe causal tracing.
- `packages/infrastructure/src/ask/in-memory-run-dispatch.adapter.test.ts`
  — verify mutation-isolated scripted replay/failure behavior.
- `packages/infrastructure/src/ask/in-memory-run-dispatch.adapter.ts`
  — provide test-only cloned dispatch responses.
- `packages/infrastructure/src/ask/index.ts`
  — export scoped infrastructure adapters.
- `pnpm-lock.yaml`
  — lock actual AI resilience and telemetry edges with aligned peer snapshots.
- `specs/README.md`
  — index ADR 0023.
- `specs/adrs/0023-structured-ask-tracer-and-scoped-authority.md`
  — record the accepted D-045 tracer and scoped authority decision.

### Review disposition

Eight independently triaged findings across the initial and follow-up reviews: three high and
two medium findings patched; three stale claims rejected, zero deferred and zero unverified.
The initial repairs fence retained creation before preparation, bound valid dispatch snapshots
at 128 KiB, and reject forbidden public queries. Follow-up repairs preserve original exhausted
executor failures without terminal completion and verify both actual accepted thread runs.
Each rejected claim is specifically refuted in the triage log: the first transaction already
checks owner/fingerprint, the removed 100,000-byte limit no longer exists, and both public
handlers already invoke the closed-query guard. The original implementation agent applied all
repairs, with independently rerun parent gates and actual focused real-service evidence.

Follow-up review recommendation is false: the patched timeout mapping is exercised with the actual
default five-second executor and ten-second consumer budget; the history and large-snapshot
regressions now pass on real services. No specific unverified risk remains from those findings.
Full integration independently passed after those repairs; it was not replaced by focused checks.

### Verification and residual scope

The verified implementation is committed as `dadfff15b41035cb1383e77e4bcc66a80ffed77a`
(source), `f173e1d1624b527691eace3ab724405143c4e713` (tests) and
`3b1314598131ce72612b2e1516b77a0e1d6795c1` (documentation). The outer orchestrator confirmed
the clean worktree and exact 98-path change set before closure. Root lint, typecheck, unit tests
and build were repeated successfully after the credential-free unit-fixture hook repair;
the complete real-service suite remains valid because that repair changed no production source
or integration campaign. Closure changes only this plan, not the tested product.

Completed command outcomes, logs, coverage and the 15-row matrix audit appear in `Verification`
and `Post-repair parent verification` above. The complete suite passed 25 files and 44 cases
in 910.21 seconds. Normal-hook commits separate the 66 implementation/configuration files,
22 test files and 10 documentation files. No push is performed.

The parent independently audited the green tests and all 15 matrix rows; an archived first-red
TDD transcript is not available, so the original red-phase task remains unchecked rather than
claiming independently observed evidence for that historical implementation step.

This increment intentionally leaves model-based natural-language extraction, explanations,
confirmation/cancellation, quotas, complete remote checkpoints and UI journeys to their own stories.
Receipt reuse guarantees one retained logical result, not exactly-once network execution.
Claim recovery uses broker redelivery with bounded admission; it does not establish an unlimited
retry or retention policy. No VPS, deployment, push, real collector, provider call or `.env*`
operation was performed. `ASK_DISPATCH_SECRET` is the new API/worker-only variable with a safe
empty default; AI receives no dispatch key. Existing configured API origins remain fixed.
