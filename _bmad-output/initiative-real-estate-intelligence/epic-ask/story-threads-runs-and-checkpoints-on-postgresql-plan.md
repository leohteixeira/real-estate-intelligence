---
title: 'Threads, runs and checkpoints on PostgreSQL'
type: 'feature'
ticket: '6'
created: '2026-10-11'
status: done
baseline_revision: 'ee8e3e967d2c6047ecb5a63c4195ed8471defa24'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0025-run-scoped-remote-graph-checkpoints.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
warnings: ['oversized']
deferred: []
---

# Threads, runs and checkpoints implementation plan

**Goal:** A real Ask run survives interruption of the API, worker or AI process and resumes its
durable graph on the same thread, without repeating its logical run or Market effect.

**Architecture:** The API owns PostgreSQL graph state behind an application port and closed HTTP
saver protocol. Per-invocation AI graph/saver closures hold fresh authority outside persisted
canonical graph state. Existing claims, retained receipts and broker delivery own fencing/recovery.

**Tech stack:** NestJS 12, explicit PostgreSQL SQL, RabbitMQ, installed LangGraph 1.4.21 and its
checkpoint 1.1.6 serializer, strict TypeScript, Vitest/Supertest/Testcontainers/Nock.

The owner's BMAD plan location and full-route coding handoff override writing-plans' alternative
location, interactive execution choices, extra subskills and per-task commits. Implement this one
story in `feat/phase-1`; do not render another workflow, dispatch agents, commit, push, deploy,
access VPS, read/search/edit `.env*`, run provider probes or change other repositories. The parent
owns review, final root verification, auto-commit and ticket acceptance. Read and follow
`/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` and its architecture-patterns,
state-isolation, module-communication, authentication and testing-patterns references before backend
edits. ADRs and D-012 override ORM/NX/Jest/domain-port/event-emitter examples. Use `apply_patch`.

<intent-contract>

## Intent

**Problem:** Ask threads/runs/events/receipts survive restarts, but graph progress and pending
writes do not. Persisting the existing graph input would leak ephemeral authority, and transient
executor interruption can currently terminate a recoverable run.

**Approach:** Persist complete run-scoped graph checkpoints through the API's typed remote saver,
resume with fresh fenced authority, and prove actual three-process mid-run restart continuity.
Implement the 30-day/eight-turn checkpoint lifecycle and reserved principal ownership additively.

## Boundaries & Constraints

**Always:** API-only Ask writes; strict closed transport; actual canonical thread ID; immutable
run/event/input identity; separate checkpoint/tool grants; same-thread exclusion; bounded delivery,
HTTP, SQL and retention; truthful persisted traversal and retained receipt proof; TypeScript
integration and unchanged quality/coverage/security hooks; exact fixture ownership; preserve data
and unrelated work. D-048/ADR 0025 is accepted before implementation.

**Never:** AI database/broker/storage credentials, public or dispatch authority in AI, grants or
RunnableConfig in checkpoints, raw exception payloads/logs, arbitrary saver URLs/SQL, replay/fork of
foreign history, fabricated success/evidence, manual terminal SQL as restart proof, production
fault switches, destructive broad cleanup, old migration edits, new public confirmation/Jev/quota
or UI/model behavior. VPS stories remain owner-blocked.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                                                                                   | Expected Output / Behavior                                                                               | Error Handling                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Fresh run                     | Retained event, active claim, empty run-scoped saver                                            | Persist canonical input, decision, pending writes and tool evidence synchronously; complete original run | Safe closed rejection for invalid input                                                               |
| API/worker/AI interruption    | Committed decision checkpoint, process dies before tool completes                               | New process/claim resumes pending tool on same run/thread, one receipt and terminal                      | Transport stays recoverable; existing bounded broker retry/dead letter                                |
| Effect/checkpoint gap         | Market receipt committed, saver write interrupted                                               | Tool replay returns retained receipt; eventual checkpoint/terminal are truthful                          | No second effect                                                                                      |
| Finished graph, lost terminal | Terminal graph checkpoint but run remains running                                               | Current authorized tool rebinds same retained receipt, verifies result, completes same run               | Stale receipt never locally rewritten                                                                 |
| Pause                         | Real LangGraph static pause before tool, durable pending work                                   | Fresh graph resumes null input on same thread; previously executed decision is not rerun                 | No public confirmation endpoint advertised                                                            |
| Sibling runs                  | Same thread, different retained run/input/mode                                                  | Latest checkpoint lookup cannot load sibling state                                                       | Foreign run/thread/version/parent denied                                                              |
| Authority                     | Tool grant at saver, saver grant at tool, old execution, expired claim                          | All reads and writes refuse without effects or disclosure                                                | Safe forbidden, no authority fallback                                                                 |
| Replay                        | Same checkpoint/write key and same content                                                      | Idempotent success, stable lineage                                                                       | Different ordinary content conflicts; reserved negative writes follow installed replacement semantics |
| Retention                     | More than eight terminal turns or fixed 30-day horizon reached                                  | Prune only eligible graph payloads and writes; preserve terminals/events/receipts/replay identity        | Pruned active state cannot silently reset                                                             |
| Invalid wire/storage          | Unknown keys, malformed serialization, oversized bytes/body, foreign parent, SQL failure, abort | Reject safely, rollback, no grants/payloads in logs                                                      | Definitive rejection versus recoverable unavailability distinguished                                  |
| Upgrade                       | Populated 6001/6002 structured/text history                                                     | Add saver storage and nullable principal; preserve exact historical digests and constraints              | No applied migration edit                                                                             |

</intent-contract>

## Code Map

- `packages/domain/src/ask/ask-live.types.ts` and `run-execution.types.ts`: provider-free execution
  shapes. Add checkpoint grant only to internal price execution input, never public snapshots or
  foundation. Domain depends on nothing; contracts mirror shapes independently.
- `packages/contracts/src/ask/ask-live.dto.ts`, `run-execution.dto.ts`, `shared/wire.ts`:
  closed parsers, retained identity, safe UUID and strong-grant validation. Keep prepared/live and
  foundation discriminators unchanged; internal price input gets mandatory `checkpointGrant`.
