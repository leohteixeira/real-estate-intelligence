---
title: 'Place overview complete'
type: 'feature'
ticket: '5'
created: '2026-10-12'
status: done
baseline_revision: '051b56748e8454821b478672ab59d958d39b2310'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/apps/web/DESIGN.md
  - /workspace/repos/real-estate-intelligence/apps/web/.impeccable/surfaces/src-places-placeoverview-tsx.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md
  - /workspace/repos/real-estate-intelligence/_bmad-output/initiative-real-estate-intelligence/epic-web/epic-web.md
warnings: [oversized]
deferred: []
---

# Place overview complete Implementation Plan

**Goal:** Complete the public Placa overview with every place-section element and truthful evidence.

**Architecture:** Extend the existing abortable public client and single Query cache. Small React
sections render contract-owned values; independent section failures retain other sections. The
existing Placa world is fixed; D-057 resolves prepared/live data and incremental destination conflicts.

**Tech Stack:** Existing React, Router, Query, i18next, Vitest/Testing Library, typed Vitest integration,
Supertest/Testcontainers/Nock, Playwright and axe. No new dependency or backend change.

**Execution:** BMad full-route handoff and this plan location supersede interactive writing-plans
defaults under D-052/D-054/D-057. No approval, alternate plan, worktree, commit or push by implementer.
Full auto route: independent sections, parsers, retained reads and browser coverage exceed 100 lines.

<!-- prettier-ignore-start -->

<intent-contract>

## Intent

**Problem:** The public place screen only shows its plate and live asking median, leaving the rest
of the authored overview inaccessible. Visitors cannot read the parent's median or contextual figures.

**Approach:** Complete ux.md's Place overview using existing public endpoints, with explicit origin,
individual provenance, honest unavailable states, independent recovery and working scoped navigation.

## Boundaries & Constraints

**Always:** Preserve D-052 through D-057 and ADR 0028. Live place/parent medians remain event-fed;
prepared counts/other figures/neighbours/series are explicitly separate. Every figure has its own
actual contributor/source/computed/freshness evidence. Use actual immediate parent, canonical names,
UTC and BRL. Percent contract values are percentage points, not fractions. Retain Query cancellation,
single cache and retry:false. Use the existing local fonts/tokens/44px targets and full-page axe without
exclusions; strict TypeScript integration and 80/80/80/75 floors remain intact. Read craft-floor
immediately before UI editing; context already ran once, so do not rerun or roll a concept.

**Never:** Read .env*, access VPS/providers/real sources, weaken gates, fabricate market values, infer
geography/freshness/source failure, replace persisted reductions with prepared reductions, add absent
Property routes, protected/V2 controls, search filters or executed Ask runs. No business calculation
in the browser; chart scaling and percentage-unit conversion are presentation only. No shipping raster,
new palette/world, unrelated drift repair, source deletion, broad Docker cleanup or manual Node harness.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Complete place | Valid acquired Bela Vista and existing prepared auxiliary reads | Counts; live median/parent; six-month movement; days; 30-day count/percentage; ratio; unavailable Sale; neighbours; 12 months; schematic; reduction rows and all-properties link | Each origin and figure's evidence explicit |
| Zero/null | Available zero movement/count/ratio or insufficient figure; unrecorded sale | Zero stays zero; unavailable stays words, never zero price; Sale tag retained | No invented replacements |
| Parent/adjacency | Immediate zone parent, no parent country, no neighbours | Correct registered parent and comparison; omit absent parent; named empty neighbours | No assumed city/adjacency |
| Series gaps | Exactly 12 contract months with unavailable values | Backend values, actual comparison name, broken lines for gaps, accessible table/point evidence | No interpolation or live/prepared continuity claim |
| Reductions | Persisted top-three history plus actual property detail, or no history | Property rows with true Asking values; historical previous/current/percent/source/time distinct from deviation; rows and all-properties link lead to same-place Search | No prepared fallback; detail failure preserves history evidence and offers manual recovery |
| Question | Nonempty place-scoped draft, including markup and Unicode | Native form forwards escaped draft to same-place Ask via navigation state, explicit not submitted/executed | Empty text does not navigate; no question in URL/log/local storage and no write requests |
| Independent failure | Initial ancillary 503/malformed payload, or cached same-place refresh failure | Other panels/plate/live median stay; section names failure and manual retry; retained validated values survive | Sanitized error, valid public UUID only, retry:false |
| Navigation | Delayed old-place auxiliary reads then route changes | Old reads aborted; no old figures/rows or draft bleed into new place | Invalid ID makes no requests; 404 keeps existing honest behavior |
| Layout/locale | PT/EN at 390/960/1440, long names/evidence | Mobile authored order; desktop rail/header and map beside reductions, series beside neighbours; wrapping/native focus/local fonts | No page overflow, clipped words or invented artboard numbers |

</intent-contract>

<!-- prettier-ignore-end -->

## Code Map

- `apps/web/src/places/place-client.ts`, `place-queries.ts`: existing unknown JSON parser boundary,
  id/response identity, signal propagation and explicit policy. Add separately keyed neighbours,
  series, reductions and public property detail reads. `market` basis restriction must remain.
