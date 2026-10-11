---
title: 'Listing events and history'
type: 'feature'
ticket: '5'
created: '2026-10-10'
status: done
baseline_revision: '557364dc67e8f1b10fe108d3d48245b4a02f9af5'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 5
followup_review_recommended: false
context:
  - /workspace/.claude/skills/nestjs-modular-monolith/SKILL.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0012-domain-events-and-transactional-outbox.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md
  - /workspace/repos/real-estate-intelligence/_bmad-output/initiative-real-estate-intelligence/epic-properties/epic-properties.md
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 3.5 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

Both `integration/properties-history.integration.test.ts` and
`integration/properties-history-upgrade.integration.test.ts` passed ordered created, price,
description, removal and reappearance history, previous values, replay/recovery and genuine
schema-upgrade assertions. Historical generated-Markdown failures remain disclosed below.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`d9ebd4ce493a0174f7c8790d9896100df2ff5383`,
`1abb3b3e714dc331bf3fd41fd60464d7aabc6480`,
`983db6a66dc2633f844489aa582057c32b7918bc`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** Subsequent acquisitions and parser corrections are immutable but pending; persisted
details still show only initial values. Prepared in-memory history is not durable CAP-5 behavior.

**Approach:** Implement immutable acquisition/event history, correction-aware dated values and a
separate current projection, with authenticated completion-driven, restartable per-listing
reconciliation. D-027 resolves chronology, completion authority, correction and date policies.

## Boundaries & Constraints

**Always:** Preserve initial SQL guards, incoming publications and all prior market events.
Atomic per-listing history/current/revision/outbox; durable separate source-work progress.
Use public transaction-scoped Collection/Locations facades, exact publication authority independent
of outbox retention, inbox plus semantic idempotency, bounded work and graceful shutdown.
Keep Properties v1 event catalog/HTTP DTOs, D-026 normalization and original acquisition provenance.
Respect current source rights across every historical description. Explicit SQL, flat contexts,
application-owned ports, framework-neutral validators and Vitest override the Nest skill defaults.
Use apply_patch, English repository content, pnpm only; no commit/push by implementer.

**Never:** Modify immutable catalog identities/bytes/labels or previous accepted ADRs; remove
initial evidence guards; infer sold, match properties, restore suppressed data, add UI/search/
reductions/real sources/AI/VPS behavior. Do not read/search/edit .env or .env.\* anywhere, weaken
checks/hooks/coverage, access servers, write outside the repo, or run another ticket/workflow.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                                                                                                    | Expected Output / Behavior                                                                                                                                                                  | Error Handling                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Acquisition     | New, unchanged, attribute-only or price/description changed v1                                                   | Immutable facts; current values/count/provenance; only genuine public events with consecutive revisions, price before description                                                           | Invalid values/geography reject atomically                                                   |
| Absence         | Authenticated complete manifest excludes active identity                                                         | One Removed at completedAt; closed lifeline; repeat absence adds none; observed failed/suppressed identity stays seen                                                                       | Incomplete/paused/failed/forged/held/denied/unowned or legacy without evidence cannot remove |
| Return          | Removed identity observed in later completed run                                                                 | Same IDs; Reappeared at observedAt before genuine value-change events; new open lifeline                                                                                                    | Never infer sale or count absent interval                                                    |
| Reorder/restart | Completion first, later run first, delayed parsed, duplicates, concurrent delivery, expired inbox, crash partway | Canonical earlier runs/facts recovered; stable chronology and exactly-once effects after restart; active earlier run remains durable barrier                                                | Rollback/cancel leaves no partial listing/outbox; pending work survives broker retries       |
| Correction      | v2 first, order 2 before 1, unchanged/current/historical correction                                              | Highest authenticated order corrects dated values, not original facts/events; no new market event/collection count; original provenance; historical correction cannot replace newer current | Forged authority rejects; missing original remains recoverable                               |
| Privacy         | Current source text rights denied after history exists                                                           | Current and all historical description text absent from HTTP; shared sanitizer only                                                                                                         | Missing authority fails closed                                                               |
| Upgrade         | Existing initial aggregate and pending history/correction                                                        | Initialize durable projection/history without re-emitting creation; apply trustworthy pending facts idempotently                                                                            | Never fabricate missing legacy publication authority                                         |

</intent-contract>

## Code Map

- `packages/domain/src/properties/property.entity.ts:29`, `listing/normalized-listing.vo.ts:44`:
  immutable initial aggregate/per-value provenance; introduce genuine validated v1/v2 path.
  `properties.events.ts:224` validates active effectiveAt equals observedAt, `:260` validates
  revisions/change payloads; reuse its eight frozen events, only five listing types here.
- `packages/application/src/properties/consume-parsed-listing.service.ts:22` currently creates first
  v1, queues all later facts. `property.repository.ts:10` needs history/work ports; preserve strict
  authority, geography, stable identity locks and semantic dedupe, not inbox-only protection.
- `packages/infrastructure/src/properties/postgres-property.repository.ts:11`,
  `migrations/1001_properties_create_initial_properties.sql`: immutable facts/initial IDs/scalars.
  Add numbered own-schema migration for history/current/work, not UPDATE of initial rows.
- `persisted-property.projection.ts:10`, `persisted-properties.facade.ts:14` in the same infrastructure
  folder: real persisted detail path, currently constant active/one-event. Preserve prepared
  fallback and separate search/counts/reductions. Current text permission applies to all versions.
- `packages/application/src/collection/collection.facade.ts:37` / infrastructure
  `collection/postgres-collection.facade.ts:28`: exact canonical parsed authority in caller tx;
  `getRun:105` is not authentication. Add Collection-owned completion publication evidence,
  authenticated run/fact chronology queries and active earlier-run barrier through this facade.
  `collect-source-run.service.ts:263,343,369` and `collect-source-once.service.ts:199` publish completion;
  cover both atomically. Preserve complete manifest including failed/suppressed observations.
- `apps/worker/src/properties/parsed-listing.consumer.ts:10`, `properties.module.ts`, `main.ts:46`:
  real consumer startup/composition; register completion and bounded restartable reconciler.
  `packages/infrastructure/src/shared/persistence/postgres-outbox.ts:127` orders only same aggregate.
- `packages/infrastructure/src/collection/synthetic-sao-paulo.dataset.ts:327` and
  `synthetic-sao-paulo.replay.ts:151`: immutable full catalog; prepared Properties projection only
  an oracle. Pure replay lacks Collection authority: campaign-owned all-cycle ListingSource must
  run actual collection/evidence/outbox/broker/worker, not inject trusted-looking wire directly.