- `packages/application/src/ask/ask-run.repository.ts`, `ask-run.service.ts`:
  API-owned lifecycle, `AskLiveError` safe categories. Saver port/facade belongs here, not domain
  SDK declarations; use a dedicated port with an in-memory fake for policy tests.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts`: `stored`, `identity`, `lock`,
  `active`, `claim`, `tool`, `complete`. Reuse/refactor focused internal authorization helpers if
  shared with saver, never duplicate divergent fences. Claim lasts 30 seconds; tool replay
  rebinds receipt to current execution. Terminal + inbox + event + outbox is already atomic.
- `migrations/6001_ask_create_structured_runs.sql`, `6002_ask_text_price_runs.sql`: read-only
  applied history and strict checks. Next additive migration is `6003_ask_graph_checkpoints.sql`.
- `packages/infrastructure/src/shared/persistence/postgres-transaction.ts` and
  `database-connection.ts`: cancellable short transactions/disposable query leases; no vendor
  client type crosses to API or integration. Keep network work outside SQL transactions.
- `apps/api/src/ask/ask-tool.controller.ts`, `ask-dispatch.controller.ts`,
  `ask-request-signal.ts`, `ask-live-http.ts`, `ask.module.ts`: fixed authenticated endpoint,
  disconnect cancellation and safe error mapping. New saver controller must not use a public
  capability, tool grant or global dispatch secret as checkpoint authority.
- `apps/ai/src/graph/price-per-square-meter.graph.ts`: current state contains full request and
  grant; remove that before compiling with saver. `price-telemetry.ts` needs only identity, not
  secret-bearing request. `graph.module.ts` must inject per-invocation factory, not shared state.
- `apps/ai/src/execution/execution.service.ts`: current update-only traversal restarts every time;
  replace with saved-state identity validation, fresh/null input selection and complete actual
  node evidence. `execution.controller.ts` currently gives text only 2 seconds; both price modes
  use the same existing 4.5-second configurable tracer budget, foundation retains 2 seconds.
- `apps/ai/src/tools/http-price-per-square-meter.tool.ts`, resilient wrapper and settings:
  copy fixed-origin/one-attempt/stream-bound/cancellation conventions, not grants or tool scope.
  SDK bridge stays in AI. Add checkpoint 1.1.6 directly via pnpm only if imports need it.
- `packages/application/src/ask/consume-ask-run-request.service.ts`: currently transient errors
  become terminal. Rethrow transient like cancelled/exhausted; definitive invalid evidence/auth
  still commits safe failure. Admission 40 seconds, lease 30 seconds, execution 10 seconds remain.
- `packages/infrastructure/src/ask/http-run-executor.adapter.ts` and
  `apps/worker/src/ask/resilient-run-executor.ts`: 5xx/network is already transient; one attempt
  remains. Update stale no-durable-dedup comment without raising retry/timeouts to hide failures.
- `integration/ask-price-run.integration.test.ts`, `ask-text-price-run.integration.test.ts`:
  real create/claim/graph/tool/terminal/SSE and migration fixtures; adapt inputs and changed
  transient expectation without deleting regression cases. Existing API restart is after terminal
  and does not satisfy this story. Existing manual lease expiry proves fencing, not graph resume.
- `integration/support/fixture.ts`, `http.ts`, `cleanup.ts`, `ask-diagnostics.ts`:
  exact Testcontainers ownership, Execa fault commands, Supertest, safe SQL evidence. Reuse all;
  new probe in `integration/fixtures/` must be erasable TypeScript with no Vitest import.
- `apps/worker/src/shared/delivery-retention.job.ts`: read-only scheduling pattern for bounded
  nonoverlapping cancellation/telemetry; Ask retention runs in API through its own port.

Installed saver facts: `BaseCheckpointSaver` implements get via getTuple and inherited delta
history. Implement getTuple/list/put/putWrites/deleteThread; deleteThread must refuse because
machine execution grants do not grant deletion. Serializer `dumpsTyped`/`loadsTyped` returns
json/bytes typed data; preserve checkpoint v/id/ts/channel values/versions/versions_seen and pending
writes `[taskId, channel, value]`. Checkpoint IDs are vendor UUID6, not domain UUIDv7. `put`
returns projected addressing config; parent comes from prior configurable checkpoint_id. Runtime
resets top-level namespace to empty: remote scope must bind run separately. Set durability sync;
resume null, never fresh input. Negative slots are error=-1/scheduled=-2/interrupt=-3/resume=-4;
ordinary slots retain first content. Sanitized errors, never raw exceptions, enter pending writes.
Do not spread Runtime/RunnableConfig/callbacks into metadata. Use local installed declarations as
the version-specific authority, not recalled examples from another version.

## Tasks & Acceptance

**Execution:**

- [x] Task 1 — `packages/domain/src/ask/graph-checkpoint.types.ts`,
      `packages/contracts/src/ask/graph-checkpoint.dto.ts` and unit tests, corresponding `index.ts`
      exports, internal input/parser tests: write failing closed-envelope and grant-separation tests,
      run focused Vitest, then implement independent primitive transport types/parsers. One endpoint
      `POST /api/v1/ask/runs/:id/checkpoints` accepts the following discriminated operation contract.
      Keep serialization fields SDK-independent; types shown define the transport, not SDK exports.

  ```ts
  interface CheckpointBytes {
    readonly type: 'json' | 'bytes';
    readonly base64: string;
  }
  interface CheckpointAddress {
    readonly version: 1;
    readonly eventId: string;
    readonly runId: string;
    readonly threadId: string;
    readonly executionId: string;
    readonly graphVersion: 'price-v1';
    readonly namespace: string;
  }
  type CheckpointOperation =
    | { readonly operation: 'get'; readonly checkpointId: string | null }
    | { readonly operation: 'list'; readonly beforeId: string | null; readonly limit: number }
    | {
        readonly operation: 'put';
        readonly checkpointId: string;
        readonly parentId: string | null;
        readonly checkpoint: CheckpointBytes;
        readonly metadata: CheckpointBytes;
      }
    | {
        readonly operation: 'put-writes';
        readonly checkpointId: string;
        readonly taskId: string;
        readonly writes: readonly {
          readonly index: number;
          readonly channel: string;
          readonly value: CheckpointBytes;
        }[];
      };
  type CheckpointRequest = CheckpointAddress & CheckpointOperation;
  interface CheckpointRecord {
    readonly checkpointId: string;
    readonly parentId: string | null;
    readonly checkpoint: CheckpointBytes;
    readonly metadata: CheckpointBytes;
    readonly pendingWrites: readonly {
      readonly taskId: string;
      readonly index: number;
      readonly channel: string;
      readonly value: CheckpointBytes;
    }[];
  }
  type CheckpointResponse =
    | { readonly operation: 'get'; readonly record: CheckpointRecord | null }
    | { readonly operation: 'list'; readonly records: readonly CheckpointRecord[] }
    | { readonly operation: 'put' | 'put-writes'; readonly saved: true };
  ```

  Exact keys and discriminator-specific parsers are mandatory. Limit namespace/task/channel to
  safe bounded framework identifiers (namespace <=256, task <=128, channel <=128), UUID6/UUIDv7
  canonical checkpoint IDs, canonical base64 with <=256 KiB decoded checkpoint, <=4 KiB metadata,
  <=256 KiB decoded pending value, <=32 writes and <=768 KiB serialized request. These limits
  preserve the existing 16,000-character query contract even for escaped/Unicode text and START
  channels; do not make already-valid input unexecutable. Bound total encoded retained pending
  writes per checkpoint to 1 MiB. List limit is 1..20, descending database sequence with exclusive
  before checkpoint ID; return fewer records when reaching the 8 MiB response byte cap, never
  store a tuple that exceeds the single-record cap. Limit responses to 8 MiB and reject unsupported
  SDK metadata filters at
  the local bridge; filtering is not authorized by this first protocol. Define parser names
  `parseCheckpointRequest`, `parseCheckpointResponse`, `parseCheckpointRecord`. Grant goes only
  in HTTP Bearer, not checkpoint request/body. Price execution input adds mandatory
  `checkpointGrant` validated like toolGrant; foundation input remains unchanged. Test exact
  boundaries, extra keys, malformed/cross-operation response, invalid IDs, bad base64 and values.

- [x] Task 2 — `migrations/6003_ask_graph_checkpoints.sql`,
      `packages/application/src/ask/graph-checkpoint.port.ts`,
      `packages/application/src/ask/graph-checkpoint.service.ts`, fake/tests and facade exports,
      `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts`,
      existing `ask-run.pg-repository.ts`/tests and exports: establish API-owned persistence and
      grant scope after focused tests fail. Add nullable principal UUID to thread, checkpoint grant
      digest and durable first-checkpoint/expiry marker to run. New Ask-owned checkpoint/pending-write
      tables have own-schema FK, run/graph/namespace/ID compound keys, durable sequence, parentage,
      encoded bytes, metadata, content identity and fixed expiry. Never FK another context.

  ```ts
  interface GraphCheckpointPort {
    execute(
      request: CheckpointRequest,
      grant: string,
      signal: AbortSignal,
    ): Promise<CheckpointResponse>;
    prune(limit: number, signal: AbortSignal): Promise<number>;
  }
  ```

  Use the retained identity/thread advisory lock before checking current execution, database-time
  claim expiry, running state and checkpoint digest. Fresh claims generate independent random
  tool/checkpoint grants and rotate both atomically; neither is persisted as plaintext. Get and
  list require authorization even when state is empty. First checkpoint fixes run graph horizon.
  Put validates same-run/graph/namespace parent, monotonic head and exact content replay; stale or
  foreign forks fail. Put-writes requires an existing scoped checkpoint, per-task/index identity,
  immutable ordinary slots and fenced replacement only for documented negative slots. Acknowledge
  commit truthfully, cancel SQL on disconnect, rollback failures and sanitize driver errors. Unit
  tests exercise service/fake/matrix; real SQL checks belong to integration, never mocked semantics.

- [x] Task 3 — `apps/api/src/ask/graph-checkpoint.controller.ts`/tests,
      `graph-checkpoint-retention.job.ts`/tests, `graph-checkpoint-retention.settings.ts`,
      `ask.module.ts` and lifecycle composition: expose only fixed checkpoint RPC with strict
      JSON/content type, path/body run agreement, dedicated Bearer and `askRequestWork` cancellation.
      Include `apps/api/src/configure-api.ts` and its tests for a bounded route-specific saver JSON
      parser (768 KiB). Preserve all existing endpoint body limits; do not increase the global limit.
      Both streaming and content-length oversize checks must reject at the HTTP boundary. Include
      long accepted Unicode/escaped structured and text query regression cases in the real journey.
      Use the application service and safe `AskLiveError` mapping. No deletion route. Named retention
      defaults are interval 60,000 ms, batch 50 runs, operation deadline 5,000 ms; scheduler starts
      once at API startup, never overlaps, cancels and drains on shutdown, reports only categorical
      outcome/counts. These defaults require no new env variable. SQL uses database time and thread
      lock, preserving current execution consistency. Retain unexpired active lineage and up to latest
      eight terminal run turns; prune all checkpoint/write payloads of eligible old turns or expired
      horizons. Persist pruning marker so an expired active run cannot restart at empty state. Never
      remove business run/event/receipt/idempotency evidence. Test exact 30-day boundary, 8/9 turns,
      active protection, terminal history survival, nonoverlap, errors, cancellation and restart.

- [x] Task 4 — `apps/ai/src/graph/remote-checkpoint-saver.ts`/tests,
      `http-graph-checkpoint.adapter.ts`/tests, `resilient-graph-checkpoint.adapter.ts`/tests,
      `graph-checkpoint-resilience.settings.ts`, graph wiring and AI manifest/lockfile: build the
      local vendor bridge against installed checkpoint 1.1.6, with no vendor types in shared layers.
      Constructor receives exact immutable run/event/thread/input scope, fresh checkpoint grant,
      signal/deadline and fixed configured API origin. Implement BaseCheckpointSaver projection and
      serde round trips, complete tuple/parent/pending writes, bounded list, put return addressing,
      documented special write indices and safe refusal of deleteThread. Reject caller-config
      thread/scope mismatch and unsupported filters/forks before HTTP. Metadata projection excludes
      configuration/runtime authority; sanitize error values before serialization. Empty latest and
      expired/pruned state are distinct: expired is definitive safe refusal, never fresh start.
      HTTP performs one attempt, no redirects, strict output and identity, 768 KiB request/8 MiB
      streamed response bounds and cancellation through body reading. Resilience has named safe
      fallback -> bulkhead (3 concurrent/6 queued/500 ms) -> breaker (50%, 20 minimum calls/10 s,
      open 30 s, one half-open, slow 2.5 s) -> one-attempt retry -> rate (50/s, no wait) -> timeout
      (3.5 s), additionally bounded by invocation deadline. Preserve categorical definitive versus
      transient failures through wrapper; fallback never returns an empty successful checkpoint.
      Tests cover complete serialization, writes/replay, malformed/oversized/hanging bodies, abort,
      redirects, cross-scope, erased secrets, error sanitization and contention. Use typed transports
      and native Vitest, no explicit any/suppressions.

- [x] Task 5 — `apps/ai/src/graph/price-per-square-meter.graph.ts`/tests,
      `price-graph.factory.ts`/tests, `graph.module.ts`, `price-telemetry.ts`,
      `apps/ai/src/execution/execution.service.ts`/tests and controller/tests: separate durable input
      from nonserialized invocation authority and compile a fresh graph/saver for every invocation.
      Existing injectable PRICE_GRAPH can become the factory token; update its consumers/tests.

  ```ts
  type DurablePriceInput = Omit<
    PriceExecutionRequest,
    'executionId' | 'toolGrant' | 'checkpointGrant'
  >;
  interface PriceAuthority {
    readonly executionId: string;
    readonly toolGrant: string;
    readonly signal: AbortSignal;
    readonly deadlineAt: number;
  }
  // State contains DurablePriceInput, actual decision/visitedNodes and validated receipt,
  // never authority. Nodes close over PriceAuthority; saver closes over its separate grant.
  const config = {
    configurable: { thread_id: input.threadId },
    signal,
    durability: 'sync' as const,
    streamMode: 'updates' as const,
  };
  const saved = await saver.getTuple(config);
  const graphInput = saved ? null : { input: durableInput };
  const updates = await graph.stream(graphInput, config);
  for await (const update of updates) {
    signal.throwIfAborted();
    void update;
  }
  const final = await graph.getState(config);
  ```

  Use tuple existence, not a truthy business channel, to distinguish fresh versus interrupted
  initialization: a saved START checkpoint can still hold canonical input in pending writes.
  Validate persisted canonical input (including START/pending state) against every current
  retained identity/mode/locale/query/inputs field before resuming. Actual nodes append evidence to
  durable state, so resumed response includes earlier completed nodes without inventing traversal.
  Completed graph recovery calls existing authorized Market tool to rebind retained receipt,
  verifies same receiptId/result/provenance and then emits current-execution evidence. Never
  overwrite executionId locally as proof. Static pause test uses actual graph interruptBefore
  tool and recompiles/resumes with the same saver; no production fault flag, no advertised Jev
  confirmation. Unit tests with fake durable saver cover two modes, concurrency across threads,
  stable decision evidence, effect-before-checkpoint and graph-before-terminal gaps, fresh claim
  authority and secrets absent from decoded checkpoint/writes/metadata. Controller applies tracer
  deadline to both price modes, not only structured, leaving foundation behavior intact.

- [x] Task 6 — `packages/application/src/ask/consume-ask-run-request.service.ts`/tests,
      `apps/worker/src/ask/consume-ask-run-timeout.test.ts`,
      `run-executor-resilience.settings.ts` comments and affected input fixtures: retain transient
      interruption for durable redelivery while preserving safe definitive failure. Add explicit
      predeadline transient regression and existing definitive-invalid-evidence/auth/cancel/deadline
      regressions. The essential classification is:

  ```ts
  if (
    Date.now() >= deadlineAt ||
    (isExternalFailure(error) && ['transient', 'cancelled', 'exhausted'].includes(error.kind))
  )
    throw error;
  // Only a definitive unavailable/rejected result follows existing complete(failure) path.
  ```

  AI saver/tool transient errors produce safe 503; definitive malformed/forbidden/expired state
  produces a non-5xx safe rejection so worker does not retry corrupt state as success. Include
  `apps/ai/src/tools/price-per-square-meter.port.ts`, HTTP/resilient tool wrappers and their tests
  in this task: preserve failure category through them and the saver instead of turning every
  exception into an indistinguishable PriceToolFailure or 503. No raw causes cross the HTTP wire.
  Keep one adapter attempt, 30-second lease, 40-second admission and bounded broker delivery;
  never weaken timing or assertions to hide an outage.

- [x] Task 7 — `integration/ask-checkpoints.integration.test.ts`,
      `integration/fixtures/ask-checkpoint-resume-probe.ts`, shared safe diagnostics,
      `integration/ask-price-run.integration.test.ts`, `ask-text-price-run.integration.test.ts`,
      `run-executor.integration.test.ts` and root `package.json`: add failing real-service restart
      campaign, then demonstrate it passes. Add alias `test:integration:ask-checkpoints` selecting
      this TypeScript campaign. Use a unique Testcontainers-owned PostgreSQL/API/RabbitMQ/worker/AI
      stack, generated authority in memory, synthetic data only and no `.env` loading.

  ```ts
  // Parameterize API, worker and AI faults as native Vitest cases (not merely driver mocks).
  // Acquire fixture-owned SQL barrier blocking tool progress, create real run via public POST.
  await vi.waitFor(
    async () => {
      expect(await observedCommittedDecisionCheckpoint(runId)).toBe(true);
    },
    { timeout: 30_000, interval: 100 },
  );
  await fixture.execute(['kill', '--signal', 'KILL', service]);
  // Release the owned barrier and restart precisely that owned service; poll public run/SSE.
  expect(completedRun.id).toBe(runId);
  expect(completedRun.threadId).toBe(threadId);
  expect(completedRun.result?.minorUnits).toBe(1_154_412);
  expect(receiptCount).toBe(1);
  expect(terminalEventCount).toBe(1);
  ```

  These helper names are descriptive test-local functions to implement using the existing
  typed DatabaseConnection and public parsers, not product seams. Observe committed checkpoint
  before killing, with SQL trigger/advisory-lock barrier owned by the fixture and bounded polling
  for actual process progress. Do not sleep as a fault-timing assumption or manually seed terminal
  state. Assert actual decision checkpoint/node count stays one, pending tool resumes with fresh
  execution, same retained event/run/thread/fingerprint and stable receipt, terminal inbox/outbox,
  replayable contiguous SSE and grant-free decoded state/logs. Exercise completed-before-terminal
  and tool-before-checkpoint interruption, actual saver pause/resume from a fresh Node TS process,
  cross-run/mixed-mode isolation, stale/swapped/cross-thread grants, immutable put/write replay,
  concurrent writers, cancellation/SQL rollback and paused lineage survival. Test real retention
  and populated 6002->6003 upgrade with exact pre/post history digests; clock shifting is confined
  to test-owned SQL fixtures, not sleeps/changed production policy. Invalid serialized state never
  produces a fake receipt or reset. The old stopped-AI assertion becomes outage->restart->complete
  and a distinct wrong-AI-token case still reaches failed safely. Shared cleanup preserves all
  primary/cleanup errors and foreign Docker containers/volumes; no broad prune/remove commands.

- [x] Task 8 — `docs/api/ask-checkpoints.md`, `docs/api/ask-tracer.md`,
      `docs/testing/integration.md`, `specs/README.md` and this plan: document actual protocol,
      grant/identity boundaries, recovery versus definitive failure, 30-day/eight-turn semantics,
      strict TypeScript command and honest scope. ADR 0025/epic Notes already record D-048; do not
      re-decide them. Preserve append-only Implementation Notes. Record RED/GREEN commands/results,
      touched files and residual risk. Run every verification below, fix causes, preserve thresholds.

**Acceptance criteria:**

- Given a publicly created structured or admitted PT/EN text run on the owned production stack,
  when the API, worker or AI process is killed after its decision checkpoint commits and restarted,
  then that same run/thread finishes through the real tool and persisted terminal SSE, with one
  decision traversal, one retained receipt, one logical effect and one terminal/inbox outcome.
- Given a real LangGraph paused before its tool with state stored through the production saver API,
  when a fresh AI graph process resumes null input with the same canonical thread and fresh claim,
  then only the pending tool executes and truthful full traversal evidence completes the run.
- Given a tool committed before checkpoint or a graph completed before terminal commit, when
  redelivery obtains a fresh claim, then the retained receipt/result is authoritatively reused
  and no stale execution evidence, duplicated run/effect or invented terminal is accepted.
- Given multiple runs and structured/text modes in one thread and another independent thread,
  when recovery and hostile swapped/stale grants or checkpoint addresses are sent, then own
  history resumes without sibling leakage and unauthorized reads/writes produce no effect.
- Given nine terminal turns, active work and checkpoints at the fixed 30-day boundary, when the
  real API-owned retention executes, then at most eight unexpired terminal turns and protected
  active lineage remain, business terminal/SSE/receipt/replay fences survive, and removed active
  state cannot silently restart. A checkpoint row is never counted as a conversation turn.
- Given populated structured/text history under 6002, when additive 6003 is applied, then existing
  history digests/constraints remain intact and reserved principal identifiers stay null.
- Given malformed envelopes, cancelled requests, broken transport or invalid authority, when saver
  or run execution is attempted, then operations stay bounded and safely rejected/recoverable as
  appropriate, without payload/grant logs, credential persistence or weakened existing gates.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 1 findings — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` An empty SDK state `next` does not prove terminal completion
    when the latest durable tuple still contains completed decision pending writes.
    The parent verified `ExecutionService.traverse`, its definitive 400 mapping and
    the installed SDK `_prepareStateSnapshot` at `dist/pregel/index.js:481-552`:
    pending writes are applied to previously prepared tasks, which are then excluded
    from `next` without scheduling their successor. The reviewer reproduced an
    interrupted step-1 put followed by a fresh execution returning 400 with zero
    tool calls. The applied one-line correction requires explicitly empty retained
    pending writes as well as empty `next` before bypassing traversal. Four real
    compiled-SDK regressions cover both price modes at decision and tool pending-write
    gaps, preserving terminal persistence, one node traversal and authorized receipt
    rebind. Their RED failures and GREEN passes were independently inspected; the
    parent repeated all root and focused gates after the correction.

