---
title: 'Market contracts and stub endpoints'
type: 'feature'
ticket: '1'
created: '2026-10-11'
status: 'done'
baseline_revision: '7738135d2d76d7d8fd749d4609d93aeaf1d4a06d'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/CLAUDE.md'
  - '/workspace/repos/real-estate-intelligence/_bmad-output/initiative-real-estate-intelligence/epic-market/epic-market.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 4.1 has no Market read contracts or endpoints, preventing the Place overview
from consuming its figures, comparison, neighbour table and twelve-month chart.

**Approach:** Define strict versioned read contracts and expose deterministic, explicitly prepared
fixtures through a Market application facade and its NestJS composition, following D-038.

## Boundaries & Constraints

**Always:** Preserve ADRs, closed framework-neutral wire validation, public context barrels,
application/domain dependency direction, request/error conventions and coverage floors. Load and
follow `/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` and its required architecture,
testing and state-isolation references before writing backend code. D-012 overrides that skill's
Prisma/NX/Jest/EventEmitter defaults: explicit SQL, pnpm/Vitest, application-owned ports and public
query facades remain. Use the documentation-writer skill for the API reference. Keep all repository
text English and use only pnpm. Match existing fixture metadata and add `basis:
'prepared-market-example'` plus an explicit fixture `evaluatedAt` to every response. Data must be
detached, numeric, dated and sourced, with known empty scopes distinct from unknown places.

**Never:** Read/search/edit `.env*`; access VPS, real sources, models or deployments; create a branch,
commit, stage or push in the implementation agent; weaken hooks/checks; add dependencies, schema,
migrations, Market event consumers or worker behavior; read Properties SQL/private projections,
replace prepared grouping with alleged matching, change the immutable collection catalog, invent
artboard neighbours/counts, implement production Market algorithms or UI, or write on a GET.

## I/O & Edge-Case Matrix

| Scenario                           | Input / State                                    | Expected Output / Behavior                                                                                                 | Error Handling                       |
| ---------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Place figures                      | Each registered place, no query                  | Strict response, own place identity, plate counts, all CAP-9 figures and explicit parent comparison                        | 200                                  |
| Hierarchy                          | Country / Pinheiros                              | Null parent / actual Zona Oeste parent, never implicit city comparison                                                     | 200                                  |
| Neighbours                         | Bela Vista / Vila Mariana / Pinheiros            | Registered opposite neighbourhood only / empty list for Pinheiros                                                          | 200                                  |
| Series                             | Any registered place                             | Exactly twelve unique ascending months, November 2025–October 2026, place and parent medians with individual evidence      | 200                                  |
| Empty scope                        | Either supplementary block                       | Zero plate counts; unavailable medians, movement, days and ratio are null; twelve unavailable points, not invented samples | 200                                  |
| No sale                            | Every place                                      | Explicit not-recorded sale figure with null monetary value, never zero                                                     | 200                                  |
| Zero versus missing                | Nonempty example with zero reductions/movement   | Legitimate numeric zero remains available, unlike insufficient data                                                        | 200                                  |
| Freshness                          | Computed before / equal to source completion     | Stale / fresh respectively; explicit evaluation time and nonnegative age; no wall-clock freshness claim                    | Strict parser rejects contradictions |
| Unknown / malformed                | Unknown valid slug / invalid place ID            | Stable sanitized error with server-generated UUID correlation ID                                                           | 404 / 400                            |
| Forbidden query                    | Any key, repeated, nested or private key         | Reject before facade access; no accidental filtering                                                                       | 400                                  |
| Unversioned path                   | Each route without `/api/v1`                     | Canonical JSON error, not Express HTML                                                                                     | 404                                  |
| Invalid output / thrown dependency | Malformed facade response or failure             | No success fallback, no sensitive error message; valid canonical error                                                     | 500                                  |
| Response mutation                  | Caller changes nested sources, figures or series | Next read is unchanged; no shared mutable output                                                                           | No error                             |

</intent-contract>

## Code Map

- `packages/contracts/src/shared/wire.ts` — closed object/array/nullable/count/money/date/URL/slug
  primitives and `parseWire`; reuse rather than new validators or framework dependencies.
- `packages/contracts/src/locations/locations.read.{types,dto}.ts` — existing bilingual `PlaceRef`,
  strict place wire shape and `FixtureMetadata`; use public exports across contexts.
- `packages/domain/src/market/index.ts` — existing centavos/m² primitive; add inward read models
  separate from Contract DTO ownership, as Properties and Locations already do.
