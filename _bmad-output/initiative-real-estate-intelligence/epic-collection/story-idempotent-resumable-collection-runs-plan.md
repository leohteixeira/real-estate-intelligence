---
title: 'Idempotent, resumable collection runs'
type: 'feature'
ticket: '5'
created: '2026-10-10'
status: done
baseline_revision: '883bcc449373dc2743e65d90699bd470c22dbb8e'
route: 'full'
route_source: 'pinned'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 2
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0003-persistence-driver-and-migrations.md'
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
  - 'specs/adrs/0015-handling-of-collected-data.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - '_bmad-output/initiative-real-estate-intelligence/epic-collection/story-synthetic-source-collected-end-to-end-plan.md'
  - '_bmad-output/initiative-real-estate-intelligence/epic-collection/story-synthetic-sao-paulo-dataset-plan.md'
  - '_bmad-output/initiative-real-estate-intelligence/epic-collection/story-source-register-and-the-review-gate-plan.md'
warnings: []
deferred:
  - 'Retry, backoff, rate enforcement, circuit breaking, and source degradation belong to Story 2.6.'
  - 'Scheduling, broker-delivered collection commands, concurrency policy, graceful run draining, and operational run telemetry belong to Story 2.14.'
  - 'Production scheduling and VPS deployment remain blocked until the operator unlocks their owning story.'
---

## Orchestrator Closure — 2026-10-11

Ticket 2.5 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`integration/resumable-collection.integration.test.ts` passed its actual SIGKILL/restart,
legacy-schema upgrade, checkpoint contention and unique-observation/replay assertions.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`f787cc06c391c0d366174717d057f96a3004f9ab`,
`58305e67ebba837ce076c339607ce95aed162ca8`,
`f6399d660915f0fb7f2ff83c71174ca90473d887`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** The current collection proof executes one document and persists only a terminal run.
It has no durable intermediate state, page cursor, or way to recover work after a process crash.
Its replay lookup also assumes exactly one observation and one parsed-event identifier per run. A
multi-listing source therefore cannot advance incrementally, and killing the command between source
pages would either restart from the beginning or require unsafe in-memory reconstruction.

**Approach:** Introduce a durable, source-scoped collection-run aggregate with `running` and
`completed` states, an opaque monotonic page checkpoint, and one persisted parsed-event identity per
observation. Evolve the listing-source port from one-document fetch to checkpointed pages, and add
a resumable use case that stores and parses a page before atomically persisting its raw-object
metadata, observations, parsed events, and next checkpoint. The final page atomically persists its
observations, derives the manifest from authoritative database rows, closes the run, and appends its
single completion event. Make the Story 2.3 Aurora fixture executable as one observation per page,
then prove recovery by killing a local command container with `SIGKILL` after checkpoint one and
starting a fresh process with the same source and operation key.

## Boundaries & Constraints

**Always:** Bind each operation key permanently to exactly one source. A completed replay returns
the original run without source, object-storage, parse, identifier, transaction, or outbox work. A
running replay resumes from its persisted checkpoint and reuses the same run ID. Treat the
checkpoint cursor as opaque source-owned text; validate only a bounded safe wire shape and never
log it. Start at ordinal zero with a null cursor, and advance by exactly one ordinal after each
successfully committed page. A non-terminal page must contain at least one document and must return
a cursor different from the cursor it consumed. A terminal page may be empty and completes a
zero-observation run safely.

Store every document's bytes before parsing, as required by CAP-2. Process pages and documents
sequentially in this story. Require every document to match the requested source, require unique
source-listing IDs within a page, and reject a conflicting repeat within the same run. Persist one
`parsed_event_id` on each observation and one `completed_event_id` on the run. Keep observation,
raw-object metadata, parsed event, and checkpoint advancement in one PostgreSQL transaction. On the
terminal page, also compute the canonical manifest from the persisted run observations, transition
the run to completed, and append the completion event in that same transaction. Continue hashing
the UTF-8 bytes of `JSON.stringify(sortedSourceListingIds)` with SHA-256.

