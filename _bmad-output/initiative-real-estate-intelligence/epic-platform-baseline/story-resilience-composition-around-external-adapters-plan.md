---
title: 'Resilience composition around external adapters'
type: 'feature'
ticket: '5'
created: '2026-10-10'
status: 'built'
baseline_revision: '04610af4dfe3fb642e26095a990f97ce9b070ed0'
route: 'full'
route_source: 'auto'
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
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
warnings: []
deferred: []
---

## Intent

**Problem:** External publication currently reaches RabbitMQ without the closed failure vocabulary,
bounded policy composition, named fallback, or safe policy telemetry required by ADR 0013. An
incorrect retry or fallback could either amplify an outage or falsely mark an outbox row published.

**Approach:** Introduce a vendor-neutral external-failure contract and an exact-order, named
resilience executor built from public `@nestjs/resilience` primitives, then wrap only the worker's
`EventPublisher` binding while leaving the raw broker responsible for subscription and lifecycle.

## Boundaries & Constraints

**Always:** Adapters make one attempt and translate errors before crossing the application boundary;
the composition is fallback, bulkhead, breaker, retry, rate limit, per-attempt timeout; retry is
limited to idempotent transient failures and the caller's remaining deadline; one logical publish
produces one breaker outcome; cancellation interrupts waiting, backoff, and the active attempt; the
event identifier remains stable; policy telemetry uses named, low-cardinality, sanitized fields.

**Never:** Do not wrap PostgreSQL, broker consumers, broker connection supervision, or absent future
adapters; do not use the library preset whose order differs from ADR 0013; do not expose vendor
errors, credentials, payloads, or destinations; do not return success from fallback; do not deploy,
activate production dependencies, or require the VPS.

## I/O & Edge-Case Matrix

| Scenario                   | Input / State                                                                                   | Expected Output / Behavior                                               | Error Handling                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Successful publish         | Healthy broker and pending outbox event                                                         | One attempt publishes the same event id                                  | Records a successful logical outcome                                 |
| Transient outage           | Retryable failure with budget and deadline remaining                                            | Up to five attempts use capped factor-two full jitter                    | Exhaustion becomes a closed `exhausted` failure and invokes fallback |
| Non-retryable or cancelled | Rejected, unauthorized, forbidden, or aborted call                                              | No retry; cancellation stops queued or active work                       | Closed failure crosses the boundary without raw cause                |
| Dependency degradation     | At least 20 logical calls in 10 seconds, with 50% failures or calls taking at least 1.5 seconds | Breaker opens for 30 seconds, then permits one half-open probe           | Open calls fail fast and use the named fallback                      |
| Capacity pressure          | More than 10 active and 15 waiting calls, or over 100 attempts/second                           | Work remains bounded; rate limiting does not wait                        | Queue expiry or rejection becomes a closed failure                   |
| Publisher fallback         | Resilience chain cannot publish                                                                 | Relay releases its claim and does not mark the row published             | `event-publisher.leave-outbox-pending` always rejects                |
| Policy signal              | Retry, timeout, breaker, rate, bulkhead, or fallback transition                                 | OpenTelemetry emits dependency and policy names plus safe counters/state | No event payload, endpoint, token, or raw exception is emitted       |

## Code Map

- `packages/application/src/shared/` -- closed external-failure vocabulary and public application contract.
- `packages/infrastructure/src/shared/messaging/` -- RabbitMQ error translation and deterministic
  scripted publisher fake.
- `apps/worker/src/shared/resilience/` -- named configuration, exact-order executor, retry budget,
  slow-call tracking, telemetry, and fake-clock tests.
- `apps/worker/src/shared/messaging.module.ts` -- bind the relay-facing publisher to the resilient
  wrapper while preserving the raw subscriber.
- `apps/worker/src/shared/outbox-relay.job.test.ts` -- prove fallback leaves failed rows pending.
- `integration/audit-tracer.integration.mjs` -- narrow real RabbitMQ publication proof without
  production infrastructure.
- `apps/worker/package.json` and `pnpm-lock.yaml` -- pin the resilience package used by the worker
  composition root.

## Tasks & Acceptance

**Execution:**

- [x] `packages/application/src/shared/` -- add the closed failure kinds and sanitized error shape,
      export them, and test construction/classification boundaries.
- [x] `packages/infrastructure/src/shared/messaging/` -- translate abort, network, timeout,
      missing-confirm, rejection, and authorization outcomes; add a scripted fake that preserves ids
      and accepts caller cancellation.
- [x] `apps/worker/src/shared/resilience/` -- implement D-005 named settings and exact ADR ordering
      with a rolling 10%/60-second retry budget, low-traffic reserve, slow logical-call breaker input,
      deadline-aware full jitter, and safe diagnostic-to-OpenTelemetry bridging.
