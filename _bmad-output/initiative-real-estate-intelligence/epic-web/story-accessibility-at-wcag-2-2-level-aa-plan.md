---
title: 'Accessibility at WCAG 2.2 level AA'
type: 'feature'
ticket: '6.12'
created: '2026-10-22'
status: 'in-progress'
baseline_revision: '0d9fcdcb579cc78683a64d7aed3d93c219794473'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/apps/web/DESIGN.md'
  - '{project-root}/specs/adrs/0020-vitest-integration-standard.md'
warnings: ['oversized']
deferred: []
---

# Accessibility Implementation Plan

The requested writing-plans structure is integrated here; the owner's mandatory
`bmad-build-auto` workflow supplies execution and review rather than an unavailable
superpowers execution skill. Estimated change exceeds 100 lines across nonmechanical files;
the full route is required. Two synchronous read-only explorations informed this plan.

This is the implementation handoff inside the already-active single 6.12 BMAD invocation.
Do not invoke another build workflow, context loader, detector, finish reviewer or documenter;
the parent owns those orchestration steps and commits. Before UI edits read the existing
Impeccable harden/craft-floor references directly, preserving the incumbent design. Return to
the parent after implementation and verification; do not commit or change ticket acceptance.

<intent-contract>

## Intent

**Problem:** CAP-19 and ticket 6.12 require every delivered MVP screen/state to pass an
automated accessibility check and a recorded keyboard walk, with DESIGN contrast verified.
Earlier isolated axe/activation checks do not establish full Tab reachability, 320px reflow,
actual text enlargement or reduced-motion behavior.

**Approach:** Produce a dedicated evidence-backed owned-production campaign and repair
reproduced accessibility defects while preserving Placa. Record exact supported state coverage,
unavailable capabilities and residual human-assessment limits instead of claiming certification.

## Boundaries & Constraints

**Always:** D-070 and D-051–069; native strict TypeScript/Vitest assertions, Supertest HTTP,
Testcontainers/Compose ownership, Nock network guard and unchanged axe rules. Independent public
contract parsers and actual response bytes; unique UTC campaign, append-only attempts, source/
runtime/evidence hashes after formatting, SQL readback, owned cleanup and foreign preservation.
PT/EN; 390/960/1440 normal layouts; 320 CSS px reflow; native 200% browser zoom. Preserve 44px
product hit areas, native disclosure/form behavior, exact evidence and existing thresholds.

**Never:** Node test/assert, custom assertions, integration fetch/child_process/net/manual process
harness; secret-file access; public writes; real-source enablement/collection, model calls, VPS,
deploy, push, V2/protected routes, fake live Ask or fabricated business responses. No modal trap
for Filters. No design reroll, global documentation repair, hidden axe exclusions, retries/skips,
lowered coverage or timeout inflation to conceal a failure. No overlap between expensive browser,
root gates and coverage runs.

## I/O & Edge-Case Matrix

| Scenario       | Input / State                                                                     | Expected Output / Behavior                                                                                 | Error Handling                                                   |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Public screens | Landing, Place, Search, Filters, Property, Listing, Ask, Privacy                  | Real parsed data, native semantics, zero full-page axe violations, discoverable complete Tab/reverse order | Preserve incomplete results for explicit triage                  |
| Evidence       | Open native summaries, nested evidence, source links and document anchors         | Keyboard activation, logical focus, useful alternatives, retained provenance                               | No concealed content or focus repairs inside traversal           |
| Reads          | Held, refused, malformed or interrupted genuine reads                             | Visible loading/error/retained evidence and keyboard-reachable manual recovery                             | Capture before recovery; no invented business DTO                |
| Search         | Actual empty intersection, invalid query/range, locale change, apply/clear/cancel | Accurate error association, editable drafts, retained URL context and focus                                | Recovery leaves backend authority unchanged                      |
| Ask            | Idle, seven catalogue states, local operands, recorded continuation               | Exact prepared state/result; local edits remain private; usable keyboard thread                            | Interrupted SSE never becomes completion or visitor confirmation |
| Responsive     | Normal widths, 320 CSS px, real native 200% zoom                                  | No lost controls/text or document overflow; contained genuine 2D table exception only                      | Record geometry, zoom selector/DPR/width and target hit areas    |
| Motion         | Initial and changing reduced preference, normal animated landing                  | Intentional reduced alternative, usable reading/focus, pause where required                                | Preserve factual city/stop hierarchy and no-WebGL fallback       |
| Contrast       | Actual text/background/focus roles and token definitions                          | Normal text ≥4.5:1; essential boundary/focus ≥3:1; no color-only signals                                   | Do not test meaningless all-token combinations                   |
| Boundaries     | Untracked Market freshness, unavailable quota/live/source branches                | Explicit mapping to accepted limitations or labelled existing gallery                                      | Never relabel test gallery as production capability              |