Use a row lock or compare-and-swap against run ID, expected ordinal, and expected cursor so two
processes cannot both commit one logical page. A stale contender reloads the winner's checkpoint
and continues or returns the completed replay; it never creates alternate events. Content-addressed
S3 writes remain safe to repeat. An object written before a PostgreSQL rollback may be orphaned,
but no checkpoint, observation, or outbox row may survive that rollback.

Register `synthetic-portal-aurora`, `synthetic-portal-brisa`, and
`synthetic-portal-cobalto` as additional repository-owned synthetic runtime fixtures. Keep
`synthetic-data` for Story 2.2 compatibility. The closed owned-fixture allowlist therefore contains
exactly four IDs; arbitrary rows cannot claim the synthetic exception. The register contains the
thirteen reviewed candidates plus these three runtime aliases, for sixteen total rows, four enabled
synthetic sources, and zero enabled real sources. Use Aurora's fixed 2026-10 observations as the
crash/resume scenario, one document per page in stable source-listing-ID order.

**Never:** Do not add a scheduler, cron, implicit worker-start execution, RabbitMQ collection
command, retry loop, rate limiter, backoff, jitter, circuit breaker, block detection, automatic
source disablement, or durable-execution framework. Do not add per-source/global concurrency policy,
new run failure/degraded/paused/cancelled states, changed/failed operational accounting, or a broad
run-observability API. Do not change event version 1, publish directly to RabbitMQ, or emit new
started/checkpointed/stored events. Do not add global uniqueness for a source/listing identity
across runs: historical observations of the same listing in later runs are valid. Do not contact or
enable a real source, read an ignored environment file, deploy anything, or use the VPS.

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                                          | Expected Output / Behavior                                                                                                   | Failure Evidence                                                                       |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Fresh run                   | Enabled owned fixture, unused operation key, null checkpoint           | One durable `running` row is created with ordinal zero and a stable UUIDv7 run ID before page work                           | Source/storage runs before authorization/run creation, or restart gets another run ID  |
| Completed replay            | Same source and operation key already completed                        | Original immutable result returns as replay with no external or transactional work                                           | Source, S3, parser, IDs, outbox, checkpoint, or timestamps change                      |
| Cross-source replay         | Existing operation key is bound to another source                      | Request is rejected before source/storage I/O                                                                                | Existing run is returned or rebound to the new source                                  |
| Unknown/disabled source     | Source is absent, disabled, non-listing, or collection-disallowed      | Request is refused and no run row/source call is created                                                                     | A partial run or external call exists                                                  |
| Valid page                  | Expected cursor yields one or more distinct documents and a new cursor | Bytes are stored then parsed; observations/events/checkpoint commit once in one transaction                                  | Parse precedes store, checkpoint advances separately, or partial rows survive rollback |
| Empty nonterminal page      | `documents=[]`, `exhausted=false`                                      | Page is rejected without checkpoint movement                                                                                 | Busy loop or silent ordinal advance                                                    |
| Repeated nonterminal cursor | New cursor equals consumed cursor                                      | Page is rejected without checkpoint movement                                                                                 | Same page can loop indefinitely                                                        |
| Wrong source                | Any page document declares another source ID                           | Whole page is rejected before PostgreSQL commit                                                                              | Cross-source observation enters the run                                                |
| Duplicate in page           | Two documents have the same source-listing ID                          | Whole page is rejected                                                                                                       | Two stores/parses/events are committed for one identity                                |
| Identical overlap           | A stale process prepares a page already committed by a winner          | CAS loses, winner state is reloaded, no second observation/event is written                                                  | Duplicate row/event or alternate parsed event ID appears                               |
| Conflicting repeat          | Source repeats a run identity with different content/provenance        | Persistence rejects it; committed prefix is unchanged                                                                        | Existing observation is overwritten                                                    |
| Storage failure             | S3 fails before parse/transaction                                      | Run remains at previous checkpoint and parser is not called                                                                  | Database prefix advances or event appears                                              |
| Parse failure               | Object was stored but parse fails                                      | Run/checkpoint/outbox remain unchanged; only content-addressed object may exist                                              | Observation/checkpoint survives                                                        |
| Transaction failure         | S3/parse succeeded but PostgreSQL rolls back                           | No page observation/event/checkpoint survives; restart reuses/verifies object and commits once                               | Partial database effects remain                                                        |
| Crash before page commit    | Process receives `SIGKILL` while next page is prepared                 | Last committed checkpoint is authoritative; restart requests that cursor again                                               | Uncommitted ordinal/observation appears                                                |
| Crash after page commit     | `SIGKILL` occurs after checkpoint one is visible                       | Restart begins strictly after the committed prefix and retains the same run ID                                               | First listing/event is duplicated or skipped                                           |
| Concurrent page             | Two processes prepare the same expected ordinal/cursor                 | Exactly one transaction advances; loser reloads without alternate event                                                      | Ordinal skips, duplicate event, or inconsistent count                                  |
| Final populated page        | Last page contains documents with `exhausted=true`                     | Page observations, final checkpoint, manifest, completed state, and one completion event commit together                     | Completed run omits the final page or has no event                                     |
| Final empty page            | Source is exhausted immediately                                        | Zero-count completed run has canonical empty manifest and one completion event                                               | Run cannot finish or uses a noncanonical hash                                          |
| Completed facade            | Read facade receives a completed run                                   | Existing bounded completed view remains valid for multiple observations                                                      | Query assumes one observation or returns duplicate run rows                            |
| Running facade              | Read facade is asked for a running run                                 | Existing completed-only view returns null; Story 2.14 owns operational running views                                         | Nullable terminal fields leak into old contract                                        |
| Legacy run                  | Migration sees a Story 2.2 completed row                               | Its parsed event ID is moved to its observation and terminal semantics remain readable                                       | Migration loses event identity or breaks replay                                        |
| Fixture register            | Migration 4003 runs after 4002                                         | Exactly 16 rows exist: 13 reviewed candidates plus 3 executable aliases; four owned fixtures enabled; no real source enabled | Arbitrary synthetic exception or real enablement appears                               |
| Kill/restart campaign       | Aurora command is killed after durable checkpoint one, then restarted  | Same run completes three identities once each; replay is byte/count/ID stable                                                | New run ID, duplicated observation/outbox/audit, or missing listing                    |

