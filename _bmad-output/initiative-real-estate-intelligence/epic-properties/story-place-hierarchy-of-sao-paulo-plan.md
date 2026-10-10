---
title: 'Place hierarchy of São Paulo'
type: 'feature'
ticket: '3'
created: '2026-10-10'
status: 'built'
baseline_revision: 'ddaf51ae2c08bb560b87d154f08d100e94d89a07'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 1
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md
  - /workspace/.claude/skills/nestjs-modular-monolith/SKILL.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ticket 3.3 requires a persisted six-level Locations hierarchy, registered
neighborhood-zone mapping and adjacency, published-address resolution, and real `/api/v1`
place/picker/crumb reads. Production currently uses only an in-memory prepared adapter.

**Approach:** Persist the owned synthetic reference and expose it through a small Locations
query port/service/facade. Replace API and worker wiring, preserving frozen read and Collection
contracts, old prepared projections and immutable property place snapshots. D-024 and D-025
settle missing-number and intentional fixture-disagreement semantics before implementation.

## Boundaries & Constraints

**Always:** Read and follow `nestjs-modular-monolith`, with accepted SQL/Vitest/flat-layout/public
facade ADRs overriding its ORM/Nx/Jest conventions as D-012 already records. Inward dependencies,
SQL only in Locations, no foreign schema joins/FKs, parameterized queries, PostgreSQL UUIDv7
internal IDs and separately unique stable public IDs. Preserve original eighteen places and their
order, names, ranges, coordinates and counts; append two explicitly fictional blocks. All outputs
retain honest synthetic-stub/prepared-fixture metadata. Query inputs never persist. Repository
content is English; use pnpm/apply_patch, existing coverage floors/hooks and isolated real services.

**Never:** Read/search/edit `.env*`, access VPS, push, commit or enable real sources. No geocoder,
PostGIS, geometry, model, measured-coordinate inference, fuzzy matching, personal/unit/complement
storage, public mutation, new business events or dependencies. Do not change Collection v1/v2,
the synthetic catalog/labels, matching, history, persisted search/counts/reductions or UI. Never
rewrite old five-crumb snapshots or return a memory fallback on database failure.

## I/O & Edge-Case Matrix

| Scenario            | Input / State                                                             | Expected Output / Behavior                                                    | Error Handling                                            |
| ------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| Picker              | Persisted original eighteen plus two supplementary places                 | Stable six levels, bilingual crumbs, existing counts and registered adjacency | Unknown ID is null/HTTP 404; invalid ID/query is HTTP 400 |
| Catalog addresses   | Nine immutable published locations plus SYN-SP-0001                       | Exactly one correct street block and six crumbs, including zone               | Never use matching labels to correct published geography  |
| Published number    | Registered street, optional integer number                                | Inclusive matching range; numberless query only if one block                  | Outside, ambiguous or unknown returns null                |
| Input safety        | Extra unit/complement, unsafe/noninteger/negative number, malformed names | Reject before I/O, no stored query or privacy field                           | Domain validation error; no raw input logging             |
| Normalization       | Accents, case, repeated spaces, explicit Rua/R. and Avenida/Av. aliases   | Deterministic equality, same registered place                                 | No substring/fuzzy guess                                  |
| Ambiguity           | Multiple blocks on same normalized street                                 | With number resolve one only; without number return null                      | Never arbitrary first result                              |
| Coordinates         | Existing prepared points; supplementary blocks                            | Preserve original labeled coordinates; supplementary null                     | Never synthesize new coordinates                          |
| Integrity           | Invalid hierarchy, range, coordinate pair or adjacency                    | Database constraints prevent corrupt reference                                | Transaction fails; no cross-schema writes                 |
| Durability          | Migration replay and API/worker restart                                   | Stable public and internal IDs; no duplicate seed; same HTTP                  | No silent in-memory fallback                              |
| Existing ingestion  | New tracer received vs previously stored view                             | New view uses Avenida block; existing snapshot remains unchanged              | Unknown published address still refuses atomically        |
| Prepared properties | Search and reductions for old/new blocks                                  | Existing five-property projection unchanged; supplementary empty/count zero   | Existing strict cursor/query validation remains effective |

</intent-contract>

## Code Map

- `packages/domain/src/locations/locations.read.types.ts` already defines six kinds, bilingual
  PlaceRef/Detail, nullable coordinates, prepared block range and synthetic metadata. Add flat
  `place.entity.ts` and `published-address.ts` for owned hierarchy/range/query invariants and
  normalization; context/root public exports. No framework/Collection dependency in these rules.
- `packages/application/src/locations/locations.facade.ts` has resolveFixtureAddress, roots,
  getPlace and children. Keep them; add resolvePublishedAddress with a Locations-owned structural
  query DTO and optional number. Existing getPlace exposes registered adjacentPlaceIds, so no
  extra adjacency HTTP route is required. Add `place.repository.ts` read port and
  `locations-query.service.ts`; the facade delegates rather than computes business rules.
