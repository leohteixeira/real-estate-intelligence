---
title: 'Dead-lettering and pruning'
type: 'feature'
ticket: '14'
created: '2026-10-10'
status: done
baseline_revision: 'cf55d7cd397dac244dc44fab181e7dbd8de41edd'
route: 'full'
route_source: 'pinned'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 3
followup_review_recommended: true
context:
  - 'AGENTS.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
warnings:
  - 'multiple-goals'
  - 'oversized'
deferred: []
---

<intent-contract>

## Intent

**Problem:** A repeatedly failing RabbitMQ delivery can block a logical consumer forever, while
published outbox rows and consumed inbox markers grow without bound. The delivery contract also
lacks an explicit, testable horizon for replaying a dead-lettered event under its original ID.

**Approach:** Extend the existing classic-queue adapter with application-managed, confirmed
retry/dead-letter transfers and add independently bounded retention ports plus a worker pruning
job. Use five normal failed deliveries, seven-day published-outbox retention, thirty-day inbox
retention, and a durable per-consumer dead-letter queue; prove both behaviors against real
RabbitMQ and PostgreSQL.

## Boundaries & Constraints

**Always:** Preserve the existing `rei.events` exchange, durable classic source queues, stable
consumer identities, legacy audit migration, manual acknowledgement, prefetch one, persistent
messages, and publisher confirms. Transfer a retry or terminal message with `mandatory` routing
and confirmed acceptance before acknowledging its source; if routing, confirmation, or connection
state is ambiguous, leave the source unacknowledged and retire the broker generation. Treat an
absent private attempt header as attempt one, increment it only on confirmed retry publication,
and send malformed envelopes directly to dead-letter without invoking the handler. Make retry
delay and shutdown abortable. Use database time, deterministic batches, row locks with
`SKIP LOCKED`, and independent outbox/inbox transactions. Prune only published outbox rows; retain
an inbox marker when its matching outbox event remains unpublished. Keep dead-letter metadata and
logs free of raw payloads, credentials, and connection details.

**Never:** Redeclare an existing source or legacy queue with incompatible queue arguments, change
its queue type, rewrite migrations 0001/0002, rely on RabbitMQ quorum-only delivery counters, nack
into an unbounded redelivery loop, auto-replay a dead-letter, or claim exact global attempt bounds
across process death during an ambiguous publisher confirm. Do not expose AMQP/`pg` types through
application ports, put retention policy in domain models, drain all eligible rows in one cadence,
delete fresh/unpublished records, add cross-context foreign keys, perform VPS/deployment work, or
weaken coverage and integration gates. The unavailable `nestjs-modular-monolith` skill must not be
replaced with a new framework pattern: follow the repository's existing explicit NestJS module and
port composition.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                                                                  | Expected Output / Behavior                                                                                                                                | Error Handling                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Recoverable failure  | Valid delivery below attempt five; handler fails                                               | Same envelope is persistently republished directly to the source queue with the next private attempt header, confirmed, then the original is acknowledged | Abortable fixed delay; failed, returned, or ambiguous transfer retires the generation and does not acknowledge the original       |
| Poisoned delivery    | Valid delivery fails on attempt five                                                           | Persistent copy is confirmed in `<consumer>.dead-letter` with safe categorical metadata; original settles and source queue can advance                    | No automatic replay; a failed terminal transfer leaves the original retryable                                                     |
| Invalid envelope     | Malformed JSON, generic envelope, or unsupported-event shape                                   | Message goes directly to the matching durable dead-letter queue without handler execution or raw-body logging                                             | If dead-letter transfer cannot be proved, do not acknowledge the source                                                           |
| Restart during retry | Worker restarts after at least one confirmed retry                                             | Private attempt header survives and delivery continues from the persisted count                                                                           | Ambiguous confirm may duplicate a transfer, but inbox idempotency prevents duplicate effects and no message is intentionally lost |
| Outbox pruning       | Published rows straddle the seven-day cutoff and batch boundary                                | Only oldest eligible rows up to the configured batch are deleted in deterministic order                                                                   | A database failure is reported for that store and does not block the inbox prune attempt                                          |
| Inbox pruning        | Consumed markers straddle thirty days; one old marker has an unpublished matching outbox event | Old eligible markers are deleted up to the batch; the protected marker and all fresh markers remain                                                       | Job does one bounded batch per store per cadence and never overlaps itself                                                        |
| Shutdown             | Retry delay, broker transfer, or pruning cycle is active                                       | Stop signal aborts pending delay/work within the shared shutdown budget and prevents a new cadence                                                        | Already committed database deletion remains valid; unsettled broker source remains recoverable                                    |

