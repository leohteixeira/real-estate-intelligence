---
title: 'Properties contracts and stub endpoints'
type: 'feature'
ticket: '1'
created: '2026-10-10'
status: 'built'
baseline_revision: '25120e5129e3b20f53980a74de71c8389ec2ae98'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 1
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0012-domain-events-and-transactional-outbox.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ticket 3.1 must give web and market stable property, listing, search, reduction, place
and event boundaries before persisted ingestion and production queries exist (CAP-6/7/8).

**Approach:** Introduce JSON-only DTOs with strict wire validators, application read facades,
domain event contracts and read-only synthetic adapters behind actual versioned Nest endpoints.
Responses validate against contracts and explicitly distinguish prepared fixtures from production.

## Boundaries & Constraints

**Always:** Follow D-020 (epic Notes), existing ADRs and package directions. Read the user-named
`/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` plus its architecture-patterns,
module-communication, testing-patterns and state-isolation references before backend changes;
D-012 overrides ORM/Nx/EventEmitter/Jest suggestions. Contracts are dependency-free JSON shapes;
application imports domain only; public barrels are cross-context boundaries. Keep strict
allowlists, BRL safe-integer centavos, backend calculations, complete provenance, synthetic tags,
stable IDs and `totalItems`. Do not read/search/edit `.env*`. Use pnpm and apply_patch for edits.

**Never:** Implement ingestion, persistence, migrations, broker/outbox writes, production matching
or permissions inference. Do not rewrite shared collection fixtures/events, enable sources, fetch
URLs, use AI, access VPS, change UI, add dependencies, lower coverage, skip tests, commit or push.
No market neighborhood median invention, sale inference, unit/contact/photo/fingerprint payload
exposure. Fixture match scores must not be presented as calculated production scores.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                                                 | Expected Output / Behavior                                                                                        | Error Handling                                                            |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Read journey         | Places → search → property → grouped listing → reductions                     | Real HTTP 200s, strict DTO validation, consistent IDs/place/crumbs/provenance and synthetic metadata              | None                                                                      |
| Filtering and sorts  | All UX filters, each of four sorts, ties, combined history flags              | Deterministic fixture selection; own-result median/deviation, total matching/place counts; null market comparison | None                                                                      |
| Paging               | Default page, pageSize=1, cursor chain, altered scope/sort                    | Default/max 20; opaque scope-bound cursor, no repeats/omissions, fixed totalItems                                 | Mismatched/invalid cursor is 400                                          |
| Empty/missing values | Excluding filter; absent attribute; no active listing prepared example        | Valid empty page/null median; explicit missing/null and no-recorded-sale, never fabricated zero                   | None                                                                      |
| Malformed request    | Unknown/duplicate/nested keys, invalid enums/numbers/ranges/ID, oversize page | Stable sanitized error envelope and server request ID                                                             | 400                                                                       |
| Unknown resources    | Valid unknown property/listing/place ID; unprefixed path                      | Stable not-found response, no internal errors                                                                     | 404                                                                       |
| History              | Bela Vista price/description changes; Vila Mariana removal/reappearance       | Dated previous values, lowest-active price, lifeline gaps; asking not sale                                        | None                                                                      |
| Text rights          | Dedicated denied-permission fixture alongside allowed synthetic descriptions  | Denied branch has only change times/source link, no current/previous text/excerpts anywhere                       | Fail closed                                                               |
| Snapshot expiry      | Prepared expired historical snapshot                                          | Hash/run provenance survives; explicit expired/unavailable status, no invented retrieval                          | None                                                                      |
| Event wire boundary  | Eight event round trips and mutated envelopes/payloads                        | Immutable v1 domain events; revisions, assignments and dated facts; no descriptions/contact data                  | Reject extra/missing fields, bad IDs/dates/money/versions/types/relations |

</intent-contract>

## Code Map

- `packages/contracts/src/{properties,locations}/index.ts` are empty; root already exports them.
  Shared money/provenance/pagination are in `src/shared/`; pagination uses `totalItems`, not totalCount.
- `packages/domain/src/shared/domain-event.ts`, `collection/collection.events.ts` provide immutable
  seven-field envelopes, UUIDv7/UTC/hash/trace validators and strict unknown-wire conventions.
  Reuse exported shared parsers; do not loosen existing collection parsing.
- `packages/application/src/collection/collection.facade.ts` models token/interface/public facade.
  New properties/locations read models can live in domain with application ports referencing them,
  and structurally compatible contract DTOs without prohibited package imports.
- `packages/infrastructure/src/collection/{synthetic-sao-paulo.dataset,synthetic-sao-paulo.replay}.ts`
  export five properties/nine stable identities/thirteen monthly runs, fixed parsed-event provenance,
  hashes, descriptions, removals and ground truth. Import through public barrels, not deep cross-context
  paths. Do not alter these fixtures. `pricePerSquareMeter` is exported by domain and canonical.
- `apps/api/src/{properties,locations}/*.module.ts` are empty and already imported by AppModule.
  Add controllers and symbol-injected facades without changing shared bootstrap/collection modules.
  `configure-api.ts` and `http/api-exception.filter.ts` supply prefix/request ID/error envelope;
  convert input validation to BadRequestException, missing reads to NotFoundException.
