---
title: 'Idempotent consumers and delivery guarantees'
type: 'feature'
ticket: '4'
created: '2026-10-10'
status: 'built'
baseline_revision: '0afabcf36565329d0a44f02927cad51cc27b68f2'
route: 'full'
route_source: 'pinned'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 1
followup_review_recommended: true
context:
  - 'AGENTS.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
warnings:
  - 'oversized'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The tracer has at-least-once transport but no atomic consumer deduplication, durable relay ownership, reconnectable subscription, or proof that confirmed messages and per-aggregate order survive failures. A duplicate delivery can therefore duplicate the audit effect, and a live broker restart can strand the worker on a closed channel.

**Approach:** Complete ADR 0012's reusable delivery protocol around the tracer: leased aggregate-head outbox claims, transaction-bound inbox recording, logical consumer queues, reconnectable RabbitMQ topology, and a test-only in-memory publisher. Prove duplicate suppression, broker restart recovery, and aggregate ordering against real PostgreSQL and RabbitMQ.

## Boundaries & Constraints

**Always:** Keep `pg` and `amqplib` types inside infrastructure; run the inbox insert and audit effect on the exact same checked-out transaction; acknowledge only after commit and acknowledge an already-recorded `(consumer_name, event_id)` without repeating the effect. Claim only the earliest unpublished event of each aggregate, use database time for bounded leases, require claim ownership when marking or releasing, publish persistent messages with confirms, and preserve ambiguous outcomes as retryable duplicates. Register one durable queue per stable logical consumer and rebuild every declared binding/consumer after reconnect. Keep adapter calls single-attempt and bounded, use Nest dependency injection and explicit ports, and keep deployed composition on RabbitMQ.

**Never:** Add retry/backoff/circuit-breaker policy, dead-letter limits, pruning, trace propagation, broker-aware HTTP readiness, business events, cross-schema joins/foreign keys, or VPS/deployment work; those belong to stories 1.5, 1.8, 1.12, and 1.14. Do not expose transaction/vendor handles from infrastructure, couple queue identity to an event type, run an in-memory publisher in API/worker composition, treat RabbitMQ write backpressure as a failed confirm, or promise consumer-side ordering beyond ADR 0012's relay guarantee.

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                         | Expected Output / Behavior                                                                                         | Error Handling                                                                                                        |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| First delivery           | New event for `audit.event-log`                       | Inbox key and audit row commit atomically, then the broker message is acknowledged                                 | A transaction failure records neither row and leaves the message unacknowledged                                       |
| Redelivery               | Existing `(audit.event-log, event_id)`                | No second audit effect; transaction commits and delivery is acknowledged                                           | Malformed envelopes remain rejected without payload logging                                                           |
| Relay concurrency        | Several pending events across aggregates              | At most one eligible head per aggregate is leased; confirmed heads are marked by the owning claim                  | Failed/aborted publish releases its owned claim; expired claims become eligible again                                 |
| Aggregate sequence       | Earlier and later events share an aggregate           | The later event cannot be claimed until the earlier event is published                                             | Other aggregates remain eligible and are not blocked by that aggregate                                                |
| Broker generation closes | RabbitMQ restarts after initial consumer registration | Cached generation is invalidated, exchange/queue/bindings/consumer are recreated, and persistent work is delivered | One bounded reconnect attempt occurs per supervisor tick; shutdown disables reconnect and ignores stale close signals |
| In-memory publication    | Test publishes ordered events or an aborted signal    | Test double records immutable snapshots in call order                                                              | Abort rejects without recording and the double is never wired into deployed modules                                   |

</intent-contract>

## Code Map

