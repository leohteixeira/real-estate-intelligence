---
title: 'Median asking price of one neighborhood from events'
type: 'feature'
ticket: '2'
created: '2026-10-11'
status: 'built'
baseline_revision: '527f08e61b95cc917313911404ca53e4a567b039'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0021-event-fed-market-median.md'
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The place overview serves only prepared medians; no listing event reaches Market-owned
price facts. Story 4.2 requires an idempotent real event-to-HTTP neighbourhood median with evidence.

**Approach:** Project public listing facts transactionally in Market and calculate the documented
property median. ADR 0021 identifies remaining prepared sections without false counts or freshness.

## Boundaries & Constraints

**Always:** Explicit SQL, own schema, public context facades, strict parsers, atomic inbox/effects,
highest-revision frontier, permanent replay/conflict fence, source provenance, read-only GET,
synthetic-only fixtures, unchanged coverage floors, TypeScript/Vitest integration (ADR 0020).

**Never:** Properties/Collection SQL, fixture group identity inference, prepared median fallback,
observation-as-completion, ORM/Jest/Node test/assert/manual harness, `.env*`, VPS/push/deploy,
real-source/model requests. Do not complete later merge/split, other figures, real counts/neighbours,
monthly, freshness-completion or suppression stories. Preserve their prepared contracts and behavior.

## I/O & Edge-Case Matrix

| Scenario    | Input / State                                        | Expected Output / Behavior                                                          | Error Handling                                  |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| Median      | Active property minima in registered descendants     | One sample/property; rounded centavos/m², odd/even median, selected-source evidence | Safe integer guard                              |
| Eligibility | Removed, nullable area, minimum outside scope        | Excluded; no more-expensive substitute; empty median null                           | Unknown slug 404                                |
| Chronology  | Higher revision first; dates regress; same timestamp | Highest revision wins; retain older evidence                                        | Invalid public event rejected                   |
| Replay      | Duplicate, restart, expired inbox                    | No new fact or changed frontier                                                     | Changed identity or listing/revision rolls back |
| Dependency  | Repository/transaction failure or cancelled delivery | No partial fact/inbox; canonical HTTP failure                                       | No successful fixture fallback                  |
| Staging     | Real median, other sections still prepared           | Closed basis/preparedSections; live freshness untracked                             | Reject contradictory/missing declarations       |

</intent-contract>

## Code Map

- `packages/domain/src/properties/properties.events.ts` / public `index.ts`: strict self-contained
  `PropertiesEvent`, `parsePropertiesEvent`, five listing payloads `{revision,effectiveAt,listing}`;
  price and description extras already validated. Reuse without editing Properties chronology.
- `packages/domain/src/market/price-per-square-meter.ts`: deterministic `Math.round` centavos/m²;
  reuse with safe integer guards. Domain has zero dependencies.
- `packages/application/src/properties/consume-parsed-listing.service.ts` and
  `apps/worker/src/properties/parsed-listing.consumer.ts`: transaction/cancellation and subscriber
  examples. Inbox expires after 30 days; outbox first-publication reader is not replay authority.
- `packages/infrastructure/src/shared/`: `DatabaseConnection`, `PostgresTransactionRunner`,
  `postgresClientFor` transaction lease; use genuine ports, never re-export pg.
- `packages/application/src/market/market-query.service.ts` and Market facade/read port:
  preserve prepared neighbours/series and reuse Locations `getPlace`/`registeredScopeIds`.
- `packages/infrastructure/src/market/synthetic-market.adapter.ts`: prepared sections only;
  immutable catalog has five ground-truth groups vs nine unresolved persisted property IDs.
- `packages/{domain,contracts}/src/market/market.read.types.ts`, contracts `market.read.dto.ts`:
  mirrored models and closed recursive validators; preserve prepared coherence, branch only the
  event-fed median and parent freshness/population. Prepared sections retain fixture evaluation.
- `apps/{api,worker}/src/market/market.module.ts`, worker `main.ts`: worker module is empty but
  imported; subscription must explicitly start before broker supervisor/relay. Reuse global
  persistence and public Locations module, preserving OTel preload.