- `packages/contracts/src/market/market.read.types.ts`, `market.read.dto.ts`: public parsers and
  per-figure evidence. Neighbours/series basis is prepared-market-example. Overview's prepared
  timestamp is preparedEvaluatedAt; only median/parent are event-fed. Country has no parent.
- `packages/contracts/src/properties/properties.read.types.ts`, `properties.read.dto.ts`: Reduction
  is history, not PropertySummary; detail enrichment supplies property.summary. Largest reductions
  is persisted-only, pageSize 1–20; use 3. Historical reductionPercent already means percentage points.
- `apps/web/src/places/PlaceOverview.tsx`, `PlacePlate.tsx`, `formatters.ts`, `resources.ts`:
  retained live median and known plate, additive counts/header question/paired resources. Divide
  percentage points by 100 only when using current fraction-oriented formatPercentage.
- `apps/web/src/shared/Figure.tsx`, `Provenance.tsx`, `PropertyRow.tsx`, `SystemStates.tsx`: reuse
  money anatomy; additive metric figure support is permitted. Evidence recordCount for 30-day
  reductions counts contributing listings, not properties; add typed contributor-unit support.
  Reduction rows can use PropertyRow linking existing place Search, with separate historical evidence.
- `apps/web/src/shell/PlaceEntry.tsx`: validate navigation-state draft for matching Ask place;
  render escaped text and not-executed statement. Never put draft in URL or persistent preferences.
- `apps/web/src/styles/place.css`, `styles/components.css`, `styles/tokens.css`: reuse existing
  plate/header, fig/fig--s/figs, band/panel/cols, prow, map and chart grammar. CSS extensions in
  place.css or a focused imported overview stylesheet, no durable token change.
- `docs/design/canvas/project/Main.dc.html`, `PlaceEN.dc.html`, `DesktopPlace.dc.html`: actual
  reference artboards, not a nonexistent Place.dc.html. Desktop search filters are another story.
  Pinheiros-specific map SVG must not be presented as Bela Vista geography. Use honest local SVG
  schematic based on returned place/adjacent identities; no external tiles/images/coordinates claims.
- `integration/web-place.integration.test.ts`, `support/system-state-reads.ts`: owned synthetic
  acquisition/proxy/browser evidence, dimensions/locales, sandbox and loopback. Existing unscoped
  .fig\_\_value and .place-provenance locators must become .place-median-scoped, preserving assertions.
  Extend exact API allowlist, not arbitrary HTTP permission. Existing shared/states fixtures stay.
