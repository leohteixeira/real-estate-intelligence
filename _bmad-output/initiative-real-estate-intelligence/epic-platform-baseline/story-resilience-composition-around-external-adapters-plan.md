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
review_loop_iteration: 2
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
`EventPublisher` binding. Keep the broker connection lifecycle shared, but isolate publication on a
dedicated confirm channel per logical attempt so its acknowledgement, timeout, cancellation, and
cleanup cannot observe another publication or mutate consumer channel state. The message-specific
confirm is the publication outcome; best-effort channel cleanup starts afterward and can neither
delay nor reverse that outcome.

## Boundaries & Constraints

**Always:** Adapters make one attempt and translate errors before crossing the application boundary;
the composition is fallback, bulkhead, breaker, retry, rate limit, per-attempt timeout; retry is
limited to idempotent transient failures and the caller's remaining deadline; one logical publish
produces one breaker outcome; cancellation interrupts waiting, backoff, and the active attempt; the
event identifier remains stable; each publish awaits the confirm callback for exactly its own
message; publisher resource cleanup is scoped to the publisher channel; safe RabbitMQ protocol
rejection codes retain their classification through redaction; the breaker measures total logical
call duration for success and failure before preserving the original outcome; scripted adapters
translate cancellation and arbitrary scripted errors into the closed failure vocabulary; policy
telemetry uses named, low-cardinality, sanitized fields.

**Never:** Do not wrap PostgreSQL, broker consumers, broker connection supervision, or absent future
adapters; do not use the library preset whose order differs from ADR 0013; do not expose vendor
errors, credentials, payloads, or destinations; do not return success from fallback; do not deploy,
activate production dependencies, or require the VPS.

## I/O & Edge-Case Matrix

| Scenario                   | Input / State                                                                                   | Expected Output / Behavior                                               | Error Handling                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Successful publish         | Healthy broker and pending outbox event                                                         | One attempt publishes the same event id and resolves on its own ACK      | Later channel-cleanup delay or failure cannot reverse the successful logical outcome             |
| Concurrent confirms        | Two publications overlap and one is nacked while the other is acked                             | Each call observes only its own confirm callback                         | A nack never rejects or retries an independently acked publication                               |
| Transient outage           | Retryable failure with budget and deadline remaining                                            | Up to five attempts use capped factor-two full jitter                    | Exhaustion becomes a closed `exhausted` failure and invokes fallback                             |
| Non-retryable or cancelled | Rejected, unauthorized, forbidden, or aborted call                                              | No retry; cancellation stops queued or active work                       | Closed failure crosses the boundary without raw cause                                            |
| Dependency degradation     | At least 20 logical calls in 10 seconds, with 50% failures or calls taking at least 1.5 seconds | Breaker opens for 30 seconds, then permits one half-open probe           | Slow outcomes count whether the underlying call succeeds or fails; open calls use the fallback   |
| Capacity pressure          | More than 10 active and 15 waiting calls, or over 100 attempts/second                           | Work remains bounded; rate limiting does not wait                        | Queue expiry or rejection becomes a closed failure                                               |
| Publisher fallback         | Resilience chain cannot publish                                                                 | Relay releases its claim and does not mark the row published             | `event-publisher.leave-outbox-pending` always rejects                                            |
| Publish attempt timeout    | A publisher confirm exceeds its attempt deadline while consumers are active                     | Only that attempt's confirm channel is closed                            | Consumer channel, tags, reconnect state, and connection remain owned by the lifecycle supervisor |
| Topology rejection         | RabbitMQ closes setup with safe protocol code `406`                                             | Adapter reports non-retryable `rejected` without broker text             | No retry and no raw vendor detail crosses the boundary                                           |
| Policy signal              | Retry, timeout, breaker, rate, bulkhead, or fallback transition                                 | OpenTelemetry emits dependency and policy names plus safe counters/state | No event payload, endpoint, token, or raw exception is emitted                                   |

## Code Map

- `packages/application/src/shared/` -- closed external-failure vocabulary and public application contract.
- `packages/infrastructure/src/shared/messaging/` -- RabbitMQ error translation, lifecycle-owned
  consumer channel, per-attempt confirm-channel publication, and deterministic scripted publisher
  fake.
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
      missing-confirm, rejection (including real setup code `406`), and authorization outcomes; use
      a fresh confirm channel and its message-specific callback for each publish attempt; close only
      that publisher channel after ack, nack, cancellation, timeout, or error without awaiting
      cleanup after a terminal ACK; add a scripted fake that preserves ids, accepts caller
      cancellation, and translates abort reasons or arbitrary scripted errors to sanitized closed
      failures before they cross the port.