- `apps/api/src/collection/collection.controller.test.ts`, `configure-api.test.ts` exercise fetch on
  real Nest HTTP listeners. Test actual new module/provider wiring, not controller-only proxies.
- `integration/synthetic-collection.integration.mjs` is the hermetic Compose precedent: unique project,
  dynamic ports, COMPOSE_DISABLE_ENV_FILE=1/empty COMPOSE_ENV_FILES, synthetic credentials, scoped cleanup.
  Keep it unchanged; create a read-only HTTP journey campaign rather than broker mutation.
- `scripts/check-context-boundaries.mjs`, `scripts/test-coverage.sh`, package Vitest configs and
  existing lint/hooks/coverage thresholds are immutable quality gates.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/{properties,locations}/` — define DTOs and strict JSON wire parsers
      with adjacent tests; export barrels. Use shape-only helpers, no query/business calculations.
- [x] `packages/domain/src/properties/` — define inward-independent read models if needed and eight
      typed v1 events, constructors/strict parsers and exhaustive mutation/serialization tests. Export
      via context/root. Aggregate ID must agree with target listing/property; reject contradictory facts.
- [x] `packages/application/src/{properties,locations}/` — define public read facade symbols/interfaces
      and DTO-shaped views; root exports. Locations supports hierarchy, crumbs and registered adjacency.
- [x] `packages/infrastructure/src/{properties,locations}/` — implement read-only fixture projection,
      request filtering/paging and deterministic history; unit-test every matrix edge. Reuse public
      collection replay and domain arithmetic; keep fresh/immutable responses without shared-state leaks.
- [x] `apps/api/src/{properties,locations}/` — wire modules/providers/controllers; strict scalar raw
      query parsing rejects duplicates/unknown keys and translates failures to existing envelope.
      Add real HTTP tests covering all matrix rows that reference endpoints and actual module wiring.
- [x] `integration/properties-contracts.integration.mjs`, `package.json` — add an isolated Compose
      campaign and `test:integration:properties` script: compiled real API on local stack, strict response
      validation and place→search→property→listing→reductions/empty/error journey. No UI exists in scope.
- [x] `docs/api/properties-and-locations.md`, `README.md` — API reference: paths/query fields, DTOs,
      event vocabulary, statuses, stable fixture IDs, rights/expiry and honest stub limitations.
      Run documentation-writer; reference type, no user interaction under delegated owner instructions.
- [x] This plan — append implementation/verification evidence with each matrix row mapped to executed
      passing tests. Preserve intent contract and append-only notes/logs; do not mark done or commit.

**Acceptance Criteria:**

- Given the production Nest modules with synthetic adapters, when clients traverse the seven GET
  families under `/api/v1`, then their serialized bodies pass public strict contract parsers and
  support plate, crumbs, picker, property/listing grouping and reduction navigation consistently.
- Given the fixed replay fixture, when clients inspect property/listing data, then asking-price,
  history, source/run/hash and explicit no-sale/evidence states satisfy CAP-7/8 without market or
  ingestion dependencies; permitted and denied description branches both pass leak assertions.
- Given all UX filters/sorts and pagination, when real HTTP queries are accepted or rejected,
  then fixture behavior matches the API reference and each error carries the stable sanitized
  envelope and a fresh server-generated request identifier.
- Given valid and malformed event wire JSON, when downstream consumers hydrate each listing/property
  event, then only immutable valid versioned facts succeed, with sufficient listing assignments and
  minimum-active-price facts to avoid foreign-table reads; no event is actually published here.
- Given the local isolated Compose stack, when the new API-only journey campaign and full repository
  checks run, then they pass without real sources, secret reads, skipped tests or lower coverage.

## Implementation Notes

### Implementation evidence — 2026-10-10

- Added dependency-free properties/locations read types and closed JSON wire parsers in contracts;
  separately owned inward-independent domain read models keep application dependencies legal.
- Added public read facade tokens/interfaces, synthetic locations and properties adapters, production
  Nest controller/provider wiring and the seven GET families. All cross-context imports use public
  barrels. The shared bootstrap, collection modules/events/replay, migrations and quality gates are
  unchanged.
- Search supports every specified filter, inclusive numeric bounds, AND history flags, the four
  deterministic sorts, whole-result median/deviation/counts and normalized scope-bound cursors.
  Query capture uses a null-prototype map so even `__proto__` is an unknown key, not a bypass.
- Projection reuses the unchanged five-property/nine-listing/thirteen-run public collection replay
  and canonical price arithmetic. Explicit supplementary denied/expired/no-active examples are
  retrievable by ID but excluded from authoritative search, counts, medians and reductions.
- Added immutable generic `PropertiesEvent<T>` constructors with a literal-keyed payload map and a
  strict wire parser for all eight v1 events. Listing identity/status/provenance, observation time,
  minima/nullability, active membership and merge/split assignments are validated. Removed facts
  may reference their prior snapshot; no fact may refer to a future observation. No event is emitted.
- Added the isolated Compose campaign and API reference. Documentation is reference-oriented under
  documentation-writer, with stable fixture IDs, DTO/parser vocabulary, query bounds, errors,
  rights/expiry and explicit stub limitations. No frontend or dependency changes were made.

### Matrix-to-test mapping

Every test file below was executed successfully through repository Vitest scripts. The integration
campaign additionally traverses the same HTTP scenarios against the compiled production API.

| Matrix row           | Executed passing evidence                                                                                                                                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read journey         | `apps/api/src/properties/properties.controller.test.ts`: picker → crumbs → search → grouped property → listing → reductions; all public parsers. `packages/infrastructure/src/locations/synthetic-locations.adapter.test.ts`: roots/children/bilingual hierarchy/adjacency. Compose campaign repeats the full journey. |
| Filtering and sorts  | `packages/infrastructure/src/properties/synthetic-properties.adapter.test.ts`: inclusive filter table, history AND cases and four deterministic sorts. Real HTTP filter/sort tables and Compose campaign confirm whole matching-set median and counts.                                                                 |
| Paging               | Infrastructure cursor chain/tie/mismatch tests, HTTP four-sort pageSize=1 chains and changed-scope/sort/endpoint errors; Compose repeats complete cursor traversal without repeats/omissions.                                                                                                                          |
| Empty/missing values | Infrastructure, real HTTP and Compose check excluding filters/null median, empty leaf/reduction pages, supplementary null-bedroom/no-active asking price and no-recorded-sale. Contract mutation tests validate nullable shapes.                                                                                       |
| Malformed request    | Real HTTP invalid raw-query table rejects unknown/duplicate/nested/prototype keys, invalid numeric/enumerated/boolean inputs, ranges, bounds, cursors and IDs. `%ZZ` path regressions verify sanitized JSON 400s even before controller dispatch. Compose checks malformed queries and paths too.                      |
| Unknown resources    | Real HTTP valid missing IDs/place paths and unprefixed family regressions; Compose checks matching sanitized JSON 404s and fresh server-generated request IDs.                                                                                                                                                         |
| History              | Infrastructure verifies Bela Vista minimum-price changes, description effective date/hash-only history and Vila Mariana eleven observations/two lifeline intervals. HTTP and Compose verify grouped history, asking-not-sale and source provenance.                                                                    |
| Text rights          | Infrastructure and real HTTP assert no denied current/previous text/version/excerpt in either listing or property bodies. Compose repeats leak assertions; contract tests reject forbidden denied-branch fields.                                                                                                       |
| Snapshot expiry      | Infrastructure checks explicit expired status, original observed/collected time and preserved hash/run; real HTTP and Compose validate the expired response without attempting retrieval.                                                                                                                              |
| Event wire boundary  | `packages/domain/src/properties/properties.events.test.ts`: all eight immutable round trips; recursive missing/extra/wrong-type mutations; invalid envelope/trace/ID/date/hash/money/version/status/source/minimum/assignment relations; past-removal and future-provenance cases.                                     |

### Regression evidence

The first Compose execution failed at `GET /properties` (unprefixed): status `404`, content type
`text/html; charset=utf-8`, rather than the required JSON error envelope. The initial local HTTP
test checked status only. Strengthening it to parse the body reproduced the failure. Inspection of
the installed Nest router showed that its default not-found/error handlers are scoped to the global
prefix; an unprefixed unmatched route falls through to Express's HTML fallback.

The new read modules install a narrowly scoped module-init fallback for unprefixed properties,
listings and places paths, delegating to the existing `ApiExceptionFilter`. The shared prefix,
bootstrap and filter remain unchanged. Regressions now check the sanitized JSON body, header ID,
all three read roots/nested paths and malformed percent escapes under `/api/v1`.

## Plan Change Log

### 2026-10-10 — Review loop 1

- Trigger: five public read-contract gaps and contradictory reassignment minima were confirmed
  against CAP-3/7, the UX, D-020 and compiled fixtures. A retained property ID was also rejected.
- Amendment: the repair requirements below complete Design Notes without changing the frozen
  intent. D-021 records the concrete choices in the epic and the owner's external decision log.
- Known-bad state avoided: frontend-only price math; missing block/evidence/feature data; listing
  reductions presented as property rows; forced new IDs and impossible reassignment minima.
- KEEP: preserve dependency directions, public barrels, all seven production Nest GET families,
  strict raw-query/error handling including malformed escapes and unprefixed JSON errors, immutable
  eight-event envelopes, denied-text and expired-snapshot branches, fixed authoritative replay,
  deterministic filters/sorts/cursors, metadata and fresh responses. Preserve all passing tests
  except assertions that explicitly described a now-proven wrong contract. Extend them with the
  missing requirements; keep coverage floors and original hooks unchanged. Preserve the hermetic
  Compose journey, cleanup, no-write assertions and safe URL construction from fixture config.
  The previous attempt is available for positive preservation at
  `/tmp/rei-story-3-1-diff.iIqhFy`; it is evidence, not the amended source of truth.
  Keep the mechanical formatting repairs to the two completed platform plans.

## Review Triage Log

### 2026-10-10 — Review pass 1

- verdicts: 7 findings — high 1, medium 6, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Place shapes omit country/state/block and block range/coordinates —
    domain/contracts and serialized fixtures only admit three kinds; D-020 and CAP-3 require the
    full hierarchy. Amended Design Notes to include all levels and prepared block metadata.
  - `[medium]` `[bad_plan]` Prepared grouping has no probability or reason facts — the Bela Vista
    body only contains membership/label/null score. Amended Design Notes for explicitly prepared
    probability and permitted factual reasons, preserving absent production matching.
  - `[medium]` `[bad_plan]` Price changes omit percentage — both compiled Bela Vista changes
    contain only centavos/date/provenance. Amended Design Notes for signed backend percentages.
  - `[medium]` `[bad_plan]` Agreement omits type and features — closed field enums exclude them
    despite structured fixture features and UX source-agreement requirements. Amended Design
    Notes for type agreement and per-feature reporting counts/source IDs.
  - `[medium]` `[bad_plan]` Reductions use listing rather than property history — reproduced
    Santana's 68m→65.5m listing row while its property minimum changed 67m→65.5m, with different
    rankings. Amended Design Notes for one latest property drop and property-ID tie breaking.
  - `[medium]` `[patch]` A surviving property ID fails assignment validation — compiled merge
    A+B→A with complete A→A/B→A assignments throws. The unconditional same-ID rejection is the
    demonstrated defect; its targeted removal is included in the rederivation and regression
    coverage, as this pass's bad-plan entries take precedence over standalone patches.
  - `[high]` `[bad_plan]` Reassignment accepts an impossible minimum — compiled merge of single
    active 80m/78m listings accepts 79m selecting the 80m listing. Amended Design Notes to carry
    dated listing facts and validate previous/resulting minima and conservation without foreign
    reads. Both merge and split will exercise contradictory selections/prices.

### 2026-10-10 — Review pass 2

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Raw numeric queries lose invalid fractions and area bound violations —
    the parent reproduced all three reported integer cases and both area boundaries through the
    compiled `readQuery` caller; Number rounded them into valid inputs before adapter validation.
    Re-engaged the same implementation agent for a direct private parsing correction. Raw decimal
    text now rejects nonzero integer fractions and exact area values outside 0.01–1000000 before
    conversion, retaining valid trailing-zero forms. Twelve invalid precision regressions and
    twelve valid-boundary cases were added to real production-module HTTP tests and the existing
    Compose campaign. The targeted HTTP file passes all 104 tests. Full parent verification follows.

## Design Notes

### Required repair — D-021

- Place kinds are `country`, `state`, `city`, `zone`, `neighborhood`, `street-block`. Country
  `brazil` contains state `sao-paulo-state`, which contains the existing `sao-paulo` city. Preserve
  existing zone/neighborhood IDs and add one stable explicitly fictional block per fixture
  property. Roots/children/crumbs traverse all six levels. A property/listing's canonical place
  is its block; scopes include descendants. `PlaceDetail` has nullable coordinates and nullable
  block metadata; blocks supply street name, a from/to number range and prepared-fixture origin.
  No unit/complement or geocoding is allowed. Counts exclude supplementary privacy examples.
- `PriceChange` includes signed `changePercent`, calculated in the backend. Every property
  price-history item has this field. Reductions select the latest strictly negative property
  minimum-price change through asOf; one row per property, positive `reductionPercent`, sorted
  descending then by property ID. Link the originating selected listing through provenance.
  Tests must expose Santana's property-vs-listing difference and reject duplicate property rows.
- Prepared evidence supplies an explicitly illustrative probability and typed reason facts for
  the labelled grouping. Values are labelled prepared, not measured or calibrated; the production
  score remains null. Include permitted facts and published-neighborhood disagreement without
  raw fingerprints/images/contact or denied text. This is DTO/example preparation, not matching.
- Attribute agreement includes property type. Add per-structured-feature agreement with reporting
  count and listing/source membership; missing reports do not prove feature absence. All counts
  and percentages are backend facts; the client only formats them.
- Merge/split payloads add dated `listingFacts` for every active listing involved (reuse validated
  `ListingFact`, anchored to the previous assignment). Validate exact active membership, complete
  unambiguous assignments, unchanged per-listing asking prices, and previous/resulting selected
  minima against these facts. Facts may precede event effective time, never follow it. An unchanged
  A→A assignment is valid when a property ID survives. Preserve cardinality/aggregate invariants
  and no-text event boundaries. Add valid retained-ID merge/split and impossible-minimum/selection
  regressions; extend strict recursive wire mutations to the new facts.
- Expand contract, adapter, actual HTTP and compiled Compose tests for the added shapes. Keep all
  earlier matrix coverage and commands. Correct the API reference to the full hierarchy and
  property-level reductions. Explain prepared evidence, percentages and feature reporting rules.
- Re-derive only the current story's code/tests/API documentation. Keep the plan, epic decisions
  and historical formatting repairs in place. Do not commit; independent parent verification and
  review still precede ordered commits.

Endpoint contract: GET `properties` (search), `properties/:id`, `listings/:id`, `places` (root
picker), `places/:id`, `places/:id/children`, `places/:id/largest-reductions`. Place IDs are stable
slugs; property/listing IDs are UUIDv7. DTOs include a shared `dataMode: synthetic-stub`, fixture
version and `asOf: 2026-10-01T12:00:00.000Z` metadata object. Preserve names in both locales;
numeric formatting belongs to web. Use null neighborhood comparison while market is absent.

Search query fields: `placeId`, `propertyType`, `minAskingPrice`, `maxAskingPrice`,
`minPricePerSquareMeter`, `maxPricePerSquareMeter` (all prices in centavos), `minArea`, `maxArea`,
`minBedrooms`, `minBathrooms`, `minParkingSpaces`, `timeOnMarket`, `priceReduced`, `returnedToMarket`,
`multipleListings`, `sort`, `pageSize`, `cursor`. Defaults: city scope, furthest-below-median sort,
20 rows. Four sorts: `furthest-below-median`, `lowest-price-per-square-meter`, `longest-on-market`,
`most-recent`. Time bands: `up-to-30`, `31-to-90`, `over-90`, `over-180`. Boolean flags accept only
true/false, combine AND; ranges inclusive, numbers finite/bounded; room minima accept nonnegative
integers. Public property types: apartment/house/studio/commercial/land/condominium/other. Paging
binds normalized query/sort and uses deterministic ID ties. Reductions accept pageSize/cursor and
rank latest recorded price drop through asOf, descending percentage then ID. Zero-result median
is null; below-median deviation uses the whole matching set, not current page.

Property detail represents canonical summary/nullable attributes and per-source agreement,
lowest active price with originating listing provenance, explicit `sale: not-recorded`, dated
previous/current price changes, listing lifelines, prepared evidence (explicit fixture label), and
first/last collection. Listing detail represents source stable identity/label/URL, position/status,
run/snapshot ID/content hash/count, snapshot availability, per-field effective dates, five typed
history variants, asking-price-per-m² formula and permission-discriminated descriptions/versions.
Do not embed text in generic history when permission is denied. Supplementary denial/expiry/no-active
examples are clearly separate test fixtures; keep authoritative five-property dataset intact.

Event vocabulary: `properties.listing.created`, `.price-changed`, `.description-changed`, `.removed`,
`.reappeared`; `properties.property.asking-price-changed`, `.merged`, `.split`. All v1 with positive
revision and effective observation time. Listing events carry canonical dated identity/source/place/
area/current-status/price facts plus snapshot/run/hash provenance; price changes carry prior price,
description changes carry before/after hashes only. Property price changes carry previous/current
minimum (nullable with no active listings), selected listing/source provenance and active listing IDs.
Merge/split carry previous/resulting property facts and explicit listing from/to assignments, with
consistent IDs and no duplicate/ambiguous assignments. Removal is not suppression or sale; no match
weights/calibration/match events are introduced. Immutable typed parsers enforce payload invariants
and the existing envelope/trace rules; event delivery/reordering is deferred, not assumed ordered.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all workspace checks pass.
- `pnpm run test:coverage` — preserve 80% statement/line/function and 75% branch workspace floors.
- `pnpm run test:integration:properties` — compiled real API/Compose journey and every HTTP matrix
  branch pass; isolated synthetic-only services are torn down by exact project scope.
- `pnpm exec prettier --check <changed supported files>` and `pnpm exec markdownlint-cli2 --no-globs
<changed Markdown files>` — formatting/doc rules pass without including rendered snapshots.
- `pnpm exec lefthook run pre-commit --all-files` and `git diff --check` — original hooks and whitespace
  gates pass. Do not commit; parent handles review and ordered commits after independent verification.

### Executed results — 2026-10-10

- Final source state: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` and `pnpm run build`
  passed. All 995 tests passed across eight workspaces. The existing web build warns about its
  536.96 kB CityScene chunk; frontend code and its warning threshold were not changed.