## Frozen Acceptance Criteria

- Given an enabled repository-owned synthetic source and a fresh safe operation key, when the
  resumable command starts, then it creates one `running` source-bound run with checkpoint ordinal
  zero and a stable UUIDv7 run ID before fetching a page. The same operation key cannot be used for
  another source and unknown/disabled/non-listing sources create no run artifact.
- Given a source page, when it is processed, then every document matches the requested source,
  source-listing IDs are unique within the page, bytes are stored before parsing, and a nonterminal
  page is nonempty with a bounded cursor different from the consumed cursor. Any violation leaves
  the durable checkpoint and PostgreSQL prefix unchanged.
- Given a valid page, when it commits, then raw-object metadata, one observation and persisted
  parsed-event ID per document, corresponding `collection.snapshot.parsed` outbox rows, accumulated
  counts, and the next ordinal/cursor are written in one transaction. A rollback leaves none of
  those database effects; a content-addressed object written earlier may safely remain.
- Given the final page, when its transaction commits, then its observations and parsed events, the
  final checkpoint, a manifest derived from all authoritative persisted observations in sorted
  source-listing-ID order, the `completed` transition, and exactly one
  `collection.run.completed` event commit atomically. A terminal empty page produces the canonical
  SHA-256 manifest of `[]` and zero counts.
- Given two processes prepare the same run checkpoint, when they race to commit, then a lock/CAS
  allows at most one to advance and emit events. The loser reloads the winner's state, keeps the
  same run ID, and neither overwrites a conflicting observation nor creates a second parsed or
  completion event.
- Given a completed source/operation pair, when it is executed again, then the original completed
  result is returned as a replay and source, storage, parsing, identifier generation, transactions,
  checkpoints, observations, outbox, inbox, audit, and completion timestamps remain unchanged.