- `integration/properties-ingestion.integration.test.ts`, `market-contracts.integration.test.ts`,
  `support/{fixture,http,cleanup}.ts`: owned Compose, true collection/outbox publication, Supertest,
  GET table snapshots, all twenty scopes and strict mutation/error checks. No Node harnesses.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/market/asking-price-median.ts` and `.test.ts` — implement and document
      ADR 0021 beside code; unit-test the complete I/O matrix, tie-breaks, global scope, all numeric
      bounds, source selection and result isolation. Cite rule in tests.
- [x] `packages/application/src/market/market-price-facts.port.ts`,
      `consume-market-listing.service.ts` and `.test.ts` — define neutral projection/read ports and
      consumer; strict five listing events, permanent conflict validation before inbox early-exit,
      atomic effects, cancellation and in-memory fakes. Export public symbols through Market indexes.
- [x] `migrations/2001_market_price_facts.sql` and
      `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` with tests — constrained
      event evidence/current revision frontier, transactional uniqueness and conditionally ordered
      upsert; detached read obtains coherent own-schema facts, never foreign SQL or unsafe casts.
- [x] `packages/{domain,contracts}/src/market/market.read.types.ts`,
      contracts `market.read.dto.ts` and `.test.ts` — additive exact overview variant, closed
      preparedSections and preparedEvaluatedAt, independently evaluated prepared evidence,
      live untracked median/parent;
      preserve all prepared numeric/date/source/count/series rejection tests.
- [x] `packages/application/src/market/market-query.service.ts` and `.test.ts`,
      `apps/api/src/market/market.module.ts` and tests — inject live read/clock explicitly, calculate
      own/actual-parent medians, known-empty vs unknown, dependency errors. Prepared direct service
      test mode may remain explicit; production must never implicitly fallback to it.
- [x] `apps/worker/src/market/{market.module,market-listing.consumer,index}.ts`, worker `main.ts`
      and tests — wire existing transaction/inbox/subscriber and start subscription before broker.
- [x] `integration/market-median.integration.test.ts`, existing market contracts campaign and
      `package.json` — real SQL/broker/S3/API journey and publication verify, replay after inbox
      removal, restart, out-of-order/concurrent revisions, conflict/cancellation rollback, poison
      dead-letter bounds, area/removal/reappearance/geo edge cases, no GET writes/fallback, owned
      cleanup. Adapt overview assertions intentionally; keep prepared neighbour/series checks intact.
- [x] `docs/api/market.md` — reference staged provenance, exact rule/examples, event boundary and
      commands. Append verified evidence to this plan; do not alter immutable catalog or later tickets.

**Acceptance Criteria:**

- Given an isolated migrated Compose stack, when fixture listing events are published through
  real outbox/RabbitMQ, then `/api/v1/places/:id/market` returns the documented non-fixture median,
  exact eligible-property count, selected-source URLs/dates and actual computation timestamp.
- Given collection fixture runs and real worker/API, when ingestion emits a price change, then
  the same HTTP median changes through Market-owned facts without reading Properties SQL.
- Given duplicates, reversed/concurrent revisions and a restarted worker, when events redeliver
  even after inbox deletion, then HTTP remains at the highest revision and stored facts are unique;
  conflicting identity/revision is dead-lettered without partial durable effects.
- Given registered geography, empty/null-area facts and a failed database dependency, when the
  overview is requested, then actual-parent provenance, explicit unavailable state and canonical
  errors remain correct; all reads leave database tables unchanged.
- Given the staged overview and untouched prepared neighbours/series, when their strict public
  parsers validate HTTP responses and contradictory mutations, then genuine median never claims
  prepared population/completion and every original prepared invariant remains enforced.

## Implementation Notes

- Market retains immutable business event evidence and a separate highest-revision frontier in
  its own schema. Event identity excludes trace context. Transaction-scoped permanent event and
  listing/revision fences run before the expiring inbox marker; failed effects or cancellation
  roll back the whole transaction. Listing property/source identity changes remain rejected until
  the later merge/split work.
- The API reads one coherent global frontier, chooses the cheapest active listing for each actual
  property ID, then applies registered geography and area eligibility. Odd/even rounding avoids
  overflow, and rounded zero is rejected at the positive monetary domain boundary. The numeric
  matrix includes one centavo divided by one million square meters.
- Own and actual-parent medians are live and explicitly untracked; the exact prepared sections
  retain their fixture evaluation timestamp. Neighbors, monthly series and the immutable catalog
  are unchanged. No database failure falls back to prepared medians.
- The isolated integration campaign verifies outbox publication, real broker projection and HTTP,
  permanent replay after inbox deletion/restart, processed-delivery waits, concurrent older/newer
  revisions, conflict/poison dead letters, cancellation/frontier rollback, acquisition via S3 and
  Collection, and canonical dependency failures. GET snapshots include evidence, current frontier
  and Market inbox; the existing contracts campaign retains full database snapshots.
- Updated the API reference and integration guide (seventeen campaigns and the focused alias).
  Documentation-writer guidance shaped the reference into explicit provenance, algorithm and
  command sections, without adding a separate tutorial or expanding feature scope.

## Plan Change Log

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Persisted-fact validation and median calculation escaped as request
    validation failures — verified the accepted one-centavo/one-million-square-meter listing,
    the positive monetary guard, controller `readResult` mapping and server-only exception logging.
    Re-engaged the original implementer: the live read/calculation boundary now wraps
    `DomainValidationError` as a server error while preserving its cause, numeric guards and
    malformed-request handling. Added stored-fact, own/parent calculation and actual HTTP
    regressions; focused service and API tests passed. No new public surface or fallback.

- Patched entry counts: high 0, medium 1, low 0. Follow-up review recommendation: false;
  the single medium patch has direct regression coverage and no specific unverified risk.
- Deferred and rejected findings: none. Full post-patch verification passed.

## Design Notes

Route is full: this cross-layer transactional feature exceeds 100 changed lines and five files.
D-041/ADR 0021 resolves policy before implementation; no UI is in this story.
Golden prices: property A has 10000/10 and 15000/10 centavos; property B has 20000/10.
Its two representatives are 1000 and 2000 centavos/m², median 1500, recordCount 2, not 3.
If A's cheapest listing lacks area, exclude A rather than use its more expensive listing.
Revision 3 supersedes revision 2 even when effectiveAt decreases; replay identity remains fenced.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all root gates pass.
- `pnpm run test:coverage` — unchanged thresholds pass for every workspace.
- `pnpm run test:integration:market-median` — actual event-to-HTTP and acquisition journeys pass.
- `pnpm run test:integration` — all previous and new campaigns pass, strict TypeScript included.
- `git diff --check` and scoped Prettier/Markdown checks — clean; owned containers/volumes removed.

**Implementation handoff evidence (2026-10-11):**

- Root lint, build, strict workspace/integration type checking, unit tests and coverage passed with
  unchanged coverage floors. The additional explicit non-listing event rejection test also passed
  in the application suite (180 tests).
- `pnpm run test:integration:market-median` passed the real event-to-HTTP and acquisition journey
  after fixing the missing Market schema and the fixture's invalid underscore-containing S3 bucket.
- A final joint run of `market-contracts.integration.test.ts` and
  `market-median.integration.test.ts` passed (two campaigns, 61.46 seconds of test execution),
  including the strengthened processed-replay waits and evidence/frontier/inbox GET snapshots.
- Scoped Prettier, `markdownlint-cli2 --no-globs` for both edited guides, and `git diff --check`
  passed. The root Markdown command also discovers generated `_bmad/render` workflow artifacts;
  their unrelated existing lint errors were not edited or suppressed.
- Full integration suite and independent review remain with the parent full-route verification
  gate; this handoff does not claim they have run yet. No commits, pushes or deployments performed.

**Parent verification evidence (2026-10-11):**

- Read the complete baseline-to-tree unified diff, including all new files. The approved intent
  is unchanged; only Markdown table spacing was mechanically formatted.
- Root lint, strict workspace/integration typecheck, unit tests and build passed: 1,363 tests in
  130 files. Coverage passed every workspace with unchanged thresholds.
- The focused real Market median campaign passed again (one test, 45.92 seconds).
- The complete integration suite passed: 38 tests in 21 files, including all seventeen real-service
  campaigns and support/cleanup tests, with no failures or pending tests (712.33 seconds).
- Matrix audit passed: median/eligibility use the domain median tests and real HTTP campaign;
  chronology/replay use consumer, repository and processed broker delivery tests; dependency uses
  rollback/cancellation and sanitized HTTP failures; staging uses strict DTO contradiction tests.
  A verbose focused unit run confirmed 101 covering tests across five files all ran and passed.
- Scoped Prettier, all five changed Markdown files and staged/unstaged whitespace checks passed.
  Corrected two overlong ADR lines without changing policy.
- After teardown, all containers and volumes exactly match the pre-run inventory; foreign
  resources were preserved. Verification logs are temporary local artifacts, not product files.

## Auto Run Result

Implemented an event-fed, idempotent Market median tracer with permanent replay/conflict fencing,
highest-revision listing facts, deterministic property minima and source evidence. The production
overview uses persisted facts for own/parent medians and explicitly labels its remaining prepared
sections. Reads never write facts or fall back after failures.

### Files changed

- `packages/domain/src/market/asking-price-median.ts` — documented deterministic median and evidence.
- `packages/domain/src/market/asking-price-median.test.ts` — rounding, eligibility and source cases.
- `packages/domain/src/market/index.ts` — public median export.
- `packages/domain/src/market/market.read.types.ts` — staged overview and untracked freshness types.
- `packages/application/src/market/market-price-facts.port.ts` — neutral projection/read ports.
- `packages/application/src/market/consume-market-listing.service.ts` — atomic validated consumption.
- `packages/application/src/market/consume-market-listing.service.test.ts` — replay/rollback cases.
- `packages/application/src/market/market-query.service.ts` — persisted median and server-error boundary.
- `packages/application/src/market/market-query.service.test.ts` — live orchestration and error cases.
- `packages/application/src/market/index.ts` — public consumer/port exports.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` — own-schema SQL adapter.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.test.ts` — SQL/frontier cases.
- `packages/infrastructure/src/market/index.ts` — public adapter export.
- `migrations/2001_market_price_facts.sql` — immutable evidence and constrained current frontier.
- `packages/contracts/src/market/market.read.types.ts` — mirrored public staged overview types.
- `packages/contracts/src/market/market.read.dto.ts` — strict live/prepared provenance validation.
- `packages/contracts/src/market/market.read.dto.test.ts` — staged contradictions and old invariants.
- `apps/api/src/market/market.module.ts` — explicit live repository and clock wiring.
- `apps/api/src/market/market.controller.test.ts` — actual HTTP staging and canonical error regressions.
- `apps/worker/src/market/market-listing.consumer.ts` — five public listing-event subscriptions.
- `apps/worker/src/market/market-listing.consumer.test.ts` — worker subscription/lifecycle coverage.
- `apps/worker/src/market/market.module.ts` — transaction, inbox and subscriber composition.
- `apps/worker/src/market/index.ts` — public worker-consumer export.
- `apps/worker/src/main.ts` — start Market subscription before broker supervision/publication.
- `integration/market-median.integration.test.ts` — real event, acquisition and HTTP campaign.
- `integration/market-contracts.integration.test.ts` — live overview with retained prepared checks.
- `package.json` — focused Market median integration alias.
- `docs/api/market.md` — median algorithm and staged provenance reference.
- `docs/testing/integration.md` — seventeen campaigns and focused invocation.
- `specs/adrs/0021-event-fed-market-median.md` — accepted D-041 policy and consequences.
- `epic-market.md` — English owner-delegated decision record.
- This plan — immutable intent, implementation, independent review and verification evidence.

### Review outcome

The pinned quick reviewer reported one finding, triaged medium/patch and corrected by the original
implementer. Stored-fact hydration/calculation failures now remain server failures; malformed request
validation still returns 400. Numeric guards are unchanged, with focused service and actual HTTP
regressions. Patched counts: high 0, medium 1, low 0. No deferred or rejected findings.
`followup_review_recommended: false`: one directly covered medium patch leaves no named unverified risk.

### Verification and residual scope

Post-patch root lint, strict workspace/integration typecheck, 1,367 unit tests in 130 files and build
passed. Coverage passed all eight workspaces without changing floors. The focused real Market median
campaign passed (one test, 87.54 seconds). The complete integration suite passed again: 38 tests in
21 files, all seventeen real-service campaigns, no failures or pending tests (705.49 seconds).
The full baseline-to-tree diff and the subsequent narrow review patch were read. All six immutable
matrix rows retain covering unit/real HTTP tests; new service and actual HTTP regressions cover the
patched server-error classification. Scoped formatting, all five changed Markdown files and
staged/unstaged whitespace checks passed. Container and volume inventories exactly match the
pre-campaign baseline; no campaign resource remains and foreign resources are unchanged.

The BMad build final status is `built`; the outer orchestrator closes the verified ticket afterward.
Source, tests and decision/verification documentation are committed separately with normal hooks.

Full property merge/split, remaining figures/counts/neighbours, monthly series, collection-completion
freshness and suppression belong to later stories. VPS-dependent work remains blocked for the owner;
this story uses only isolated local synthetic services. No push, deployment or real-source request.
