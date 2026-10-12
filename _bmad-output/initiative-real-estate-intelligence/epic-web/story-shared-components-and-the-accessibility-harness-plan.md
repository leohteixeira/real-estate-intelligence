---
title: 'Shared components and the accessibility harness'
type: 'feature'
ticket: '15'
created: '2026-10-12'
status: 'built'
baseline_revision: 'c0e71431cfd58d85bc0d99de66ee24940f06efee'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/apps/web/DESIGN.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The live median has private figure/provenance markup, other screens lack shared
property rows, and screen entries have no reusable automated accessibility and semantic contrast
gate.

**Approach:** Extract the actual median presentation, implement a contract-typed Placa PropertyRow,
and introduce a typed Vitest/axe real-browser harness used by both the production shell and
test-only component fixture. D-055 accepts the narrow control-border contrast correction.

## Boundaries & Constraints

**Always:** Preserve D-052/D-054 routes and honest entry screens, canonical names, bundled PT/EN,
local fonts, existing component CSS, API parsers, frontend-only formatting, TypeScript/Vitest
integration, 44px interactions, full root gates and 80/80/80/75 coverage. Real integration uses
owned Compose fixtures with safe cleanup and sandboxed loopback Chromium. Record manual/incomplete
accessibility limits. All repository text is English. Keep the current branch.

**Never:** Implement Search results or system states owned by entries 6/4; introduce public
galleries or dead method/property links; fabricate backend values/collection outcomes; access .env
files, VPS, real sources/providers or foreign containers; push/commit in the implementer; add
coverage exclusions, retries/skips, scanner rule/region exclusions or security bypasses. No
node:test/assert or manual network/process harness.

## I/O & Edge-Case Matrix

| Scenario      | Input / State                                                    | Expected Output / Behavior                                                                                     | Error Handling                                                      |
| ------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Real figure   | Available live MarketMedian, recordCount=1, prepared counts=2000 | BRL/m² plus actual contributor count, sources, computed UTC time and synthetic provenance                      | Preserve existing PlaceOverview request states                      |
| Evidence      | fresh/stale/untracked; long labels/multiple sources              | Distinct truthful freshness and wrapping; genuine source links; no invented failed source                      | Required typed evidence; unavailable figure remains existing branch |
| Price row     | PropertySummary and explicit caller destination                  | One property link, type/bedrooms/area, canonical block, Asking price and per-m², listing count and market time | No nested links or fabricated address from fixtureLabel             |
| Null vs zero  | Nullable price/area/bedrooms vs numeric zero                     | Null remains unavailable; zero bedrooms/listings/days remains zero                                             | Never coerce missing price to R$0                                   |
| Comparison    | belowMedianPercent positive/negative/zero/null                   | Below blue/above orange/equal words; null has no invented comparison                                           | Backend percentage points formatted only; no market calculation     |
| Returned      | returnedToMarket=true                                            | Returned-to-market replaces days wording                                                                       | No conflicting status                                               |
| Long content  | Long block/source, large prices; both locales                    | Wrap without overflow/ellipsis/font shrinking                                                                  | Canonical names remain untranslated                                 |
| Accessibility | Existing entries/shared fixtures at 390/960/1440                 | No axe WCAG 2.2 AA violations; usable keyboard/focus and >=44px targets                                        | Fail violations; record incomplete checks separately                |
| Contrast      | Semantic text/focus/essential-border token pairs                 | Text >=4.5, large text/non-text essential boundaries >=3                                                       | Decorative hairlines not misclassified as controls                  |

</intent-contract>

## Code Map

- `apps/web/src/places/PlaceOverview.tsx` — private MedianEvidence and available `.fig` markup are
  extraction points; preserve loading/error/insufficient branches and section heading identifiers.
- `apps/web/src/places/{formatters,locale,resources}.ts` — existing BRL/count/UTC formatters, fresh
  i18next instance and bilingual catalogue. Add shared namespace without changing current copy.
- `packages/contracts/src/{market/market.read.types,properties/properties.read.types}.ts` —
  MarketEvidence and PropertySummary exports; read-only. Price-per-m² is minor units,
  belowMedianPercent is percentage points; positive means below. PlaceRef has canonical name, no
  independent street-range fields.