- Given migration 4003, when existing and new register/run rows are inspected, then Story 2.2's
  completed run remains readable, its singular parsed-event identity is backfilled to its
  observation, partial runs have coherent nullable terminal fields, and the register contains the
  closed four-ID owned-fixture allowlist without enabling a real source.
- Given `synthetic-portal-aurora` at dataset cycle `2026-10`, when it runs normally, then one page
  per fixed observation produces `AUR-BV-001`, `AUR-PN-001`, and `AUR-SN-001` exactly once in
  stable order, three parsed events correlated to one run, one completion event, and the canonical
  three-ID manifest.
- Given the isolated local Compose campaign, when the command container is killed with `SIGKILL`
  after checkpoint one is durable and before completion, then PostgreSQL shows one running run,
  one observation/parsed event, and no completion. Starting a fresh process with the same source
  and operation key reuses that run ID, resumes from the persisted cursor, completes the remaining
  two observations, drains the existing outbox/audit path without duplicates, and a later replay
  changes no identifier or count.
- Given all verification, when focused/full suites, migration checks, the crash/restart campaign,
  lint, typecheck, coverage, build, formatting, and diff checks run, then Stories 2.1-2.4 remain
  compatible and no scheduler, resilience policy, real source, ignored environment file, deployed
  service, or VPS operation has entered the change.

</intent-contract>

## Code Map

- `migrations/4003_collection_add_resumable_runs.sql` -- append-only evolution of run state,
  checkpoint columns, nullable terminal fields, per-observation parsed event IDs, legacy backfill,
  coherent state constraints, closed four-fixture allowlist, and three runtime fixture rows.
- `packages/domain/src/collection/collection-run.ts` -- immutable run/checkpoint state, safe cursor
  validation, exact monotonic transition rules, completion invariants, and stale-transition errors.
- `packages/domain/src/collection/collection-run.test.ts` -- fresh/resume/advance/terminal/immutable,
  cursor, empty completion, and invalid transition matrix.
- `packages/domain/src/collection/collection-manifest.ts` -- one canonical sorted-identity manifest
  implementation shared by one-shot, replay fixture, and resumable flow.
- `packages/domain/src/collection/collection-manifest.test.ts` -- order independence, empty hash,
  duplicate rejection, wire stability, and safe identifier cases.
- `packages/domain/src/collection/source-registration.ts` and tests -- replace the one-ID synthetic
  exception with an exact four-ID repository-owned fixture allowlist.
- `packages/domain/src/collection/index.ts` -- export run and manifest contracts through the context.
- `packages/application/src/collection/listing-source.port.ts` -- checkpointed `fetchPage` contract,
  immutable page/documents, and existing parser capability.
- `packages/application/src/collection/collection-run.repository.ts` -- start/load, completed replay,
  expected-checkpoint page commit, persisted-observation query, and run-level result contracts.
- `packages/application/src/collection/collect-source-run.service.ts` -- authorization, start/resume
  loop, store-before-parse preparation, transactional page commit/outbox, CAS reload, final manifest,
  cancellation, and replay behavior.
- `packages/application/src/collection/collect-source-run.service.test.ts` -- full application edge
  matrix, call ordering, fault boundaries, race behavior, completion, and no-work replay.
- `packages/application/src/collection/collect-source-once.service.ts` and tests -- compatibility
  adapter or one-page wrapper retaining Story 2.2's public behavior over the evolved source port.
- `packages/application/src/collection/index.ts` -- export the new use case and repository views.
- `packages/infrastructure/src/collection/postgres-collection-run.repository.ts` -- strict run
  hydration, idempotent start/load, row locking/CAS, per-page multi-observation persistence, conflict
  verification, persisted manifest inputs, terminal transition, and sanitized failures.
- `packages/infrastructure/src/collection/postgres-collection-run.repository.test.ts` -- query and
  mapping tests for running/completed/legacy/concurrent/stale/conflict/rollback cases.
- `packages/infrastructure/src/collection/in-memory-collection.adapters.ts` -- faithful run/checkpoint
  fake used by application tests.
- `packages/infrastructure/src/collection/synthetic-listing-source.ts` -- one-page compatibility for
  `synthetic-data` under the evolved port.
