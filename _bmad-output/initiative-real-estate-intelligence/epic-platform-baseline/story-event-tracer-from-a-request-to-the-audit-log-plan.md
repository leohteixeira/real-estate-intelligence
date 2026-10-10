---
title: 'Event tracer from a request to the audit log'
type: 'feature'
ticket: '3'
created: '2026-10-10'
status: 'built'
baseline_revision: '2394b2ca6e04c21c13eb4b6ec9f5bfee7b082c73'
route: 'full'
route_source: 'pinned'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - 'AGENTS.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
warnings:
  - 'oversized'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The repository has transaction and outbox contracts but no transactional PostgreSQL implementation, broker, relay, consumer, audit store, or real service-backed proof that a request can cross the durable event path. The current Compose stack also starts without migrations, leaves MinIO optional, and has no RabbitMQ or integration CI.

**Approach:** Add one deliberately technical audit tracer: a versioned request atomically appends an immutable event to `platform.outbox`, the worker publishes it through RabbitMQ, and a thin audit consumer appends the same envelope to PostgreSQL. Prove the path on the default local Compose stack and in CI with real PostgreSQL 18 and RabbitMQ.

## Boundaries & Constraints

**Always:** Keep `pg` and `amqplib` types inside infrastructure; issue the outbox insert through the exact checked-out PostgreSQL transaction; generate UUIDv7 values with PostgreSQL 18; preserve the canonical envelope and nullable trace slot; publish persistent messages and mark them published only after broker confirmation; acknowledge the tracer message only after the audit insert commits; bound polls, publish attempts, integration waits, and shutdown; redact connection errors and never log credentials or payloads. Keep AI free of database, broker, and object-storage credentials.

**Never:** Publish during the API request or database transaction; expose vendor handles through application ports; add product business rules; add inbox/idempotency-key tables, general redelivery/effect-once guarantees, broker-restart proof, per-aggregate ordering, retry/backoff, dead letters, pruning, generalized queue conventions, in-memory publishers, trace propagation, broker-aware `/ready`, image publishing, or VPS/domain/TLS work. Those remain with stories 1.4, 1.5, 1.8, 1.12, and 1.14.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Tracer accepted | `POST /api/v1/audit/traces` with no body | `202` with a PostgreSQL-generated UUIDv7 event ID; one matching outbox row is committed | No synchronous broker dependency |
| Complete delivery | Pending tracer row and healthy broker/consumer | Exact event ID and immutable envelope reach `audit.event_log`; outbox gains `published_at` | Polling is bounded and payloads are not logged |
| Request transaction fails | Failure after append but before commit | No outbox or audit row remains | Roll back on the same leased client and preserve a redacted cause |
| Publish is not confirmed | Broker unavailable, timeout, or negative confirmation | Outbox row remains pending | Do not mark published; later polling may retry without a resilience policy |
| Audit insert fails | Valid delivery but PostgreSQL write fails | Message is not acknowledged | Leave recovery/deduplication hardening to story 1.4 |
| Invalid delivery | Malformed or wrong event envelope | No audit row is written | Reject without logging the message body; dead-letter policy is deferred |

</intent-contract>

## Code Map

- `packages/domain/src/audit/` and `packages/contracts/src/audit/` -- define/export the technical `audit.trace.requested` event and the `202 { eventId }` response without introducing a business aggregate.
- `packages/application/src/shared/` and `packages/application/src/audit/` -- add injectable clock/UUID/publisher/audit ports and the transaction-bound tracer use case.
- `packages/infrastructure/src/shared/persistence/` -- add the private `PoolClient` transaction scope/runner, PostgreSQL UUID generator, outbox append/claim/mark adapters, and exact envelope mapping.
- `packages/infrastructure/src/shared/messaging/` and `packages/infrastructure/src/audit/` -- own RabbitMQ topology/publishing/subscription and append-only audit persistence; no vendor types escape.
- `apps/api/src/audit/` and `apps/api/src/persistence/persistence.module.ts` -- expose the demo endpoint and compose transaction-bound adapters.
- `apps/worker/src/shared/`, `apps/worker/src/audit/`, and worker lifecycle/configuration -- run a non-overlapping relay and audit consumer, then drain/close them before persistence shutdown.
- `migrations/`, `scripts/migrate.sh`, `compose.yaml`, `env.example`, and Dockerfiles -- provision schemas/services/migrations with pinned images and telemetry preloading.
- `integration/`, workspace manifests, and `.github/workflows/ci.yml` -- run a bounded full-path proof against the real Compose services.