## Design Notes

Route full is required: this cross-layer persistence/security change exceeds 100 lines and five
files. Risk remains high because wrong checkpoint authorization or replay can disclose history,
repeat effects or claim false durability. The complete graph lineage is retained within its
window; there is no premature intermediate-checkpoint compaction. Eight turns means latest eight
terminal runs, plus active work, never eight graph nodes. Public terminal history is independent
of graph retention. A durable expiry/pruning marker prevents accidental replay as a fresh graph.

Ordinary checkpoint writes are immutable; special negative pending slots may be replaced as the
installed runtime requires. Run-scoped remote authorization is essential even though the canonical
thread_id is stable and top-level namespace is empty. Per-invocation closures avoid shared mutable
authority across simultaneous runs. Dynamic user confirmation is not part of this tracer; native
pause/resume evidence establishes the persistence primitive for its later story.

## Verification

- `pnpm --filter @rei/contracts exec vitest run --dir src src/ask/graph-checkpoint.dto.test.ts`
  and corresponding named tests from Tasks 2–6 in their owning workspaces — expected: initial
  new-contract/behavior failure, then all focused cases passing without skips or retries.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` from repository root —
  expected: all workspaces and strict integration TypeScript pass; context/migration boundaries
  unchanged. Run sequentially because integration checking consumes compiled declarations.
- `pnpm run test:coverage` — expected: every affected workspace preserves >=80% statements,
  lines/functions and >=75% branches, no new exclusions to hide behavior.
- `pnpm run test:integration:ask-checkpoints` after build — expected: actual mid-run API, worker
  and AI restart cases, pause/resume, gaps, scope/replay, retention and populated upgrade pass.
- `pnpm run test:integration:ask-tracer`, `pnpm run test:integration:ask-text-price`,
  `pnpm run test:integration:run-executor`, `pnpm run test:integration:ask` — expected: old public
  and foundation/prepared protocols remain truthful, definitive failure and outage recovery covered.
- `pnpm run test:integration` — expected: entire discovered real-service integration/API-E2E suite
  plus support cases pass, not only new tests; foreign Docker resources retained byte-identically.
- `pnpm run test:integration:list`, focused Prettier and Markdown checks, `git diff --check` —
  expected: all new cases discovered exactly once, valid docs and whitespace, no JS integration,
  Node assert/test/manual HTTP/process harness or any/suppression introduced.
- Exact-label Docker inventory before/after campaigns — expected: no owned leaks, unrelated
  containers/volumes untouched. Save logs outside repository under a fresh `/tmp/rei-ask-5-6-*`
  directory; never print credentials, connection strings or grant/serialized checkpoint payloads.

## Implementation Notes — installed SDK compatibility

- Installed LangGraph 1.4.21 creates its START checkpoint using step -1. The installed
  `@langchain/langgraph-checkpoint@1.1.6/dist/id.js` `uuid6(clockseq)` passes that value to
  `@langchain/core/utils/uuid` v6; the resulting UUID6 has the clock-sequence group `ffff`.
  The installed LangGraph `dist/pregel/loop.js` checkpoint creation and checkpoint package
  `dist/id.js` are the version-specific primary source. Checkpoint IDs therefore accept
  canonical SDK UUID6 hexadecimal/version-6 IDs including that initial clock sequence.
  Domain UUIDv7 run/thread/event/execution IDs remain unchanged and strict. The contract
  regression accepts the installed START ID only as a checkpoint ID and rejects it in
  each of those four retained identity fields.

- Exact installed primary-source locations, relative to the repository root:
  `apps/ai/node_modules/@langchain/langgraph/dist/pregel/loop.js:285` initializes metadata
  at -2, `:322` advances its initial step to -1, and `:876` passes the step to checkpoint
  creation. `apps/ai/node_modules/@langchain/langgraph/dist/channels/base.js:153` calls
  `uuid6(step)`. `apps/ai/node_modules/@langchain/langgraph-checkpoint/dist/id.js:16`
  forwards clockseq into core v6. Core 1.2.17's
  `apps/ai/node_modules/@langchain/core/dist/utils/uuid/v1.js:61` writes the supplied
  clock sequence without masking a negative step back to the RFC variant. These paths
  resolve to the pinned pnpm packages; this exception belongs only to checkpoint IDs.

- Native campaign RED evidence: the initial four-case command had one pass and three
  failures in its new SSE decoder, despite all three killed-service runs retaining one
  decision and reaching a single receipt/terminal. After correcting frame parsing, the
  expanded six-case command produced three passes and three failures. Worker and AI
  SIGKILL recovery and the genuine populated 6002->6003 upgrade passed; API restart
  exhausted bounded broker delivery while its listener was offline, disconnected SQL
  was still waiting at the test's exact five-second deadline, and a later fresh pause
  exposed pending-write/checkpoint ordering. Results are retained outside the repository
  under `/tmp/rei-ask-5-6-K5ZOgk/checkpoints.log`.

- Installed-SDK ordering source: LangGraph `dist/pregel/loop.js:358-362` chains `put`
  asynchronously, while `:402` starts `putWrites` independently. The remote saver now
  waits for its invocation-local checkpoint acknowledgement before FK-bound pending
  writes. A delayed-put unit regression verifies this without adding remote retries,
  accepting unknown checkpoint IDs or relaxing database lineage constraints.

- Cancellation evidence distinguishes client abort from database rollback. Destroying
  a pg lease closes its socket; a PostgreSQL advisory-lock wait can remain visible until
  the unchanged five-second statement timeout observes that close. The native test
  therefore polls for actual backend disappearance before releasing the fixture lock
  and verifies that no checkpoint was committed. The API restart fixture starts the
  killed service immediately; its thread fence only controls admission after HTTP is
  reachable and does not hide the offline interval, change delivery limits, republish
  broker messages or seed recovery terminal state.

- The subsequent six-case campaign reached five passes and one failure, retained in
  `/tmp/rei-ask-5-6-K5ZOgk/checkpoints-final.log`. PostgreSQL disconnect/rollback,
  worker and AI restart, fresh-process recovery with both persistence gaps, and the
  genuine populated upgrade passed. The remaining API case observed approximately
  4.4 seconds between the initial execution and API readiness/fixture expiry:
  `22:07:02.675` to `22:07:07.083` UTC. It retained the running run and three checkpoints,
  committed no receipt, and exhausted the unchanged delivery budget into one dead
  letter. A PostgreSQL thread lock cannot block claim attempts against an offline HTTP
  listener. The fixture now resolves exactly one project/service-labelled container,
  kills and promptly starts that same container through its existing Execa boundary,
  and expires only its owned interrupted claim concurrently. No production delivery
  policy, manual republish, request retry or recovery terminal seeding was added.
  Passing brief-restart evidence must not be read as recovery from outages beyond
  this existing broker budget.

- Historical upgrade fixtures apply the original migration files through 6002 to a
  fresh owned PostgreSQL instance before populating structured/text history, then
  apply 6003. Fixture SQL that seeds historical completed history belongs only to
  the populated-upgrade proof; live restart and persistence-gap cases obtain their
  terminal state from the production worker. No old migration is changed.

- Local GREEN gates: root `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`,
  `pnpm run build` and `pnpm run test:coverage` all exited zero after the saver-ordering
  correction. The unit run passed 1,956 tests in 170 files across eight workspaces,
  with no skips. Minimum affected-workspace coverage was 82.36% statements,
  77.84% branches, 88.29% functions and 84.27% lines (Infrastructure); all unchanged
  thresholds passed. Build retains the existing web chunk-size advisory, not a
  failed gate. Strict integration TypeScript, focused Prettier, the five changed
  Markdown documents and `git diff --check` also passed. Discovery listed all six
  new native cases exactly once among 56 total integration/support/API-E2E cases.
  Logs are `/tmp/rei-ask-5-6-K5ZOgk/{lint,typecheck,test,build,coverage}-final.log`,
  `integration-typecheck-final.log`, `discovery-final.log` and `markdown-final.log`.

- Implementation touches the Ask domain/contracts/application exports and grant
  fixtures; additive 6003 and Ask-owned PostgreSQL repositories/authorization;
  the private API RPC, bounded route parser and retention lifecycle; AI saver,
  transport/resilience, per-invocation graph factory and truthful receipt recovery;
  worker/application failure classification without timing-policy changes; native
  TypeScript checkpoint journeys, their fresh-process probe, existing structured
  outage/authentication journey and safe shared diagnostics; package manifests,
  pinned lockfile/declarations and protocol/testing references. Existing epic and
  ADR 0025 decision content and prior unrelated specification edits are preserved.

- Native GREEN: `pnpm run test:integration:ask-checkpoints` exited zero with six
  of six tests and one of one files passing, no failures/skips, in 368.53 seconds.
  `/tmp/rei-ask-5-6-K5ZOgk/checkpoints-green.log` contains the final campaign.
  The three killed-service cases each completed with fresh execution and retained
  run/thread/requested-event/fingerprint, one decision/receipt/terminal/inbox/outbox
  and zero dead letters. The other cases proved scoped concurrent/rollback RPCs and
  actual cancelled SQL disappearance; fresh-process pause/rebind, both persistence
  gaps, escaped/Unicode inputs and real API-owned expiry/eight-turn retention; and
  populated historical 6002->6003 preservation followed by production completion.
  Exact-label cleanup and foreign resource metadata assertions passed for every
  fixture. Safe kill-to-readiness timing instrumentation was added after this
  campaign loaded; its exact new timing is therefore not claimed from this log and
  will be recorded by the subsequent full-suite execution.

- Handoff verification boundary: the parent implementation workflow will independently
  inspect the complete canonical-baseline diff and execute `pnpm run test:integration`
  before review/acceptance. The implementation child does not claim that entire
  discovered-suite gate has passed. Task 8 stays open until that final gate and
  workflow review are recorded. No commit or workflow acceptance is performed here.

- Subsequent legacy RED: the structured tracer alias passed one of one tests, while
  the unchanged text-price alias passed its historical-upgrade case and failed its
  public contextual journey (one pass/one failure). PT and EN runs completed with
  one receipt each, but the following contextual run terminated safely as failed
  with two checkpoints, five pending writes and no receipt. The sanitized campaign
  did not retain the underlying HTTP status; it is not asserted retrospectively.
  Logs are `ask-tracer-final.log` and `ask-text-price-final.log` in the same temporary
  campaign directory. The original contextual fixture and assertions are unchanged.

- A second ordering RED reproduced the installed loop's actual promise chain: the
  next `put` is not invoked until the prior network-delayed checkpoint ACK, but its
  `putWrites` can already run. Waiting only for an already-registered local put was
  insufficient. The deterministic regression observed `put-writes` before `put`
  and the strict fake boundary refused that unknown checkpoint as `rejected`;
  `saver-future-put-red.log` records one failure/five passes. This is exact local
  cause evidence, not a claim that the unavailable legacy HTTP status was captured.
  The saver now rendezvous on future registration and ACK, bounded by the immutable
  invocation deadline/signal, without remote retries or relaxed lineage/authority.
  Successfully decoded authorized get/list tuples and put ACKs track exact
  namespace/checkpoint IDs, so retained writes do not wait for an unrelated put.
  Shared registration uses a promise holder; individual waiter cancellation only
  removes its own timer/listener, never another waiter's shared rendezvous.

- Final ordering GREEN: `saver-future-put-green.log` records 18/18 tests in two
  files (11 saver, seven graph), including two same-key waiters on future ACK,
  shared invocation abort/deadline and prior-put failure, loaded get/list tuples
  under an unrelated active namespace put, and sequential PT/EN/contextual runs
  on one canonical thread. Per-call independent abort is not a saver input; all
  waiters share their invocation's immutable signal/deadline. Final root lint,
  strict typecheck, unit, build and coverage gates then exited zero, passing
  1,963/1,963 tests in 170 files across eight workspaces. AI coverage is 94.39%
  statements, 86.35% branches, 91.59% functions and 96.41% lines; minimum affected
  workspace coverage remains Infrastructure's 82.36/77.84/88.29/84.27. Final logs
  are `{lint,typecheck,unit,build,coverage}-final.log` in the campaign directory.
  The earlier six-of-six native checkpoint GREEN preceded this last ordering
  refinement; the parent's full discovered-suite verification must confirm the
  native cases and restart-timing instrumentation on the final revision.

- Further legacy RED after the independent future-put fix still passed one of two
  text-price cases and failed the unchanged contextual journey. Targeted diagnostic
  executions retained only categorical evidence: `rejected`, `http-conflict`, `put`;
  API-only temporary branch telemetry identified `head-parent`, with a present head
  and parent but unequal IDs, and no self-parent. Saved step -1 had database sequence
  9 and saved step 0 had sequence 10; the decision ran, but step 1 was rejected
  before any receipt. The diagnostic logs are `ask-text-price-status.log` and
  `ask-text-price-conflict.log`. Targeted commands skipped the historical case only
  for diagnosis, not as an acceptance claim. The original fixtures/assertions stayed
  unchanged, and temporary repository conflict telemetry was removed after localization.

- The concrete lineage cause was numeric ordering, not malformed canonical input:
  repository queries projected `sequence::text` and used unqualified `ORDER BY sequence`.
  PostgreSQL resolves that output name to the projected text, making 9 sort after 10.
  Get/list/head queries now explicitly order by the underlying qualified bigint
  `ask.graph_checkpoint.sequence`, without relaxing any parent, immutable replay,
  authority, scope or SQL deadline fence. The native RPC fixture appends a 12-checkpoint
  chain crossing 9 -> 10 and checks latest lookup, full descending list and exclusive
  pagination. Immediate and network-delayed installed-graph traversal unit tests record
  per-run head/parent and emitted/serialized ID relationship booleans; all eight graph
  cases pass (`graph-lineage-delay.log`). The test remote now enforces immutable puts
  and head-parent parity rather than accepting every emitted checkpoint.

- Read-only causal confirmation used the current exact-project/service-labelled
  PostgreSQL fixture: `SELECT sequence::text` over bigint values 9 and 10 with
  unqualified `ORDER BY sequence DESC` returned `[9, 10]`; the otherwise identical
  query with `ORDER BY checkpoint.sequence DESC` returned `[10, 9]`. It made no
  data/schema changes and exposed no payload or authority. The final focused
  graph/saver/execution regressions passed 24/24 tests in three files, including
  category-only telemetry privacy (`graph-lineage-final.log`).

- Final child numeric-ordering GREEN: the unchanged complete
  `pnpm run test:integration:ask-text-price` alias exited zero with 2/2 tests,
  one file, no skips/failures, in 245.89 seconds (`ask-text-price-numeric.log`).
  The previously failing contextual journey now completes through its real tool,
  and the historical 6002 regression also passes. Final AI-workspace units pass
  89/89 tests in eleven files (`ai-postnumeric.log`); root lint, changed-file
  Prettier, five-file Markdown lint and whitespace checks pass. Discovery remains
  56 total cases with six native checkpoint cases exactly once
  (`discovery-postnumeric.log`). The numeric-ordering infrastructure build exited
  zero. No owned running Compose containers remained after the text campaign.

- Final-revision handoff boundary, explicitly superseding earlier verification
  scope: at the parent's request the child did not repeat the native six-case
  campaign or the other three legacy aliases after the final numeric fix, nor the
  complete root typecheck/unit/build/coverage/discovered-suite gates. The parent
  owns independent complete-diff inspection and all final gates, including native
  latest/list/pagination across sequences 9/10, both directions of grant separation,
  restart timing, all four legacy aliases and the entire discovered suite. Earlier
  native 6/6 and root 1,963/1,963 results apply to their explicitly recorded prior
  revisions, not this final revision. Tasks 7 and 8 remain verification-open until
  those parent results and review are recorded. No commit/acceptance was performed.

- Parent final-diff inspection identified a D-048 transport classification gap:
  the price tool used one catch for streamed body reads and JSON/receipt parsing.
  A synthetic HTTP 200 JSON response emitted one partial body chunk, then its next
  read failed with a socket-like `TypeError`; the focused regression expected
  `transient` but received `rejected`. The RED run passed 13/14 tests and failed
  only that stream-interruption case (`price-tool-stream-red.log`). Its companion
  cancellation, malformed JSON and streamed-overflow cases already passed with
  `cancelled`, `rejected` and `rejected`, respectively.

- The price tool now isolates JSON/receipt parsing in a definitive-rejection
  catch, while unrecognized body-read failures are transient unless the immutable
  invocation signal/deadline has cancelled. Known failures, receipt identity and
  input validation, fixed origin, redirect rejection, 16 KiB response bounds,
  reader cleanup, one-attempt delivery and all existing deadlines remain unchanged.
  Each new post-header regression explicitly asserts exactly one transport call.
  The focused GREEN passed 14/14 tests in one file (439 ms), and the complete owning
  AI workspace passed 93/93 tests in eleven files (2.04 seconds). AI-scoped ESLint
  and the two changed tool files' Prettier check exited zero. Evidence is retained
  in `price-tool-stream-green.log`, `ai-stream-classification.log`,
  `ai-stream-classification-lint.log` and `price-tool-stream-format.log` under the
  same `/tmp/rei-ask-5-6-K5ZOgk` campaign directory. No native campaign, full suite,
  root gates or commit was performed during this targeted follow-up; the parent
  continues to own final independent verification, and Tasks 7/8 remain open.

- The parent's final-revision Ask alias was RED with both cases failing at the
  fixture's strict table inventory before any public journey: additive migration
  6003 correctly introduced `graph_checkpoint` and `graph_pending_write`, while
  the expected list still contained only the four 6002 Ask tables. Evidence is
  `/tmp/rei-ask-5-6-cRGw1I/ask.log` (0/2 passed; two inventory failures). The fixture
  now expects all six tables in the database's existing sorted order, adding only
  those two names. The exact inventory equality, every Ask table's zero-row check,
  complete before/after SQL count/digest equality, foreign-resource preservation
  and all public journey, authority and replay assertions remain unchanged.

- The complete `pnpm run test:integration:ask` alias is now GREEN: 2/2 passed in
  one file, no failures/skips, exit zero, 34.92 seconds. This includes the seven
  production API SSE journeys and the full-thread edited-confirmation preview.
  Changed-test ESLint and Prettier and `pnpm run typecheck:integration` exited zero.
  Logs are `ask-schema-green.log`, `ask-schema-lint.log`, `ask-schema-format.log`
  and `ask-schema-typecheck.log` in `/tmp/rei-ask-5-6-cRGw1I`. Only the integration
  fixture inventory and these append-only notes changed in this follow-up; no
  product code, migration, assertion relaxation, other campaign or root full-suite
  gate was changed/run, and no commit was made. The parent's remaining verification
  and review still determine completion of Tasks 7/8.

- Independent parent verification on the final numeric-ordering and streamed-body
  classification revision passed root lint, strict typecheck, unit, build and
  unchanged coverage gates. Units passed 1,969 tests in 170 files across all eight
  workspaces, with no skips. Infrastructure remains the minimum affected coverage
  at 82.36% statements, 77.84% branches, 88.29% functions and 84.27% lines.
  Focused contract/application/API/AI/worker tests also passed (6/13/21/67/1).
  All 37 integration campaign/helper/probe files are TypeScript; their strict
  dedicated check and 25 support cases in four files passed. Discovery registered
  56 cases, with each of the six new checkpoint cases present exactly once.
  Changed-file Prettier, seven changed Markdown documents and whitespace checks
  passed. Logs are retained under `/tmp/rei-ask-5-6-cRGw1I/`.

- The parent's final-revision native checkpoint command exited zero: 6/6 tests
  in one file, no skips or retries, duration 417.17 seconds (`checkpoints.log`).
  Actual kill-to-ready intervals were API 2,142 ms, worker 886 ms and AI 1,980 ms;
  every restarted run completed with one receipt and zero dead letters. The RPC
  case passed latest/list/exclusive-pagination checks across numeric sequences
  9/10, both grant directions, concurrent replay and actual SQL cancellation.
  Fresh-process pause/reclaim, both persistence gaps, mixed-mode isolation,
  fixed-horizon/eight-turn retention and genuine populated upgrade also passed.
  These timings demonstrate only brief recovery within existing bounded delivery,
  not arbitrary outage recovery. Four legacy aliases and the full discovered
  suite are still running; no aggregate full-suite pass or acceptance is claimed.

- Subsequent parent results complete all four legacy aliases: structured tracer
  1/1 (68.88 seconds), text-price 2/2 (75.50 seconds), RunExecutor 2/2
  (52.45 seconds), and Ask prepared/public contracts 2/2 after the strictly
  additive schema-inventory correction above. The parent then repeated root
  lint/typecheck/unit/build/coverage after that test-only correction; every gate
  exited zero, with 1,969 units in 170 files and unchanged coverage thresholds.
  Evidence is `{lint,typecheck,test,build,coverage}-postschema.log` in the parent
  temporary directory. The independently launched complete discovered-suite
  command is still running in `integration-full.log`; it is the remaining
  verification gate before matrix audit and mandatory workflow review.

- Final parent full-suite GREEN: `pnpm run test:integration` exited zero with
  56/56 tests in 27/27 files, no failures/skips/retries, duration 1,345.11 seconds.
  This command rebuilt all applications/packages and ran the complete discovered
  integration/support/API-E2E suite on the final revision, including the corrected
  strict prepared-Ask inventory. Its native restarts recorded API 1,977 ms, worker
  961 ms and AI 1,926 ms kill-to-readiness. Evidence is `integration-full.log`.
  After campaigns, an independent selective Docker metadata comparison confirmed
  all 13 foreign containers and all 13 foreign volumes unchanged. No `rei-`
  Compose containers or volumes remained; the Testcontainers reaper is allowed
  its normal bounded self-retirement, never manually removed as a foreign resource.

- Quick-review recovery RED/GREEN: the installed compiled SDK prepares tasks before
  applying durable pending writes, then filters already-written tasks from `next`
  without preparing their successors. Primary source is the installed
  `apps/ai/node_modules/@langchain/langgraph/dist/pregel/index.js`,
  `_prepareStateSnapshot` at lines 501, 529-548 and `getState` at lines 578-583;
  the actual resume loop consumes pending writes and checkpoints completed tasks
  in `dist/pregel/loop.js` at lines 471-487 and 520-537. Thus an empty `next` alone
  does not prove that the final checkpoint is durable.

- Four real compiled-SDK regressions now cover both structured and text modes,
  failing the remote `put` at metadata step 1 or 2 only after the preceding node's
  writes persist. Before the fix, both decision-write cases returned 400 on fresh
  execution with no tool call, while both tool-write cases returned evidence but
  left the retained checkpoint at step 1 instead of terminal step 2. The RED graph
  command passed 8/12 tests and failed exactly those four new cases. The service's
  completion condition now additionally requires explicitly empty retained pending
  writes; otherwise it uses the existing null-resume path. No public surface,
  authority fallback, evidence synthesis, transport retry or bound changed.

- Recovery GREEN passes 17/17 tests in the two edited-code covering files
  (12 graph and five execution tests), duration 1.48 seconds, exit zero. Each
  mode/gap case creates a fresh factory/saver and execution/checkpoint/tool grants,
  confirms the SDK snapshot's misleading empty `next`, persists terminal step 2
  with empty pending writes, and observes exactly one real decision-node and one
  tool-node traversal. The typed idempotent test tool preserves one logical effect
  and the same receipt while authorized recovery and subsequent finished-graph
  rebind return the current execution ID. Existing native pause and finished-graph
  rebind tests remain unchanged and pass. Changed-file ESLint/Prettier pass; no
  broader tests or campaign ran. Evidence is
  `/tmp/rei-ask-5-6-cRGw1I/pending-writes-resume-{red,green,lint,format}.log`.
  Parent final-revision verification/review remains required; no commit was made.

## Parent Matrix Test Audit

Final post-review full-suite GREEN: `pnpm run test:integration` exited zero with
56/56 tests in 27/27 files, no failures/skips/retries, duration 1,372.23 seconds.
Its repeated native kill-to-ready intervals were API 1,847 ms, worker 956 ms and
AI 2,208 ms. Discovery passed with all 56 cases and each native checkpoint case
registered exactly once. Selective Docker metadata comparisons prove all 13
foreign containers and all 13 foreign volumes unchanged; no owned Compose or
Testcontainers resources remain. Evidence is `integration-full-postreview.log`
and `discovery-postreview.log` in the parent directory. This completes the matrix
audit and Task 8 on the reviewed correction.

Post-review legacy GREEN: the structured tracer passed 1/1 test in 68.99 seconds,
text-price passed 2/2 in 75.58 seconds, RunExecutor passed 2/2 in 52.56 seconds,
and prepared/public Ask contracts passed 2/2 in 33.67 seconds. All four aliases
exited zero without skipped or retried cases. Evidence is
`{ask-tracer,ask-text-price,run-executor,ask}-postreview.log` in the parent
temporary directory. The complete discovered suite also passed as recorded above.

Post-review native GREEN: `pnpm run test:integration:ask-checkpoints` passed
6/6 tests in one file, exit zero, no skips/retries, duration 411.08 seconds.
`checkpoints-postreview.log` records actual kill-to-readiness API 2,198 ms,
worker 960 ms and AI 1,933 ms. Each original run completed with fresh execution,
one retained receipt and terminal/inbox outcome and zero dead letters. Real RPC
numeric lineage/replay/fencing/cancellation, fresh-process pause and both effect
gaps, mixed modes/long input, actual retention and genuine populated upgrade also
passed. The full discovered suite also passed as recorded above.

Post-review parent root verification passed lint, strict TypeScript, 1,973 unit
tests in 170 files, build and unchanged coverage thresholds. AI units are 97/97;
the repeated focused gates passed contracts 6/6, application 13/13, API 21/21,
AI 71/71 and worker 1/1. Infrastructure remains the lowest affected coverage at
82.36% statements, 77.84% branches, 88.29% functions and 84.27% lines. AI is now
94.37/87.25/92.50/96.32. Evidence is the `*-postreview.log` root/focused logs in
`/tmp/rei-ask-5-6-cRGw1I/`. The native and legacy campaigns on this corrected
revision also passed as recorded above, as did the complete discovered suite.

Every immutable matrix row has covering tests that actually ran and passed in
the parent's native six-case command and complete 56-case command. Supporting
unit cases also ran in the focused gates and the final 1,973-test root command.
There are no registered-but-filtered, disabled or skipped covering cases.

| Matrix row                    | Passing coverage                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh run                     | Three publicly created native restart journeys; structured tracer; PT/EN/contextual text journey; long escaped/Unicode inputs in native fresh-process case                  |
| API/worker/AI interruption    | Three actual committed-decision SIGKILL journeys, retained identity, fresh claim, one receipt/terminal/inbox/outbox and zero dead letters                                   |
| Effect/checkpoint gap         | Native fresh-process case rejects checkpoint insertion after real receipt commit, then recovers that same receipt through production execution                              |
| Finished graph, lost terminal | Native fresh-process case resumes a finished graph on fresh claims, authoritatively rebinds the same receipt and completes the original run                                 |
| Pause                         | Native fresh-process pause/reclaim case runs the actual installed graph in fresh Node TypeScript probes, resumes null input and preserves decision traversal                |
| Sibling runs                  | Native RPC scope and fresh-process mixed structured/text turns; unchanged contextual text journey; graph canonical-input and concurrency units                              |
| Authority                     | Native RPC and fresh-process cases reject swapped tool/saver, stale execution, foreign identity and expired/pruned state; transport/controller scope units                  |
| Replay                        | Native RPC and fresh-process cases assert exact replay, ordinary-content conflicts, reserved-slot replacement, concurrent forks and stable lineage; saver units             |
| Retention                     | Native fresh-process case observes API-owned fixed-horizon/eight-terminal-turn pruning, protects active lineage and preserves business digests; lifecycle units             |
| Invalid wire/storage          | Native RPC malformed-state, bounded-body, rollback and actual SQL-disconnect checks; closed parser/controller/saver/HTTP units, including streamed transport classification |
| Upgrade                       | Genuine populated 6002-to-6003 native case compares exact historical digests/constraints and then completes through production; unchanged populated 6002 text regression    |

## Auto Run Result

### Summary

Built and independently verified API-owned, run-scoped durable Ask graph checkpoints,
complete pending-write recovery and fixed-horizon retention under accepted D-048/ADR 0025.
The real API, worker and AI restart journeys complete the original run with one retained
receipt and durable terminal/inbox outcome. Structured and text modes share the installed
SDK without persisting grants or introducing AI database access. All integration campaigns,
helpers and fresh-process probes remain strict TypeScript with the Vitest/library standard.
No push, VPS access, real-source collection or new environment variable was introduced.

### Files changed

- `apps/ai/package.json`:
  Pin the installed checkpoint SDK as a direct AI dependency.
- `apps/ai/src/execution/execution.controller.ts`:
  Apply the existing tracer deadline to both price execution modes.
- `apps/ai/src/execution/execution.service.ts`:
  Resume complete durable state and authoritatively rebind retained receipts; distinguish
  pending-write recovery from completion.
- `apps/ai/src/graph/graph.module.ts`:
  Inject invocation-local graph factories and bounded remote saver transport.
- `apps/ai/src/graph/price-per-square-meter.graph.ts`:
  Separate durable business state from ephemeral execution authority.
- `apps/ai/src/graph/price-telemetry.ts`:
  Consume grant-free durable input in node telemetry.
- `apps/ai/src/tools/http-price-per-square-meter.tool.ts`:
  Preserve definitive versus transient transport failures through bounded response reading.
- `apps/ai/src/tools/price-per-square-meter.port.ts`:
  Expose safe price-tool failure categories.
- `apps/ai/src/tools/resilient-price-per-square-meter.tool.ts`:
  Preserve the failure category through the existing resilience wrapper.
- `apps/ai/tsconfig.json`:
  Resolve the installed SDK declarations with the compatible module setting.
- `apps/api/package.json`:
  Declare the existing Express adapter for the bounded route parser.
- `apps/api/src/ask/ask.module.ts`:
  Wire the private saver facade and API-owned retention lifecycle.
- `apps/api/src/configure-api.ts`:
  Add a route-specific saver JSON limit without changing other routes.
- `apps/worker/src/ask/run-executor-resilience.settings.ts`:
  Document durable graph redelivery without changing retry or deadline settings.
- `packages/application/src/ask/consume-ask-run-request.service.ts`:
  Keep transient execution interruptions unsettled for bounded durable redelivery.
- `packages/application/src/ask/index.ts`:
  Export the SDK-independent saver port and service through the Ask facade.
- `packages/contracts/src/ask/ask-live.dto.ts`:
  Require a separate checkpoint grant in internal price execution input.
- `packages/contracts/src/ask/index.ts`:
  Export the closed checkpoint transport parsers and types.
- `packages/domain/src/ask/ask-live.types.ts`:
  Add checkpoint authority only to internal price execution types.
- `packages/domain/src/ask/index.ts`:
  Export provider-free checkpoint transport types.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts`:
  Rotate independent tool/saver grant digests using shared fenced execution authorization.