</intent-contract>

## Code Map

- `packages/application/src/shared/outbox.ts`, `inbox.ts`, and `index.ts` -- vendor-neutral,
  abort-aware retention ports and tokens alongside the existing delivery ports.
- `packages/infrastructure/src/shared/persistence/postgres-outbox.ts`, `postgres-inbox.ts`, exports,
  `database-connection.ts`, and their tests -- database-time, bounded pruning implementations,
  infrastructure-only query cancellation, and real PostgreSQL evidence that an active maintenance
  backend is terminated without poisoning the remaining pool. Cancellation also covers a pending
  pool checkout, and a lease that arrives after cancellation is destroyed without starting SQL.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` and its tests -- private
  attempt tracking, durable companion queues, confirmed retry/dead-letter transfer, routing-return
  handling, generation retirement, and abortable shutdown.
- `apps/worker/src/config.ts`, `persistence.module.ts`, `shared/messaging.module.ts`, and
  `worker.module.ts` -- validated policy values and Nest provider composition.
- `apps/worker/src/shared/delivery-retention.job.ts`, worker lifecycle/shutdown files,
  `apps/worker/package.json`, the lockfile, and focused tests -- non-overlapping, independently
  fault-tolerant pruning cadence, active-query cancellation, and explicit OpenTelemetry job spans
  plus bounded-cardinality metrics.
- `integration/audit-tracer.integration.mjs` -- real poison-message, restart persistence, source
  settlement, active PostgreSQL cancellation, and pruning proof through RabbitMQ management plus
  independent schema queries. The restart fixture must be created by the broker adapter's normal
  failed-delivery transfer, not by directly fabricating a private attempt header.
- new `specs/adrs/0017-dead-lettering-and-delivery-retention.md`, the architecture decision table,
  `migrations/README.md`, and epic Notes -- extend ADR 0012 without editing that accepted record,
  and mirror the accepted limits, time-bounded original-ID replay, and operational recovery rule.

## Tasks & Acceptance

**Execution:**

- [x] `packages/application/src/shared/outbox.ts`, `inbox.ts`, exports, and unit tests -- add separate
      `OutboxRetentionPort.prunePublished(retentionMs, batchSize, signal)` and
      `InboxRetentionPort.pruneConsumed(retentionMs, batchSize, signal)` contracts/tokens without
      changing existing transaction, claim, or vendor boundaries; cancellation uses the platform
      `AbortSignal`, never a PostgreSQL type.
- [x] `packages/infrastructure/src/shared/persistence/postgres-outbox.ts`, `postgres-inbox.ts`,
      `database-connection.ts`, exports, and real-PostgreSQL tests -- delete one deterministic
      oldest-first batch with a database-time cutoff, `FOR UPDATE SKIP LOCKED`, and
      `DELETE ... USING ... RETURNING`; require published outbox state and protect an inbox marker
      whose event ID still has an unpublished outbox row. Add an infrastructure-only abortable query
      path that leases a client, destroys only that lease when the signal aborts, waits for the query
      to settle, and never returns an aborted client to the pool; prove abort
      settlement without exposing `pg` types through either retention port. The real-PostgreSQL
      proof must observe a live uniquely identifiable maintenance query, abort it, establish bounded
      settlement and disappearance of that backend, and then prove the pool remains usable. Unit
      tests must also abort while pool checkout is pending, require immediate caller settlement,
      then resolve the late lease and prove it is destroyed without executing or leaking.
- [x] `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` and unit tests --
      declare a durable `<consumer>.dead-letter` classic queue without altering source arguments;
      recognize/validate private attempts; delay and republish sub-limit failures directly through
      the default exchange; terminally republish failures and malformed envelopes to the dead-letter
      queue; require mandatory routing plus confirms before source acknowledgement; handle returned,
      closed, aborted, and ambiguous operations without loss; preserve legacy audit handoff and
      publisher-only routing behavior. If envelope validation fails after a valid private attempt
      header was read, retain that attempt in terminal metadata; only an absent or invalid header
      falls back to attempt one.
- [x] `apps/worker/src/config.ts` and tests -- validate `EVENT_DELIVERY_LIMIT` (2..20, default 5),
      `EVENT_REDELIVERY_DELAY_MS` (100..30000, default 1000), outbox retention (default seven days),
      inbox retention (default thirty days and not shorter than outbox), prune interval (default five
      minutes, shorter than both retentions), and batch size (default 1000); validate derived queue
      names against RabbitMQ's byte limit, cap every value passed to a Node timer at the signed
      32-bit delay maximum so overflow cannot become a 1 ms cadence, and retain current
      operation/shutdown invariants.
- [x] `apps/worker/src/shared/delivery-retention.job.ts`, tests, module composition, and lifecycle --
      schedule a single non-overlapping cycle, execute at most one batch per table with
      `Promise.allSettled`, pass the cycle signal into both ports, actively settle aborted database
      work, stop before broker/persistence teardown, and never turn a transient pruning failure into
      worker death. Add a named OpenTelemetry span for every cycle plus counters/histograms for
      cycle result, per-store result/deleted count, duration, and cancellation using only fixed
      low-cardinality attributes; classify every store from its own settled result so a genuine
      failure remains failed when another store is cancelled later in the same cycle; retain safe
      structured logs and add `@opentelemetry/api` as a direct worker dependency.
- [x] `integration/audit-tracer.integration.mjs` and integration command wiring -- against fresh
      real PostgreSQL and RabbitMQ, create a deterministic conflicting audit delivery that fails five
      times, observe one durable dead-letter and an empty source with no inbox/effect mutation, prove
      the attempt header survives a worker restart after the real broker adapter has performed and
      confirmed at least one normal failed-delivery retry transfer, prove active PostgreSQL pruning
      cancellation against the live server, then seed old/fresh/protected rows using database
      timestamps and prove cutoff plus batch-one pruning semantics with unconditional cleanup.
- [x] new `specs/adrs/0017-dead-lettering-and-delivery-retention.md`, the architecture decision
      table, `migrations/README.md`, epic Notes, and example configuration documentation -- leave
      accepted ADR 0012 byte-for-byte unchanged; record the chosen defaults in the extending ADR,
      the distinction between five normal failed deliveries and crash/confirm ambiguity, no
      automatic replay, original-ID replay only within the thirty-day inbox horizon, audited
      new-event recovery afterward, active pruning cancellation, and job telemetry.

**Acceptance Criteria:**

- Given a valid audit event whose deterministic effect conflicts on every handler invocation, when
  the worker processes it normally, then exactly five handler attempts occur, one persistent copy
  becomes visible in `audit.event-log.dead-letter`, the source queue advances, and neither a new
  inbox marker nor altered audit effect is committed.
- Given a retry already persisted with its private attempt header, when RabbitMQ or the worker is
  restarted, then the next delivery retains that count and eventually reaches the same bounded
  terminal behavior; any ambiguous transfer remains at-least-once rather than silently lost.
- Given an unroutable retry/dead-letter target, a failed confirm, active retry delay, or shutdown,
  when the broker cannot prove destination acceptance, then it does not acknowledge the source and
  shutdown does not wait out the full retry delay.
- Given a malformed or unsupported envelope that already carries a valid private attempt count,
  when it is transferred to dead-letter, then its terminal metadata preserves that count without
  invoking the handler or exposing its raw body.
- Given old and fresh delivery rows plus an old inbox marker that corresponds to an unpublished
  outbox row, when one retention cycle runs with a bounded batch, then only eligible oldest rows up
  to each batch limit are removed, the protected marker remains, and failure of one prune operation
  does not prevent the other from being attempted.
- Given generated declarations and dependency inspection, when the change is reviewed, then AMQP
  and PostgreSQL types remain in infrastructure, the worker composes separate retention ports, and
  no existing durable queue has acquired incompatible declaration arguments; accepted ADR 0012 is
  unchanged, ADR 0017 records the extension, and the retention job emits an enclosing span plus
  bounded-cardinality metrics even when a store fails or shutdown cancels the cycle.
- Given a fresh isolated Compose project, when migration, unit, coverage, integration, lint,
  typecheck, build, and diff checks run, then all pass and containers, network, and volumes are
  removed afterward.

## Implementation Notes

The first review established three constraints that the initial derivation missed. Retention
cancellation must reach active PostgreSQL work rather than stop at a pre-query signal check. Keep
the existing pooled `query` surface for ordinary callers and add a narrowly scoped abortable path:
lease one client, attach the abort handler before executing, destroy the lease on abort, remove the
listener and release normally only after settlement. Tests must cover abort before execution,
abort in flight, normal settlement, and exactly-once release/destruction.

Job observability is explicit rather than inferred from child `pg` spans. Use the OpenTelemetry API
from the worker to create one retention-cycle span and fixed-name instruments. Store is the only
per-store dimension (`outbox` or `inbox`); result values are a closed set such as `succeeded`,
`failed`, or `cancelled`. Capture cancellation as part of each operation's settled outcome rather
than consulting only the cycle signal after `Promise.allSettled`; a database failure that precedes
a sibling cancellation must still be logged and counted as failed. Never attach event IDs, SQL,
connection details, exception messages, or payload data.

The real PostgreSQL cancellation proof complements the mocked lease-lifecycle unit test. Start a
uniquely identifiable long-running query through `queryAbortable`, observe its backend from a second
connection, abort it, require prompt rejection with the shutdown reason, require that backend to
disappear, and issue a successful query afterward. For restart persistence, let the production
RabbitMQ adapter confirm a failed-delivery retry, interrupt the consuming adapter while the retried
message is in flight so RabbitMQ requeues that adapter-produced copy, then start a new consumer and
assert that the preserved count reaches the terminal attempt. A direct test publish carrying a
private header is not evidence for the retry-publication path.

Cancellation begins before pool checkout, not after it. Race the checkout against the signal and
settle the caller immediately when shutdown wins. The underlying checkout promise still needs a
completion handler: if a client arrives later, destroy that lease exactly once and never execute the
maintenance statement. Keep normal checkout errors redacted and avoid unhandled late rejections.
All millisecond values passed to `setTimeout` or `setInterval` must be at most `2_147_483_647`, the
largest signed 32-bit Node timer delay; retain the stricter domain-specific maximum where one exists.

ADR 0012 remains the normative parent and must match the baseline exactly. ADR 0017 extends it with
the owner-approved operational values and explains the application-managed classic-queue choice,
retention/replay horizon, cancellation, and telemetry. Add 0017 to the architecture table; do not
mark 0012 superseded because its original decisions still stand.

## Plan Change Log

### 2026-10-10 — Review repair 1

- Trigger: the Quick review found that active pruning queries were not cancellable, accepted ADR
  0012 was edited, and the retention job had no enclosing OpenTelemetry signal.
- Amended: retention ports and persistence tasks now require in-flight abort settlement; worker
  tasks now require explicit spans and bounded-cardinality metrics; documentation now requires a
  new extending ADR 0017 while preserving ADR 0012 exactly. The malformed-envelope criterion also
  makes preservation of an already valid attempt header explicit.
- Known-bad state avoided: a shutdown deadline lost to a live prune query, mutable accepted ADR
  history, job activity visible only through logs/child SQL spans, and terminal metadata that reset
  a persisted attempt to one.
- KEEP: preserve the confirmed mandatory retry/dead-letter transfer, stable legacy retry route,
  source-unsettled behavior on ambiguity, deterministic bounded pruning SQL and unpublished guard,
  validated policy ranges, independent per-store failure handling, real Compose proof, and all
  previously green lint/type/test/coverage/build gates.

### 2026-10-10 — Review repair 2

- Trigger: the second Quick review found that a mixed failure/cancellation cycle misclassified the
  earlier database error, the active-query cancellation evidence used only a fake client, and the
  restart fixture fabricated the private retry header instead of exercising normal transfer.
- Amended: job telemetry now requires per-operation result capture; the persistence and integration
  tasks now spell out a live PostgreSQL backend cancellation/pool-reuse proof; the restart proof now
  requires an adapter-confirmed retry followed by consumer interruption and resumption.
- Known-bad state avoided: lost failure telemetry during shutdown, a cancellation implementation
  validated only by its own mock behavior, and a restart test that could pass while production retry
  publication dropped or corrupted the attempt header.
- KEEP: preserve every repair-1 invariant plus strict numeric configuration parsing, the classic
  dead-letter declaration, byte-count queue validation, post-confirm generation guard, abortable
  retry-delay shutdown, unchanged ADR 0012, and the previously green isolated Compose campaign.

### 2026-10-10 — Review repair 3

- Trigger: the third Quick review reproduced a timer overflow that turns an accepted large cadence
  into a 1 ms loop and found that cancellation is only attached after pool checkout completes.
- Amended: configuration now caps Node timer inputs at the signed 32-bit maximum; persistence now
  requires the caller to settle promptly during pending checkout and to destroy any late lease
  without running SQL, with a focused lifecycle test.
- Known-bad state avoided: continuous pruning caused by `TimeoutOverflowWarning` fallback and a
  shutdown that can overrun its configured budget while waiting up to two seconds for a pool client.
- KEEP: preserve all repair-1 and repair-2 invariants, especially per-store mixed-result telemetry,
  adapter-produced retry persistence, live PostgreSQL backend cancellation, and full Compose cleanup.

## Review Triage Log

### 2026-10-10 — Review pass 1

- verdicts: 4 findings — high 0, medium 3, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Active pruning queries did not cancel during shutdown — the cycle signal
    was checked only before `Promise.allSettled`, both ports lacked a signal, and the pool query can
    run until its operation timeout while the ordered shutdown deadline continues; the amended plan
    requires abort-aware ports and an infrastructure-only query path that destroys the active lease.
  - `[low]` `[patch]` Invalid-envelope transfer reset a valid persisted attempt to one —
    `handleDelivery` read the header before parsing but its catch passed literal `1`; re-derivation
    must preserve the parsed count while retaining one as the safe fallback for absent/invalid data.
  - `[medium]` `[bad_plan]` The implementation edited accepted ADR 0012 — ADR 0001 and the listed
    architecture context explicitly make accepted records immutable; the amended documentation task
    restores 0012 and creates extending ADR 0017 plus its architecture-table row.
  - `[medium]` `[bad_plan]` The retention job had logs and child PostgreSQL instrumentation but no
    job-level OpenTelemetry span or metrics — the workspace rule and ADR 0005 require jobs to be
    instrumented; the amended worker task specifies a cycle span and fixed-cardinality instruments.

### 2026-10-10 — Review pass 2

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Mixed store failure and shutdown cancellation were both reported as
    cancelled — `runCycle` classified every rejection from the final cycle-wide signal at line 89,
    so an outbox database error settled before a later inbox abort lost its failure log and metric;
    the amended job task requires cancellation to be captured per settled operation.
  - `[medium]` `[bad_plan]` Active pruning cancellation lacked real PostgreSQL evidence — the unit
    fake made `release(true)` reject its own fake query, while the Compose proof only ran normally
    completing pruning calls; the amended persistence task requires observing and terminating a live
    maintenance backend, bounded settlement, backend disappearance, and subsequent pool reuse.
  - `[medium]` `[bad_plan]` Restart persistence fabricated attempt four instead of exercising retry
    publication — `publishDirectConfirmed` supplied the private header while the worker was stopped,
    so corruption in the adapter's confirmed retry transfer could pass; the amended integration task
    requires the normal adapter to produce the persisted retry before interruption and resumption.

### 2026-10-10 — Review pass 3

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` An accepted retention cadence could overflow Node's timer range — a value of
    `2_500_000_000` passed the retention relationships but Node 24 reproduced a
    `TimeoutOverflowWarning` and a 1 ms timer; re-derivation must cap the cadence at
    `2_147_483_647` and retain a regression test.
  - `[medium]` `[bad_plan]` Cancellation started only after `leaseClient()` resolved — pool checkout
    can wait up to two seconds while configured operation/shutdown budgets can be 100 ms, and the
    existing tests skipped this gap; the amended persistence task requires prompt cancellation plus
    safe destruction of a client delivered by the still-pending checkout.