- `apps/web/src/styles/{tokens,components,place}.css`, `apps/web/DESIGN.md`,
  `apps/web/.impeccable/design.json` — existing `.fig`, `.prov`, `.prow` composition and actual
  normative tokens. D-055 only changes line-strong to #7f8ba2 across these and
  `docs/design/canvas/project` token mirror.
- `docs/design/canvas/project/{Components,Search}.dc.html` — reference shared figure and row
  composition, not production content.
- `apps/web/src/places/PlaceOverview.test.tsx` and shell tests — jsdom annotation, Testing
  Library/user-event, MemoryRouter and isolated I18nextProvider conventions.
- `integration/web-place.integration.test.ts` — owned real Compose API+worker+web campaign, parsed
  event-fed median and actual browser shell journeys, widths/locales/captures; extend in place with
  shared harness.
- `integration/support/{fixture,http,network.setup}.ts` and `vitest.integration.config.ts` —
  campaign ownership, safe teardown, Supertest and network guards. Reuse rather than invent a test
  runner.
- `tsconfig.integration.json`, `apps/web/tsconfig.app.json`, `package.json`, `pnpm-lock.yaml` —
  ensure every added integration/fixture TS/TSX is strictly typechecked. Test-only fixture must be
  absent from production Vite build/routes.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/shared/{Figure,Provenance,PropertyRow}.tsx` and corresponding `.test.tsx` —
      write failing behavioural tests, then extract/implement components with required evidence and
      explicit native link destination. Cover the matrix in both locales without frontend business
      calculations.
- [x] `apps/web/src/places/{resources,formatters,PlaceOverview}.ts*` — add shared
      catalogue/formatters as needed and consume Figure for live median; rerun original regression
      tests without rewriting expected truths.
- [x] `apps/web/src/styles/{tokens,components}.css`, `apps/web/DESIGN.md`,
      `apps/web/.impeccable/design.json`, canvas token mirror — apply the recorded essential-border
      correction and only necessary wrapping/target styles; preserve Placa dimensions/type/color
      roles. Read craft-floor immediately before UI edits.
- [x] `apps/web/src/shared/token-contrast.test.ts` — test actual token values and an explicit
      documented semantic pair inventory with WCAG luminance thresholds; prove gate fails on the
      original line-strong. Cover parse/error/formula branches without lowering coverage.
- [x] `integration/support/accessibility.ts`, `package.json`, `pnpm-lock.yaml` — pin
      @axe-core/playwright 4.13.0, expose reusable typed full-page WCAG 2/2.1/2.2 AA analysis with
      actionable results and incomplete evidence. No exclusions or disabled rules.
- [x] `integration/web-place.integration.test.ts`, `integration/web-components.integration.test.ts`,
      `apps/web/test-fixtures/shared-components/{index.html,main.tsx}`, relevant strict tsconfig —
      run real production shell/figure checks and test-only component browser checks using the same
      harness, locales and widths; parse real synthetic API payloads and clearly separate
      constructed edge cases. Use Execa/get-port/owned teardown, not custom HTTP servers; keep test
      fixture outside shipped production entries. Include keyboard focus, row activation, 44px
      targets, font loading, no overflow and screenshots with corresponding component artboard
      references.
- [x] `docs/testing/integration.md` and story plan — record invocation and adoption contract for
      future screen entries plus limits of automated accessibility. Parent owns visual review,
      mandatory workflow code review, final independent gates and commits.

**Acceptance Criteria:**

- Given the owned stack has collected its synthetic property, when a visitor reads the place median
  in both locales, then the shared figure displays the exact backend value and
  count/source/computation evidence, and the existing navigation and unavailable/error states still
  work.
- Given actual parsed property summaries and labelled component-only edge fixtures, when the real
  browser opens the isolated shared-component entry at 390/960/1440 in PT/EN, then the shared
  rows/figures match Placa, preserve null/zero/sign semantics, wrap, expose usable keyboard focus
  and activate a genuine test-owned destination without becoming public product routes.
- Given every current public screen entry and each shared component, when the reusable browser
  accessibility scan and semantic token contrast gate run, then violations fail the tests, all
  required semantic pairs pass, and incomplete/manual checks remain separately recorded rather than
  treated as full conformance.
- Given the production build, when its routes/assets are inspected and root
  lint/typecheck/test/build plus unchanged coverage and integration/browser checks run, then no
  test-only fixture ships and every gate passes without reduced thresholds or exclusions.

## Implementation Notes

- Extracted the available live median into typed Figure/Provenance without replacing the existing
  loading, error or insufficient-data branches. Evidence retains the backend contributor count,
  source destinations, UTC computation time and explicit freshness/synthetic state. Optional method
  destinations must be supplied by callers.
- PropertyRow accepts the contract summary and one required native-link destination. It preserves
  canonical PT-BR names in both locales, nullable monetary values versus numeric zero, backend
  percentage-point signs, listing counts and returned-to-market wording. Shared bilingual resources
  and presentation-only quantity formatting support the components.
- Applied D-055 only to Line Strong, synchronized its normative/design mirrors, and added necessary
  long-content wrapping and source-link targets without shrinking Placa typography. The token suite
  reads the actual CSS and proves the original essential border fails.
- Added the full-page axe helper, strict test-only TSX entry and owned real API/browser campaign.
  The fixture reparses owned API payloads, labels constructed edges separately, and does not enter
  the production router or build. Keyboard activation, focus, fonts, target geometry and overflow
  checks supplement axe.
- The fixture's first browser execution exposed linked CommonJS contract interoperability: the
  browser reported that contracts `dist/index.js` did not provide `parsePlaceMarketResponse`.
  Explicit `optimizeDeps.include: ['@rei/contracts']` in the existing Vite configuration fixes dev
  serving while production builds retain their existing bundling behavior. Browser startup errors
  are now included in actionable test diagnostics.
- No commits, pushes, backend expectation changes, scanner exclusions, test retries/skips or
  coverage reductions were made. Parent visual/workflow review and independent final gates remain
  pending.
- Parent follow-up completed the missing D-055 semantic pair for Line Strong on Enamel 50, plus
  inherited yellow focus on the Enamel 700 plate and Enamel 600 active rail item. The corrected
  border is checked against all three light grounds; the original value is rejected against all
  three.
- The owned component campaign now captures the actual Components and Search canvas sources at their
  declared 1280×1882 and 390×1249 artboard dimensions. A fixed-file Vite `apply: 'serve'` route
  exposes only these HTML references and their two canvas CSS files, replaces remote font loading
  with the pinned bundled Barlow weights, and omits the absent canvas-editor support script because
  the static markup is already present. PNGs and source-hash/dimensions/local-font metadata are
  reproducible test evidence, not public entries. Fresh production-asset assertions reject the
  fixture route and plugin markers.
- Parent-authorized test-only deadline correction: the original 20 ms wall-clock budget could expire
  during the asynchronous repository/reader setup, before the parser entered and before the native
  abort timer ran. That exercised the existing expired-before-parser exhaustion guard instead of the
  intended in-parser cancellation race. The unit test now freezes the clock, replaces only the
  native timeout boundary with a fake-timer-driven AbortController, waits for parser entry, verifies
  no expiry at 19 ms, then advances the final 1 ms and asserts cancellation, no publication, and
  redaction of both private email and token. A `finally` restores the timeout spy, clears fake
  timers and restores real time. Production deadline logic, real integration deadline behavior and
  the existing already-expired exhaustion assertion are unchanged.
- Landing evidence now includes fresh full-page and top screenshots at every required width/locale
  alongside the existing complete-page scans. No Landing or provenance UI changes were made in this
  follow-up; parent visual review retains ownership of the diagnosed source baseline offset.

## Plan Change Log

- 2026-10-12: Added explicit linked-contract optimization to the existing Vite configuration after
  the real dev-only fixture exposed CommonJS interop failure. This is a necessary fixture-serving
  correction, not a new production entry or contract change.
- 2026-10-12: Parent verification requested missing Enamel 50/focus pairs, actual local artboard
  reference captures, fresh Landing screenshots and a deterministic test-only parser-deadline
  correction. These scoped verification fixes preserve the intent contract and production behavior.

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free Quick reviewer read the unified diff and surrounding code against
  this plan and its context, and returned `No findings.`
- Routes: no intent gaps, bad-plan entries, patches, deferred items or rejected findings. Patched
  counts: high 0, medium 0, low 0. Follow-up review recommendation remains false.

## Design Notes

Route choice: full, auto-selected because the three shared components, two browser campaigns and
reusable accessibility/contrast tests exceed 100 changed lines and five non-mechanical files.
Business risk remains medium: incorrect monetary units or provenance would mislead visitors.

Established Placa Operate extension: no concept seed or redesign. Follow the shared-component
surface brief, exact `.prow` two-column row and `.fig` Barlow Condensed 48px value/22px unit, with
12px evidence. Source labels are proper names. A Figure method target is optional but must be
genuine; do not invent a method endpoint. Require explicit price kind whenever showing prices. A row
is one link without nested provenance links. D-055 accepts only the line-strong token change;
documenter must synchronize its sidecar, not repair unrelated pre-existing drift. Parent inspection
is batched for all widths/locales with at most two rounds, one detector call, a fresh finish
reviewer and documenter.

## Verification

**Commands:**

- `pnpm --filter @rei/web test` — new and original components pass.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — every
  affected-repository gate passes.
- `pnpm run test:coverage` — unchanged per-workspace 80/80/80/75 thresholds pass.
- Run both complete browser campaigns against the real owned stack:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/web-place.integration.test.ts integration/web-components.integration.test.ts
  ```

  Browser components and shared accessibility gates pass with successful owned teardown.

