---
title: 'Shell, navigation and conventions'
type: 'feature'
ticket: '3'
created: '2026-10-12'
status: done
baseline_revision: '58701af163ece0131f5fab44bae7a24be8cd9b6e'
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
  - /workspace/repos/real-estate-intelligence/apps/web/.impeccable/surfaces/src-shell-appshell-tsx.md
  - /home/vscode/.codex/skills/impeccable-v2/SKILL.md
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The place tracer lacks mobile destination tabs, a complete public rail/footer and
extensible route, locale and HTTP conventions. Search and Ask are not reachable (CAP-19).

**Approach:** Complete the existing Placa shell around a public route table. D-054 adds real
place-scoped Search/Ask entry screens with honest web-workflow boundaries, not full later screens.
Reuse validated geography and establish bundled per-screen catalogues and one abortable API client.

## Boundaries & Constraints

**Always:** TypeScript/pnpm; ADR 0028; exactly Places/Search/Ask; retained place across destinations,
direct links/history; existing default Bela Vista; canonical names unchanged; local Barlow fonts;
existing Placa tokens/artboards, 390/960/1440, 16/24px gutters, 232px non-sticky rail, 44px targets,
wrapped complete labels. Read unknown JSON through public parsers; Query owns ordinary read cache,
cancel superseded reads, retain explicit retry/stale/focus/reconnect policies. PT-BR first, complete
EN per-screen namespaces, safe legacy/denied storage; Intl presents BRL/count/percent/probability/
date backend values only. Keep real acquired median/evidence and coverage 80/80/80/75 unchanged.
Every integration helper/probe/campaign stays strict TypeScript/Vitest/Supertest/Testcontainers/Nock.

**Never:** Full search/filter/results, question form, thread/run admission/SSE, prepared business
values or fake empty/error states. No claim that backend capabilities are unavailable. No dead
Privacy href (page/link belong 6.10), Market/V2/Alerts/bell/More/Operations/review/theme switch. No
backend changes, provider calls, real collection, VPS unlock/access, deploy/push, secret-file reads,
new world/artboard rewrite, weakened sandbox/gates, Node test/assert/manual integration harness,
out-of-repo edits or commits by implementer. Preserve landing behavior and existing review fixes.

## I/O & Edge-Case Matrix

| Scenario          | Input / State                                    | Expected Output / Behavior                                                                                         | Error Handling                              |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Public navigation | Place selected; three destinations               | Working links retain place; one current destination per nav                                                        | No protected/V2/dead links                  |
| Entry             | Search/Ask valid place                           | Actual plate/crumbs, translated title/boundary, real median link                                                   | No form, count, fake failure or result      |
| Identity          | Invalid/missing place or malformed/failed read   | Invalid makes no detail request; honest localized failure/retry; cached geography retained                         | No stale prior-place plate or raw payload   |
| Locale            | PT/en, legacy or denied storage                  | All shell/entry text and document language/title change; URL/place stable                                          | Safe PT default; names untranslated         |
| HTTP              | Successful/non-OK/malformed/aborted public read  | Versioned same-origin request, parser validates unknown JSON, abort propagated                                     | Sanitized typed status; no retry/replay     |
| Formatting        | Backend money/count/movement/probability/instant | BRL aggregate whole/exact two decimals, signed percent with minus glyph, locale probability/count and explicit UTC | No currency conversion/business calculation |

</intent-contract>

## Code Map

- `apps/web/src/routes.tsx`, `App.tsx`: existing BrowserRouter/Query/i18n providers and nested
  places routes. Add explicit typed public destination table with index/default and parameter paths;
  use one shared shell; `/` landing remains separate. Prefer path parameters over hidden state.
- `src/places/PlaceShell.tsx`: currently one rail link/mobile bar/neighborhood picker; replace
  with `src/shell/AppShell.tsx`, `PublicNavigation.tsx` and focused `PlaceEntry.tsx` for two routes.
  Extract private `PlacePlate` from `PlaceOverview.tsx` into `src/places/PlacePlate.tsx`; keep
  self-inclusive crumb filtering, identity validation, cached-error geography and wrapping.
- `src/styles/{components,place}.css`: existing tabbar/ind/rail selected styles and 960 breakpoint;
  scoped three-column override, real links with SVG icons copied from Main/Search/Ask, page-end
  mobile footer and rail foot. Do not use fixed/sticky or 100vh rail. Preserve previous fixes.