- `packages/application/src/locations/locations.facade.ts` — public asynchronous `getPlace` and
  `registeredScopeIds`; unknown is null. Consume facade only; no foreign state repositories.
- `packages/infrastructure/src/collection/index.ts` — public immutable synthetic dataset export:
  five labeled groups, nine listings, three sources, thirteen monthly cycles. Fixture-only reuse
  is allowed via this public barrel; no private Properties projection or collected-text exposure.
- `packages/infrastructure/src/locations/index.ts` — public registered fixture place helpers;
  twenty places, including two empty blocks. Only Bela Vista ↔ Vila Mariana is adjacent.
- `apps/api/src/locations-reference.module.ts` — reuse existing Locations provider composition
  without importing Locations controller module or causing the prior CommonJS barrel cycle.
- `apps/api/src/market/market.module.ts` — empty, already imported by AppModule; worker remains empty.
- `apps/api/src/http/{read-query,unprefixed-read-paths}.ts` and `configure-api.ts` — reuse strict ID/
  query validation, `readResult`, versioning, JSON errors, request UUIDs and tracing.
- `apps/api/src/locations/locations.controller.test.ts` — real Nest application/fetch tests with
  module/provider overrides; verify actual MarketModule wiring, not controller-object proxies.
- `integration/{properties-contracts,locations}.integration.mjs` — unique Compose project, dynamic
  reserved ports, env-file loading disabled, PostgreSQL/migrations/API and exact cleanup. Reuse
  this pattern without refactoring unrelated harnesses or running collectors.