- `integration/support/accessibility.ts`: unchanged full-page harness, distinct evidence names,
  violations/incomplete tracked separately. Capture source hashes and exact artboard dimensions.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/places/place-client.test.ts`, `place-client.ts`, `place-queries.ts` — start with
      failing parser/identity/invalid-ID/abort tests, then extend validated reads and place-scoped keys.
      Bounded reductions enrich three public details serially or with a hard cap, never unlimited fan-out.
      Golden boundary: `client.series(id, signal)` uses `parsePlaceMarketSeriesResponse`; wrong
      `result.place.id` rejects with `PlaceReadError(502)`; signal passes unchanged.
- [x] `apps/web/.impeccable/surfaces/src-places-placeoverview-tsx.md` — update the existing brief
      for this extension and D-057 before UI edits, retaining six Direction contract blocks and inherited
      seed 3d3cd1ae. Re-read all blocks once; do not copy the contract into shipping code.
- [x] `apps/web/src/places/PlaceOverview.test.tsx`, focused tests and existing fixtures —
      add and run RED cases for every matrix row before implementation.
      Existing readers must dispatch
      every new endpoint explicitly, not return a PlaceResponse for all unmatched paths. Preserve live
      951515 median/contributor tests despite deliberately different prepared counts.
- [x] `apps/web/src/places/PlaceOverview.tsx`, `PlacePlate.tsx`, new focused overview section files,
      shared figure/provenance as needed, `resources.ts`, `styles/place.css` — implement complete
      composition, counts disclosure, true parent, other figures, 12-month chart plus accessible values
      and evidence, neighbours, schematic and persisted reductions. Keep components cohesive/small.
      Figure example: `movement.state === 'available'` displays
      `formatPercentage(movement.value / 100, locale)` with its own evidence and prepared label;
      `movement.state === 'insufficient-data'` displays localized unavailability plus evidence.
      Sale always uses the Sale tag with None available, never a fabricated amount.
- [x] `apps/web/src/places/PlaceQuestion.tsx`, `apps/web/src/shell/PlaceEntry.tsx`, paired resources
      and tests — native required field calls `navigate(destinationPath('ask', place.id),
{ state: { placeId: place.id, questionDraft: draft.trim() } })`; destination validates unknown
      state and matching place, displays escaped draft and explicitly not executed. No POST or URL text.
- [x] `integration/web-place.integration.test.ts`, `integration/support/system-state-reads.ts` and
      focused typed support if needed — scope existing median locators, extend full-page real-stack
      read evidence and keyboard draft/Search/parent/neighbour paths. Verify empty persisted history
      after initial acquisition and a genuine persisted history-change path for reduction rows using
      existing synthetic/history acquisition helpers, not prepared adapter fallback or API fulfillment.
      Forced ancillary HTTP failure/delay and recovery may intercept only its exact owned route.
      Preserve safe fixture teardown/foreign resources. Tests/probes must be TypeScript/Vitest.
- [x] Run focused web RED/GREEN, lint/typecheck/test/build and unchanged coverage; append exact
      commands/results and matrix-to-test proof under Implementation Notes. No skipped matrix row.
- [x] Parent performs at most two batched render rounds for six locale/width captures plus three
      artboard references, opens every named final PNG, records source hash/fonts/geometry, runs detector
      once on changed targets, then mandatory fresh Impeccable finish reviewer and shipped documenter.
      Implementer may create/extend captures but does not independently run finish agents or commits.

**Acceptance Criteria:**

- Given acquired synthetic data on owned Compose, when opening Bela Vista in each locale and width,
  then every element in ux.md's Place section is visible from validated endpoints with honest origin.
- Given a prepared figure alongside live median, when reading its number and provenance, then its
  own unit/count/sources/time and prepared origin are identifiable without implying a collected value.
- Given a place with no recorded reductions/sales/neighbours or an unavailable monthly point, when
  opening the panel, then explicit unavailable/empty/gap presentation replaces neither zero nor rows.
- Given a local panel failure, when using its keyboard-accessible retry, then the real panel recovers
  without resetting the selected place, sibling figures, locale or draft.
- Given a typed question, when continuing to Ask, then matching escaped draft is visible and marked
  not executed, the URL contains only place identity and network evidence contains no write request.
- Given both authored compositions, when viewing 390/960/1440px PT/EN and keyboard navigation,
  then the Placa layout, local typography, full wrapping, 44px targets, visible focus and axe pass.

## Implementation Notes

### Implementation handoff — 2026-10-12

- Loaded every frontmatter context file before implementation. Updated and reread all six surface
  Direction blocks, preserving the inherited Placa world and seed. Read craft-floor before UI edits.
- Added public-parser-bound ancillary clients and separately keyed abortable Query reads. Reduction
  response is hard-bounded to three details; descendant street-block rows are valid for a neighbourhood
  request, so no incorrect row-place equality assumption is applied.
- Completed live/actual-parent figures, independently labeled prepared counts and contextual figures,
  per-figure provenance, listing contributor units, twelve monthly points with gaps and accessible point
  evidence, named neighbours and a non-geographic identity schematic. Persisted history and enrichment
  failure/retry remain separate. Native question navigation carries only an escaped, trimmed Ask draft.
- RED: ancillary client test first failed against the missing methods; focused overview suite first
  failed nine feature cases before implementation. GREEN: all 18 web files, 202 tests. Positive ancillary
  fixtures now also pass the actual public parsers before any screen test.
- Existing PlaceOverview/AppShell fixtures now explicitly dispatch new owned routes. Unit evidence
  scopes live assertions to `.place-median`, retaining the real 951515 minor-unit/one-contributor case.
- Integration additions are parent-owned TypeScript: scoped live selectors, exact allowlist, real
  ancillary recovery/draft journeys and real persisted-history acquisition. Their strict type check
  passes; real-service browser and final visual/finish acceptance remain parent-owned at this handoff.

| Matrix row                        | Unit proof                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Complete place / distinct origins | `PlaceOverview.complete.test.tsx`, both locales; deliberately different 1/2000/2500 contributor counts                                    |
| Zero/null and unit conversion     | Validated zero movement/days/reduction counts; unavailable Sale; +3.1 percentage-point movement and 10% reductions; zero metric presenter |
| Parent/adjacency                  | Actual Centro identity, parent omission for Brasil, empty Pinheiros neighbours                                                            |
| Twelve months/gaps                | Positive public series parser, twelve accessible rows, two subject paths around unavailable point                                         |
| Persisted reductions              | Separate previous/current amounts, percentage, source/time and manual detail recovery; retained history, same-place Search link           |
| Question/state safety             | Whitespace, markup/Unicode escaping, no URL/storage/write, unknown/wrong-place state and Search rejection                                 |
| Independent failure               | Initial malformed and cached failed reads for all three panels, sanitized manual retry, siblings/draft retained                           |
| Navigation/cancellation           | Three delayed auxiliary reads aborted; new-place draft reset and no old live value                                                        |
| Layout/locale                     | PT/EN unit composition; parent-owned real browser widths/focus/full-page axe and final PNG inspection pending                             |

The public contract requires `activeListings >= properties` and an available ratio to equal their
quotient. An available zero ratio cannot currently be a valid HTTP fixture. Its zero-preserving display
is therefore covered directly in the presenter, without inventing invalid public data or changing the
backend contract.

Verified after implementation:

- `pnpm --filter @rei/web test`: 18 files / 202 tests pass.
- `pnpm run lint`: passes, including context and migration convention checks, with no warnings.
- `pnpm run typecheck`: all workspaces and strict `tsconfig.integration.json` pass.
- `pnpm run test`: all eight workspaces pass, 200 files / 2336 tests total.
- `pnpm run build`: all workspaces pass; Vite retains a non-failing chunk-size advisory (main chunk
  662.59 kB and lazy CityScene 536.96 kB). No threshold was changed.
- `pnpm run test:coverage`: all eight unchanged 80/80/80/75 gates pass. Web: statements 98.60%,
  branches 91.47%, functions 100%, lines 99.69%. Infrastructure remains the narrowest existing
  branch margin at 75.66%; no coverage configuration or exclusion was changed.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/support integration/source-register-cleanup.test.ts`:
  four files / 25 deterministic support tests pass with parent integration additions present.