- `src/places/{locale,resources}.ts`: synchronous bundled i18n, tolerant `rei.locale`; split resource
  groups into shell/place/search/ask namespaces with complete typed pairs. Keep default place
  namespace for existing tracer tests; shell and entry components choose their namespace explicitly.
- `src/places/place-client.ts`: nested generic read/parser/abort; extract `src/api/client.ts`
  with sanitized status error, retaining compatible `PlaceReadError` identity for existing tests.
  Place-specific ID, response identity, median basis and serial hierarchy guards remain there.
- `src/places/formatters.ts`: existing whole BRL and UTC; extend for exact money, count, signed
  percentages and probabilities, keeping median/instant exports and avoiding domain calculations.
- `src/places/{PlaceOverview,place-client,locale,formatters}.test.*`, `place-fixtures.test.ts`:
  isolated cache/i18n/MemoryRouter and fetch fixtures. New shell/entry component tests reuse these
  patterns with cleanup/cancellation; no blanket coverage exclusion or reduced thresholds.
- `integration/web-place.integration.test.ts`: owned real acquisition/API/browser campaign,
  loopback-only sandboxed Chromium, six locales/widths, fonts, deep links, history and long names.
  Its old combined Search/Ask absence assertion must become positive navigation proof plus
  protected/V2 absence. No new Compose harness or AI service is needed for geographic entry routes.

## Tasks & Acceptance

**Execution:**

- [x] `src/shell/AppShell.test.tsx`, `src/routes.tsx`, `src/shell/{AppShell,PublicNavigation}.tsx`
      — TDD real typed route table/shared shell; three working selected-place links, active states,
      index defaults, direct/reload/back/forward, translated title, only public destinations.
- [x] `src/shell/PlaceEntry.test.tsx`, `src/shell/PlaceEntry.tsx`, `src/places/{PlacePlate,PlaceOverview}.tsx`
      — TDD shared actual geography; Search/Ask title and truthful current-version boundary:
      PT Search `A tela de resultados e filtros ainda não está disponível nesta versão.`;
      PT Ask `A tela de execuções ainda não está disponível nesta versão.`; EN paired factual copy.
      Working `Ver a mediana do lugar` / `View the place median` link; no form/figure/count.
      Invalid, absent, malformed, delayed, failed and cached-error recovery retain correct identity.
- [x] `src/places/{resources,locale,LocaleControls}.ts*`, `src/places/locale.test.ts`
      — establish explicit bundled shell/place/search/ask groups, key parity and namespace choice;
      preserve existing tracer copy/storage semantics. Test switching destination/locale without
      losing place or re-fetching locale-independent reads, including throwing storage.
- [x] `src/api/{client,client.test}.ts`, `src/places/{place-client,place-client.test}.ts`
      — extract versioned abortable parsed GET transport; test signal identity, one attempt,
      unknown JSON parser, sanitized non-OK and malformed responses; preserve all geographic guards.
- [x] `src/places/{formatters,formatters.test}.ts` — central Intl helpers for whole aggregate BRL,
      exact two-decimal BRL, integer count, signed percentage (including zero and Unicode minus),
      probability and UTC timestamp in both locales; test design examples and retain old exports.
- [x] `src/styles/place.css`, `src/shell/*.tsx` — reuse incumbent icons/styles; exactly three
      mobile tabs and desktop rail links, 44px targets, wrapped labels, current yellow icon pill/
      rail square. Footer at phone page end and rail foot contains actual locale/synthetic label;
      no premature Privacy href. Read craft-floor immediately before UI edits; no context rerun.
- [x] `integration/web-place.integration.test.ts` — extend native Vitest production campaign:
      all three links clicked at 390/960/1440 PT/en, correct URLs/headings/current state; history,
      direct/reload; locale on entries; no Ask mutation/authority/SSE/protected requests; localfonts
      only. Preserve acquisition/median/long-name checks. Capture settled top/full-page Place,
      Search and Ask for every width/locale under `.impeccable/review/`; no artboard edits.

**Acceptance Criteria:**

- Given the production owned Compose stack and a selected neighborhood, when a visitor uses
  Places, Search and Ask at 390/960/1440 in PT/en, then each real screen opens with that place's
  validated plate, correct active shell destination and truthful content, and returning shows the
  actual acquired median. No protected/V2 destination, inert action or external font appears.