- `scripts/test-coverage.sh`, `docs/testing/coverage.md` — preserve existing workspace floors.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/market/market.read.types.ts` and its public barrel — define domain-owned
      read models and port-compatible discriminated figure states, without outward dependencies.
- [x] `packages/contracts/src/market/market.read.{types,dto}.ts`, `index.ts` and colocated tests —
      implement the shapes below and public parsers with closed recursive validation and semantic
      consistency; prove every matrix state and negative malformed case before wiring the API.
- [x] `packages/application/src/market/market.facade.ts`, `market-query.service.ts`, their tests
      and public barrels — a narrow own fixture-read port and Locations public facade orchestration;
      unknown registered place returns null, existing empty scopes remain readable, failures propagate.
- [x] `packages/infrastructure/src/market/synthetic-market.adapter.ts`, fixture support, tests
      and public barrels — explicitly prepared deterministic Market samples for the unchanged catalog,
      group once and use lowest active asking price; document example arithmetic without claiming the
      production metrics stories complete. Reuse only public fixture exports. Test all twenty scopes,
      fixed counts, source selection, actual parents, adjacency, empty scopes and result isolation.
- [x] `apps/api/src/market/market.controller.ts`, `market.module.ts` and real HTTP tests — wire
      the facade through LocationsReferenceModule; implement all three routes, strict output parsing,
      rejection of queries, canonical errors and unprefixed route behavior. Preserve both-order
      compiled import regression in Locations and avoid redundant conflicting route guards.
- [x] `integration/market-contracts.integration.mjs` and `package.json` — add
      `test:integration:market`; use real PostgreSQL-backed location registration and actual HTTP,
      exercise all twenty scopes and the route/error/parser matrix, and compare read/write-relevant
      database state before/after GETs. Ensure cleanup on success and failure; no broker/model/collector
      is needed. Assertion failures must fail the command.
- [x] `docs/api/market.md`, `README.md` and this plan — document endpoints, exact fields, units,
      examples, errors, prepared basis and freshness instant, parent-vs-city distinction and future
      production-rule boundaries. Append evidence and caveats; preserve append-only plan sections.

**Acceptance Criteria:**

- Given the unchanged synthetic catalog and registered Places, when real API GETs consume each
  public Market route, then every response passes the exported strict parser and exposes all
  required Place overview figures, counts, parent identity, adjacency and twelve-month series.
- Given real PostgreSQL and an empty data-ingestion state, when the entire fixture journey runs,
  then no Properties/Collection/outbox state changes and no fixture is presented as persisted
  Market calculation; real source collection and production matching are not prerequisites.
- Given bad requests and injected facade failures, when requests reach the real configured Nest
  application, then errors are canonical, correlated and sanitized, with no fallback success.
- Given caller mutations and repeat reads, when the routes are requested again, then deterministic
  fixtures remain unchanged and the immutable catalog retains five groups/nine listings/three
  sources/thirteen cycles.

## Implementation Notes

- 2026-10-11: Added independent inward Market read models and outward Contract DTOs, strict
  recursive parsers, the application-owned prepared-read port and facade, and Nest read routes.
  The adapter uses only the unchanged public Collection and Locations fixture exports. All
  calculations remain explicitly prepared examples, with fixed evaluation time and detached data.
- The adapter reuses the existing domain centavos/m² primitive, counts labeled groups once and
  selects each group's lowest active asking price. Source evidence includes all contributing
  active listings' sources, not merely the chosen representative's source. April/May Vila Mariana
  uses Brisa alone; the Cobalto published-location discrepancy does not change prepared grouping.
- Hierarchy, scope membership and adjacency are obtained through the public Locations facade.
  Pinheiros compares with Zona Oeste; both registered empty blocks retain their parent and null
  own figures. There is no Properties projection access, SQL, event consumer or GET write in Market.
- The existing unversioned `places` JSON guard now belongs to the shared LocationsReferenceModule,
  so standalone MarketModule HTTP tests receive the same canonical 404 without duplicate guards
  or importing the Locations controller module. Existing compiled both-order imports remain green.
- The documentation-writer skill shaped the API reference as a contract reference: exact response
  fields and units, concrete arithmetic, state/freshness semantics, errors and production boundaries.

## Plan Change Log

- 2026-10-11: No endpoint, catalog, dependency, persistence or scope changes. Timestamp validation
  permits source observations before completion and rejects observations after it; freshness is
  evaluated at the declared fixture instant. Completed the planned checks without changing floors.

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The raw source-URL authority regex accepted a real-host URL with a
    backslash before `synthetic.invalid` — independently reproduced the regex acceptance and
    WHATWG hostname `real.example`, and traced `wireUrl` and the controller's strict output
    parser. Replaced the raw regex with the parsed hostname's `.invalid` suffix using the
    existing framework-neutral runtime-URL pattern. A regression fails before the correction
    and passes afterward, while ordinary HTTP/HTTPS `.invalid` URLs remain valid. The parent
    typecheck and API image build caught the first patch's direct-global type error; the same
    implementation agent corrected it without adding type libraries, imports or dependencies.

## Design Notes

Full route: this cohesive cross-layer contract increment exceeds 100 lines and five files, but is
low business risk because all data stays explicitly synthetic and read-only.

Freeze endpoint names from D-038. Each response has existing `metadata`, `basis`, `evaluatedAt` and
`place`. The overview additionally has `counts` (properties, activeListings, sources), `figures`
and nullable `parentMedian` with explicit `place`. Figures are `medianAskingPricePerSquareMeter`,
`askingPriceMovement` (windowMonths 6 and percentage), `medianTimeOnMarketDays`, `priceReductions`
(windowDays 30, count and percentage), `listingsPerProperty`, and
`recordedSalePricePerSquareMeter`. Each value has an explicit available/insufficient-data/
not-recorded state and corresponding nonnull/null value, plus `recordCount`, unique source
evidence (ID, label, `.invalid` source URL and collectedAt), `computedAt` and freshness. Prices
are `{ minorUnits, currency: 'BRL' }` in centavos/m²; days/ratios are finite nonnegative values,
percentages are percentage points (not ratios), reductions percentage is within 0–100, and
count/amount integers are safe. A nonempty sample may have numeric zero; empty medians never do.
Freshness contains status, latestCollectionCompletedAt and nonnegative ageSeconds computed at
the declared evaluatedAt; reject impossible temporal relations and inconsistent fresh/stale
claims. Fixture time is fixed, not current time. Include valid fresh and stale examples in
tests/real HTTP overrides; never claim a run actually occurred for the prepared examples.

Neighbours response has `items` with explicit neighbour `place`, median and movement figures;
only registered adjacency is eligible. Series response has nullable `comparisonPlace` and
`points` with a `YYYY-MM` month and independently evidenced place/nullable parent median.
Validate exactly twelve distinct consecutive ordered real calendar months and comparison
identity/null coherence. Country has no parent; empty blocks still have an identified parent.
Missing/extra fields, unavailable values that are numeric, duplicate source IDs, unsafe numbers,
invalid timestamps, malformed URLs, bad monthly order and inconsistent freshness must fail.

```ts
const response = parsePlaceMarketResponse(await (await fetch(url)).json());
expect(response.basis).toBe('prepared-market-example');
expect(response.parentMedian?.place.id).toBe('sao-paulo-oeste');
expect(response.figures.recordedSalePricePerSquareMeter.value).toBeNull();
expect(parsePlaceMarketSeriesResponse(series).points).toHaveLength(12);
```

The plate and figures use prepared grouping, not the nine persisted unresolved Properties identities
from D-037. Monthly/six-month/30-day fixture examples are scaffolding; event-driven production
facts, movement eligibility, median policies and series storage remain later stories.

## Verification

**Commands:**

- `pnpm run lint` — all ESLint, boundary and migration checks pass.
- `pnpm run typecheck` — all workspaces pass.
- `pnpm run test` — complete colocated suites pass, including every matrix branch and strict
  parser negative cases, real Nest HTTP failures and module wiring.
- `pnpm run build` — all workspaces build; report existing nonfatal web chunk warning separately.
- `pnpm run test:coverage` — every unchanged per-workspace threshold passes.
- `pnpm run test:integration:market` — isolated real API/PostgreSQL campaign passes every route,
  all twenty registered scopes, fixture invariants, canonical errors and no-write assertions;
  exact campaign resources cleaned up.
- `pnpm run test:integration:properties` — existing Properties contracts/ranking campaign passes.
- `pnpm run test:integration:locations` — existing hierarchy and both-order compiled import
  campaign passes.
- `git diff --check` — no whitespace errors.
- Changed-file `pnpm exec prettier --check <paths>` and changed-Markdown
  `pnpm exec markdownlint-cli2 <paths>` — no new format/docs errors. Do not alter generated BMad
  renders to fix the known unrelated 1,377 global Markdownlint errors.
- `gitleaks git --redact --no-banner` — no leaks; never suppress findings or read `.env*`.

Inspect the full actual diff and map each matrix/AC to concrete test assertions. Confirm no new
dependencies, no schema/worker/UI modifications, no foreign private imports, no changed catalog
and no externally activated service; capture evidence and any prior baseline warnings.

### Implementation verification evidence — 2026-10-11

- Final `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, `pnpm run test` and
  `pnpm run test:coverage` passed. All 1,315 tests passed: contracts 76, domain 346, application 174,
  infrastructure 363, API 140, worker 193, AI 9 and web 14. Every unchanged coverage floor passed.