- `pnpm exec vitest run --config vitest.integration.config.ts integration/support` — integration
  conventions and ownership regressions pass.

Inspect all fresh component and production entry captures beside the authoritative artboards; report
concrete differences and automation limits. No claim that this story delivers full Search or
certifies all WCAG requirements.

**Implementer results (2026-10-12):**

- TDD: the new behavioural tests first failed because the three component modules did not exist; the
  existing 77 web tests remained passing. The completed web suite passes 15 files / 131 tests.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed serially after the
  browser campaign, including strict integration/fixture checking and all 2,265 unit tests. Vite
  retains its existing non-fatal >500 kB chunk warning.
- `pnpm run test:coverage` passed the unchanged per-workspace 80/80/80/75 thresholds.
  `integration/support` passed 3 files / 19 tests.
- The production-shell campaign passed all widths/locales. After the fixture interop correction, the
  component campaign passed all six width/locale combinations with successful owned teardown and
  production-asset isolation checks. Thirty full-page scans report zero violations.
- Incomplete results remain explicitly preserved: all six component captures identify
  `color-contrast` for constructed long source anchors (axe cannot determine the background because
  of partial overlap). Landing mobile identifies the current wayfinding name (`bgOverlap`); desktop
  reports five wayfinding labels with overlapping backgrounds plus the hero heading, lead, pending
  action text, legend and synthetic tag on the gradient. Place/Search/Ask report no incomplete
  checks. All listed nodes require parent visual/manual contrast assessment, not a conformance
  claim.
