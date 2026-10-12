---
title: 'Place overview with one figure from the contract'
type: 'feature'
ticket: '2'
created: '2026-10-12'
status: 'built'
baseline_revision: 'a2badd24e158bd6a18f6eae905725d299e0ff9ef'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md
  - /workspace/repos/real-estate-intelligence/apps/web/DESIGN.md
  - /workspace/repos/real-estate-intelligence/docs/design/content-and-locale.md
  - /workspace/repos/real-estate-intelligence/apps/web/.impeccable/surfaces/src-places-placeoverview-tsx.md
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The web only renders the landing. A visitor cannot open a neighborhood and read a
backend-owned median with its actual provenance in the Placa design and both locales (CAP-19).

**Approach:** Add a directly addressable place tracer using ADR 0028's router, cache, local
translations and component tests. Read validated `/api/v1` contracts through a same-origin proxy;
prove the synthetic acquisition-to-median journey on owned Compose services and in Playwright.

## Boundaries & Constraints

**Always:** TypeScript; pnpm exact pins; public parsers; abortable Query reads with explicit
retry/stale/focus/reconnect settings; pt-BR first/en complete; BRL whole-reais aggregate formatting;
proper place/source names unchanged; actual contributing-property/source/computation evidence;
available, pending, unavailable and failed states honest. D-052 is recorded before implementation.
Keep `/` landing behavior, Placa tokens/styles/typography, long-name wrapping, phone 390 and
desktop >=960. Basic public navigation must work, never fake affordances. Preserve coverage
80/80/80/75, hooks, secrets policy and exact owned fixture cleanup. All integration is strict
TypeScript/Vitest/Supertest/Testcontainers/Nock; Playwright automates browsers only.

**Never:** Compute a median in the browser; confuse asking with sale; display prepared counts
as real median evidence; copy artboard numbers or invent movement. No complete place screen,
map/question composer/other metrics, V2 or protected destinations, authentication, real sources,
provider calls, VPS unlock/access, deployment, push, commits by the implementer, secret-file reads,
files outside the repository, Node test/assert/custom harness, weakened sandbox or broad CORS.

## I/O & Edge-Case Matrix

| Scenario   | Input / State                      | Expected Output / Behavior                            | Error Handling               |
| ---------- | ---------------------------------- | ----------------------------------------------------- | ---------------------------- |
| Available  | Valid place; live median           | Plate, one asking figure, actual sample/sources/time  | No synthetic replacement     |
| Empty      | Median insufficient-data           | Place retained; localized unavailable text, no zero   | Never use prepared value     |
| Loading    | Place loaded; median pending       | Plate first; skeleton, no stale prior-place figure    | Abort superseded reads       |
| Failure    | HTTP error or malformed contract   | Localized failure with retry, place retained          | No raw error/payload leak    |
| Navigation | Direct URL, route change, back     | Correct place and scoped query identity               | Invalid ID makes no API call |
| Locale     | PT/en; storage throws or legacy pt | Switch works, document language, BRL and names intact | Safe PT default              |

</intent-contract>

## Code Map

- `apps/web/src/App.tsx`, `main.tsx`, `config.ts`, `vite.config.ts`: landing-only entry,
  strict Node-unit configuration, current absolute API base and no proxy. Keep pure tests in Node.
- `packages/contracts/src/locations/locations.read.{types,dto}.ts`: PlaceDetail and public
  `parsePlaceResponse`/`parsePlacesResponse`. Registered IDs are lower kebab-case, <=200 chars.
- `packages/contracts/src/market/market.read.{types,dto}.ts`: `parsePlaceMarketResponse`;
  production basis is event-fed-median-with-prepared-sections. Only the median is this tracer's
  figure. `recordCount` counts deduplicated representative properties, not active listings.
- `apps/web/src/styles/{tokens,components}.css`: committed Placa styles, `.shell`, `.rail`,
  `.plate`, `.fig`, `.prov`, `.band`/`.panel`, `.sk`; 960 breakpoint, 232 rail, 16/24 gutters.
- `docs/design/canvas/project/{Main,PlaceEN,DesktopPlace,States}.dc.html`: visual references
  (390x1706, 1440x1366); immutable synthetic illustrations, not data. Public rules hide protected
  navigation. Never copy `100vh` rail or five dead tabs blindly. Locale controls need 44px targets.