- `pnpm run test:integration:list`: passes; TypeScript campaigns and support tests are discovered.

## Plan Change Log

### Parent verification of the final D-058 correction batch — 2026-10-12

- Full root `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:coverage`
  exited successfully after the final source changes. All eight workspaces, strict integration
  TypeScript and unchanged coverage policies passed. The web suite passed 19 files / 214 tests;
  focused web coverage is 98.66% statements, 93.70% branches, 100% functions and 99.71% lines.
  Infrastructure retains 75.66% branch coverage; no limit, exclusion or assertion was weakened.
- The final four-file real-service/browser invocation from Verification, including
  `integration/overview-layout.integration.test.ts`, passed six tests in 258.86 seconds. Three
  layout regressions accompany the three actual owned service/browser campaigns. The real
  disclosure helper checks the closed default band and tick boxes before keyboard opening;
  individually scoped full evidence, twelve rows, twenty-four point disclosures and separate
  neighbour evidence remain exercised. Genuine acquisition, persisted reductions, independent
  retry and draft-only Ask/Search navigation still run against the owned local stack.
- Four support files / twenty-five tests, integration discovery and both diff whitespace checks
  passed. Parent independently confirmed there are no JavaScript integration files; new helpers
  and layout regressions remain TypeScript/Vitest under the strict root integration configuration.
- Parent opened all twelve final full/top Overview PNGs and all three authored-reference PNGs,
  verifying loaded content, matching locale/width and correct document-top captures. The eighteen
  default/expanded/recovered Overview axe reports and both persisted-reduction reports have zero
  violations and zero incomplete results. Reference hashes are unchanged; five bundled font faces
  loaded with no outside requests. This automated evidence is not full WCAG certification.
- All nine read-only intent-matrix rows retain the executed passing unit/browser proofs in the
  matrix table below. The final geometry regressions additionally cover concise closed summaries,
  opened full UTC/freshness/source evidence, localized non-overlapping ticks and the unchanged
  48px/28px figure hierarchy at 390/960/1440 in both locales.
- The same independent finish reviewer is scoring the original finite six-finding list after
  the second and final correction batch; documentation verification preserves incumbent DESIGN.md
  and its sidecar. Their outcomes and BMad acceptance remain pending here. No VPS access, live
  source, token change, additional detector, commit or acceptance is inferred from passing tests.

### D-058 final two-item correction handoff — 2026-10-12

- Reloaded the complete current plan and all frontmatter context. Applied only the two partial
  findings in the final correction handoff, retaining all previously resolved corrections and the
  read-only intent-contract. Read craft-floor immediately before UI edits; no context or seed rerun.
- Figure defaults now show concise, individually scoped origin and contributor-count summaries.
  Opening each native disclosure retains the full origin, actual contributor unit/count, UTC
  computation, freshness, canonical source names and every URL. The actual parent is a native
  44px link within its comparison label. The 960px band uses a lead/comparison row and five context
  columns; wide desktops place all seven figures inline. Normative 48px/28px values are unchanged.
  Sale remains unavailable in words with its tag; its complete source explanation is retained in
  its own evidence disclosure rather than expanding the default band.
- Chart ticks now label the supplied first, middle and final months using the existing localized
  UTC formatter. Supplied price ranges, actual identities, gaps, endpoints and equal coordinates
  remain unchanged. A pure presentation helper supplies the same ticks to the shipping chart and
  the focused layout regression.
- RED: two new PT/EN compact-evidence cases failed on the prior narrative summary, while all
  212 existing web tests passed. The new Chromium tick-box regression reproduced the exact 960px
  Portuguese July/October collision: October began at 517.98px, before July's 525.08px right edge.
  The compact-band regression additionally rejected an intermediate 505.81px 960px PT specimen;
  the completed compact default passes without reducing typography or clipping controls.
- GREEN: web tests and unchanged focused V8 coverage, 19 files / 214 tests. Coverage: 98.66%
  statements, 93.70% branches, 100% functions, 99.71% lines, using the exact include/exclude and
  80/80/80/75 arguments from `scripts/test-coverage.sh`. The behavior tests retain explicit opened
  full count, source URL, UTC and freshness assertions, and check unavailable Sale and its opened
  explanation in both locales.
