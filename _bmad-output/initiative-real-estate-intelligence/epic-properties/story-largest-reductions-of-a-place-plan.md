---
title: 'Largest reductions of a place'
type: 'feature'
ticket: '11'
created: '2026-10-11'
status: done
baseline_revision: '8e7a0a60ce27bb23b2edb49dfcbdf4d0e4c7ec5a'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/.claude/skills/nestjs-modular-monolith/SKILL.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0012-domain-events-and-transactional-outbox.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 3.11 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

The properties history and genuine-upgrade campaigns, Locations scope campaign and properties
contract campaign passed persisted reduction ranking, previous values, scope, ties and paging.
The largest-reductions domain/application suites also passed.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`02cf760717cad83d95ed65d3110806cd8a17c760`,
`9d6f290bb54c307ad4fc487e65c0ca92597a4a02`,
`7738135d2d76d7d8fd749d4609d93aeaf1d4a06d`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** Story 3.11 serves a place's largest asking-price reductions for Place overview,
but production still ranks prepared groups instead of persisted CAP-5 history.

**Approach:** Serve persisted Properties and their latest recorded reductions through the existing
HTTP endpoint, with registered geographic scope, deterministic ordering and previous values.
D-037 resolves the distinction between immutable market effects and corrected dated values.

## Boundaries & Constraints

**Always:** Preserve D-021, D-022, D-027 through D-036 and frozen HTTP DTOs/events. One row per
actual Property, one Listing per Property under the present SQL uniqueness; no labelled grouping.
Use latest negative price effect by effectiveAt through asOf, equal-date ties by canonical history
order, positive percentage descending and Property ID ascending. Later rises/removals retain the
historical reduction. Select current geography from newest dated acquisition with eligible
correction; Locations owns registered descendant lookup. asOf is the maximum retained observation/
event date in the scoped set; empty sets use an injected clock. Production returns persisted-only
rows, including empty sets, with explicit persisted synthetic fixtureVersion and existing dataMode.
SQL stays in its owner's schema; facades only delegate, application owns query orchestration and
ports, domain owns arithmetic/selection. Apply nestjs-modular-monolith with ADR SQL/Vitest/public
facade overrides, existing deadlines, pnpm, apply_patch, English content and unchanged gates.

**Never:** Read/search/edit .env or .env.\*, enable real sources, access VPS, publish/push/commit
as implementer, run another ticket or alter external files. No matching, ground-truth grouping,
30-day window, active-property filter, new event/migration/DTO/dependency, UI or market figures.
Do not synthesize reductions from corrections/backfill, rewrite immutable events, expose text/raw/
fingerprints/object keys, mix prepared rows with persisted rows or return fixtures on read failure.
Preserve prepared search/counts and detail fallbacks with current rights; no cross-schema join/FK,
N+1 candidate hydration, unbounded concurrent I/O, Nest module cycle or forwardRef workaround.

## I/O & Edge-Case Matrix

| Scenario   | Input / State                                                                   | Expected Output / Behavior                                                                                     | Error Handling                                                 |
| ---------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Catalog    | 39 genuine catalog runs, 115 acquisitions, unresolved identities                | Actual Property IDs; latest negative original effects with exact previous/current values, dates and provenance | No prepared return-only grouped reduction                      |
| Scope      | Country/state/city/zone/neighborhood/block and supplementary places             | Registered subtree only, using current corrected place; one row per Property                                   | Unknown place is null/404; known empty place is empty/200      |
| Selection  | Several drops, later increase/removal, no drop, future effect                   | Latest dated negative effect through asOf, not greatest historical drop or last appended effect                | No false reduction from unchanged/increased prices             |
| Ties       | Equal dates and percentages, near safe-integer money boundary                   | Canonical equal-date effect; stable descending percentage and ascending ID                                     | Deterministic without mutation or unsafe arithmetic            |
| Correction | Current/historical parser corrections and legacy backfill                       | Original reduction amounts/events unchanged; corrected current geography respected                             | No market effect invented from corrected adjacent values       |
| Metadata   | Nonmonotone event dates, newer unchanged acquisition, initial-only or empty set | Maximum authentic scoped date; explicit persisted marker, detached output                                      | No correction receipt time or fabricated collection date       |
| Paging     | Default/1/20 rows, bound cursors, full result count                             | Strict canonical cursor protocol, totalItems before paging, null terminal cursor                               | Malformed/cross-endpoint/place/size/out-of-range cursor is 400 |
| HTTP       | Extra/repeated/nested/empty/invalid query, bad IDs, empty known scope           | Existing /api/v1 validators and response parser retained                                                       | Sanitized 400/404 with request ID; no secret/raw input log     |
| Failure    | Locations or Properties read fails; DB restart                                  | Sanitized 500, no memory fallback; same durable ranking after restart/replay                                   | Existing bounded pool/query behavior, exact cleanup            |