- [x] `apps/worker/src/shared/resilience/*.test.ts` -- use fake time and deterministic randomness to
      cover success, capped backoff, Retry-After, budget denial, per-attempt timeout, queue
      cancellation, open/half-open breaker, slow success, saturation, rate rejection, and rejecting
      fallback.
- [x] `apps/worker/src/shared/messaging.module.ts` -- expose a resilient `EventPublisher` without
      changing consumer delivery or broker lifecycle behavior.
- [x] `apps/worker/src/shared/outbox-relay.job.test.ts` -- assert every terminal policy failure
      releases the claim and never calls `markPublished`.
- [x] `integration/audit-tracer.integration.mjs` -- prove a real confirmed publication retains its
      event id and a broker outage leaves the outbox row recoverable.
- [x] `apps/worker/package.json`, `pnpm-lock.yaml`, and story documentation -- add the exact
      dependency and record local verification plus the production/VPS deferral.

**Acceptance Criteria:**

- Given a pending outbox event and a transient publisher failure, when the dependency recovers within
  the retry budget and caller deadline, then the same event id is confirmed and the row is marked
  published once.
- Given an exhausted, rejected, unauthorized, forbidden, cancelled, capacity, rate, timeout, or
  open-breaker outcome, when relay publication terminates, then the claim is released and the row
  remains unpublished for a later cycle.
- Given deterministic time and randomness, when each D-005 threshold is crossed, then tests observe
  its exact attempt count, bounded delay, breaker transition, queue bound, timeout, retry-budget
  decision, and named fallback.
- Given policy activity, when telemetry is exported, then spans or metrics identify the dependency
  and policy without payloads, destinations, credentials, or raw vendor exceptions.
- Given the existing consumer and broker lifecycle paths, when the wrapper is installed, then their
  retry, dead-letter, reconnect, and shutdown semantics remain unchanged.

## Implementation Notes

- Added a vendor-neutral `ExternalFailure` contract with the complete closed failure vocabulary,
  retry classification, bounded retry metadata, and no raw vendor cause or diagnostic payload.
- Translated RabbitMQ cancellation, timeout, authorization, rejection, confirm ambiguity, and
  network failures at the adapter boundary. Added a deterministic scripted publisher for policy
  tests while retaining the raw broker as the subscriber and lifecycle owner.
- Pinned `@nestjs/resilience` `0.0.2` and composed its public policies explicitly in D-005 order:
  fallback, bulkhead, breaker, retry, rate limit, and per-attempt timeout. The worker-owned
  extensions implement the rolling retry budget and count slow successful logical calls toward
  the breaker without creating an extra publish attempt.
- Bound only the relay-facing `EventPublisher` to the resilient wrapper. The relay now supplies an
  absolute operation deadline, preserves the same event id across attempts, and releases claims
  for every terminal policy failure without calling `markPublished`.
- Bridged public resilience diagnostic channels to OpenTelemetry with fixed dependency, policy,
  and event names plus bounded numeric/state attributes. Raw errors, payloads, destinations, and
  credentials are deliberately discarded.
- Extended the real-service integration proof to stop RabbitMQ, append an outbox event, verify the
  failed relay releases the claim while leaving `published_at` null, restart the broker, and
  confirm delivery with the original event id.
- Deployment, production dependency activation, and VPS verification remain explicitly deferred;
  this implementation and its evidence are local-only.
- The two ADR paths recorded in `context` use superseded filenames in the plan. The implementation
  loaded the repository's current normative equivalents,
  `0012-domain-events-and-transactional-outbox.md` and
  `0013-anti-corruption-layer-and-resilience-for-external-systems.md`.
- After that discovery, the plan's `context` entries were corrected to those current filenames.
- An independent integration rerun exposed a Compose startup race before the first API request. The
  verification command now waits for service health; with that readiness boundary, the complete
  RabbitMQ outage/recovery scenario passed and cleanup removed every isolated resource.
- Review corrections made RabbitMQ establishment lifecycle-owned while giving every caller an
  independently cancellable wait, preserved only safe numeric authorization classification through
  redaction, classified amqplib negative confirms as non-retryable rejection, and removed variable
  delay values from metric dimensions while retaining them on span events.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 4 findings — high 0, medium 4, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The first `start` caller owned the shared connection attempt while later
    callers could not cancel their own wait, and publication did not recheck cancellation after
    startup — establishment is now lifecycle-owned, each wait is independently abortable, and
    publication rechecks the caller signal before using the channel.
  - `[medium]` `[patch]` Real amqplib authorization failures use numeric `code` values that redaction
    discarded — redaction now preserves only safe 403/530 classification codes and the connector
    rejection path proves unauthorized mapping without leaking broker details.
  - `[medium]` `[patch]` A negative publisher confirm is reported by amqplib as the untyped
    `Error('message nacked')`, which previously fell through to transient retry — the exact pinned
    confirm shape now maps to non-retryable `rejected` and is covered at the broker boundary.
  - `[medium]` `[patch]` Exact jitter and Retry-After timings were metric attributes with unbounded
    cardinality — counters now retain only bounded dimensions while span events keep the detailed
    timing values.

