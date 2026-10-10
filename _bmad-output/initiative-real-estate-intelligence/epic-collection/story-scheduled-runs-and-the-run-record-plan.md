---
title: 'Scheduled runs and the run record'
type: 'feature'
ticket: '14'
created: '2026-10-10'
status: 'built'
baseline_revision: 'f6399d660915f0fb7f2ff83c71174ca90473d887'
route: 'full'
route_source: 'pinned'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0005-observability-with-opentelemetry.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
warnings:
  - 'oversized'
deferred:
  - 'Source retry, rate limiting, backoff, block detection, circuit breaking, and automatic disablement belong to Story 2.6.'
  - 'Snapshot sanitization, encryption, and expiry belong to Story 2.7.'
  - 'Production schedule activation, deployment, VPS access, and remote telemetry proof belong to Story 2.12 and remain blocked until the operator returns.'
---

<intent-contract>

## Intent

**Problem:** Resumable collection runs exist only as owner-operated commands. The long-lived worker
cannot dispatch permitted sources on a durable schedule, bound concurrent work, cancel in-flight
collection safely, or distinguish collected, changed, and deterministically failed observations.

**Approach:** Add fixed-interval UTC schedules whose due slots atomically create an outbox-backed
`collection.run.requested` command. Consume those commands through RabbitMQ with a bounded run
limiter and delivery cancellation, reuse `CollectSourceRun` and its deterministic operation key,
and extend the durable run record with auditable changed/failed observation outcomes.

## Boundaries & Constraints

**Always:** Keep one disabled-by-default schedule per owned fixture source. Claim due rows with
`FOR UPDATE SKIP LOCKED`; in one transaction mark the slot in-flight, advance `next_run_at` past
missed slots without catch-up, and append the request event. Derive the operation key solely from
source ID and scheduled UTC instant. Keep a schedule in-flight until the matching key completes;
success/replay records inbox and clears it atomically, while cancellation/failure leaves it for
redelivery. Limit active runs globally and to one per source. Propagate one delivery `AbortSignal`
through limiter, telemetry, source, storage, and transactions. Stop scheduling before broker drain.

Treat `observed` as collected. Mark a parsed observation `changed` only when its content hash
differs from the same listing in the latest earlier completed run; first-seen, equal hashes, and
incomplete prior runs are unchanged. Record deterministic parser rejection as a failed observation
after its raw snapshot is stored; infrastructure, cancellation, and source failures remain
resumable and do not advance the checkpoint. Preserve
`changed <= parsed` and `parsed + suppressed + failed <= observed`. Keep
`collection.run.completed` V1 unchanged and exactly once.

**Never:** Do not publish commands directly, schedule a real source, add cron/time-zone semantics,
invent terminal run states, expose schedule APIs, or add retries/backoff/rate/circuit/block policy.
Do not deploy, access the VPS, require remote OTLP, read ignored environment files, or change
Stories 2.6, 2.7, or 2.12 scope.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                                    | Expected Output / Behavior                                               | Error Handling                                          |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Due slot        | Enabled due schedule, no in-flight key           | One deterministic command and future next slot commit together           | Rollback leaves the slot due and no outbox row          |
| Concurrent poll | Two workers see the same due slot                | One claims it; the other skips without blocking                          | No duplicate command or key                             |
| Delivery        | Valid request and free permits                   | Same source/key reaches `CollectSourceRun` under the consume trace       | Malformed input performs no collection and dead-letters |
| Redelivery      | Existing running or completed key                | Resume the same run, or replay it without mutation                       | Only matching success clears in-flight                  |
| Changed item    | Latest completed prior hash differs              | Observation is parsed, marked changed, and increments both counts        | Earlier/incomplete runs do not affect the result        |
| Parse rejection | Raw bytes stored but deterministic parse rejects | Failed observation and checkpoint commit without a parsed event          | Operational failures leave the previous checkpoint      |
| Shutdown        | `SIGTERM` during a delayed page                  | Polling stops, delivery aborts, no ack occurs, committed prefix survives | Restart redelivers and resumes the same run             |

</intent-contract>

## Code Map

- `migrations/4004_collection_add_scheduled_runs.sql` -- append-only schedule, changed/outcome
  columns, constraints, indexes, backfills, and disabled owned-fixture schedules.
- `packages/domain/src/collection/` -- exact V1 request contract plus run/count invariants; do not
  change the existing completion payload version. The request parser must reject an operation key
  unless it exactly equals the canonical key derived from its source and scheduled instant.
- `packages/application/src/collection/` -- schedule repository/use case, request consumer service,
  operation-key derivation, prior-hash semantics, and evolved page observation outcomes.