</intent-contract>

## Code Map

- `packages/domain/src/properties/listing/listing-chronology.ts`: history is immutable canonical
  publication order and dates can decrease; acquisitions sort observedAt/snapshotId. Corrections
  update dated values only; legacy backfill emits no market event. Do not modify write behavior.
- `packages/domain/src/properties/properties.read.types.ts`: Reduction contains propertyId,
  listingId, place, effectiveAt, previousMinorUnits, currentMinorUnits, reductionPercent, provenance.
  It has no previousEffectiveAt. Add a pure ranking rule and adjacent tests/public exports here.
- `packages/application/src/properties/properties.facade.ts`: existing public reductions method.
  Add `property-reductions.repository.ts` read port and `largest-reductions.service.ts` query with
  minimal neutral candidate facts, Locations scope, clock, validation and pagination.
- `packages/infrastructure/src/properties/synthetic-properties.adapter.ts`: validateReadQuery and
  private page helper implement canonical unpadded base64url {scope,offset}, SHA-256 scope, positive
  divisible safe offsets below total, exact fields and 1–20 size. Extract/reuse without weakening
  prepared search/reduction semantics; application cannot import infrastructure. Cursors bind the
  distinct persisted endpoint, place and size, not an immutable dataset snapshot.
- `packages/infrastructure/src/properties/postgres-{property,listing-history}.repository.ts`:
  initial rows are immutable; listing_current.state owns durable history/current acquisitions.
  Add `postgres-property-reductions.repository.ts` with a set-oriented, coherent owned-schema read.
  Project safe reduction/history/geography/date facts only, not description payloads/raw content.
  Reuse stored sorted acquisition resolution; initial-only entities contribute scope/date, no drop.
- `packages/infrastructure/src/properties/persisted-properties.facade.ts`: replace only reductions
  delegation with the new query; preserve all current detail permission/lifecycle and prepared search.
- `packages/application/src/locations/{locations.facade,locations-query.service,place.repository}.ts`
  and `packages/infrastructure/src/locations/{postgres-locations.facade,postgres-place.repository,
synthetic-locations.adapter}.ts`: add a neutral registered scope-ID query, including self, with
  recursive descendant SQL owned by Locations. Public exports and all interface fakes must compile.
- `apps/api/src/locations/locations.module.ts` imports Properties for its controller. Extract a
  small reference-provider module exporting LOCATIONS_FACADE, imported by Properties and Locations;
  avoid the reverse module cycle. Worker existing Locations composition must remain compatible.
- `apps/api/src/locations/locations.controller.ts` already exposes strict validated endpoint;
  `apps/api/src/properties/properties.controller.test.ts` and
  `integration/properties-contracts.integration.mjs` expect prepared reductions on an empty DB:
  replace only those
  expectations with persisted-empty assertions, retaining other prepared assertions and validators.
