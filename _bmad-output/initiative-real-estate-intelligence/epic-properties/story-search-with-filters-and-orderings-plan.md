---
title: 'Search with filters and orderings'
type: 'feature'
ticket: 8
created: '2026-10-25'
status: done
baseline_revision: '81387ed4299eef3802c50be1536a87b18f3e44bf'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md',
    '/workspace/repos/real-estate-intelligence/docs/testing/integration.md',
  ]
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-6 still serves prepared search despite genuine persisted listing history and
current resolved membership. Clients need actual grouped properties with every existing UX filter,
ordering, full-result count and full-result median asking price per square meter.

**Approach:** Replace production search with a coherent Properties-owned persisted read, reuse the
existing summary/filter/sort/pagination rules and expose it through the unchanged HTTP contract.
Keep earlier prepared journeys explicitly isolated in test startup.

## Boundaries & Constraints

**Always:** One row per current Property, preserving immutable original lineage and corrected
current values. Reuse the active minimum asking-price member, stable member/ID ties, source
provenance, union exposure and current summary geography from detail. Calculate result statistics
before pagination. Locations owns registered descendant scopes; no foreign-schema SQL. Preserve
strict query/cursor validation, all assertions, coverage floors, hooks and existing required gates.
Execute one heavy workload at a time on the shared 8 GB/2 vCPU VPS. Synthetic data only.

**Never:** Prepared fallback in production search, invented market/neighborhood medians, new public
routes/DTO fields, matching-label runtime reads, migrations, dependencies, unrelated UI changes,
new scheduler/cache/reporting layer, production actions, secret-file access, weakened checks,
optional broad audit or historical evidence reprocessing. Keep current branch feat/phase-1.

## I/O & Edge-Case Matrix

| Scenario         | Input / State                                                                         | Expected Output / Behavior                                                                                       | Error Handling                                               |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Membership       | Actual nine identities, resolved and unresolved                                       | Five grouped current rows after resolution; unassigned legacy identities appear once; summary agrees with detail | Never silently truncate or duplicate original IDs            |
| Geography        | Default city, each registered level, supplemental block, unknown place                | Filter within registered descendant IDs; preserve actual representative geography and mismatch                   | Unknown scope yields empty result; invalid syntax rejected   |
| Ranges           | Type, inclusive asking-price/m²/area min/max, bedroom/bathroom/parking minimum        | Exact existing filter semantics, composed by AND; null excluded when numeric bound applies                       | Existing validation refuses invalid/reversed ranges          |
| Time/history     | Four time bands; reduced, returned, multiple-listing booleans true/false              | Existing summary semantics, explicit false respected; no manufactured sale or repricing                          | Removed-only property retains history and null asking values |
| Statistics/order | Odd/even/empty/null result; four sorts; equal values                                  | Full filtered median and signed deviation; stable IDs break ties; null values last                               | No neighborhood median invented                              |
| Pages            | 20 default, bounded smaller page, same normalized query, malformed/cross-query cursor | Whole-result count/median on every page; stable traversal with unchanged state                                   | Existing strict invalid-cursor rejection                     |
| Freshness        | Real price/status/correction/split, restart and database failure                      | Next read reflects committed current state; one statement snapshot; no writes                                    | Failure propagates safely, never switches to prepared data   |
| Compatibility    | Earlier prepared HTTP/browser campaigns and genuine detail/reductions                 | Explicit test-only search override retains prior fixtures and assertions; production startup stays persisted     | No runtime fake selector                                     |

</intent-contract>

## Code Map

- `packages/infrastructure/src/properties/persisted-properties.facade.ts` delegates search to
  prepared today. Its `projectPersisted` constructs grouped summary from stable members,
  active minimum, shared numeric attributes, lifeline union, historical minimum effects and
  maximum member asOf. Extract only necessary summary calculation for real search/detail reuse;
  preserve full detail rights/snapshot/evidence behavior.