- `integration/properties-ingestion.integration.mjs:348,464,485`: superseded pending/initial-only
  assertions evolve; retain every authority/privacy/rollback/replay/cleanup assertion.
  Snapshot lifecycle/reparse and Collection campaigns guard modified publication paths.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/properties/listing/` and `property.entity.ts` -- model chronology,
      immutable original event effects, corrected dated values, field validity and active lifelines;
      unit-test every matrix rule using isolated doubles where appropriate.
- [x] `packages/application/src/collection/`, `packages/infrastructure/src/collection/`,
      `migrations/4009_collection_create_completed_event_evidence.sql` -- persist authenticated full
      completion evidence and expose canonical earlier source runs/original facts transactionally;
      cover both production completion paths without exposing database/provider types.
      Establish a durable running boundary before any fetch/storage/parse work in CollectSourceOnce,
      not only in CollectSourceRun; preserve operation-key idempotency and source ownership, and
      ensure errors/cancellation/retry cannot leave an unrecoverable phantom barrier. Extend the
      application-owned repository and both SQL/in-memory adapters only as necessary.
      Apply D-030: deterministic input/parse/validation rejection and explicit cancellation require
      a durable internal failure terminal, preserving run identity/operation ownership/start time
      with no completion authority or absence. Failed keys stay terminal; new requests use new keys.
      Transient infrastructure errors remain same-key recoverable; access refusals retain hold/pause.
      D-032 explicitly distinguishes deadline/timeout from deliberate cancellation, including
      AbortSignal.any in the production command and adapters mapping an aborted timeout to cancelled.
      Source/storage timeout must preserve the running key/start/identity and permit fresh-signal
      recovery, with no partial completion evidence; deliberate cancellation remains terminal.
      Terminal cleanup uses bounded independent cancellation and cannot overwrite a completed run.
      Add only necessary own-schema migration/domain transitions/application port/adapter changes,
      not a new public event or frozen HTTP DTO. Verify permanent refusal, cancellation, transient
      retry, ownership and subsequent source progress against unit tests and real PostgreSQL/worker.
      Apply D-035 to both CollectSourceOnce and CollectSourceRun: a Collection-owned transactional
      per-source admission guard must precede capture of a new startedAt/runId and protect that
      running registration until commit, with canonical selection sharing the same guard. Plain
      READ COMMITTED visibility and a committed-before-fetch boundary alone are insufficient.
      Preserve authenticated chronology without rewriting dates or resetting published progress.
      Handle equal start timestamps/runId tie-breaking so a newly admitted boundary cannot lie
      behind an already eligible canonical frontier. Do not hold the guard across external I/O
      or a whole reconciliation batch. Keep ports framework-neutral and SQL Collection-owned;
      acquire source admission before share/run/evidence locks to avoid lock-upgrade deadlocks.
      Bound waiting/cancellation and retain original retry starts/IDs. Exercise a delayed initial
      lookup, a held registration transaction before commit, and same-millisecond admission using
      actual PostgreSQL and both entries; a later completion must not orphan an earlier acquisition.
      Also preserve one-shot idempotency if a same-source/key call completes between initial lookup
      and startOrLoad: return its authentic completed replay without acquisition/storage/parsing
      or duplicate publication. Keep ownership/count checks and rejection of paused/failed/foreign
      or otherwise incompatible runs. Add a deterministic two-caller regression and real-service
      replay proof; this is a smallest replay correction, not a new contract or broad refactor.
- [x] `packages/application/src/properties/`, `packages/infrastructure/src/properties/`,
      `migrations/1002_properties_create_listing_history.sql` -- durable receipt/work and per-listing
      effect transactions, catch-up of valid old pending facts, correction projection and original
      event outbox; test SQL guards/rollback/idempotency/upgrade against real services.
      Add bounded original-fact recovery independent of completion selection: existing authenticated
      pending v1 acquisitions must be discovered and verified through the Collection facade even
      when their legacy run lacks completion evidence. Retain existing initial identities/creation,
      never fabricate a completion publication or infer absence from legacy parsed authority alone.
      D-028 also requires validated backfill when an authenticated pending original canonically
      predates the immutable initial acquisition. Preserve published creation/event bytes/revisions;
      include the evidence in sorted acquisitions, dated values/counts/first observation and the
      first lifeline, without replacing newer current values or emitting pre-creation market events.
      Cover this in domain/application/projection tests and the real pre-migration upgrade journey.
      Distinguish invalid correction work from invalid original work: validation/geography refusal
      for a canonical correction must never roll back or permanently reject a valid original.
      Keep the previous valid projection until a later valid higher-order correction is available;
      scope rejection to that correction, and propagate infrastructure/cancellation failures for
      recovery rather than swallowing them as business refusals.
      Keep Properties migrations/read adapters entirely within their own schema. Recover a retained
      authentic legacy creation envelope, if needed, through an application-owned shared capability
      with its platform adapter, transaction-scoped and bounded. Never join schemas in migration
      1002 or a Properties repository, fabricate an expired envelope or re-emit creation; preserve
      every available creation byte/revision and durable replay after outbox retention/restart.
      D-031 separates canonical run/fact publication frontier from sorted dated acquisition values.
      A later canonical completed run may observe before the previous run: accept and count every
      valid original once, without treating date inversion as invalid input or rejecting its effect.
      Market events compare the original previous canonical frontier, preserving revisions/bytes
      and authentic dates. Dated series/current values, provenance and resolved geography select
      observedAt/snapshotId; an older observation cannot replace newer current values. Distinguish
      true pre-upgrade D-028 backfill from ordinary completion-driven materialization, including
      a new identity whose second canonical observation predates its creation. Keep status from
      canonical manifests, maximum asOf, union exposure, corrections and semantic idempotency.
      D-033 requires Removed provenance from the latest authenticated original by
      observedAt/snapshotId at or before exact completedAt, not a future canonical frontier or
      correction. Preserve canonical comparisons, sorted current values and frozen v1 validators.
      With no eligible original by completion, process the manifest without absence or rejection:
      the identity is not yet evidenced active then; retain later original evidence and progress.
      D-034 durably preserves constituent canonical activity periods. Close only the corresponding
      open constituent at exact completion; derive the public union from valid non-negative
      intervals without destroying closed boundaries or using the greatest historical removal.
      Preserve genuine gaps, empty/inverted interval safety, immutable events/revisions/dates,
      acquisition counts, maximum asOf and D-028 expansion of the first legacy evidence.
- [x] `apps/worker/src/properties/`, `apps/worker/src/main.ts` -- wire completion consumer and
      bounded restart reconciliation with cancellation/observability; do not rely on prefetch order.
- [x] `persisted-property.projection.ts`, `persisted-properties.facade.ts` -- serve durable listing
      and property history/current values, acquisition dates/versions and removed-interval lifelines.
- [x] `integration/properties-history.integration.mjs`, `package.json` and existing ingestion/
      Collection campaigns -- complete real-service API journey, catalog and adversarial matrix
      cases; cleanup only exact campaign-owned resources even after startup failure.
      Add real pre-upgrade database coverage (not old-shaped rows inserted after new migrations):
      populate authentic initial and pending v1 facts under the baseline migrations, apply 1002/4009,
      restart/replay and inspect HTTP/outbox. Test both without a new run and after a new completed
      run. Assert pending acquisition count, price/description history and creation preservation,
      and prove missing completion authority never produces removal.
      Exercise concurrent genuine CollectSourceOnce calls with A started first and held in fetch
      while B finishes; reconcile during the hold, then release A and restart/replay. The HTTP
      chronology must retain both acquisitions in canonical order exactly once.
      Produce a genuine reparse whose address is accepted by Collection but unknown to Locations,
      before original reconciliation and after materialization; the original must still appear in
      HTTP/history/outbox. Follow it with a valid higher-order reparse and verify correction recovery,
      unchanged original bytes/events/counts and lack of starvation for other identities/sources.
      Apply D-029 in domain/projection and a genuine concurrent-run journey: earlier-started empty
      run A held in fetch completes after run B's observation/completion. Reconcile A before B;
      preserve Removed at A completion and Reappeared at B observation with immutable revisions,
      normalize the lifeline union, and take metadata.asOf from the maximum retained time. Add a
      subsequent observation that exposes double counting, plus restart/replay. Use separate real
      start/completion clocks, not a fixture clock that erases the inversion. Preserve genuine gaps.
      Also hold genuine document-bearing run A before fetching its later observation while B starts,
      observes earlier and finishes first. Verify A-before-B canonical effects and both acquisitions
      once with authentic price/description changes, sorted dated history and non-regressing current
      values. Exercise both an existing identity and a newly materialized identity, followed by a
      later acquisition, correction, HTTP detail on both endpoints, reverse replay and restart.
      Use a genuine combined command-deadline timeout during source/storage work, verify the run
      stays recoverable with the same key/ID/start and no partial original/completion evidence,
      then finish on fresh-signal retry and prove source/history progress. Keep explicit cancellation
      terminal, bounded cleanup and every earlier failure/ownership/hold assertion.
      Add genuine held-document A / later-started empty B that completes before A observes:
      verify existing identity removal with eligible older original provenance, and new identity
      no-absence/no-rejection when no observation exists by B completion. Assert exact dates,
      durable run/effect progress, both HTTP endpoints, subsequent ordinary acquisition and
      reverse replay/restart. Never bypass the production v1 temporal guard.
      Exercise constituent intervals Created(1), Removed(4), Reappeared(6), Removed(7),
      Reappeared(3), Removed(5) in domain/projection and genuine concurrent synthetic collection.
      Assert durable constituents and derived [1,5]/[6,7] lifelines with five exposure days,
      not six, before/after both HTTP endpoints, reverse replay and restart. Keep every earlier
      non-monotone date, catalog, upgrade, correction, failure and privacy assertion.
- [x] `docs/api/properties-and-locations.md` and this plan -- update the existing reference,
      evidence and verification.
      Documentation skill applies; retain append-only implementation/review notes.

**Acceptance Criteria:**

- Given the unchanged 13-cycle catalog, when all 39 real collected source runs traverse storage,
  outbox, RabbitMQ and production worker, then GET `/api/v1/listings/:id` and
  `/api/v1/properties/:id` show all 115 acquisitions and durable dated history matching exactly
  9 Created, 4 PriceChanged, 3 DescriptionChanged, 1 Removed and 1 Reappeared outbox events,
  with original provenance, previous values, monotone revisions and correct lifelines.
- Given a separate owned synthetic identity, when creation, price change, description change,
  absence and return are collected, then the HTTP detail and durable outbox show the five types
  in that order with dates and previous values, surviving worker/API restart and semantic replay.
- Given reordered deliveries, corrections, crashes and denied rights, when the real stack
  completes reconciliation, then API details and durable evidence prove every matrix behavior;
  earlier fact/event bytes remain unchanged, no correction creates a market event, and no
  campaign leaks queues/objects/leases/rows.

## Implementation Notes

- Parent independently read the complete 4,817-line baseline diff, including every new file.
  Mandatory lint, typecheck, all 1,189 unit tests and build passed, followed by the unchanged
  coverage gate. Changed-file Prettier and original three-document Markdown checks passed.
- Parent independently passed all twelve real-service campaigns in Verification, including
  history project `rei-properties-history-2023435-ce14ca52`, ingestion project
  `rei-properties-ingestion-2027932-f63bb168` and four-broker startup project
  `rei-rabbit-healthcheck-2023302-312c38a7`. Properties and Locations campaigns passed 158 and
  66 real HTTP requests respectively. Every campaign performed its exact fixture cleanup.

### Parent matrix test audit

All covering suites below ran in the unfiltered workspace test and real-service commands and
passed; no covering test is skipped, disabled or selected through an exclusive test marker.

| Matrix row      | Executed passing evidence                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Acquisition     | Domain chronology tests count unchanged/attribute-only facts and verify price-before-description with previous values; receipt/reconciliation rollback tests and real ingestion reject invalid values/geography atomically.                                  |
| Absence         | Completion-evidence tests verify canonical payload/counts/manifest and missing authority; real history verifies authenticated removal, repeated absence, unfinished-run fencing and failed-but-seen manifests.                                               |
| Return          | Domain reconciliation/chronology tests verify stable IDs and reappearance-before-changes; real five-type journey and projection tests verify lifelines excluding the absent interval and no inferred sale.                                                   |
| Reorder/restart | Real history exercises offline receipts, withheld originals, v2/completion-first, reverse replay after inbox expiry, earlier-run barriers and post-effect progress failure across worker restart; receipt and effect unit tests cover rollback/cancellation. |
| Correction      | Domain and application tests verify highest-order corrections, correction-first and immutable originals; real reparse/history verify historical/current corrections, original provenance, unchanged events and acquisition counts.                           |
| Privacy         | Real history and ingestion query both HTTP detail endpoints after text denial and verify no current or historical description text; projection tests retain non-text history under denial.                                                                   |
| Upgrade         | Application tests upgrade a pre-existing immutable initial aggregate without a new creation; real ingestion seeds the authentic old SQL shape, then verifies geography/count/creation preservation after reconciliation and restart.                         |

## Plan Change Log

- Review loop 5, 2026-10-11: quick review found a running registration still invisible while a
  later completion advances source progress, and a same-key completion between lookup/start
  incorrectly rejected by the one-shot running check. Parent verified the first against plain
  BEGIN, compatible source FOR SHARE locks, operation-key-only uniqueness and permanent cursor/
  legacy exclusions; there is no shared source serialization. Parent independently reproduced
  the second with the built service and actual in-memory adapters: B completed, A rejected with
  collection.run.resume, retained run completed. The first is high bad_plan; D-035 amends only
  outside-contract admission tasks/design and genuine concurrency verification. The second is
  a medium trivial replay patch, moot as an immediate patch under this bad_plan loopback; its
  smallest correction/regression must survive re-derivation. Avoid invisible runs stranded behind
  progress, start capture before admission, tied-key late admission and same-key false rejection.
  KEEP every previous positive instruction and D-028 through D-034 regression, immutable intent,
  canonical ordering and authentic dates/IDs/events, current/history privacy, bounds, schema
  isolation, terminal safety and exact cleanup. Save the complete reviewed attempt and restore
  only run-owned implementation paths; earlier green gates remain historical, not new passes.

- Review loop 4, 2026-10-11: the independent quick review found future provenance rejecting a
  genuine earlier-completed absence, and destructive open-interval union erasing a real gap.
  Parent reproduced both with built production chronology/validators and traced canonical SQL
  barriers plus reconciliation rejection/progress. Both are high bad_plan, with distinct causes.
  D-033 amends only outside-contract absence provenance/eligibility tasks and design; D-034 amends
  durable constituent-period state and non-destructive union tasks/design. Avoid permanent loss of
  authentic absence, impossible future provenance and six exposure days where five are evidenced.
  KEEP all prior safeguards, full catalog, D-028 through D-032 journeys, unchanged event bytes,
  authentic dates/revisions, sorted current values, canonical status/comparisons, maximum asOf,
  privacy, bounded recovery, schema isolation, ownership and exact cleanup. Preserve the complete
  reviewed attempt before restoring only run-owned implementation paths. Earlier verification is
  historical, not a pass for the re-derived tree. The immutable intent and baseline remain unchanged.

- Review loop 3, 2026-10-10: the independent quick review found valid observation-date inversion
  rejected permanently and deadline timeout mistaken for deliberate cancellation. Parent reproduced
  both with built production classes and real in-memory adapters, then verified canonical SQL
  ordering, rejection/progress, production combined signals and ADR 0013. Both route to bad_plan:
  coherent publication-versus-dated-value state and cancellation-cause classification require more
  than a trivial correction. D-031/D-032 amend only outside-contract tasks/design; avoid losing
  authentic acquisitions, regressing current values or making transient keys irrecoverable.
  KEEP all earlier preservation rules, 39-run catalog, every D-028/D-029/D-030 journey, immutable
  event bytes/dates/revisions, source ownership, terminal safety, schema-isolated publication reader,
  bounded work, privacy, replay and exact cleanup. Save the reviewed attempt before restoring only
  run-owned code; verification above remains historical for that attempt, not the next derivation.

- Review loop 2, 2026-10-10: the independent quick review found temporal overlap, permanently
  running rejected one-shot attempts and a cross-schema migration read. Parent reproduced the
  first two directly using built production domain/projection/application/in-memory adapters and
  verified the third against ADR 0011 and repository instructions. All route to bad_plan: coherent
  temporal projection, durable terminal lifecycle and shared publication recovery need more than
  a trivial correction. D-029/D-030 are recorded before re-derivation. Amend only outside-contract
  tasks/design with interval union/max-asOf, failed one-shot lifecycle and port-mediated legacy
  envelope recovery. Avoid double-counted exposure/regressing freshness, unrecoverable barriers
  and coupling a Properties migration to platform columns. KEEP all previous preservation rules,
  the complete original catalog, amended upgrade/correction/one-shot tests and exact event dates;
  add genuine inversion, rejection/cancellation and schema-isolated upgrade coverage. Preserve the
  exact reviewed attempt diff before restoring only run-owned code. Prior verification is historical.

- Review-loop implementation check, 2026-10-10: D-028 settles the reachable older-than-initial
  upgrade case exposed by baseline broker-arrival creation. Extend only the outside-contract
  upgrade task/design with validated evidence backfill, keeping the immutable published event
  frontier. Known-bad state avoided: valid old evidence consumed as a chronology refusal.
  KEEP creation/event bytes, IDs/revisions, canonical current selection, correction/privacy rules,
  completion-bound new creation and every earlier preservation instruction. Add real upgrade and
  unit/projection coverage; do not replace old test expectations with silently missing evidence.
- Review loop 1, 2026-10-10: all three verified high findings route to bad_plan rather than a
  trivial patch. Amend the Collection task with a durable pre-I/O boundary for CollectSourceOnce;
  amend Properties orchestration with independent authenticated legacy-v1 recovery and isolated
  correction refusal; add actual pre-migration and concurrent-once/reparse real-service journeys.
  Known-bad states avoided: silently orphaned old acquisitions, late earlier runs permanently behind
  progress, and a bad correction permanently erasing a valid original. KEEP every instruction under
  Positive preservation below. The intent contract, canonical baseline and existing decisions are
  unchanged. Restore only this run's known-owned code; preserve its exact prior attempt diff for
  recovery/reference. Prior verification is historical evidence, not a pass for re-derived code.
- Verification scope clarification: the parent executed the full `pnpm run lint:md` command;
  all 1,377 errors were in Git-ignored generated `_bmad/render/` snapshots, with zero errors
  elsewhere. The mandatory primary lint remains unchanged and passed. The original Markdown
  commit-hook check runs on the exact three changed documents and passed with zero errors.
  Keep the full command's failure explicit as a tooling caveat; do not weaken configuration,
  delete rendered artifacts or report it as passing. This changes no intent or acceptance criterion.

## Review Triage Log

### 2026-10-11 — Review pass 6

- verdicts: 1 finding — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Ordinary inverted observations rewrite a closed creation constituent —
    parent independently reproduced Created(3), Removed(4), Reappeared(1), Removed(2) with the
    built production chronology and detail projection: retained [1,4]/[1,2] reported three days
    instead of [3,4]/[1,2] and two days. Canonical reconciliation calls ordinary observe without
    the separate legacy flag, and persists these constituents. This is a fresh claim, distinct
    from pass 4's destructive union. The smallest correction replaces the global earliest-date/
    first-period target with the incoming date/current open constituent; it adds no public surface
    or new temporal policy, and applies the existing D-034 requirement. The same implementer
    applied that direct correction and added two previously failing regressions for the exact
    sequence and an inverted observation within a reopened period. Legacy backfill is unchanged.
    All 16 targeted chronology tests passed; full fresh parent verification follows below.

### 2026-10-11 — Review pass 5

- verdicts: 2 findings — high 1, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Invisible earlier running registration is permanently skipped —
    parent followed ordinary BEGIN, startOrLoad operation-key insertion, compatible source share
    locks and nextCompletedRun's NOT EXISTS/strict cursor. A can stay uncommitted while B commits
    and advances; A later has completion evidence and fails both cursor and legacy recovery.
    D-035 amends Collection-owned linearizable admission, start capture after the shared guard,
    short lock lifetimes, tie ordering and actual PostgreSQL/two-entry replay/restart tests.
  - `[medium]` `[patch]` Authentic concurrent completed replay is rejected — parent independently
    ran the built CollectSourceOnce with actual in-memory adapters, holding A after empty lookup
    and completing B under the same source/key: A rejected collection.run.resume although the
    retained run was completed. The smallest completed-result branch at the later boundary is
    required in the amended task; immediate patching is moot under the high bad_plan loopback.

### 2026-10-11 — Review pass 4

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Earlier-completed empty run loses its authentic absence through future
    provenance — parent reproduced existing Oct 1 evidence / held A observed Oct 13 / empty B
    completed Oct 12 throwing DomainValidationError in remove; new Oct 13-only identity also
    throws. The frozen validator requires observedAt <= effectiveAt; canonical-start SQL makes
    this reachable, and reconciliation rejects then advances permanently. D-033 amends eligible
    original provenance and no-activity-before-first-evidence semantics without changing dates/DTOs.
  - `[high]` `[bad_plan]` Eager open union irreversibly overcounts exposure after later closure —
    parent reproduced authentic canonical Created(1), Removed(4), Reappeared(6), Removed(7),
    Reappeared(3), Removed(5): all frozen validators pass, but retained [1,7] counts six days
    rather than correct [1,5] plus [6,7], five days. Reconcile persists that state across restart.
    D-034 amends durable constituent periods and closure of only the corresponding open period,
    deriving the public union non-destructively instead of taking a historical maximum closure.

### 2026-10-10 — Review pass 3

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Authentic overlapping-run observation is permanently rejected — parent
    reproduced retained dates Oct 10/13 followed by valid Oct 12 throwing DomainValidationError,
    with only two acquisitions. Canonical source SQL orders run start; reconciliation persists a
    rejected effect and advances progress, while legacy recovery excludes completion-evidenced runs.
    D-031 amends acquisition/publication frontier and current selection, including new-identity cases.
  - `[high]` `[bad_plan]` Command-deadline timeout irreversibly fails a recoverable one-shot key —
    parent executed a 30 ms fetch with a 10 ms timeout using the actual service/in-memory adapters:
    TimeoutError left failed; retry rejected collection.run.resume without another fetch. Production
    uses AbortSignal.any; ADR 0013 requires retryable timeouts. D-032 amends cause classification and
    combined-signal source/storage recovery tests, preserving explicit cancellation and bounded cleanup.

### 2026-10-10 — Review pass 2

- verdicts: 3 findings — high 2, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Concurrent completion/observation inversion overlaps lifelines and
    regresses metadata.asOf — parent reproduced Created Oct 1 / Removed Oct 4 / Reappeared Oct 3,
    overlapping intervals and asOf Oct 3; the earlier-run facade barrier establishes reachable
    canonical ordering. Amend temporal projection under D-029 without altering authentic dates.
  - `[high]` `[bad_plan]` Permanently rejected one-shot input retains a source-wide live barrier —
    parent executed the actual service twice with an exhausted empty page and the in-memory
    repository: both rejections left the same run running. SQL selection blocks every later run
    behind it. Amend durable terminal lifecycle under D-030, preserving retry/hold/ownership rules.
  - `[medium]` `[bad_plan]` Migration 1002 reads platform publication columns through a cross-schema
    join — verified its Properties/platform join, ADR 0011 ownership and the explicit repository
    prohibition. A future platform envelope/storage change would break Properties upgrades.
    Amend legacy-envelope recovery to use a shared application port, not cross-schema SQL.

### 2026-10-10 — Review pass 1

- verdicts: 3 findings — high 3, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Authentic pre-upgrade pending acquisitions are never selected —
    confirmed `nextCompletedRun` joins completion evidence that migration 4009 deliberately does
    not backfill, while the only other polling path selects v2 facts. Migration 1002 queues work
    without an original-fact recovery path. Amend upgrade orchestration to recover independently
    authenticated pending v1 facts without fabricating completion authority or inferring absence.
  - `[high]` `[bad_plan]` A late-committing earlier CollectSourceOnce run falls behind permanent
    progress — confirmed startedAt is captured before fetch but the run is inserted only in the
    final transaction; neither receipt enqueue nor the earlier-running barrier can recover an
    invisible run after the cursor advances. Amend all production collection paths to establish
    durable chronology before external I/O and verify concurrent completion and restart.
  - `[high]` `[bad_plan]` A business-invalid correction permanently rejects its valid original —
    confirmed Collection reparsing validates the DTO but not Locations resolution. Resolving the
    highest correction inside the original effect transaction can throw, roll back the original,
    and persist a rejected run that is never retried. Amend correction orchestration to reject
    only invalid correction work, preserve the original, and allow later valid corrections.

### Positive preservation before re-derivation

- Review-loop-4 reviewed implementation is preserved in
  `/tmp/rei-story35-loop4-reviewed-79Meq0at.diff` (9,420 lines). Restore only its 57
  implementation/test/API-reference paths: 36 existing and 21 new. Preserve the epic/plan,
  append-only decisions and original user stash. KEEP every prior D-028 through D-034 journey,
  all 1,218 passing tests and real-service protections while adding D-035 admission and the
  concurrent same-key completed replay regression. Historical passing verification does not
  prove these newly found races and must not be reused for acceptance of the next derivation.

- Review-loop-3 reviewed implementation is preserved in
  `/tmp/rei-story35-loop3-reviewed-on9aHC.diff` (8,735 lines). Restore only this run's 57
  implementation/test/API-reference paths to the canonical baseline: 36 existing and 21 new.
  Preserve this plan, epic decisions and the original user stash. Its independent 1,213-test
  and real-service verification remains historical, not a pass for the next derivation.
  KEEP every prior D-028/D-029/D-030/D-031/D-032 journey and safeguard while applying D-033
  eligible absence provenance and D-034 durable constituent intervals. No prior fix may regress.

- Review-loop-2 reviewed implementation is preserved in
  `/tmp/rei-story35-loop2-reviewed-fx59racf.diff` (8,114 lines). Only this run's 57 code/test/API-doc
  paths were restored to the canonical baseline; the plan, epic decisions and original user stash
  remain. Its independent 1,206-test and real-service verification is historical, not a pass for
  the next derivation. KEEP every prior safeguard and D-028/D-029/D-030 journey while applying
  D-031 publication-versus-dated-value semantics and D-032 deadline-cause recovery.

- Review-loop-1 reviewed implementation is preserved in
  `/tmp/rei-story35-loop1-reviewed-AbQjmUhM.diff` (6,687 lines). Only this run's 47 code/test/API-doc
  paths were restored to the canonical baseline; the plan, epic decisions and original user stash
  remain. Re-derived verification above is historical for that attempted tree, not the next repair.
  KEEP every earlier instruction and D-028 recovery/correction/one-shot progress safeguards.

- The prior reviewed attempt is preserved in `/tmp/rei-story35-MczQ9tt0.diff`; it is recovery and
  reference evidence, not an accepted implementation. Code is restored to the canonical baseline
  before re-derivation; this plan and the already-recorded D-027 epic decision remain intact.
- KEEP immutable evidence SQL guards, full completion manifests, per-listing atomic effects and
  separate progress, semantic replay/inbox expiry, current text rights across historical versions,
  stable IDs, frozen DTO/event catalogs, original-provenance correction comparisons and no market
  events from corrections. Preserve the unchanged synthetic catalog and prepared search behavior.
- KEEP worker completion intake, bounded non-overlapping reconciliation, cancellation/shutdown
  and telemetry, with safe defaults and no secrets in diagnostics.
- KEEP the complete real catalog and five-type API journeys, progress-failure recovery, earlier
  active-run fencing, failed-but-seen manifests, correction ordering/restart, privacy and exact
  campaign cleanup. Preserve every regression and original primary/coverage/hook gate.
- KEEP RabbitMQ healthchecks running as the broker user and the four-fresh-broker regression;
  keep the explicit generated-Markdown tooling caveat without deleting ignored render artifacts.
- Previous passing verification remains evidence about the attempted tree only. Re-run all plan
  commands and audit the matrix again after re-derivation; never carry old results as new passes.

## Design Notes

**D-035 source admission:** Registration and canonical selection need a shared short-lived
Collection-owned per-source transactional guard, acquired before a new start/ID is captured and
before other source/run/evidence locks. Both collection entries participate. An uncommitted
registration must not be invisible to an advancing reader; a caller waiting before admission
must not carry a stale start into it. Enforce canonical admission for equal start timestamps
and runId ordering as well, without fabricated time, changing accepted evidence or rewinding
immutable published effects. Registration commits its running boundary before external I/O;
selection releases after its short transaction, not after network work or an entire batch.
Keep abortable waits, retries, holds/terminal outcomes and strict source ownership, and avoid
shared-to-exclusive lock upgrade deadlocks. Preserve the existing public HTTP/event surface.
The one-shot boundary may become authentically completed after its earlier lookup: reuse the
same completed replay validation and return it without external work, preserving all refusal
checks for incompatible ownership, counts, paused/failed state or missing original result.

Full/high route exceeds 100 changed lines and five files. D-027 is authoritative: canonical runs
ordered startedAt/runId, observations observedAt/snapshot ID; active earlier run fences later work.
Never infer absence except authenticated terminal completion. Completion can recover canonical
earlier original publications through Collection facade, independently of missing broker delivery.
Separate source work from atomic listing effects so crash between effects and progress is safe.
New materialization waits for a complete boundary; existing initial creation remains without
re-emission. Highest correction order per snapshot changes value projections only. Market change
comparisons and immutable events use original acquisitions. Removal uses completedAt (+source
seconds in catalog), reappearance uses observedAt. No single catalog identity covers all five
types: full catalog and a separate focused journey are both required. No screen changes.

### Review-loop repair constraints

For D-033, canonical run ordering can place an empty completion before the preceding canonical
original's observedAt. Removed retains exact completedAt, with provenance from the latest
authenticated ORIGINAL by observedAt/snapshotId not later than completion. Corrections and future
originals are ineligible; the canonical comparison frontier and dated current selection remain
independent. Existing eligible activity must be removed without rejection. If no original exists
by completion, no identity is yet evidenced active then: process that manifest without an absence
effect or rejection, retaining later observed evidence. Do not clamp dates, fabricate provenance,
change v1 validators or mislabel ordinary inversion as legacy backfill. Prove genuine held document
A and earlier-completed empty B for existing/new identities, both HTTP details, durable progress,
subsequent ordinary canonical acquisition, reverse replay and restart.

For D-034, the canonical activity periods are authoritative durable constituents, not an eagerly
merged public projection. Retain every period's authentic opening and closing; close only its
corresponding open period at exact completedAt, never the greatest historical Removed date.
Derive public lifelines/exposure by union of valid non-negative intervals; an open public union
must not erase closed constituent boundaries. Empty/inverted periods add no invented exposure.
Preserve all immutable transitions/revisions/dates, counts, status, maximum asOf and D-028 first
legacy evidence expansion. Created(1), Removed(4), Reappeared(6), Removed(7), Reappeared(3),
Removed(5) must retain [1,5] and [6,7] with five days, not six, including domain, projection,
durable persisted state and genuine concurrent collection/HTTP/reverse replay/restart. This
completes D-029's union policy without replacing genuine absent gaps with synthetic exposure.

For D-031, run/fact canonical application order does not guarantee increasing observedAt across
runs. Preserve immutable publication order and genuine original-to-original changes using a
canonical frontier separate from the sorted dated acquisition series. Count every valid original;
select current corrected values/provenance/geography from the maximum observedAt/snapshotId,
not the last canonical delivery. Never hide a valid inversion as DomainValidationError or a rejected
run. Keep status from complete manifests and D-029 exposure/asOf. D-028 event-free backfill is
only genuinely pre-upgrade evidence, not an ordinary new completion-driven identity. Prove existing
and new identities with genuine document-bearing overlapping runs, change events, both HTTP
details, later observations/corrections and replay/restart. Keep all catalog bytes/results unchanged.

For D-032, an aborted signal's cause matters. The production command combines deliberate shutdown
with AbortSignal.timeout. Dependency/command deadline exhaustion stays transient/recoverable even
if an adapter translates the abort into ExternalFailure.cancelled; same key, ID and start survive.
Deliberate cancellation and deterministic rejection remain terminal under D-030, with independent
bounded cleanup and concurrent completion protection. Do not lengthen deadlines, disable cancellation
or add implicit retry/public DTOs. Test the actual combined signal, source and storage deadlines,
fresh-signal same-key recovery and subsequent source progress, preserving all earlier lifecycle cases.

For D-029, canonical revision order is not a promise of increasing wall-clock effective dates.
Keep Removed completion dates and all active-event observation dates exactly authentic. Lifelines
represent the temporal union of active intervals, not duplicate exposure when a later canonical
return predates/touches the previous removal. Genuine non-overlapping absent intervals remain
excluded. Current metadata.asOf is the greatest retained acquisition/event time, not the last
revision's date. Explain this in the existing reference and test actual completion/observation
inversion, later exposure, both HTTP endpoints and replay/restart without changing catalog bytes.

For D-030, the pre-I/O boundary must have a durable exit for deterministic rejection or explicit
cancellation, not deletion or a fabricated complete run. A failed one-shot is terminal and cannot
publish original/completion evidence or infer absence. Preserve retryable infrastructure failures
and access holds, immutable key ownership and concurrency-safe completion. Persist terminal
cleanup with bounded independent cancellation; do not swallow infrastructure failures as invalid
input. Extend internal lifecycle/domain/SQL/ports consistently and prove source progress resumes
after failure, including restart. No new frozen public event/HTTP surface is authorized.

ADR 0011 applies to upgrades as well as runtime: migration 1002 owns Properties only. If available
legacy creation evidence must be copied, a shared transaction-scoped capability reads platform
through its own adapter, then Properties writes its own durable evidence. No cross-schema join,
Properties-owned platform SQL, fabricated expired envelope, duplicate creation or hidden migration
exception. Unit and actual baseline upgrade tests must verify available bytes and missing-retained
evidence independently while all previous immutable/publication guards remain intact.

For D-028 older-than-initial legacy evidence, distinguish the acquisition series from the immutable
published event frontier. Only an existing initial identity may backfill valid earlier originals;
sort observations by observedAt/snapshotId, preserve all market history/revisions/events, and never
emit a retroactive pre-creation event. Acquisition counts, dated versions, firstCollectedAt and the
first lifeline incorporate valid backfill; current selection remains the canonical newest original
with its eligible correction. An older fact must not be marked consumed/rejected before being
incorporated. Explain this legacy-only distinction in the existing API reference and test it in
the actual pre-migration campaign, including correction, privacy, replay and restart safeguards.

Original-publication authority and completion/absence authority are distinct capabilities.
Recover pre-upgrade pending originals for existing initial records through exact Collection
verification, even without a completion envelope; never upgrade that parsed authority into a
synthetic complete manifest. New identities still wait for an authenticated complete boundary.
Use durable bounded work/semantic idempotency so a legacy backlog is not dropped, replayed into
duplicate events or allowed to block all new completed runs/corrections indefinitely.

All production acquisition paths must register chronology before external I/O. A source cursor
is safe only when an earlier live run cannot remain invisible while it advances. Preserve the
existing resumable run contracts and test the actual CollectSourceOnce path, not a hand-seeded
running row that only proves the SQL barrier works.

A genuine parser correction is not automatically a Properties-valid interpretation. Separate
business-invalid corrections from original acquisition validity, with durable correction-only
refusal and later higher-order recovery. The highest eligible valid correction may update dated
values only; infrastructure/authority/cancellation failures remain recoverable failures, and no
fallback branch may mutate original publications or prior market events.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` -- all workspace gates.
- `pnpm run test:coverage` -- every original per-package floor preserved; no skipped matrix tests.
- `pnpm run test:integration:properties-history` -- new full real-service history/API campaign.
- `node integration/rabbitmq-healthcheck.integration.mjs` -- parallel fresh-volume broker probes.
- `pnpm run test:integration:properties-ingestion` -- superseded behavior updated, safeguards kept.
- `pnpm run test:integration:properties && pnpm run test:integration:locations` -- frozen detail/
  geography contracts retained.
