---
title: 'Trace context through the outbox and the broker'
type: 'feature'
ticket: '8'
created: '2026-10-10'
status: done
baseline_revision: '6d5316b57543fd2ca21460130421abdd5e3d327c'
route: 'full'
route_source: 'pinned'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0005-observability-with-opentelemetry.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
warnings:
  - 'oversized'
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 1.8 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`packages/infrastructure/src/shared/telemetry/trace-context.test.ts` passed its test-exporter
request/outbox/publisher/consumer lineage assertions. The real broker/outbox audit journey in
`integration/audit-tracer.integration.test.ts` also passed; no remote OTLP backend is claimed.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`fc7c6a46e56904484ff154966eacbf2b12cd0ae3`,
`078ec5e5103f6a87e5b551b98548cc4c59409c0b`,
`01286ba2dbd7d4e5776ec70f8b0b3535ff31df02`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** The event envelope and database already have a trace-context field, but the audit
request always stores `null` and neither the relay nor RabbitMQ activates a causal context. A trace
therefore stops at the HTTP request and cannot explain the eventual consumer effect.

**Approach:** Capture the active request's validated W3C context in the canonical event, preserve it
through the outbox and message body, and use explicit producer/consumer spans plus safe AMQP trace
headers to continue the trace across the asynchronous boundary. Prove the lineage with an in-memory
exporter and retain real-stack compatibility with legacy null-context messages.

## Boundaries & Constraints

**Always:** Keep OpenTelemetry types out of domain and application contracts; store only validated
`traceparent` and optional `tracestate`; keep the request context as the durable causal origin; use
the active producer context in AMQP headers; require matching trace IDs when durable and transport
contexts coexist. Span names and attributes must be low-cardinality and exclude payloads, request
bodies, raw headers, event identifiers, URLs, credentials, connection data, and exception details.
Preserve transaction, claim ownership, confirm, acknowledgement, retry, dead-letter, and shutdown
semantics from Story 1.4.

**Never:** Add automatic RabbitMQ instrumentation, baggage propagation, a production telemetry
backend, VPS/deployment work, schema changes, business events, or provider types in shared ports.
Do not reject pre-1.8 events whose trace context and headers are absent, record raw errors on spans,
or end a consumer span before the underlying handler promise settles.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                                                      | Expected Output / Behavior                                                                         | Error Handling                                           |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Traced request  | Valid sampled W3C context                                          | Event, outbox and audit rows retain the request context; producer and consumer remain in one trace | No error expected                                        |
| Trace variants  | Unsampled flags, optional tracestate, or no active context         | Flags/state survive when present; null remains deliverable                                         | Telemetry never changes business delivery                |
| Legacy delivery | Null event context and no trace headers                            | Existing durable message is consumed and acknowledged after commit                                 | Consumer may start a local root span                     |
| Invalid carrier | Malformed header or trace ID differs from a non-null event context | Handler is not invoked                                                                             | Existing sanitized dead-letter path handles the envelope |
| Failed work     | Publish retry or handler failure/timeout                           | Span status is categorical; claim and ack rules are unchanged                                      | No payload, credential, raw error, or header is recorded |

</intent-contract>

## Code Map

- `packages/domain/src/shared/trace-context.ts`, `domain-event.ts`, and
  `audit/trace-requested.event.ts` -- reuse strict immutable W3C validation; allow the audit event to
  receive a vendor-neutral context instead of forcing `null`.
- `packages/application/src/audit/request-audit-trace.service.ts` -- accept the captured context and
  append the canonical event without importing OpenTelemetry.
- `apps/api/src/audit/` and `apps/api/src/otel.ts` -- capture only the active span context at the
  HTTP boundary and keep exporter-disabled startup deterministic.
- `packages/infrastructure/src/shared/persistence/postgres-outbox.ts` -- retain current JSONB
  round-trip and add the intentional `outbox.append` span around the same transaction client.