- `packages/infrastructure/src/ask/index.ts`:
  Export the PostgreSQL saver adapter through the infrastructure facade.
- `pnpm-lock.yaml`:
  Record the exact direct SDK and Express dependency pins.
- `apps/ai/src/graph/graph-checkpoint-resilience.settings.ts`:
  Define named bounded saver resilience defaults.
- `apps/ai/src/graph/graph-checkpoint.port.ts`:
  Define the AI-local primitive transport and safe failure boundary.
- `apps/ai/src/graph/http-graph-checkpoint.adapter.ts`:
  Implement fixed-origin, authenticated, bounded, cancellable single-attempt saver RPCs.
- `apps/ai/src/graph/price-graph.factory.ts`:
  Create fresh graph/saver closures and the authorized receipt-rebind operation.
- `apps/ai/src/graph/remote-checkpoint-saver.ts`:
  Bridge installed complete checkpoint/serde semantics with scoped ACK rendezvous and safe metadata.
- `apps/ai/src/graph/resilient-graph-checkpoint.adapter.ts`:
  Wrap the remote saver in the prescribed resilience ordering.
- `apps/api/src/ask/graph-checkpoint-retention.job.ts`:
  Run bounded, nonoverlapping maintenance with cancellation and shutdown drain.
- `apps/api/src/ask/graph-checkpoint-retention.settings.ts`:
  Define safe 60-second/50-run/five-second retention defaults.