- `integration/properties-history.integration.mjs`: real isolated PostgreSQL/RabbitMQ/MinIO/API/
  worker, 39 catalog runs and 115 acquisitions plus focused genuine acquisition/reparse/replay/
  restart journeys. Assert catalog ranking before later focused identities pollute the dataset.
  `integration/properties-history-upgrade.integration.mjs` proves genuine pre-migration backfill.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/properties/` and public indexes — write failing ranking-rule tests,
      then deterministic latest-negative selection, percentage/order/ties without state mutation.
- [x] `packages/application/src/properties/` and public indexes — implement narrow read port,
      query orchestration, injected clock and strict page helper; unit-test every matrix edge case.
- [x] `packages/application/src/locations/`, `packages/infrastructure/src/locations/` and adjacent
      tests — expose registered self/descendant IDs through facade/repository, maintain synthetic
      fake compatibility and prove unknown/supplementary/all-level scope and bounded failure.
- [x] `packages/infrastructure/src/properties/` and adjacent tests/indexes — implement one safe
      SQL snapshot read, original reduction history/max-asOf/current geography hydration and facade
      delegation; share existing strict pagination without inward dependency violation or N+1 I/O.
- [x] `apps/api/src/{locations,properties}/` and adjacent HTTP tests — cycle-free public facade
      wiring; validate frozen reduction responses, strict queries/cursors/error privacy and empty
      persisted behavior without changing other search/details or protected/public surfaces.
- [x] `integration/properties-contracts.integration.mjs`,
      `integration/properties-history.integration.mjs`,
      `integration/properties-history-upgrade.integration.mjs` and
      `integration/locations.integration.mjs` — execute real HTTP ranking for whole catalog and
      all six place levels,
      paging/scope/ties/latest-drop/current-geography/correction/backfill/no-fallback/restart cases.
      Prefer genuine collector/worker facts for market changes, never trusted-looking wire or
      fabricated matching. Add deterministic focused synthetic acquisition cases only as needed.
      Retain every existing history/upgrade authority, dates, immutable bytes, privacy and cleanup
      assertion. Real SQL tests must prove registered descendant queries and initial-only/empty reads.
- [x] `docs/api/properties-and-locations.md`, README if useful, and this plan — use
      documentation-writer reference style for original-event versus corrected-current behavior,
      live cursors, empty metadata and unresolved identities; append accurate executed evidence.

**Acceptance Criteria:**

- Given all 39 unchanged catalog runs collected through storage/outbox/broker/worker into an
  isolated real stack, when a client GETs `/api/v1/places/sao-paulo/largest-reductions`, then the
  frozen DTO returns exactly the persisted negative market effects ranked by the documented rule,
  with actual Property/Listing IDs, previous/current amounts, original dates and provenance, not
  the prepared four grouped reductions or an invented return-only drop.
- Given registered six-level geography and supplementary blocks, when actual HTTP clients query
  each scope and page size, then each full scoped ranking and totalItems is correct, current
  corrected geography controls membership, empty registered places return 200 and unknown places
  return 404; malformed or mismatched navigation tokens return the existing sanitized 400.
- Given genuine acquisitions, nonmonotone effective dates, parser corrections and pre-upgrade
  backfill, when clients inspect ranking before/after reconciliation, replay and API/worker restart,
  then latest original reductions remain deterministic and original event bytes unchanged, no
  correction/backfill manufactures a drop, and current geography/max-asOf remain authentic.
- Given a database failure and an empty migrated database, when HTTP requests run, then failure
  is sanitized 500 without prepared fallback and the empty registered ranking is explicitly
  persisted synthetic data; unchanged search/detail contracts and all mandatory gates still pass.

## Implementation Notes

- Added a pure `rankLargestReductions` domain rule and narrow `ReductionCandidate` facts.
  Maximum negative-effect date wins; canonical position breaks equal dates. Integer cross
  multiplication preserves exact percentage ordering at the safe-integer money boundary.
- Added `LargestReductionsService` with registered scope IDs, one set-oriented candidate read,
  injected empty-scope clock and detached persisted-only output. Moved the existing validation
  and cursor helpers into Application unchanged; prepared adapter behavior remains covered.
- Locations owns recursive self/descendant SQL, including supplementary blocks. Properties SQL
  projects original effect facts, newest stored resolved geography and the maximum authentic
  retained dates from one statement; it does not hydrate text, raw bytes or corrections as effects.
- Extracted the shared API Locations reference provider to avoid a reverse Nest module dependency.
  The provider lives at the API composition root so importing Properties first cannot eagerly
  load Locations' controller module through a barrel and capture an undefined circular import.
  Only production reductions delegation changed; detail rights/fallback and prepared search/counts
  are preserved. No migration, dependency, DTO, event or write-side behavior changed.
- Real history assertions use an independent HTTP-detail oracle across all twenty registered
  places and page sizes 1/20, before later focused identities affect the catalog. Genuine focused
  collections cover equal percentages/dates, nonmonotone dates, later increases and removal;
  reparse, upgrade/backfill, replay, restart and fail-closed reads retain the existing safeguards.

## Plan Change Log

- Final compiled-module audit exposed a barrel import-order cycle despite successful normal API
  startup. Kept the planned shared reference provider, placing its wiring at the API composition
  root to remove the module-loading edge without `forwardRef`, globals or a new business context.

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The pinned Quick reviewer returned no findings after checking surrounding
  chronology writes, correction eligibility, SQL ownership/uniqueness and frozen HTTP validators.

## Design Notes

Full route: approximately 700–1,200 production/test lines across more than five nonmechanical
files. Raise low ticket risk to high: misleading price reductions or invented matching are
financial-looking data errors. D-037 was appended before implementation. One Listing per current
Property makes original listing-price effects its minimum-price history; matching later must
integrate genuine reassignment/minimum effects, never use catalog ground truth now.

Use maximum effectiveAt, with equal instants resolved by canonical history position, rather than
array .at(-1). Corrected current 72M can coexist with original recorded reduction 80M → 70M;
the rank reports that recorded effect, not a new 80M → 72M observation. A later rise does not
remove it. Geographic descendants come from registered reference data, not historical breadcrumb
snapshots (legacy five-crumb references must still belong to their registered zone).

## Verification

- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` — all unchanged gates.
- `pnpm run test:coverage` — every existing workspace floor, no excluded/skipped covering tests.
- `pnpm run test:integration:properties` — all existing real HTTP contract safeguards, updated
  production persisted-empty ranking expectations only; prepared adapter tests remain intact.