- Transactional ingestion must pass its existing opaque application Transaction to the Locations
  fixture resolver. Add an optional Transaction argument to that internal facade method, preserving
  all existing one-argument callers and frozen HTTP/Collection contracts. The PostgreSQL facade
  must resolve through postgresClientFor on the same active, owner-checked lease: never acquire a
  second pool connection while the caller holds a transaction. Nontransactional published-address
  and picker reads keep the bounded pool. No ambient transaction context, foreign-schema SQL,
  separate pool or lowered concurrency limit. Update ConsumeParsedListing and its regression tests
  to prove evidence verification precedes resolution and the exact scope is forwarded.
- `packages/infrastructure/src/locations/synthetic-locations.adapter.ts` owns original18 fixture
  helpers. Keep prepared projection compatibility, especially syntheticPlaces length18 and old
  fixtures. Add an explicit supplementary reference helper for the two new IDs when needed by
  prepared reduction validation; do not assign either any existing prepared property.
- `migrations/5001_locations_create_place_hierarchy.sql` is the first Locations migration.
  Schema allocation 5000–5999 is enforced by `scripts/check-migration-conventions.mjs`. Seed only
  the original reference and supplementary blocks; internal parent FKs only. Migration replay
  must preserve IDs through existing migration runner behavior. Explicit own-schema SQL constraints
  enforce parent sequence, block ranges, coordinate pairs, valid adjacency and no cycles.
- SQL name and street checks must reject every whitespace-only value that JavaScript trim rejects,
  including tabs, line breaks and Unicode whitespace. Preserve the existing 200-character limit.
  Cover invalid English/Portuguese/street names with real rollback-scoped SQL writes and valid reads.
- `packages/infrastructure/src/locations/postgres-place.repository.ts` and
  `postgres-locations.facade.ts`: reuse shared DatabaseConnection and bounded pool/query timeouts;
  return canonical data without SDK types. Only parameterized Locations queries, stable sibling
  ordering and detached output data. Propagate redacted database failures; no fallback cache.
- `apps/api/src/locations/locations.module.ts`: currently SyntheticLocationsAdapter and imports
  Properties for controller reductions. Use API `persistence/persistence.module.ts` public token.
  API Properties must not import Locations: persisted detail already uses stored place snapshots.
  Worker `apps/worker/src/locations/locations.module.ts` uses its `../persistence.module` token;
  worker Properties already imports Locations safely. No forwardRef or broker consumer changes.
- `packages/infrastructure/src/properties/synthetic-properties.adapter.ts`: search prepared counts
  use original eighteen fixtures; reduction validation currently only knows those IDs. Recognize
  the two supplementary registered fictional IDs via a public reference helper and return valid
  empty reductions, preserving strict query/cursor validation and all existing five-property rows.
- `apps/api/src/properties/properties.controller.test.ts` currently fakes all database queries as
  empty; override Locations facade explicitly after production provider replacement so unit HTTP
  remains isolated. Other current LocationsFacade fakes must implement the added query method.