- `packages/application/src/shared/outbox.ts`, `inbox.ts`, `event-subscriber.ts`, and `event-publisher.ts` -- define vendor-neutral claim ownership, transaction-bound deduplication, logical consumer descriptors, and the shared publisher seam.
- `packages/application/src/audit/audit-event-log.port.ts` -- make the audit effect transaction-bound so inbox and effect cannot diverge.
- `packages/infrastructure/src/shared/persistence/` and `packages/infrastructure/src/audit/postgres-audit-event-log.ts` -- implement leased aggregate-head claims and same-client inbox/effect writes.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` -- own confirmed publishing, queue-per-consumer topology, generation-safe reconnect, and acknowledgement boundaries.
- `apps/worker/src/shared/`, `apps/worker/src/audit/`, persistence/messaging modules, configuration, and shutdown -- compose claims, atomic consumption, a reconnect supervisor, and ordered drain.
- `migrations/0002_platform_create_delivery_guarantees.sql` -- add inbox, idempotency keys, claim ownership, and supporting indexes in the platform block.
- `integration/audit-tracer.integration.mjs` -- exercise the public tracer and real service failure/recovery paths without cross-schema SQL.

## Tasks & Acceptance

**Execution:**

- [x] `migrations/0002_platform_create_delivery_guarantees.sql` and migration documentation/tests -- add `platform.inbox` keyed by consumer and UUIDv7 event ID, a bounded generic idempotency-key table with request fingerprint/result reference, nullable outbox claim ID/expiry columns, and partial indexes for aggregate heads, expired claims, and future pruning; support both fresh and upgraded databases without cross-context references.
- [x] `packages/application/src/shared/`, `packages/application/src/audit/`, exports, and focused tests -- add a transaction-bound inbox port; carry claim ownership through claim/mark/release; describe subscriptions by stable consumer name plus event types; require audit appends to receive the opaque transaction; and cover duplicate, rollback, abort, and invalid-claim cases.
- [x] `packages/infrastructure/src/shared/persistence/`, `packages/infrastructure/src/audit/`, and real-PostgreSQL tests -- atomically lease only unpublished aggregate heads with `FOR UPDATE SKIP LOCKED`, `clock_timestamp()`, and ownership checks; implement idempotent inbox insertion and audit append through the exact transaction client; release failed claims and recover expired ones.
- [x] `packages/infrastructure/src/shared/messaging/in-memory-event-publisher.ts`, exports, and unit tests -- provide an ordered, abort-aware publisher test double with readonly snapshots and no deployed provider registration.
- [x] `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` and unit tests -- retain persistent confirmed publication/manual acknowledgement while replacing hard-coded tracer topology with one queue per consumer; retain subscription descriptors without requiring a live connection; serialize connection establishment; retire a generation after any failed topology materialization; reject unsupported tracer versions/shapes before invoking the effect; track and boundedly drain the underlying handler even after the acknowledgement timeout elapses; invalidate only the matching connection generation; and restore exchange, bindings, prefetch, and consumers after close/error without reconnecting after explicit shutdown.
- [x] `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` and real-broker upgrade tests -- migrate the baseline durable queue `audit.trace-requested.audit` without loss: stop its tracer binding before normal publication can begin, consume its already-confirmed backlog through the `audit.event-log` handler/inbox identity, and prevent future messages from accumulating there while `audit.event-log` becomes the stable queue. Keep this compatibility behavior bounded and idempotent across reconnects.
- [x] `apps/worker/src/audit/`, `apps/worker/src/shared/`, modules, config, and lifecycle tests -- make `audit.event-log` insert its inbox key and audit row in one transaction; register its durable descriptor successfully even while RabbitMQ is unavailable so the supervisor, relay, heartbeat, signal handlers, and readiness lifecycle still start; process owned claims independently so one aggregate does not prevent other claimed heads; add a bounded periodic connection supervisor; validate claim-lease/reconnect timing against operation and shutdown deadlines; stop the supervisor before draining the relay, broker, persistence, and telemetry.
- [x] `integration/audit-tracer.integration.mjs`, root scripts, and CI integration wiring -- extend the real PostgreSQL/RabbitMQ proof to force the same event delivery twice and observe one effect, seed and drain a confirmed message from the baseline durable queue without leaving its binding active, restart RabbitMQ while retaining persistent data and the same worker process, and publish interleaved aggregate sequences whose audit observations match relay order; use bounded waits, sanitized diagnostics, independent schema queries, and unconditional cleanup.
- [x] Root/workspace test scripts, CI, and `docs/testing/coverage.md` -- establish the campaign's first-code-story V8 coverage gate independently per workspace at 80% lines/statements/functions and 75% branches, document only justified declaration/composition/browser exclusions, and keep every Vitest invocation scoped with `--dir src` so generated `dist` suites cannot be discovered.

**Acceptance Criteria:**

- Given a committed tracer event delivered twice to `audit.event-log`, when both deliveries settle, then exactly one inbox key and one matching audit effect exist, the duplicate is acknowledged, and a forced effect failure commits neither row.
- Given two relay instances and pending events for repeated and distinct aggregate IDs, when they claim and publish concurrently, then no active claim is owned twice, each aggregate is published in event-ID order, and another aggregate can progress while one head fails or remains leased.
- Given a persistent confirmed event and a running worker, when RabbitMQ is restarted without restarting that worker, then the worker recreates the logical consumer topology and the event is eventually audited without loss; any duplicate caused by an ambiguous confirm has no duplicate effect.
- Given an upgraded broker containing the baseline `audit.trace-requested.audit` queue and binding, when the new worker starts, then every queued confirmed tracer event reaches `audit.event-log` exactly once at the effect boundary, the legacy binding no longer receives new events, and no confirmed message is discarded.
- Given application and generated-declaration inspection, when the build is reviewed, then vendor types remain in infrastructure, the queue/inbox name is the stable consumer identity, and the in-memory publisher has no production provider.
- Given a fresh Compose project and the complete verification sequence, when migration, unit, integration, lint, typecheck, and build checks run, then every check passes within its configured deadline and the stack is removed afterward.

## Implementation Notes

## Plan Change Log

- 2026-10-10 — Review loop 1: the first implementation renamed the durable baseline queue without
  an upgrade path and made worker startup depend on an immediately healthy broker. The messaging,
  worker, integration, and coverage tasks now require lossless legacy-queue drainage, descriptor
  registration before connection, retryable topology materialization, strict delivery validation,
  underlying-handler drainage, explicit stale-owner tests, and `--dir src` coverage execution.
  KEEP the transaction-bound inbox/effect, leased aggregate-head SQL with database time, confirmed
  publication generation retirement, same-worker RabbitMQ restart proof, independent relay
  contention proof, in-memory publisher, complete per-workspace coverage thresholds, and justified
  coverage exclusions from the reviewed attempt.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 7 findings — high 2, medium 4, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Unsupported tracer envelopes reached the audit transaction and were
    acknowledged — delivery used only the generic envelope parser while the strict tracer parser
    was unused; strict pre-handler validation is preserved as a re-derivation requirement.
  - `[medium]` `[patch]` Handler timeout removed the delivery from the drain set while its database
    transaction could still be running — the tracked promise was the timeout wrapper, not the
    underlying handler; underlying work must remain tracked through bounded shutdown.
  - `[medium]` `[patch]` Failed queue/binding/consumer materialization left a live generation that
    every supervisor tick treated as healthy — the retained descriptor was never retried; a
    topology failure must retire the generation and force complete rematerialization.
  - `[high]` `[bad_plan]` Initial RabbitMQ unavailability terminated worker bootstrap before the
    reconnect supervisor and remaining lifecycle started — `main.ts` awaited a subscription that
    immediately connected; the amended plan now requires offline descriptor registration and
    supervisor-owned establishment.
  - `[high]` `[bad_plan]` Renaming the baseline durable queue stranded confirmed messages and left
    its durable binding accumulating future copies — the baseline used
    `audit.trace-requested.audit` and Compose persists RabbitMQ data; the amended plan now requires
    a bounded, idempotent, lossless legacy-queue drain and binding migration with a real upgrade
    proof.
  - `[low]` `[patch]` The focused claim-ownership test never exercised a stale owner — every mocked
    update returned success; re-derivation must prove both mark and release reject an empty
    `RETURNING` result for the former claim.
  - `[medium]` `[patch]` The new CI coverage command omitted the repository-mandated `--dir src`
    scope and could discover stale compiled tests — ADR 0004 requires that flag on every Vitest
    invocation; the coverage task now makes the constraint explicit while preserving the coverage
    gate.

### 2026-10-10 — Follow-up review pass

- verdicts: 3 findings — high 2, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` A baseline commit-before-ack redelivery could repeatedly fail the upgraded
    atomic consumer because the pre-existing audit row conflicted while no inbox key existed — the
    audit append now accepts an exact canonical match inside the same transaction, rejects any
    mismatched event-ID reuse, and has unit plus real upgrade regressions.
  - `[high]` `[patch]` First-upgrade topology unbound the legacy queue before binding the stable
    queue, creating an unroutable confirmed-publish window — topology now binds the stable queue
    first, unbinds legacy second, and relies on inbox deduplication during the safe overlap.
  - `[medium]` `[patch]` The real-broker upgrade proof reused topology previously created by the
    upgraded worker, so it did not prove a baseline-only starting point or the commit-before-ack
    ambiguity — the scenario now removes and verifies absence of the stable queue before seeding
    both legacy fixtures and starting the upgraded worker.