- Diagnostic retained from the first root run under concurrent coverage/Compose load:
  `packages/application/src/collection/reparse-snapshot.service.test.ts:217`, test
  `bounds an uncooperative parser and redacts its failure payload`, calls with `Date.now() + 20`;
  expected rejection `{ kind: 'cancelled' }`, observed `{ kind: 'exhausted' }`. The serial rerun
  passed all 222 application tests without changing backend code or expectations. The initial run's
  failure and later success must both be reported.

**Scoped parent-verification follow-up results (2026-10-12):**

- Re-read this plan and both frontmatter context files before the scoped fixes; no BMad rerender or
  detector invocation.
- `pnpm run lint && pnpm run typecheck` passed after all follow-up source edits, including the Vite
  configuration and strict integration campaign checking.
- `pnpm --filter @rei/web exec vitest run src/shared/token-contrast.test.ts` passed 42 tests.
  `pnpm --filter @rei/application exec vitest run src/collection/reparse-snapshot.service.test.ts`
  passed 14 tests, including deterministic parser-entry/20 ms cancellation, private-payload
  redaction and the untouched expired-before-start exhaustion case.
- `pnpm --filter @rei/web build` passed. The fresh build was then inspected by the updated browser
  campaign for absence of both component and artboard fixture markers.
- The complete production/component browser command listed above passed 2 files / 2 tests in 157.11
  seconds with owned cleanup. This run refreshes the six Landing full-page/top capture pairs and all
  component/reference evidence.