- `integration/properties-contracts.integration.mjs`: original 158 actual HTTP requests select
  blocks by ID, not exact neighborhood child count. Keep all assertions. In
  `integration/properties-ingestion.integration.mjs` around298, new tracer currently asserts
  neighborhood; strengthen it to its own Avenida block and all six crumbs.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/locations/{place.entity,published-address}.ts`, adjacent tests and
      public indexes — first write failing tests for hierarchy, privacy, normalization, integer
      inclusive range and uniqueness; implement minimal pure rules and immutable canonical values.
- [x] `packages/application/src/locations/{place.repository,locations-query.service,locations.facade}.ts`
      and adjacent tests — add read-only query ports and delegate facade capabilities; use fakes
      to prove every matrix row, all ten published fixture addresses and ambiguity/error behavior.
- [x] `packages/application/src/properties/consume-parsed-listing.service.ts`, its tests and the
      Locations facade — forward the existing opaque transaction after Collection evidence verifies;
      resolve on the same owner-checked lease and preserve every ingestion order/atomicity assertion.
- [x] `migrations/5001_locations_create_place_hierarchy.sql` — create owned relational reference,
      constraints and exactly twenty-place seed. Verify with real PostgreSQL, not only SQL mocks.
- [x] `packages/infrastructure/src/locations/{postgres-place.repository,postgres-locations.facade}.ts`,
      adjacent tests and indexes — canonical SQL hydration, all ancestors and registered adjacency,
      stable ordering, optional-number candidate lookup and fail-closed reads. Preserve original
      fixtures; add supplemental reference helper and minimal Properties adapter recognition/tests.
- [x] `apps/{api,worker}/src/locations/locations.module.ts`, API Locations adjacent HTTP test and
      affected fake tests — wire persistence through proper public DI exports. Test actual Nest HTTP
      serialization/strict parsers, old/new place IDs, leaf/missing/invalid requests, unprefixed paths
      and reductions. Do not introduce an API module cycle or rewrite existing property snapshots.
- [x] `integration/locations.integration.mjs`, `package.json` and
      `integration/properties-ingestion.integration.mjs` — add test:integration:locations isolated
      real PostgreSQL/API migration/restart/constraints/resolver/picker campaign; production ingest
      journey proves new block through real RabbitMQ worker and actual Property/Listing HTTP.
      Cover every fixture address via real SQL facade and observable returned block GETs. Preserve
      original prepared campaign, all ingestion rollback/idempotency/rights cases and exact cleanup.
- [x] Add unit scope-forwarding/foreign-inactive-scope tests and real PostgreSQL regressions that
      hold all ten production pool leases concurrently and resolve each address inside that same
      transaction. Synchronize entry before resolving so the old implementation deterministically
      exhausts the pool. Run at least ten concurrent resolutions, all successful without a second
      checkout, retained query/operation deadlines or altered pool/concurrency configuration.
      Reject tab/newline/Unicode-whitespace-only English, Portuguese and street names in real SQL.
- [x] `docs/api/properties-and-locations.md`, `migrations/README.md`, README and this plan — use
      documentation-writer reference style to document persisted geography versus prepared counts,
      aliases, optional published numbers, supplemental geography, current limits and executed
      verification. Append evidence; leave changes uncommitted for parent review/auto-commit.

**Acceptance Criteria:**

- Given an isolated migrated real PostgreSQL/API stack, when an HTTP client traverses roots,
  state, city, five zones, neighborhoods and each block through `/api/v1/places`, then all twenty
  places validate frozen contracts, with correct six-level crumbs, unchanged old IDs/metadata,
  registered symmetric neighborhood adjacency and honest prepared/null coordinates.
- Given each of the ten canonical published fixture addresses and a real SQL-backed facade,
  when resolution runs and the returned block is fetched through actual HTTP, then its street,
  neighborhood and zone match the published input, including COBALTO's Vila Mariana disagreement;
  number boundaries and absent/ambiguous/outside-range cases behave as specified without storage.
- Given a genuinely collected new SYN-SP-0001 observation, when production RabbitMQ/worker ingests
  it and clients GET Property and Listing, then both show the distinct Avenida Exemplo block and
  six crumbs with original provenance, while replay/restart leaves IDs and initial state stable.
- Given an existing property with a five-crumb historical reference, when the new location service
  reads/ingests and the API restarts, then that stored initial reference is not rewritten or rejected.
- Given invalid reference writes and migration replay, when the real database constraints and
  runner execute, then malformed parents/ranges/coordinates/adjacency fail, twenty valid places and
  stable UUIDv7/public IDs remain, and schema/query data contains no unit or complement fields.
- Given all old prepared reads and supplementary blocks, when real HTTP search/reductions/picker
  requests and repository gates run, then old assertions pass, new blocks have empty prepared rows,
  coverage floors/hooks remain unchanged and exact campaign resources are cleaned.

## Implementation Notes

- Added immutable Locations values and a strict street-level allowlisted query. Validation is
  performed before repository I/O, with deterministic accent/case/space and explicit street-prefix
  normalization, optional nonnegative safe-integer number selection and ambiguity returning null.
- Added an application-owned read port and query service; production API and worker Locations
  facades now use PostgreSQL through their respective public persistence modules. SQL uses only
  the owned schema, parameterized lookup values, ordered complete ancestor hydration and registered
  undirected adjacency. Persistence failures propagate without a memory fallback.
- The migration seeds twenty UUIDv7-backed places while keeping the original eighteen public
  references exact. Composite parent-kind foreign keys plus strictly descending levels prevent
  cycles; undirected neighborhood edges prevent asymmetric/self/duplicate registration. Block
  ranges use numeric values with integer checks so PostgreSQL cannot round fractional writes into
  apparently valid integers. Supplementary prepared blocks retain null coordinates and zero counts.
- The original eighteen-place prepared helper and five-property projection are unchanged. A
  separate supplementary helper recognizes the two empty reduction scopes. The historical
  SyntheticLocationsAdapter resolver remains available only for isolated compatibility fixtures;
  production resolveFixtureAddress delegates to the new published-address query.
- The frozen ListingDetail contract has a PlaceRef but no breadcrumbs field. Ingestion evidence
  therefore checks the Listing's block ID, PropertySummary's six crumbs, and an actual GET of
  the Listing's referenced place. No field was added to frozen HTTP or Collection contracts.
- Updated the API reference, migration reference and README to distinguish persisted synthetic
  geography from prepared property counts/search/reductions and document aliases, optional
  numbers, privacy rejection, supplementary blocks and current synthetic-only limitations.
- Re-derived the implementation after review, preserving the prior accepted behavior. Initial
  ingestion now forwards its exact opaque transaction through Locations after Collection evidence
  verifies. Only the Locations SQL adapter unwraps it with `postgresClientFor`; active ownership
  checks, existing pool size, worker concurrency and database/operation deadlines remain intact.
- Added `locations.valid_reference_name` with the explicit ECMAScript trim whitespace set for
  both display names and street names, preserving the trimmed 1–200-character limit. Real writes
  reject tabs, line breaks, Unicode-only values and overlong names without retaining test changes.

### Execution evidence — 2026-10-10

- Read the complete plan and every frontmatter context file before implementation; applied
  NestJS modular-monolith guidance with the accepted flat-layout, explicit-SQL and Vitest ADRs.
  No dependencies, source catalog/labels, public mutation routes, new business events, UI changes,
  real-source processing, VPS access, push or commit were introduced.
- Initial domain tests failed for missing implementation as expected, then passed after the pure
  rules were added. An initial domain build exposed unavailable structuredClone in its configured
  library surface; detached domain copying now uses explicit canonical field copies. An initial
  workspace typecheck exposed a misplaced test import; it was corrected without changing APIs.
- The first SQL campaign caught PostgreSQL bigint coercion accepting a fractional boundary by
  rounding. Changed ranges to checked numeric values; the corrected real campaign passed all
  constraint, ambiguity and durability checks. Its owned project was cleaned after both attempts.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` passed. The final
  full unit suite contained 1,134 passing tests: domain 303, application 123, infrastructure 331,
  API 135, worker 190, contracts 29, web 14 and AI 9. The existing Vite CityScene chunk-size warning
  remains a warning; no frontend or build threshold was changed.