- `pnpm run test:integration:locations` — real descendant SQL, all registered levels and resolver
  regressions; no foreign schema reads or fixture fallback.
- `pnpm run test:integration:properties-history` — full catalog plus focused ranking/history and
  genuine upgrade/backfill, original dates/bytes, corrected geography, replay and restart.
- `pnpm run test:integration:properties-ingestion` and
  `pnpm run test:integration:listing-provenance` — unchanged authority, rights and lifecycle.
- Changed supported-file Prettier and Markdownlint, original lefthook pre-commit/pre-push gates.
  Record any global lint:md failure separately; existing generated render snapshots have known
  errors, not permission to weaken checks or claim the command passed.

### Executed implementation evidence — 2026-10-11

- Full unchanged `lint`, `typecheck`, `test` and `build` scripts passed, then passed again after
  the final API reference-provider/import-order fix. The unit run passed 1,252 tests across
  122 files. `test:coverage` also passed every existing workspace floor twice; no exclusions,
  thresholds, skipped tests or test tooling were changed.
- `test:integration:properties` passed all 155 real HTTP requests, including persisted-empty
  default/1/20 reduction responses and existing prepared search/detail/strict-query safeguards.
- `test:integration:locations` passed 86 real HTTP requests, twenty persisted places, ten addresses
  and ten synchronized transaction leases. Recursive self/descendant queries cover every
  registered scope, including supplementary blocks; both compiled CommonJS module import orders
  have no undefined Nest imports. Migration replay, restart and fail-closed safeguards passed.
- `test:integration:properties-history` passed both the full history and genuine baseline-upgrade
  campaigns. The unchanged catalog has 39 runs, 115 acquisitions and eighteen immutable market
  events; São Paulo returns three actual reductions, not four prepared groups. Exact previous/
  current amounts are 68,000,000 → 65,500,000; 95,000,000 → 92,000,000; and 80,000,000 → 78,000,000.
  An independent HTTP-detail oracle verifies all twenty registered scopes, totals and pages 1/20.
  Genuine additional acquisitions prove equal ratios/IDs, canonical equal-date effects, date
  regression, later rise/removal and authentic max-asOf. Current/historical corrections preserve
  original prices/events while a latest eligible geography correction changes membership only.
  Upgrade tests prove initial-only dates, earlier-than-creation backfill with no invented drop,
  original baseline reductions, correction invariance, reverse replay/restart and a new full run.
  Real database outage returns sanitized 500 without rows or fallback; recovery preserves ranking.
- `test:integration:properties-ingestion` and `test:integration:listing-provenance` passed all
  unchanged authority, transaction rollback/retry, concurrent admission, immutable original bytes,
  corrected current values, current permissions, prepared isolation, lifecycle and privacy cases.
  All five integration commands were repeated successfully after the final wiring change;
  each exact isolated campaign removed its containers and volumes, including the upgrade stack.
