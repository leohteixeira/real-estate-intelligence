---
title: 'Synthetic source collected end to end'
type: 'feature'
ticket: '2'
created: '2026-10-10'
status: 'built'
baseline_revision: '9250a71bdddef6e8f0de3881307b9c47afeca2de'
route: 'full'
route_source: 'pinned'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 3
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
  - 'specs/adrs/0015-handling-of-collected-data.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The collection contracts exist only as an isolated fixture publisher; no executable
path proves that source acquisition, raw storage, transactional run persistence, outbox delivery,
and audit consumption work together.

**Approach:** Add consumer-owned `ListingSource` and `RawSnapshotStore` ports, a one-shot synthetic
collection use case, PostgreSQL collection adapters, an S3-compatible snapshot adapter, and a
worker command plus consumer. Exercise the complete path on Compose from the synthetic source to
MinIO, PostgreSQL, RabbitMQ, and the append-only audit log.

## Boundaries & Constraints

**Always:** Use only the labelled synthetic source and its seeded enabled register row. Fetch raw
bytes through `ListingSource`, hash the exact bytes as canonical `sha256:<lowercase hex>`, store
them through `RawSnapshotStore` before parsing, and key immutable objects by content hash. After
object persistence, record one completed run and its snapshot metadata and append the parsed and
completed events in one PostgreSQL transaction. Keep Nest wiring in the worker composition layer,
ports/use cases in application, vendor and SQL details in infrastructure, and public symbols
through context indexes. The collection consumer must use the existing inbox transaction pattern
to put collection events in the audit log. The command is repeatable for an explicitly supplied
operation key and closes resources cleanly.

**Never:** Add an HTTP collection endpoint, run collection automatically when the long-lived
worker starts, contact or enable a real source, depend on the VPS, store photographs or personal
data, expose S3/pg/Nest types through application ports, parse before confirmed raw storage, or
claim cross-resource atomicity. Do not add scheduling, resumable checkpoints, source backoff,
sanitization/encryption/expiry, image fetching, normalization, or production deployment; later
stories own those capabilities.

## I/O & Edge-Case Matrix

| Scenario         | Input / State                                    | Expected Output / Behavior                                                           | Error Handling                                            |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| First command    | Enabled synthetic source and fresh operation key | One immutable object, one completed run/snapshot, parsed and completed outbox events | No error expected                                         |
| Command replay   | Same operation key after success                 | Existing result is returned; no duplicate run, snapshot metadata, or events          | No destructive overwrite                                  |
| Storage failure  | Snapshot store rejects before persistence        | Nothing is parsed or committed to PostgreSQL                                         | Typed/closed failure propagates and command exits nonzero |
| Database failure | Object stored but DB transaction fails           | No partial DB run/outbox state; deterministic object may remain for safe reuse       | Failure propagates; retry reuses the object key           |
| Disabled source  | Unknown or non-enabled source                    | Source is not fetched and no artifact is created                                     | Command refuses closed                                    |
| Event redelivery | Parsed/completed event delivered more than once  | Audit log contains one row per event identifier                                      | Inbox suppresses duplicate effects atomically             |

</intent-contract>

## Code Map

- `packages/application/src/collection/` -- source/storage/repository ports and the one-shot use case.
- `packages/infrastructure/src/collection/` -- synthetic source, S3-compatible storage, PostgreSQL
  adapters, canonical bytes/hash handling, and fakes/unit tests.
- `migrations/4001_collection_create_collection_pipeline.sql` -- collection-owned register, run,
  reusable content-addressed raw objects, per-run snapshot observations, operation-key uniqueness,
  and the enabled synthetic seed.
- `apps/worker/src/collection/` -- Nest composition, one-shot command bootstrap, and idempotent audit
  consumer; the ordinary worker only starts the consumer.
- `compose.yaml` and worker/package configuration -- MinIO connectivity and an explicit collection
  command service/script without changing the long-lived startup path.
- `integration/synthetic-collection.integration.mjs` -- Compose acceptance across object storage,
  database, outbox relay, broker, inbox, and audit log.

## Tasks & Acceptance

**Execution:**

- [x] Define minimal JSON/byte-oriented collection ports and a transactionally orchestrated
      use case with explicit operation-key replay, store-before-parse ordering, strict source
      permission checks, existing clock/UUID/outbox seams, and unit coverage for every matrix row.
- [x] Implement deterministic synthetic, in-memory test, MinIO/S3, and PostgreSQL adapters without
      leaking vendor types; expose collection adapters only from the infrastructure collection API.
- [x] Add the collection migration with context-local constraints, UUIDv7 checks, immutable raw
      objects unique by content hash/key, per-run snapshot observations that may reference the same
      object in later runs, operation-key replay uniqueness, and one honest synthetic seed.