## Auto Run Result

**Summary:** Added an adapter-boundary failure vocabulary and an exact-order, named resilience
composition around worker event publication. The relay preserves stable event identifiers, leaves
failed outbox rows pending, and emits sanitized policy telemetry without changing RabbitMQ consumer
or lifecycle ownership.

**Files changed:**

- `packages/application/src/shared/` — defines, exports, and tests the closed external-failure
  contract and the deadline-aware event-publisher port.
- `packages/infrastructure/src/shared/messaging/` — translates RabbitMQ publication outcomes,
  provides a deterministic scripted publisher, preserves independently cancellable connection
  waits, and covers real amqplib authorization and negative-confirm shapes.
- `apps/worker/src/shared/resilience/` — implements and tests the D-005 settings, retry budget,
  slow-call breaker input, exact policy composition, rejecting fallback, and bounded telemetry.
- `apps/worker/src/shared/messaging.module.ts` — binds only the relay-facing publisher to the
  resilience wrapper while retaining the raw broker for subscription and lifecycle.
- `apps/worker/src/shared/outbox-relay.job.ts` and its test — propagate the operation deadline and
  verify terminal failures release claims without marking publication complete.
- `integration/audit-tracer.integration.mjs` — proves broker outage recovery with the same event id
  and an unpublished, released outbox row during failure.
- `apps/worker/package.json` and `pnpm-lock.yaml` — pin `@nestjs/resilience` 0.0.2 for the worker.
- The epic and this plan — record D-005, implementation evidence, review triage, and local-only
  production/VPS deferral.

**Review findings:** Four medium patch findings were verified and fixed: shared-establishment
cancellation ownership, numeric amqplib authorization classification, negative-confirm rejection,
and high-cardinality metric dimensions. No items were deferred and no findings were rejected.

**Follow-up review recommendation:** `true`. This first pass patched four medium findings; an
independent follow-up should concentrate on the interaction between caller cancellation and shared
RabbitMQ lifecycle establishment, plus the pinned amqplib error-shape translation boundary. Patched
counts: high 0, medium 4, low 0.

**Verification:** Focused review-repair tests passed (41 infrastructure and 5 telemetry tests).
`pnpm run test:coverage` passed every workspace threshold. After repairing one lint-only unused
binding in the telemetry patch, a clean rerun of
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed with 264 tests; the
build retained only the existing non-fatal frontend chunk-size warning. The isolated Compose proof
started healthy PostgreSQL, RabbitMQ, API, and worker services, passed
`INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-5 pnpm run test:integration`, and then removed all
containers, network, and volumes. `git diff --check` also passed.

**Residual risks:** Production and VPS activation remain intentionally unperformed. Negative-confirm
classification depends on the exact error shape of the pinned amqplib version; a future dependency
upgrade must revalidate that boundary. The follow-up review recommendation above remains open.

## Design Notes

The resilience package supplies public primitives but its preset order is not ADR-compatible and it
does not supply the rolling retry budget or slow-success breaker rule. The worker therefore composes
the primitives explicitly, owns those two small policy extensions, and keeps application and
infrastructure packages independent of NestJS. Event publication is idempotent because RabbitMQ
receives the stable domain event id as `messageId`; no other operation is implicitly retryable.

## Verification

**Commands:**

- Focused package tests passed: 13 application, 73 infrastructure, and 60 worker tests.

  ```sh
  pnpm --filter @rei/application test && \
    pnpm --filter @rei/infrastructure test && \
    pnpm --filter @rei/worker test
  ```

- `pnpm run test:coverage` -- passed; every workspace remains above its configured statement,
  branch, function, and line thresholds.
- Targeted Prettier and markdownlint checks for this story's changed files pass. The repository-wide
  `pnpm run format:check` and `pnpm run lint:md` remain red on pre-existing story and generated
  `_bmad/render` Markdown (36 formatting warnings and 1,182 markdownlint findings outside this
  story after its own findings are excluded).
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` -- passed after the
  review repair; the full unit suite contains 264 tests.
- `docker compose --project-name rei-story-1-5 up -d --build --wait postgres rabbitmq api worker`
  followed by
  `INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-5 pnpm run test:integration` -- passed the isolated
  real-service delivery and outage-recovery proof;
  `docker compose --project-name rei-story-1-5 down -v --remove-orphans` removed its containers,
  network, and volumes afterward.