- [x] `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.test.ts` -- model the pinned
      amqplib confirm callback semantics, prove concurrent ack/nack outcomes are independent, prove
      a timed-out publication leaves active consumer state untouched, and exercise a connector setup
      rejection carrying numeric code `406` through the real redaction/translation path; keep the
      publish resolved when its ACK is received even if the subsequent channel-close promise stalls
      or rejects.
- [x] `apps/worker/src/shared/resilience/` -- implement D-005 named settings and exact ADR ordering
      with a rolling 10%/60-second retry budget, low-traffic reserve, slow logical-call breaker input,
      deadline-aware full jitter, and safe diagnostic-to-OpenTelemetry bridging; classify every
      logical call crossing the slow threshold as a breaker failure while returning its successful
      value or rethrowing its original failure unchanged to the caller.
- [x] `apps/worker/src/shared/resilience/*.test.ts` -- use fake time and deterministic randomness to
      cover success, capped backoff, Retry-After, budget denial, per-attempt timeout, queue
      cancellation, open/half-open breaker, slow success, slow non-transient failure, saturation,
      rate rejection, and rejecting fallback.
- [x] `apps/worker/src/shared/messaging.module.ts` -- expose a resilient `EventPublisher` without
      changing consumer delivery or broker lifecycle behavior.
- [x] `apps/worker/src/shared/outbox-relay.job.test.ts` -- assert every terminal policy failure
      releases the claim and never calls `markPublished`.
- [x] `integration/audit-tracer.integration.mjs` -- prove a real confirmed publication retains its
      event id and a broker outage leaves the outbox row recoverable; explicitly observe the outage
      fixture's non-null claim before graceful worker shutdown, then observe that the claim is
      released and the same row is delivered after recovery.
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
- Given overlapping RabbitMQ publications whose broker outcomes differ, when their confirm callbacks
  settle, then each logical publication receives only its own ack or nack and an acknowledged event
  is neither rejected nor republished because a neighboring event was nacked.
- Given RabbitMQ acknowledges a publication and its publisher-channel close then stalls or fails,
  when the logical attempt completes, then it remains successful and the relay marks the confirmed
  row published without retrying the event.
- Given active broker consumers, when a publication is cancelled or exceeds its attempt timeout,
  then only its publisher confirm channel is disposed and consumer tags, channel, connection, and
  reconnect state remain unchanged.
- Given RabbitMQ rejects exchange setup with protocol code `406`, when publication crosses the
  adapter boundary, then the caller receives sanitized non-retryable `rejected` and no raw broker
  text, retry, or transient classification.
- Given a logical call crosses the slow-call threshold and then returns either success or a
  non-transient failure, when the breaker records the outcome, then that call counts as slow while
  the caller still receives its original success or sanitized failure.
- Given the deterministic scripted publisher is cancelled or a script throws an arbitrary raw
  error, when its result crosses `EventPublisher`, then only a sanitized `ExternalFailure` with the
  correct closed kind is exposed.
- Given policy activity, when telemetry is exported, then spans or metrics identify the dependency
  and policy without payloads, destinations, credentials, or raw vendor exceptions.
- Given the existing consumer and broker lifecycle paths, when the wrapper is installed, then their
  retry, dead-letter, reconnect, and shutdown semantics remain unchanged.

## Implementation Notes

- KEEP during re-derivation: retain the closed `ExternalFailure` vocabulary, exact D-005 policy
  order and numeric settings, stable event identifiers, relay claim-release semantics, rejecting
  named fallback, bounded retry budget, independently cancellable lifecycle establishment wait,
  sanitized low-cardinality telemetry, and the real local RabbitMQ outage/recovery proof.
- Re-derive the broker internals so the lifecycle supervisor owns the connection and consumer
  channel, while each logical publication attempt owns a distinct confirm channel and settles from
  the callback registered by its own `publish` call. Do not use channel-wide `waitForConfirms()` for
  concurrent application outcomes.
- Treat the message-specific ACK as the terminal success boundary. Start publisher-channel cleanup
  after settlement, but do not await its close handshake on the successful call path or let cleanup
  failure reach the resilience policies.
- A publication failure may close its publisher channel, but must not abort the generation's
  consumer controller, clear consumer tags, close the consumer channel, or close an otherwise-live
  connection. Connection event handlers remain responsible for generation invalidation.
