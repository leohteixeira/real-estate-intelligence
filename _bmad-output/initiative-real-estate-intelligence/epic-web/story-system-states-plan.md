---
title: 'System states'
type: 'feature'
ticket: '4'
created: '2026-10-12'
status: 'built'
baseline_revision: '79a850541b493af628d93d5c479130f42cdf6e37'
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
  - /workspace/repos/real-estate-intelligence/apps/web/.impeccable/surfaces/src-shared-systemstates-tsx.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md
warnings: [oversized]
deferred: []
---

# System states Implementation Plan

**Goal:** Reusable Placa loading, empty, failure and stale states with truthful recovery.

**Architecture:** Shared typed React components consume backend evidence and caller-owned actions.
Existing Query reads remain abortable and use one cache; isolated fixtures prove states without
shipping unfinished workflows. BMad's full-route handoff and plan location supersede interactive
writing-plans defaults under D-052/D-054; do not create another plan or request approval.

**Tech Stack:** React, i18next, TanStack Query, Vitest/Testing Library, typed Vitest integration,
Supertest/Testcontainers/Nock, Playwright and the existing full-page axe harness. No new dependency.

**Route:** Full (auto): four components, consumer/error changes and browser campaigns exceed 100
non-mechanical lines and five files. Risk raised from low to medium because retained evidence and
public/protected truth must remain correct.

<!-- prettier-ignore-start -->

<intent-contract>

## Intent

**Problem:** Screens have ad-hoc loading/errors, no named empty-result recovery and no explicit stale
notice. Visitors cannot consistently understand what happened or recover without losing context.

**Approach:** Implement the four general states from States.dc.html as shared components, wire real
consumers and verify all forced cases in both locales/widths, preserving the incremental boundaries.

## Boundaries & Constraints

**Always:** Follow epic-web CAP-19, ADRs and D-056. Preserve the Placa world, canonical place names,
local fonts, 44px controls, wrapping, UTC provenance, asking/sale tags and backend-only figures.
Use apply_patch for manual edits, pnpm only, strict TypeScript and existing integration helpers.
Read the installed impeccable-v2 craft-floor immediately before UI edits; do not rerun context,
roll a new concept or repair unrelated drift. Preserve cancellation identity, explicit manual retry,
retry:false and a single cache. Keep all existing gates and 80/80/80/75 coverage floors unchanged.

**Never:** Touch .env*, VPS, real sources, live models, branches, existing data or unrelated files;
commit/push in the implementation handoff. No node:test/assert, fetch or manual process harness in
integration. No fabricated request IDs, source failures or business values; no new public gallery,
protected route, premature complete Search/Ask screen or full WCAG claim.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Loading | Delayed place/median, known or unknown place | Status plus faithful skeleton; known plate first, unknown name absent | Abort on navigation; no automatic retry |
| Empty | Backend filter explanation and relax/widen actions | Names responsible filter/limit/last excluded count/minimum; native working actions | Optional alert only with caller availability/destination |
| Read failure | HTTP 503/404, parse error or network failure | Names failed read; preserves known place/filters; retry restores real figure | Only valid x-request-id UUID displayed; absent/invalid IDs and raw payload absent |
| Stale | Returned stale evidence with ageSeconds | Age notice plus unchanged value/count/sources/computed time | Failure source/since and collection link only when explicitly supplied and authorized |
| Retained read | Existing value, background refetch fails | Known plate and last real figure remain readable with failure/retry | No reset to zero, no lost selection |
| Invalid/missing | Invalid identifier or genuine unknown 404 | Honest existing invalid/missing place recovery | No invented plate or catalogue fetch for invalid ID |
| Locale/layout | Both locales, long copy at 390/960/1440px | Localized controls, BRL/Intl age, canonical names, wrapping, keyboard focus | No horizontal scroll/clipped text, no type shrink |

</intent-contract>

<!-- prettier-ignore-end -->

## Code Map

- `apps/web/src/api/client.ts` — ApiReadError currently retains status only; fetch is allowed here
  in product code. Capture public x-request-id safely for status and parse failures. Do not expose
  error bodies. `apps/web/src/places/place-client.ts` wraps it and must preserve that evidence.