- `pnpm run test:coverage` passed every unchanged workspace threshold. Percentages below are
  statements / branches / functions / lines:
  - AI: 100 / 100 / 100 / 100; web: 100 / 100 / 100 / 100.
  - Contracts: 97.87 / 96.92 / 100 / 100; domain: 93.70 / 89.57 / 100 / 94.36.
  - Application: 90.41 / 85.44 / 97.91 / 91.87.
  - Infrastructure: 87.96 / 81.35 / 93.27 / 90.55.
  - API: 96.05 / 90.56 / 100 / 95.74; worker: 94.42 / 84.64 / 92.13 / 95.85.
- The final `pnpm run test:integration:properties` campaign passed 110 real HTTP requests against
  the compiled production API. Collection run/raw-object and outbox counts were unchanged before
  and after the read journey. Exact project `rei-properties-1641546-e47acb43` was torn down; scoped
  container and volume checks returned no resources. No sources were enabled or events published.
- Changed supported files passed Prettier; the README, API reference and story plan passed
  Markdownlint; `git diff --check` passed. The expired supplementary fixture was tightened to one
  historical observation, with matching snapshot, provenance, description and field-effective dates.
- The all-files pre-commit expansion **did not pass**: Markdownlint found 90 pre-existing MD013
  violations in two platform-baseline plans, while secrets, shell, Dockerfile, ESLint and Prettier
  checks passed. `story-event-tracer-from-a-request-to-the-audit-log-plan.md` has 40 violations
  (first: line 31, column 101, length 348); `story-shared-kernel-of-the-four-packages-plan.md` has
  50 (first: line 29, column 101, length 293). Both live under
  `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/`. Unrelated formatting
  performed by the hook was restored and its automatic staging was undone without losing changes.
  Rules and unrelated plans were not weakened or rewritten. Parent verification will establish
  baseline evidence and run the actual pre-commit hook on the complete staged story diff.