## Design Notes

The claim query should atomically select up to the configured batch size from rows whose claim is absent or expired and for which no earlier unpublished row exists for the same aggregate, then assign a database-generated claim ID and expiry. A claim is an ownership lease, not proof of publication: only its owner may mark or release it, and confirm-without-mark remains safely retryable because consumers suppress duplicate effects. The lease must cover the configured worst-case sequential batch (`batch size × operation timeout`, plus the poll margin), or configuration must fail at startup.

RabbitMQ subscriptions are durable declarations, not channel callbacks. `subscribe()` stores each `{ consumerName, eventTypes, handler }` descriptor and succeeds without opening a connection; the worker supervisor owns the first and later bounded `start()` attempts even when RabbitMQ is unavailable or no outbox row is pending. A single-flight connection generation materializes every retained descriptor before becoming live, and any exchange, queue, binding, or consumer failure retires that generation so the next tick retries the whole topology. Matching close/error signals invalidate only that generation. Explicit close first disables reconnection, cancels new deliveries, boundedly drains the underlying handler promises even when their acknowledgement wait has timed out, and then closes the current generation. ADR 0013 still owns retry policy around individual operations.

The baseline tracer queue is durable and therefore part of the upgrade state, even before VPS deployment. On each topology restoration, the adapter must ensure the legacy `audit.trace-requested.audit` binding cannot receive new tracer events before normal publishing resumes, while a separate manual-ack drain consumes any confirmed backlog through the same strict tracer decoder and `audit.event-log` handler. The compatibility path must be safe on a fresh broker, idempotent after a partial migration or reconnect, and must never delete or acknowledge an old message before the inbox/effect transaction commits. The real-service proof seeds the baseline topology first, then starts the upgraded worker and proves both backlog drainage and the absence of future legacy accumulation.