## Tasks & Acceptance

**Execution:**

- [x] `migrations/README.md`, `migrations/0001_platform_create_outbox.sql`, and `migrations/8001_audit_create_event_log.sql` -- allocate `0000–0999` to platform, then `1000`-sized blocks to properties, market, comparables, collection, locations, ask, alerts, audit, and identity; document `NNNN_<context>_<description>.sql`; create one schema per migration with UUIDv7 checks, JSON-object payloads, a pending-outbox index, and an append-only audit repository surface without cross-schema foreign keys.
- [x] `packages/domain/src/audit/`, `packages/contracts/src/audit/`, and their tests/barrels -- define a payload-free technical trace request and stable asynchronous response; keep `traceContext: null` until story 1.8.
- [x] `packages/application/src/shared/`, `packages/application/src/audit/`, and focused tests -- add vendor-neutral injection tokens/ports and a use case that obtains event and technical aggregate UUIDv7 values inside one transaction, constructs the event, appends it through `OutboxAppendPort`, and returns the event ID.
- [x] `packages/infrastructure/src/shared/persistence/` and tests -- extend the pool behind infrastructure-only seams; implement begin/commit/rollback/release, transaction identity checks, UUID generation, transactional append, ordered `SKIP LOCKED` claims, confirmed-only marking, strict row validation, and redacted failures.
- [x] `packages/infrastructure/src/shared/messaging/`, `packages/infrastructure/src/audit/`, manifests, lockfile, and tests -- add pinned-compatible `amqplib`, one durable exchange/queue binding for the tracer, persistent confirmed publishing, manual consumer acknowledgement after committed append, bounded operations, and clean shutdown.
- [x] `apps/api/src/audit/`, API composition, and controller tests -- add `POST audit/traces` under the existing global `api/v1` prefix and return HTTP 202 with the exact event ID; the API never connects to RabbitMQ.
- [x] `apps/worker/src/shared/`, `apps/worker/src/audit/`, worker composition/config, and lifecycle tests -- replace the placeholder-only loop with a bounded, non-overlapping relay plus tracer-only audit consumer while retaining graceful heartbeat shutdown and safe diagnostics.
- [x] `compose.yaml`, `env.example`, `docker/*.Dockerfile`, and Compose validation -- add pinned RabbitMQ management with assigned ports and health, make pinned MinIO a healthy default service, keep Valkey optional, run migrations once before API/worker, give broker credentials only to worker, add persistent volumes, and preserve OTel preload in API/worker container commands.
- [x] `integration/`, root scripts, and `.github/workflows/ci.yml` -- keep unit tests service-independent; add a dedicated Compose integration job that builds/starts with a deadline, calls the endpoint, polls PostgreSQL for the exact audit/outbox result, reports sanitized diagnostics on failure, and always removes volumes/services.

**Acceptance Criteria:**

- Given a fresh default Compose project, when it starts with waiting enabled, then PostgreSQL, migrations, RabbitMQ, MinIO, API, worker, AI, and web become usable on their assigned ports without manual schema setup; Valkey remains optional.
- Given one call to `POST /api/v1/audit/traces`, when the worker relay and audit consumer run, then the response is 202 and the exact returned UUIDv7 appears in both `platform.outbox` and `audit.event_log`, with matching type, version, aggregate ID, occurrence time, null trace context, and payload; `published_at` is non-null only after broker confirmation.
- Given a forced failure after the outbox append, when the request transaction rolls back, then no row for that event exists in either schema.
- Given a publish failure or audit-write failure, when the worker handles it, then it does not falsely mark or acknowledge the event and exposes no credential or event body in logs.
- Given application dependency inspection, when the source and Compose configuration are reviewed, then only infrastructure imports `pg`/`amqplib`, the API has no broker credential, and AI has no PostgreSQL, RabbitMQ, or MinIO credential.
- Given CI and local verification, when the service-backed test and complete quality gate run, then they pass against real PostgreSQL 18 and RabbitMQ with bounded startup/poll/teardown behavior.