- `packages/infrastructure/src/properties/postgres-property.repository.ts:getCurrentGroup` is
  the existing one-statement snapshot model: current assignment, immutable initial member,
  `listing_current` state and property-minimum effects, Properties schema only. New flat
  `postgres-property-search.repository.ts` should bulk-read equivalent search inputs coherently,
  including unassigned identities through original IDs, with stable source/listing order.
  `persisted-property.projection.ts:projectInitialProperty` already reconstructs corrected
  scalar/provenance/history/exposure safely; search need not fetch text permissions/snapshots.
- `packages/infrastructure/src/properties/synthetic-properties.adapter.ts` owns adequate
  inclusive matching, median rounding, deviations and deterministic sorting. Move the necessary
  pure filter/order calculation to a shared framework-neutral Properties application helper;
  preserve the prepared adapter's exact responses/counts/cursors. Avoid duplicate algorithms.
- `packages/application/src/properties/read-pagination.ts` validates all SearchQuery fields
  and implements strict normalized-scope offset cursors. Reuse it, with a distinct persisted
  endpoint scope. `largest-reductions.service.ts` shows Locations/clock/metadata composition.
  `locations/locations.facade.ts:registeredScopeIds` returns self plus registered descendants,
  null for unknown; use only this public boundary. Root/children APIs expose reference IDs.
- New flat application search repository/service and public index exports expose only canonical
  summaries/metadata. `apps/api/src/properties/properties.module.ts` already imports the public
  LocationsReferenceModule, Persistence and Collection without a cycle. Give search its own DI
  provider token so test startup can override only that capability; delegate facade search to it.
- Domain `properties.read.types.ts`, mirrored contracts/parsers, controller, frontend and fixture
  catalog are read-only contracts. Existing UI obtains place total by a separate unfiltered
  query; result placeCounts remains filtered counts. Keep neighborhoodComparison null.
- `integration/property-resolution.integration.test.ts` has the authentic 39-run/115-acquisition
  nine-listing collection/storage/broker/worker/API path, real changes/split/restart and original
  event digests. Extend it with strict SearchResponse checks and literal expected filters/sorts
  at stable stages rather than cloning another full collection harness. Preserve every old check.
- `integration/support/fixture.ts` centralizes owned Testcontainers/Compose lifecycle. Existing
  `integration/fixtures/ask-model-fixture-bootstrap.ts` plus model campaign demonstrates explicit
  mounted Nest testing overrides with no production selector. Add the narrow prepared-search
  bootstrap/Compose override and opt-in harness setting; mechanically opt prepared campaigns in.
  Keep real persisted campaigns on production startup. Test harness selection/cleanup separately.
- Adjacent unit/HTTP tests cover pure filters, snapshot/group summaries, service delegation,
  empty/failure behavior and query errors. Existing `properties-contracts` and `web-search`
  campaigns protect prepared HTTP/navigation; other byte-unchanged browser evidence is reused.
- `packages/application/src/properties/reconcile-listing-history.service.ts` must follow the
  Collection authority → Properties identity → global resolution guard order already used by
  ingestion. The genuine campaign demonstrated the reverse order in canonical history, legacy
  recovery and corrections; correcting these three paths is a necessary gate dependency. Keep
  authority and effects in the same transaction and reload legacy chronology under its identity lock.
- Update `docs/api/properties-and-locations.md`, this plan and epic notes concisely; no new report.

## Tasks & Acceptance

**Execution:**

- [x] Application search helper, repository and service (`packages/application/src/properties/`):
      `property-search.ts`, `property-search.repository.ts`, `search-properties.service.ts` and tests.
      Reuse complete existing filters/order/pagination and public Locations scope; cover every matrix
      row, fixed literal median/order expectations and failure/empty cases. Export public boundaries.
- [x] `packages/infrastructure/src/properties/{postgres-property-search.repository,persisted-property.projection}.ts`,
      facade delegation, prepared adapter and adjacent tests — read one coherent committed snapshot,
      reuse current detail summary semantics, retain genuine original and assigned identities,
      fail closed and preserve prepared bytes. No new database state.