### 2026-10-10 — Review pass 4

- verdicts: 3 findings — high 0, medium 2, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The companion dead-letter queue relied on the vhost default queue type —
    the implementation now declares only the new queue with `x-queue-type: classic`, while leaving
    existing source and legacy declarations unchanged, and verifies the real queue type.
  - `[medium]` `[patch]` The real inbox retention fixture had only one old eligible row and did not
    assert the deleted or fresh IDs — the fixture now includes two differently aged eligible rows
    and proves oldest deletion, batch-one survival, fresh survival, and unpublished protection.
  - `[low]` `[patch]` The newly added plan failed targeted Prettier and Markdownlint checks — the
    review headings are unique and the complete plan is normalized before the next review.

### 2026-10-10 — Review pass 5

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Nested Compose lifecycle commands could target the default project while
    the verification project used `--project-name` — the harness now propagates
    `INTEGRATION_COMPOSE_PROJECT_NAME` to every nested Compose invocation, and the verification
    command supplies the isolated project name explicitly.
  - `[medium]` `[patch]` The poison fixture inferred five handler invocations only from the final
    attempt header — a PostgreSQL sequence incremented by a temporary trigger now independently
    counts every rolled-back audit insert attempt and must report exactly five before cleanup.

## Design Notes

Application-managed transfer is intentional for the existing classic queues. RabbitMQ's native
delivery counter and safer at-least-once dead-letter strategy are quorum-queue features, while
changing queue type or declaration arguments would break redeclaration of the durable topology.
For ordinary handler failures, `x-rei-delivery-attempt` therefore defines a durable chain: missing
means attempt one, retry publication carries the next value, and attempt five terminates in the
companion queue. A process crash between destination confirm and source acknowledgement can still
produce a duplicate transfer; inbox idempotency makes that safe, but the implementation and docs
must not advertise an impossible exact bound across that ambiguity.