Implementation is handed off uncommitted for independent verification/review; story status remains
in progress. Synthetic-only storage, absent market comparison, absent event emission and absent
matching/calibration are intentional boundaries of this plan, not implemented production behavior.

### Independent verification — 2026-10-10

- The parent read the complete staged implementation diff and independently ran the full lint,
  typecheck, test and build gate successfully (995 tests), plus coverage with unchanged floors.
- The compiled Compose journey independently passed 110 HTTP requests under isolated project
  `rei-properties-1646921-5c99f674`, leaving collection and outbox counts unchanged and cleaning up.
- A verbose rerun of the production HTTP test file passed all 78 cases. The parent audited all
  ten matrix rows against the executed HTTP, adapter, contract and event tests; none is skipped.
- The original all-files pre-commit hook now passes without suppressions or rule changes. Two
  historical platform plans were mechanically soft-wrapped; normalized intent text is preserved.
  Their long shared-kernel test command moved to an equivalent fenced shell block. This closes
  the historical formatting failure recorded above rather than narrowing the verification scope.
- The synthetic integration connection is built with the standard URL API from the same explicit
  fixture configuration as Compose; no credential-bearing URI literal is committed or logged.
- Acceptance remains subject to independent review. In particular, compare the public shapes
  with the full place hierarchy/block metadata in D-020 and CAP-3, prepared evidence of CAP-7,
  and property-level reduction rows required by the Place overview. Passing fixture tests alone
  do not establish these wider contract requirements.