</intent-contract>

## Code Map

- `integration/support/fixture.ts` — `allocatePorts`, `ComposeFixture`; existing ownership,
  migration waits and exact teardown. Reuse, do not replace lifecycle or port manager.
- `integration/support/{http,ask-attempt,ask-campaign,cleanup,search-campaign}.ts` — Supertest,
  all-failure evidence/cleanup, `copySurfaceEvidence` final-byte formatting/hashes.
- `integration/support/ask-web-evidence.ts` — reusable SQL/Docker inventories and SSE oracle.
  `askVersion` and `captureAskSurface` are Ask-specific: do not mislabel as whole-MVP identity.
- `integration/support/accessibility.ts` — unexcluded WCAG2/2.1/2.2 A/AA axe. Preserve complete
  incomplete findings; unique run/state/locale/width capture names avoid global-root collisions.
- `integration/support/{property-reads,listing-reads,search-reads,overview-disclosures}.ts` —
  prepared IDs, independent actual APIs and native evidence exercise patterns.
- `integration/web-{privacy,ask-states,search,property,listing,place}.integration.test.ts` —
  reference lifecycle/readiness only, never import registered test suites. Privacy's temporary
  source disable/restore is not required here. Old Place no-Privacy assertion is obsolete after D-069.
- `apps/web/src/shell/AppShell.tsx` — current title/lang effect, rail/top/footer/navigation;
  no bypass/route-focus handling. `resources.ts` owns shell PT/EN copy.
- `apps/web/src/search/{SearchResults,SearchFilters}.tsx` — route-state replacement on
  `?view=filters`, not dialog; inspect actual open/close/apply focus before correction.
- `apps/web/src/{places,properties,listings,ask,privacy}/` — existing screens, unit tests,
  native evidence selectors; reuse `revealEvidenceTarget` rather than duplicate source focus.
- `apps/web/src/landing/{LandingPage,CityScene}.tsx` / `CityScene.ts`, `copy.ts`, `landing.css`
  and `styles/place.css` — landing effect snapshots motion once; high-specificity smooth scrolling
  defeats reduced selector; pulses currently move under reduce. These are reproduction candidates.
- `apps/web/src/shared/token-contrast.test.ts`, `styles/{tokens,components}.css` and DESIGN —
  incumbent semantic role inventory and focus rules; `overflow:hidden` language controls need proof.
- `apps/web/.impeccable/review/campaigns/` — immutable run evidence; `.impeccable/surfaces/`
  and accessibility report preserve finite audit, boundaries and acceptance.

## Tasks & Acceptance

**Execution:**

- [ ] `integration/support/accessibility-catalog.ts` — declare semantic public screen/state
      descriptors, selectors, real-oracle requirements and explicit unsupported/gallery mapping.
      Each six-layout matrix cell remains a variant, not an inflated new BDD scenario.
- [ ] `integration/support/accessibility-browser.ts` and `.test.ts` — bounded genuine Tab and
      Shift+Tab traversal, semantic identities, hit testing, focus-visible/non-obscuration, target,
      overflow/font/computed-contrast evidence. Do not `.focus()` missed controls to pass. Use full
      Chromium persistent context and native `chrome://settings/appearance #zoomLevel` value `2`;
      confirm DPR doubles and CSS viewport halves on actual product, not CDP/CSS scaling.
- [ ] `integration/support/accessibility-evidence.ts` and `.test.ts` — whole production frontend/
      locale/contract/config/lockfile source inventory, compiled backend, exact image/runtime and
      HTTP-served asset identity, immutable formatted captures and append-only failed/success attempts.
- [ ] `integration/web-accessibility.integration.test.ts` — own a fresh minimal real production
      fixture per bounded test partition. Obtain API oracles and pilot before the matrix. Exercise
      all delivered screen families, default/open evidence, supported system states and all seven Ask
      snapshots in both locales at 390/960/1440. Extend actual error/loading/recovery walks, true empty
      Search, invalid filters and local confirmation edits. Add 320px and native 200% screen checks,
      motion preference changes and no-WebGL fallback. Keep honest source/SQL/network/cleanup proof.
      Map component-only branches explicitly; do not enable sources or start needless collection.