- GREEN: the following focused command passed:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/overview-layout.integration.test.ts \
    integration/support integration/source-register-cleanup.test.ts
  ```

  five files / 28 tests. PT/EN at 390/960/1440 measure visible localized tick boxes with at least
  4px separation. The seven-figure specimen checks complete default contents, unchanged 48px/28px
  type, visible 44px native controls, no horizontal overflow and a band at most 300px at 1440px
  or 460px at 960px. The existing question/source/paired-panel regression still passes.

- The typed real-service disclosure helper now measures the actual default band and tick boxes
  before keyboard opening. It verifies full individual computation/freshness/count/source evidence
  on opening and still closes every disclosure before normal full/top captures. Parent-owned
  scroll resets, real acquisition/history paths and capture routing remain untouched.
- GREEN: `pnpm run lint` without warnings; `pnpm --filter @rei/web typecheck`;
  `pnpm run typecheck:integration`; `pnpm --filter @rei/web build`. Vite's unchanged non-failing
  size advisory remains (main 665.70 kB, lazy CityScene 536.96 kB). No gate or exclusion changed.
- Parent owns the remaining full repository gates, same six locale/width real-service recaptures,
  same reviewer's final verdict and documentation. No new finding, detector, finish agent,
  screenshot round, palette/token/raster, commit, push or story acceptance was performed here.

### Parent verification of D-058 — 2026-10-12

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:coverage`
  completed successfully after the correction batch. All eight workspaces and strict integration
  TypeScript passed; 201 files / 2346 tests passed. All unchanged coverage gates passed. Focused web
  coverage is 98.65% statements, 93.61% branches, 100% functions and 99.71% lines. Infrastructure's
  branch coverage remains 75.66%; no threshold, exclusion or lint rule was weakened. Vite retains
  its non-failing 665.02 kB / 536.96 kB size advisory.
- The following real-service/browser command

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/web-place.integration.test.ts \
    integration/web-components.integration.test.ts \
    integration/web-system-states.integration.test.ts \
    integration/overview-layout.integration.test.ts
  ```

  passed: four files / four campaigns, 234.69 seconds. Owned production acquisition, raw S3,
  PostgreSQL/outbox/worker and actual HTTP reads remain in the browser path. No VPS or live source
  was used. All six default, six expanded and six recovered Overview axe reports have zero violations
  and zero incomplete results; both real persisted-reduction locale reports also have zero of each.

- `pnpm exec vitest run --config vitest.integration.config.ts integration/support integration/source-register-cleanup.test.ts`
  passed: four files / 25 tests. `pnpm run test:integration:list`, `git diff --check` and
  `git diff --cached --check` passed.
- Parent opened all six full, six top and three source-reference PNGs. The keyboard exercise had
  retained a nonzero scroll position for the two 1440px top captures. The test now explicitly
  resets scrolling before geometry/full capture and again after axe before the top capture, asserting
  `scrollY === 0`. Strict integration TypeScript, focused ESLint and Prettier passed for this test
  change. The real web-place recapture run passed (one file / one campaign, 153.27 seconds).
  Parent reopened all twelve resulting full/top PNGs and confirmed loaded content, matching viewport
  and locale, and the document top in every top capture. The eighteen default/expanded/recovered axe
  reports again contain zero violations and zero incomplete results. The same independent reviewer
  is scoring only the original six material fixes; final verdict and documentation remain pending,
  so acceptance remains open.

| Intent matrix row   | Passing executed proof                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete place      | `PlaceOverview.complete.test.tsx` PT/EN, plus real web-place six width/locale journeys validating distinct live/prepared reads and seven separately accessible figures                                                                        |
| Zero/null           | Executed zero movement/days/count and unavailable Sale unit cases; zero metric presenter for the contract-invalid zero ratio, without changing the public contract                                                                            |
| Parent/adjacency    | Executed actual Centro parent and Brasil parent omission / empty-neighbour unit cases; actual API neighbour identities and same-place browser links                                                                                           |
| Series gaps         | Executed positive parser and twelve-row/gap tests plus `PlaceSeries.chart.test.tsx` equal values, missing segments/endpoints, supplied range/localized ticks and all-unavailable cases; real twelve-month keyboard table/24 point disclosures |
| Reductions          | Executed unit history/enrichment-failure/manual-recovery cases; real initial empty history, genuine second collection to 700000 from 785000, actual persisted 10.8% history and keyboard Search row in both locales                           |
| Question            | Executed whitespace, markup/Unicode, unknown/wrong-place state and Search rejection tests; real keyboard Ask navigation with escaped draft, explicit not executed and no write/URL/storage leakage                                            |
| Independent failure | Executed malformed initial and cached failed ancillary cases for all three panels; actual exact-route 503 then API recovery, retained draft/live median and sanitized errors in all six browser combinations                                  |
| Navigation          | Executed three delayed auxiliary aborts and draft reset; real place/navigation/history/invalid-ID paths retain existing boundary checks                                                                                                       |
| Layout/locale       | Executed strict three-width Chromium layout regression; real PT/EN at 390/960/1440, local fonts, no horizontal overflow, native visible focus/44px targets, default/expanded/recovered full-page axe                                          |

### D-058 correction-batch handoff — 2026-10-12

- Reloaded the current plan and all frontmatter context. Applied only the six numbered finish-review
  corrections, preserving the intent-contract, inherited Direction blocks, tokens, data boundaries,
  cancellation/recovery and unexecuted navigation-state drafts. Craft-floor was read before UI edits.
- Restored compact contextual columns and the actual-parent comparison. Each native per-figure
  disclosure keeps origin, count, UTC computation and freshness identifiable when closed, with full
  provenance and genuine source links on opening. Neighbour comparisons align in three compact
  columns with separate Asking/movement evidence; paired desktop panels top-align.
- The full monthly table now sits in a labelled native disclosure under the chart. Presentation
  helpers in `series-presentation.ts` scale only supplied available values, preserve gaps/equalities,
  and expose segment endpoints. Price ticks, localized month ticks and explicit place/comparison
  legends remain chart-led. No calculated business value or invented zero was introduced.
- Restored the phone question's Porcelain region and ink below the plate, keeping the desktop blue
  header and a dominant input with concise PT/EN continuation copy. Canonical source separators now
  have explicit spacing; complete names, source URLs and 44px targets remain intact.
- RED: the new native-disclosure behavior test failed against the original implementation because
  the live median had no `details` element; all 202 existing web tests passed in that RED run.
  GREEN: `pnpm --filter @rei/web test`, 19 files / 212 tests. Added `PlaceSeries.chart.test.tsx` for
  supplied min/max range, real gaps, localized ticks, endpoint treatment, equal-coordinate comparisons
  and completely unavailable series. Existing evidence assertions explicitly open disclosures.
- GREEN: `pnpm run lint` (no warnings), `pnpm --filter @rei/web typecheck`, and
  `pnpm run typecheck:integration`. Presentation-only helpers were separated from the React module
  so Fast Refresh retains its existing lint rule without a suppression.
- GREEN: focused web V8 coverage using the unchanged include/exclude list and 80/80/80/75 arguments
  from `scripts/test-coverage.sh`: statements 98.65%, branches 93.61%, functions 100%, lines 99.71%.
  The web workspace has no `test:coverage` script; its direct Vitest invocation uses the repository
  script's exact coverage policy instead. No coverage configuration was changed.
- GREEN: `pnpm --filter @rei/web build`; non-failing Vite size advisory remains (main 665.02 kB,
  lazy CityScene 536.96 kB). GREEN: `git diff --check`.
- GREEN: the following focused command passed:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/overview-layout.integration.test.ts \
    integration/support integration/source-register-cleanup.test.ts
  ```

  five files / 26 tests. The focused Chromium layout test checks 390/960/1440 long-name wrapping,
  phone/desktop question colors, dominant input, complete separated source names and 44px links,
  plus top-aligned desktop panels.