- `apps/api/src/ask/graph-checkpoint.controller.ts`:
  Expose the strict private saver RPC with request cancellation and safe failure mapping.
- `migrations/6003_ask_graph_checkpoints.sql`:
  Add complete Ask-owned checkpoint/pending-write storage, fixed horizons and reserved principal
  identity.
- `packages/application/src/ask/graph-checkpoint.port.ts`:
  Declare API-owned persistence and retention operations without vendor types.
- `packages/application/src/ask/graph-checkpoint.service.ts`:
  Validate the closed operation scope before delegating to the saver port.
- `packages/contracts/src/ask/graph-checkpoint.dto.ts`:
  Parse exact bounded SDK-independent saver requests, responses and records.
- `packages/domain/src/ask/graph-checkpoint.types.ts`:
  Define primitive complete checkpoint envelopes independent of the SDK.
- `packages/infrastructure/src/ask/ask-execution.authorization.ts`:
  Share retained identity, thread-lock and current-claim authorization within Ask.
- `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts`:
  Persist fenced immutable lineage/pending writes and prune only eligible graph payloads using
  numeric sequence order.
- `apps/ai/src/execution/execution.service.test.ts`:
  Assert closed categorical execution telemetry without raw input or causes.
- `apps/ai/src/graph/price-per-square-meter.graph.test.ts`:
  Exercise actual compiled graph modes, pause/rebind, concurrency, delayed ACKs and four interrupted
  pending-write regressions.