- `reference-Components.png` is exactly 1280×1882 and `reference-Search.png` exactly 390×1249.
  Companion JSON records authoritative source paths and SHA-256, dimensions, five locally loaded
  font assets per reference and no external requests. These are reference images, not additional
  accessibility conformance scans.
- Fresh Landing reports have zero violations: 390px PT/EN each retain one overlapping current
  wayfinding-name contrast check; 960/1440px PT/EN each retain ten incomplete contrast nodes (all
  five wayfinding labels plus hero, lead, pending text, legend and synthetic tag on the gradient).
  Their full-page and top screenshots are available for manual assessment.
- No full root unit or coverage rerun is claimed for this follow-up. Parent independent final gates
  and visual/workflow review remain pending. Production deadline behavior, source baseline UI and
  Landing UI are unchanged; no commits were made by the implementer.

**Independent parent verification (2026-10-12, after the provenance correction):**

- The first batched visual inspection found source links vertically displaced relative to the other
  provenance metadata. The correction centers the wrapping provenance flex items while preserving
  44px minimum link dimensions and 12px text. Native source-link names now retain their visible
  localized Sources prefix instead of overriding it with a shorter aria-label. Unit checks verify
  those full accessible names in both locales; browser checks require both target dimensions and
  aligned metadata centers.
- `pnpm --filter @rei/web test` passed 15 files / 134 tests. The subsequent independent root
  lint/typecheck/test/build command passed all 2,268 unit tests, including the deterministic parser
  cancellation regression and strict integration checking. The existing Vite chunk warning remains
  non-fatal and unchanged.
- A fresh independent `pnpm run test:coverage` passed every unchanged workspace threshold.
  Integration ESLint/typecheck and the support/cleanup subset passed 4 files / 25 tests; Vitest
  discovery successfully lists all campaigns.
- The first refreshed Landing screenshots show the legitimate flat fallback, not the required normal
  city scene. A readiness assertion and browser console investigation identify failed sandboxed
  WebGL context creation (`BindToCurrentSequence failed`), rather than a chunk or font race. These
  captures cannot establish normal Landing fidelity; renderer verification and valid replacement
  captures remain pending. No Landing production code, sandbox, CSP or security bypass has been
  changed.
- The component campaign now includes an intentional unnamed-button negative control, requiring the
  actual shared axe helper to reject with rule ID, help URL and target selector. It removes the
  injected test-only node and reruns the full positive scan. Its separately named expected-failure
  report must not be interpreted as a production conformance report. This new negative-control check
  has not yet run in the independent browser campaign.

**Final independent verification (2026-10-12, after graphics diagnosis and negative control):**

- Root lint/typecheck/test/build completed successfully with all 2,268 unit tests. The independent
  web subset passed 15 files / 134 tests, support passed 3 files / 19 tests, and every workspace
  passed unchanged 80/80/80/75 coverage thresholds. A further integration-only typecheck, ESLint,
  support/cleanup run (4 files / 25 tests) and discovery (75 cases) completed successfully.
- Both owned production/component browser campaigns passed together at 06:00:36 UTC: 2 files / 2
  tests, 144.90 seconds, with successful owned teardown. The actual shared helper rejected the
  deliberately unnamed button with rule/help URL/selector, removed it and passed the positive
  rescan. Its expected-failure report is separate from the thirty normal scans.
- The graphics fault was inherited DISPLAY with unavailable X11/XCB, not application state. The
  production campaign uses the already installed matching bundled Chromium 156.0.8078.4, removes
  DISPLAY only from that browser process, and explicitly selects headless ANGLE SwiftShader WebGL
  with unsafe fallback disabled. The sandbox and production CSP remain unchanged. All six final
  rendering reports prove non-flat mode, translated plate anchor, live WebGL context and no console
  errors. The initial failure diagnostic is preserved rather than rewritten as a pass.