- [x] Wire a dedicated Nest application-context command and the collection audit consumer; add
      validated object-store configuration, a configured deadline, SIGINT/SIGTERM cancellation,
      clean resource shutdown, and preserve long-lived worker shutdown/readiness. Create one
      collection operation span and propagate its active trace context into both durable events.
- [x] Add the Compose command path and an isolated integration test that runs migrations/services,
      executes and replays collection, waits for relay/consumption, and proves exact DB/object/audit
      outcomes without reading any ignored environment file. Prove redelivery was consumed by
      observing the durable consumer queue drain before checking unchanged inbox/audit counts.

**Acceptance Criteria:**

- Given the Compose stack, when the synthetic collection command runs, then exactly one completed
  run and snapshot metadata row exist, the raw bytes are retrievable from the hash-keyed object,
  and the corresponding parsed event is present in the audit log.
- Given the same operation key is run again, when all stores are inspected, then counts and event
  identifiers are unchanged and no duplicate artifact exists.
- Given a different operation key collects the same unchanged synthetic bytes, when it completes,
  then it creates a distinct run and snapshot observation that reuse the one immutable raw object.
- Given collection or completed events are redelivered, when the consumer handles them, then its
  inbox marker and audit append remain atomic and the append-only audit log has one event row.
- Given any pre-storage or transactional failure, when the command exits, then no parsed event is
  emitted and no partial PostgreSQL state is committed; a previously written deterministic object
  is safe to reuse.
- Given the command exceeds its configured deadline or receives SIGINT/SIGTERM, when cancellation
  propagates, then pending collection work aborts and the Nest context, database, S3 client, and
  telemetry shut down cleanly; both emitted events carry the collection span's trace context.
- Given all quality gates, when verification runs, then lint, typecheck, coverage, build, migration
  checks, and the synthetic Compose integration pass without a real source or VPS.

## Implementation Notes

- `CollectSourceOnce` checks the registered source before acquisition, stores exact bytes before
  parsing, calculates separate content and canonical manifest hashes, and persists the run,
  observation, and both outbox events in one PostgreSQL transaction. Replaying an operation key
  returns the prior result; a new operation over unchanged bytes reuses the immutable raw object.
- The one-shot Nest command is separate from the long-lived worker. Its operation span supplies
  the durable trace context, its deadline and process signals reach repository queries and the
  transaction runner, and cancellation destroys a leased PostgreSQL connection before pending
  work can later commit. Nest and telemetry cleanup are independent, bounded, and preserve the
  primary failure.
- Existing S3 objects are accepted only after length, immutable hash metadata, and body SHA-256
  agree. A database failure may therefore leave only a deterministic, integrity-checked object for
  safe retry; no cross-resource atomicity is claimed.
- The Compose campaign owns its credentials, database, vhost, bucket, project, and dynamically
  allocated host ports, disables implicit environment files, and derives every client endpoint
  from the same fixture. PostgreSQL readiness checks the final TCP server rather than the temporary
  initialization socket, allowing concurrent isolated campaigns.

## Plan Change Log

### 2026-10-10 — Review loop 1

- Trigger: fresh runs with different operation keys could not reuse unchanged content because the
  plan conflated immutable raw-object identity with per-run snapshot observation identity.
- Amendment: split raw object metadata from per-run observations and require a second-operation-key
  acceptance case. Avoid the known-bad global uniqueness on observation content. KEEP the exact
  bytes, canonical hash/key, store-before-parse order, transactional run/outbox, and replay path.
- Trigger: the one-shot command had no bounded cancellation or collector trace, and redelivery
  evidence could pass before consumption.
- Amendment: require configured deadline plus signal cancellation and cleanup, an operation span
  whose context reaches both events, and durable consumer-queue drain evidence. KEEP the separate
  Nest command, normal worker consumer, atomic inbox/audit handling, and isolated Compose campaign.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 5 findings — high 0, medium 4, low 0, false 1, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Global snapshot/object uniqueness blocks a fresh run over unchanged
    content — the synthetic adapter returns the same identifier and bytes, while a different
    operation key inserts a new observation that violates both unique constraints. The plan now
    separates reusable immutable objects from per-run observations and adds this acceptance case.
  - `[false]` `[reject]` The raw snapshot adapter lacks the full ADR 0013 resilience composition —
    the adapter's single attempt is intentional, while Story 2.6 explicitly owns retry, backoff,
    rate limiting, circuit breaker, fallback, and policy telemetry; this story excludes that work.
  - `[medium]` `[bad_plan]` The command has neither a deadline nor signal-driven cleanup — its
    never-aborted signal can leave I/O unbounded, and process termination can skip Nest/S3/database/
    telemetry shutdown. The plan now requires bounded cancellation and cleanup evidence.
  - `[medium]` `[bad_plan]` The redelivery integration assertion can pass before either republished
    event is consumed — its database counts are already satisfied. The plan now requires the
    durable consumer queue to drain before unchanged-effect assertions.
  - `[medium]` `[bad_plan]` The collection command creates no operation span and emits events with
    null trace context — auto-instrumented child calls cannot supply the required durable causal
    correlation. The plan now requires one collection span and propagation to both events.