### D-021 repair implementation and verification — 2026-10-10

- Re-derived the current story only, retaining the amended plan, epic decisions and historical
  formatting repairs. Place contracts and adapters now expose country → state → city → zone →
  neighborhood → fictional street-block, block coordinates/range/prepared origin, six-level
  property/listing crumbs and descendant scopes. Supplementary examples remain outside counts.
- Added signed backend price-history percentages. Reductions now select one latest negative
  property-minimum change through `asOf`, ranked by percentage then property ID, with its selected
  originating listing. The fixture correctly has four reduction rows: Vila Mariana's removal and
  reappearance change its property minimum; Santana's minimum change differs from its listing drop.
- Prepared evidence now has an explicitly uncalibrated illustrative probability and closed typed
  permitted attribute/feature/neighborhood-disagreement reasons. Production score stays null.
  Source agreement includes property type; feature agreement counts only reporting listings and
  includes listing/source membership. Missing reporting never establishes feature absence.
- Merge/split payloads now carry dated active `listingFacts` anchored to previous membership.
  Parsers enforce exact assignments, unchanged facts, complete membership, true previous/resulting
  minima and selected provenance. Retained A→A IDs and prior observations are valid; impossible
  79m minima for 80m/78m facts, contradictory selections and future facts are rejected.