- [x] `apps/api/src/properties/properties.module.ts` and affected HTTP tests — wire persisted
      search provider and assert actual outer HTTP parsing/errors, not just internal helpers.
- [x] `integration/fixtures/`, `integration/support/fixture.ts` and affected prepared campaign
      settings — explicit test-only search bootstrap with narrow provider override, tested opt-in
      and exact lifecycle; preserve genuine detail/reductions and production command by default.
- [x] `integration/property-resolution.integration.test.ts` — prove actual API search over the
      genuine catalog, each filter/order, all geographic levels, full-result median/count/deviation,
      pages and immutable reads; verify changes/split/restart and empty database. Keep original
      acquisition/privacy/rollback/concurrency/evidence checks and cleanup.
- [x] Necessary demonstrated gate dependency: reorder the three affected history paths to
      Collection → Properties without new locks/retries/state; prove authority barriers and recovery
      chronology under contention, then rerun affected gates and the original genuine campaign.
- [x] `docs/api/properties-and-locations.md`, epic and this plan — record delivered behavior,
      compatibility limits, actual command results and source identity, without duplicate reports.

**Acceptance Criteria:**

- Given genuinely collected/resolved synthetic data, when GET `/api/v1/properties` is queried
  with each supported filter and ordering, then strict HTTP responses contain the expected
  current property IDs once each, own count/median/deviations, actual provenance and deterministic
  pagination, matching detail summaries and literal fixture expectations.
- Given real correction/status/minimum or membership changes and restart, when search is read
  again, then current committed state is visible without writes, invented history or prepared
  fallback; empty database and failed reads remain honestly empty or failed.
- Given the existing prepared HTTP and Search UI journeys, when their explicit test startup is
  selected, then their original fixture, assertions and navigation pass, while normal production
  startup continues serving persisted search and unchanged detail/reductions.

## Implementation Notes

- Production `PROPERTY_SEARCH` composes `SearchPropertiesService` with a bulk PostgreSQL
  repository. One Properties-only statement reads immutable original lineage, current assignment,
  current chronology and minimum effects. Unassigned identities retain their original IDs; failures
  propagate without prepared fallback or writes.
- Search and detail share the extracted current grouped summary projection. Search and prepared
  search share the existing pure inclusive filters, booleans, median/deviation, stable sorting and
  normalized pagination inputs. Locations remains the sole registered-scope owner. Current search
  metadata identifies `persisted-synthetic-search-v1`; neighborhood comparison remains null.
- Prepared campaigns explicitly override only `PROPERTY_SEARCH` through a mounted Nest test
  bootstrap. The Compose override uses the existing API build stage, which contains Nest testing
  and native dependencies built for the container; it mounts only the bootstrap source. Normal
  startup has no selector and retains the production runtime image. Detail/reductions providers
  and all original compatibility assertions remain in place.
- The existing genuine resolution campaign now checks the empty database, five current groups,
  nine unassigned originals, literal full-catalog filter/order/statistics expectations, registered
  geography, every page, read-only digests, correction split/restoration, minimum removal/return,
  an uncommitted-write snapshot, API restart and database failure/recovery.

## Plan Change Log

- No scope or contract change. API compiled modules emit CommonJS without declarations; the
  test-only bootstrap consumes their actual exports through `createRequire` with explicit consumed
  signatures rather than weakening integration type checking.
- The full unit gate exposed one additional older projection test that depended on implicit
  prepared search. Its setup now injects that provider explicitly, retaining the response assertion.
  The original failed command log is retained separately from the corrected successful run.