- Preserve only allowlisted numeric protocol codes during redaction. Classification must recognize
  safe setup rejection code `406` on the actual connector/setup path, not only on a synthetic
  publish-phase error.
- Measure slow-call duration across both resolution and rejection. The breaker records the slow
  outcome, while an internal wrapper preserves the exact successful result or original sanitized
  failure seen by the caller.
- The real-service outage proof must first observe the inserted event with a non-null claim while
  RabbitMQ is stopped; a fixed sleep or an already-pending untouched row is not sufficient evidence.
- Deployment, production dependency activation, and VPS verification remain explicitly deferred;
  implementation and evidence are local-only until the owner unlocks VPS-dependent work.

## Plan Change Log

### 2026-10-10 — Review loop 1

- Trigger: follow-up review showed that shared channel-wide confirm snapshots coupled concurrent
  publication outcomes, safe RabbitMQ setup rejection code `406` was discarded and retried, and a
  publisher timeout invalidated consumer state through the shared channel/generation.
- Amendment: the approach, boundaries, edge cases, code map, tasks, acceptance criteria, and
  implementation notes now require message-specific confirms on a per-attempt publisher channel,
  publisher-only cleanup, unchanged consumer lifecycle state, and real setup-path `406` coverage.
- Known-bad state avoided: no logical publish may await confirmations belonging to another call, and
  no publication timeout/cancellation may close or reset the consumer channel or connection.
- KEEP: preserve the closed failure contract, D-005 policy order/settings, retry budget, stable ids,
  outbox recovery behavior, rejecting fallback, lifecycle-owned establishment, sanitized telemetry,
  and local real-service outage/recovery evidence that already passed.

### 2026-10-10 — Review loop 2

- Trigger: the re-review showed slow non-transient failures were absent from breaker input and an
  ACKed publication still awaited channel cleanup long enough for the outer timeout to report
  failure and republish it. It also exposed a raw-error test fake and an outage integration proof
  that could pass without the row ever being claimed.
- Amendment: the approach, boundaries, matrix, tasks, acceptance criteria, and implementation notes
  now make the ACK the non-reversible logical outcome, require non-blocking best-effort cleanup,
  count slow success and failure while preserving caller outcomes, sanitize scripted adapter errors,
  and require the integration test to observe a non-null outage claim before shutdown/release.
- Known-bad state avoided: a close handshake cannot turn an ACK into `exhausted`, slow rejected calls
  cannot leave the breaker window empty, raw abort reasons cannot escape the fake adapter, and an
  untouched pending row cannot masquerade as proof of failed-publication recovery.
- KEEP: retain the closed failure contract, D-005 order/settings, retry budget, stable ids, outbox
  recovery behavior, lifecycle-owned shared connection/consumer channel, per-attempt confirm
  channels with message-specific callbacks, `406` classification, sanitized telemetry, and all
  previously passing local gates.

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

### 2026-10-10 — Follow-up review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Concurrent publications used one confirm channel and each called
    channel-wide `waitForConfirms()`, so the later call's snapshot included the earlier call and an
    earlier nack could reject and republish an independently acked event — the plan now requires a
    per-attempt confirm channel and the callback for exactly that message, with an overlapping
    ack/nack acceptance test.
  - `[medium]` `[bad_plan]` Establishment redaction preserved only `403`/`530`, so an actual RabbitMQ
    topology failure with numeric code `406` lost its non-retryable identity and was translated as
    transient — the plan now requires allowlisted `406` preservation and a test through the actual
    connector/setup path.
  - `[medium]` `[bad_plan]` Publisher and consumers shared one generation channel, and any publish
    error or timeout invalidated that generation by aborting consumers and closing their channel and
    connection — the plan now requires publisher-channel-only cleanup and an acceptance test proving
    active consumer state is unchanged.

### 2026-10-10 — Review loop 1 re-review

- verdicts: 4 findings — high 0, medium 3, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Slow-call measurement wrapped only successful results, so a call that
    crossed the threshold and then returned a non-transient failure was excluded by `recordIf` and
    contributed no breaker outcome — the plan now requires duration measurement for resolution and
    rejection while preserving the caller's original result or failure.
  - `[medium]` `[bad_plan]` Publication awaited the publisher-channel close handshake after its ACK,
    allowing the two-second outer timeout to report `exhausted` and release an already-confirmed row
    for duplicate publication — the plan now makes the message ACK terminal and requires cleanup to
    be best-effort and non-gating on the success path.
  - `[low]` `[patch]` The scripted infrastructure publisher propagated raw abort reasons and allowed
    arbitrary script errors across the application port — this direct closed-contract correction is
    subsumed by re-derivation, whose existing adapter boundary requires sanitized `ExternalFailure`
    outcomes.
  - `[medium]` `[patch]` The outage integration slept for the relay interval and then accepted an
    already-null claim, so it could pass without the worker ever attempting the event — the proof
    correction is subsumed by re-derivation and must observe a non-null claim before graceful
    shutdown verifies release and recovery.