- `packages/application/src/shared/event-subscriber.ts` -- delivery cancellation and handler
  deadline contract while preserving one-argument consumers.
- `packages/infrastructure/src/collection/` -- PostgreSQL schedule claims/completion and atomic
  changed/failed observation persistence; keep the Story 2.5 checkpoint lock/CAS.
- `packages/infrastructure/src/shared/messaging/rabbitmq-event-broker.ts` -- per-delivery abort,
  separate handler deadline, configurable prefetch, unacked controlled shutdown, and drain.
- `packages/infrastructure/src/shared/telemetry/` -- scheduled collection span as a child of consume,
  bounded result/count attributes, and no key/cursor/URL/object/payload attributes.
- `apps/worker/src/collection/` -- worker-owned adapters, scheduler poller, request consumer, global
  plus per-source limiter, and resource lifecycle; reuse `CollectSourceRun`. Route every seeded
  owned fixture source to a compatible `ListingSource`, including both `synthetic-data` and the
  three São Paulo portal fixtures.
- `apps/worker/src/config.ts`, `main.ts`, `worker-shutdown.ts`, and tests -- validated schedule,
  concurrency, handler/run/drain settings and ordered shutdown.
- `compose.yaml`, `package.json`, and `integration/scheduled-collection.integration.mjs` -- isolated
  local PostgreSQL/RabbitMQ/MinIO campaign with real worker signals and fail-safe cleanup.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/collection/`, `packages/application/src/collection/`, and tests -- define
      exact request/schedule/outcome contracts, deterministic keys, changed semantics, failed parse
      accounting, and transactional orchestration. Reject a request whose key is not the canonical
      key for its source and scheduled instant before any collection effect.
- [x] `migrations/4004_collection_add_scheduled_runs.sql` and
      `packages/infrastructure/src/collection/` -- implement durable schedules, safe concurrent
      claims, matching completion, history lookup, backfills, and auditable count persistence.
- [x] `packages/application/src/shared/event-subscriber.ts` and
      `packages/infrastructure/src/shared/{messaging,telemetry}/` -- separate broker I/O timeout from
      handler deadline, propagate abort, drain without ack/retry transfer on shutdown, and preserve
      trace ancestry without sensitive attributes.
- [x] `apps/worker/src/collection/`, `config.ts`, `main.ts`, and `worker-shutdown.ts` -- wire the
      poller, consumer, fixture-source router, object store, limiter, and ordered lifecycle into the
      long-lived worker. Cover every seeded owned fixture schedule with the router and prove that
      `synthetic-data` as well as a portal fixture can fetch and parse through it.
- [x] `compose.yaml`, root scripts, and `integration/scheduled-collection.integration.mjs` -- prove
      a scheduled Aurora run and real `SIGTERM`/restart on an isolated Compose stack; always remove
      containers, networks, and volumes.

**Acceptance Criteria:**

- Given an explicitly enabled due Aurora schedule, when the local worker runs, then one command
  traverses outbox and RabbitMQ and one run completes with three observations, three parsed events,
  one completion event, counts `observed=3`, `parsed=3`, `changed=0`, `failed=0`, a cleared matching
  in-flight key, and a future next slot.
- Given concurrent scheduler polls or duplicate delivery, when work settles, then only one logical
  source/slot operation exists and no observation, event, checkpoint, or count is duplicated.
- Given a delayed scheduled run at checkpoint one, when its worker receives real `SIGTERM`, then it
  exits within the configured deadline with the run still `running`, one committed observation and
  no completion; a fresh worker redelivers the same key, reuses the same run ID, and completes the
  remaining fixture exactly once.
- Given prior completed, incomplete, equal-hash, and different-hash observations, when a page
  commits, then changed flags/counts use only the latest earlier completed run and deterministic
  parser rejection is recorded without a parsed event.
- Given focused/full tests and local integrations, when gates finish, then lint, typecheck,
  coverage, build, migration conventions, formatting, diff checks, cleanup audit, and independent
  QUICK review pass without weakening prior stories; no VPS, real-source request, push, or ignored
  environment-file access occurs.

## Implementation Notes

## Plan Change Log

### 2026-10-10 — Review repair 1

- Trigger: QUICK review found that the worker seeded `synthetic-data` but wired only the São Paulo
  portal adapter, so one owned fixture schedule could never complete and remained in-flight.
- Amendment: made canonical request-key validation and complete owned-fixture routing explicit in
  the code map and execution tasks, with direct coverage for `synthetic-data` and portal fixtures.
- Known-bad state avoided: arbitrary syntactically valid request keys causing collection effects,
  failed observations being skipped as the latest completed-run hash baseline, and enabled fixture
  schedules targeting an incompatible adapter.
- KEEP: retain the migration and count constraints, atomic `SKIP LOCKED` claim plus outbox append,
  deterministic scheduling, global/per-source limiter, broker delivery cancellation and drain,
  ordered shutdown, immutable plain wire envelopes, durable parse-rejection records, and the real
  PostgreSQL/RabbitMQ/MinIO `SIGTERM`/restart integration campaign.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` A request key was validated only syntactically and could trigger durable
    collection effects before the mismatched schedule clear failed — confirmed in the domain
    parser and consumer call order; direct patch is superseded by the bad-plan rederivation.
  - `[medium]` `[patch]` Changed detection excluded failed observations from an otherwise completed
    latest run and could compare against an older parsed hash — confirmed in both PostgreSQL and
    in-memory repository predicates; direct patch is superseded by the bad-plan rederivation.
  - `[medium]` `[bad_plan]` The seeded `synthetic-data` schedule targeted a worker source that
    explicitly rejects that ID — the missing planned fixture router triggered the plan amendment
    and full rederivation while preserving the verified architecture listed in KEEP.