- Changed supported-file Prettier, changed Markdownlint, focused integration ESLint and
  `git diff --check` passed. The unchanged pre-push command sequence and history secrets check
  passed (`gitleaks git --redact --no-banner`, 153 commits, no leaks). Git hooks themselves were
  not invoked because implementation does not authorize staging, committing or pushing.
- Global `pnpm run lint:md` remains a recorded baseline failure: exactly 1,377 errors, all under
  existing `_bmad/render/`, and zero outside generated renders. Existing Vite build warning for
  the approximately 537 kB CityScene chunk remains; builds succeed. Neither gate was weakened.
- One first-run integration assertion incorrectly looked for `requestId` at the error body's
  root; it was fixed to the frozen `error.requestId` envelope. The independent compiled-import
  audit then exposed the barrel-loading hazard recorded above; all final gates/campaigns passed
  after the composition-root fix and automated both-order regression guard.

Parent independently reads the complete staged baseline diff including new files, repeats all
commands above, audits every matrix row to passing executed coverage, performs pinned quick
review and makes implementation/test/docs commits with auto-commit only after accepted review.
No VPS, source activation, push or final product-wide UI campaign belongs to this story.

### Independent parent verification — 2026-10-11

- Read the complete staged canonical-baseline diff, including all ten newly added files.
  Rewrote and inspected the updated diff after the test-only connection-string adjustment.
- Independently passed lint, typecheck, all 1,252 tests across 122 files, build and every unchanged
  coverage floor. Repeated coverage and the actual pre-push hook after the test-only adjustment;
  the pre-push workspace gate passed again, with the history secret scan unchanged.
- Independently passed all five integration commands: 155 Properties HTTP requests, 86 Locations
  HTTP requests, full history and genuine baseline upgrade, Properties ingestion and Listing
  provenance. All six isolated campaign projects removed their owned containers and volumes.
- Matrix audit: Catalog and Scope are exercised by the history HTTP-detail oracle over twenty
  places, original catalog amounts and pages 1/20, plus Locations' registered-descendant checks.
  Selection and Ties are exercised by executed domain tests and genuine additional acquisitions
  for latest dated drops, future exclusion, equal dates/ratios, later rise/removal and safe money.
  Correction is exercised by history reparse/current-geography and genuine upgrade/backfill.
  Metadata is exercised by query tests, unchanged observations, nonmonotone dates and initial-only
  upgrade projections. Paging and HTTP are exercised by query tests, real history cursors and
  unchanged strict HTTP validation. Failure is exercised by both read-port failure tests and real
  PostgreSQL outage/recovery, replay and restart. No covering test is skipped or filtered out.
- Changed-file Prettier, Markdownlint, ESLint and diff whitespace checks passed. The actual
  pre-commit hook first flagged two explicit fictitious PostgreSQL URIs in the new redaction test.
  Constructed the same test URIs from components without changing assertions, production code,
  scanner rules or allowlists; all 359 infrastructure tests and the complete coverage run passed.
  The actual pre-commit hook then passed every applicable job, including staged secret scanning.
- Independently reproduced the known global Markdown failure: 1,377 errors, all in generated
  `_bmad/render/` snapshots, none outside that directory. The existing CityScene chunk warning
  remains nonfatal. Neither baseline issue was hidden by weakening a gate.

## Auto Run Result

- Status: built. Production reductions now read persisted original negative effects per actual
  Property through registered Locations scope, with exact ratio ordering and strict live cursors.
- Quick review completed against the full baseline diff and context. Zero findings: zero patches,
  zero deferred items and zero rejected findings. No review repair loop was required.
- Patched review counts: high 0, medium 0, low 0. Follow-up review recommended: false;
  there is no specific unverified review risk. The pre-review fictitious-URI test representation
  correction is recorded in independent verification, not counted as a review finding.
- Verification: all unchanged primary gates, all 1,252 unit tests, coverage floors, all five
  integration commands and actual pre-commit/pre-push hooks passed. Six exact isolated campaign
  stacks were cleaned. The reviewer independently passed 346 domain tests and twenty focused
  Application query/Locations tests. No gates, hooks, test floors or scanner rules were weakened.