- Given an entry deep link, when reloading, using history and switching locale, then the entry and
  place survive, names remain canonical, labels/footer/title/language match locale, and no write,
  run admission or business calculation occurs. Invalid/unavailable geography fails honestly.
- Given the original Placa artboards and real captures, when comparing the shipped shell subset,
  then navigation geometry/type/colors/selection/wrapping match the inherited public adaptation;
  the fresh finish reviewer and documenter complete before commits and no future screen is claimed.

## Implementation Notes

- Route full: more than 100 lines and five files, medium ticket risk. D-054 is recorded before
  implementation. Parent owns independent gates, bounded visual comparison, fresh finish reviewer/
  documenter, BMAD review and commits. Implementer does not commit. All apply_patch edits stay in
  the repository. No dependency install is expected; required fonts and libraries already exist.
- Parent already loaded Impeccable context once this session; do not rerun it. Read required
  playbooks/craft floor before UI changes. Preserve incumbent system files and report drift only.
  Record TDD failing/passing evidence, all actual files touched and every incomplete check here.
- TDD: the first focused run failed on the missing transport, exact-money formatter and public
  navigation (seven failed tests and one import-failed suite). After implementation, the full web
  run exposed a Search-to-Ask namespace-switch regression; keying the focused entry by destination
  and place corrected the translated title while preserving the shared geography Query cache.
- Implementer changed `apps/web/src/routes.tsx`, `apps/web/src/styles/place.css`,
  `apps/web/src/api/{client,client.test}.ts`,
  `apps/web/src/shell/{AppShell,AppShell.test,PublicNavigation,PlaceEntry,PlaceEntry.test}.tsx`,
  `apps/web/src/shell/public-routes.ts`, `apps/web/src/places/PlacePlate.tsx`,
  `apps/web/src/places/{PlaceOverview,LocaleControls}.tsx`,
  `apps/web/src/places/{place-client,resources,locale,locale.test,formatters,formatters.test}.ts`,
  `integration/web-place.integration.test.ts` and this plan; removed superseded `PlaceShell.tsx`.
  Generated 36 settled review captures (three destinations, three widths, two locales, top/full).
  The parent-owned epic and surface brief were preserved. No backend or design-system edit,
  dependency change, deployment, external request, secret-file read or commit was made.
- Implementer gates passed: repository lint, strict all-workspace/integration type checking,
  production build, all-workspace coverage with unchanged floors/exclusions, 25 support regression
  tests, and the owned real-acquisition browser campaign. The production build retains its existing
  large-chunk advisory; it is not a failed gate or a new scope item.
- Final unit evidence: `pnpm run test` passed 2,205 tests in 192 files across eight workspaces,
  including 71 web tests. The final official coverage run reports web statements 98.52%, lines
  99.47%, functions 100% and branches 92.02%. The last browser rerun passed in 57.45 seconds;
  integration discovery, changed-file Prettier, scoped plan Markdown lint and diff checking passed.
- Parent independently passed root lint/typecheck/test/build and coverage after one bounded visual
  correction batch. Browser regression first failed on the white unselected phone-footer locale;
  existing enamel/surface tokens restored contrast. Entry padding now uses existing 16px spacing.
  Capture readiness waits for all five neighborhoods, avoiding intermediate navigation evidence.
  The pre-review real-acquisition native Vitest/Playwright campaign passed in 125.15 seconds. Parent
  inspected all 36 final top/full captures in the second and last confirmation round. The once-only
  detector returned no findings. Fresh finish review approved the shell; the quick code review
  identified two direct-link edge cases, patched and independently verified as recorded below.

## Plan Change Log

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Trailing-slash direct links lose the current destination marker — parent
    reproduced accepted route matching and checked installed NavLink equality/prefix logic:
    `end` disallows the accepted slash suffix. Remove `end` on place-scoped public/neighborhood
    links. The same implementer removed `end`; all three trailing-slash destination regressions
    failed before the patch and passed afterward. Parent production browser checks also prove
    one current public/neighborhood item for every destination in all six width/locale contexts.
  - `[medium]` `[patch]` Case-insensitive destination routes produce Places title/neighborhood
    targets — parent reproduced `/Search` and `/Ask` matching, then traced the case-sensitive
    shell lookup to its Places fallback. Compare only the matched destination in lowercase;
    keep place identity guards/canonical targets unchanged. The same implementer lowercased only
    the matched destination. Both case-variant regressions failed before and passed afterward;
    parent real-browser checks verify titles, markers and canonical neighborhood URLs in all six
    contexts. All five new cases pass in the 11-test focused shell suite and full parent gates.