- The documentation-writer reference now describes all repaired public shapes and the property
  reduction semantics. No production matching, geocoding, market median, persistence, ingestion,
  source activation, event publication, shared fixture mutation or frontend change was introduced.

Executed repair checks:

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed, with 1,006 tests:
  AI 9, web 14, contracts 29, domain 268, application 96, infrastructure 296, API 105, worker 189.
  The existing 536.96 kB web CityScene chunk warning is unchanged.
- `pnpm run test:coverage` passed unchanged floors. Statements / branches / functions / lines:
  - AI and web: 100 / 100 / 100 / 100.
  - Contracts: 97.93 / 97.01 / 100 / 100; domain: 93.83 / 89.85 / 100 / 94.47.
  - Application: 90.41 / 85.44 / 97.91 / 91.87.
  - Infrastructure: 88.16 / 81.50 / 93.49 / 90.70.
  - API: 96.05 / 90.56 / 100 / 95.74; worker: 94.42 / 84.64 / 92.13 / 95.85.
- `pnpm run test:integration:properties` passed 134 real HTTP requests against the compiled
  production API, including the repaired hierarchy/evidence/reduction shapes and cursor chain.
  Collection run/raw-object and outbox counts were unchanged. Exact isolated Compose project
  `rei-properties-1662953-2cb87ebb` was torn down; scoped container and volume checks found nothing.
  No sources were enabled or events published. The campaign retains every earlier HTTP matrix
  branch, including filtering, empty/error paths, permission denial and expired snapshots.
- Changed supported files passed Prettier. README, API reference and this plan passed Markdownlint;
  `git diff --check` passed. The unchanged all-files pre-commit hook passed secrets, shell,
  Dockerfile, ESLint, Prettier and Markdownlint using an isolated index containing all story files.
  The parent's existing staged index was preserved; no hook rules, floors or tests were relaxed.

Repair matrix mapping (all named tests were executed through the passing repository suite):

- Read journey: actual production-module HTTP tests and location adapter tests cover the complete
  six-level picker/crumbs, fictional metadata, descendant scope and grouped property/listing IDs.
- Filtering and sorts: property adapter and real HTTP filter/sort tables retain all inclusive
  filters, AND history flags, four sorts, matching-set medians/counts and null market comparisons.
- Paging: adapter tests cover property ID reduction ties and future-change exclusion; real HTTP
  tests traverse four property reductions with pageSize=1, retaining all search cursor regressions.
- Empty/missing values: adapter/HTTP tests retain empty pages, null medians/attributes/no-active
  examples, no recorded sale, and feature agreement explicitly tests one reporter out of three.
- Malformed request: the full raw-query/path error table still passes; contract tests add strict
  recursive block/coordinate, percentage, evidence-reason and feature-membership wire mutations.
- Unknown resources: real HTTP unknown UUID/place and unprefixed path tests retain sanitized
  404 envelopes and fresh request identifiers.