- `pnpm run test:coverage` passed all eight workspaces at the unchanged thresholds (80%
  statements/lines/functions, 75% branches). Infrastructure reported 88.61% statements, 82.30%
  branches, 93.19% functions and 90.98% lines; API 96.25% / 92% / 100% / 95.91%; worker
  94.45% / 84.64% / 92.24% / 95.87%. Three additional fixture-helper tests subsequently passed
  in the final infrastructure/full test runs without changing production behavior.
- `pnpm run test:integration:properties` passed the unchanged 158 actual HTTP requests, with
  Collection and outbox unchanged and exact campaign cleanup.
- `pnpm exec lefthook run pre-commit --all-files` passed all seven jobs; supported changed files
  were additionally formatted explicitly because new untracked files are not covered by the
  tracked all-files expansion. Changed documentation Markdownlint and git diff --check passed.
  The hook's existing stage_fixed behavior staged tracked changes; no commit was made.
- An initial strengthened ingestion assertion incorrectly accessed breadcrumbs on ListingDetail,
  which the frozen contract does not expose. The real worker had already produced the correct
  Avenida block. The assertion now verifies PropertySummary crumbs and the Listing's referenced
  place GET, preserving the contract; the corrected campaign is rerun below.
- Final `pnpm run test:integration:locations` passed 65 actual HTTP requests: all twenty stored
  places and ten published addresses, inclusive boundaries, no-number and overlapping ambiguity,
  invalid/private input, malformed SQL writes, UUIDv7/public-ID stability, migration replay, API
  restart and sanitized fail-closed reads. Exact project containers and volumes were removed.
- Corrected `pnpm run test:integration:properties-ingestion` passed genuine collection/evidence
  → RabbitMQ → production worker → strict Property/Listing/place HTTP with the Avenida block
  and six Property/place crumbs. A new authentic canonical observation was initially consumed
  using the historical resolver to establish a five-crumb compatibility fixture; production replay
  and API/worker restart retained its full original detail, IDs and provenance. All existing
  rollback/retry, concurrency/inbox expiry, pending-history/correction v1/v2, canonical mutation,
  denied/real/held authority, unknown address, current rights and prepared-isolation assertions
  passed. Project `rei-properties-ingestion-1789441-de8fb39d` cleaned exact containers and volumes.
- Final supported changed-file Prettier check, changed-documentation/plan Markdownlint, and both
  working-tree/index git diff --check passed. Implementation tasks are checked; frontmatter status
  remains in-progress for independent parent review and the separately authorized commit workflow.

### Independent parent verification — 2026-10-10

- Read the complete staged baseline diff, including all fourteen initially untracked files.
  Independently reran lint, typecheck, all 1,134 tests and build successfully. The pre-existing
  CityScene chunk warning is unchanged. All eight coverage gates passed with unchanged floors;
  an additional infrastructure Locations-only coverage run passed with 100% statements, branches,
  functions and lines (81/81, 49/49, 50/50 and 71/71), running all 331 infrastructure tests.