- `apps/worker/src/shared/outbox-relay.job.ts` -- reconstruct the durable parent and run the
  resilience-wrapped publication within one `outbox.publish` producer span.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` -- inject/extract strict
  W3C AMQP headers, activate a `messaging.consume` span for the complete handler promise, and retain
  trace headers during retry/dead-letter transfers.
- `integration/audit-tracer.integration.mjs` -- assert request-to-outbox-to-audit context continuity
  while preserving the null-context legacy upgrade fixtures and Story 1.4 matrix.

## Tasks & Acceptance

**Execution:**

- [x] `apps/api/package.json`, `apps/worker/package.json`, `packages/infrastructure/package.json`,
      `pnpm-lock.yaml`, `apps/api/src/http/trace-context.ts`, and
      `packages/infrastructure/src/shared/telemetry/` -- add direct OTel API/test dependencies where
      imported and centralize validated capture, reconstruction, and safe span completion without
      leaking provider types into application/domain packages.
- [x] `packages/domain/src/audit/`, `packages/application/src/audit/`, and `apps/api/src/audit/` --
      capture the active server span and persist its W3C context in `AuditTraceRequested`, retaining
      explicit `null` support for non-request callers.
- [x] `packages/infrastructure/src/shared/persistence/postgres-outbox.ts` and tests -- emit
      `outbox.append` while preserving the exact transaction and JSONB mapping.
- [x] `apps/worker/src/shared/outbox-relay.job.ts` and tests -- parent `outbox.publish` from the
      durable context and keep the existing release/mark behavior under success, retry, and abort.
- [x] `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` and tests -- propagate
      safe AMQP headers, validate header/body consistency, activate the consumer across underlying
      work, accept legacy null contexts, and dead-letter invalid carriers without logging them.
- [x] In-memory exporter acceptance coverage and `integration/audit-tracer.integration.mjs` -- prove
      the request, append, publish, and consumer spans share one trace; prove database context
      continuity on the real stack and rerun all existing delivery guarantees.

**Acceptance Criteria:**

- Given a request with a valid W3C parent, when the real API/outbox/relay/consumer path completes,
  then the outbox and audit rows contain the same validated request trace context and the effect is
  committed once.
- Given the in-memory exporter, when the production tracing seams execute the event flow, then the
  request, `outbox.append`, `outbox.publish`, and `messaging.consume` spans share a trace, the
  consumer descends from the producer, and exported data contains none of the sentinel payload or
  credential values.
- Given a legacy null-context message with no trace headers, when RabbitMQ delivers it, then it
  retains Story 1.4 transaction, deduplication, acknowledgement, and migration behavior.
- Given a malformed or trace-ID-mismatched carrier, when RabbitMQ delivers it, then no handler runs
  and the delivery follows the bounded sanitized dead-letter path.
- Given the complete repository and Compose verification sequence, when all gates run, then unit,
  coverage, build, migration, broker restart, deduplication, ordering, legacy migration,
  dead-letter, retention, and trace-continuity checks pass without VPS access.

## Implementation Notes

- The API converts only the active span context into the domain's validated immutable W3C shape;
  non-request callers and legacy deliveries retain explicit null-context behavior.
- `outbox.append`, `outbox.publish`, and `messaging.consume` spans use the canonical event context as
  durable origin. RabbitMQ carries only validated W3C headers and rejects malformed or trace-ID-
  mismatched carriers through the existing sanitized dead-letter path.
- Consumer span lifetime follows the underlying handler promise, including after broker timeout,
  without changing claim, confirm, transaction, acknowledgement, retry, or shutdown behavior.
- A `NoopSpanProcessor` keeps real tracer providers active when OTLP export is disabled, preserving
  child span IDs and propagation without sending telemetry to a backend.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The no-endpoint API and worker bootstrap supplied empty span-processor
    arrays, so NodeSDK registered no tracer provider and default Compose collapsed the producer and
    consumer lineage — replaced the empty trace arrays with a no-export `NoopSpanProcessor`, moved
    its package to runtime dependencies, and added bootstrap regressions proving a remote parent
    receives a distinct child span in both processes.

## Design Notes

The durable event context identifies the originating request and remains unchanged in PostgreSQL
and the message body. The relay creates a producer child from that context and injects the producer
context into AMQP headers; the consumer therefore becomes a child of the producer while a trace-ID
equality check prevents the transport carrier from being attached to a different durable origin.
Messages predating this story remain valid with a null context and no headers.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test:coverage && pnpm run build` -- all static,
  unit, exporter, and per-workspace coverage gates pass; 305 tests pass after the review repair.
- `docker compose config --quiet` -- application and integration configuration remains valid.
- `docker compose up --build --detach --wait --wait-timeout 180 && pnpm run test:integration` -- the
  real PostgreSQL/RabbitMQ path passes trace continuity and the full delivery-guarantee matrix.
- `docker compose down --volumes --remove-orphans` -- the local stack and test data are removed.
- `pnpm why mastra && git diff --check` -- removed runtime stays absent and the diff is clean.

## Auto Run Result

- **Summary:** Captured validated request trace context in the canonical audit event, persisted it
  through the transactional outbox, propagated a producer context over RabbitMQ, and activated a
  consumer span for the complete handler lifetime while retaining all Story 1.4 delivery
  guarantees and legacy null-context compatibility.
- **Files changed:** API audit/telemetry files capture and bootstrap context; domain/application
  audit files carry the vendor-neutral context; infrastructure persistence, telemetry, and broker
  files create spans and validate carriers; worker relay files activate producer spans; integration
  and unit tests cover lineage, failure categories, invalid carriers, and real-stack persistence;
  package manifests and the lockfile contain the direct OpenTelemetry dependencies.
- **Review:** One medium patch applied. Empty no-endpoint span processors were replaced with a
  no-export processor so default Compose retains real span lineage. Nothing was deferred and no
  findings were rejected.
- **Follow-up review recommendation:** `false` — one medium entry was patched, below the threshold
  for another automatic review pass. Patched counts: high 0, medium 1, low 0.
- **Verification:** Lint, typecheck, coverage, build, Compose configuration, production image build,
  service health, and the complete PostgreSQL/RabbitMQ integration matrix passed. Compose resources
  and volumes were removed afterward; `pnpm why mastra` remained empty and diff checks passed.
- **Residual risks:** Export visibility still depends on the OTLP backend and VPS work owned by the
  later deployment story; this story deliberately verifies local propagation without choosing or
  deploying that backend.