Generic envelope hydration is not schema acceptance. Before a delivery reaches `AuditTraceConsumer`, the broker must apply the tracer's supported type/version/null-trace/empty-payload decoder and reject unsupported messages without logging their body. Tests must separately cover malformed transport bytes, unsupported schema versions, and effect failures.

The idempotency-key table is schema foundation only in this story because no public idempotent command exists yet. Do not invent tracer HTTP replay semantics; define reservation/replay behavior with the first owning business endpoint.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test:coverage && pnpm run build` -- all deterministic workspace quality gates and per-workspace coverage thresholds pass, with every Vitest invocation scoped by `--dir src`.
- `docker compose config --quiet` -- migration, broker persistence, health, and worker timing configuration are valid.
- `docker compose up --build --detach --wait --wait-timeout 180 && pnpm run test:integration` -- a real stack proves legacy-queue upgrade drainage, duplicate suppression, same-worker restart recovery, and per-aggregate relay order.
- `docker compose down --volumes --remove-orphans` -- all verification services and persistent test data are removed even after failure.
- `pnpm why mastra && git diff --check` -- removed runtime remains absent and repository changes contain no whitespace defects.

## Auto Run Result

**Summary:** Implemented the reusable at-least-once delivery protocol around the audit tracer:
transaction-bound inbox deduplication, leased aggregate-head outbox claims, reconnectable logical
RabbitMQ consumers, lossless baseline-queue migration, an in-memory publisher test double, and
independent per-workspace coverage gates.

**Files changed:**

- Application and infrastructure shared packages define claim ownership, inbox recording, logical
  subscriptions, atomic audit effects, confirmed publication, reconnectable topology, and the
  test-only in-memory publisher.
- The worker composes offline consumer registration, broker supervision, claim-aware relay work,
  timing validation, and ordered bounded shutdown.
- Migration `0002` adds inbox, idempotency-key, lease, and supporting index structures without
  cross-context references; migration documentation records the schema contract.
- Compose, environment examples, CI, workspace manifests, and the coverage script configure and
  verify the protocol with PostgreSQL, RabbitMQ, and MinIO.
- Unit and real-service integration tests cover atomic rollback, duplicate suppression, stale claim
  ownership, aggregate ordering, same-process broker recovery, baseline queue migration, and the
  pre-upgrade commit-before-ack ambiguity.
- The epic and coverage policy mirror owner decision D-003 in English: V8 thresholds apply per
  workspace at 80% lines/statements/functions and 75% branches with justified exclusions only.

**Review findings:** The first Quick pass reported seven findings: two high bad-plan gaps, four
medium patches, and one low patch. The plan was amended and the implementation re-derived to keep
startup independent of broker availability, migrate the durable baseline queue without loss,
validate tracer schemas strictly, drain underlying handler work, retire failed topology
generations, prove stale claim ownership, and scope coverage discovery to `src`. The re-derived
Quick pass reported two high and one medium patch: exact-match recovery for an audit effect already
committed before upgrade, bind-before-unbind topology ordering, and a genuinely baseline-only real
upgrade fixture. All three patches were applied. No finding was rejected or deferred.

**Follow-up review recommendation:** `true`. This pass patched two high and one medium findings.
The remaining unverified risk is a real concurrent baseline publisher hitting the exact
bind-before-unbind handoff instant; ordering is enforced by unit tests and the full real upgrade is
covered, but that precise race is modeled rather than synchronized against a live broker.

**Verification:** `pnpm run lint`, workspace type checking, 192 coverage tests, and all workspace
builds passed. Every workspace cleared the 80/75 coverage gate; the lowest aggregate was
infrastructure at 87.83% statements, 79.37% branches, 84.41% functions, and 87.97% lines.
`docker compose config --quiet` passed. A fresh built stack reported PostgreSQL, RabbitMQ, MinIO,
API, worker, AI, and web healthy; `pnpm run test:integration` passed every delivery-guarantee and
upgrade scenario; unconditional teardown removed all containers, networks, and persistent volumes.
`pnpm why mastra` returned no dependency, staged and unstaged `git diff --check` passed, and the
Compose project was empty afterward.

**Residual risks:** Broker-aware HTTP readiness, resilience policies, trace propagation, pruning,
and VPS deployment remain intentionally assigned to later stories. No VPS access or deployment was
performed in this story.