- `pnpm run test:integration:market` passed with 142 real HTTP requests against an isolated
  PostgreSQL/migrations/API stack. It asserted all twenty persisted Places, three strict endpoints,
  exact city counts/median, actual parents, registered adjacency, twelve calendar months, empty
  scopes, unrecorded sale values, numeric zeros, canonical errors, parser rejection and repeat-read
  isolation. Whole-table count/digest snapshots were identical before/after both success and
  failure journeys. Properties remained empty and outbox remained empty. Exact owned resources
  were removed and their absence was asserted.
- Existing `pnpm run test:integration:properties` passed with 155 real HTTP requests and unchanged
  Collection/outbox state. Existing `pnpm run test:integration:locations` passed with 86 real HTTP
  requests, twenty Places, ten addresses, synchronized leases, migration replay/restart,
  fail-closed reads and the compiled import regressions. Both isolated campaigns cleaned up.
- Matrix-to-test evidence: contract tests cover fresh/stale, null versus zero, sale state,
  recursive closed objects, safe amounts/counts, sources/URLs/dates, temporal contradictions and
  ordered twelve-month comparison coherence. Adapter tests cover all twenty scope counts/parents,
  source selection, prepared arithmetic, adjacency, immutable catalog invariants and detached
  nested results. Application tests cover unknown-before-fixture access, invalid IDs, dependency
  propagation, absent scope/parent/neighbour and misaligned series. Real Nest HTTP tests cover
  actual provider composition, every route/scope, query-before-facade rejection, canonical
  correlated 400/404/500, invalid output, thrown dependencies and a truthful stale override.
- Changed-file Prettier checks, focused unchanged-rules Markdownlint and `git diff --check` passed.
  `gitleaks git --redact --no-banner` scanned 156 commits (7.19 MB), finding no leaks. No `.env*`
  files were accessed. The broad Markdown command expands configured globs and retains the known
  1,377 unrelated generated-BMad-render errors; those renders were not modified.
- Baseline caveat: the existing web build emits a nonfatal 536.96 kB CityScene chunk warning.
  Production matching/metrics, event-driven storage, real collection and UI remain intentionally
  outside this increment. No dependencies, schema, migrations, catalog, worker or UI were changed;
  no branch, staging, commit or push was performed. The pre-existing epic edit was preserved.

### Vitest integration migration evidence — 2026-10-11

The owner-directed D-039 migration supersedes only the integration harness and its test dependencies,
not this story's intent, application behavior, previous review log or original implementation evidence.
See the [integration preservation inventory](../plan-vitest-integration-standard-preservation.md) and
[execution guide](../../../docs/testing/integration.md).