- History: adapter/HTTP tests verify signed property price history, four distinct reduction rows,
  Santana's property-versus-listing drop, Vila Mariana lifelines and asking-not-sale provenance.
- Text rights: adapter/HTTP denied-description leak assertions remain; typed evidence permits
  structured facts only and rejects private reason fields without inferring missing permissions.
- Snapshot expiry: adapter/HTTP expiry tests preserve hash/run/dates and explicit unavailability.
- Event wire boundary: all eight immutable event round trips and recursive mutation tests pass,
  extended with dated listing facts, retained-ID merge/split, empty previous property, mixed-price
  valid minima and contradictory minimum/selection/assignment/provenance/date cases.

Story status remains in progress and all work remains uncommitted for independent parent review.

### Independent repair verification — 2026-10-10

- The parent read all 6,459 lines of the repaired staged diff and independently passed the full
  lint, typecheck, test and build gate: 1,006 tests across eight workspaces, with no skipped tests.
- Coverage independently passed all unchanged floors, with the same repair percentages above.
- The compiled Compose campaign independently passed 134 real HTTP requests under exact project
  `rei-properties-1667125-07f6d50c`. Collection and outbox counts were unchanged; scoped container
  and volume checks returned no resources after teardown.
- The parent additionally reran the production HTTP, properties-event, both synthetic adapter
  and both read-contract test files with verbose reporting. Every matrix row has executed passing
  coverage, including all seven D-021 repairs, negative wire mutations and privacy/error branches.
- Changed-file Prettier, five-file Markdownlint, whitespace checks and the original all-files
  pre-commit hook independently passed. No hook, coverage floor, authoritative fixture, dependency
  or frontend was changed. The existing CityScene chunk warning remains non-fatal and unchanged.
- The complete repaired change is now submitted to a context-free Quick review. Its outcome,
  individual finding verdicts and final disposition will be appended below before finalization.

### Independent post-patch verification — 2026-10-10

- Full lint, typecheck, test and build passed again: 1,030 tests (API 129, including 104 in
  the production read HTTP file; all other workspace counts unchanged). No tests were skipped.
- Coverage passed all unchanged workspace floors. Changed-file Prettier, six-file Markdownlint,
  the original all-files pre-commit hook and whitespace checks also passed.
- The compiled API now rejects the three reported precision inputs and both area-boundary inputs
  with 400. Production HTTP and Compose regressions cover twelve invalid precision inputs and
  twelve valid boundaries, including accepted integer trailing-zero forms.
- The final Compose campaign passed 158 real HTTP requests under exact isolated project
  `rei-properties-1676135-2840b3c0`. Collection and outbox counts remained unchanged; teardown
  left no scoped containers or volumes. No source activation or event publication occurred.
- The parent read the complete initial repaired diff plus every post-review source/test delta,
  and refreshed the full unified diff after applying the patch. All ten intent matrix rows retain
  passing executed evidence. The earlier 995/1,006-test and 110/134-request entries are historical
  observations, not claims about the final tree.

## Auto Run Result

- Final status: `built`. Seven versioned read endpoint families, six place levels, deterministic
  synthetic property/listing views, strict public wire shapes and eight immutable v1 event
  contracts are implemented. Production ingestion, matching and persistence are not claimed.
- Review outcome: pass 1's seven findings were resolved through the D-021 rederivation, including
  the retained-ID correction. Pass 2 reported one medium finding, resolved by a private raw-query
  parsing patch and targeted regressions. No finding is silently omitted, rejected or deferred.
- Current-pass patched entry counts: high 0, medium 1, low 0. Follow-up review recommendation:
  `false`; no high entry or two-medium threshold was reached, and no specific unverified patch
  risk remains. The recorded review repair loop count stays at 1.
- Verification: full repository gates and unchanged coverage floors passed; the final isolated
  compiled-API journey passed 158 requests; formatting, original hooks and whitespace passed.
- Commit disposition: implementation, tests, historical Markdown formatting, then documentation,
  using English Conventional Commits without scopes or co-author trailers. No push.
- Residual boundaries: synthetic-only fixtures and prepared uncalibrated evidence; no production
  market comparison, geocoding, source activation, event emission or database writes. The existing
  non-fatal CityScene chunk warning is unchanged. Production/VPS-dependent work remains reserved
  for the owner; it is not required for this local story.

Files changed:

| File                                                                                                                                 | Change                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `apps/api/src/http/read-query.ts`                                                                                                    | Validate raw queries, IDs and domain errors without numeric precision bypasses.          |
| `apps/api/src/http/unprefixed-read-paths.ts`                                                                                         | Keep unmatched read-family paths in the sanitized JSON error envelope.                   |
| `apps/api/src/locations/index.ts`                                                                                                    | Export context-owned symbols through the legal public barrel.                            |
| `apps/api/src/locations/locations.controller.ts`                                                                                     | Serve the versioned read endpoints through public facades and strict response parsers.   |
| `apps/api/src/properties/index.ts`                                                                                                   | Export context-owned symbols through the legal public barrel.                            |
| `apps/api/src/properties/properties.controller.ts`                                                                                   | Serve the versioned read endpoints through public facades and strict response parsers.   |
| `packages/application/src/locations/index.ts`                                                                                        | Export context-owned symbols through the legal public barrel.                            |
| `packages/application/src/locations/locations.facade.ts`                                                                             | Declare the public application-owned read port and injection token.                      |
| `packages/application/src/properties/index.ts`                                                                                       | Export context-owned symbols through the legal public barrel.                            |
| `packages/application/src/properties/properties.facade.ts`                                                                           | Declare the public application-owned read port and injection token.                      |
| `packages/contracts/src/locations/locations.read.dto.ts`                                                                             | Strictly parse dependency-free JSON response shapes.                                     |
| `packages/contracts/src/locations/locations.read.types.ts`                                                                           | Define context-owned, inward-independent read models and explicit nullable states.       |
| `packages/contracts/src/properties/properties.read.dto.ts`                                                                           | Strictly parse dependency-free JSON response shapes.                                     |
| `packages/contracts/src/properties/properties.read.types.ts`                                                                         | Define context-owned, inward-independent read models and explicit nullable states.       |
| `packages/contracts/src/shared/wire.ts`                                                                                              | Provide framework-neutral strict JSON shape helpers.                                     |
| `packages/domain/src/locations/index.ts`                                                                                             | Export context-owned symbols through the legal public barrel.                            |
| `packages/domain/src/locations/locations.read.types.ts`                                                                              | Define context-owned, inward-independent read models and explicit nullable states.       |
| `packages/domain/src/properties/index.ts`                                                                                            | Export context-owned symbols through the legal public barrel.                            |
| `packages/domain/src/properties/properties.events.ts`                                                                                | Define eight immutable, strictly validated v1 listing/property events.                   |
| `packages/domain/src/properties/properties.read.types.ts`                                                                            | Define context-owned, inward-independent read models and explicit nullable states.       |
| `packages/infrastructure/src/locations/index.ts`                                                                                     | Export context-owned symbols through the legal public barrel.                            |
| `packages/infrastructure/src/locations/synthetic-locations.adapter.ts`                                                               | Implement fresh read-only synthetic views with deterministic scope and paging semantics. |
| `packages/infrastructure/src/properties/index.ts`                                                                                    | Export context-owned symbols through the legal public barrel.                            |
| `packages/infrastructure/src/properties/synthetic-properties.adapter.ts`                                                             | Implement fresh read-only synthetic views with deterministic scope and paging semantics. |
| `packages/infrastructure/src/properties/synthetic-properties.projection.ts`                                                          | Project fixed replay histories, minima, rights, provenance and prepared evidence.        |
| `apps/api/src/locations/locations.module.ts`                                                                                         | Wire production controllers and synthetic facade providers.                              |
| `apps/api/src/properties/properties.module.ts`                                                                                       | Wire production controllers and synthetic facade providers.                              |
| `package.json`                                                                                                                       | Expose the isolated properties integration campaign script.                              |
| `packages/application/src/index.ts`                                                                                                  | Export context-owned symbols through the legal public barrel.                            |
| `packages/contracts/src/locations/index.ts`                                                                                          | Export context-owned symbols through the legal public barrel.                            |
| `packages/contracts/src/properties/index.ts`                                                                                         | Export context-owned symbols through the legal public barrel.                            |
| `packages/domain/src/index.ts`                                                                                                       | Export context-owned symbols through the legal public barrel.                            |
| `packages/infrastructure/src/index.ts`                                                                                               | Export context-owned symbols through the legal public barrel.                            |
| `apps/api/src/properties/properties.controller.test.ts`                                                                              | Verify 104 production-module HTTP cases, including numeric precision and privacy errors. |
| `integration/properties-contracts.integration.mjs`                                                                                   | Exercise 158 real HTTP requests against an isolated compiled Compose API.                |
| `packages/contracts/src/locations/locations.read.dto.test.ts`                                                                        | Exercise valid read JSON and recursive closed-shape wire mutations.                      |
| `packages/contracts/src/properties/properties.read.dto.test.ts`                                                                      | Exercise valid read JSON and recursive closed-shape wire mutations.                      |
| `packages/domain/src/properties/properties.events.test.ts`                                                                           | Exercise immutable event round trips, membership, minima, dates and malformed payloads.  |
| `packages/infrastructure/src/locations/synthetic-locations.adapter.test.ts`                                                          | Verify deterministic fixture reads, hierarchy, filtering, paging and protected branches. |
| `packages/infrastructure/src/properties/synthetic-properties.adapter.test.ts`                                                        | Verify deterministic fixture reads, hierarchy, filtering, paging and protected branches. |
| `_bmad-output/initiative-real-estate-intelligence/epic-properties/story-properties-contracts-and-stub-endpoints-plan.md`             | Record frozen intent, implementation, verification, review triage and built outcome.     |
| `docs/api/properties-and-locations.md`                                                                                               | Document endpoints, query semantics, wire shapes, fixtures and stub limitations.         |
| `README.md`                                                                                                                          | Link the public read reference and isolated integration command.                         |
| `_bmad-output/initiative-real-estate-intelligence/epic-properties/epic-properties.md`                                                | Mirror the owner-delegated D-021 contract repair decision in English.                    |
| `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-event-tracer-from-a-request-to-the-audit-log-plan.md` | Mechanically wrap historical Markdown without changing its intent.                       |
| `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-shared-kernel-of-the-four-packages-plan.md`           | Mechanically wrap historical Markdown without changing its intent.                       |