Pruning is deliberately independent of delivery transactions. Each adapter computes its cutoff
from PostgreSQL time, locks a stable oldest-first candidate batch without waiting on competing
jobs, deletes only those keys, and returns the affected count. The worker performs one batch per
cadence rather than draining until empty, so runtime and shutdown cost remain bounded. Inbox
retention exceeds outbox retention because deleting the deduplication marker too early could repeat
an effect during recovery; the unpublished-outbox guard preserves the marker at the remaining
confirm/mark ambiguity boundary.

## Verification

**Commands:**

- `pnpm lint` -- expected: ESLint and Markdown checks pass without ignored generated suites.
- `pnpm typecheck` -- expected: all workspaces compile their source contracts without vendor-type
  leakage.
- `pnpm test:coverage` -- expected: all Vitest suites run with `--dir src` and every workspace meets
  the established 80% statements/lines/functions and 75% branches thresholds.
- `pnpm build` -- expected: production packages and applications build successfully.
- `docker compose --project-name rei-story-1-14 up -d --build` followed by
  `INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-14 pnpm test:integration` -- expected: migrations,
  poison delivery, restart persistence, and pruning assertions pass against real services within
  bounded waits.
- `docker compose --project-name rei-story-1-14 down --volumes --remove-orphans` -- expected: test
  containers, network, and volumes are removed; `docker compose ... ps --all` is empty.