- The complete owned Vitest suite passed in session `14314`: 37 tests across 20 files, zero failures
  or pending tests, 674.15 seconds. Actual execution spans 06:08:42.495–06:19:56.651 UTC; the complete
  result is `/tmp/rei-vitest-evidence.if6KGX/full-integration.json`.
- Market's native Vitest campaign passed in 17.006 seconds, preserving all 43 original assertions,
  142 real HTTP requests, twenty persisted scopes, three strict endpoints, canonical errors and
  strict parser checks. Whole-table count/digest snapshots remain identical across successful and
  failed reads; Properties and outbox remain empty. All three retained SQL literals are unchanged.
- The same full run passed Properties contracts in 15.860 seconds with 155 real HTTP requests and
  unchanged Collection/outbox state. Locations passed in 24.508 seconds with 86 real HTTP requests,
  twenty Places, ten addresses, ten synchronized leases, migration replay/restart and both genuinely
  fresh compiled CommonJS import-order probes. Owned teardown and resource-absence checks passed.
- Parent's latest independent lint, typecheck, unit, build and coverage gate (`61409`) passed after
  the final shared cleanup changes: 1,316 unit tests across 126 files and unchanged coverage floors.
  The additional unit case belongs to the preserved URL-validation repair; this migration makes no
  additional production changes. The existing nonfatal 536.96 kB CityScene warning remains.
- The migration preserves this plan's immutable intent and historical review evidence. No commit
  or push was performed; the parent staged only identified session-owned paths. The separate main
  integration plan's frozen-table Prettier/pre-commit caveat does not affect this story's formatted
  source, tests or documentation.

### Final typed integration evidence — 2026-10-11

The owner's D-040 addition changes only the campaign language and compiler gate, not this story's
immutable intent. Final independent root gates pass in session 93554: lint, recursive and strict
integration typecheck, 1,316 unit cases in 126 files, build and unchanged coverage floors.
The complete reviewed TypeScript suite passes in session 96246: 37 tests in twenty files,
zero failures or pending cases, 646.58 seconds. Its actual JSON is
`/tmp/rei-typed-final-ChFnDG/integration.json`.

Market passes in 16.871 seconds with all 142 real HTTP requests, twenty persisted scopes,
strict endpoint/parser/error checks and unchanged whole-table snapshots. Properties passes in
15.743 seconds with 155 requests; Locations passes in 24.438 seconds with 86 requests and both
fresh compiled import orders. All sixteen campaign SQL sequence hashes and expectation counts
match the pre-TypeScript inventory, including Market's 43 expectations. Exact owned cleanup leaves
no campaign or Testcontainers resources; foreign resources are preserved.

The main migration plan's historical formatter caveat is resolved by the explicit owner-directed
renewal before TypeScript implementation. All fourteen changed Markdown documents and changed
source/configuration files pass unchanged formatting rules. The final context-free Quick review
reports no findings; the original URL-validation patch remains covered and verified.

## Auto Run Result

- Implemented the three prepared Market read endpoints, strict versioned contracts and deterministic
  fixture adapter through the application facade. This completes story 4.1's fixture contract,
  not the later production metric or event-consumer stories.
- Files: Domain/Contracts Market read types, DTOs and public barrels define the boundary;
  Application port, query service, facade and barrels orchestrate Locations; Infrastructure adapter
  and barrels serve prepared detached data; API controller, Market module and Locations composition
  wire the actual HTTP routes. Four colocated unit files and the Market integration campaign verify
  them; `docs/api/market.md`, README, epic notes and this plan document the increment.
- Review: one medium patch corrects source URL hostname validation, with 48 regression cases;
  zero high/low patches, zero deferred entries and no rejected findings in this story's review.
  The final TypeScript Quick pass adds no findings. Follow-up recommendation remains false because
  only one medium entry was patched and its concrete failure and full journey are verified.
- Verification: all root gates, unchanged coverage, frozen install, final real-service suite,
  preservation audit, scoped formatting/Markdown and secret scanning pass. Market, Properties and
  Locations execute against owned services with their original HTTP counts and database guarantees.
- Residual risks: existing nonfatal web chunk warning and generated-render Markdown findings;
  production metrics, event-driven storage, real collection, UI and VPS remain outside story 4.1.
  No new environment variable, schema, catalog, migration, worker or UI change is needed.

The autonomous orchestrator accepts the locally verified story as done after the built result.
Its implementation is committed as `a0fec00`; the reviewed typed test migration is committed
separately as `4680370`. Documentation and this status are included in the final local
documentation commit, with normal hooks and no push. VPS-dependent stories retain their existing
pending state.