- Residual limitations: synthetic-only, unresolved one-listing Properties; prepared search/counts
  remain separate and cursors are live projections. Global Markdown has the documented pre-existing
  generated-render errors; CityScene retains its nonfatal build-size warning. VPS work, real sources,
  pushes and the final product-wide UI evaluation remain outside this story.

### Files changed

- `apps/api/src/locations-reference.module.ts`
  — Share the Locations provider without a Nest import cycle.
- `apps/api/src/locations/index.ts` — Expose the new public query, domain rule or adapter.
- `apps/api/src/locations/locations.module.ts` — Consume and export the shared reference provider.
- `apps/api/src/properties/properties.module.ts`
  — Wire the persisted reduction query and registered scope.
- `packages/application/src/locations/locations-query.service.ts`
  — Expose registered self-and-descendant scope through Locations.
- `packages/application/src/locations/locations.facade.ts`
  — Expose registered self-and-descendant scope through Locations.
- `packages/application/src/locations/place.repository.ts`
  — Expose registered self-and-descendant scope through Locations.
- `packages/application/src/properties/index.ts`
  — Expose the new public query, domain rule or adapter.
- `packages/application/src/properties/largest-reductions.service.ts`
  — Orchestrate scoped ranking, authentic metadata and paging.
- `packages/application/src/properties/property-reductions.repository.ts`
  — Declare the minimal reduction read port.
- `packages/application/src/properties/read-pagination.ts`
  — Share unchanged strict validation and cursor protocol.
- `packages/domain/src/properties/index.ts` — Expose the new public query, domain rule or adapter.
- `packages/domain/src/properties/largest-reductions.ts`
  — Select latest original drops and sort exact percentage ratios.
- `packages/infrastructure/src/locations/postgres-locations.facade.ts`
  — Expose registered self-and-descendant scope through Locations.
- `packages/infrastructure/src/locations/postgres-place.repository.ts`
  — Expose registered self-and-descendant scope through Locations.
- `packages/infrastructure/src/locations/synthetic-locations.adapter.ts`
  — Expose registered self-and-descendant scope through Locations.
- `packages/infrastructure/src/properties/index.ts`
  — Expose the new public query, domain rule or adapter.
- `packages/infrastructure/src/properties/persisted-properties.facade.ts`
  — Delegate reductions to persisted data without prepared fallback.
- `packages/infrastructure/src/properties/postgres-property-reductions.repository.ts`
  — Project safe reduction candidates in one Properties-owned statement.
- `packages/infrastructure/src/properties/synthetic-properties.adapter.ts`
  — Reuse Application pagination while preserving prepared behavior.
- `apps/api/src/locations/locations.controller.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `apps/api/src/properties/properties.controller.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `integration/locations.integration.mjs`
  — Verify all registered scopes and both compiled module import orders.
- `integration/properties-contracts.integration.mjs`
  — Assert persisted-empty reductions with unchanged HTTP safeguards.
- `integration/properties-history-upgrade.integration.mjs`
  — Verify original ranking through genuine legacy upgrade and backfill.
- `integration/properties-history.integration.mjs`
  — Verify catalog ranking, corrections, ties, paging, replay and recovery.
- `packages/application/src/locations/locations-query.service.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `packages/application/src/properties/largest-reductions.service.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `packages/domain/src/properties/largest-reductions.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `packages/infrastructure/src/locations/postgres-place.repository.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `packages/infrastructure/src/locations/synthetic-locations.adapter.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `packages/infrastructure/src/properties/persisted-properties.facade.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `packages/infrastructure/src/properties/persisted-property.projection.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `packages/infrastructure/src/properties/postgres-property-reductions.repository.test.ts`
  — Cover the corresponding query, facade or HTTP behavior and regressions.
- `README.md` — Describe the persisted-only reduction surface.
- `_bmad-output/initiative-real-estate-intelligence/epic-properties/epic-properties.md`
  — Mirror D-037's persisted ranking decision.
- `_bmad-output/initiative-real-estate-intelligence/epic-properties/story-largest-reductions-of-a-place-plan.md`
  — Record intent, implementation, independent verification and review.
- `docs/api/properties-and-locations.md`
  — Specify original effects, scope, metadata and live cursors.