- Repeated all three isolated real-service journeys: Locations passed 65 HTTP requests and twenty
  places/ten addresses; ingestion passed the production broker/worker/detail path and historical
  five-crumb replay/restart; prepared Properties passed the unchanged 158 HTTP requests.
  Campaign projects `rei-locations-1802861-c6fa200a`,
  `rei-properties-ingestion-1806745-e810da22` and `rei-properties-1814962-0663e349` cleaned their
  owned containers and volumes. No VPS, real source, model call, push or deployment was used.
- Full original pre-commit hooks and supported-file Prettier passed. The first extra Markdown
  command accidentally included configured repository-wide globs, finding errors in local rendered
  workflow artifacts outside this change. Repeated the existing hook's --no-globs invocation on
  the five changed Markdown files: zero errors. No rule or ignored artifact was changed.
  Working-tree and staged whitespace checks passed.
- Matrix audit: all eleven rows have passing executed coverage. Picker and coordinates use
  production Locations HTTP plus complete real twenty-place traversal; catalog addresses use
  the ten application cases and ten real SQL/HTTP checks; numbers and normalization use the
  domain/application rules and real inclusive boundary/alias checks; input safety verifies
  rejection before I/O and real schema privacy; ambiguity uses application and transactional
  real SQL cases; integrity uses domain rejection and real PostgreSQL constraint failures;
  durability uses real migration replay/restart/fail-closed checks; existing ingestion uses
  genuine broker/worker six-crumb and historical five-crumb cases; prepared Properties uses
  supplementary empty/cursor tests and the unchanged 158-request campaign. Targeted verbose
  reruns confirmed 32 domain, 14 application and 13 infrastructure Locations tests passed,
  without skipped or filtered covering cases.

### Review repair execution evidence — 2026-10-10

- Read the full amended plan and every frontmatter context file before implementation. Restored
  the accepted hierarchy code/tests from the preserved read-only diff with `apply_patch`, keeping
  the existing documentation and plan changes, then implemented both amended repair requirements.
  The NestJS modular-monolith and documentation-writer guidance preserved public facade boundaries,
  explicit owned SQL, adjacent Vitest tests and concise reference documentation.