- [ ] `apps/web/src/shell/AppShell.tsx`, `places/resources.ts`, associated tests and
      `styles/components.css` / `place.css` — reproduce bypass/route/focus/clipping observations first,
      then batch only demonstrated native interaction fixes with regression tests. Never steal focus
      on background data refresh or locale change; preserve deep source/document anchors and history.
- [ ] `apps/web/src/search/{SearchResults,SearchFilters}.tsx`, associated tests/styles — correct
      demonstrated focus/error-association/reflow defects without changing query/domain behavior.
- [ ] `apps/web/src/landing/{LandingPage.tsx,CityScene.ts,copy.ts,landing.css}` and regression
      tests — reproduce motion observations, then batch preference listener/cleanup, static reduced
      rendering and localized pause affordance if necessary. Preserve city scene composition and tour.
- [ ] `apps/web/src/styles/` and screen tests — repair only measured contrast/320px/zoom/hit-area
      defects. Preserve synchronized DESIGN tokens if a role token truly needs adjustment.
- [ ] `apps/web/.impeccable/review/` — preserve diagnostic failures, successful coverage matrix,
      exact keyboard receipts, full/top/region captures, axe incomplete triage, token role table and
      primary W3C methodology. Conduct at most two batched visual inspection rounds with incumbent
      artboards; parent owns one detector call and fresh finite finish reviewer/documenter handoffs.
- [ ] This plan and epic — record actual commands/results, surprises, known limits and review.
      Run exact gates serially, integration discovery/browser and unchanged coverage; use auto-commit
      implementation → tests/evidence → docs → tracker acceptance, never push.

**Acceptance Criteria:**

- Given the delivered MVP in owned production HTTP, when every declared locale/layout/state cell
  receives full-page axe and an actual Tab/reverse walk, then zero violations and no keyboard
  blocker remain and the ledger contains proof for each cell rather than source-only assertions.
- Given keyboard-only entry and changed routes/filters/anchors, when a visitor skips repetition,
  opens evidence, edits/errors/recovers and goes back, then focus stays discoverable, visible and
  logically related to the action without inventing a modal or activating a business mutation.
- Given either locale, when screens render at 320 CSS px and at independently measured native
  200% zoom, then content/actions remain usable without whole-document overflow or hidden text;
  any actual two-dimensional table exception is named and locally contained.
- Given normal/reduced motion and preference changes, when the visitor reads and navigates the
  landing, then motion can be stopped where necessary and reduced motion is genuinely honored.
- Given effective DESIGN roles, when token and rendered-state contrast evidence is compared,
  then text, essential controls and visible focus meet their applicable thresholds, preserving
  signed/worded movement and the stronger product target-size rule.
- Given campaign completion, when API/runtime/source/SQL/network/teardown receipts are checked,
  then evidence matches the tested bytes, no public write/external source action occurred, owned
  resources are removed, foreign resources remain and limits do not masquerade as certification.

## Implementation Notes

Implementation evidence is diagnostic until the parent completes Verify. Historical campaign
directories and their original append-only ledgers remain unchanged. The 15-partition invocation
begun at 13:39 UTC on 2026-10-22 exited 1 (2 passed, 13 failed, one asynchronous route lifecycle
error). It is not story acceptance. A later focused Landing zoom pilot preserved screenshots
while the naturally focused navigation was still obscured, before changing the product.

Measured product repairs include the public bypass and route/Filters focus handling, 44px public
controls, the Place breadcrumb minimum width (the old Brazil link was 32.06px wide by 44px high),
inset focus indicators for clipped language/Continue/segmented groups, and a Landing controls-only
sticky layer raised only while it contains focus. Canvas and copy retain their separate layers;
the focused tour navigation uses the existing opaque enamel surface rather than moving the scene.
The controls sticky box reserves the full scene height, with flow compensated on the stage's
negative top margin. This keeps controls inside the journey at its boundary instead of leaking
white labels onto the following porcelain section. Its empty footprint is pointer-transparent;
the actual control children remain interactive, preserving canvas behavior. Declarative control
scroll margins account for the header, and keyboard focus uses instant rather than smooth tour
scrolling. No test-side focus/scroll repair during traversal or contrast exclusion is introduced.
Mobile running scenes reserve separate Pause/navigation rows. Post-receipt captures observe
native scroll rest within a2000ms bound and then reset instantly without changing scroll CSS.