- Added typed `integration/support/overview-disclosures.ts`. Normal real-stack journeys keyboard-open
  all figure disclosures, the twelve-month table, every monthly point and separate neighbour evidence;
  they assert visible content, focus/44px targets and expanded-state full-page axe, then keyboard-close
  everything before normal full/top captures. Recovery explicitly opens/checks/closes the table too.
- Parent-owned full repository gates, real-service campaign reruns, same six-locale/width recaptures
  and independent verdict/documentation remain pending at this correction handoff. No detector,
  finish-agent spawn, new screenshot round, token change, commit, push or story acceptance was performed.

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free Quick reviewer read the complete final unified diff, the
  intent/acceptance context and repository rules. Surrounding checks covered public parsers,
  actual backend parent/neighbour/series assembly, history enrichment, route/draft identity,
  error sanitization and Query cancellation/cache policy; no evidence-backed finding remained.
- patches applied: 0; deferred: 0; rejected: 0. No technical review correction or loopback was
  required. The parent independently read the complete owned diff and retained all nine executed
  matrix proofs. Follow-up review recommendation is false; patched counts are high 0, medium 0,
  low 0. The finite visual verdict and documentation outcome are recorded separately below.

### Final finite Impeccable verdict and documentation verification — 2026-10-12

Disposition: `ship` for the six original material findings. After the second and final correction
batch, the same independent reviewer marked all six resolved: compact individually evidenced figures;
closed twelve-month table; supplied-range chart with separated localized labels; compact neighbours
and aligned panels; responsive question and honest unexecuted draft; separated complete source names
and accessible targets. No fix-batch regression remains. This is not pixel-identical artboard fidelity,
a new whole-surface certification or complete WCAG conformance.

The fresh documenter returned no changes: the existing surface brief accurately records the final
D-058 extension. Parent verified the unchanged incumbent hashes: DESIGN.md
`9df79d4f6606a93e117ee9b0b7f7de96313fe1bc98da29ce3c5e50048c2f209e` and its sidecar
`2be76f55942cc626de77f97d3da183ba203585e03aba067b17a64d0a077c26b7`.
This outcome agrees with the finite finish verdict and the parent-opened final captures. No new tokens,
world, documentation drift repair or code changes were made. BMad technical review and acceptance
remain the next gate; this finite visual verdict alone does not accept the story.

### D-058 verdict pass and final correction handoff — 2026-10-12

Disposition: `fix`, at the finite six-finding scope only. The same independent reviewer examined the
fresh, parent-validated twelve full/top PNGs after the real web-place recapture passed. Findings 2
(closed twelve-month table), 4 (compact neighbours and top-aligned panels), 5 (responsive question
band and honest draft continuation) and 6 (source separators/full names/44px links) are resolved.
Findings 1 and 3 are partial. This is not whole-surface certification or a new defect hunt.