## Implementation Notes

- Implemented a technical `POST /api/v1/audit/traces` endpoint whose PostgreSQL transaction
  allocates UUIDv7 identifiers and appends the canonical event to `platform.outbox`.
- Added a bounded worker relay, confirmed persistent RabbitMQ publishing, a manual-ack audit
  consumer, and append-only `audit.event_log` persistence without exposing vendor types outside
  infrastructure.
- Added numbered platform/audit migrations, a one-shot migration image, default RabbitMQ and
  MinIO services, service health checks, worker readiness/drain behavior, and an isolated CI
  integration job.
- Added unit and real-service integration coverage for accepted delivery, transaction rollback,
  unconfirmed publishing, failed audit persistence, invalid broker messages, and worker readiness.

## Plan Change Log

- 2026-10-10 — Implementation completed without changing the frozen intent contract or planned
  public surface.

## Review Triage Log

- `false` / rejected — The `claimPending()` review finding demonstrated that an unmarked row can be selected again, which is the required retry behavior. This Compose topology registers one non-overlapping `OutboxRelayJob`; multi-relay ownership, duplicate suppression, and effect-once delivery are explicitly deferred by the intent contract, while the implemented selection remains identifier-ordered and uses `FOR UPDATE SKIP LOCKED`.
- `medium` / rejected as intentionally out of scope — A live RabbitMQ restart can leave the cached channel unusable, but the intent contract explicitly defers broker-restart proof and resilience policy. Initial connection and publish failures remain pending and retryable; reconnect hardening belongs to the deferred delivery protocol.
- `medium` / patched — Infrastructure declarations exposed `pg.PoolClient` and an `amqplib` connector type. The leased client is now wrapped behind an infrastructure-owned SQL interface, broker declarations use infrastructure-owned shapes, and the messaging barrel no longer exports the test connector; current generated declarations expose neither vendor type.
- `medium` / patched — A relay poll could outlive clean shutdown on a stalled PostgreSQL operation. PostgreSQL query and statement deadlines now use the worker operation timeout, relay shutdown aborts the active batch between events, and configuration prevents the shutdown deadline from being shorter than one bounded operation.
- `medium` / patched — Nest and the custom signal handlers could close dependencies concurrently, and broker close did not wait for an active consumer effect. The worker now has one ordered signal path, and broker close cancels new delivery then drains tracked in-flight handlers before closing the channel and persistence context.
- `medium` / patched — The real rollback proof bypassed `RequestAuditTrace`. It now invokes that use case with the real transaction, UUID, and outbox adapters and injects the failure immediately after append; focused broker/consumer tests continue to prove the unconfirmed-publish and unacknowledged-audit-failure invariants without requiring the explicitly deferred broker-restart protocol.

### 2026-10-10 — Review pass