## Design Notes

Code-led Operate extension of inherited Placa, candidate 4/seed 3d3cd1ae. D-054 is the explicit
increment boundary, not a changed identity: three usable public navigation entries, real place
plate and truthful web-screen limitations. Reference Main/PlaceEN/Search/Ask/DesktopPlace/
DesktopAsk geometry at each required width/locale. Parent opens every capture in one batched
inspection, fixes one batch and confirms at most once; fresh finish review/documentation follows.
No shipping raster, new tokens, artboard change or broad drift repair is authorized.

Parent comparison completed in two bounded batches. Original Main, PlaceEN and DesktopPlace
references were preserved; original Search, Ask and DesktopAsk were rendered with local fonts as
additional critique references, without changing artboards or claiming future workflow delivery.
Footer contrast and entry spacing are covered by browser assertions and confirmed in every final
capture. No further parent-led polishing pass is authorized.

## Verification

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all gates pass.
- `pnpm run test:coverage` — unchanged 80/80/80/75 in every workspace, no new exclusions.
- `pnpm run test:integration:web-place` — owned real acquisition and browser shell journeys pass.
- Native Vitest support command below — 25 support/convention/cleanup regressions pass;
  TypeScript remains enforced.
- `pnpm run test:integration:list`, changed-file Prettier, scoped Markdown lint with `--no-globs`,
  `git diff --check` — campaign discovered, no skipped proof or malformed files.
- Compare every settled capture against inherited original artboard shell regions; check actual
  local font loading, 44px navigation, 232px rail, no horizontal overflow and real link targets.
  Detector once, then fresh-context Impeccable finish review and documenter before completion.
- Parent matrix audit: 32 focused tests in five files passed. Public navigation is covered by
  retained-place/current-state/history and default-route tests; entry by both actual-identity
  Search/Ask boundary tests; identity by invalid/malformed/failed/cached/delayed cancellation
  cases; locale by namespace parity, legacy/denied storage and no-refetch/title-switch tests;
  HTTP by exact-signal/unknown-parser/one-attempt/sanitized status and parser-error tests;
  formatting by paired locale, exact/aggregate money and explicit UTC tests. No matrix row is
  uncovered. Native support: 25 tests passed; integration discovery and final formatting checks
  passed. Post-review root test total is 2,210 across 192 files/eight workspaces (76 web); final web
  coverage remains 98.52% statements, 92.02% branches, 100% functions and 99.47% lines.
- Post-review parent rerun: root lint, strict workspace/integration typecheck, test and build
  all exited zero; coverage passed unchanged floors. The owned real-acquisition production
  browser campaign passed in 85.89 seconds, recapturing the same 36 review artifacts and proving
  all five accepted direct-link variants in each width/locale context. Native support remains
  25 tests passing; integration discovery passes. No skipped assertion or retry was added.

```bash
pnpm exec vitest run --config vitest.integration.config.ts \
  integration/support/convention.test.ts integration/support/http.test.ts \
  integration/support/fixture.test.ts integration/source-register-cleanup.test.ts
```

## Auto Run Result

Status: built. The inherited Placa shell now has usable place-scoped Places, Search and Ask
destinations, retained canonical geography, honest incremental entry screens, bundled per-screen
locale catalogues, shared abortable parsed HTTP reads and deterministic presentation conventions.

### Files changed

- `apps/web/src/api/client.ts` — extracted versioned one-attempt parsed GET transport with
  sanitized typed errors; `client.test.ts` covers signal, parser and failure behavior.
- `apps/web/src/shell/AppShell.tsx` — replaces removed `src/places/PlaceShell.tsx` with the shared
  locale-aware shell, retained neighborhood navigation and case-normalized destination title.
- `apps/web/src/shell/PublicNavigation.tsx` — three real public destinations, inherited icons,
  accessible current state and accepted trailing-slash behavior.
- `apps/web/src/shell/public-routes.ts` — typed public destination table and retained-place URLs.
- `apps/web/src/shell/PlaceEntry.tsx` — validated geographic Search/Ask entries and median links,
  without claiming full later workflows or fabricating business evidence.
- `apps/web/src/shell/AppShell.test.tsx` — route defaults, destination retention, history, locale,
  protected-link absence and five accepted deep-link edge regressions.