- All thirty final normal axe reports have zero violations. Components/Place/Search/Ask now have
  zero incomplete checks. Landing has one overlapping current-wayfinding check at 390px and fourteen
  gradient/plate/wayfinding contrast nodes at 960/1440px, in both locales; these are retained for
  manual assessment, not counted as passes or full WCAG conformance.
- Parent completed the second and final batched inspection: all six component captures, all
  forty-eight full-page/top production captures and both actual component artboard captures were
  opened. Loaded fonts, correct route/locale, truthful API values, canonical names, long-content
  wrapping and centered provenance are visible. Root screenshots show the normal city scene, not the
  earlier flat fallback. Artboard example prices/counts are not substituted for owned API facts. The
  current Search/Ask entry screens remain explicitly incomplete per D-052/D-054; this story does not
  claim their future screen fidelity.
- The one detector pass retained only an advisory for an inherited 3px radius in components.css; no
  second detector or additional parent polishing pass is authorized. A fresh independent finish
  review remains required before disposition and documentation.

**Matrix test audit:** Every row below ran and passed in the independent web unit and/or owned
browser commands above; no covering test was filtered out, skipped or disabled.

| Intent matrix row | Covering executed evidence                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real figure       | Figure bilingual unit cases plus production browser tracer asserts parsed backend median, contributor count and live evidence                               |
| Evidence          | Provenance bilingual freshness/source/UTC cases; component browser checks fresh/stale/untracked, sources, genuine method links and wrapping                 |
| Property row      | PropertyRow bilingual identity/native-link unit cases and parsed owned-property browser assertions                                                          |
| Null vs zero      | PropertyRow missing/zero unit cases and labelled unavailable/zero browser fixtures                                                                          |
| Comparison        | PropertyRow -3.1/0/+3.1 unit cases; browser asserts positive/negative/equal words and no null comparison                                                    |
| Returned          | PropertyRow returned-to-market unit and browser checks replace days wording                                                                                 |
| Long content      | Component campaign verifies all six locale/width combinations, canonical names, large-price/source wrapping, 48/22px typography and no overflow             |
| Accessibility     | Both browser campaigns execute thirty full-page scans, keyboard/native-link activation, focus, 44px geometry and actionable unnamed-button negative control |
| Contrast          | All 42 semantic token tests pass actual CSS pairs including all three light grounds, both yellow-focus grounds and rejection of original border             |

**Independent Impeccable finish review (2026-10-12): disposition `ship`.**

- Persistence: the fresh context-free reviewer verified the inherited Placa direction and all 54
  required captures plus seven incumbent references, including source-hash/local-font reference
  metadata and all accessibility/rendering reports.
- Fidelity: type, material, ground, figure order, row topology, null/zero/comparison states, locales
  and canonical names match. Real backend facts, accessible wrapping/targets and honest incremental
  Search/Ask entries are the D-052/D-054/D-055 adaptations, not fabricated artboard values.
- Ceiling: reached for this scoped Operate extension. The pre-existing 3px-radius advisory is not a
  material regression; incomplete Landing contrast checks and manual
  screen-reader/daylight-focus/zoom checks remain explicit limits, not certification.
- Material fixes: none.
- Keep: preserve Placa roles, backend-derived evidence, canonical names, native single-link rows,
  constructed/synthetic labels and the boundary around unfinished Search/Ask.

The parent checked all five required review sections and the terminal disposition. The subsequent
mandatory BMad Quick review returned no findings.

**Shipped-documenter completion (2026-10-12):**

- The documenter merged only DESIGN.md, its sidecar and the PropertyRow surface brief. The parent
  read the complete resulting diff and checked it against the shipped Figure, Provenance and
  PropertyRow. The records describe the actual component contracts, D-055's three approved light
  grounds, optional genuine method destinations, native single-link rows and null/zero/sign/returned
  states. Static preview data is explicitly constructed/synthetic rather than backend evidence.
- Read-only evidence checks confirm 30 normal zero-violation reports, 54 captures, seven references
  and sidecar schema v2. The established manual/incomplete accessibility limits and unfinished
  Search/Ask boundaries remain explicit. No new raster product assets were created; the screenshot
  PNGs remain review evidence.