- The first genuine campaign reached the original catalog replay and failed with a PostgreSQL
  deadlock in `commitPage`, before the added search matrix. Its direct `CollectSourceRun`
  construction omitted the suppression authority already supplied by both production composition
  roots. Code proves the divergent run-before-trigger-listing order and a worker
  listing-before-run verification order; without the server's process/run IDs this is a concrete
  lock-order hypothesis, not proof of the exact first deadlock cycle.
  The campaign now injects the same `PostgresListingSuppression` as production, using the existing
  service's sorted listing-before-run locking. No production lock/retry change or assertion/deadline
  relaxation was made. The failed log is `/tmp/rei-search-resolution.log`; its old diagnostic dump
  omitted PostgreSQL, so server deadlock details were unavailable after owned teardown. Future
  campaign failure dumps now include the owned PostgreSQL service.

- The aligned fixture still deadlocked: `/tmp/rei-search-resolution-final.log` captures the
  PostgreSQL cycle. This disproves fixture alignment as a sufficient remedy; the earlier run/row
  hypothesis did not explain the captured cycle. A bounded, isolated PostgreSQL hash probe
  (`/tmp/rei-search-lock-map.log`, owned container removed) maps the shared listing
  `synthetic-portal-aurora/AUR-PN-001`: Collection listing key high/low `4274298957/4106444182`,
  Properties identity key `1094693872/2936621282`. Processes 280 and 284 wait for each other's
  respective keys; upload process 279 also waits on the Collection key. The global resolution
  guard hashes to `1551527949/549035677` and is distinct. Search is read-only and takes none of
  these writer locks.
- Ingestion authenticates Collection authority before taking Properties identity/global locks.
  Canonical history took Properties before `getRunListingFacts`; recovery and corrections took
  Properties before `verifyParsedEvent`. Those public authority calls acquire Collection listing
  ownership. All three now use Collection → Properties within the same transaction. Recovery
  authenticates immutable initial lineage first and reloads mutable chronology under Properties
  ownership. Upload retains its existing Collection listing → object order; suppression/erasure
  ownership and the global resolution guard remain unchanged. This removes the demonstrated
  inversion without a new mechanism, retry or historical reprocessing.
- Directed authority-barrier tests for all three paths and a recovery chronology advancement test
  pass with existing history/ingestion regressions: 41 tests, 2 files, exit 0 in
  `/tmp/rei-search-lock-regressions-final.log`. The first focused attempt's test-fixture argument
  insertion error is retained in `/tmp/rei-search-lock-regressions.log`; corrected fixture only.

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: None. Independent quick inspection checked the complete diff, acceptance, context,
  repository rules and surrounding persistence, writer and fixture paths; no supported gap remained.

## Design Notes

Full route: more than 100 changed lines and five substantive files, including necessary test
compatibility. Medium risk remains appropriate: read-only search with unchanged money/contracts
and existing authoritative grouping. This is review round one for 3.8; completed stories stay closed.
D-094 records only the material production-versus-prepared evidence separation. Ordinary
execution order and unchanged filter rules need no additional decisions.

## Verification

Run focused unit/HTTP/support tests first. Run the required final checks serially:
`PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm run lint`, `pnpm run typecheck`, `pnpm run test`,
`pnpm run build`. Run unchanged coverage gates for changed workspaces, reusing unchanged workspace
results whose production/test dependencies remain identical. Run the extended real resolution
campaign, prepared Properties HTTP and prepared Search browser campaign sequentially. Reuse other
unchanged visual/history evidence; no general accessibility audit. Format/lint changed docs and
run normal commit hooks; never skip/retry/extend timeout to conceal failure. Parent reviews the
full diff and independently verifies missing gates, without repeating valid unchanged commands.

### Recorded gate evidence

- Full lint, typecheck, build and unit gates passed before the demonstrated writer-order fix:
  `/tmp/rei-search-lint.log`, `/tmp/rei-search-typecheck.log`, `/tmp/rei-search-build.log`,
  `/tmp/rei-search-test-final.log`. The full unit run passed 2,825 tests in 239 files. The
  initial failed unit log `/tmp/rei-search-test.log` retains the old implicit-provider fixture
  assertion; its corrected setup is included in all successful final results.