- `pnpm why mastra` -- expected: no Mastra dependency is present.
- `git diff --check` -- expected: no whitespace errors.

## Auto Run Result

### Summary

Implemented bounded application-managed RabbitMQ retry and dead-letter delivery for the existing
classic consumer topology, plus independently bounded PostgreSQL outbox/inbox retention with active
shutdown cancellation. The worker now owns a non-overlapping, instrumented retention cadence, and
the real-service integration campaign proves terminal poison handling, retry persistence across a
consumer restart, exactly five audit-effect attempts, live PostgreSQL cancellation, deterministic
batch-one pruning, and isolated Compose lifecycle handling.

### Files changed

- Application and infrastructure ports/adapters: added vendor-neutral retention contracts,
  deterministic PostgreSQL pruning, abortable lease acquisition/query execution, and durable
  confirmed RabbitMQ retry/dead-letter transfers with an explicitly classic companion queue.
- Worker configuration and lifecycle: added strict policy validation, safe Node timer bounds,
  retention dependency injection, ordered shutdown, OpenTelemetry spans, and fixed-cardinality
  metrics.
- Tests and integration: added focused configuration, broker, persistence, retention-job, and
  shutdown tests; expanded the real RabbitMQ/PostgreSQL campaign with adapter-produced retry,
  independent poison-attempt counting, active-backend cancellation, and bounded retention proof.