- verdicts: 4 findings — high 0, medium 4, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[reject]` The build plan is not Prettier/markdownlint compliant, so the CI
    formatting job remains at risk — the claim is confirmed, but the review workflow explicitly
    requires rejecting any finding whose fix edits this build's plan; repository-wide Markdown
    lint also has pre-existing failures outside this diff.
  - `[medium]` `[patch]` The integration proof joined and queried the platform and audit schemas
    in single SQL statements — each context is now queried independently and the event envelopes
    are compared in JavaScript.
  - `[medium]` `[patch]` Compose readiness did not prove worker consumer registration or AI/web
    availability — the worker now publishes a private readiness marker only after consumer startup,
    while AI and web have endpoint health checks.
  - `[medium]` `[patch]` Compose's default stop window was shorter than the worker shutdown
    deadline — `stop_grace_period` is now 30 seconds, twice the default application deadline.

## Design Notes

`POST /api/v1/audit/traces` is an intentionally technical, payload-free tracer rather than a property or collection capability. Its `audit.trace.requested` event uses separate PostgreSQL-generated event and technical trace-request identifiers and is consumed only by the thin audit context. The request proves transactional outbox participation through an explicit rollback test; it does not claim an aggregate business mutation.

The minimum safe path includes a RabbitMQ confirm before `published_at` and a manual acknowledgement after the audit commit. Story 1.4 still owns the reusable delivery protocol and its harder guarantees: inbox/idempotency keys, duplicate suppression, broker-restart proof, ordering, one-queue-per-consumer conventions, and an in-memory publisher. Story 1.6 later enforces the context layout and migration-block convention chosen here.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` -- all deterministic workspace gates pass.
- `docker compose config --quiet` -- the assigned ports, profiles, dependencies, health checks, migrations, volumes, and environment wiring are valid.
- `docker compose up --build --detach --wait --wait-timeout 180 && pnpm run test:integration` -- a fresh real stack proves request → transaction/outbox → RabbitMQ → audit using the same event ID and covers rollback/failure invariants.
- `docker compose down --volumes --remove-orphans` -- the verification stack is always removed, including after failure.
- `pnpm why mastra && git diff --check` -- Mastra remains absent and repository changes have no whitespace defects.

## Auto Run Result

**Summary:** Implemented and verified the complete request-to-audit tracer through a transactional
PostgreSQL outbox, RabbitMQ, and an append-only audit log. The default Compose stack now provisions
migrations and all required services, waits for actual readiness, and drains the worker cleanly.

**Files changed:**

- Domain, contracts, and application packages define the canonical technical event, response, ports,
  and transactional request use case.
- Infrastructure packages provide PostgreSQL transactions/UUIDv7/outbox/audit adapters and the
  RabbitMQ broker adapter.
- API and worker applications compose the endpoint, relay, consumer, readiness marker, bounded
  operations, and ordered shutdown.
- Migrations, Dockerfiles, Compose, environment example, workspace manifests, and CI provision and
  exercise the real stack.
- Unit and integration tests prove delivery, rollback, negative confirmations, failed writes,
  malformed deliveries, and readiness lifecycle behavior.

**Review findings:** The implementation/quick review patched four medium findings and rejected two
out-of-scope findings: multi-relay claim ownership and live broker reconnection remain assigned to
story 1.4. The formal review patched three medium findings: cross-schema integration SQL, incomplete
service readiness, and an insufficient Compose shutdown window. It rejected one confirmed medium
formatting finding because the mandated review workflow forbids fixing findings by editing the active
build plan. No item was added to `deferred`.

**Follow-up review recommendation:** `true`. This first formal pass patched three medium entries.
The specific risk to re-review is the interaction among the new worker readiness marker, ordered
shutdown, and Compose health behavior, together with the separated context-owned integration queries.

**Verification:** `pnpm run lint`, workspace type checking, 155 tests in 29 files, and all workspace
builds passed. `docker compose config --quiet` passed. A fresh `docker compose up --build --detach
--wait --wait-timeout 180` reported PostgreSQL, RabbitMQ, MinIO, API, worker, AI, and web healthy;
`pnpm run test:integration` passed; teardown removed all containers, networks, and persistent volumes.
`pnpm why mastra`, staged/unstaged `git diff --check`, and targeted syntax/format checks passed.

**Residual risks:** Generalized multi-relay ownership/deduplication and reconnecting a cached broker
channel after a live RabbitMQ restart remain intentionally assigned to story 1.4. The active plan's
formatting finding is recorded as rejected under the review workflow, while repository-wide Markdown
lint also has unrelated pre-existing failures; the CI formatting job therefore remains a known risk.
