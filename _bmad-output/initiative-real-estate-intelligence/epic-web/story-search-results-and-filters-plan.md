---
title: 'Search results and filters'
type: 'feature'
ticket: '6'
created: '2026-10-12'
status: 'built'
baseline_revision: 'f02018e3b2ac7201c44093ea83363dff08349233'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md'
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
warnings: ['oversized']
deferred: []
---

# Search Results and Filters Implementation Plan

Goal: replace the Search entry boundary with the complete contract-backed result list and Filters
editor.

Architecture: extend the existing React Router/TanStack Query/i18next public shell. Search stays on
the prepared synthetic read contract; server reads own all filtering, sorting, counts and medians.
Full route is required because this meaningful web/test change exceeds 100 lines and five files. The
BMAD full coding/review workflow and this ticket plan replace interactive writing-plans handoffs,
unavailable superpowers subskills and their default plan destination.

Tech stack: existing React 19/TypeScript/Vite, Query, Router, bundled translations, Vitest and
Testing Library; strictly typed integration Vitest/Supertest/Testcontainers/Nock/Playwright.

<intent-contract>

## Intent

**Problem:** Search currently shows a truthful unavailable-screen boundary. Visitors cannot use the
already implemented API filters, inspect result rows/median or recover from an empty query.

**Approach:** compose validated public reads into the pinned Placa Search/Filters surfaces, with
shareable applied state, local editing, server count previews and evidence-backed empty recovery.
Preserve the existing Overview/Ask and implement no backend or contract ownership changes.

## Boundaries & Constraints

**Always:** D-059 and existing D-051–058; source-authoritative prepared metadata; locale formatting
as presentation only; canonical Portuguese place names; Asking distinction; synthetic label; single
Query cache with complete keys/AbortSignal/manual retry; immutable server values; strict public
parsers; accessible native controls, 44px targets, phone 390 and desktop >=960; unchanged
coverage/gates and same `feat/phase-1` branch; task-owned fixtures and cleanup only.

**Never:** frontend matching/sorting/median calculations, acquired-to-prepared fallback, fabricated
MarketEvidence/contributor count/freshness, invented empty reasons, illustrations as product data,
inert links or early Property/Map/Alerts/Ask workflows, N+1 property-detail reads for street labels,
automatic retries, `.env*` access, outside-repository edits except decisions, commits/push by the
coding agent, gate weakening, VPS unlock, skill security workarounds or global design drift repair.

## I/O & Edge-Case Matrix

| Scenario                | Input / State                                                | Expected Output / Behavior                                                                          | Error Handling                                                       |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Prepared search         | Existing place, no filters                                   | Actual rows, same-place unfiltered total, backend result median, prepared metadata                  | Independent manual retry retains place                               |
| Every filter            | Type; three min/max ranges; rooms; time; three history flags | Correct validated API query and actual response, never forced fixture membership                    | Native labelled range/number error, no invalid request               |
| Unit formatting         | PT `600.000,50` / EN `600,000.50`; area decimals             | Asking/m² amounts converted exactly to integer minor units; area decimal retained                   | Reject excess money precision, ambiguity and overflow                |
| Sorting                 | Four published sort names                                    | API-owned order/deviations and whole-result median                                                  | Query error retains context; no stale rows labelled current          |
| Empty attribution       | Prefix count positive then next filter group zero            | Name that group and actual last excluded count                                                      | Existing-zero place is neutral; failed diagnostic has explicit retry |
| Empty recovery          | Relax; widen                                                 | Remove proven group; actual ancestor with remaining filters                                         | No unavailable alert/map action                                      |
| Draft editing           | `view=filters`; edit/clear/cancel/apply                      | Local draft, truthful current preview N, cancel unchanged; apply URL                                | Pending/error preview never masquerades as zero/current count        |
| Malformed URL           | Duplicate/unknown/invalid enum/range/page/cursor             | Safe localized validation state; genuine clear recovery                                             | Never blindly forward malformed query or expose raw errors           |
| Explicit false          | Published boolean false in deep link                         | Preserved effective constraint with accurate removable label                                        | Editor can select true/any/false without silent coercion             |
| Navigation              | Reload, back-forward, place changes, locale switch           | URL-applied filters/sort authoritative; no old cursor; documented shell place change resets filters | Aborted obsolete responses cannot replace current data               |
| Pagination              | 20 rows/page and next cursor                                 | Append server page; median/total stable; inputs reset cursor                                        | Failed next page preserves loaded rows, explicit retry               |
| Neighborhood comparison | Neighborhood or block vs city/zone                           | Same prepared unfiltered neighborhood median only if identifiable                                   | Never pretend city is a neighborhood or use event-fed median         |
| Null/zero               | Missing amount, area or rooms; true zero counts              | Existing row null labels and genuine zeros                                                          | No truthiness substitution                                           |