The implementing agent must perform only this second and final unattended correction batch:

1. Finish original finding 1 in `OverviewFigure.tsx`, `PlaceOverview.tsx` and `styles/place.css`.
   The default figure band remains approximately 500px high at 1440px PT and 700px at 960px PT;
   verbose narrative count/timestamp/freshness summaries wrap and dominate the band and phone page.
   Compact the default summaries and live-parent/context arrangement to the authored hierarchy.
   Preserve individually identifiable origin, contributor count, computation time and freshness;
   keep exact timestamps, complete source names, every URL and 44px native controls in accessible
   disclosures. Do not hide business figures, shrink normative type, clip text, falsify timestamps,
   replace unavailable Sale with zero, or combine individual evidence into misleading shared data.
   Add focused behavior/layout coverage for the compact default and retained opened evidence.
2. Finish original finding 3 in `PlaceSeries.tsx` and chart month-label styles. In the current
   `place-960-pt-BR.png`, July and October labels collide at the chart's right edge. Prevent that
   overlap at the supported 960px width while retaining meaningful chronological localized ticks,
   actual supplied-range prices, subject/actual-parent identity, true gaps and equal coordinates.
   Add a layout regression that measures visible tick boxes in PT and EN at supported widths.

Read the complete current plan and context first, and craft-floor immediately before UI edits.
Retain all prior resolved corrections, read-only intent-contract, fixed world/tokens, cancellation,
manual recovery, prepared/live boundaries and unexecuted navigation-state draft. No new finding,
palette, token, raster, detector, finish-agent spawn, commit, push or acceptance by implementer.
Run focused RED/GREEN and unchanged verification; parent owns full gates, same six locale/width
recaptures and the same reviewer's final verdict/documenter. Do not rerun context or concept-seed.

### Independent Impeccable finish review — 2026-10-12

Disposition: `fix`. All twelve final implementation captures and three reference captures were
valid. Typography, material, ground, identities, origins and reading order are retained. D-058
records the presentation decision; D-057 does not permit arbitrary density drift. No new visual
world, token changes, raster assets or independent defect hunt is authorized.

The implementing agent must address exactly this finite batch, preserving the intent-contract:

1. Recompose `PlaceOverview.tsx`, `OverviewFigure.tsx` and the figure styles into the authored
   compact band. Keep the actual parent as a labelled comparison and desktop contextual figures
   in compact columns with sensible 960px wrapping. Replace repeated expanded provenance with
   native per-figure evidence disclosures, keeping origin, contributor count, computation time
   and freshness identifiable and every source/link available. The approximately 900px desktop
   band must stop pushing every overview panel below the first viewport.
2. Put the complete twelve-month `PlaceSeries` table below the chart inside an explicitly labelled
   native disclosure, retaining every month, Asking tag, unavailable value, actual parent,
   per-point evidence and keyboard access. Default composition remains chart-led.
3. Correct `Chart`/`chartPaths()` presentation range using available supplied values; add meaningful
   labelled price ticks, several localized month ticks, clear subject/comparison labels and
   endpoint treatment. Preserve gaps and identical values; never manufacture separation or values.
4. Restore `PlaceNeighbours` compact comparison rows with aligned place, Asking price per m² and
   signed movement; retain separate accessible evidence for both figures. Top-align paired desktop
   panels rather than stretching the neighbour panel to the height of the monthly table.
5. Restore the phone question's porcelain region and ink below the plate shell, retaining the blue
   desktop header arrangement. Make the input dominate the joined row with concise localized
   continuation copy; keep place scope, navigation-state-only draft and explicitly unexecuted state.
6. Correct `Provenance` source spacing: canonical names must not concatenate at 1440px. Keep proper
   comma separation, complete names, every genuine source link and 44px targets in the evidence UI.

Add behavior tests for these corrections without weakening existing assertions. Existing browser
tests must explicitly open the new disclosures before checking their complete contents; retaining
collapsed content in the DOM alone does not prove keyboard access. Parent owns final gates, same
six width/locale recaptures and the same reviewer's verdict pass. Do not run another detector,
spawn finish agents, commit, push, or edit the intent-contract. Do not mark the story accepted.

## Design Notes

Inherit Placa candidate 4, seed 3d3cd1ae, Operate, code-led. Phone order is plate/question/median
and parent/secondary figures/prepared disclosure/series/map/reductions/neighbours. Desktop uses
232px rail, plate and question in blue header, all figures, map beside reductions, series beside
neighbours. Content and provenance can grow beyond illustrated sample; never shrink type or clip.
Keep the live .place-median section a stable evidence boundary. No shipping raster or token change.

## Verification

**Commands:**

- `pnpm --filter @rei/web test` — all existing and new web behavior/edge tests pass.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — full repository passes.
- `pnpm run test:coverage` — all eight existing floors unchanged and passing, with new web code covered.
- Harness regressions pass:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/support integration/source-register-cleanup.test.ts
  ```

- Owned real-service/browser campaigns pass; final images and axe reports are fresh:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/web-place.integration.test.ts \
    integration/web-components.integration.test.ts \
    integration/web-system-states.integration.test.ts
  ```