- Operations and documentation: updated Compose/example configuration, migration notes, epic and
  architecture references, and added accepted ADR 0017 without changing accepted ADR 0012.

### Review findings

- Pass 1: four findings — three medium `bad_plan` gaps and one low patch. Re-derived active database
  cancellation, immutable ADR extension, explicit job telemetry, and preserved malformed-envelope
  attempt metadata.
- Pass 2: three medium `bad_plan` gaps. Re-derived per-store mixed-result classification, real
  PostgreSQL cancellation evidence, and an adapter-produced restart retry fixture.
- Pass 3: two medium findings — one patch and one `bad_plan` gap. Added signed 32-bit timer caps and
  cancellation during pending pool checkout with late-lease destruction.
- Pass 4: three patches — two medium and one low. Declared and verified the companion queue as
  classic, strengthened real inbox cutoff/batch evidence, and normalized the new plan for targeted
  Prettier/Markdownlint checks.
- Pass 5: two medium patches. Propagated the isolated Compose project to all nested lifecycle
  commands and added an independent PostgreSQL sequence counter proving exactly five rolled-back
  audit insert attempts.
- Deferred items: none. Rejected findings: none.
- Follow-up review recommendation: `true`. The current pass patched two medium integration-evidence
  defects; a follow-up should independently inspect Compose project propagation and the
  sequence-based invocation counter. Current-pass patched counts: high 0, medium 2, low 0.