- Full coverage passed all eight unchanged floors (80% statements/lines/functions, 75% branches),
  `/tmp/rei-search-coverage.log`. Percentages are statements / branches / functions / lines:

  | Workspace                            | Coverage percentages          |
  | ------------------------------------ | ----------------------------- |
  | Contracts                            | 91.03 / 90.88 / 93.23 / 92.71 |
  | Domain                               | 95.02 / 90.34 / 100 / 95.87   |
  | AI                                   | 94.18 / 88.74 / 91.9 / 96.3   |
  | Web                                  | 95.96 / 90.82 / 96.54 / 97.18 |
  | Application (before lock correction) | 91.33 / 90.51 / 95.65 / 92.56 |
  | Infrastructure                       | 82.01 / 75.73 / 88.64 / 83.86 |
  | API                                  | 94.3 / 85.52 / 97.61 / 95.47  |
  | Worker                               | 93.42 / 83.3 / 90.28 / 94.78  |

- After the bounded history correction, full lint passed again
  (`/tmp/rei-search-lint-lock-final.log`); application typecheck, all 265 application tests in 26
  files and the worker transitive build passed (`/tmp/rei-search-affected-typecheck.log`,
  `/tmp/rei-search-affected-test.log`, `/tmp/rei-search-affected-build.log`). Application coverage
  passed with the original script flags/floors: 91.27 / 90.53 / 95.65 / 92.57
  (`/tmp/rei-search-affected-coverage.log`).
- Reused valid results cover unchanged contracts/domain/web/AI, unchanged infrastructure and API
  behavior, and unchanged worker coverage. Their production and test paths do not instantiate the
  altered reconciliation implementation; the worker job delegates through its mocked boundary.
  Final application results replace its earlier result. The actual writer concurrency and recovery
  path is checked by the final genuine integration campaign, rather than relying on mocked jobs.

- Final worker suite passed 239 tests in 38 files; worker, API and integration typechecking also
  passed, with exit 0 logs `/tmp/rei-search-affected-worker-test.log`,
  `/tmp/rei-search-affected-worker-typecheck.log`, `/tmp/rei-search-affected-api-typecheck.log`
  and `/tmp/rei-search-affected-integration-typecheck.log`. The complete final unit evidence is
  2,829 tests in 239 files: final application 265 and reused/confirmed unchanged workspace results.
- The three planned campaigns ran sequentially against the same unchanged source/configuration,
  each exited 0 and removed all owned application/dependency services:

  | Campaign                 | Verified behavior                                                                                                                                                                                                                                                                                                                                                               | Result / log                                                                   |
  | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
  | Genuine resolution       | Empty production search; real 39-run/115-acquisition catalog; every filter, time band, boolean, range and sort; geography; full-result statistics and pages; current grouping and unassigned originals; detail agreement; correction/split/minimum/status changes; read-only barrier/digests; restart and failure/recovery; all original concurrency/history/privacy assertions | 1/1, 529.78s test / 533.04s total; `/tmp/rei-search-resolution-lock-fixed.log` |
  | Prepared Properties HTTP | Original strict response, query, cursor, statistics and error assertions through real container startup with only the search provider overridden                                                                                                                                                                                                                                | 1/1, 180.20s test / 185.04s total; `/tmp/rei-search-properties.log`            |
  | Prepared Search browser  | Original eight semantic scenarios, all filters/sorts/pages/history/empty/retry/hierarchy behavior, PT/EN, three viewport widths, keyboard and existing full-page axe/surface assertions through real proxy/Chromium                                                                                                                                                             | 1/1, 158.90s test / 162.24s total; `/tmp/rei-search-web.log`                   |

### Acceptance matrix to executed evidence