- `apps/web/src/places/PlaceOverview.tsx`, `PlaceEntry.tsx`, `place-queries.ts` — existing live
  median, incremental Search/Ask, retry:false/cache/AbortSignal. The shell's catalogue can supply
  a genuinely known plate during loading, without another cache or fabricated place metadata.
- `apps/web/src/shell/AppShell.tsx` — existing navigation and retained catalogue; preserve the
  three public entries. Use shared read-error where compatible, without resetting links.
- `apps/web/src/shared/Figure.tsx`, `Provenance.tsx`, `shared-fixtures.ts` — reuse actual formatted
  value/evidence and optional genuine links. MarketEvidence has ageSeconds but no failed source.
- `apps/web/src/places/resources.ts`, `formatters.ts`, `styles/components.css`, `styles/place.css`
  — bundled two-locale dictionaries and existing note/warning/danger/btn/sk patterns. Skeleton
  reduced motion exists. Extend without palette/layout replacement.
- `docs/design/canvas/project/States.dc.html` — first four columns are this story; bottom Ask
  states remain their own stories. Mobile/desktop adaptation must preserve the authored rhythm.
- `integration/web-place.integration.test.ts` — owned real Compose browser proof, loopback-only
  requests, sandboxed Chromium, dimensions/locales and safe cleanup. Extend forced read cases.