</intent-contract>

## Code Map

- `apps/web/src/routes.tsx` maps Search and Ask to `PlaceEntry`; replace only Search with
  `search/SearchResults.tsx`. `/search/:placeId?view=filters` preserves AppShell's exact matcher.
- `apps/web/src/shell/AppShell.tsx`, `PublicNavigation.tsx`, `public-routes.ts`, `PlaceEntry.tsx`
  are incumbent shell/Ask boundaries. Shell/geography links intentionally reset Search filters on a
  new place; Filters' place picker/widen retain draft/applied constraints respectively.
- `apps/web/src/places/place-client.ts`: validated API reads, `PlaceReadError`, public UUID safety,
  `isPlaceId`, existing roots/children traversal. Its `places()` returns neighborhoods only; add a
  bounded public `children(id)` read or reuse a focused Search hierarchy client instead.
- `apps/web/src/places/place-queries.ts`: reuse `readPolicy`, existing `placeQuery`, cache. New
  Search keys contain every effective request input, not locale or only place. The default staleTime
  is a cache policy, not a statement about backend freshness.
- `apps/web/src/api/client.ts`: reuse abortable `createApiClient().read` and parser boundaries.
- `packages/contracts/src/properties/properties.read.types.ts` and `properties.read.dto.ts`: reuse
  `SearchQuery`, `SearchResponse`, enums, `parseSearchResponse`, query validator. Read-only.
- `packages/application/src/properties/read-pagination.ts`: page size max/default 20 and
  query-scope-bound cursor; read-only. `synthetic-properties.adapter.ts` owns all semantics.
- `integration/properties-ingestion.integration.test.ts:626` freezes separation of acquired
  properties and the five prepared results; preserve it.
- `apps/web/src/shared/PropertyRow.tsx`: shared normalized row accepts `property`/`href`; add
  optional semantic non-link rendering without breaking linked consumers, and optional actual block
  label if required. A bounded distinct block-place cache can supply labels; no property N+1.
- `apps/web/src/shared/SystemStates.tsx`: existing price-specific `NoResultsState`; extend with
  typed general diagnostic reason without weakening its existing price-evidence fixtures/tests.
- `apps/web/src/places/formatters.ts`, `locale.ts`, `resources.ts` and actual shared i18next
  registration: reuse locale conventions; add bundled Search catalogs, leave Overview copy alone.
- `apps/web/src/styles/place.css`, `shared.css`, `overview.css`: incumbent rules; add scoped
  `styles/search.css`, preserve all tokens/system files. Use actual existing i18n/CSS entry imports.
- `integration/web-place.integration.test.ts`, `web-system-states.integration.test.ts`,
  `support/fixture.ts`, `support/accessibility.ts`: owned real-stack/browser proof and cleanup
  patterns; new `web-search.integration.test.ts` plus focused typed `support/search-reads.ts`.