| Matrix row                        | Unit/HTTP evidence                                                                                                     | Real campaign evidence                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Membership and coherent summaries | `postgres-property-search.repository.test.ts`, `persisted-properties.facade.test.ts`, existing projection suite        | Genuine resolution: five groups, nine originals, split/restoration and detail equality         |
| Geography and place counts        | `search-properties.service.test.ts` (registered scopes, unknown/invalid, counts)                                       | Genuine resolution: city through supplemental block; prepared browser hierarchy                |
| Ranges and explicit booleans      | Search service/pure algorithms; `properties.controller.test.ts` strict parsing                                         | Genuine literal independent filter matrix; unchanged prepared HTTP and browser filter journeys |
| Time/history and current values   | Search service matrix; projection/history suites; final 41-test lock/recovery regression selection                     | Genuine status/minimum/correction/read barrier and original historical assertions              |
| Statistics, ordering and pages    | Odd/even/null median, full filtered deviation, ties, cursor/default normalization tests                                | Genuine literal statistics/order/page traversal; prepared HTTP/browser full-result statistics  |
| Freshness and safe failure        | Repository fresh-read/failure tests; service/facade production empty/error HTTP tests                                  | Genuine writes, immutable digests, restart, database outage/recovery                           |
| Compatibility and lifecycle       | Prepared adapter suite; 17 support-fixture tests; explicit controller override                                         | Both prepared campaigns pass without changing original assertions                              |
| Necessary writer-order dependency | Three asynchronous Collection authority barriers and recovery chronology advancement; existing history/ingestion tests | Genuine concurrent writer path passes after captured PostgreSQL advisory inversion is removed  |

### Delivery limits

- Synthetic collected data and explicit prepared compatibility only. No production deployment,
  external source crawl or acquired-market equivalence is claimed.
- Only the three required campaigns were run; other byte-unchanged prepared visual campaigns
  retain their earlier evidence. Their fixture settings were changed mechanically and covered by
  strict integration typechecking plus shared lifecycle tests.
- The first deadlock's exact server cycle cannot be reconstructed after its original teardown.
  The second failure supplied the actual Collection/Properties advisory cycle; the bounded fix,
  targeted barriers and final genuine campaign establish the corrected affected paths.
- Build retains the existing web chunk-size warning. No thresholds, assertions, deadlines,
  production selector, retries, schema, migrations, dependencies or public DTOs changed.
- Parent independent Verify/review and any authorized commits remain pending; execution checkboxes
  record completed implementation and verification, not completion of independent review.

### Source identity and required hooks

- Branch `feat/phase-1`, baseline `81387ed4299eef3802c50be1536a87b18f3e44bf`, no commits made.
  The same 885 source/test/config files were used by all final campaigns. SHA256 of the sorted
  per-file SHA256/path manifest is
  `49ff7561a975197b9429b989d1e22ff8dcdc6aac2299a8f707d75b7439bca82e`.
  Reproduction script and manifest are `/tmp/rei-search-source-identity.py` and
  `/tmp/rei-search-source-manifest.txt`; all tracked/new code, SQL, manifests and configuration
  are included, excluding documentation and ignored build/browser outputs. Comparison after
  formatting and the first full hook run confirmed identical executable/configuration contents.
- Initial documentation lint and required hooks exposed only Markdown line-length failures:
  `/tmp/rei-search-format.log`, `/tmp/rei-search-hooks.log`. The full hook's secrets, shell,
  Dockerfile, Prettier and ESLint jobs passed. Corrected only documentation wrapping; retained
  failures, without weakening lint. The first final hook log `/tmp/rei-search-hooks-final.log`
  still tested the staged pre-wrap
  document: Lefthook temporarily isolates unstaged edits. The corrected document was then staged
  explicitly. Final required hook output is `/tmp/rei-search-hooks-corrected-index.log`.
- The browser campaign's generated Markdown report was moved from its owned evidence directory
  to `/tmp/rei-search-browser-report.md`; the existing ignore rule deliberately permits reports,
  and this task adds no separate report to the repository. Other generated campaign evidence
  remains local and ignored. Hook auto-formatting staged tracked implementation files as configured;
  the parent retains commit ownership and must include the new source files explicitly.