The executor separates native document focus from browser-chrome transitions; it never repairs
focus or scroll during traversal. Top/full-page captures are settled only after interaction
receipts. Opaque rendered contrast is numerically gated; canvas, alpha, gradients, shadow-only
paint and axe incomplete findings remain explicit manual assessment, not numerical approval.
The whole-source inventory includes web source/tests, contracts, runtime/configuration, lockfile,
integration executors/helpers and `.dockerignore`, together with served/build/runtime hashes.

Directed helper diagnosis also reproduced paint interference from Playwright clock instrumentation:
the same nine-control real CSS fixture passed without `page.clock.setFixedTime` but reported
reverse outline offsets of 0px instead of the declared -5px with it. Retained-state measurement
therefore uses uninstrumented real elapsed time beyond the actual 30-second staleTime, with a
bounded observable cache-age check, not patched browser clocks or artificial domain freshness.

The explicit catalog keeps six semantic BDD scenarios. Its 38 bounded partitions are execution
containers: discovery, search, keyboard, details, Ask per locale, recovery/retained/variants/subreads/context
per locale and normal width, and adaptation per locale. Existing synthetic variants 901–993 are
read from their canonical adapter; no extra seed or source/license mutation is introduced.
Search retention is genuine next-cursor pagination, not an unsupported old visit with gcTime=0.