### 2026-10-10 — Review pass 2

- verdicts: 4 findings — high 0, medium 3, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Cancellation could expire after a transaction began without preventing a
    later commit — propagate the collection signal through lookups and the transaction runner,
    cancel the leased PostgreSQL client on abort, and prove no commit occurs for pending work.
  - `[medium]` `[patch]` Existing content-addressed objects were trusted from length and mutable
    metadata alone — read and hash the retained body before reuse and reject corrupted bytes.
  - `[medium]` `[patch]` The Compose campaign did not explicitly disable automatic ignored `.env`
    loading — disable Compose's default environment file in every integration invocation.
  - `[low]` `[patch]` Sequential cleanup could skip telemetry after a Nest close failure and could
    wait without a bound — attempt both cleanup operations independently within a bounded path
    while preserving the primary operation failure.

### 2026-10-10 — Review pass 3

- verdicts: 2 findings — high 0, medium 1, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Generic shell variables could still change Compose credentials, vhost,
    database, or bucket while clients used fixed fixture values — explicitly set every Compose
    interpolation input and derive all clients from one campaign-owned fixture.
  - `[low]` `[patch]` Separate Compose project names still shared fixed host ports — allocate and
    validate distinct run-specific ports for every published service. A concurrent verification
    then exposed PostgreSQL's socket-only initialization health window, so readiness now probes
    the final TCP listener and selected database before migrations start.

## Design Notes

The raw object boundary uses exact UTF-8 JSON bytes rather than a vendor DTO, making the SHA-256
the identity of what was actually retained. S3 is written before PostgreSQL because parsing an
unstored payload violates CAP-2; a transaction cannot include S3, so a deterministic orphan object
is the safe failure residue. The dedicated one-shot command is an owner-operated surface and keeps
the pre-authentication application free of a privileged HTTP endpoint.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test:coverage && pnpm run build` -- passed after
  all review repairs; 403 tests ran under coverage and every workspace met its threshold.
- Two simultaneous `pnpm run test:integration:collection` invocations -- both passed with isolated
  projects, fixture credentials, buckets, volumes, networks, and dynamically allocated ports. Each
  pipeline proved exact bytes, content/manifest hashes, run/object/observation counts, outbox/audit
  delivery, operation-key replay, unchanged-content reuse, trace context, and durable redelivery
  drain without an ignored environment file, real source, or VPS.
- `pnpm exec prettier --check integration/synthetic-collection.integration.mjs
_bmad-output/initiative-real-estate-intelligence/epic-collection/story-synthetic-source-collected-end-to-end-plan.md`
  and `git diff --check` -- passed.

## Auto Run Result

- **Summary:** Added an executable synthetic collection path from exact source bytes through
  content-addressed S3 storage, transactional PostgreSQL run/observation/outbox persistence, broker
  relay, idempotent inbox consumption, and append-only audit evidence, exposed only as an
  owner-operated one-shot worker command.
- **Files changed:** Application collection ports and orchestration define the vendor-neutral
  boundary; infrastructure collection adapters implement synthetic, in-memory, PostgreSQL, and S3
  behavior; the worker owns command/consumer composition and cancellation; migration 4001 owns the
  register, run, object, and observation tables; Compose, manifests, configuration, and the
  integration campaign provide the executable local path; this plan records decisions and proof.
- **Review:** Seven findings were patched across three passes: transaction cancellation, retained
  S3-body integrity, implicit and inherited Compose configuration, bounded independent cleanup,
  concurrent host-port isolation, and final PostgreSQL TCP readiness. The full resilience policy
  finding was rejected because Story 2.6 explicitly owns it. Nothing was deferred.
- **Follow-up review recommendation:** `false` — the mandatory follow-up found one medium and one
  low isolation issue, both patched and directly verified with two simultaneous full campaigns;
  the patched-medium threshold does not require another automatic review.
- **Verification:** Lint, context-boundary and migration checks, typecheck, coverage for all 403
  tests, build, changed-file formatting, whitespace checks, a single Compose campaign, and two
  concurrent Compose campaigns passed. The existing web `CityScene` chunk-size warning remains
  informational.
- **Residual risks:** S3 object reuse intentionally incurs a body read and SHA-256 pass to avoid
  trusting mutable metadata. There is an unavoidable short OS-port handoff between discovery and
  Docker publication, although run-specific allocation and concurrent campaigns remove the fixed
  collision. Production source authorization, checkpoints/resume behavior, full retry/backoff/
  breaker composition, sanitization, lifecycle policy, and VPS deployment remain owned by later
  stories.