- `apps/web/src/landing/LandingPage.tsx`, `landing.css`: independent landing with `rei.locale`
  legacy pt/en preference; global dark html/body styles must not leak into the place route.
- `docker/web.Dockerfile`, `docker/web-nginx.conf`, `compose.yaml`: actual production web build,
  SPA fallback already exists. Add only `/api/v1` proxy to api:8200 and build pure contracts.
- `integration/support/{fixture,http,cleanup,network}.ts`: owned `rei-` Compose project,
  allocated published ports, env-file disabled, Supertest unknown JSON, exact teardown; reuse.
- `integration/synthetic-collection.integration.test.ts` and acquisition section of
  `market-median.integration.test.ts`: real collection-command/worker/broker/object-store path.
  Fresh `synthetic-data` acquisition gives Bela Vista one contributor, 951515 centavos/m².
  Pinheiros stays insufficient-data. No scheduled collection starts implicitly.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/package.json`, root `package.json`, `pnpm-lock.yaml` — install exact compatible
      pins: react-router 8.4.0, @tanstack/react-query 5.104.1, i18next 26.4.3, react-i18next 17.0.16,
      @rei/contracts workspace dependency; fontsource Barlow/Barlow Condensed 5.3.0; RTL 16.3.3,
      user-event 14.6.7, jest-dom 7.0.1, jsdom 30.1.2 and required RTL DOM peer. Root Playwright
      1.64.0 is browser automation for the native Vitest campaign, not a separate test runner.
- [x] `apps/web/src/{App,main}.tsx`, `src/routes.tsx`, `src/places/{PlaceOverview,PlaceShell}.tsx`
      — preserve `/` landing, `/places` → Bela Vista, `/places/:placeId`; declarative nested route/
      Outlet, working place navigation and back/forward. Scope ordinary read providers to the app.
- [x] `apps/web/src/places/{place-client,place-queries,locale,formatters}.ts` — abortable public
      contract reads and ID validation, explicit Query policies/keys; bundled typed PT/en resources,
      tolerant legacy locale storage, document language; format server values only. Focused files
      may split resources/provider when clarity demands it; record actual paths in Implementation Notes.
- [x] `apps/web/src/styles/place.css`, `src/landing/landing.css`, `index.html` — reuse component
      CSS/tokens, appropriate responsive visibility, natural rail height, no overflow, locally hosted
      existing font faces and no hosted font links. Preserve landing appearance/behavior; no new world.
- [x] `apps/web/src/config.ts`, `vite.config.ts`, `docker/web-nginx.conf`, `docker/web.Dockerfile`
      — same-origin API default, `/api/v1`-only dev/Nginx proxies; include/build pure contracts in Docker.
      Keep explicit external API override and existing demo/repository behavior. No backend changes.
- [x] `apps/web/src/places/*.test.{ts,tsx}`, `src/config.test.ts` — TDD for all matrix rows;
      per-test isolated MemoryRouter/QueryClient/i18n, DOM tests jsdom only, cleanup/abort pending work,
      Vitest jest-dom and user-event, visible role/text assertions. Do not broaden coverage exclusions.
- [x] `integration/web-place.integration.test.ts`, root integration script alias — run real
      owned PG/migrations/MinIO/Rabbit/worker/API/web; execute production tools collection-command with
      unique operation key, wait for Bela Vista median via Supertest/public parser, then use Playwright
      at 390/960/1440 in PT/en. Assert output, names/provenance, reload/deep link, locale persistence,
      empty Pinheiros, no stale value, invalid/missing place, keyboard, overflow and local font loads.
      Browser network permits loopback only; chromiumSandbox:true, no unsafe flags/download workaround.
      Close browsers and remove owned resources while preserving every primary/cleanup failure.

**Acceptance Criteria:**

- Given a fresh owned synthetic Compose stack, when its production acquisition completes and
  Bela Vista opens in a browser, then the plate and BRL 9,515 whole-reais median display actual
  one-property, synthetic-data source and backend computation-time evidence, tagged Asking/Pedido.
- Given PT and English at 390, 960 and 1440px, when the same place opens, then the shipped shell,
  plate and figure preserve Placa composition/type/colors and names, with no horizontal overflow,
  truncated text, dead/protected controls, or fabricated additional figures.
- Given landing and place deep links, when navigating/reloading/back/forward and switching locale,
  then history and preference work, document language matches, landing remains functional, and
  live figures always belong to the requested place.

## Implementation Notes

- Full route: substantially over 100 code/test lines across more than five files; medium ticket risk.
- Parent loaded Impeccable context once. Do not rerun it or rewrite PRODUCT/DESIGN to repair
  pre-existing foundation descriptions. Parent owns bounded visual capture comparison, finish
  reviewer/documenter and BMAD review after implementation returns; report missing browser evidence.
- Use apply_patch for edits; pnpm updates manifests/lock mechanically. No commits by implementer.
- Implemented `src/places/resources.ts` and `LocaleControls.tsx` alongside the planned client,
  cache, formatters, locale, shell and overview files; landing now shares the app locale instance.
  `tsconfig.integration.json` adds DOM/DOM.Iterable libraries for typed browser callbacks without
  changing strictness. The campaign uses sandboxed `/usr/bin/chromium` with no download or unsafe flags.
- Navigation reads root-only `/places` and validated `/places/:id/children` serially until
  neighborhoods, never descending into blocks. Every read consumes the same cancellation signal;
  parent identity mismatches and repeated IDs fail closed. There is no fixed total-node quota;
  concurrency is one and visited IDs prevent cyclic/repeated traversal.
- Production campaign failures were diagnosed before rerunning: a string arrow passed to
  Locator.evaluate was evaluated rather than called (corrected to an ordinary typed callback),
  then a root-only collection exposed the flat-neighborhood mock assumption (corrected to children
  traversal and realistic hierarchy fixtures). The next campaign passed in 43.60 seconds.
- Six real captures are in `apps/web/.impeccable/review/place-{390,960,1440}-{pt-BR,en}.png`,
  with 390x1706 and desktop x1366 frames. Assertions verified locally loaded Barlow faces,
  36/48px condensed name at weight 600 in white, plate widths 358/560 and desktop rail 232.
  Parent owns bounded visual comparison and its follow-up batch; known findings include self
  breadcrumbs, figure-unit spacing, locale order, and desktop footer contrast/control sizing.
- Focused web tests pass: 44 tests in seven files. Root lint/typecheck/test/build, unchanged
  per-workspace coverage gates, campaign discovery, Prettier on supported changed file formats,
  and diff whitespace checks passed. Parent separately passed Market and Locations campaigns.
  Final parent visual fixes/recapture and finish/BMAD reviews remain before ticket acceptance.
- Parent inspection round one opened all six real captures beside the immutable Main/PlaceEN/
  DesktopPlace artboards (reference fonts were loaded from local Fontsource files at runtime;
  original artboard files were not edited and external font requests were blocked). One batch
  removes a duplicated self breadcrumb, restores the space before /m² and EN/PT order, and
  restores readable inherited rail footer text with intrinsic locale-group sizing. A self-inclusive
  breadcrumb regression failed before the fix; all 45 focused web tests then passed. The real
  campaign now also asserts that the current place occurs exactly once in the breadcrumbs.
- Final parent verification passed root lint, strict type checking, 2,179 unit tests across
  eight workspaces and all eight builds. Coverage retains the unchanged 80/80/80/75 floors;
  web results are 98.68% statements, 88.76% branches, 100% functions and 99.29% lines.
  Vite reports advisory >500kB chunks for the new 611.68kB main bundle and existing 536.96kB
  CityScene; no build, lint or coverage configuration was weakened.
- The final owned acquisition/API/browser campaign passed its single Vitest test in 54.87s
  and recaptured all six locale/width files. Parent opened every final capture as visual round
  two; no invalid or incomplete evidence remains. Integration support/source-cleanup regressions
  passed all 25 tests in four files (2.44s). Market (83.90s) and Locations (29.80s) also passed.
  Campaign discovery, scoped Prettier, Markdown lint and staged/working diff checks passed.
- Matrix test audit: all six rows have executed, passing tests in the 45-test web run plus the
  real browser campaign. Available: `shows the plate and only live asking evidence...` checks
  the actual one-property/source/time evidence. Empty: `navigates to empty Pinheiros...` checks
  unavailable text and removes the prior median. Loading: `retains the plate while pending...`
  checks the placeholder and cancellation. Failure: the HTTP/malformed parameterized cases
  and `shows localized place/list failures...` check localized retry without payload leakage.
  Navigation: invalid/missing-ID tests and the real reload/back/forward journey check scoped
  identity; client tests reject wrong identities and prepared medians. Locale: the PT-to-English
  component journey, throwing-storage/legacy tests and all six browser frames check persistence,
  document language, BRL and unchanged names. No covering test was filtered, skipped or disabled.
- The required detector ran once and reported only four advisories in unchanged landing CSS
  (lines 269, 469, 478 and 716). Fresh-context Impeccable finish review returned `ship` with
  persistence/fidelity/ceiling/truth passing and no material fixes: existing type, material,
  ground and plaque signature match; actual geography/provenance and omitted controls are
  explicit D-052 adaptations. No shipped raster asset exists.
- Fresh-context Impeccable documentation is complete: only factual implemented-artifact notes
  were added to the surface brief. Incumbent DESIGN.md and design.json are unchanged. Reported,
  not repaired, pre-existing drift: PRODUCT.md foundation/toolchain text predates ADR 0028;
  DESIGN figure letter spacing 0.005em is absent from incumbent component CSS; the sidecar's
  plate snippet caps width at 420px while incumbent CSS caps it at 560px. None changes the
  pinned source/artboard authority or adds a new world. BMAD acceptance review follows.
- Review corrections retain validated cached same-place geography on HTTP/malformed refresh
  failure, wrap unbroken navigation labels, and use the existing 44px breadcrumb target.
  The two cache regressions failed before the patch; all 13 overview tests now pass.
  Parent repeated root lint/typecheck/test/build/coverage after the patches: all passed,
  including 2,181 unit tests (47 web). Thresholds and exclusions are unchanged.
- The implementer passed the updated owned browser campaign in 47.49s; parent independently
  repeated it in 45.44s and opened all six refreshed captures. All normal width/locale cases
  assert breadcrumb links at least 44px; an additional isolated 390px context validates a
  600-character unbroken canonical navigation name, full text/destination, wrapping and no
  overflow. The forced long-name response changes only the exact loopback children URL and
  passes the public parser; all other production acquisition/API/browser paths stay real.
- The same finish reviewer scored all three technical fixes resolved with scoped `ship`;
  this is not a new whole-surface review. A fresh documenter after the last correction completed
  factual surface notes for those fixes; incumbent system files and artboards remain unchanged.
- Follow-up corrections constrain breadcrumb list/item/link widths with full-name wrapping and
  give the mobile home link the inherited 44px target. The implementer passed the exact browser
  campaign in 53.29s; parent independently passed it in 54.95s (55.87s total) and opened every
  refreshed normal capture. Isolated public-parser-validated 600-character current/self and
  ancestor names now pass element/document containment, full text, exact href and real ancestor
  navigation at 390, 960 and 1440px. Both normal phone locales prove the home link's 44px height.
- Final parent checks again passed lint, strict type checking, 2,181 unit tests, all eight builds
  and unchanged coverage floors; web coverage is 98.68/89.01/100/99.29. Market passed in 20.55s,
  Locations in 27.71s; the exact four support/source-cleanup files passed all 25 tests in 2.38s.
  Script discovery lists 74 tests, including this campaign, and owned teardown left no containers.
- The same finish reviewer scored both follow-up fixes resolved with scoped `ship`, not a new
  whole-surface approval. A fresh final documenter minimally recorded the mobile target and
  complete canonical breadcrumb wrapping; it preserved incumbent system files and artboards.

## Plan Change Log

- 2026-10-12, D-053: use compatible Query 5.104.1 rather than new release-age policy exclusions.
  Registry metadata confirms React 18/19 support and the matching core pin; the intent is unchanged.

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Cached place disappears after a failed refresh — parent reproduced
    Query status error with retained validated data after the 30-second horizon. Patched the
    error return to retain the known plate/hierarchy alongside localized error/retry, hiding
    the median. HTTP/malformed cache regressions failed before the fix and now prove recovery.
  - `[medium]` `[patch]` Unbroken canonical navigation label causes horizontal overflow —
    contract wireString accepts the reported label; the new flex links lacked a maximum width
    and wrapping. Added direct min/max-width and anywhere wrapping; the real browser campaign
    proves complete text and destination with a parser-valid 600-character label and no overflow.
  - `[medium]` `[patch]` Breadcrumb links retain 28px targets — incumbent components.css sets
    28px and DESIGN.md explicitly requires 44px height. Added the scoped existing target token;
    the browser campaign proves all breadcrumb links at least 44px in all six normal frames.

### 2026-10-12 — Follow-up review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Canonical breadcrumb names still overflow — parent reproduced shipped
    CSS/markup in sandboxed Chromium: a permitted 600-character current name gives document widths
    3,889px at 390 and 3,897px at 960/1440. The public detail/ref parsers permit it, and the prior
    navigation-only forced response does not exercise detail/hierarchy labels. Added scoped
    list/item/link width constraints and anywhere wrapping. Exact-loopback, parser-valid current
    and ancestor 600-character labels pass full-text, element/document containment and real
    ancestor navigation checks at all three widths in the independently repeated campaign.
  - `[medium]` `[patch]` Mobile home/brand link has a 21.75px hit area — parent reproduced the
    shipped centered shell markup/CSS and verified DESIGN.md requires 44px. The shell row's
    minimum height does not enlarge its link. Added centered inline-flex and the existing
    44px target token to the link itself. Both normal phone locales now prove its exact home
    destination and minimum height in the independently repeated browser campaign.

## Design Notes

Inherited Placa, Operate, code-led pinned world: scope is the shell/plate/one figure from full
artboards, not a completed place screen. D-052 resolves unavailable/protected controls, canonical
names and contributor-vs-listing sample semantics; artboard numeric copy is not product evidence.
Parent compares real captures beside original artboard captures in two bounded inspection rounds,
then fresh-context finish review and documenter. No shipped raster asset is introduced.

## Verification

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all root checks pass.
- `pnpm run test:coverage` — every workspace keeps 80/80/80/75 without new exclusions.
- `pnpm run test:integration:web-place` — real typed Vitest acquisition/API/browser campaign passes.
- `pnpm run test:integration:market && pnpm run test:integration:locations` — contracts unchanged.
- `pnpm run test:integration:list` — new campaign discovered, no skips or unsupported probes.
- Prettier, scoped Markdown lint and `git diff --check` — changed files clean.
- Compare shipped subset against Main/PlaceEN/DesktopPlace in browser at required widths/locales;
  inspect every capture, computed type/color/geometry, actual local fonts and keyboard focus.
  Parent obtains Impeccable finish-review verdict and documenter evidence before committing.

## Auto Run Result

Status: built. The public place tracer preserves the landing and renders validated geography,
one backend-owned asking median, actual contributor/source/computation evidence and honest
pending, insufficient-data and error states. PT-BR and English work over directly addressable
routes, browser history and persisted locale preference. D-052 and D-053 were recorded before
their corresponding implementation decisions. No backend behavior or contract was changed.

### Changed files

| File                                                                                                                       | Change                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web/index.html`                                                                                                      | Remove external font stylesheet dependencies.                              |
| `apps/web/package.json`                                                                                                    | Pin router, cache, translations, local fonts and component-test libraries. |
| `apps/web/src/App.tsx`                                                                                                     | Own the router, isolated read cache and local translations.                |
| `apps/web/src/main.tsx`                                                                                                    | Load incumbent components, place overrides and self-hosted fonts.          |
| `apps/web/src/config.ts`                                                                                                   | Default API reads to the same-origin proxy.                                |
| `apps/web/src/config.test.ts`                                                                                              | Prove same-origin defaults and explicit overrides.                         |
| `apps/web/src/routes.tsx`                                                                                                  | Preserve landing and add public place index/detail routes.                 |
| `apps/web/src/landing/LandingPage.tsx`                                                                                     | Share safe locale preference with the place app.                           |
| `apps/web/src/landing/landing.css`                                                                                         | Scope landing document styling to its own route.                           |
| `apps/web/src/places/LocaleControls.tsx`                                                                                   | Provide working English/Portuguese controls.                               |
| `apps/web/src/places/PlaceShell.tsx`                                                                                       | Render responsive shell and real neighborhood navigation.                  |
| `apps/web/src/places/PlaceOverview.tsx`                                                                                    | Render geography, live median evidence and honest states.                  |
| `apps/web/src/places/PlaceOverview.test.tsx`                                                                               | Prove all matrix states, cancellation and cached-error recovery.           |
| `apps/web/src/places/place-client.ts`                                                                                      | Validate identities/contracts and walk hierarchy with cancellation.        |
| `apps/web/src/places/place-client.test.ts`                                                                                 | Prove validated reads, cancellation and neighborhood discovery.            |
| `apps/web/src/places/place-queries.ts`                                                                                     | Declare query identity and explicit cache/refetch policies.                |
| `apps/web/src/places/locale.ts`                                                                                            | Initialize bundled resources and tolerate blocked/legacy storage.          |
| `apps/web/src/places/locale.test.ts`                                                                                       | Verify storage behavior and paired translations.                           |
| `apps/web/src/places/resources.ts`                                                                                         | Supply complete PT-BR/English tracer copy.                                 |
| `apps/web/src/places/formatters.ts`                                                                                        | Present backend centavos and computation instants, without calculations.   |
| `apps/web/src/places/formatters.test.ts`                                                                                   | Prove whole-reais BRL and explicit UTC presentation.                       |
| `apps/web/src/places/place-fixtures.test.ts`                                                                               | Distinguish actual contributing evidence from prepared sections.           |
| `apps/web/src/styles/place.css`                                                                                            | Extend Placa responsively, wrap canonical names and retain 44px targets.   |
| `apps/web/vite.config.ts`                                                                                                  | Proxy only versioned API paths during development.                         |
| `docker/web-nginx.conf`                                                                                                    | Proxy versioned API reads without broad CORS.                              |
| `docker/web.Dockerfile`                                                                                                    | Build the pure contract dependency with the web app.                       |
| `integration/web-place.integration.test.ts`                                                                                | Prove owned acquisition/API/browser journeys and layout regressions.       |
| `package.json`                                                                                                             | Add the typed campaign script and exact browser automation dependency.     |
| `pnpm-lock.yaml`                                                                                                           | Resolve exact compatible dependency and peer graphs.                       |
| `tsconfig.integration.json`                                                                                                | Type browser callbacks with DOM libraries while retaining strictness.      |
| `apps/web/.impeccable/surfaces/src-places-placeoverview-tsx.md`                                                            | Record inherited direction and finished artifact facts only.               |
| `apps/web/.impeccable/review/place-{390,960,1440}-{pt-BR,en}.png`                                                          | Preserve all six refreshed production-fixture viewport/locale captures.    |
| `apps/web/.impeccable/review/reference-{Main,PlaceEN,DesktopPlace}.png`                                                    | Preserve three development-only immutable-artboard comparison captures.    |
| `_bmad-output/initiative-real-estate-intelligence/epic-web/epic-web.md`                                                    | Mirror D-052/D-053 in English.                                             |
| `_bmad-output/initiative-real-estate-intelligence/epic-web/story-place-overview-with-one-figure-from-the-contract-plan.md` | Record implementation, individual triage, verification and result.         |

### Review and convergence

- First Quick pass: high 0, medium 3, low 0; three patch entries applied, none deferred or
  rejected. Follow-up was recommended because cached-error recovery and navigation/target layout
  needed independent confirmation after the first correction batch; that review was performed.
- Follow-up Quick pass: high 0, medium 2, low 0; two patch entries applied, none deferred or
  rejected. Parent independently verified each reported failure before correction. The triage
  log retains all five findings individually; no finding was dropped or grouped away.
- Final `followup_review_recommended: false`: this follow-up patched no high entry, and the
  named regressions now have independently executed proof. Medium patch volume alone is not
  grounds for another follow-up. No specific unverified risk from those corrections remains.
- Initial five-section Impeccable review returned `ship` for the implemented subset. Subsequent
  verdict passes scored the three first-pass and two follow-up fixes resolved at their actual
  scope. Final documentation is complete; no extra detector or open-ended polish pass ran.

### Verification and residual risks

- Root lint/typecheck/test/build/coverage passed after the last code correction; 2,181 unit
  tests include 47 web tests. Strict integration TypeScript and unchanged 80/80/80/75 gates pass.
- Owned real production acquisition/API/browser campaign passed; all six normal captures were
  opened and validated. Additional forced long-name checks are narrow parser-valid loopback
  responses, not mocked persistence, broker or object-store semantics. Normal data stays real.
- Market and Locations campaigns passed, plus 25 support/cleanup regressions in four files.
  Root discovery includes the new test without skips. Owned resources were removed exactly.
- Changed-file formatting, scoped Markdown lint and working/staged whitespace checks pass.
- Advisory Vite bundle sizes remain 611.68kB main and 536.96kB CityScene; no gate was weakened.
  Pre-existing PRODUCT/DESIGN/sidecar drift is recorded above without unauthorized repairs.
- This story is one public figure tracer, not the full later place screen. The broader final
  campaign and remaining local stories are not claimed complete. VPS-dependent stories remain
  owner-blocked; no unlock, external collection, provider call, deploy or push occurred.