- `apps/ai/src/tools/http-price-per-square-meter.tool.test.ts`:
  Cover post-header interruption, cancellation, malformed JSON and overflow classification.
- `apps/api/src/configure-api.test.ts`:
  Prove the route-specific saver body limit and unchanged existing API limits.
- `apps/worker/src/ask/consume-ask-run-timeout.test.ts`:
  Supply the separate saver grant in the existing timeout fixture.
- `integration/ask-contracts.integration.test.ts`:
  Extend the exact empty-table inventory for the two additive Ask tables.
- `integration/ask-price-run.integration.test.ts`:
  Prove transient outage recovery while retaining definitive authority-failure evidence.
- `integration/support/ask-diagnostics.ts`:
  Expose only bounded categorical checkpoint/delivery evidence for owned fixtures.
- `package.json`:
  Add the native typed checkpoint campaign alias.
- `packages/application/src/ask/consume-ask-run-request.service.test.ts`:
  Assert transient redelivery without a fabricated failed terminal.
- `packages/contracts/src/ask/ask-live.dto.test.ts`:
  Cover the internal separate-grant input contract.
- `packages/contracts/src/ask/run-execution.dto.test.ts`:
  Update the internal structured execution fixture with checkpoint authority.
- `packages/infrastructure/src/ask/text-price.adapters.test.ts`:
  Update text execution forwarding expectations with checkpoint authority.