Canonical Listing variants can return a Property whose member position exceeds the retained
member count (for example Listing991 position 2 in Property901's one-member set). The executor
derives the full independent membership/position/range predicate and requires the genuine
unverified-context alert and absent ancestry for that state; it does not manufacture context.
Error-only states may have strong description text without a heading or paragraph. Rendered text
measurement therefore inventories direct text-node ranges and separately styled descendants,
including list/table/emphasis text, rather than inferring a child's paint from its parent. Input
and textarea values remain private markers; consumed-font samples never contain those values.
SVG text uses actual fill/fill-opacity rather than CSS color; ambiguous stroke, alpha, gradients
or canvas composition stay explicit manual findings.

## Plan Change Log

- 2026-10-22 parent Verify / D-073: session 43578 terminated with nine passes, a
  reverse-focus failure in recovery EN/390 and 28 unexecuted partitions. Forty isolated
  native traversal cycles and a pre-repair focused production invocation did not reproduce
  the measurement/screenshot disagreement; its internal cause is not claimed. Record the
  decision before making the clipped Ask submit's existing -5px inset invariant in its base
  rule. A deterministic actual-CSS regression failed before that change (session 87501);
  browser/evidence suites passed 12/12 afterward (session 50686). Add read-only before/after
  screenshot CSS observations, not altered waits, assertions or axe rules. Preserve all
  failed bytes, repeat the complete gates and require a new integral identity and current
  visual evidence. This is a functional repair, not another design/polish round.
- 2026-10-22 parent Verify: repeated root lint/typecheck/test/build passed all 2,706
  tests (session 37173). The following coverage command failed in six existing web
  tests solely at their unchanged 5,000ms limit (session 72992). The identical complete
  541-test web suite with V8, the same include/exclude rules and thresholds passed in
  78.13s with two workers (session 94018), with unchanged coverage percentages. Bound
  per-workspace V8 worker concurrency to two in the coverage script, document the
  resource constraint, then rerun the complete root/coverage/discovery gates serially.
  Preserve all tests, isolation, assertions, timeouts and coverage policy; no retry,
  skip, timeout inflation or production change. This is execution-resource control,
  not a relaxation of acceptance or a substitute for the complete browser invocation.
- 2026-10-22 parent Verify: the integral begun at17:20:33UTC finished with exit1 after
  8,545.88s:34 partitions passed, context-en-960 failed, three unexecuted. Root recovery
  removed two alerts while serial descendant reads were still pending; the audit's
  one-second equality poll ran before hierarchy publication. An isolated native DOM-lifecycle
  regression reproduced that exact failure before correction. Extracted preparation now
  awaits actual expected links/options under the existing page-readiness bound before the
  unchanged exact identity/order comparison. Product code, global/assertion timeouts and
  retry policy remain unchanged; wrong order still fails. Preserve the original run and
  its unchanged SQL/owned-foreign cleanup proof. Re-run all38 on a fresh executor identity;
  do not union the34 partial passes with a later invocation.
- 2026-10-22 parent Verify: the owner's concurrent instruction-only commit `f792723`
  changes the AGENTS workspace reference and removes duplicated CLAUDE instructions. The
  first seventeen integral partitions record `ca05515`; subsequent partitions record
  `f792723`. The complete Git delta was inspected, current AGENTS instructions were read,
  and all evaluated inventory/runtime/served hashes remain unchanged. Preserve the original
  version records and owner commit; this bounded metadata reconciliation is not a claim
  that all partitions share one commit or permission to accept different executable bytes.
- 2026-10-22 parent Verify / D-072: the first bounded visual round measured genuine Landing
  stop-name contrast failures over the scene (3.514:1 and 3.481:1 for 15px/600 text). A native
  real-CSS regression rejected the former paint with 34 assertions. One minimal repair batch
  makes the existing enamel-900 navigation ground permanent and extends the strong desktop
  scrim to cover the complete copy column. Four helper files passed16/16 in20.59s; exact root
  lint/typecheck/test/build passed with2,706 unit tests, and unchanged coverage floors passed
  all eight packages. Native discovery enumerated all38 partitions. The prior integral was
  deliberately interrupted (six completed partitions, seventh provisioning, native exit143);
  owned cleanup and anonymous-volume ownership reconciliation are recorded separately, without
  claiming unavailable final SQL proof. A fresh integral is running on the corrected inputs;
  historical partial runs are not combined into acceptance. See the parent verification report.
- 2026-10-22 parent Verify: the second integral invocation passed Discovery, Search and keyboard,
  then stopped in Details after 12 Property variants because the executor omitted Listing's
  real mobile replacement locale control. Added its exact selector and expanded the responsive
  fixture to ordinary/Property/Listing shells; product behavior is unchanged. Original failed
  details run `d5efedda`, SQL unchanged, no forbidden/outside activity and owned/foreign cleanup
  true/true are preserved. A subsequent helper run passed 14/15 but strictly rejected a one-pixel
  displaced top capture: three quiet frames were insufficient for native key-scroll completion.
  Capture preparation now also requires 150ms of observed quiet within the unchanged 2000ms bound,
  before its single instant reset; exact zero-scroll assertion remains. Fresh helper and integral
  runs are required. Diagnostic supplement records both failures without altering original bytes.
- 2026-10-22 parent Verify: the first integral invocation stopped after75.571s in discovery:
  Place PT390 default/open passed, then desktop preparation demanded the intentionally hidden
  mobile footer locale selector. The native keyboard Privacy entry had the same mobile-only
  assumption. Both selectors now choose exactly one genuinely visible header/rail or footer/rail
  entry, with a real-CSS regression at320/390/720/960/1440 and both locales. Product behavior is
  unchanged. Original failed run85c481a1, two approved variants, failed preparation, unchanged
  SQL/network proof and owned/foreign teardown true/true remain intact. The complete38 must
  restart on fresh executor identity, not count the partial run as acceptance. See the separate
  `apps/web/.impeccable/review/accessibility-parent-verify-diagnostics.json` supplement.
- 2026-10-22 parent Verify: completed the authored-reference prerequisite with native strict
  Vitest `integration/support/accessibility-references.test.ts`. Fifteen unchanged artboards,
  including LandingMobile/Desktop, were rendered at their declared preview dimensions using
  local Barlow fonts. Fixed asset allowlists, transformation disclosure, dependency and final
  PNG hashes are separate from production/business evidence. The owned Vite/Chromium test
  passed in11.87s; references are in
  `apps/web/.impeccable/review/accessibility-authored-2026-10-22T16-40-22-004Z-bc13ec26/`.
  This adds an executor input after the directed-pilot freeze; the integral records fresh identity.
- 2026-10-22: Measured Landing sticky-boundary and Pause-overlap defects plus narrow Place
  provenance overflow required minimal consumer CSS repairs after earlier freezes. Those
  historical hashes are not current-build acceptance. The shared property capture helper now
  observes bounded native scrolling and resets instantly only after interaction receipts;
  its own regression is included in required Verify outside the intent-contract suite.
  Authored-artboard references are a separate parent Verify prerequisite: this campaign captures
  product UI, not newly rendered authored canvases. Existing reference metadata must be checked;
  no new LandingDesktop/LandingMobile render-authored reference is claimed by implementation.
- 2026-10-22: Expanded the executor's state mapping after inspection identified missing canonical
  Property/Listing variants and independent Place, hierarchy and Listing-context reads. Added
  bounded supplemental partitions rather than inflating semantic scenario counts or timeouts.
- 2026-10-22: Excluded only `apps/web/.impeccable` from Docker build context. Evidence remains on
  disk and source/tests remain included. `.dockerignore` is an explicit source/config identity input.
- 2026-10-22: The parent will run the single complete final matrix in BMAD step-03 Verify after
  reading the implementation diff. The coding handoff must include green helper/targeted-pilot
  results and exact final inputs; it must not start or substitute its pilots for that integral run.
  Required command:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/web-accessibility.integration.test.ts --bail 1
  ```

  Native fail-fast stops after the failed test and its owned teardown; unexecuted cells are not
  counted as passed. No acceptance or commit is authorized by this implementation handoff.

- 2026-10-22: Split the native keyboard journey from Search paint/layout audits to keep diagnosis
  bounded. Route and chip assertions observe committed UI effects after URL changes, without
  repairing focus or scroll. Original immediate-assert failures remain preserved diagnostics.
- 2026-10-22: A directed Ask audit and compositor screencast reproduced a genuine transient
  contrast defect when the follow-example button re-enabled: white text preceded its interpolated
  blue ground. Inventory found the same busy binding on Filters Apply; other primary consumers
  are static public links/recovery actions, while local Ask confirmation is a normal button.
  The shared primary variant now keeps only its border-color transition so foreground/background
  swap atomically, preserving its colors/hover states. Natural-frame regression covers both
  dynamic consumers; stable-state measurement
  also observes CSS transition completion without disabling motion or substituting token colors.

## Review Triage Log

- 2026-10-22 implementation diagnostic: adaptationabbf52f3 passed30 scenario variants, including
  all eight320/native200% families and seven Ask states at both sizes, before normal-motion
  Landing's post-receipt top capture inherited smooth scrolling. Its final capture failed too,
  preserving AggregateError and leaving finalUiEvidence absent; structural audit is therefore
  explicitly untrusted for that original failed row. Independently its untouched keyboard
  receipt and five-stop/PT real-CSS regression prove Pause obscured two navigation targets.
  Mobile running scenes now separate Pause/navigation rows without changing order/stage/canvas.
  Shared property-capture preparation observes bounded native scroll rest, then instant top
  reset after saved interaction receipts; it never changes CSS or traversal. Original evidence
  remains unchanged; SQL-final unchanged and teardown owned/foreign true/true are preserved.
- 2026-10-22 implementation diagnostic: adaptation1b435621 verified the Landing repair at320 and
  native200%/720, then found Place320 neighbour provenance overflow: a nowrap synthetic badge
  ended at328.406px. Its original failure remains failed; SQL-final unchanged and teardown
  owned/foreign true/true. Consumer-scoped provenance tags now wrap within their evidence column
  while preserving the original20px minimum height; no text/overflow is hidden. Real-CSS PT/EN
  neighbour/monthly-column regression covers this cause before another directed adaptation run.
- 2026-10-22 implementation diagnostic: context pilot32ea8733 passed31 scenario variants with
  SQL-final unchanged and owned/foreign teardown true/true. The following adaptation9ef97faf
  failed unexcluded axe contrast at native200%: the current tour label painted white over the
  following porcelain section (1.08:1). Native focus receipts were otherwise complete. A real-CSS
  boundary regression reproduced nav.bottom=-348 versus journey/stage.bottom=-400: the zero-height
  sticky box let52px of controls overflow its scene. The full-footprint repair preserves scene/copy
  geometry; a native reverse traversal also exposed header obscuration and smooth-scroll lag,
  repaired declaratively as described above. Original failure/ledger/manifests are unchanged.
  The final helper batch passed10/10 and selected web regressions50/50; a new directed adaptation
  pilot is separate from the parent's still-required integral38-partition Verify.
- 2026-10-22 implementation diagnostic: a context pilot timed out after a genuine Listing
  recovery because reused disclosure preparation assumed closed state and an unbounded route
  drain could retain cancelled browser requests. Its original partial ledger remains unchanged;
  no SQL-final/readback or original teardown callback proof exists for that run. Subsequent
  exact-project inventory found zero owned resources after the Testcontainers reaper; this is
  not retroactive no-write/foreign-preservation acceptance. A separate append-only supplement
  records the limitation. Preparation now closes disclosures outside measurement, checkpoints
  the primary stack before drain, and records bounded drain/dispatch/failure state even on error.
  Still-held cleanup is explicitly `cleanup-aborted`, never relabelled valid recovery. A real
  Chromium fetch+AbortController/disclosure regression reproduces the cancellation boundary;
  this browser-native transport is the subject under test, not a Node HTTP oracle. Independent
  API oracles remain Supertest. Minimal typed transport-port regressions prove bound and handler
  failures propagate to release outer resources; there are no partial Playwright client casts.

## Design Notes

Refinement of the incumbent Placa world only. Operate application, Read privacy, Persuade landing.
Filters remain a route section. Native bypass/focus and necessary pause controls are accessibility
affordances under D-070, not a new visual direction. Screen-reader pronunciation, physical daylight
and physical touch remain explicit human limits. No unavailable state is silently counted as tested.

Native browser zoom methodology was proven before coding with the bundled full Chromium channel:
the real settings selector changed from `1` to `2`, DPR from 1 to 2 and CSS viewport from 1440 to
720 while the 16px CSS font remained 16px. Earlier default headless-shell/isolated-context probes
could not open settings; use `launchPersistentContext('', { channel: 'chromium' })`.

Normative methodology: [WCAG 2.2](https://www.w3.org/TR/wcag/),
[reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html),
[focus not obscured](https://w3c.github.io/wcag/understanding/focus-not-obscured-minimum.html)
and [target size](https://w3c.github.io/wcag/understanding/target-size-minimum).

## Verification

**Parent Verify in progress (not acceptance):**

Historical checkpoint after D-072: the exact root lint/typecheck/test/build gate passed with
2,706 unit tests, all eight unchanged coverage floors passed, the four native helper files
passed 16/16, and native integration discovery listed all 38 accessibility partitions.
The parent read all 6,159 lines of the staged implementation/test/documentation diff against
the preserved baseline; generated raw-evidence index removals belong to separately audited
maintenance commit `ca05515`, not an omitted implementation change.

The integral invocation (native session 7047) began at 17:20:33 UTC with source
`bbc3cb94cef6fb9ad841569db77cb7358ad3785e97b4619a0692ec574455b450`, backend
`10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b` and executor
`68962f9428c409a00a12e8764a5b0a26ac9a4e4734727ace1313aa9a57554341`.
It finished with exit 1 after 8,545.88s: 34 partitions passed, context-en-960 failed
during descendant-read preparation, and three partitions were not executed. The original
failed receipt and teardown remain unchanged. This invocation is not acceptance.

After the executor-only preparation correction, all four helper files passed 17/17 in
33.95s (session 27913). A focused diagnostic invocation (session 36011) began at
19:46:21 UTC with unchanged source/backend and executor
`d91209036f3b53081ddb93110009ce68b5c82a880c42cb931c6e5f6540be077b`.
All four selected partitions passed with exit 0 in 1,140.01s; the other 34 tests were
filtered, not executed. Independent audit rehashed 1,274 final manifest entries, matched
118 cells to 122 approved attempts (including boundaries), and found no integrity,
SQL/network/cleanup discrepancy or axe violation. All 64 preserved axe incomplete nodes
match their own captured roles; final visual/manual adjudication still remains required.
These four diagnostic partitions cannot be combined with the old 34 passes.
The exact root gate passed again with 2,706 unit tests (session 94713, exit 0), followed
serially by all eight workspace coverage suites (session 49784, exit 0). The web suite
passed 541/541 in 56.57s with unchanged coverage floors and five-second test deadlines.
The coverage script bounds instrumented workers to two after the recorded contention
diagnostic; it does not retry failed tests or alter isolation, assertions or coverage rules.
Post-gate readback matched all 187 source, 1,028 backend and 37 executor files against
the identities above. The parent fully read the updated 6,851-line staged diff at
`/tmp/rei-accessibility-verify-2026-10-22T2012.diff`.
Native discovery passed next (session 76954, exit 0), including all 38 accessibility
partitions. The owner then explicitly requested commits of the staged work before
acceptance. These are progress checkpoints, not completion. The fresh complete invocation
started at 20:19:49 UTC (session 43578) on canonical commit
`9e7f539012544d8a1f91317c309fe6de6aa83f96`, with the unchanged source/backend and
corrected executor identities above. The first seven completed partitions independently
reconcile 2,048 final manifest entries, 213 matrix cells and 232 approved attempts including
boundaries and explicit journeys. All 30 planned normal-layout captures were opened and
their current bytes match their final manifests. No integrity issue or axe violation was
found. The remaining 31 partitions and native terminal result are pending; this partial
checkpoint does not accept the story.
Session 43578 subsequently terminated with native exit 1 (2,095.14s): nine partitions
passed, recovery EN/390 failed on the Place question's reverse-focus measurement, and
28 partitions did not execute. The original failure and same-stop screenshot are
preserved. D-073 records the subsequent narrowly scoped geometry repair and its red/green
native regression, without claiming the transient's internal cause. The browser/evidence
helper files passed 12/12 afterward (session 50686); exact root gates are running in
session 68485. Owned cleanup and foreign preservation of the failed invocation passed.
The complete matrix test
audit and finite finish handoffs remain pending. No evaluated source/executor/compiled-
backend edits are made while a browser invocation runs. Current results and the explicit
partial manual-paint analysis are recorded in the
[parent verification report](../../../apps/web/.impeccable/review/accessibility-parent-verify-2026-10-22.md).

The following earlier checkpoints are retained as historical diagnostics, not current acceptance.

After the first responsive-preparation correction, selected ESLint and strict integration TypeScript
passed. The helper batch then passed15/15 in18.81s. That historical integral invocation began at
16:46:32UTC with discovery run`ac841970`; source remains
`6ec86e4b216996a29009ae496d9ffcdd87cbf5193e93063790861b94a3311c17`, backend
`10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b`, and the new executor is
`0b2ac37b0e03d776feb114fcff39dc960da4c54d7b47bc55d43fa03b664458bb`.
Discovery, Search and the six native keyboard journeys completed successfully; Details failed
in Listing locale preparation after 12 Property variants. The invocation failed in511.12s;
34 partitions were not executed. Completed and failed partition teardown is owned/foreign true/true.
The executor corrections described in the change log require a fresh complete invocation.
Root gates, coverage, manual paint adjudication and finite finish review remain pending.
No historical partial campaign is merged into this invocation's acceptance.

**Observed implementation-only checkpoint (not acceptance):**

Final directed adaptation `b4e456af` passed (exit 0, 223.79s test/224.92s invocation): one setup
inconclusive plus 34 approved variants, no executor errors; SQL-final unchanged, outside/forbidden
empty, diagnosticLeak=false, owned/foreign teardown true/true at 16:34:14.435 UTC. Its pilot bytes are
source `6ec86e4b216996a29009ae496d9ffcdd87cbf5193e93063790861b94a3311c17`,
backend `10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b`,
executor `16fa4175e8fc1950a707bf2b005772542c85b5ce7f03504d32b1c7ca91dc2624`.
Read-only verification matched 1,251 source/backend/executor files and 395 final-run surface entries.
The parent subsequently added the authored-reference executor; that new input is outside this
pilot identity and must be included in the parent's final Verify identity.
Helpers 11/11 (18.13s), shared capture 3/3 (0.204s), selected web regressions 50/50 (7.14s), selected
lint/integration TS/web typecheck passed before freeze. All eight green directed ledgers are
structurally trusted; seven use historical hashes. No integral 38/root gate/coverage acceptance
is claimed. See `apps/web/.impeccable/review/accessibility-implementation-handoff.{md,json}` for
all 38 names, commands/results, hashes, green versus unexecuted-directed mapping, 25 manual Landing
contrast observations and 18 axe incomplete nodes with exact state/locale/width/selector/reason.
All remain separate from the 6,068 final-adaptation opaque numerical observations that passed.

**Required Verify commands (expected outcomes, not a claim that pending gates passed):**

- Fifteen authored artboards render with exact current dependencies and local fonts;
  passed in 11.87s in parent Verify:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/support/accessibility-references.test.ts --bail 1
  ```

- Native and shared capture helper regression tests pass:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/support/accessibility-browser.test.ts \
    integration/support/accessibility-evidence.test.ts \
    integration/support/accessibility-fault.test.ts \
    integration/support/property-capture.test.ts
  ```

- Parent must run all 38 declared owned browser partitions and cleanup serially against final bytes:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/web-accessibility.integration.test.ts --bail 1
  ```

- The exact required story gate succeeds serially, with no weakened check:

  ```bash
  pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
  ```

- `pnpm run test:coverage` — incumbent workspace coverage floors stay unchanged and pass.
- Native integration discovery includes the new campaign:

  ```bash
  pnpm exec vitest list --config vitest.integration.config.ts
  ```

Parent finite visual checks compare authored Main/DesktopPlace, Search/Filters, Property/Listing,
Ask/AskConfirm/DesktopAsk, States, LandingDesktop/LandingMobile and Components; Privacy retains
its accepted no-artboard boundary. Review candidate defects as measured evidence, not assumptions.