- `packages/infrastructure/src/collection/synthetic-sao-paulo-listing-source.ts` -- deterministic
  latest-cycle portal pagination, opaque cursor mapping, one observation per page, optional bounded
  fixture delay for the local crash campaign, and no network access.
- `packages/infrastructure/src/collection/synthetic-sao-paulo-listing-source.test.ts` -- portal,
  ordering, cursor, exhaustion, immutability, delay/cancellation, and invalid-source coverage.
- `packages/infrastructure/src/collection/postgres-collection.facade.ts` and tests -- aggregate
  multiple observations for completed views and hide running rows from the established facade.
- `packages/infrastructure/src/collection/postgres-source-register.repository.ts` and tests -- map
  the expanded owned-fixture allowlist without weakening any real-source review gate.
- `packages/infrastructure/src/collection/synthetic-sao-paulo.replay.ts` and tests -- consume the
  shared canonical manifest helper without changing deterministic replay bytes.
- `packages/infrastructure/src/collection/index.ts` -- export the new adapter/repository components.
- `apps/worker/src/collection/resumable-collection-command.ts` -- strict two-argument owner command,
  cancellation, bounded output/cleanup, and run/replay result.
- `apps/worker/src/collection/resumable-collection-command.test.ts` -- arguments, lifecycle,
  cancellation, output redaction, and no implicit scheduler/broker dependency.
- `apps/worker/src/collection/collect-resumable.ts` -- minimal command entry point.
- `apps/worker/src/collection/resumable-collection-command.module.ts` -- PostgreSQL, object storage,
  fixture source, transaction/outbox and use-case wiring; no scheduler or collection broker command.
- `apps/worker/src/config/collection-command.config.ts` and tests -- bounded optional synthetic page
  delay used only by the local fixture campaign, without retry semantics.
- `apps/worker/package.json` -- expose `collect:resumable`.
- `compose.yaml` -- tools-profile resumable command service with explicit source/key arguments and
  local dependencies only.
- `integration/resumable-collection.integration.mjs` -- dynamic-port isolated SIGKILL/restart,
  checkpoint/database/outbox/inbox/audit/replay assertions and fail-safe teardown.
- `package.json` -- expose the dedicated integration command.
- Existing source-register and synthetic-collection integration expectations -- distinguish the
  thirteen reviewed candidates from three additional executable fixture aliases and retain all
  prior Story 2.2/2.4 guarantees.

## Tasks & Acceptance

**Execution:**

- [x] Add failing domain tests for safe cursors, fresh running state, exact ordinal advancement,
      stale/skip/repeat rejection, terminal immutability, empty completion, and canonical manifests.
      Implement the run/checkpoint model and extract the manifest helper; migrate existing one-shot
      and replay code to it without changing their hashes.
- [x] Expand the repository-owned synthetic allowlist to exactly four fixture IDs. Add failing
      domain and persistence tests proving arbitrary synthetic IDs remain invalid, then create
      append-only migration 4003 with the three runtime fixture rows and coherent always-active
      synthetic constraints. Keep all real rows disabled.
- [x] Evolve `ListingSource` to checkpointed pages and implement the deterministic latest-cycle São
      Paulo fixture adapter. Keep `synthetic-data` as a compatible one-page source, validate page
      invariants, and cover ordering, cursors, exhaustion, immutability, optional bounded delay, and
      cancellation without network access.
- [x] Evolve collection-run persistence for `running` and `completed` states. Backfill the legacy
      parsed-event ID onto its observation, remove the singular run field, add strict start/load and
      expected-checkpoint commit operations, and preserve raw-object/observation/event uniqueness.
      Test row hydration, operation/source mismatch, stale races, conflicts, rollback, terminal
      completion, and running-row facade isolation.
- [x] Implement `CollectSourceRun` with authorization before run creation, completed replay with no
      work, sequential store-before-parse page preparation, transactional parsed events/checkpoint,
      authoritative final manifest/completion, stale-winner reload, cancellation, and sanitized
      typed failures. Cover every application edge case and fault boundary with deterministic fakes.