- The documenter verified all 33 color tokens against CSS, 19 valid snippet variables, canonical
  DESIGN sections, the canvas border mirror and reference source hashes/local fonts. No browser,
  detector or context rerun, UI changes or unrelated design-drift repairs were performed. The parent
  accepts this narrow merge; terminal finish disposition remains `ship`.

## Auto Run Result

Status: built. Shared Placa Figure/Provenance now render the actual place median, and a
contract-typed PropertyRow preserves backend units, missing/zero values, comparison signs and
returned-to-market wording. The reusable full-page accessibility harness and semantic token contrast
suite are ready for subsequent screen entries. All acceptance criteria and every intent-matrix row
have executed evidence recorded above.

### Changed files

- `apps/web/src/shared/{Figure,Provenance,PropertyRow}.tsx` — shared typed presentation with native
  links and required evidence.
- `apps/web/src/places/{PlaceOverview,formatters,locale,resources}.ts*` — actual median integration,
  formatting and bilingual catalogue.
- `apps/web/src/styles/{components,tokens}.css` and `docs/design/canvas/project/tokens.css` —
  wrapping, target geometry and D-055 essential-control border.
- `apps/web/src/shared/*.test.ts*` and `apps/web/src/places/locale.test.ts` — component, fixture,
  locale and 42 semantic-contrast regressions.
- `integration/support/accessibility.ts` and both web integration campaigns — typed full-page axe
  analysis, production/component browser journeys, negative control and safe owned teardown.
- `apps/web/test-fixtures/`, its app TypeScript configuration and Vite configuration — strictly
  checked isolated component/artboard entries excluded from production assets/routes.
- `package.json` and `pnpm-lock.yaml` — pinned axe browser integration dependency.
- `packages/application/src/collection/reparse-snapshot.service.test.ts` — deterministic in-parser
  cancellation regression without production-policy changes.
- `apps/web/.impeccable/review/` — 54 current screenshots, authoritative reference metadata, 30
  positive accessibility reports, six normal rendering reports and separately retained failure
  diagnostics.
- `apps/web/DESIGN.md`, its sidecar/surface brief, epic envelope, shared-component brief and
  `docs/testing/integration.md` — decision, component contracts, harness adoption and honest proof
  limits.
- This plan — intent, execution record, matrix audit, independent review and final disposition.

### Review outcome

Quick returned zero findings. Patches applied: high 0, medium 0, low 0. Deferred: none. Rejected
findings: none. Review loop iteration remains 0 and follow-up review recommendation is false; there
is no unverified review patch. The independent Impeccable finish reviewer returned `ship`, with no
material fixes, and shipped documentation was checked separately by the parent.

### Verification outcome

- Fresh finalization `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`
  completed with exit 0 on 2026-10-12, including all 2,268 unit tests and strict integration
  checking. The unchanged Vite large-chunk warning remains non-fatal.
- Fresh finalization `pnpm run test:coverage` completed with exit 0; every unchanged per-workspace
  80/80/80/75 threshold passes.
- Integration-only typecheck/ESLint and the support/cleanup subset completed with exit 0, four files
  / 25 tests, followed by successful discovery of 75 cases. All 43 integration source files are
  TypeScript, with no JavaScript campaigns/helpers/probes.
- The latest owned production/component browser command completed with exit 0: two files / two
  complete campaigns, 144.90 seconds. All six component width/locale combinations, thirty full-page
  positive scans, keyboard/focus/geometry/fonts/wrapping checks, production-fixture isolation and
  actual negative-control rejection passed. Owned resources were removed; the subsequent
  exact-project container/volume inspection was empty.
- Both parent batched visual inspections and the independent finish review completed against the
  authoritative artboards. Final evidence shows the normal WebGL scene, truthful backend values and
  canonical names. No additional polishing/detector pass was performed.

### Residual risks and boundaries

Landing's incomplete contrast checks, manual screen-reader/daylight-focus/zoom assessment and
inherited 3px-radius advisory remain explicitly recorded, not treated as WCAG certification.
Search/Ask are the honest incremental entries accepted by D-052/D-054, not their future completed
screens. Later stories must reuse the harness for their new states. No new environment variable,
live model/source request, external write, VPS action, push or production-deployment claim is
introduced. VPS-dependent stories remain owner-locked. This built result is one story's completion,
not completion of Epics 1–6 or the final E2E campaign.