### 2026-10-10 — Review pass 2

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; the context-free QUICK reviewer read the entire rederived diff and confirmed the
  canonical key trust boundary, completed-run hash baseline, owned-fixture router, transactional
  schedule flow, cancellation/redelivery behavior, count constraints, lifecycle, and telemetry.

## Design Notes

Use a fixed-interval schedule rather than cron. The scheduler creates durable commands; the
consumer performs collection. Broker operation timeout, collection-handler deadline, and shutdown
drain deadline are distinct settings. The worker may prefetch up to the global collection limit,
but the in-process limiter and persistent in-flight key remain authoritative. Historical rows
backfill `changed=false`; the past cannot be reconstructed safely from aggregates alone.

## Verification

**Commands:**

- `pnpm --filter @rei/domain test` and `pnpm --filter @rei/application test` -- contracts and use
  cases pass.
- `pnpm --filter @rei/infrastructure test` and `pnpm --filter @rei/worker test` -- adapters,
  broker, telemetry, and lifecycle pass.
- `pnpm run test:integration:scheduled-collection` -- the scheduled run and stop/resume campaign
  pass and clean up.
- `pnpm run test:integration:resumable-collection`, `test:integration:collection`, and
  `test:integration:source-register` -- prior collection behavior remains green.
- `pnpm run test:coverage`, `lint`, `typecheck`, `test`, and `build` -- repository gates pass.
- `pnpm exec prettier --check <changed-files>`, plan Markdown lint, and `git diff --check` --
  changed artifacts are clean.

## Auto Run Result

**Summary:** Built durable fixed-interval collection scheduling, bounded scheduled execution,
graceful cancellation/redelivery, auditable changed and failed observations, complete owned-fixture
routing, and the local PostgreSQL/RabbitMQ/MinIO `SIGTERM`/restart proof. The implementation was
fully rederived after the first QUICK review and passed a clean second QUICK review.

**Files:** Added migration `4004`, schedule domain/application/infrastructure adapters, worker
scheduler/consumer/limiter/router, broker delivery cancellation and drain support, scheduled
telemetry, configuration, unit tests, and the scheduled collection integration campaign. Existing
collection, run, facade, Compose, and shutdown files were evolved without changing the completion
event V1 contract.

**Review:** Two QUICK passes ran. Pass 1 found three medium issues: two patch defects and one
bad-plan omission. The plan was amended and the implementation rederived. Pass 2 reported zero
findings and independently confirmed all three repairs and the surrounding transactional,
concurrency, shutdown, and telemetry behavior. No follow-up review is recommended.

**Verification:** 524 focused tests and 581 full-workspace tests passed. Coverage, lint, migration
conventions, context boundaries, typecheck, build, changed-file Prettier, isolated plan
markdownlint, and diff checks passed. The scheduled, resumable, synthetic collection, and source
register integrations passed, including a real `SIGTERM`/restart and concurrent PostgreSQL claim.
All Compose resources were removed afterward.

**Residual risks:** Source retry/backoff/rate-limit/block policy remains deferred to Story 2.6;
snapshot sanitization/encryption/expiry remains deferred to Story 2.7; production activation, VPS
access, and remote telemetry proof remain deferred to Story 2.12 until the operator returns. The
frontend build retains its existing informational warning for a generated chunk over 500 kB.