- The consumer regression failed because the resolver received `undefined` instead of the verified
  transaction. It passes after exact scope forwarding; evidence refusal proves no resolver call.
  Infrastructure regressions pass for existing-lease use, foreign/inactive/non-PostgreSQL scope
  rejection and redacted leased-query errors without pool fallback. Initial test harness issues
  (passing a class instance instead of wire data, stale application build output, an incorrect
  redaction expectation and an unused integration variable) were corrected without weakening checks.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` passed. All 1,137
  tests passed: domain 303, application 124, infrastructure 333, API 135, worker 190, contracts 29,
  web 14 and AI 9. The pre-existing CityScene chunk-size warning is unchanged. Final lint and both
  working-tree/index whitespace checks also passed after the integration/reference additions.
- `pnpm run test:coverage` passed all eight workspaces at the unchanged 80% statements, lines and
  functions / 75% branches floors. `pnpm exec lefthook run pre-commit --all-files` passed all seven
  original jobs. Supported changed files, including untracked implementation files, passed explicit
  Prettier checking; the five changed Markdown files passed Markdownlint with `--no-globs`.
  Existing hook `stage_fixed` behavior staged tracked files; no commit was made.
- `pnpm run test:integration:locations` passed 66 actual HTTP requests, twenty places and ten
  canonical addresses. A barrier held all ten production pool transaction leases before any of
  the ten fixture resolutions started; every lookup returned six crumbs through its existing
  scope. No pool, concurrency, query timeout or operation deadline configuration was changed.
  Real rollback-scoped SQL rejected each of the 25 ECMAScript trim characters and their combined
  whitespace string for English, Portuguese and street names (78 whitespace-only cases), rejected
  201-character values, and accepted/read valid trimmed 200-character values. Existing relational
  constraints, ambiguity, UUIDv7/public-ID stability, migration replay, restart and fail-closed
  checks passed. Project `rei-locations-1822908-b4409055` cleaned its exact containers and volumes.
- `pnpm run test:integration:properties` passed the unchanged 158 actual HTTP assertions with
  Collection/outbox unchanged. Project `rei-properties-1823291-9ee7ce3a` cleaned owned resources.
- `pnpm run test:integration:properties-ingestion` passed the genuine collection/evidence → broker
  → production worker → strict Property/Listing/place HTTP path with the Avenida block and six
  crumbs. Historical five-crumb replay/restart compatibility and every existing rollback/retry,
  concurrency/inbox expiry/restart, immutable pending v1/v2, authority/mutation/address rejection,
  current-rights and prepared-isolation case passed. Project
  `rei-properties-ingestion-1823292-0389eab9` cleaned its exact containers and volumes.
- Implementation tasks are checked. Frontmatter remains `in-progress` for independent parent
  verification/review and the separately authorized commit workflow. No VPS access, real source,
  model invocation, public mutation, new dependency, push or commit occurred.

### Independent parent repair verification — 2026-10-10

- Staged all 33 exact changed paths and independently read the complete baseline-relative diff,
  including newly added files. Rewrote and reread it after the final test-only correction.
  `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` and
  `pnpm run test:coverage` passed independently; all 1,137 tests and all eight unchanged coverage
  gates passed. The existing CityScene chunk-size warning remains unchanged.
- The original all-files hook initially rejected two literal fictional PostgreSQL credential
  URIs in an infrastructure test. The same implementer replaced only that fixture construction
  with URL username/password assignments; all six repository tests and the staged redacted
  scanner passed. No scanner rule, allowlist or hook was weakened. All seven original pre-commit
  jobs subsequently passed; explicit changed-file Prettier, five-file Markdownlint with
  `--no-globs`, and both working-tree/index whitespace checks also passed.
- Independent `test:integration:locations` passed 66 actual HTTP requests, twenty places and all
  ten canonical addresses, including ten simultaneous resolutions with every production pool
  lease already held. The real database rejected all 78 whitespace-only name/street cases and
  201-character names, accepted/read trimmed 200-character values, and passed integrity,
  ambiguity, migration replay, stable-ID, restart and fail-closed checks. Its exact project
  `rei-locations-1834450-717689c4` was cleaned.
- Independent `test:integration:properties-ingestion` passed genuine production collection,
  evidence, RabbitMQ, worker and Property/Listing/place HTTP; new six-crumb block resolution,
  historical five-crumb replay/restart, rollback/retry, concurrency/inbox expiry/restart,
  immutable pending v1/v2, authority/mutation/address rejection, current rights and prepared
  isolation all passed. Exact project `rei-properties-ingestion-1837956-81bdd301` was cleaned.
  Independent `test:integration:properties` retained all 158 actual HTTP assertions with
  Collection/outbox unchanged in exact project `rei-properties-1850273-3521f1a5`.
- All eleven intent-matrix rows have executed passing coverage: picker/coordinates/durability
  through real place HTTP and restart; ten catalog addresses, number boundaries, aliases and
  ambiguity through domain/application/real SQL; privacy before I/O through rejection tests;
  integrity through domain and real SQL constraints; new and historical ingestion through the
  production campaign; prepared isolation through unchanged HTTP and supplementary empty reads.
  Scope forwarding, evidence-before-resolution, foreign/inactive/wrong-kind rejection, leased
  error redaction without fallback, pool saturation and SQL/domain whitespace parity also passed.
- No VPS access, real source, model invocation, push or commit occurred. D-006 remains pending
  owner return; this iteration proceeds only with the independently verified local story.

## Plan Change Log

### 2026-10-10 — First review repair

- Trigger: the plan omitted transaction-aware Locations resolution when replacing the prepared
  adapter. The existing consumer owns a lease before resolution, the production pool has ten
  connections, and supported worker prefetch reaches 32. Independent review held ten BEGIN leases
  against real PostgreSQL and reproduced ten approximately two-second checkout failures; releasing
  those leases restored resolution. Parent tracing confirms the consumer call, provider, query
  checkout and configuration path. Re-derive with explicit opaque-scope forwarding and the existing
  owner/active-checked postgresClientFor seam, plus a synchronized saturation regression.
- Also address the verified SQL/domain whitespace mismatch during re-derivation: PostgreSQL trim
  admits a tab-only name, while Place rejects it and prevents reads. Require SQL checks matching
  JavaScript trim's whitespace-only rejection, including both names and street_name, with real tests.
- Known-bad states to avoid: a second checkout inside an existing transaction; increased pools,
  lowered concurrency or retries concealing starvation; a raw SQL client in application/domain;
  resolution before evidence verification; accepted whitespace-only reference values.
- KEEP: all twenty stable public/UUIDv7 places, original eighteen ordering/names/ranges/coordinates/
  counts, both supplemental empty blocks, published COBALTO disagreement, aliases/optional-number
  uniqueness, strict privacy, fail-closed reads, genuine historical five-crumb replay/restart, every
  prior atomicity/authority/rights case, prepared five-property behavior, docs and passing campaigns.
  The intent-contract and existing decisions remain unchanged. The reviewed attempted diff remains
  available at `/tmp/rei-story-3-3-PwD9QX.diff` for positive preservation. This is read-only repair
  evidence; use its known-good implementation/tests as appropriate, then satisfy the amended plan.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Transactional Locations lookup checks out a second pool connection —
    parent verified the same-pool provider, consumer's held lease, max ten and accepted prefetch 32;
    review's real PostgreSQL saturation failed all ten lookups until leases released. The plan
    lacked opaque-scope forwarding; amended Code Map/tasks for same owner-checked lease and a real
    synchronized regression. Code is re-derived without changing the intent-contract.
  - `[medium]` `[patch]` SQL permits whitespace-only reference names that domain hydration rejects —
    parent verified PostgreSQL trim versus JavaScript trim and the reachable Locations hydration;
    review committed a tab-only root name in real PostgreSQL and observed the domain rejection.
    The direct SQL predicate correction and real name/street regressions are included in the
    higher-precedence bad-plan re-derivation; no lower-priority standalone patch is applied first.

### 2026-10-10 — Review pass after repair

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free Quick reviewer read the amended plan/context, complete diff
  and surrounding persistence/contracts, and reran 124 targeted tests successfully. No unmet
  criterion, broken rule or actionable defect remained. Other lenses were skipped as configured.
- Current-pass patches: high 0, medium 0, low 0; deferred 0; rejected 0.
  The first pass's two verified medium findings were resolved by the recorded re-derivation.
  Follow-up review recommendation is false: this pass applied no patches and names no
  remaining unverified repair risk. The single deferred list remains empty.

## Design Notes

Full route: estimated 1,000–1,500 production lines plus similar tests across more than five
nonmechanical files. Raise ticket medium risk to high because a wrong geographic resolution
becomes immutable property provenance, can corrupt future matching and can leak unit-level data.
Owner decisions D-024/D-025 were recorded before implementation; D-006 keeps VPS work pending.

Original mapping: Bela Vista/Centro, Santana/Norte, Vila Mariana/Sul, Tatuapé/Leste, Pinheiros/Oeste.
Adjacency is the registered fixture Bela Vista ↔ Vila Mariana only, not inferred real geography.
Supplemental public IDs:
`sao-paulo-bela-vista-avenida-exemplo-fictional-block` and
`sao-paulo-vila-mariana-rua-cenario-um-fictional-block`. Both have prepared ranges 100–199, null
coordinates and zero prepared properties. Collection supplies no number; this does not claim 100.

Capability shape and golden assertions (existing canonical input is structurally compatible):

```ts
type PublishedAddress = Readonly<{
  city: string;
  stateCode: string;
  neighborhood: string;
  street: string;
  number?: number;
}>;
const address = {
  city: 'São Paulo',
  stateCode: 'SP',
  neighborhood: 'Bela Vista',
  street: 'Av. Exemplo',
};
expect((await locations.resolvePublishedAddress(address))?.place.id).toBe(
  'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
);
expect(await locations.resolvePublishedAddress({ ...address, number: 200 })).toBeNull();
```

Use exact allowlisted keys; reject unit/complement fields rather than silently stripping them.
Reject malformed structured street suffixes suggesting an appended number/unit rather than
extracting them heuristically. Number is separate optional query input, never newly added to a
strict Collection event. Seed/reference writes are deployment migrations, not business changes
requiring a fabricated PlaceCreated event. No collection model/geography fetch is authorized.

## Verification

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all pass.
- `pnpm run test:coverage` — unchanged 80% statements/lines/functions and 75% branches across workspaces.
- `pnpm run test:integration:locations` — real SQL constraints, all fixture resolutions and actual
  HTTP picker/crumbs/error/durability journey pass with exact project/container/volume cleanup.
- `pnpm run test:integration:properties-ingestion` — production collection → RabbitMQ → worker →
  strict detail HTTP now resolves new tracer block; all existing atomicity/negative/rights cases pass.
- `pnpm run test:integration:properties` — retain all existing 158 real HTTP prepared assertions.
- `pnpm exec lefthook run pre-commit --all-files`, supported-file Prettier, changed-Markdown
  Markdownlint and `git diff --check` — original hooks, formatting and whitespace pass.
- Parent independently inspects/verifies/reviews and makes ordered implementation/test/docs commits;
  implementer appends exact results and failed attempts, without committing or declaring done.

## Auto Run Result

Implemented the owned, SQL-backed twenty-place synthetic São Paulo hierarchy and deterministic
published-address resolution. API and worker use the persisted public facade; transactional
ingestion resolves through its existing verified lease. Original prepared geography/counts,
frozen Collection/HTTP contracts and immutable historical snapshots remain unchanged.

### Files changed

- `README.md` — describe persisted Locations and the isolated integration command.
- `epic-properties.md` — mirror owner-delegated D-024/D-025 hierarchy and fixture decisions.
- `story-place-hierarchy-of-sao-paulo-plan.md` — retain intent, amended plan, evidence and review outcome.
- `apps/api/src/locations/locations.controller.test.ts` — exercise strict HTTP place/picker/crumb reads.
- `apps/api/src/locations/locations.module.ts` — provide persisted Locations through shared persistence.
- `apps/api/src/properties/properties.controller.test.ts` —
  keep prepared Locations isolated in unit HTTP.
- `apps/worker/src/locations/locations.module.ts` — wire the worker to the persisted public facade.
- `docs/api/properties-and-locations.md` — document hierarchy, address rules and prepared-count limits.
- `integration/locations.integration.mjs` —
  verify real SQL/HTTP integrity, resolution, leases and durability.
- `integration/properties-ingestion.integration.mjs` —
  prove new block resolution and genuine historical replay.
- `migrations/5001_locations_create_place_hierarchy.sql` —
  create constrained owned tables and twenty-place seed.
- `migrations/README.md` — document Locations allocation, invariants and immutable seed semantics.
- `package.json` — register the isolated Locations integration campaign.
- `packages/application/src/locations/index.ts` — export Locations query service and read port.
- `packages/application/src/locations/locations-query.service.test.ts` —
  cover address, picker and privacy behavior.
- `packages/application/src/locations/locations-query.service.ts` —
  orchestrate read-only canonical queries.
- `packages/application/src/locations/locations.facade.ts` —
  expose published queries and opaque scope forwarding.
- `packages/application/src/locations/place.repository.ts` —
  define the framework-neutral owned read port.
- `packages/application/src/properties/consume-parsed-listing.service.test.ts` —
  prove evidence order and exact scope.
- `packages/application/src/properties/consume-parsed-listing.service.ts` —
  forward the verified transaction to Locations.
- `packages/domain/src/locations/index.ts` — export place invariants and published-address normalization.
- `packages/domain/src/locations/place.entity.test.ts` —
  cover hierarchy, range, coordinate and adjacency invariants.
- `packages/domain/src/locations/place.entity.ts` — validate and freeze canonical place reference values.
- `packages/domain/src/locations/published-address.test.ts` —
  cover deterministic aliases, numbers and private-input refusal.
- `packages/domain/src/locations/published-address.ts` —
  validate allowlisted published inputs and normalize exact lookup keys.
- `packages/infrastructure/src/locations/index.ts` — export the persisted facade and owned repository.
- `packages/infrastructure/src/locations/postgres-locations.facade.ts` —
  delegate public reads to the owned query service.
- `packages/infrastructure/src/locations/postgres-place.repository.test.ts` —
  prove SQL hydration, lease checks and redaction.
- `packages/infrastructure/src/locations/postgres-place.repository.ts` —
  query owned SQL through pool or existing active lease.
- `packages/infrastructure/src/locations/synthetic-locations.adapter.test.ts` —
  verify supplementary references and compatibility.
- `packages/infrastructure/src/locations/synthetic-locations.adapter.ts` —
  retain original eighteen and separate supplemental helpers.
- `packages/infrastructure/src/properties/synthetic-properties.adapter.test.ts` —
  prove new blocks have empty prepared reductions.
- `packages/infrastructure/src/properties/synthetic-properties.adapter.ts` —
  recognize supplemental IDs without changing prepared rows.

### Review and verification

- First Quick pass: two medium findings, recorded separately; same-pool starvation required
  a plan repair and whitespace mismatch was corrected within that re-derivation.
- Second Quick pass: zero findings, zero current-pass patches, zero deferred and zero rejected
  findings. The reviewer independently reran 124 tests. `followup_review_recommended: false`.
- Parent lint, typecheck, test and build passed; all 1,137 tests passed. Coverage passed all
  eight workspaces at unchanged 80% statements/lines/functions and 75% branches floors.
- Real Locations campaign passed 66 HTTP requests, twenty places, ten canonical addresses,
  synchronized ten-lease saturation, all 78 whitespace rejection cases, bounds, migration
  replay, restart and fail-closed checks. Production ingestion passed the complete genuine
  collection/evidence/broker/worker/HTTP journey and all historical/atomicity/authority cases.
  The unchanged prepared campaign passed 158 HTTP requests. Isolated campaign resources were
  cleaned; the parent independently confirmed the prepared project's containers/volumes absent.
- All eleven matrix rows have executed passing coverage, including the amended transaction
  and SQL/domain parity regressions. Original seven hook jobs, explicit formatting,
  Markdownlint and working-tree/index whitespace checks passed. The fictional-URI test fixture
  correction preserved secret-scanner rules and passed its six targeted tests.
- Final result file descriptions initially exceeded Markdownlint's 100-character line limit;
  wrapping only those descriptions corrected all 19 errors. Explicit Prettier and Markdownlint
  then passed without changing formatting rules or the implementation.
- Commit order: implementation, tests, documentation, using English Conventional Commits
  without scopes or trailers. The parent verifies the complete reviewed change set and clean
  working copy after those commits; no push is authorized.

### Residual risks and limits

All geometry, adjacency, ranges and counts remain explicitly prepared synthetic reference data;
this is not measured São Paulo geography or persisted property-search/count rollout. Historical
snapshots remain immutable, including older five-crumb views. No real source, geocoder, PostGIS,
model, dependency, public mutation or new environment variable was introduced. The existing
CityScene chunk-size build warning remains unchanged. VPS-dependent work stays pending under
D-006 until the owner returns; no production access or deploy occurred in this story.