- `apps/web/src/shell/PlaceEntry.test.tsx` — actual identity, truthful boundary, invalid/missing/
  malformed/failed/cached/delayed reads and locale-switch behavior.
- `apps/web/src/places/PlacePlate.tsx` — extracted canonical plate and self-inclusive-safe crumbs.
- `apps/web/src/places/PlaceOverview.tsx` — reuses plate while preserving acquired median evidence.
- `apps/web/src/places/LocaleControls.tsx` — explicit shell namespace for shared locale controls.
- `apps/web/src/places/formatters.ts` — exact/aggregate money, count, signed percent, probability
  and UTC presentation; `formatters.test.ts` proves paired locale/design examples.
- `apps/web/src/places/locale.ts` — bundled screen namespaces with existing safe storage behavior;
  `locale.test.ts` proves key parity and locale compatibility.
- `apps/web/src/places/resources.ts` — complete paired shell/place/search/ask copy.
- `apps/web/src/places/place-client.ts` — shared HTTP transport without relaxing geographic guards.
- `apps/web/src/routes.tsx` — nested public destination routes and default neighborhood redirects.
- `apps/web/src/styles/place.css` — inherited mobile tabs, desktop rail and accessible footer/
  entry spacing without new tokens or fixed-height/sticky rail.
- `integration/web-place.integration.test.ts` — TypeScript native Vitest production browser
  campaign for all destinations, accepted deep links, locale/history, real acquisition and local
  fonts; retains actual median, long-name and owned cleanup proof.
- `apps/web/.impeccable/review/{place,search,ask}-{390,960,1440}-{pt-BR,en}{,-top}.png` — 36 settled
  top/full-page captures; existing Place images refreshed and remaining variants added.
- `apps/web/.impeccable/review/reference-{Search,Ask,DesktopAsk}.png` — original-artboard critique
  evidence rendered with local fonts, not shipping raster or a future-workflow completion claim.
- `apps/web/.impeccable/surfaces/src-shell-appshell-tsx.md` — surface-scoped D-054 decision,
  observed layout and final verification; incumbent world/sidecar preserved.
- `epic-web.md` — English D-054 mirror of the prior append-only Portuguese owner decision.
- `story-shell-navigation-and-conventions-plan.md` — implementation, matrix, review and verification
  evidence; intent contract preserved.

### Review and verification outcome

Quick lens: two verified medium findings, two separate trivial patches, zero high/low/false/
maybe-false findings, zero deferred and zero rejected items. Each patch was applied by the same
implementer and proven by red-to-green focused tests plus independent production browser checks.
Follow-up recommendation: false. The two-medium first-pass trigger was considered, but no
specific unverified risk remains in either accepted direct-link behavior. Review iteration stays
zero; no intent or plan re-derivation occurred.

Parent lint/typecheck/test/build and coverage passed after both patches: 2,210 tests, 192 files,
eight workspaces, including 76 web tests. Coverage floors/exclusions remain unchanged; web
98.52% statements, 92.02% branches, 100% functions and 99.47% lines. Native support 25 tests
and discovery pass. Production acquisition/browser verification passed in 85.89 seconds across
390/960/1440 and PT/en, with no external font or protected/write/run/SSE request. The matrix
audit has no uncovered row. Parent visual confirmation used two bounded rounds and one detector;
the fresh finish reviewer reopened all 36 post-patch captures and confirmed SHIP with no material
fixes and no remaining regression. The documenter completed the surface-scoped evidence while
preserving DESIGN.md and the sidecar; no new raster provenance entry is needed for review captures.

Residual limits: full Search/Ask workflows and Privacy links remain later stories under D-054;
VPS-dependent work remains blocked for the owner. The existing production chunk-size advisory is
not a failed gate. Pre-existing global design narrative/sidecar scope differences are reported
and preserved, not silently repaired. No backend change, dependency addition, secret-file read,
real collection, deployment, push or external write occurred.

## Orchestrator acceptance

Accepted as done on 2026-10-12 by the agent on the owner's behalf under the unattended mandate.
Build-auto first halted at built with a clean worktree. All 63 reviewed paths, counting both sides
of the shell rename, occur after the full pinned baseline; implementation, tests and documentation
were committed separately with normal hooks. The two review patches, root gates, unchanged coverage,
25 support tests, discovery, real Compose/browser journeys, current SHIP finish and COMPLETE
documentation satisfy this entry's verify. No dependent VPS story is unlocked or marked done.