- `apps/ai/src/graph/checkpoint-test.fixture.ts`:
  Provide a strict serialized fake remote boundary with immutable head-parent checks.
- `apps/ai/src/graph/http-graph-checkpoint.adapter.test.ts`:
  Exercise real HTTP boundary parsing, authority, bounds, cancellation and resilience failures.
- `apps/ai/src/graph/remote-checkpoint-saver.test.ts`:
  Cover complete serde, scope, pending slots, registration/ACK ordering and bounded cancellation.
- `apps/api/src/ask/graph-checkpoint-retention.job.test.ts`:
  Cover maintenance startup, overlap, failures, cancellation and drain.
- `apps/api/src/ask/graph-checkpoint.controller.test.ts`:
  Cover strict private RPC addressing, authority and error mapping.
- `integration/ask-checkpoints.integration.test.ts`:
  Verify actual service kills, SQL semantics, scoped replay, both persistence gaps, retention and
  populated upgrade.
- `integration/fixtures/ask-checkpoint-resume-probe.ts`:
  Run actual pause/resume in a fresh erasable TypeScript process without importing Vitest.
- `packages/application/src/ask/graph-checkpoint.service.test.ts`:
  Cover closed-envelope policy and port delegation with an isolated fake.
- `packages/contracts/src/ask/graph-checkpoint.dto.test.ts`:
  Exercise exact transport limits, identifiers, discriminators and malformed data.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md`:
  Mirror accepted D-048 checkpoint ownership/recovery decisions in the epic notes.
- `docs/api/ask-tracer.md`:
  Update internal grants and honest transient-outage behavior.
- `docs/testing/integration.md`:
  Document typed native saver campaigns and bounded restart evidence.
- `specs/README.md`:
  Index accepted ADR 0025.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/story-threads-runs-and-checkpoints-on-postgresql-plan.md`:
  Record immutable intent, implementation evidence, matrix audit, review triage and final
  verification.