- [x] Preserve Story 2.2 by adapting `CollectSourceOnce` and its worker command/tests to the evolved
      source/repository contracts. Re-run the legacy synthetic collection integration and prove its
      one listing, hashes, event IDs, idempotency, and public facade remain compatible after 4003.
- [x] Add the strict database-only/object-store resumable worker command and tools-profile Compose
      service. Require exactly source ID plus operation key, expose only bounded run/replay output,
      propagate signals, clean up independently, and never initialize a scheduler, collection
      RabbitMQ consumer, retry policy, or real source adapter.
- [x] Add the isolated crash/restart integration campaign with dynamic ports and
      `COMPOSE_DISABLE_ENV_FILE=1`. Start local PostgreSQL, migrations, MinIO and the existing
      relay/audit path; run delayed Aurora pagination, poll checkpoint one, issue `SIGKILL`, inspect
      the partial prefix, restart without delay, drain events, verify exact final IDs/counts/audit,
      replay with no mutations, and always remove containers and volumes.
- [x] Update source-register integration assertions to sixteen total rows while retaining an exact
      audit of the thirteen reviewed candidates, the four-ID owned-fixture allowlist, and zero
      enabled real sources. Do not weaken the Story 2.4 review/licence/rate gate.
- [x] Resolve the four accepted QUICK-review findings: enforce global operation/source binding in
      the legacy one-shot path and its PostgreSQL conflict handling; validate source-listing IDs
      before storage, parsing, or commit; make the in-memory legacy and resumable projections
      coherent in both directions; and prove migration upgrade/backfill plus checkpoint contention
      against real PostgreSQL.
- [x] Run focused red/green suites, both affected legacy integrations, the new crash campaign,
      coverage, full repository tests, lint, typecheck, build, changed-file formatting, Markdown
      lint, pre-commit hooks, diff/status/stash/container audit, and independent follow-up review.
      Record the follow-up result before marking the plan built.

## Implementation Notes

- `operation_key` remains globally unique and is bound to the first `source_id` that creates it.
  This preserves Story 2.2 and makes accidental cross-source reuse a visible refusal rather than a
  silent second logical operation. A future public job API may namespace keys, but this owner
  command does not need that expansion.
- The database run row is the aggregate source of truth. Suggested checkpoint fields are
  `checkpoint_ordinal integer NOT NULL DEFAULT 0`, `checkpoint_cursor text NULL`, and
  `checkpointed_at timestamptz NULL`. State checks distinguish running nullable terminal fields
  from completed required fields. Counts remain nonnegative and reflect committed observations.
- Move `parsed_event_id` from `collection_run` to `snapshot_observation`, backfill it before dropping
  the old column, and keep it unique. Keep `completed_event_id` on the run, nullable until terminal.
  Do not invent event IDs from content: persistence-owned UUIDv7 generation remains authoritative.
- Keep `UNIQUE (run_id, source_listing_id)`. Do not add `(source_id, source_listing_id)` uniqueness
  across runs because later runs are historical observations of the same stable listing identity.
- Start/load can use `INSERT ... ON CONFLICT (operation_key) DO NOTHING` followed by a strict read.
  A source mismatch is terminal for that invocation. Page commit should lock the run or use a CAS
  predicate over run ID, expected ordinal, and null-safe expected cursor.
- A stale page is not an application error when another contender won with the same logical work.
  Reload and continue from the winner. A persisted identity with conflicting hash, URL, observed
  time, or event identity is corruption/conflict and must fail rather than overwrite.
- The source page cursor is not a database offset contract. The São Paulo fixture may use a stable
  versioned cursor such as `fixture:2026-10:<ordinal>`, but application/persistence treat it as
  opaque. Bound it to safe printable non-secret text and at most 300 characters.
- Aurora's October 2026 source observations are ordered by source-listing ID. Each fetch returns one
  document and a cursor for the next ordinal; the third page is terminal. Brisa and Cobalto are
  registered and adapter-supported but are not needed by the crash proof.
- The optional fixture delay is a bounded configuration of the local synthetic adapter, applied
  before each page result and abortable by the command signal. It exists to create a deterministic
  kill window; it is not retry, rate limiting, backoff, or a production-source timing policy.