- Final required hook command `lefthook run pre-commit --all-files` exited 0: all six job groups
  passed in 48.97 seconds (`/tmp/rei-search-hooks-corrected-index.log`). Final documentation
  formatting/lint output is `/tmp/rei-search-delivery-docs-final.log`.
  No executable/configuration bytes
  changed after the passing campaigns; their results remain valid. All 37 changed/new paths are
  listed in `/tmp/rei-search-changed-files.txt`. No implementation requirement remains incomplete;
  independent review is intentionally reserved for the parent.

## Auto Run Result

Production search now returns current persisted property groups, all existing filters/orderings,
full filtered statistics and strict stable pagination. It shares the current detail summary and
fails honestly on empty/unavailable persistence. Explicit test startup preserves the prepared
compatibility catalog. The demonstrated Collection/Properties lock inversion was corrected in
three history paths without a new lock, retry or transaction boundary.

Changed files, grouped by responsibility:

- Application `property-search.repository.ts`, `property-search.ts`, `search-properties.service.ts`
  and `index.ts`: canonical snapshot capability, shared deterministic rules and search orchestration.
- Application `reconcile-listing-history.service.ts`: consistent Collection-before-Properties order
  and legacy chronology reread under ownership; adjacent tests cover all affected paths.
- Infrastructure `postgres-property-search.repository.ts`: one Properties-only snapshot with current
  membership, chronology and minimum effects; its adjacent tests cover hydration and safe failure.
- Infrastructure `persisted-property.projection.ts`, `persisted-properties.facade.ts` and
  `synthetic-properties.adapter.ts`: reuse summary/filter rules and dedicated persisted search;
  their adjacent tests and `index.ts` preserve compatibility and public wiring.
- API `properties.module.ts` and `properties.controller.test.ts`: production composition and strict
  outer HTTP empty/error/query behavior, with prepared contracts explicitly isolated.
- Integration `prepared-search-bootstrap.ts`, `prepared-search.compose.yaml`, `support/fixture.ts`
  and its tests: explicit narrow test startup, owned lifecycle and exact cleanup.
- Integration `property-resolution.integration.test.ts`: genuine search acceptance and necessary
  writer regression; `properties-contracts`, `properties-ingestion` and ten prepared web campaign
  files select the explicit compatibility fixture without changing their original assertions.
- Existing API reference, epic notes and this plan: behavior, material D-094, evidence and limits.

Independent review: quick, one broad round, no findings. Patches: high 0, medium 0, low 0.
Deferred: none. Rejected findings: none. Follow-up review recommended: false.

Parent Verify read the complete staged/new-file diff and audited every matrix row against the
executed evidence recorded above. All rows are covered by passing tests/campaigns; none was
skipped. Valid unchanged results were reused. Final evidence combines 2,829 unit tests in 239
files, original coverage floors, affected typechecks/build, three final campaigns and all six
required hook groups. No additional test run was needed after documentation-only finalization.

Residual limits remain the bounded synthetic dataset, retained prior evidence for unchanged
visual journeys, the first deadlock's unavailable server detail and the existing bundle warning.
No known in-scope acceptance defect remains. Commits and ticket closure are recorded below when
completed; publication and later stories continue on feat/phase-1 under the owner's authorization.

### Delivery and ticket closure

Reviewed implementation, tests and evidence were committed with mandatory hooks passing:

- `f41550ab6b6cddb4db556b3629255d33351fa6ff`: consistent history authority lock order.
- `8724764fa5d7f5df62b3f38696cb9a97245a2e7e`: persisted property search.
- `bbe822c62053c9b4810f6ed1d9dca2045005fec5`: acceptance and compatibility tests.
- `5a537699b830e517cc2c5cf83a34a6a455101727`: reviewed delivery documentation.

Parent verified all 37 reviewed paths were committed after the canonical baseline and the product
working copy was clean. `tickets.py mark 3.8 done` then closed the story. Only this closure record
changed afterward; passing product evidence is reused. Publication remains on feat/phase-1 during
the goal, and main integration is deferred until all stories are complete per the owner.