- `docs/api/ask-checkpoints.md`:
  Document actual private protocol, authorization, lifecycle and safe failure categories.
- `specs/adrs/0025-run-scoped-remote-graph-checkpoints.md`:
  Record accepted run-scoped API-owned durability and retention under D-048.

### Review disposition

The pinned Quick lens reported one finding. Parent verification established one high-severity
patch: empty SDK `next` is not terminal proof while completed-task pending writes remain.
The one-line completion condition now requires explicitly empty pending writes. Four actual
compiled-SDK RED/GREEN regressions cover structured/text decision-write and tool-write gaps,
fresh authority, terminal checkpoint persistence, one node traversal and retained receipt rebind.
Patched entries: high 1, medium 0, low 0. Deferred 0; rejected 0; intent gaps 0; bad plans 0.
The triage log preserves the single finding and its checked evidence. Review loop count is zero.

Follow-up review recommended: false. Although the patched entry is high, there is no remaining
specific unverified risk from it: all four exact regressions, root/focused gates, native real-stack
recovery and the complete discovered suite ran successfully on the corrected revision. No extra
review lens or speculative finding was introduced.

### Final verification — 2026-10-12

All commands below exited zero on the post-review revision. Logs are retained in
`/tmp/rei-ask-5-6-cRGw1I/`.

- `pnpm run lint`: root ESLint and architecture/migration boundary checks passed
  (`lint-postreview.log`).
- `pnpm run typecheck`: all eight workspaces plus strict integration checking passed
  (`typecheck-postreview.log`); all 37 integration files are TypeScript.
- `pnpm run test`: 1,973 tests passed in 170 files across eight workspaces, without skips
  (`test-postreview.log`). AI passed 97 tests in eleven files.
- `pnpm run build`: all applications/packages built (`build-postreview.log`); only the
  existing non-fatal web chunk-size warning remains.
- `pnpm run test:coverage`: unchanged 80% statement/function/line and 75% branch floors passed
  (`test-coverage-postreview.log`). Minimum affected Infrastructure coverage is
  82.36/77.84/88.29/84.27%; AI is 94.37/87.25/92.50/96.32%.
- Focused contracts/application/API/AI/worker commands passed 6/13/21/71/1 tests
  (`focused-*-postreview.log`).
- `pnpm run test:integration:ask-checkpoints`: six tests passed, no skips/retries,
  411.08 seconds (`checkpoints-postreview.log`). Actual kill-to-ready intervals:
  API 2,198 ms, worker 960 ms and AI 1,933 ms.
- All four legacy integration aliases passed: structured tracer 1/1 in 68.99 seconds;
  text-price 2/2 in 75.58 seconds; RunExecutor 2/2 in 52.56 seconds; prepared/public
  Ask contracts 2/2 in 33.67 seconds (`*-postreview.log`).
- `pnpm run test:integration`: 56 tests passed in all 27 discovered files, no failures,
  skips or retries, 1,372.23 seconds (`integration-full-postreview.log`). This includes
  all support/convention cases, actual SQL/broker/storage semantics and API E2E journeys.
  Its repeated restart timings were API 1,847 ms, worker 956 ms and AI 2,208 ms.
- `pnpm run test:integration:list`: all 56 cases discovered, including each of the six
  new checkpoint cases exactly once (`discovery-postreview.log`).
- The parent read the complete implementation diff and review repair, checked every immutable
  matrix row against actually passing tests, and inspected the compiled SDK cause and RED/GREEN
  evidence. Changed-file formatting, all seven changed Markdown files and whitespace checks
  passed. Final result-note Prettier and seven-file Markdown lint also passed;
  Markdown lint uses `--no-globs` to select exactly these files, as the unchanged
  hook does. Long description bullets were soft-wrapped without changing rules.
- Independent selective Docker metadata comparisons confirm all 13 foreign containers and
  all 13 foreign volumes unchanged. No owned Compose container/volume or Testcontainers
  container remains; cleanup did not remove any foreign resource.

### Residual scope and risks

Brief API restart recovery is demonstrated only within the existing bounded delivery budget;
a longer API outage can exhaust delivery and dead-letter a still-running run. No new unbounded
retry or outage guarantee is claimed. PostgreSQL cancellation is verified by actual backend
disappearance/rollback, not inferred solely from HTTP socket closure. The existing five-second
SQL timeout remains. Public confirmation, Jev, quotas and UI/provider behavior are outside this
story. VPS-dependent stories remain owner-blocked and must not be unlocked by the agent.