- `integration/web-components.integration.test.ts`, `apps/web/test-fixtures/shared-components/`,
  `apps/web/vite.config.ts`, `integration/support/accessibility.ts` — reuse test-only Vite entry,
  fixed artboard allowlist, parsed real synthetic responses and full-page axe evidence. Add a
  states fixture and typed `integration/web-system-states.integration.test.ts` if that keeps the
  campaigns focused; reuse shared lifecycle rather than inventing an HTTP/process harness.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/api/client.test.ts`, `places/place-client.test.ts` — add failing tests for
      valid/invalid/absent public UUID, sanitized status/parse/network errors and unchanged abort identity;
      run `pnpm --filter @rei/web test -- src/api/client.test.ts src/places/place-client.test.ts`.
- [x] `apps/web/src/api/client.ts`, `places/place-client.ts` — preserve optional validated request
      evidence through wrappers. Keep the constructor backward compatible. A golden probe is:

  ```ts
  const id = 'd392f952-20fa-49b4-8cf6-4da26c8d7abc';
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('private payload', {
        status: 503,
        headers: { 'x-request-id': id },
      }),
    ),
  );
  await expect(
    createApiClient().read('/places', new AbortController().signal, parsePlacesResponse),
  ).rejects.toMatchObject({ status: 503, requestId: id });
  ```

- [x] `apps/web/src/shared/SystemStates.test.tsx` — first write red tests for every matrix row,
      including retained figures, action invocation/destinations, optional protected details, no inferred
      failure, zero/missing age handling, both locales and no secret/raw error/request ID leaks.
- [x] `apps/web/src/shared/SystemStates.tsx`, `places/resources.ts`,
      `apps/web/src/styles/system-states.css` — implement focused typed LoadingState, NoResultsState,
      LoadErrorState and StaleFiguresNotice using native controls and existing classes. Empty recovery
      accepts explicit real actions; failure accepts a caller description/retry and sanitized
      public ID;
      stale notice accepts backend age with optional explicit failure/status evidence. Each renders
      correct live-region semantics without duplicate announcements. Import styles through the actual
      stylesheet entry. Keep untracked evidence distinct from stale, never fabricate an age.
- [x] `apps/web/src/places/PlaceOverview.tsx`, `PlaceEntry.tsx`, `shell/AppShell.tsx`, their `.test.tsx`
      — wire loading/error and stale notice to existing consumers; preserve known plate, last successful
      value, filters/search parameters, missing/invalid recovery and explicit retry. Do not treat median
      insufficient data as Search no-results. Preserve D-054 incremental text. Run web unit suite green.
- [x] `apps/web/test-fixtures/system-states/index.html`, `main.tsx`, `apps/web/vite.config.ts` — add
      a test-only state gallery with explicit constructed-case labeling and real fixture-owned action
      targets; include States in the fixed reference allowlist with local fonts. No production route
      or build asset. Render reference-scale top four columns and responsive long-copy variants.
- [x] `integration/web-system-states.integration.test.ts`, `web-place.integration.test.ts` — prove
      every state, working actions, known context retention and recovery in sandboxed Chromium over
      owned synthetic Compose services, in PT/EN at 390/960/1440px. Read actual public data with parsers;
      any constructed stale/failure/source/empty case is labelled, never represented as collected fact.
      Force frontend transport delay/error explicitly; let retry read the actual API. Verify abort and
      valid/no-ID variants. Full-page screenshots start at zero after fonts/motion settle; save axe
      reports without exclusions, DOM geometry/focus/action assertions and source-hashed local-font
      States reference at its declared 1280x1127 size. Use owned cleanup and report failures honestly.
- [x] `story-system-states-plan.md` — append exact changes, test evidence and remaining risks;
      leave intent-contract immutable. Return complete verification; parent performs finish/review,
      documentation, auto-commit and ticket acceptance after independently checking the whole diff.

**Acceptance Criteria:**

- Given the four general conditions, when forced in both locales at phone and desktop widths,
  then each state matches the States visual vocabulary, explains its condition and offers its
  genuine recovery; no invalid/inert/unauthorized action is shown.
- Given the actual place flow, when loading, failing, retrying or navigating during a pending read,
  then known context and retained evidence stay readable, manual retry recovers from the real API,
  and the abandoned request is cancelled rather than replacing the selected place.
- Given stale backend evidence, when rendered publicly, then age and retained provenance are visible
  without claiming an unsupported failing source or exposing collection operations.
- Given the state fixture, when keyboard and full-page axe checks run across the matrix, then actions
  are focusable and work, targets meet 44px, text wraps, and violations are zero; incomplete checks
  are recorded rather than called conformance. Given a production build, no fixture/gallery ships.

## Implementation Notes

- Added the four typed shared states, paired PT/EN copy and a scoped stylesheet using existing
  Placa note, warning, danger, button and skeleton classes. Recovery uses native callbacks/links;
  empty counts and price limits come from callers. Public error evidence is restricted to a
  validated UUID header; status, parser and network failures never render their response bodies.
- Place overview, incremental Search/Ask entry and shell now reuse shared loading/read-error states.
  Known catalogue plates use the existing disabled Query observer, without another read/cache.
  Median and catalogue refetch failures retain real values, provenance, selected places and links.
  Invalid place IDs do not start the catalogue read; genuine 404s do not invent a plate.
- The test-only gallery labels constructed empty counts/prices, stale age/source failure and support
  UUID cases, while the median/provenance/plate are parsed from owned synthetic API responses.
  Optional alert/collection links reach real fixture targets; no new production route is registered.
- Added transport/component/consumer regressions and typed real-service browser campaigns for
  both locales at 390, 960 and 1440px: delayed median/detail, genuine request cancellation,
  sanitized ID/no-ID failures, manual recovery, retained median, fixture actions/focus/geometry,
  full-page axe and local-font source-hashed States reference evidence.

## Plan Change Log

- Browser verification initially rejected a constructed `stale` event-fed median response: that
  production contract explicitly requires `untracked` freshness. Removed the invalid transport
  construction rather than weakening parsing. Constructed stale notice coverage stays labelled
  in the gallery alongside unchanged real value/provenance; public consumer wiring is covered by
  component/consumer tests and never changes backend freshness. No contract or backend change.
- Initial gallery mount required a router provider because the reused PlacePlate has genuine
  breadcrumb Links. Added BrowserRouter within the test-only entry; production routing unchanged.

## Review Triage Log

Implementation verification findings above were fixed before handoff. Independent visual finish,
documentation and the Quick review are complete; acceptance remains a separate parent-owned gate.

### Independent parent verification

- Corrected the shared retry to the authored full-width button and PT label `Tentar de novo`.
  Updated consumer selectors and added a PT/EN full-width/error-ID regression. This was the
  single batched correction after the first visual inspection, not a new visual direction.
- Added 1280px gallery captures and exact 1280x1127 top captures for the reference comparison.
  The second confirmation round opened all 40 final state captures plus `reference-States.png`;
  captures contain the named content with loaded local fonts and no blank/clipped regions.
- Independent root lint/typecheck/unit/build passed after that correction: 198 files / 2,298
  tests overall, including 16 web files / 164 tests. Independent coverage passed all eight
  unchanged 80/80/80/75 floors. Six focused web files / 80 named tests passed, covering every
  matrix row; four integration support files / 25 tests and Vitest discovery also passed.
- The final three-file browser command ran together and passed 3 files / 3 campaigns in
  189.27s. Its 38 new full-page axe reports have zero violations and zero incomplete checks;
  manual checks remain explicitly listed. Owned Docker teardown left no campaign containers.
- The single post-confirmation detector ran on shared states, stylesheet, three consumers and
  gallery TSX/CSS; its result was `[]`. The fresh finish reviewer completed the complete matrix;
  its sole finding was the missing inherited FORM seed in the direction contract. That
  documentation-only correction was accepted by the same reviewer as Resolved, disposition ship.
  The documenter preserved DESIGN.md, design.json and tokens and recorded measured proof/limits
  in the surface brief and `system-states-documentation.md`; no UI recapture was needed.
- Code Map clarification: the existing `PlaceEntry.tsx` consumer is under `apps/web/src/shell/`,
  not `apps/web/src/places/`. This corrects only a path reference outside the intent contract.

### 2026-10-12 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The constructed no-ID retry changed the unrelated top error and
    left its own failure visible. Following the native callback confirmed that both controls
    wrote `retried`, while the no-ID failure rendered unconditionally; the added keyboard
    browser regression failed at the unchanged no-ID error count. The direct correction gives
    that existing fixture case its own recovery flag/status, with both activation orders checked.
    The original implementation agent is no longer available, so the parent applied this patch
    under the full-route fallback. Root checks, coverage, support/discovery and all three browser
    campaigns passed afterward. The same finish reviewer marked retry independence Resolved,
    disposition ship, after opening eight recovered and ten initial gallery frames; this scoped
    verdict preserves, rather than replaces, the earlier whole-surface review.
    No public component, interface, style or plan intent changes.

### Matrix test audit

All rows were exercised by passing tests, not only by source inspection:

| Matrix row      | Passing evidence                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading         | `SystemStates.test.tsx`, `PlaceOverview.test.tsx`, `PlaceEntry.test.tsx`; production delayed median/detail and navigation-abort browser checks                                                       |
| Empty           | `SystemStates.test.tsx` names backend filter evidence, invokes relax/widen and gates optional alert; gallery keyboard actions reach owned destinations                                               |
| Read failure    | `client.test.ts`, `place-client.test.ts`, shared and consumer tests cover status/parse/network/cancellation and valid/absent/invalid UUID; browser valid/no-ID manual retries recover real API data  |
| Stale           | Shared component tests cover age zero/missing/minute/hour, fresh/untracked omission and explicit authorized evidence; labelled gallery preserves real median/provenance beside constructed stale age |
| Retained read   | Place/shell consumer tests and real browser background-failure case retain value, place, sources and computed time, then retry successfully                                                          |
| Invalid/missing | Consumer tests cover invalid/no catalogue request and genuine 404 without an invented plate; existing production route checks pass                                                                   |
| Locale/layout   | Focused tests exercise PT/EN; gallery 390/960/1280/1440 and real read states 390/960/1440 check wrapping, no horizontal overflow, local fonts, keyboard focus, 44px controls and full-page axe       |

## Design Notes

This is an Operate extension of Placa, not a new world. Reference columns show constructed Pinheiros
values; those are labelled fixture inputs, never live median/search truth. Public consumers have no
failing-source evidence/authorized collection route today, so those optional details remain absent.
The source timestamp is not a failure timestamp. Preserve actual numbers even after refetch errors.

The four-column reference rhythm adapts to two columns at tablet and one at phone widths. Long
canonical names wrap without translation, clipping or typography shrinkage. All state actions keep
44px minimum targets and the established focus treatment; skeletons keep existing reduced motion.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck` — pass, including strict integration TypeScript; rerun after
  the final transport/shell regressions and parent visual correction. `pnpm run test` final rerun —
  all eight workspaces pass (198 files / 2,298 tests);
  web final run: 16 files / 164 tests pass. `pnpm run build` final rerun:
  all eight workspaces pass; existing Vite >500kB chunk warning remains informational.