### Verification performed

- `pnpm lint` — passed.
- `pnpm typecheck` — all eight affected workspace projects passed.
- `pnpm test:coverage` — all suites passed; infrastructure ran 58 tests at 87.50% statements,
  77.25% branches, 87.15% functions, and 88.73% lines; worker ran 32 tests at 96.38% statements,
  76.66% branches, 94.23% functions, and 97.11% lines.
- `pnpm build` — passed; the pre-existing Vite large-chunk warning remains non-fatal.
- Fresh isolated Compose plus
  `INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-14 pnpm test:integration` — passed with
  `Audit delivery guarantees integration passed.`
- `docker compose --project-name rei-story-1-14 down --volumes --remove-orphans` and final
  `ps --all` — containers, network, and volumes removed; no project resources remain.
- `pnpm why mastra` — no Mastra dependency reported.
- Targeted Prettier and Markdownlint for this plan, `node --check` for the integration harness,
  declaration-boundary inspection, ADR 0012 baseline comparison, and `git diff --check` — passed.

### Residual risks

- A process death between destination confirmation and source acknowledgement can duplicate a
  transfer by design; inbox idempotency prevents duplicate effects, and no exact global attempt
  bound is claimed across that ambiguity.
- Dead-letter replay remains a manual audited operation. Original-ID replay is safe only within the
  thirty-day inbox horizon; later recovery publishes a new event ID.
- Repository-wide formatting and Markdown jobs still report unrelated pre-existing BMad render and
  plan artifacts; the new plan itself passes both targeted checks.
- No VPS or deployment operation was required for this story.