- Reuse the existing strict event constructors. Multiple `collection.snapshot.parsed` facts may
  share one run ID; one `collection.run.completed` fact closes it. No event-contract version bump is
  needed.
- The completed `CollectionFacade` view may aggregate multiple observation IDs into its manifest
  inputs, but the established response remains terminal-only. A running run returns null until
  Story 2.14 introduces an operational run view.
- RabbitMQ is not needed to make checkpoint persistence correct. The integration campaign may start
  the existing relay and audit consumer only to prove the already-established outbox path receives
  each parsed/completion fact once after crash/restart; it must not introduce a RabbitMQ collection
  command.
- A `SIGKILL` is required for the decisive test because a graceful signal could allow the page to
  finish and would accidentally test Story 2.14's shutdown behavior. Poll PostgreSQL for checkpoint
  one, assert absence of completion, then kill the command container while its bounded fixture
  delay holds the next page.
- Teardown must use the same failure-preserving cleanup pattern established by Story 2.4: attempt
  connections and Compose cleanup independently, aggregate cleanup with a primary failure, and emit
  success only after containers, networks, and volumes are gone.

## Verification

**Planned commands:**

- `pnpm --filter @rei/domain test`
- `pnpm --filter @rei/application test`
- `pnpm --filter @rei/infrastructure test`
- `pnpm --filter @rei/worker test`
- `pnpm run test:integration:collection`
- `pnpm run test:integration:source-register`
- `pnpm run test:integration:resumable-collection`
- `pnpm run test:coverage`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run build`
- `pnpm exec prettier --check <changed-files>`
- `pnpm exec markdownlint-cli2 --no-globs <this-plan>`
- `lefthook run pre-commit --all-files`
- `git diff --check`
- `git status --short`

**Evidence required:**

- Domain/application tests prove monotonic checkpoint semantics, strict page invariants, exact
  transactional boundaries, completed no-work replay, and stale-winner behavior.
- Migration/infrastructure evidence proves legacy backfill, coherent running/completed rows,
  operation/source binding, one parsed identity per observation, row-lock/CAS safety, and terminal
  facade compatibility.
- Fixture tests prove deterministic Aurora pagination and cancellation with no network access.
- The local `SIGKILL` campaign proves one durable prefix before death, same-run resumption, exact
  final observations/events/audit, and mutation-free replay after restart.
- Legacy collection/source-register integrations prove Stories 2.2 and 2.4 were evolved without
  weakening their idempotency, policy, API, seed, or cleanup guarantees.
- Full gates and final repository audit prove no scheduling, resilience policy, real-source access,
  ignored environment file, deployment, VPS operation, leftover container/volume, stash mutation,
  or push entered the story.

## Implementation Evidence

Implementation completed on 2026-10-10 against baseline
`883bcc449373dc2743e65d90699bd470c22dbb8e`. A QUICK review found four issues, and all four
accepted findings have been fixed and verified. A follow-up review found one low-severity fake
projection issue, which has also been fixed and verified. The final independent confirmation found
no remaining issues, so the verification task is complete and the plan is `built`.

- Domain, application, infrastructure, worker, migration, Compose, and integration changes in the
  Code Map are implemented. Migration 4003 is append-only; migrations 4001 and 4002 were not
  modified.
- The matrix audit is covered by the focused suites plus the isolated integration campaign.
  Additional application tests explicitly cover refused registrations, nonzero-checkpoint resume,
  rollback after storage and parsing, a conflicting committed identity, and cancellation before
  fetch and during store, parse, and transaction work.
- `pnpm run test:integration:resumable-collection` passed. Before the crash campaign, it applied
  migrations 4001/4002, inserted a legacy completed row, applied migration 4003, and proved the
  parsed-event backfill and coherent checkpoint/terminal state. It then ran two independent real
  PostgreSQL contenders against checkpoint zero, observed the loser waiting on the row lock,
  proved exactly one winner and one observation, and received a typed stale-checkpoint result for
  the loser. The campaign subsequently observed checkpoint one, sent a real `SIGKILL`, verified
  the one-observation prefix and absent completion, resumed with the same run ID, completed the
  three Aurora identities exactly once, drained four audit/inbox facts, and proved a later replay
  mutation-free.
- `pnpm run test:integration:collection` and
  `pnpm run test:integration:source-register` passed, preserving the Story 2.2 one-shot path and the
  Story 2.4 policy gate while proving 16 source rows, four enabled owned fixtures, and no enabled
  real source.
- `pnpm run test` passed across all eight projects with 555 tests after the review-fix additions.
  `pnpm run test:coverage` passed; application branch coverage is 83.33% and infrastructure branch
  coverage is 76.88%, above their configured gates.
- `pnpm run lint`, `pnpm run typecheck`, and `pnpm run build` passed. The build retained only the
  existing informational Vite warning for the CityScene chunk over 500 kB.
- Changed-file Prettier checks, the plan-specific Markdown lint, and `git diff --check` passed.
- `lefthook run pre-commit --all-files` reaches the repository-wide Markdown check but fails on 90
  pre-existing MD013 violations in unrelated platform-baseline story plans. This story plan passes
  its dedicated Markdown lint with zero errors; the hook's temporary staging and unrelated format
  edit were fully undone before this evidence was recorded.
- The integration cleanup left no Story 2.5 containers, networks, or volumes. The pre-existing
  `stash@{0}` named `codex-preserve-preexisting-env-example-deletion` remains untouched. No commit,
  push, deployment, VPS action, real-source request, or ignored environment-file access occurred.

## QUICK Review Log

Review fixes and the independent follow-up confirmation completed on 2026-10-10. The final review
found no remaining issues after checking the compatibility persistence paths, the decisive
PostgreSQL campaign, and the narrowed in-memory projection.

1. **Global operation/source binding in the one-shot compatibility path — fixed.**
   `CollectSourceOnce` now loads the authoritative run before any fetch or object-storage work and
   rejects cross-source, running, and non-singular completed state. The execution-result contract
   now carries `sourceId`. PostgreSQL conflict recovery loads and validates the authoritative run
   before returning a singular legacy result, including a late concurrent cross-source winner.
   Tests cover running, completed, multi-observation, and concurrent-persist conflicts.
2. **Unsafe source-listing identities reaching side effects — fixed.** A shared domain parser now
   enforces the canonical manifest grammar, and both one-shot and resumable services validate each
   identity before object storage, parsing, or transaction work. The invalid-initial-page test
   proves checkpoint ordinal zero and an unchanged durable prefix.
3. **Disconnected in-memory legacy/resumable state — fixed.** The fake now uses one coherent run
   representation. Legacy persistence projects a completed ordinal-one run and observation;
   resumable completion with one observation projects back to the legacy lookup. Explicit tests
   cover both directions and cross-source refusal.
4. **Missing real PostgreSQL upgrade and contention evidence — fixed.** The resumable integration
   now upgrades a database through 4001/4002, seeds a legacy row, applies 4003, and verifies the
   parsed-event backfill and schema transition. It also forces two independent connections to
   contend for the same checkpoint row and proves one committed winner, one typed stale loser, and
   no duplicate observation or identity.
5. **Follow-up: excess legacy input fields leaked into the in-memory run — fixed.**
   `persistCompleted` now passes only `operationKey`, `runId`, `sourceId`, and `startedAt` into the
   running-run constructor instead of spreading the wider legacy persistence input. The
   legacy-to-resumable projection test now uses exact structural equality for the complete run,
   proving that observation, storage, event, and manifest-input fields cannot leak into run state.

## Deferred reconciliation — Story 2.13 (2026-10-26)

- Retry, backoff, rate, circuit and source degradation: closed by completed Story 2.6.
- Scheduling, broker commands, concurrency, graceful draining and run telemetry: closed by
  completed Story 2.14.
- The historical production authorization blocker is superseded by the owner's VPS authorization
  and completed Story 2.12. Its retained receipts prove the deployed seed, idempotent replay,
  native scheduled runs and retrieved Tempo trace; no repeat deployment is needed here.