- `pnpm run test:coverage` — final rerun passes unchanged 80% lines/statements/functions and 75%
  branches floors independently across eight workspaces; no exclusions added or checks weakened.
- The support command passed 4 files / 25 harness checks:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/support/convention.test.ts integration/support/fixture.test.ts \
    integration/support/http.test.ts integration/source-register-cleanup.test.ts
  ```

- The planned three-file browser command initially exposed the fixture/invalid stale construction
  described above. After fixing both and the batched visual correction,
  the command below passes 3 files / 3 campaigns together in 182.00s after the Quick-review
  independent retry correction. All required campaigns
  passed with owned cleanup; no skipped conditions. Public delays/failures retry against the API;
  stale conditions are explicitly constructed in the gallery, not falsified live freshness.

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/web-place.integration.test.ts integration/web-components.integration.test.ts \
    integration/web-system-states.integration.test.ts
  ```

- `pnpm run test:integration:list` — new campaign discovered, no skips or empty success.

**Evidence:** `apps/web/.impeccable/review/system-states-{390,960,1280,1440}-{pt-BR,en}.png`
and corresponding geometry/axe JSON, five production read-state captures per viewport/locale,
and `reference-States.png`/`.json` at 1280x1127. The reference source SHA-256 is
`7713b07b826b195ed06d80f585968dce641d2297ae6b43f45288caaef48e27c0`.
The eight additional `system-states-recovered-{390,960,1280,1440}-{pt-BR,en}.png` frames record
both independent recoveries. All 46 new full-page axe reports have zero violations and zero
incomplete checks, without
exclusions. They still list manual screen-reader, daylight, zoom/reflow and comprehension checks;
this is tested evidence, not a full WCAG conformance claim. Production dist inspection rejects the
fixture entry/payload. No owned campaign containers remain after teardown.