- Visual truth: `docs/design/canvas/project/{Search,Filters,DesktopPlace}.dc.html`,
  `docs/design/{direction,screens,content-and-locale}.md`, `apps/web/{PRODUCT,DESIGN}.md`. Existing
  shell surface brief scopes identity, not permanent unavailable Search behavior.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/search/search-state.ts` / `.test.ts` — write failing tests then implement URL
      parse/serialize, fixed UX filter groups, removal, draft conversion/validation and cursor
      reset. Reuse contract validators; no duplicate business filtering. Keys and booleans are
      lossless.
- [x] `apps/web/src/search/search-client.ts`, `search-queries.ts`, `search-diagnostics.ts` and
      paired tests — validated abortable Search/children reads, complete hierarchy within registered
      finite depth, cache keys/infinite pages, same-basis totals/neighborhood comparison and bounded
      prefix diagnostics. Use server `totalItems`; stop at first proven positive-to-zero transition.
- [x] `apps/web/.impeccable/surfaces/src-search-searchresults-tsx.md` — persist the six-block
      inherited Placa Operate contract before UI edits, read it back. Main reads craft-floor
      immediately before UI editing; coding agent reads applicable skill/reference itself. No
      context rerun/roll.
- [x] `apps/web/src/search/SearchResults.tsx`, `SearchFilters.tsx`, `SearchMedian.tsx`,
      `search-resources.ts`, `styles/search.css` — test then build compact plate/count, applied
      chips, four orderings, prepared median/evidence, rows and 20-row append; complete Filters form
      with actual hierarchy, 5 UX types, six range fields, room minima, four time bands and history
      flags. Draft count uses same validated backend request; close cancels, clear stays in draft,
      apply returns to list. Add explicit-false compatibility affordance only when such a link
      requires it.
- [x] `apps/web/src/routes.tsx`, actual catalog/CSS registration, `shared/PropertyRow.tsx`,
      `shared/SystemStates.tsx` and targeted existing tests — integrate Search only; preserve linked
      rows/legacy state fixtures, Ask draft privacy, Overview and public navigation. Add general
      named-filter recovery and neutral empty state with genuine relax/widen and no alert action.
- [x] `apps/web/src/search/*.test.tsx` — prove matrix at outer component surface, including aborted
      draft/obsolete previews, query errors, explicit retry, all inputs/ordinals, unchanged preview
      on cancel, back-forward/direct links, pagination and median evidence limits.
- [x] `integration/web-search.integration.test.ts`, `support/search-reads.ts`,
      `integration/web-place.integration.test.ts` — actual owned Compose API/browser journey, every
      outgoing filter/order and truthful response, zero attribution/recovery, hierarchy,
      failure/retry; update previous Search unavailable assertion, preserve Ask boundary. Capture
      Search and Filters in PT/EN at 390/960/1440, default Bela Vista and city test scope,
      axe/keyboard, no overflow, local fonts and no unexpected network; clean owned resources
      preserving failures.
- [x] This plan and Search brief — record actual final gates, finite visual review, finish
      review/documenter result; parent alone accepts/commits via auto-commit after mandatory BMAD
      review.

**Acceptance Criteria:**

- Given actual owned Compose at city scope, when each UX filter and each of four orderings is
  applied, then the URL/request and list/count/median match the parsed backend response; identical
  or empty prepared outcomes remain truthful, not altered just to claim every option differs.
- Given the five prepared city properties, when reduced=true (three) is followed by returned=true,
  then zero results identify Returned to market as the first UX-order zero-producing group and state
  the actual three excluded; relaxing it returns the three, and widening uses a real ancestor.
- Given an unfiltered zero-property block or failed attribution read, when Search renders, then no
  responsible filter/minimum is invented and actual neutral/retry recovery remains usable.
- Given Filter editing, when changes are cancelled or applied and history is traversed, then only
  applied URL state changes list data; the Apply count belongs to the current valid draft and
  locale.
- Given pages with a next cursor, when more is loaded, then appended rows and full-result median
  match server pages; changing any effective input resets pagination and ignores old responses.
- Given each Search/Filters surface in both locales and 390/960/1440, when inspected and walked by
  keyboard on real Chromium, then the pinned Placa geometry/type/controls hold, focus and 44px
  targets work, no horizontal overflow occurs and axe has no ignored rules or violations.
- Given real Search versus Overview data, when result median/neighborhood comparison are read, then
  their prepared origin is explicit and no event-fed evidence or page-only contributor total is
  attributed to the Search result; asking/source/date remain identifiable.

## Implementation Notes

- The contracts package publishes `SearchQuery`, enums and strict response parsers, but no
  browser-safe query validator. The actual `validateReadQuery` lives in the application package and
  depends on server-only pagination/`node:crypto`. With the parent's explicit confirmation, Search
  validates only URL/form syntax, published numeric bounds and localized units locally; it reuses
  public enums/parsers and performs no membership, ordering, median or business-rule computation.
  The API remains authoritative. No server/contracts files were changed.
- Applied URL state, local draft state and infinite result pages have independent complete request
  keys in the existing Query cache; reads consume AbortSignal and use manual retry only. A bounded
  six-kind hierarchy includes actual blocks. Explicit false, zero room minima and
  contract-compatible deep-link types survive edit/cancel/apply. Clear retains place/sort/page size.
- Exact integer cent conversion uses BigInt before safe-number conversion; fail-first tests proved
  that division by 100 otherwise loses the last cent at `Number.MAX_SAFE_INTEGER`. Shared money
  rendering retains its incumbent Intl path for fractional backend medians. The real web-place
  regression initially revealed an Overview median `970401.5` that caused the integer-only renderer
  to throw; a real browser readback identified that cause. A dedicated test now checks PT/EN
  half-cent medians and negative sub-real amounts, and the original ancestor navigation assertion
  was preserved. The initial full web run had 268 tests, including six formatter tests; the ROUND1
  verification additions bring that total to 280.
- Real browser attempts exposed Portuguese zero-count singular copy and 40px bedroom targets. Added
  the explicit zero plural and a scoped 44px minimum; no global token or authored-design changes.
  The wrong assumed ancestor label in one executor attempt was corrected to the actual
  `Estado de São Paulo`, without changing the expected recovery semantics or prepared data.
- Search uses only prepared response metadata, asking values and whole-result medians. A
  neighborhood comparison is read only when that neighborhood is identifiable. Contributor totals
  and freshness are explicitly unavailable; city is never relabelled as a neighborhood. Property
  rows are semantic non-links and require no detail reads. Ask's boundary is unchanged.
- The agents-evaluator-e2e campaign uses an isolated owned Compose project, real API/PostgreSQL,
  real Chromium and public parsed responses; transport-failure injection changes no business
  response. All earlier attempts are retained, not promoted into single-version approval.
  Production/VPS and acquired-data equivalence remain outside the verified scope.
- Parent ROUND1 compared all 48 immutable captures with actual authored Search/390, Filters/390 and
  DesktopPlace/1440 references. Its single material correction batch keeps the mobile Filters editor
  standalone: the incumbent brand/navigation/plate/footer/tabbar are hidden only below 960px while
  the real Filters component exists. Search, other routes and desktop shell are unchanged. The
  authored grab, condensed uppercase close header, 20px group rhythm and muted range labels use
  incumbent tokens, without a modal or global drift.
- Native place options now start with the most-specific actual name and reversed actual ancestors.
  Every hierarchy identifier and name is retained; the complete selected path wraps in the existing
  hint so native clipping cannot hide its ancestry. Search result counts use explicit i18next
  one/zero/other keys in both locales. New outer-component tests cover 0/1/2 counts, hierarchy
  no-loss, neighborhood/block prepared comparison, city/zone non-comparison and independent
  comparison retry. Real readback now checks each row's type, rooms, area, block, asking price,
  price/m² and comparison in server order, including all appended cursor rows and the unchanged
  whole-result median. No backend, fixture, gate or numeric expectation was changed.

## Plan Change Log

## Review Triage Log

### 2026-10-12 — Follow-up review pass

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `search-queries.ts` retained additional pages when an applied ordering was
    revisited — the parent extended the actual outer-component pagination test to select A,
    load/retry its next page, select B, then select A. It failed with two rows instead of one. Set
    `gcTime: 0` only for infinite Search pages so inactive pagination is not restored; ordinary
    detail/count/hierarchy caches retain the unchanged read policy. The regression also requires a
    new cursor-free first-page read, and real SEARCH-002 now traverses A–B–A. This is a local
    cache-policy correction with no new product or public API surface.

The subsequent browser execution exposed a test-fixture defect, not a language-switch failure: the
context's explicit PT initialization runs on every document load. SEARCH-004 selected EN before
`page.goto`, so the test itself overwrote that choice. Navigate first, then select the requested
language through the actual rail control; preserve the original localized count, invalid-draft and
exact numeric-request assertions. The failed run remains as evidence.

### 2026-10-12 — Review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `SearchFilters.tsx` reinterpreted otherwise valid numeric fields when an
    invalid draft changed locale — the actual outer component reproduced the defect in both
    directions, including inverted area ranges. Four fail-first tests now pass. Swap the six range
    fields' decimal/grouping symbols on the invalid-draft branch, preserving invalid precision and
    range ordering; no product surface or backend behavior was added.
  - `[medium]` `[patch]` `web-search.integration.test.ts` hashed JSON bytes that the mandatory
    commit formatter would change — a read-only Prettier comparison demonstrated the mismatch.
    `copySurfaceEvidence` formats with the repository configuration before copying/hashing;
    regression checks formatter idempotence and unchanged image bytes. Before bulk formatting,
    preserve all 464 original JSON files, including all four original manifests, in
    `apps/web/.impeccable/review/search-preformat-raw-evidence.tar.gz`, verify every archived
    original digest, then regenerate the 384 canonical surface digests. Hooks and ignores remain
    unchanged; canonical derivatives do not replace or erase the archived original evidence.
  - `[medium]` `[patch]` the outer campaign `finally` could replace assertion/Compose failure with
    browser/reporting failure and claim removal after rejected teardown — tracing confirmed
    `withCampaign` aggregates owned teardown, but the outer `finally` did not preserve it.
    `runSearchCampaign` uses existing `preserveCleanup`/`cleanupAll` for the entire lifecycle; every
    report is attempted and the removal timestamp is assigned only after owned work and teardown
    resolve. Regressions preserve primary, browser and reporting failures together, including falsy
    throws, and reject fabricated teardown success. Failed work with successful teardown
    conservatively retains an unconfirmed timestamp, rather than asserting success.

## Design Notes

Inherited code-led Placa, candidate 4, seed `3d3cd1ae`; pinned Search/Filters composition, no new
world, tournament, raster or global token change. Native controls and familiar navigation prevail.
Phone Filters uses the authored enamel close bar/porcelain sheet; desktop uses the existing shell
and bounded readable form, not a narrow stretched phone card. Search keeps plate first, compact
chips/order/median over aligned ruled rows. Extra evidence belongs in labelled native disclosures.
D-059 distinguishes five real prepared results from illustrated 212/1037 values and event-fed
Overview statistics. PropertyRow is semantic non-link until entry 7 supplies its genuine route.
Map/alert control absence is intentional unavailable scope, never a disabled illusion.

Key presentation-only conversion contract:

```ts
type FilterGroup = {
  readonly id: string;
  readonly keys: readonly (keyof SearchQuery)[];
};
// Groups are type, asking range, per-m² range, area, bedrooms,
// bathrooms, parking, time, reduced, returned, multiple listings.
// A diagnostic names a group only after server(previous).totalItems > 0
// and server(previous + group).totalItems === 0.
```

Test data: city five properties, median 951220 minor units/m²; house one; bedrooms >=3 three;
bathrooms >=3 one; parking >=2 two; exact area82 two; reduced three; returned one; multiple three.
All fixtures exceed180 days, so >90/>180 both give five and <=30/31–90 give zero. Studio/commercial/
land have zero. Default twenty cannot expose load-more with only five actual properties; isolated
component pages and smaller API-page evidence prove mechanics without inventing production data.

## Verification

Pre-ROUND1 implementation verification completed on 2026-10-12, before parent acceptance/review:

- Final lint/context boundaries/migration conventions, all-workspace typecheck including strict
  integration, all-workspace tests and build passed. Unit totals: contracts 183, domain 649, AI 212,
  web 268, application 222, infrastructure 444, API 197, worker 227 (2,402 total).
- Final unchanged coverage gates passed in every workspace. Web: statements 97.03%, branches 92.94%,
  functions 97%, lines 97.99%. Search: statements 94.88%, branches 91.93%, functions 92.7%, lines
  95.54%.
- Typed integration/cleanup support passed: 4 files, 25 tests, 10.50s. Integration discovery
  includes the new Search campaign and all incumbent campaigns. `git diff --check` passed.
- Final real Search + web-place regression command passed: 2 files, 2 tests, 226.93s total. Search's
  own recorded start-to-owned-teardown interval is 63.265s; individual Vitest timings were not
  emitted by the final reporter. The unmodified long-breadcrumb ancestor assertion passed, as did
  the incumbent acquisition/Overview/Ask/navigation/error/local-font journeys.
- Final run: `apps/web/.impeccable/review/campaigns/search-2026-10-12T13-22-52-637Z-5b00776e/`.
  Structural ledger audit: 8 catalog cases, 8 approved, zero executor errors, zero pending or
  integrity errors. Owned stack teardown: `2026-10-12T13:23:55.902Z`; read-only post-check found no
  running containers. Foreign stopped resources were not touched.
- Immutable final surface evidence is under that run's `evidence/SEARCH-008-7/`: 48 full/top PNGs,
  24 full-page axe reports, 24 keyboard/target/focus interaction reports and a `surfaces.json`
  SHA-256 manifest. All 24 surfaces passed native targets >=44px, local-font checks, no horizontal
  overflow, no external/unexpected API reads and axe zero violations without rule exclusions.
  Filters keyboard evidence includes exact PT/EN money-to-request units/current server preview;
  Search includes Enter disclosure activation. Axe incomplete/manual items are retained.
- Review aliases use
  `apps/web/.impeccable/review/{search|filters}-{sao-paulo-bela-vista|sao-paulo}-` followed by
  `{390|960|1440}-{pt-BR|en}` and `.png`, `-top.png`, `-accessibility.json` or `-interaction.json`.
  Parent has not yet performed finite visual inspection, authored reference capture, fresh finish
  reviewer or documenter handoffs; the last task stays unchecked and the story stays in-progress
  until those acceptance steps finish. No production/VPS proof or commit.

ROUND1 correction verification completed on 2026-10-12, ready for parent ROUND2:

- All-workspace lint/context/migration gates, strict typecheck, tests and build passed again. Web
  has 280 tests; the unchanged other workspace totals give 2,414 unit tests. The targeted Search
  outer-component file passed all 28 cases, including every actual hierarchy ID/name mapping and
  neighborhood/block versus city/zone comparisons plus independent retry.
- Every unchanged coverage gate passed again. Web: statements 97.63%, branches 93.35%, functions
  98.3%, lines 98.5%. Search: 96.28%, 92.62%, 95.91%, 96.78%, respectively. The equivalent web-only
  rerun also emitted `.impeccable/review/search-round2-coverage/coverage-summary.json`; thresholds,
  inclusion and exclusions are identical to the repository script. Typed support: 4 files, 25 tests,
  2.41s; integration discovery, formatting and `git diff --check` passed.
- Real Search plus web-place: 2 files, 2 tests passed in 240.29s. Native reporter timings: Search
  file 64.449s / journey 64.448s; web-place file 172.924s / journey 172.923s. Full native precision
  is retained in `apps/web/.impeccable/review/search-round2-2026-10-12-final-vitest.json`.
- Current run: `apps/web/.impeccable/review/campaigns/search-2026-10-12T13-46-38-040Z-207991e1/`.
  The ledger audit gives 8 approved distinct scenarios, zero executor errors/pending/integrity
  errors. Owned teardown completed at `2026-10-12T13:47:42.484Z`; `docker ps` was empty afterwards.
  Previous successful and failed runs remain intact and are not mixed into this version's verdict.
- Immutable ROUND2 evidence is that run's `evidence/SEARCH-008-7/`: all 96 SHA-256 manifest entries
  verified, comprising 48 full/top PNGs, 24 whole-page axe reports (zero violations and incomplete
  items), and 24 interaction reports. Mobile Filters actually starts its condensed uppercase close
  header at y=0, joins the rounded porcelain sheet at y=72px, displays the grab and 20px form gap,
  uses muted 400-weight range labels, hides only the mobile shell and shows the complete selected
  actual path without overflow. Search/mobile restores its shell; desktop keeps its incumbent
  rail/navigation/plate. All existing target/font/keyboard/API-boundary checks remain.
- Parent ROUND1/reference comparison is complete. ROUND2 visual inspection, the fresh finish
  reviewer and documenter/acceptance remain with the parent; the story is still in-progress and the
  last task remains unchecked. No additional visual hunt, production/VPS proof or commit.

Parent verification and finish handoffs completed on 2026-10-12:

- Independent root executions passed lint, strict workspace/integration typecheck, all 2,414 unit
  tests and all builds. Unchanged coverage thresholds passed in every workspace; web and Search
  retained the ROUND1 correction percentages above. The scoped Search execution ran all 64 tests in
  three files; the PropertyRow/formatter execution ran all 14 tests in two files. The typed
  integration support execution ran all 25 tests in four files, and discovery passed.
- Independent real-service Search and web-place execution passed both files/tests in 222.13s. Its
  Search campaign is
  `apps/web/.impeccable/review/campaigns/search-2026-10-12T13-55-38-243Z-ad1d70fc/`: all eight
  distinct scenarios are approved, no executor error is recorded, and owned teardown completed at
  `2026-10-12T13:56:42.751Z`. A subsequent `docker ps` found no running containers.
- Parent ROUND2 opened all 48 immutable Search/Filters captures and all three authored critique
  references. No additional material correction was found. The detector ran once and returned an
  empty finding list. The independent finish reviewer returned `disposition: ship` with all five
  required sections and no material fixes in
  [the finish report](../../../apps/web/.impeccable/review/search-finish-review.md).
- The fresh documenter reconciled this ordinary Placa extension in
  [the documentation report](../../../apps/web/.impeccable/review/search-documentation-reconciliation.md).
  Parent checked the reported SHA-256 values: DESIGN, its sidecar and PRODUCT remain unchanged.
  Pre-existing documentation drift is reported, not repaired or promoted into new rules.
- Both staged and unstaged whitespace checks passed. These records establish executed local
  verification and scoped visual/documentation completion, not final BMAD acceptance or a commit.
  The final task remains unchecked pending the parent's remaining unified-diff/review workflow.

Matrix test evidence (all named covering cases ran and passed in the independent root executions):

| Matrix row              | Executed covering case                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepared search         | `SearchResults` PT/EN prepared rows/median cases; real Search scenario SEARCH-001.                                                                                         |
| Every filter            | `sends every editor field and ordering through the complete query boundary`; real SEARCH-001.                                                                              |
| Unit formatting         | `validates ranges before requests and converts money/area exactly`; state money precision/overflow cases and both formatter locales.                                       |
| Sorting                 | Complete editor/query boundary case and `appends actual pages, retries next-page errors without discarding rows, and resets on sorting`; real SEARCH-002.                  |
| Empty attribution       | `attributes reduced/returned zero to returned, relaxes it and widens through real ancestry`; positive-to-zero and existing-zero diagnostic cases.                          |
| Empty recovery          | The same relax/widen case plus `uses neutral empty wording and independent explicit retries for failed attribution and results`; real SEARCH-005/006.                      |
| Draft editing           | `edits and clears only a draft, cancels unchanged, applies false and navigates history`; `ignores obsolete draft counts and disables Apply during pending/error previews`. |
| Malformed URL           | `rejects malformed URLs and clears to a genuine valid search without forwarding them`; state duplicate/unknown/invalid input cases; real SEARCH-004.                       |
| Explicit false          | `preserves compatible deep-link types, zero room minima and all explicit-false flags`; draft/history case; real SEARCH-003.                                                |
| Navigation              | Draft/history, obsolete preview and `keeps draft amounts valid when locale changes` cases; real SEARCH-003 and incumbent web-place journey.                                |
| Pagination              | Actual page append/error retry/reset case and real SEARCH-002 whole-result median/order readback.                                                                          |
| Neighborhood comparison | All four neighborhood/block/city/zone comparison cases and `retries a failed neighborhood comparison independently without losing actual block results`.                   |
| Null/zero               | PropertyRow PT/EN `preserves missing and zero values`, comparison -3.1/0/3.1 cases, plus Search count 0/1/2 cases in both locales.                                         |

**Commands:**

- `pnpm --filter @rei/web exec vitest run --dir src` — targeted fail-first/pass plus all web tests.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all eight workspaces
  pass, including strict integration TypeScript and unchanged context-boundary gates.
- `pnpm run test:coverage` — every existing workspace threshold passes, no ignored new functions.
- Real HTTP/browser journeys pass and fixtures clean. The final ROUND2 execution retained precise
  timings with the native JSON reporter:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts integration/web-search.integration.test.ts integration/web-place.integration.test.ts --reporter=default --reporter=json --outputFile.json=apps/web/.impeccable/review/search-round2-2026-10-12-final-vitest.json
  ```

- Typed Vitest standard/cleanup regressions pass:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts integration/support/convention.test.ts integration/support/fixture.test.ts integration/support/http.test.ts integration/source-register-cleanup.test.ts
  ```

- `pnpm run test:integration:list` — discovers TypeScript Search campaign and all existing
  campaigns.
- `git diff --check` — no whitespace errors; parent reads full diff against canonical baseline.

Visual verification: at most two parent batched inspect/correction rounds over every Search/Filters
390/960/1440 PT/EN full/top screenshot and actual authored reference captures. Open every file,
settled from document top; distinguish screenshot validity from fidelity. Detect changed targets
once after second round; mandatory fresh context-free finish reviewer plus documenter preserve
incumbent DESIGN/sidecar, no drift repair. Follow the skill's finite listed-finding fix/verdict
budget; do not claim whole-surface approval from a fixes-only verdict. No production/VPS proof
claimed.

## Auto Run Result

Status: built. The full-route implementation and quick review are complete. Parent acceptance
remains a distinct ticket transition after the reviewed implementation, tests and evidence are
committed. No push or production/VPS action is part of this result.

### Implemented change and changed files

The prepared Search entry now has server-backed results, ordering, pagination, median evidence,
shareable applied filters, a cancellable draft editor with actual count previews, and truthful
empty/error recovery. PT/EN formatting and the pinned mobile/desktop Placa surfaces are retained.

- `apps/web/src/main.tsx` — register the Search translations in the existing application.
- `apps/web/src/routes.tsx` — route the Search entry to its actual implemented screen.
- `apps/web/src/places/formatters.ts` — preserve exact integer minor-unit money formatting.
- `apps/web/src/places/resources.ts` — supply shared filter-recovery translations.
- `apps/web/src/search/SearchFilters.tsx` — edit, validate and preview only the current draft.
- `apps/web/src/search/SearchMedian.tsx` — render server median evidence and comparison limits.
- `apps/web/src/search/SearchResults.tsx` — compose rows, ordering, filters and system states.
- `apps/web/src/search/search-client.ts` — validate the public Search read boundary.
- `apps/web/src/search/search-diagnostics.ts` — attribute an empty result only with server evidence.
- `apps/web/src/search/search-queries.ts` — key complete reads and discard inactive pagination.
- `apps/web/src/search/search-resources.ts` — provide the complete English and PT Search copy.
- `apps/web/src/search/search-state.ts` — normalize URL/draft state and exact numeric conversions.
- `apps/web/src/shared/PropertyRow.tsx` — support truthful non-link rows until the Property route.
- `apps/web/src/shared/SystemStates.tsx` — expose explicit, genuine filter recovery actions.
- `apps/web/src/styles/search.css` — implement the pinned responsive Search/Filters composition.
- `apps/web/vite.config.ts` — expose authored Search/Filters reference entries for inspection.
- `apps/web/src/places/formatters.test.ts` — check exact money and missing/zero values.
- `apps/web/src/search/SearchResults.test.tsx` — prove the outer-component acceptance matrix.
- `apps/web/src/search/search-client.test.ts` — verify public reads and invalid response handling.
- `apps/web/src/search/search-state.test.ts` — verify URL, range, numeric and explicit-false state.
- `apps/web/src/shell/PlaceEntry.test.tsx` — retain incumbent entry/navigation contracts.
- `integration/support/search-reads.ts` — observe actual Search requests and parsed responses.
- `integration/support/search-campaign.ts` — preserve lifecycle failures and hash canonical bytes.
- `integration/support/search-campaign.test.ts` — verify canonical evidence and cleanup aggregation.
- `integration/web-search.integration.test.ts` — execute eight owned real-service browser scenarios.
- `integration/web-place.integration.test.ts` — retain the incumbent Place/navigation regression.
- This plan and `epic-web.md` — record the reviewed contract, verification and D-059 decision.
- `apps/web/.impeccable/surfaces/src-search-searchresults-tsx.md` — reconcile finite visual
  completion.
- `apps/web/.impeccable/review/` — retain scoped captures, accessibility/interaction reports, native
  Vitest results, campaign ledgers, finish/documentation reports and the raw evidence archive.

### Review disposition

The initial quick pass found three medium defects; the follow-up found one medium defect. All four
are verified, patched and individually recorded in the Review Triage Log. There are zero
high/low/false/maybe-false findings, deferred items or rejected findings. No intent or acceptance
criterion was changed. Patched totals: high 0, medium 4, low 0; the follow-up alone patched high 0,
medium 1. `followup_review_recommended: false`: the follow-up converged, and no specific unverified
patch risk remains. The original implementation agent was unavailable for continuation, so the
parent applied the smallest fixes and reran full verification.

### Final post-review verification

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed after the final
  pagination correction. All 2,418 unit tests passed: contracts 183, domain 649, AI 212, web 284,
  application 222, infrastructure 444, API 197 and worker 227. Strict integration TypeScript and the
  unchanged lint/context gates passed. No threshold or exclusion was relaxed.
- `pnpm run test:coverage` passed every unchanged workspace coverage gate.
- The three focused Search test files passed all 68 cases. The five typed convention/fixture/
  HTTP/Search lifecycle/source-register cleanup support files passed all 29 cases.
- `pnpm run test:integration:list` successfully discovered 84 tests/campaigns. This is discovery,
  not a claim that all 84 were executed. Discovery was rerun after a simultaneous build finished;
  the earlier transient missing compiled module was not hidden with an exclusion.
- Real Search and Place browser campaigns passed both files/tests in 233.31s. Native journey timings
  are Search 74.447s and Place 156.896s; the precise report is
  `apps/web/.impeccable/review/search-review-converged-2026-10-12-vitest.json`.
- Final Search run: `campaigns/search-2026-10-12T14-31-56-063Z-51e04fa2/` under the review
  directory. Eight distinct scenarios are approved, including invalid-draft locale changes and A–B–A
  pagination. Owned teardown completed at `2026-10-12T14:33:10.457Z`. A read-only `docker ps` after
  both campaigns completed found no running containers.
- The final run has 96 verified surface hashes, 48 full/top PNGs, 24 axe reports with zero
  violations/incomplete items and 24 passing interaction reports. All 48 PNGs are byte-identical to
  the fully inspected ROUND2 evidence; this connects the current runtime proof to the finite visual
  verdict without inventing a fresh visual review or a third hunt. The full JS/CSS artifact hash is
  `7c89c3686c5cc150333899237d18051b6f761c3c546570cf6005b12ff26a867e`; `webSourceHash` identifies
  only `SearchResults.tsx`, not the whole source tree.
- Every manifest across the five completed capture runs was verified after canonical formatting: 480
  file digests. The preserved archive's SHA-256 and every one of its 464 original files were
  verified independently; neither failed runs nor original pre-format evidence were discarded.
- Parent inspected all 48 ROUND2 captures and three authored references. The detector ran once with
  no findings; the independent finish verdict was ship and the documenter completed its
  reconciliation. Incumbent DESIGN, its sidecar and PRODUCT hashes remain unchanged.

### Residual limits

Verification is local, against prepared synthetic data and owned production-built services, not
production/VPS availability or real-source collection. Identical filter outcomes are reported
truthfully. Automated axe/keyboard evidence does not claim a manual screen-reader certification. The
pre-existing build chunk-size warning remains; no build gate was weakened. The failed locale fixture
run and all historical verification snapshots remain available as explicitly historical evidence,
not as the final verdict.