- `pnpm run test:integration:snapshot-lifecycle && pnpm run test:integration:snapshot-reparse` --
  original acquisition/correction authority and retention unchanged.
- `pnpm run test:integration:collection && pnpm run test:integration:resumable-collection` -- both
  modified completion paths, full manifest and resume semantics verified against real services.
- `pnpm run test:integration:scheduled-collection && pnpm run test:integration:collection-resilience`
  and `pnpm run test:integration:source-register` -- scheduling, restart, rights and source safeguards.
- `pnpm exec prettier --check` on changed supported files and the original
  `pnpm exec markdownlint-cli2 --no-globs` check on the exact three changed documents, followed by
  normal lefthook gates -- original formatting/commit hooks, no blanket rewrites.
- `pnpm run lint:md` -- execute and record the full result, including ignored generated snapshots;
  the generated-input failure is separately recorded in the Plan Change Log, not claimed as green.

Inspect full baseline diff including untracked files and map each matrix row to executed passing
tests. Parent independently repeats gates/campaigns, reviews under step-04 and uses auto-commit
after review in implementation, tests, documentation order; no scope/trailers/amend/push.

## Implementer Verification Evidence

- Implemented immutable original acquisitions/events, separate corrected current state, exact
  retained completion publication evidence, canonical source progress and completion-bound creation.
  Worker reconciliation is bounded, cancellation-aware, non-overlapping and instrumented; detail
  contracts retain their shape, prepared search/counts/reductions and dataset bytes stay unchanged.