**Remaining limits:** The live event-fed median currently has untracked freshness; collection
failure details and authorized operations destinations are not supplied to public consumers.
They therefore remain absent rather than inferred. Search/Ask remain their accepted incremental
entries; no premature full screen or public gallery was added. The Quick review is resolved;
the acceptance gate remains separate from this built result. Prettier range markers outside the
read-only intent contract preserve its original
bytes while the ordinary formatting hook continues to format the rest of this plan.

**Visual finish:** Parent opens every final phone/desktop/locales capture plus the authoritative
reference together, at most two batched rounds; fixes the complete batch, confirms once, then runs
one detector on changed targets. Mandatory fresh finish reviewer must return ship before the
documenter records actual contracts/provenance; no shipping raster asset is introduced.

## Auto Run Result

Four typed shared states and real consumers preserve place, figures, provenance and manual
recovery. The internal gallery remains outside production routes/build. The Quick lens reported
one medium finding: its no-ID retry shared the unrelated top error flag. The parent verified the
claim, reproduced it with a failing keyboard browser regression and applied the direct fixture
correction. There are no deferred or rejected findings. Patch counts: high 0, medium 1, low 0.
Follow-up review recommended: false; this first pass patches only one medium entry and leaves no
specific unverified patch risk after the required verification/handoffs.

Post-patch root lint/typecheck/unit/build and all unchanged coverage floors passed; 25 support
tests and Vitest discovery passed. The focused system-state campaign passed in 62.17s, including
both independent keyboard retry orders across PT/EN and 390/960/1280/1440px. The combined three-file
browser rerun passed in 182.00s. The parent reopened all 49 reference/final state images,
parsed all 46 full-page axe reports and eight geometry reports, and confirmed owned container
teardown. The same finish reviewer closed the fixture retry-independence correction as Resolved,
disposition ship, with no remaining patch regression in the fresh initial/recovered matrix;
the prior whole-surface review and scoped FORM-seed correction remain separate evidence.
The documenter refreshed the preserved contracts and actual proof counts without changing
DESIGN.md, the design sidecar or tokens. Immutable intent SHA-256 remains
`26784a9c02dc25b62c5fc2b4dfab88237a558e6fbf7260ddec70730138d93f3c`.