- `pnpm run test:integration:list` — all campaigns discovered, no probe/compiled test mistakenly run.
- Detector runs once after bounded render inspection; findings are documented, not repeated:

  ```bash
  /home/vscode/.codex/skills/impeccable-v2/scripts/impeccable detect --json \
    --target apps/web/src/places/PlaceOverview.tsx
  ```

**Visual proof:** Parent opens every final required capture plus Main/PlaceEN/DesktopPlace references,
checks valid full-page renders/local fonts/no overflow and differences at actual source dimensions,
then obtains the fresh finish review and documentation outcome. Automated axe is not full WCAG proof.

## Auto Run Result

Build result: built. The implementation, executed verification matrix, independent technical review,
finite visual review and documentation verification are complete. The separate orchestrator acceptance
below closes this ticket after committing and checking the reviewed changes.

### Delivered change and files

- `PlaceOverview.tsx`, `PlacePlate.tsx`, `OverviewFigure.tsx` and `OverviewReadState.tsx`: complete
  live/actual-parent and individually evidenced prepared figures/counts with independent recovery.
- `PlaceNeighbours.tsx`, `PlaceSeries.tsx` and `series-presentation.ts`: compact registered-place
  comparisons, true twelve-month gaps/ranges/ticks and keyboard-accessible complete point evidence.
- `PlaceReductions.tsx`, `PlaceQuestion.tsx` and `PlaceEntry.tsx`: persisted-only reduction history,
  bounded abortable property enrichment, same-place Search and escaped, explicitly unexecuted Ask draft.
- `place-client.ts`, `place-queries.ts`, `resources.ts`, `Provenance.tsx` and `styles/place.css`:
  validated public ancillary reads, one scoped cache, localized evidence and the inherited Placa layout.
- Web behavior/chart/client/provenance/route tests and typed integration support/campaigns:
  deterministic edge coverage plus actual owned acquisition, persisted history, retry, keyboard,
  layout and accessibility journeys. `vite.config.ts` permits only the required owned development
  fixture access without adding a production route or dependency.
- The surface brief, epic Notes and this plan record D-057/D-058, verification and review;
  `.impeccable/review/` records fresh owned captures, reference metadata and accessibility evidence.

### Review outcome

Quick technical review: zero findings, zero patches, zero deferred items and zero rejected findings.
The same finite Impeccable reviewer resolved all six original findings and returned `ship` after
the final correction batch. Documentation verification returned `no changes`, preserving DESIGN.md
and its sidecar. Follow-up technical review recommended: false; high/medium/low patched counts are
0/0/0, with no specific unverified change risk identified.

### Executed verification

- Full root lint, recursive/strict-integration typecheck, tests, build and all eight unchanged
  coverage gates passed. The explicit web suite passed 19 files / 214 tests; web coverage is
  98.66% statements, 93.70% branches, 100% functions and 99.71% lines.
- The three owned real-service/browser campaigns plus `overview-layout.integration.test.ts`
  passed four files / six tests in 258.86 seconds, including genuine persisted reductions and
  independent recovery. Support/cleanup passed four files / 25 tests; integration discovery passed.
- Every read-only intent-matrix row has executed passing proof. Parent inspected all twelve
  final full/top Overview captures and three authored references; local fonts and source hashes
  were checked. All eighteen default/expanded/recovered Overview and two persisted-reduction axe
  reports have zero violations and zero incomplete results.
- Formatting and staged/unstaged whitespace checks passed. All integration files are TypeScript;
  Vitest, Supertest and the Testcontainers/Nock shared standard and strict checking are retained.

### Residual boundaries

Automated axe and the finite visual verdict do not certify full WCAG conformance or unrelated
screens. Prepared auxiliary values remain labelled separately from live medians; persisted history
has no prepared fallback. Property routes, full Search filters, executed Ask runs and later web
stories remain later work, not simulated here. The build retains its non-failing chunk-size advisory.
No coverage floor, test assertion, type rule, world/token or secret policy was weakened. No VPS,
live-source access, push or owner-reserved production story is included.

## Orchestrator Acceptance

Accepted on 2026-10-12 under the owner's unattended execution mandate. `tickets.py mark epic-web 5 done`
records story 6.5 as done only after the complete verification and independent reviews above passed.
The reviewed implementation, tests and documentation were committed separately:

- `e42a428ec2377638ff8c63f195db1586485e6270` — implementation.
- `a33961e7cfcfe0d1be1e0c78ad954b5fe3e71d37` — unit and typed integration/browser tests.
- `af3581d73db07eec4aec8f991abfe5c024b619f1` — verified evidence and review record.

The parent verified the working copy was clean after those commits and that the reviewed changed
paths appear after baseline `051b56748e8454821b478672ab59d958d39b2310`. Git hooks passed without
bypass: the documentation commit's initial MD013 refusal was corrected by formatting the plan's
long commands, then retried as a new commit. No code, requirement or gate was changed by that repair.
No push occurred; VPS-dependent stories remain owner-reserved. This acceptance covers this story,
not the remaining epic, later full WCAG assessment or the final initiative E2E campaign.