### 2026-10-10 — Review loop 2 re-review

- verdicts: 1 finding — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` A server-initiated close on a dedicated publisher confirm channel emitted an
    unhandled `error` before `close`, allowing Node.js to terminate the worker before the outstanding
    confirm callback could reject and release the outbox claim — every publisher channel now installs
    an error listener that rejects only its message-specific confirm; a regression test emits
    publisher `error` then `close`, observes a sanitized failure, and proves the active consumer
    generation remains usable.

## Auto Run Result

**Summary:** Added an adapter-boundary failure vocabulary and an exact-order, named resilience
composition around worker event publication. The amended broker implementation now gives every
logical attempt its own confirm channel and message-specific callback, so overlapping outcomes and
publisher cleanup cannot affect the lifecycle-owned consumer channel or connection.

**Files changed:**

- `packages/application/src/shared/` — defines, exports, and tests the closed external-failure
  contract and the deadline-aware event-publisher port.
- `packages/infrastructure/src/shared/messaging/` — translates RabbitMQ publication outcomes,
  provides a deterministic scripted publisher, preserves independently cancellable connection
  waits, uses one callback-confirmed channel per publish attempt, and covers real amqplib
  authorization, setup-rejection, and negative-confirm shapes.
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

**Review findings:** Twelve findings across the four recorded review passes were implemented: one
high, ten medium, and one low. The follow-up implementation gives each publication an independent callback-
confirmed channel, preserves safe numeric `406` setup classification, isolates publisher cleanup
from consumers, records slow rejected calls without changing their failures, makes ACK terminal,
sanitizes scripted-adapter failures, and observes a real non-null outage claim. No items were
deferred and no findings were rejected. Publisher channels now also convert server-emitted channel
errors into their own sanitized confirm failure without mutating consumer state or risking an
unhandled `EventEmitter` error.

**Follow-up review recommendation:** `true`. The root session should review the re-derived
publisher-channel lifecycle once more because this pass patched a `high` worker-termination risk:
the remaining unverified risk is whether the error listener and message callback can interact badly
under late error/close ordering after a confirm has already settled. Patched counts across recorded
passes: high 1, medium 10, low 1.

**Verification:** Focused messaging tests passed, including overlapping ack/nack,
publisher timeout, publisher cancellation, numeric setup code `406`, and callback nack behavior.
The application, infrastructure, and worker package suites passed with 13, 82, and 61 tests.
`pnpm run test:coverage` passed every workspace threshold. A clean rerun of
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed with 275 tests; the
build retained only the existing non-fatal frontend chunk-size warning. The isolated Compose proof
started healthy PostgreSQL, RabbitMQ, API, and worker services, passed
`INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-5 pnpm run test:integration`, explicitly observing the
outage row's non-null claim before graceful release and recovery, and then removed all
containers, network, and volumes. `git diff --check` also passed.

**Residual risks:** Production and VPS activation remain intentionally unperformed. Negative-confirm
classification depends on the exact error shape of the pinned amqplib version; a future dependency
upgrade must revalidate that boundary. The amended implementation still awaits the root session's
follow-up review.

## Design Notes

The resilience package supplies public primitives but its preset order is not ADR-compatible and it
does not supply the rolling retry budget or slow-success breaker rule. The worker therefore composes
the primitives explicitly, owns those two small policy extensions, and keeps application and
infrastructure packages independent of NestJS. Event publication is idempotent because RabbitMQ
receives the stable domain event id as `messageId`; no other operation is implicitly retryable.

## Verification

**Commands:**

- Focused package tests passed: 13 application, 82 infrastructure, and 61 worker tests.

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
  amended broker implementation; the full unit suite contains 275 tests.
- `docker compose --project-name rei-story-1-5 up -d --build --wait postgres rabbitmq api worker`
  followed by
  `INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-5 pnpm run test:integration` -- passed the isolated
  real-service delivery and outage-recovery proof, including observation of a non-null claim before
  graceful release;
  `docker compose --project-name rei-story-1-5 down -v --remove-orphans` removed its containers,
  network, and volumes afterward.