Residual limits remain those in Verification: real median freshness is untracked; optional failure
sources/collection actions require explicit authorized evidence; Search/Ask stay incremental;
manual WCAG checks are not certified by axe. No new environment variables or VPS action.

### Complete commit plan and changed-file inventory

Use auto-commit in the following order, without push or AI trailers. Each exact path belongs to
one group below; implementation is separate from tests. The ordinary hooks remain enabled.

1. `feat: add reusable Placa system states and retained recovery`
2. `test: verify system states and independent keyboard recovery`
3. `docs: record verified system-state contracts and review`

#### Implementation

| File                                    | Change                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/src/api/client.ts`            | Retain only sanitized public request IDs through read failures.       |
| `apps/web/src/main.tsx`                 | Load the shared system-state stylesheet.                              |
| `apps/web/src/places/PlaceOverview.tsx` | Preserve known place and median evidence through loading and failure. |
| `apps/web/src/places/place-client.ts`   | Carry public request evidence without changing cancellation identity. |
| `apps/web/src/places/resources.ts`      | Provide paired Portuguese and English state/recovery copy.            |
| `apps/web/src/shared/SystemStates.tsx`  | Add typed loading, empty, error and stale components.                 |
| `apps/web/src/shell/AppShell.tsx`       | Reuse shared loading and errors while retaining catalogue/navigation. |
| `apps/web/src/shell/PlaceEntry.tsx`     | Reuse states in the incremental Search and Ask entries.               |
| `apps/web/src/styles/system-states.css` | Extend established Placa state styling without new tokens.            |

#### Tests and browser evidence

The combined rerun also refreshed the existing English phone landing full-page/top capture pair;
these collateral captures were inspected separately and do not enlarge the 49-image state matrix.

| File                                                                                        | Change                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/web/.impeccable/review/ask-1440-en-accessibility.json`                                | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/ask-1440-pt-BR-accessibility.json`                             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/ask-390-en-accessibility.json`                                 | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/ask-390-pt-BR-accessibility.json`                              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/ask-960-en-accessibility.json`                                 | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/ask-960-pt-BR-accessibility.json`                              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/components-1440-en-accessibility.json`                         | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/components-1440-en.png`                                        | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/components-1440-pt-BR-accessibility.json`                      | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/components-1440-pt-BR.png`                                     | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/components-390-en-accessibility.json`                          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/components-390-en.png`                                         | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/components-390-pt-BR-accessibility.json`                       | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/components-390-pt-BR.png`                                      | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/components-960-en-accessibility.json`                          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/components-960-en.png`                                         | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/components-960-pt-BR-accessibility.json`                       | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/components-960-pt-BR.png`                                      | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/expected-failure-unnamed-button-accessibility.json`            | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/landing-1440-en-accessibility.json`                            | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/landing-1440-pt-BR-accessibility.json`                         | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/landing-390-en-accessibility.json`                             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/landing-390-en-top.png`                                        | Refresh inspected collateral phone landing capture from the combined rerun.     |
| `apps/web/.impeccable/review/landing-390-en.png`                                            | Refresh inspected collateral full-page landing capture from the combined rerun. |
| `apps/web/.impeccable/review/landing-390-pt-BR-accessibility.json`                          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/landing-960-en-accessibility.json`                             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/landing-960-pt-BR-accessibility.json`                          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/place-1440-en-accessibility.json`                              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/place-1440-en-top.png`                                         | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-1440-en.png`                                             | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-1440-pt-BR-accessibility.json`                           | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/place-1440-pt-BR-top.png`                                      | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-1440-pt-BR.png`                                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-390-en-accessibility.json`                               | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/place-390-en-top.png`                                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-390-en.png`                                              | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-390-pt-BR-accessibility.json`                            | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/place-390-pt-BR-top.png`                                       | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-390-pt-BR.png`                                           | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-960-en-accessibility.json`                               | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/place-960-en-top.png`                                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-960-en.png`                                              | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-960-pt-BR-accessibility.json`                            | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/place-960-pt-BR-top.png`                                       | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/place-960-pt-BR.png`                                           | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/reference-Components.json`                                     | Record source/viewport provenance for the local-font design reference.          |
| `apps/web/.impeccable/review/reference-Components.png`                                      | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/reference-Search.json`                                         | Record source/viewport provenance for the local-font design reference.          |
| `apps/web/.impeccable/review/reference-States.json`                                         | Record source/viewport provenance for the local-font design reference.          |
| `apps/web/.impeccable/review/reference-States.png`                                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/search-1440-en-accessibility.json`                             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/search-1440-pt-BR-accessibility.json`                          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/search-390-en-accessibility.json`                              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/search-390-pt-BR-accessibility.json`                           | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/search-960-en-accessibility.json`                              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/search-960-pt-BR-accessibility.json`                           | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-id-1440-en-accessibility.json`             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-id-1440-en.png`                            | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-id-1440-pt-BR-accessibility.json`          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-id-1440-pt-BR.png`                         | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-id-390-en-accessibility.json`              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-id-390-en.png`                             | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-id-390-pt-BR-accessibility.json`           | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-id-390-pt-BR.png`                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-id-960-en-accessibility.json`              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-id-960-en.png`                             | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-id-960-pt-BR-accessibility.json`           | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-id-960-pt-BR.png`                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-no-id-1440-en-accessibility.json`          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-no-id-1440-en.png`                         | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-no-id-1440-pt-BR-accessibility.json`       | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-no-id-1440-pt-BR.png`                      | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-no-id-390-en-accessibility.json`           | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-no-id-390-en.png`                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-no-id-390-pt-BR-accessibility.json`        | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-no-id-390-pt-BR.png`                       | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-no-id-960-en-accessibility.json`           | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-no-id-960-en.png`                          | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-failure-no-id-960-pt-BR-accessibility.json`        | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-failure-no-id-960-pt-BR.png`                       | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-known-place-loading-1440-en-accessibility.json`    | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-known-place-loading-1440-en.png`                   | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-known-place-loading-1440-pt-BR-accessibility.json` | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-known-place-loading-1440-pt-BR.png`                | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-known-place-loading-390-en-accessibility.json`     | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-known-place-loading-390-en.png`                    | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-known-place-loading-390-pt-BR-accessibility.json`  | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-known-place-loading-390-pt-BR.png`                 | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-known-place-loading-960-en-accessibility.json`     | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-known-place-loading-960-en.png`                    | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-known-place-loading-960-pt-BR-accessibility.json`  | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-known-place-loading-960-pt-BR.png`                 | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-loading-1440-en-accessibility.json`                | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-loading-1440-en.png`                               | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-loading-1440-pt-BR-accessibility.json`             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-loading-1440-pt-BR.png`                            | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-loading-390-en-accessibility.json`                 | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-loading-390-en.png`                                | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-loading-390-pt-BR-accessibility.json`              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-loading-390-pt-BR.png`                             | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-loading-960-en-accessibility.json`                 | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-loading-960-en.png`                                | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-loading-960-pt-BR-accessibility.json`              | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-loading-960-pt-BR.png`                             | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-retained-1440-en-accessibility.json`               | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-retained-1440-en.png`                              | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-retained-1440-pt-BR-accessibility.json`            | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-retained-1440-pt-BR.png`                           | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-retained-390-en-accessibility.json`                | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-retained-390-en.png`                               | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-retained-390-pt-BR-accessibility.json`             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-retained-390-pt-BR.png`                            | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-retained-960-en-accessibility.json`                | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-retained-960-en.png`                               | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-read-retained-960-pt-BR-accessibility.json`             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-read-retained-960-pt-BR.png`                            | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-1280-en-accessibility.json`                      | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-1280-en-geometry.json`                           | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-1280-en-top.png`                                 | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-1280-en.png`                                     | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-1280-pt-BR-accessibility.json`                   | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-1280-pt-BR-geometry.json`                        | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-1280-pt-BR-top.png`                              | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-1280-pt-BR.png`                                  | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-1440-en-accessibility.json`                      | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-1440-en-geometry.json`                           | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-1440-en.png`                                     | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-1440-pt-BR-accessibility.json`                   | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-1440-pt-BR-geometry.json`                        | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-1440-pt-BR.png`                                  | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-390-en-accessibility.json`                       | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-390-en-geometry.json`                            | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-390-en.png`                                      | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-390-pt-BR-accessibility.json`                    | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-390-pt-BR-geometry.json`                         | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-390-pt-BR.png`                                   | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-960-en-accessibility.json`                       | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-960-en-geometry.json`                            | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-960-en.png`                                      | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-960-pt-BR-accessibility.json`                    | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-960-pt-BR-geometry.json`                         | Record local fonts, action geometry, overflow and exercised recovery.           |
| `apps/web/.impeccable/review/system-states-960-pt-BR.png`                                   | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/src/api/client.test.ts`                                                           | Cover transport, shared-state or consumer behavior with isolated regressions.   |
| `apps/web/src/places/PlaceOverview.test.tsx`                                                | Cover transport, shared-state or consumer behavior with isolated regressions.   |
| `apps/web/src/places/place-client.test.ts`                                                  | Cover transport, shared-state or consumer behavior with isolated regressions.   |
| `apps/web/src/shared/SystemStates.test.tsx`                                                 | Cover transport, shared-state or consumer behavior with isolated regressions.   |
| `apps/web/src/shell/AppShell.test.tsx`                                                      | Cover transport, shared-state or consumer behavior with isolated regressions.   |
| `apps/web/src/shell/PlaceEntry.test.tsx`                                                    | Cover transport, shared-state or consumer behavior with isolated regressions.   |
| `apps/web/test-fixtures/system-states/fixture.css`                                          | Adapt the labelled internal gallery at phone and desktop widths.                |
| `apps/web/test-fixtures/system-states/index.html`                                           | Add a test-only gallery entry outside the production build.                     |
| `apps/web/test-fixtures/system-states/main.tsx`                                             | Render labelled real/constructed evidence and independently working recoveries. |
| `apps/web/vite.config.ts`                                                                   | Allow only fixed test fixture/reference entries in development.                 |
| `integration/support/system-state-reads.ts`                                                 | Exercise real API loading, cancellation, retry and retained-read states.        |
| `integration/web-place.integration.test.ts`                                                 | Extend owned production browser proof with forced read conditions.              |
| `integration/web-system-states.integration.test.ts`                                         | Verify gallery actions, both retry orders, geometry and accessibility.          |
| `apps/web/.impeccable/review/system-states-recovered-1280-en-accessibility.json`            | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-1280-en.png`                           | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-recovered-1280-pt-BR-accessibility.json`         | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-1280-pt-BR.png`                        | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-recovered-1440-en-accessibility.json`            | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-1440-en.png`                           | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-recovered-1440-pt-BR-accessibility.json`         | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-1440-pt-BR.png`                        | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-recovered-390-en-accessibility.json`             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-390-en.png`                            | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-recovered-390-pt-BR-accessibility.json`          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-390-pt-BR.png`                         | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-recovered-960-en-accessibility.json`             | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-960-en.png`                            | Preserve the named viewport/locale reference or full-page browser capture.      |
| `apps/web/.impeccable/review/system-states-recovered-960-pt-BR-accessibility.json`          | Record full-page axe outcomes without excluded rules or regions.                |
| `apps/web/.impeccable/review/system-states-recovered-960-pt-BR.png`                         | Preserve the named viewport/locale reference or full-page browser capture.      |

#### Documentation

| File                                                                                    | Change                                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `_bmad-output/initiative-real-estate-intelligence/epic-web/epic-web.md`                 | Mirror owner decision D-056 in the epic.                                   |
| `_bmad-output/initiative-real-estate-intelligence/epic-web/story-system-states-plan.md` | Record intent, implementation, review, verification and commit boundaries. |
| `apps/web/.impeccable/review/system-states-documentation.md`                            | Document preserved Placa contracts, evidence and inherited drift.          |
| `apps/web/.impeccable/surfaces/src-shared-systemstates-tsx.md`                          | Preserve the direction contract and measured proof limits.                 |