- The real-service history campaign passed 39 genuine catalog collections, 115 acquisitions and
  exactly 9 creations, 4 price changes, 3 description changes, 1 removal and 1 reappearance. Its
  separate five-type journey passed dates, provenance, revisions, lifelines, immutable SQL evidence,
  restart/reverse replay and current text-denial checks. All campaign-owned resources were cleaned.
- Unit suites and the original per-package coverage gate passed without weakening floors or
  exclusions. Application orchestration tests include rollback at fact/entity/history/outbox writes,
  recovery of missing original deliveries, post-effect source-progress failure, canonical earlier-run
  barriers, authority refusal, pending corrections and highest-order historical corrections.
- Parallel regression starts exposed a pre-existing root-healthcheck cookie race, not shared volumes:
  a fresh RabbitMQ root CLI probe may create a mode-400 cookie after the entrypoint ownership pass,
  before the non-root server starts. The official image/server discussions describe the mechanism:
  [Docker image ownership discussion](https://github.com/docker-library/rabbitmq/discussions/696) and
  [RabbitMQ server reproducer](https://github.com/rabbitmq/rabbitmq-server/discussions/11954).
  Compose now probes through `su-exec rabbitmq`. The added
  `node integration/rabbitmq-healthcheck.integration.mjs` campaign verified four simultaneous fresh
  isolated volumes with one-second probes, healthy brokers and UID-100/mode-400 cookie metadata only.
  No cookie contents were inspected; exact labeled fixture resources were removed after verification.
- The extended real history campaign also passed genuine historical/current reparses and reverse
  correction replay, v2-first receipt behind an authentic unfinished-run barrier, recovery of withheld
  original publications, earlier-running-run fencing across restart, a SQL-injected source-progress
  failure after a committed listing effect, and a failed-but-seen full-manifest observation. Recovery
  retained original event bytes, consecutive revisions and stable acquisition counts.
- PostgreSQL JSONB hydration exposed order-sensitive provenance comparison during genuine reparse.
  Correction validation now compares exact source/run/snapshot field values, with a regression for
  reordered JSONB keys. Eligible correction polling waits for materialized originals, upgrades existing
  immutable initial records without re-emitting creation, and selects the highest canonical correction
  even if its broker receipt is missing.
- Final workspace lint, typecheck, unit tests and build passed; 1,189 tests passed across eight
  packages. The unchanged per-package coverage command passed. Changed supported files passed
  Prettier checks and `git diff --check`. The exact original Markdown hook-equivalent command
  `pnpm exec markdownlint-cli2 --no-globs` passed both changed documents with zero errors.
- The final real history repeat passed after the last canonical-correction polling refinement:
  `pnpm run test:integration:properties-history`, project
  `rei-properties-history-2014821-3f82a2a2`. Its exact project cleanup completed, and no campaign
  containers remained active. The parallel fresh-volume Rabbit regression passed as project
  `rei-rabbit-healthcheck-1949520-6c9dc849`, with exact labeled fixture cleanup.
- The complete `pnpm run lint:md` command was executed and remains failing on generated ignored
  `_bmad/render/` artifacts, not the changed documents. No lint configuration or existing artifacts
  were altered. The accidentally rendered build resource was
  `_bmad/render/bmad-build/real-estate-intelligence-b8a996e5202b/06fd7a6815ebb4388249/`;
  `git check-ignore -v` confirmed `.git/info/exclude` ignores it. No workflow steps were executed.
- Passed regressions: production Properties ingestion (including old initial SQL five-crumb records),
  Properties contracts, Locations contracts, snapshot lifecycle, snapshot reparse, synthetic Collection,
  resumable Collection, scheduled Collection with SIGTERM/restart, Collection resilience and source
  register. All campaign-owned resources were cleaned; no unrelated volumes or containers were removed.
  A standalone audit-tracer command without its required prestarted stack failed with connection refusal;
  that attempt is not evidence of a successful audit campaign and is not a required story command.

### Re-derived implementation — review loop 1 and D-028, 2026-10-10

All earlier evidence above remains historical. The saved prior diff was recovery/reference input,
not verification for this implementation. No duplicate workflow was rendered or executed.

- Added bounded original-fact recovery independent of completion selection, authenticated through
  the Collection facade. Genuine pending v1 facts for existing initial identities recover without
  fabricating a completion boundary, re-emitting creation or inferring legacy absence.
- D-028 backfills validated originals before the immutable creation frontier into sorted dated
  acquisitions, counts, first observation and the first lifeline. Published creation/events/revisions
  remain unchanged; newer current selection, historical corrections and current text rights remain.
  Domain, application and projection tests cover this separately from ordinary market observation.
- CollectSourceOnce now persists its running chronology before fetch/storage/parse and retries the
  same running operation with its original run ID/start time. Source refusal persists the existing
  hold/pause policy. Both SQL and in-memory adapters preserve operation-key/source ownership.
- Properties-invalid corrections receive correction-only durable refusal; valid originals and prior
  valid interpretations survive. Later higher-order valid corrections recover; infrastructure and
  cancellation failures propagate for retry. Canonical correction authority remains fail-closed.
- Fresh final `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed with
  1,198 tests across eight packages. `pnpm run test:coverage` passed every original package floor.
  The unchanged frontend build retains its existing greater-than-500-kB chunk warning.
- Final `pnpm run test:integration:properties-history` passed both exact owned projects:
  `rei-properties-history-2134790-4ea7921b` and
  `rei-properties-history-upgrade-2142701-bffcff9e`. The first verifies all 39 real catalog runs,
  115 acquisitions and exactly 18 catalog market events, plus the five-type/adversarial journeys.
  Its genuine concurrent one-shot test holds A in fetch while B completes, proves the durable
  barrier, then verifies both acquisitions once in canonical order after release/replay/restart.
  Genuine unknown-street reparses before and after original reconciliation preserve original bytes,
  events/counts and later valid correction recovery, without starving other identities/sources.
- The second project populated authentic initial/pending v1 facts under baseline SQL migrations,
  with history/completion-evidence relations absent, then applied 1002/4009 and started production
  worker/API. Four originals, including a late-delivered pre-creation observation, recover without
  any new run or completion backfill. Real reparse of that older snapshot updates dated text only;
  both HTTP endpoints hide it when rights are denied. Creation/event bytes/revisions survive reverse
  originals, expired inbox and restart. A new completed run raises the count to five and continues
  revisions 1–4 without legacy removal. Both projects removed only their exact labeled resources.
- Fresh required regressions passed: `node integration/rabbitmq-healthcheck.integration.mjs`,
  `pnpm run test:integration:properties-ingestion`, `pnpm run test:integration:properties`,
  `pnpm run test:integration:locations`, `pnpm run test:integration:snapshot-lifecycle`,
  `pnpm run test:integration:snapshot-reparse`, `pnpm run test:integration:collection`,
  `pnpm run test:integration:resumable-collection`, `pnpm run test:integration:scheduled-collection`,
  `pnpm run test:integration:collection-resilience` and `pnpm run test:integration:source-register`.
  Properties/Locations retained 158/66 real HTTP checks. All exact campaign cleanup passed.
- Changed supported tracked and new files passed `pnpm exec prettier --check`; `git diff --check`
  passed. The exact three changed documents passed
  `pnpm exec markdownlint-cli2 --no-globs` with zero errors.
- Normal hooks passed without staging implementation files using the tracked-file command below,
  followed by `pnpm exec lefthook run pre-commit --no-stage-fixed --file <path>`
  repeated for every untracked path returned by `git ls-files --others --exclude-standard`.
  The normal `pnpm exec lefthook run pre-push` passed its history secret scan and complete workspace
  gates. Existing parent-staged ticket/epic changes were preserved; no source was committed/pushed.
- The final full `pnpm run lint:md` was executed and still reports exactly 1,377 errors exclusively
  in ignored generated `_bmad/render/` snapshots. No configuration, generated artifact, exclusion,
  hook or coverage floor was weakened. The exact changed-document check is independently green.

Tracked-file hook command (the line continuation is equivalent to the executed single line):

```bash
git diff --name-only --diff-filter=ACMR -z | \
  pnpm exec lefthook run pre-commit --files-from-stdin --no-stage-fixed
```

#### Re-derived matrix audit

Every covering suite ran without skipped or exclusive matrix tests in the commands above.

| Matrix row      | Executed evidence                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acquisition     | Domain observation/normalization, atomic receipt/reconciliation refusal and rollback, projection dates/counts, genuine ingestion and catalog collection.                   |
| Absence         | Exact completion authority/manifest tests; real incomplete/earlier-running fences, failed-but-seen identity, repeat absence and no legacy removal.                         |
| Return          | Stable IDs, reappearance-before-changes, consecutive revisions and removed-interval exclusion in domain/projection and the real five-type journey.                         |
| Reorder/restart | Missing originals, v2/completion first, reverse expired-inbox replay, post-effect progress failure, worker restart and genuine overlapping one-shot collections.           |
| Correction      | Highest eligible valid order, immutable original event bytes/counts, unknown geography correction-only refusal, infrastructure retry and later valid recovery.             |
| Privacy         | Current text denial on both real HTTP details, including corrected historical/backfilled versions; projection and ingestion fail-closed safeguards.                        |
| Upgrade         | Authentic pre-migration SQL campaign, no-new-run pending recovery, D-028 dated-only older evidence/correction, immutable creation, replay/restart, then new completed run. |

### Independent parent verification — review loop 1, 2026-10-10

- Independently read all 6,572 lines of the newly staged baseline diff, including new files.
  The prior implementation diff and its test results were not substituted for this verification.
- Repeated workspace lint, typecheck, all 1,198 unit tests, build and every original per-package
  coverage floor successfully. No matrix test was skipped, disabled, exclusive or filtered out.
- Repeated the real history campaign as `rei-properties-history-2150840-0a6c1489`: 39 genuine
  catalog runs, 115 acquisitions, exactly 18 immutable catalog events, five-type journey,
  original/correction ordering, overlapping genuine one-shot runs, invalid-correction recovery,
  SQL rollback/progress recovery, reverse replay/restart and current privacy all passed.
- Repeated the genuine baseline upgrade as `rei-properties-history-upgrade-2175015-703e0eff`.
  Pre-migration pending originals, including D-028 pre-creation evidence, recovered without
  a new run or fabricated completion. Dated correction/privacy, immutable creation/events,
  reverse replay/restart and subsequent new completed-run revisions passed.
- All required regression commands passed independently: four parallel RabbitMQ fresh-volume
  starts, Properties ingestion, Properties contracts (158 HTTP requests), Locations (66 HTTP
  requests), snapshot lifecycle/reparse, synthetic/resumable/scheduled Collection, Collection
  resilience and source register. The exact campaign-owned resource cleanup completed.
- Independently audited all seven matrix rows against the executed domain, application,
  infrastructure and worker suites and real-service/API journeys listed above. Acquisition,
  absence, return, reorder/restart, correction, privacy and upgrade each have passing evidence;
  the amended legacy, pre-I/O barrier and correction-only refusal cases also ran and passed.
- Prettier, the exact three-document Markdown check, `git diff --check`, normal staged pre-commit
  and normal pre-push hooks passed. Hooks left the reviewed implementation unchanged.
- Full `pnpm run lint:md` was executed and failed with 1,377 errors, all in ignored generated
  `_bmad/render/` files and zero elsewhere. This remains an explicit caveat, not a green result.
  The existing Vite chunk-size warning remains unchanged. No VPS access, push or deploy occurred.

### Re-derived implementation — review loop 2, D-029 and D-030, 2026-10-10

All earlier evidence remains historical. The saved reviewed diff was recovery input only; the
current plan and every frontmatter context were read before implementation. The installed build
skill's mandatory initial renderer was invoked once, but its rendered workflow was not executed or
used as implementation authority. This supplied plan remained the sole source of truth.

- D-029 normalizes retained lifelines as the temporal union of overlapping and touching intervals.
  Authentic event dates and immutable revision order are preserved, including non-monotone dates.
  An earlier-dated later removal cannot shorten already retained exposure. Projection `asOf` is the
  maximum retained effective acquisition or market-event date, independent of publication order.
- The real history campaign starts and holds an empty resumable A, observes and completes B while
  A is held, then completes A after B's observation. Canonical reconciliation retains removal at
  A's completion and return at B's observation, continuous union exposure, revisions 1–3 and the
  maximum effective date. A subsequent authentic acquisition, reverse replay and restart preserve
  those results. HTTP exposure is asserted through the existing Property summary contract.
- D-030 adds durable terminal `failed` one-shot runs through migration 4010, domain and adapters.
  Deterministic rejection or explicit cancellation after the pre-I/O boundary uses independently
  bounded cleanup, preserving ownership/start time without a completion or absence authority.
  Failed keys cannot retry or change source; transient failures retain the original running key;
  source refusal retains hold/pause behavior; cleanup cannot downgrade a completed run.
- Migration 1002 now owns only Properties schema and facts. A transaction-scoped shared retained
  publication reader recovers authentic legacy creation envelopes through the platform adapter.
  Properties copies a retained envelope into its own immutable ledger without publishing again;
  absent or expired envelopes are neither fabricated nor re-emitted. Unit adapter/service tests
  and a second genuine baseline identity with expired creation independently verify both paths.
- Fresh lint, typecheck, all 1,206 unit tests and build passed across all eight packages. Coverage
  passed every unchanged original package floor. Normal pre-push passed the secret-history scan
  and full lint/typecheck/test/build gates. The existing Vite chunk-size warning is unchanged.
- `pnpm run test:integration:properties-history` passed owned projects
  `rei-properties-history-2242474-55ceee20` and
  `rei-properties-history-upgrade-2249411-8d7d5517`: all 39 genuine catalog runs, 115 acquisitions,
  exactly 18 immutable catalog events, the five-type journey, D-029/D-030, correction refusal,
  privacy, replay/restart, and genuine migration from pending baseline v1 facts. The upgrade
  campaign also passed independently as `rei-properties-history-upgrade-2241382-f0849925`.
- Every required regression passed freshly: RabbitMQ four-way fresh-volume healthcheck,
  Properties ingestion, Properties contracts (158 HTTP requests), Locations (66 HTTP requests),
  snapshot lifecycle/reparse, synthetic/resumable/scheduled Collection, Collection resilience and
  source register. Every campaign cleaned only its exact owned resources.
- Two earlier history attempts exposed fixture-only mistakes: a seed behind an unrelated source's
  existing cursor, then an exposure assertion against a field absent from Listing DTO. Both were
  corrected in the test fixture, not by changing production chronology or widening contracts.
- Repo-wide formatting and Markdown checks were executed and remain non-green solely for ignored
  generated `_bmad/render/` output (45 formatting files and 1,377 Markdown errors). No generated
  artifacts, exclusions, hooks, coverage floors or quality configuration were changed to pass.
  Supported changed-file formatting, exact changed-document Markdown and whitespace checks passed.
- Normal pre-commit passed using the tracked-file command above and then once for every untracked
  implementation path with `--no-stage-fixed`. The hooks left implementation files unchanged;
  all 56 supported changed files also passed the final scoped Prettier check.
- Existing parent-staged ticket/epic changes were preserved. No implementation was committed,
  pushed or deployed; no VPS access occurred.

### Independent parent verification — review loop 2, 2026-10-10

- Independently read all 8,005 lines of the current baseline diff, including every new file.
  Earlier implementation/review results remain historical and were not used as current passes.
- Repeated lint, typecheck, all 1,206 unit tests, build and the unchanged package coverage gates.
  All passed. The normal staged pre-commit and normal pre-push hooks passed, including secret
  scanning and another complete workspace check; they left implementation files unchanged.
- Repeated the full history journey as `rei-properties-history-2256978-547f2b83`: 39 genuine
  catalog runs, 115 acquisitions, exactly 18 immutable catalog events, the five-type journey,
  authentic completion/observation inversion, union exposure/max-asOf, failed/cancelled one-shot
  termination, transient same-key recovery, correction refusal/recovery, privacy and replay/restart.
- Repeated the genuine baseline upgrade as `rei-properties-history-upgrade-2274426-3aa24f96`.
  Pending originals before/after immutable creation, dated corrections, no fabricated completion
  or absence, retained versus expired creation envelopes, reverse replay and restart all passed.
- Every regression command passed: Properties ingestion (`rei-properties-ingestion-2277030-4c9c8f86`),
  Properties contracts (158 real HTTP requests), Locations (66), snapshot lifecycle/reparse,
  synthetic/resumable/scheduled Collection, Collection resilience and source register. Four
  simultaneous fresh RabbitMQ volumes passed as `rei-rabbit-healthcheck-2256329-c4aa762a`.
  Exact fixture cleanup completed; no campaign containers remained active.
- Audited all seven matrix rows against the executed domain, application, infrastructure and
  worker suites and the real-service journeys. Acquisition, absence, return, reorder/restart,
  correction, privacy and upgrade each have passing evidence. Covering tests contain no skipped,
  disabled or exclusive marker and ran unfiltered in the workspace checks.
- All 56 supported changed files passed Prettier. The exact three changed Markdown documents
  passed with zero errors, and `git diff --check` passed. Full `pnpm run lint:md` was independently
  executed and failed with exactly 1,377 errors: all in ignored generated `_bmad/render/` files,
  zero elsewhere. This is not reported as a green check. The existing Vite chunk warning remains.
- The canonical baseline, immutable intent contract and original user stash remain unchanged.
  No VPS access, push or deploy occurred; VPS-dependent stories await the owner's unblocking.

### Re-derived implementation — review loop 3, D-031 and D-032, 2026-10-10

All earlier evidence remains historical. The complete supplied plan and every frontmatter context
were read before implementation. The saved loop-2 reviewed diff recovered the implementation
paths only; parent-staged ticket and epic edits were preserved. The installed build skill's
mandatory renderer was invoked once, without executing its rendered workflow or replacing this
plan as the sole source of truth.

- D-031 retains an explicit original-acquisition canonical snapshot frontier independently of
  the dated acquisition sequence. Every authentic completed-run original remains counted even
  when its observation date precedes the previous canonical original or immutable creation.
  Ordinary price and description effects compare canonical originals, use authentic observation
  dates and continue immutable revision order; corrections never replace that comparison basis.
  Sorted observation/snapshot values independently select current fields, descriptions, provenance,
  geography, effective dates and the maximum retained `asOf`. Legacy-only pre-creation recovery
  remains event-free; new completed-run identities do not enter that legacy exception.
- Domain, reconciliation and projection tests cover both an existing identity and a new identity
  with genuine observation inversion, duplicate delivery, highest-order older correction,
  restart and a subsequent original comparing the prior canonical original rather than its
  correction or the newest dated value. Existing union-exposure behavior remains unchanged.
- D-032 distinguishes a command deadline by the first combined signal's `TimeoutError` reason.
  A source/storage adapter's sanitized `cancelled` failure caused by that deadline now leaves
  the same owned run recoverable, preserving its key, identifier and start time. Explicit
  cancellation and deterministic rejection retain independently bounded terminal cleanup;
  completed runs cannot be downgraded. Fresh tests use actual combined shutdown/deadline signals
  for both source and storage and retry the original boundary without partial completion evidence.
- The real-service history campaign adds held document-bearing A and earlier-observing B runs
  through production Collection services, real PostgreSQL/S3, outbox, RabbitMQ, worker and HTTP.
  It covers existing/new identities, the completion fence, ordinary immutable effects, dated
  current selection, historical correction, later comparison and replay/restart. Owned source
  and storage deadlines use the production combined-signal shape and preserve same-key recovery.
- Fresh lint, typecheck, all 1,213 tests and build passed across all eight packages. Coverage
  passed every unchanged original package floor. The normal pre-push hook passed history secret
  scanning and another full lint/typecheck/test/build run. The existing Vite chunk warning remains.
- Repository-wide formatting and Markdown checks were executed and remain non-green solely for
  ignored generated `_bmad/render/` output: 45 formatting files and 1,377 Markdown errors. No
  generated output, exclusions, hooks, coverage floors or quality configuration were changed.
- The first fresh history invocation cleaned exact project
  `rei-properties-history-2306453-0372f33a` after a fixture-only query referenced a nonexistent
  `parsed_event_evidence.run_id`. The query was corrected to join owned snapshot observations;
  production code and chronology expectations were not changed to conceal the fixture mistake.
- The complete fresh `pnpm run test:integration:properties-history` passed projects
  `rei-properties-history-2332254-064cb341` and
  `rei-properties-history-upgrade-2343608-cfd4d637`. Main history preserved all 39 catalog runs,
  115 acquisitions and exactly 18 immutable catalog events, every prior adversarial journey and
  the new D-031/D-032 paths. Genuine baseline upgrade retained independently authenticated v1
  backlog, pre-creation corrections, privacy, retained/expired creation, no fabricated completion
  or inferred absence, reverse replay/restart and subsequent completed-run continuation.
- Fresh RabbitMQ four-way startup passed exact project `rei-rabbit-healthcheck-2303399-bb8a6ab8`.
  Properties ingestion passed `rei-properties-ingestion-2306739-f264c116`, including production
  collection/storage/evidence/outbox/broker/worker/HTTP, authority refusals, atomic rollback,
  corrected current values, current rights and legacy geography compatibility. Snapshot lifecycle,
  snapshot reparse, synthetic/resumable/scheduled Collection, Collection resilience and source
  register commands also passed. Each campaign removed only its exact owned resources.
- Audited the seven matrix rows against the fresh unfiltered suites and real-service campaigns:
  acquisition uses domain/reconciliation/ingestion and full catalog evidence; absence uses exact
  completion evidence, authentic removals, fencing and failed-but-seen manifests; return uses
  stable identity, ordered effects and gap/union exposure; reorder/restart uses missing originals,
  correction-first/completion-first, held runs, durable progress and reverse replay; correction uses
  highest eligible order, isolated refusal/recovery and immutable original comparisons; privacy
  uses both detail endpoints under current denial; upgrade uses genuine baseline migrations and
  independently authenticated pending originals. All 17 changed covering test/campaign files were
  checked for disabled/exclusive markers; none were present, and covering suites ran unfiltered.
- Normal pre-commit passed for tracked changes and separately for every untracked implementation
  path with `--no-stage-fixed`, leaving implementation files unchanged. All 56 supported changed
  files passed scoped Prettier; the exact three changed Markdown documents passed with zero
  errors, and `git diff --check` passed. Parent staging still contains only its ticket/epic changes.
  No implementation was committed, pushed or deployed, and no VPS access occurred.
- Properties contracts passed 158 real HTTP requests as `rei-properties-2346030-468ec7d7`;
  Locations passed 66 requests as `rei-locations-2347869-0f5e04cf`, retaining persisted hierarchy,
  address, lease, whitespace, ambiguity, migration/restart and fail-closed guarantees. The final
  Docker process check showed no campaign containers. The final plan-only normal pre-commit hook
  passed after appending this evidence, without staging or changing implementation files.

### Parent independent verification — review loop 3, 2026-10-10

Earlier attempt and implementer results are historical, not substituted for this verification.
The parent staged all 59 changed paths, including 21 new implementation files and the new plan,
and independently read every
line of the 8,691-line canonical-baseline diff before judging verification.

- Fresh `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` and
  `pnpm run test:coverage` all passed. All 1,213 tests passed across eight packages, with every
  original coverage floor unchanged. The existing Vite large-chunk warning remains non-fatal.
- Normal `pnpm exec lefthook run pre-commit --no-stage-fixed` passed across the complete staged
  implementation, tests and documents; formatting reported unchanged files. Normal pre-push
  passed history secret scanning and another full lint/typecheck/1,213-test/build execution.
  The production/API-reference diff digest remained
  `a3eeef8259657534bb581910993b52050bf7b797aa1cd63ca7d0011117b52183`.
- All 56 supported changed paths passed scoped Prettier. The exact three changed Markdown
  documents passed the normal Markdown command with zero errors; staged/unstaged whitespace
  checks passed. Full `pnpm run lint:md` was independently repeated and exited 1: exactly 1,377
  errors, all in ignored generated `_bmad/render/`, zero outside it. No quality rule was weakened.
- History passed exact project `rei-properties-history-2350713-79dff9f9`: 39 genuine catalog
  runs, 115 acquisitions and exactly 18 immutable catalog market events, plus all adversarial
  D-028/D-029/D-030/D-031/D-032 journeys, both HTTP endpoints, replay and restart. Genuine baseline
  upgrade passed `rei-properties-history-upgrade-2369800-911ffbf6`, including independently
  authenticated pending originals, retained/expired creation, pre-creation correction, privacy,
  no invented completion/absence, replay/restart and subsequent completed-run continuation.
- Production ingestion passed `rei-properties-ingestion-2375734-d950676a`, with original receipt,
  collection/storage/authority/outbox/broker/worker/HTTP, rollback, replay, correction and privacy.
  Properties passed `rei-properties-2387355-4aa9f705` with 158 real HTTP requests; Locations passed
  `rei-locations-2388232-93dd3cc7` with 66 requests and persisted geography/lease/restart guards.
- Four fresh RabbitMQ starts passed `rei-rabbit-healthcheck-2350070-4fb20911`. Snapshot lifecycle,
  snapshot reparse, synthetic/resumable/scheduled Collection, Collection resilience and source
  register all independently passed. Every campaign cleaned its exact owned project, and the
  final Docker process check showed no campaign containers. No VPS access, push or deployment.
- The seven immutable matrix rows were audited against executed passing tests, not mere existence:
  acquisition uses chronology/reconciliation/projection/ingestion; absence uses exact completion
  evidence and real manifest fencing; return uses stable identity, ordered five-type events and
  genuine gap/union exposure; reorder/restart uses intake rollback, missing originals, durable
  progress, held runs and reverse replay; correction uses highest eligible order, isolated refusal,
  immutable originals and dated current selection; privacy uses both HTTP endpoints with current
  denial; upgrade uses actual baseline migrations and legacy authority without inferred absence.
  All 17 changed covering test/campaign paths were checked for exclusive, skipped or disabled
  markers: none. An additional unfiltered `pnpm -r exec vitest run --dir src --reporter=verbose`
  passed all 1,213 tests and explicitly printed passing cases in every changed unit-test suite,
  including both new-identity inversion cases and combined-signal source/storage deadline recovery.

The quick review of this attempt subsequently found the two verified high defects in Review
pass 4 above. These passing gates did not prove the missing D-033/D-034 cases; this attempted
implementation is preserved for recovery and must be re-derived and independently verified anew.

### Implementer verification — re-derived review loop 4, 2026-10-11

The complete plan and all six frontmatter context files were loaded before implementation.
The prior reviewed patch was restored only for its 57 implementation/test/API-reference paths;
the staged epic and plan, recovery patch and unrelated workspace state were preserved. The
requirements, immutable intent and every earlier review/implementation note remain unchanged.

- D-033 now selects the latest authenticated original by observedAt/snapshotId at or before exact
  completedAt for Removed values, trace and provenance. Original resolved geography is retained
  separately from corrected geography. Future canonical evidence and corrections cannot supply
  an absence envelope. With no eligible original, the manifest commits its durable applied effect
  and source progress without removal or rejection; subsequent ordinary acquisitions continue.
  Canonical comparison/current-selection frontiers and frozen event validators are unchanged.
- D-034 keeps canonical activity periods as durable constituents, closing only the current period
  at its exact completion. Public lifelines/exposure union valid non-negative periods on reads;
  neither an open union nor a historical maximum removal destroys authentic closed boundaries.
  The six-transition regression retains [1,4], [6,7] and [3,5], projects [1,5] and [6,7], and reports
  five exposure days. Empty/inverted safety, initial legacy expansion, immutable dates/revisions,
  acquisition counts, maximum asOf, genuine gaps and every D-028 through D-032 safeguard remain.
- Added domain, reconciliation and persisted-projection regressions and genuine concurrent-run
  history journeys for both repairs. Both HTTP endpoints, durable state/effect/source progress,
  original event provenance, subsequent acquisitions, reverse replay and worker/API restart are
  asserted. The existing API reference documents eligible absence and non-destructive exposure.
  Existing source identities, catalog bytes, event/HTTP contracts and quality thresholds are intact.
- Fresh `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` and
  `pnpm run test:coverage` passed. All 1,218 tests across eight packages passed with original
  per-package coverage floors unchanged. Final normal pre-push passed the 146-commit secret-history
  scan and another full lint/typecheck/1,218-test/build execution. The existing Vite chunk-size
  warning remains non-fatal and unrelated.
- Normal pre-commit passed for all changed tracked paths and individually for all 21 new
  implementation paths, without staging or modifying implementation files. The final history
  fixture also passed direct ESLint and its normal pre-commit hook after the fixture corrections.
  All 17 changed test/campaign paths were audited: no exclusive, skipped or todo test markers.
- Full history passed exact project `rei-properties-history-2444449-5452e885`: all unchanged
  39 genuine catalog runs, 115 acquisitions and exactly 18 immutable catalog market events,
  every earlier adversarial journey and both new D-033/D-034 journeys. Genuine baseline upgrade
  passed `rei-properties-history-upgrade-2451286-4602abc2`, including authentic pending and
  pre-creation originals/corrections, retained or expired creation authority, no fabricated
  completion/absence, privacy, reverse replay/restart and subsequent completed-run continuation.
- Production ingestion passed `rei-properties-ingestion-2404108-c7f6cfa6`, preserving original
  receipt, Collection/storage/authority/outbox/broker/worker/HTTP, rollback, mutation rejection,
  replay, correction and privacy safeguards. Properties passed `rei-properties-2440211-b138b46c`
  with 158 real HTTP requests; Locations passed `rei-locations-2441627-67e5b259` with 66 requests
  and persisted geography, transaction-lease, migration, restart and fail-closed guards.
- Fresh `node integration/rabbitmq-healthcheck.integration.mjs` passed four concurrent fresh-volume
  probes. All planned snapshot lifecycle, snapshot reparse, synthetic Collection, resumable
  Collection, scheduled Collection, Collection resilience and source-register commands passed,
  including crash/restart, publication/manifest authority, retention, ownership and cleanup guards.
- Two earlier history invocations failed in new test-fixture setup and cleaned their exact projects.
  The first attempted a non-owned source ID rejected by the frozen registration gate; it was replaced
  with existing owned synthetic-portal-cobalto, without widening production authority. The next used
  live dates behind that source's existing January 2027 cursor. The new live clock now has a February
  offset while preserving real elapsed start/observation/completion differences; March constituent
  runs remain later. Neither failure was accepted as a passing campaign or fixed by relaxing guards.
- The seven immutable matrix rows were mapped to the freshly executed suites and campaigns:
  acquisition to chronology/reconciliation/projection/ingestion; absence to authenticated completion,
  canonical fencing and D-033; return to stable identity, ordered events and D-034 constituent exposure;
  reorder/restart to rollback, durable intake/progress, held runs and reverse replay; correction to
  highest valid order, isolated refusal and immutable original/current selection; privacy to current
  rights across both endpoints; upgrade to the genuine baseline migration and legacy-authority test.
- Full `pnpm run lint:md` was executed and exited 1 with the same 1,377 findings confined to ignored
  generated `_bmad/render/` snapshots. No rule, exclusion, threshold or generated artifact was changed.
  This is recorded separately from the exact changed-document Markdown and formatting gates.

The final implementation/API-reference diff covers 36 tracked and 21 new paths. Its SHA-256,
including the new-file diffs and excluding the epic/plan, is
`6bbbdf677fa5877e8b46815e7253a8180af0ab85b950430ddd59f220f3ed19aa`.
Final scoped Prettier passed all 56 supported changed paths, the exact three changed Markdown
documents passed with zero errors, and the appended plan passed its normal pre-commit hook.
Whitespace checks passed; all campaigns cleaned their exact owned projects, and the final Docker
process check showed no campaign containers.
No commit, push, VPS access or deployment was performed. Independent parent review and verification
remain required; these implementer results do not substitute for them.

### Parent independent verification — review loop 4, 2026-10-11

The parent independently read every line of the 9,372-line baseline diff, including all 59
changed paths. Earlier attempts and implementer results do not substitute for this verification.

- Fresh lint, typecheck, test, build and coverage commands passed. All 1,218 tests passed across
  eight packages; original coverage floors remain unchanged. Normal pre-push passed the
  146-commit secret-history scan and another full lint/typecheck/1,218-test/build execution.
  The existing Vite large-chunk warning remains non-fatal.
- Normal pre-commit passed for all 59 staged paths with `--no-stage-fixed`; supported formatting
  and ESLint reported unchanged implementation files. The production/API-reference baseline
  diff SHA-256 is `67f559eed60019838cc52cbb6fe16d4a50834fabb828525896fac1dbec636a0b`.
  The digest includes new files in the index and excludes the epic/plan.
- All 56 supported changed paths passed scoped Prettier, the exact three changed Markdown files
  passed `markdownlint-cli2 --no-globs` with zero errors, and baseline whitespace checks passed.
  An earlier parent formatting invocation incorrectly included the three SQL files and exited 2
  because Prettier has no SQL parser; that invocation is not recorded as passing. The corrected
  supported-file invocation and all normal hooks passed without changing rules or thresholds.
- Full `pnpm run lint:md` exited 1 with exactly 1,377 errors in 82 files. Each reported file was
  independently confirmed ignored by Git and confined to generated `_bmad/render/`; zero errors
  occurred outside that directory. This remains separate from the passing changed-file gate.
- History passed `rei-properties-history-2454580-303ad072`: 39 genuine catalog runs, 115
  acquisitions, exactly 18 immutable catalog market events, all D-028 through D-034 adversarial
  journeys, both HTTP endpoints, reverse replay and worker/API restart. Genuine baseline upgrade
  passed `rei-properties-history-upgrade-2472322-6fd582b7`, including authenticated pending facts,
  retained/expired creation, pre-creation correction, privacy and no invented completion/absence.
- Production ingestion passed `rei-properties-ingestion-2454858-e69e9878`, preserving real
  collection/evidence/storage/outbox/broker/worker/HTTP, rollback, authority and mutation rejection,
  correction, replay/restart and privacy. Properties passed `rei-properties-2487408-fcb79e5a`
  with 158 real HTTP requests; Locations passed `rei-locations-2489619-af0a167e` with 66 requests
  and persisted geography, lease, migration/restart and fail-closed guards.
- RabbitMQ passed four fresh probes as `rei-rabbit-healthcheck-2455017-3b033eab`. Snapshot
  lifecycle, snapshot reparse, synthetic/resumable/scheduled Collection, Collection resilience
  and source register all passed. Exact owned campaign resources were cleaned; the final Docker
  process check showed no campaign containers. No VPS access, publication or deployment occurred.
- All seven immutable matrix rows were audited against executed passing cases: acquisition uses
  chronology/reconciliation/projection/ingestion; absence uses authentic completion, canonical
  fencing and D-033 eligible original evidence; return uses stable identity, ordered events and
  D-034 durable constituent exposure; reorder/restart uses rollback, retained intake, durable
  progress, held runs and reverse replay; correction uses highest authenticated order, isolated
  refusal/recovery and immutable originals; privacy uses current rights across both HTTP endpoints;
  upgrade uses genuine baseline migrations without invented legacy authority. All 17 changed
  covering test/campaign files were checked for exclusive, skipped and todo markers: none.

Review remains the pinned quick lens. Adversarial, edge-case and verification lenses are skipped
by that selection; a fresh-context reviewer must independently inspect the complete refreshed
diff and the plan/context before acceptance.

## Loop 5 implementer evidence — transactional source admission

The approved loop-4 implementation/test/reference changes were recovered from the saved reviewed
patch, preserving D-027 through D-034. D-035 adds one framework-neutral Collection admission
callback and transaction-scoped retained-run lookup. Both production entries capture a new
start/UUID only after source admission. PostgreSQL registration and canonical selection share
a transaction-level source advisory lock acquired before source/run/evidence locks; the lock
ends before fetching and before per-listing reconciliation. The retained lookup uses the active
lease, not a second pool checkout. In-memory admission is serialized and cancellation releases
queued callers without allowing them to overtake the current owner.

Equal start instants select a fresh authentic UUIDv7 after the admitted frontier, with a bounded
32-attempt transient refusal. Regressing clocks refuse admission without rewriting timestamps.
Retries preserve their original boundary. One-shot completed replay now uses the same existing
ownership/count/result validation whether found before admission or after another caller won.
The real two-caller unit regression proves one fetch/store/parse, four generated identifiers,
one parsed envelope, one completed envelope and one outbox append, with the losing caller
returning the authentic winning result as replayed.

- Fresh lint, typecheck, workspace tests, build and coverage passed; all 1,230 tests passed across
  eight packages. Normal pre-push passed the 146-commit secret-history scan and another complete
  lint/typecheck/test/build execution. Coverage floors and exclusions remain unchanged.
  Application statement/branch/function/line coverage was 90.8/86.35/97.8/92.44 percent;
  infrastructure was 87.65/82.63/91.41/89.98 percent.
- Normal pre-commit passed for all 39 tracked and 24 new paths with `--no-stage-fixed`, without
  staging implementation changes. All 60 supported changed paths passed scoped Prettier;
  the exact three changed Markdown files passed scoped markdownlint with zero errors.
  Whitespace and campaign syntax checks passed. No changed covering test/campaign uses
  exclusive, skipped or todo markers.
- Full Markdown lint remains a separate failed gate: exactly 1,377 errors in 82 generated
  `_bmad/render/` files, all independently confirmed ignored by Git, with zero errors outside
  that directory. No hook, lint, coverage or test rule was weakened.
- History passed `rei-properties-history-2539206-9c161161`, preserving all existing catalog and
  D-027–D-034 assertions. New real-service journeys exercise both production entries with
  delayed genuine empty lookup and held uncommitted registration, guarded selection and a
  timed-out lock wait, same-millisecond UUID ordering, authentic same-key completed replay,
  both HTTP endpoints, reverse publication and worker/API restart. The frozen source catalog
  and authority predicate are unchanged.
- Upgrade passed `rei-properties-history-upgrade-2558162-7e481dfd`. Its earlier original is now
  produced at its authentic earlier time and its Properties receipt delayed until after later
  legacy creation; all prior backfill/correction/privacy/replay assertions remain intact. The
  previous combined history invocation passed history but failed this old fixture's regressing
  producer clock; the corrected upgrade was rerun independently and passed. An initial new
  history fixture also failed because subsequent valid absence changed saved responses;
  its scenarios now run after the preserved campaign with their own final replay snapshot.
- Production ingestion, Properties (158 HTTP requests), Locations (66 HTTP requests), four fresh
  RabbitMQ probes, snapshot lifecycle/reparse, synthetic/resumable/scheduled Collection,
  Collection resilience and source register campaigns all passed. Every exact owned campaign
  was cleaned, including failed attempts; the final Docker process check returned no containers.
  No commit, push, VPS access, publication or deployment occurred.

The API reference documents admission, bounded tie handling, retained retry boundaries and
authenticated completed replay. The existing non-fatal Vite large-chunk warning remains.
Implementation is ready for the parent's independent full-diff verification and pinned quick
review; this implementer evidence does not establish reviewer acceptance.

## Loop 5 independent parent verification

The parent staged all 63 exact run-owned paths, including the new implementation and plan paths,
and captured the complete
10,557-line canonical baseline diff. Comparison against the previously fully read 9,420-line
attempt confirmed 45 complete file diffs byte-identical; the parent read all 1,812 lines of the
remaining delta, repairing truncated reads, and followed registration, selection, transaction,
reconciliation and progress callers. The immutable intent is byte-identical. No implementer or
historical green result substitutes for the following fresh independent executions.

- Fresh lint, typecheck, workspace tests, build and unchanged coverage passed. All 1,230 tests
  passed across eight packages, and a separate unfiltered verbose execution passed again. Each
  of the 15 changed unit suites has executed passing cases in that output. All 19 covering
  unit/campaign files have zero exclusive, skipped or todo markers.
- Normal pre-commit passed all 63 staged paths with `--no-stage-fixed`. Normal pre-push passed
  the 146-commit secret-history scan and another complete lint/typecheck/test/build execution.
  All 60 supported paths passed scoped Prettier, the exact three Markdown documents passed
  `markdownlint-cli2 --no-globs` with zero errors, campaign syntax and baseline whitespace passed.
  The implementation/API-reference baseline diff remained unchanged through hooks: SHA-256
  `6bf6ea444392643872068fe59538729c2e5367f8ef4a230d08e107b7a28893d7` across 61 paths.
- Full `pnpm run lint:md` exited 1 with exactly 1,377 errors in 82 generated `_bmad/render/`
  files. Each reported file was independently checked as Git-ignored; zero findings occurred
  outside that directory. This is not claimed as a passing global Markdown gate.
- The single mandatory history command passed both campaigns: history
  `rei-properties-history-2563298-fe8f38b7` and genuine baseline upgrade
  `rei-properties-history-upgrade-2587369-41455ff4`. The unchanged catalog, all D-028–D-034
  journeys and new D-035 held-uncommitted registration, pre-capture lookup, tied starts,
  timed-out lock wait, authentic concurrent replay, both HTTP endpoints and final reverse
  publication/restart assertions passed. Upgrade preserved earlier-than-creation evidence,
  authentic production dates, correction/privacy and immutable creation without invented authority.
- Ingestion passed `rei-properties-ingestion-2563444-8c182967`; Properties passed
  `rei-properties-2599289-5797e40a` with 158 HTTP requests, and Locations passed
  `rei-locations-2601450-43ee8408` with 66. Four fresh RabbitMQ probes passed
  `rei-rabbit-healthcheck-2563670-5fd022b1`. Snapshot lifecycle/reparse, synthetic/resumable/
  scheduled Collection, resilience and source-register campaigns all passed. All exact owned
  fixtures were cleaned; final Docker inspection returned no containers.
- Matrix audit: acquisition is covered by chronology/reconciliation/projection and ingestion;
  absence by authentic completion, earlier fencing and eligible-original cases; return by stable
  identity, ordered public events and durable constituent union; reorder/restart by rollback,
  durable effects/progress, all D-035 races, replay and restart; correction by highest authenticated
  order, invalid-correction isolation and immutable originals; privacy by current rights on both
  HTTP endpoints; upgrade by the actual baseline migrations and genuine reordered legacy facts.
  Every named covering suite/campaign ran and passed in these fresh executions.

The existing Vite chunk-size warning remains non-fatal. The original user stash is preserved.
No VPS access, deployment, publication, push or commit occurred during verification. Review
remains the pinned quick lens; adversarial, edge-case and verification lenses are skipped by
that selection. A fresh-context reviewer must inspect the refreshed complete diff before acceptance.

## Review pass 6 independent parent verification

- After the same implementer's two-file patch returned, parent read the complete patch and repeated
  every Verification command from the final tree. Lint, typecheck, all 1,232 workspace tests, build
  and unchanged per-package coverage gates passed. A separate unfiltered verbose execution
  passed all eight packages, including both new regressions and all 15 changed unit test files.
- Parent independently ran the built production chronology, cloned/reloaded state before the final
  removal, and projected the API detail for Created(3), Removed(4), Reappeared(1), Removed(2).
  It preserved closed [3,4] and [1,2], returned their disjoint union and two exposure days, retained
  all four history entries/two acquisitions and kept metadata.asOf at day 4. The other new unit
  case proves a reopened interval extends from its own incoming observation, never a prior period.
- The mandatory combined history command passed both fresh projects
  `rei-properties-history-2609754-05ba2ad0` and
  `rei-properties-history-upgrade-2637677-6cbdfabb`. It preserved the complete unchanged catalog,
  all prior adversarial journeys, both-entry admission races, tied starts, completed replay,
  genuine legacy upgrade, both HTTP endpoints, immutable publications and restart/privacy.
- Fresh ingestion passed `rei-properties-ingestion-2609696-584079f1`. Properties passed
  `rei-properties-2647779-9124a87b` with 158 real HTTP requests; Locations passed
  `rei-locations-2649646-96c82ee6` with 66. Four fresh broker boots passed
  `rei-rabbit-healthcheck-2609239-4d300005`. Snapshot lifecycle/reparse, synthetic/resumable/
  scheduled Collection, resilience and source-register campaigns all passed with exact cleanup.
- All seven immutable intent matrix rows remain covered by the freshly executed suites/campaigns
  documented in the preceding matrix audit. Parent checked 19 covering unit/campaign files:
  no exclusive/skipped/todo markers; all 15 changed unit files appeared in the passing verbose log.
- Scoped Prettier on all 60 supported paths, exact three-document Markdown lint, campaign syntax,
  baseline whitespace and normal pre-commit/pre-push hooks passed. The implementation/API-reference
  fingerprint across 61 paths remained
  `17db1e9da84d371f51bf272623f58b56c08a2bac8253f3e5c48aaadf3e58a898`.
- Full Markdown lint was repeated and exited 1: 1,377 errors in 82 generated
  `_bmad/render/` files, every one independently checked as Git-ignored, zero elsewhere.
  This global generated-input failure remains explicitly non-green; no hook or gate was weakened.

## Auto Run Result

### Implemented change

Durable immutable original acquisitions and market-event history now drive persisted listing and
property details. Authenticated completed runs produce removal/reappearance and exactly-once
outbox effects through bounded restartable reconciliation. Highest authenticated parser corrections
select dated values without modifying originals, prior events, provenance or acquisition counts.
Collection admission is linearizable before clock/identity capture, while genuine concurrent
completed replay preserves the owned result. Active exposure derives a lossless temporal union
from durable constituent periods. Current text rights apply to every historical description.
Frozen event/HTTP contracts and the synthetic catalog remain unchanged.

### Files changed

| File                                                                                                        | Change                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `_bmad-output/initiative-real-estate-intelligence/epic-properties/epic-properties.md`                       | Records D-027 through D-035 and preserved Properties boundaries.                                              |
| `_bmad-output/initiative-real-estate-intelligence/epic-properties/story-listing-events-and-history-plan.md` | Records immutable intent, implementation, reviews and independent verification.                               |
| `apps/api/src/properties/properties.module.ts`                                                              | Injects durable history into the persisted detail facade.                                                     |
| `apps/worker/src/collection/collection-resilience-wiring.test.ts`                                           | Updates transaction-scoped reconciliation composition coverage.                                               |
| `apps/worker/src/config.ts`                                                                                 | Validates bounded history interval, batch and timeout configuration.                                          |
| `apps/worker/src/main.ts`                                                                                   | Starts completion intake and bounded history reconciliation.                                                  |
| `apps/worker/src/persistence.module.ts`                                                                     | Exposes the retained-publication reader through the shared outbox adapter.                                    |
| `apps/worker/src/properties/index.ts`                                                                       | Exports completion consumer and reconciliation job.                                                           |
| `apps/worker/src/properties/listing-completion.consumer.test.ts`                                            | Tests stable subscription and acknowledgment only after durable acceptance.                                   |
| `apps/worker/src/properties/listing-completion.consumer.ts`                                                 | Consumes authenticated completion publications into durable Properties work.                                  |
| `apps/worker/src/properties/listing-history.job.test.ts`                                                    | Tests bounded non-overlap, cancellation, failure and next-cycle recovery.                                     |
| `apps/worker/src/properties/listing-history.job.ts`                                                         | Runs bounded cancellation-aware reconciliation with telemetry.                                                |
| `apps/worker/src/properties/properties.module.ts`                                                           | Wires public facades, history repository and reconciliation services.                                         |
| `apps/worker/src/worker-shutdown.ts`                                                                        | Stops history reconciliation during graceful shutdown.                                                        |
| `compose.yaml`                                                                                              | Runs fresh RabbitMQ health probes under the broker user.                                                      |
| `docs/api/properties-and-locations.md`                                                                      | Documents durable history, corrections, temporal policy and configuration.                                    |
| `integration/properties-history-upgrade.integration.mjs`                                                    | Exercises actual baseline database upgrade and independently authenticated legacy recovery.                   |
| `integration/properties-history.integration.mjs`                                                            | Verifies the full catalog and adversarial durable history through real services and HTTP.                     |
| `integration/properties-ingestion.integration.mjs`                                                          | Retains authority, rollback, privacy and replay checks under durable receipt.                                 |
| `integration/rabbitmq-healthcheck.integration.mjs`                                                          | Verifies four isolated fresh brokers and non-secret cookie ownership metadata.                                |
| `migrations/1002_properties_create_listing_history.sql`                                                     | Creates immutable Properties history/effect evidence and separate source progress.                            |
| `migrations/4009_collection_create_completed_event_evidence.sql`                                            | Creates immutable Collection-owned completion authority without fabricated backfill.                          |
| `migrations/4010_collection_add_failed_one_shot_runs.sql`                                                   | Allows durable failed boundaries while preserving terminal invariants.                                        |
| `package.json`                                                                                              | Registers the real-service history and baseline-upgrade campaign command.                                     |
| `packages/application/src/collection/collect-source-once.service.test.ts`                                   | Tests pre-I/O ownership, terminal cleanup and same-key deadline recovery.                                     |
| `packages/application/src/collection/collect-source-once.service.ts`                                        | Registers linearizable pre-I/O boundaries and preserves authentic concurrent completed replay.                |
| `packages/application/src/collection/collect-source-run.service.test.ts`                                    | Preserves resumable completion and evidence contract coverage.                                                |
| `packages/application/src/collection/collect-source-run.service.ts`                                         | Uses guarded run admission while preserving resumable completion and authority.                               |
| `packages/application/src/collection/collection-run.repository.ts`                                          | Adds application-owned completion evidence and failure capabilities.                                          |
| `packages/application/src/collection/collection.facade.ts`                                                  | Defines authenticated completion, legacy facts and canonical history queries.                                 |
| `packages/application/src/collection/completed-event-evidence.port.ts`                                      | Defines transaction-scoped completion evidence append capability.                                             |
| `packages/application/src/collection/index.ts`                                                              | Exports the public Collection history contracts.                                                              |
| `packages/application/src/collection/start-admitted-run.test.ts`                                            | Tests guarded capture, fresh retry loads, equal-time ordering and refusal/cancellation bounds.                |
| `packages/application/src/collection/start-admitted-run.ts`                                                 | Captures canonical run starts after admission and preserves owned retries and bounded tie ordering.           |
| `packages/application/src/properties/consume-parsed-listing.service.test.ts`                                | Tests authenticated durable receipt, correction isolation and rollback.                                       |
| `packages/application/src/properties/consume-parsed-listing.service.ts`                                     | Persists authenticated facts and enqueues history without early materialization.                              |
| `packages/application/src/properties/index.ts`                                                              | Exports Properties history repository and reconciliation services.                                            |
| `packages/application/src/properties/listing-history.repository.ts`                                         | Defines bounded durable work, chronology and semantic effect persistence ports.                               |
| `packages/application/src/properties/reconcile-listing-history.service.test.ts`                             | Tests completion-driven effects, legacy recovery, correction refusal and atomic replay.                       |
| `packages/application/src/properties/reconcile-listing-history.service.ts`                                  | Reconciles authenticated originals and corrections with eligible absence evidence and atomic durable effects. |
| `packages/application/src/shared/index.ts`                                                                  | Exports the bounded transaction-scoped retained-publication port.                                             |
| `packages/application/src/shared/retained-publication-reader.ts`                                            | Defines bounded neutral access to genuinely retained publication envelopes.                                   |
| `packages/domain/src/collection/collection-run.test.ts`                                                     | Tests durable failed ownership and completed-run immutability.                                                |
| `packages/domain/src/collection/collection-run.ts`                                                          | Adds the internal failed lifecycle without completion authority.                                              |
| `packages/domain/src/collection/index.ts`                                                                   | Exports the terminal failure transition.                                                                      |
| `packages/domain/src/properties/index.ts`                                                                   | Exports listing chronology and temporal union capabilities.                                                   |
| `packages/domain/src/properties/listing/listing-chronology.test.ts`                                         | Tests temporal inversions, eligible absence provenance, corrections and non-destructive constituent union.    |
| `packages/domain/src/properties/listing/listing-chronology.ts`                                              | Preserves original chronology and durable constituent periods, deriving lossless temporal exposure.           |
| `packages/domain/src/properties/listing/normalized-listing.vo.ts`                                           | Accepts validated original and correction publications with original provenance.                              |
| `packages/infrastructure/src/collection/collection-adapters.test.ts`                                        | Tests serialized in-memory source admission and cancellation without overtaking.                              |
| `packages/infrastructure/src/collection/completed-event-evidence.test.ts`                                   | Tests exact completion authority, manifest invariants and earlier-run fencing.                                |
| `packages/infrastructure/src/collection/in-memory-collection.adapters.ts`                                   | Preserves failure, completion evidence and running one-shot recovery in doubles.                              |
| `packages/infrastructure/src/collection/postgres-collection-run.repository.ts`                              | Persists exact completion manifests and concurrency-safe terminal transitions.                                |
| `packages/infrastructure/src/collection/postgres-collection.facade.ts`                                      | Authenticates retained history and fences active earlier runs in Collection SQL.                              |
| `packages/infrastructure/src/collection/postgres-source-admission.ts`                                       | Shares Collection-owned transaction advisory admission with canonical selection.                              |
| `packages/infrastructure/src/properties/index.ts`                                                           | Exports the durable Properties history adapter.                                                               |
| `packages/infrastructure/src/properties/persisted-properties.facade.ts`                                     | Reads durable current/history while enforcing present source text rights.                                     |
| `packages/infrastructure/src/properties/persisted-property-history.projection.test.ts`                      | Tests dated current selection, legacy correction, privacy and lossless constituent exposure.                  |
| `packages/infrastructure/src/properties/persisted-property.projection.ts`                                   | Projects dated corrected fields, history, union exposure and maximum freshness.                               |
| `packages/infrastructure/src/properties/postgres-listing-history.repository.test.ts`                        | Tests Properties-only SQL, semantic effects and compare-and-swap progress.                                    |
| `packages/infrastructure/src/properties/postgres-listing-history.repository.ts`                             | Persists own-schema acquisitions, immutable events, current state and bounded progress.                       |
| `packages/infrastructure/src/shared/persistence/postgres-outbox.ts`                                         | Reads genuinely retained publications through their owning platform adapter.                                  |
| `packages/infrastructure/src/shared/persistence/postgres-persistence.test.ts`                               | Tests same-transaction retained publication recovery and genuine absence.                                     |

### Review outcome

- Six pinned quick review passes reported 13 findings: high 11, medium 2, low 0, false 0,
  maybe-false 0. All findings have separate verdict/evidence rows in the Review Triage Log.
- Eleven bad-plan findings were resolved through five documented re-derivations under D-028
  through D-035; all positive preservation instructions and the immutable intent survived.
- The prior medium completed-replay patch was incorporated during loop 5 re-derivation.
  This final pass applied one high direct correction to ordinary open-period date expansion,
  with two initially failing regressions; no public surface or new policy was introduced.
- This pass's patched entry counts: high 1, medium 0, low 0. Deferred findings: none.
  Rejected findings: none; there are no rejection reasons or unverified deferred claims.
- Follow-up review recommendation: false. The exact demonstrated outcome, adjacent reopened-
  period behavior, production projection/reload, complete matrix suites and every real-service
  campaign passed independently after the patch; no specific unverified patch risk remains.

### Verification and residual risks

All required workspace gates, unchanged coverage floors, real-service campaigns and normal hooks
passed from the final implementation. The independent records above identify executed commands,
campaign projects, counts and the unchanged final implementation fingerprint. Baseline changes
were inspected cumulatively through the fully read prior baseline diff, complete loop-5 delta
and complete final two-file patch; no unread code delta is claimed as inspected.

The global Markdown command still fails only on ignored generated BMad snapshots. The existing
Vite chunk-size warning is non-fatal. There is no UI change, matching/search expansion, real-source
enablement, VPS access, deployment, publication or push. New worker configuration uses safe defaults:
`LISTING_HISTORY_INTERVAL_MS=250`, `LISTING_HISTORY_BATCH_SIZE=25`,
`LISTING_HISTORY_TIMEOUT_MS=5000`; no environment file was read or edited.
The original user stash is preserved. Production-dependent stories await the owner's VPS unblock
instruction and are not marked accepted by this local result.

### Finalization

The reviewed 63-path change is grouped into separate RabbitMQ fix, history implementation,
regression tests and documentation commits. Normal hooks remain enabled; no amend, scope,
AI trailer or push is used. Final parent verification checks every reviewed path is committed
after the captured baseline and the working copy is clean.
