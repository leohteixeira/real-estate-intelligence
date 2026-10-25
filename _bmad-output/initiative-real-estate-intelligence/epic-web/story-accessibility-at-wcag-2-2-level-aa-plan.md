---
title: 'Accessibility at WCAG 2.2 level AA'
type: 'feature'
ticket: '12'
created: '2026-10-22'
status: done
baseline_revision: '0d9fcdcb579cc78683a64d7aed3d93c219794473'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/apps/web/DESIGN.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md'
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

## Resumption amendment — 2026-10-24 (D-079/D-080)

The original intent-contract above is preserved as historical accepted intent. HEAD
`a5ca572382b8f7c9525bd3beb611ea4387b897f4` removes the local Landing in favor of an exact
root HTTP 308 to the independent portfolio. README documents the ownership change. The
original Landing/motion matrix row remains outstanding in that owner repository; no local
pass accepts its appearance, accessibility or privacy. No external navigation is authorized.

Continue only the necessary executor reconciliation before fresh full verification:

- Remove local Landing from `accessibilityScreens` and adapt the mapping/BDD/boundaries to
  seven operational families. Keep the same 43 partitions and six semantic scenarios;
  Discovery retains Place default/open at every PT/EN and 390/960/1440 combination.
- In `web-accessibility.integration.test.ts`, remove the obsolete local Landing animation,
  WebGL and no-WebGL paths. All operational reflow/native zoom checks and normal/error/empty/
  keyboard coverage stay unchanged. Add a real owned Nginx root 308 check in Discovery,
  without following redirects, plus local `/places`, `/privacy`, `/ask` and `/search` entry
  response checks and document navigation of those screens. Save the response contract in
  immutable evidence. Do not call or whitelist the portfolio host.
- Retire only the two `accessibility-browser.test.ts` regressions that read the deleted
  `src/landing/landing.css`. Keep generic keyboard, obstruction, privacy, semantic naming,
  contrast and language-control checks. Add catalog regression for the seven screen families,
  exact redirect contract and explicit externally owned presentation obligation.
- Remove obsolete Landing selectors from native zoom preparation if that code navigates the
  root instead of its supplied operational path. Inspect all route assumptions; fix concrete
  remaining redirect mismatches. Keep historical authored Landing references unchanged as
  design artifacts; they are not production passes.
- Run the targeted helper/catalog tests and lint/typecheck. Parent owns the full gates,
  fresh integral browser campaign, story acceptance and logical commits. Do not invoke another
  workflow or perform a new general UI review. Append actual commands/results here.

This is a narrow continuation of the full-route implementation handoff. The implementing
agent owns only the reconciliation above; the parent separately owns the renderer repair,
its tests, decision record, epic notes, root gates and final evidence audit. Keep the existing
in-progress status and baseline. Raw historical campaign directories were not transferred
into this workspace; preserve historical summaries and report that evidence limitation.

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
  source disable/restore is not required here. Old Place no-Privacy assertion is obsolete after
  D-069.
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

## Execution amendment — owner direction, 2026-10-25

This amendment governs the remaining work and all handoffs; preserve historical evidence below.
The unmet requirement is a passing complete production campaign on the stabilized
version, followed by the explicitly required independent finish/BMAD handoffs and delivery gates.
No demonstrated product defect remains open: the rail-hover contrast repair and its native
red/green regression are complete. The Ask recovery executor readiness repair passed its directed
scenario; the complete campaign is still required. The preceding Listing load timeout has no
established cause; unusual scheduling latency is evidence of environment trouble, not proof of a
product defect or authority to inflate deadlines.

The one D-087 capture investigation did not reproduce the historical final-PNG disagreement.
Its bounded conclusion is inconclusive historical capture evidence, with no demonstrated product
color defect and no further investigation absent a new verifiable acceptance-relevant hypothesis.
Judge current captures on their own evidence. Preserve the executed temporary source with its
existing ignored raw artifacts; do not deliver or rerun a permanent diagnostic.

The directed `details` execution (`07:38:13Z`, prefix `accessibility-details-http-20261025-0740`)
did not reproduce the Property read error: all six Property default/open variants passed and
recorded reads were HTTP 200. It hit the unchanged 600-second test deadline after beginning
Listing; no final native cleanup/SQL/manifest receipt exists. Post-exit Compose listings contained
only the incumbent foreign projects. This establishes an oversized execution batch on this host,
not a product repair. Reuse Discovery's existing locale/width partitioning for Details: 48 total
partitions now cover the same 30 detail screen audits and six anchor journeys, with unchanged
semantic scenarios, assertions and deadlines. Verify the catalog, then the formerly failing
PT/960 detail partition, before the final integral run. CPU-pressure observations and the
unreproduced historical read error do not establish a server defect or justify retries.

- Preserve `accessibility-full-d086-serialized-20261025-0720`. Documentation and
  removal of the unimported temporary test do not invalidate its executor/product identities.
  Its execution condition differs from the preceding failure: static jobs and the standalone
  observer have ended, and no competing root gate/browser job will be started.
  It subsequently failed at `07:35:25Z`: eight passed, details failed, 34 unexecuted;
  the Property PT/960 final PNG shows a read error after locale selection. Stop whole-run
  repetition. The directed hypothesis is an actual HTTP/contract failure on normal navigation;
  add only status/path/public request ID to the existing receipt and run `details` to classify
  it. No product fix, timeout increase or environment cause is inferred from a missing selector.
  The bounded PT/960 Details check passed, native exit 0 in 222.35 seconds, with five
  screen audits, the source-anchor journey and boundary checks. Its directory is
  `accessibility-details-pt-BR-960-2026-10-25T07-50-35-006Z-5ea67104`.
  All 59 manifest hashes reconcile; SQL is unchanged, outside/forbidden arrays are empty,
  and native teardown confirms owned removal and foreign preservation. The six recorded API
  responses are HTTP 200. Axe records zero violations and four preserved incomplete nodes
  in Listing's timeline; recorded timeline times measure 8.8615:1, consistent with the
  previously adjudicated pseudo-element limitation. This directed pass is not full acceptance.
  The executor identity is `a8452ad3e4d3f7fbb6455fb61fc06b9e28e3f1226f8a16b3233887a8f0d00b21`.

The owner confirms 8 GB RAM and two vCPUs shared with production. Reduce development
priority and CPU use. Temporary shutdown of other projects is now explicitly authorized
only if needed, preserving the landing page and all its dependencies. Identify exact
ownership and restoration before any stop. The authorized temporary stops completed at
10:27Z, preserving the landing, Caddy and Dev Container. The parent verification records
the exact stopped containers and restoration order; do not restore alongside a heavy campaign.

- Run one heavy job at a time on the shared VPS. Preserve production and foreign resources,
  except the conditional temporary stops explicitly authorized above; no push, deployment or
  publication. If the same failure class recurs, stop whole-run repetition
  and reassess the model/cause with a concrete hypothesis before another attempt.
- Reuse valid unchanged root lint/typecheck, 2,697 unit tests, build, coverage, native helper and
  directed regression results. Documentation needs formatting checks only. Retain all mandatory
  tests/assertions/coverage/hooks/gates; re-run only those invalidated by actual changed inputs.
- Monitor the live campaign without repeatedly reprocessing prior evidence. Reconcile its final
  artifacts once. No new inventory, report layer, abstraction, general audit or routine scheduling
  decision entry. A directed product/executor fix gets its affected check before a final full run.
- Count review rounds over the entire story; no reset at commits or resumption. Historical
  parent inspection rounds count even though frontmatter records zero launched BMAD lenses;
  that counter does not authorize another broad review. Preserve only the explicitly mandatory
  finish reviewer/documenter and pinned Quick handoffs, with ready inputs and inspection of
  changed behavior, demonstrated risks and unmet acceptance. No new broad search or optional loop.
- Once acceptance/invariants and applicable gates hold, commit through the authorized auto-commit
  workflow, update the ticket and follow `tickets.py next`. Relevant optional improvements may be
  recorded without reopening a completed story. Keep external/production obligations pending.

### Resumable execution correction — 2026-10-25

The 48-partition invocation ended with 25 complete partitions and a retained EN/390
aggregate timeout. Reassessing the repeated execution failure replaces the oversized
retained batches with per-screen partitions: 72 execution partitions, unchanged six
semantic scenarios, states, assertions, deadlines and product/backend bytes. The
[parent verification
record](../../../apps/web/.impeccable/review/accessibility-parent-verify-2026-10-25.md)
contains the native failure and bounded capacity diagnosis.

The owner's explicit valid-result reuse instruction and evaluator resumption contract govern
completion: verify/reuse the 25 complete native partitions once, then execute the missing
coverage. Three completed PT retained batches cover their 15 per-screen equivalents; the
remaining 35 partitions require execution. Prove unchanged common dependencies and complete
current-product coverage across the resumed campaign. This supersedes earlier instructions
requiring every valid partition to repeat in one process; it does not accept mixed product
versions, failed/incomplete attempts or reduced functional coverage. Keep the final evidence
reconciliation, mandatory independent handoffs, delivery gates and historical review count.

The subsequent EN/960 timeout disproves screen-level aggregate budgeting: a single
open Place state took 200 seconds for 144 controls in both directions. Keep all 72 partitions
and their fixtures/journeys, but schedule pending families as native sequential state tests
(default/open pairs where applicable). Each keeps the existing 600-second budget; preparation and
final SQL/cleanup use native 300-second phase tests. Keep the existing network hooks and
re-register only the shared fixture origin after each allowlist reset; fallback cleanup
remains mandatory after bail or failure. An ordered catalog contract rejects
missing, reordered or extra audits. Preserve all assertions, states, genuine transitions and
rendered-frame observations. The directed EN/960 pilot passes all six native tests, exit 0
at 11:39:31Z, with unchanged SQL and owned cleanup/foreign preservation. Six newly complete
runs await one final reconciliation; the preceding 25-result validation is reused. Required
context EN/960 also passes all 20 tests, native exit 0 at 11:50:37Z, including genuine deadlines
and final boundary/cleanup receipts. Reconcile all newly completed runs once after the final
invocation;
only the other 28 originally missing partitions execute under the same frozen product/executor (live
handle in the parent verification). This is an executor correction, not a new product
requirement or a waiver of incomplete native evidence.

The final remaining invocation `115112` is terminal at 13:36:45Z, exit 1, after 15 complete
partitions (59/72 equivalents pending final reconciliation). `place-detail-recovered` exposed
an executor dependency-boundary error: parent recovery starts independent child reads while
`retryAlerts` demanded all descendant loading disappear before the caller's readiness gates.
Native SQL, network and owned/foreign teardown receipts pass for the failed run; it contributes
no acceptance. Preserve the executed source and completed evidence. Move the existing child
content/global-settled waits into the helper's optional recovery continuation, after the clicked
alert disappears and before the unchanged zero-loader assertion. No assertion or timeout is
weakened. Run the failed PT/390 subread partition first, then only the other 12 pending
partitions if it passes. The parent verification records the exact reproduction and receipts.
The directed PT/390 subread check passes all 18 tests, native exit 0 at 14:01:19Z,
with 29 audit cells, unchanged SQL, no boundary escape and native owned/foreign cleanup.
The `140138` invocation then completes PT/960, PT/1440 and EN/390, but ends at 15:19:50Z,
exit 1, during EN/960 reductions preparation. Coverage is 63/72 equivalents pending final
reconciliation. This repeated class requires reassessment: initial navigation, like recovery,
starts independent reads; one held child's status does not establish sibling readiness.
Use the existing `settleUnaffected` helper to await actual unheld content before its unchanged
zero-loader assertion, and reuse this model after recovery. No timeout, assertion, retry policy
or product byte changes. The parent records the failure's bounded evidence and native SQL/network/
cleanup receipts. Directed EN/960 passes all 18 tests, native exit 0 at 15:44:00Z, with 29
approved cells,
unchanged SQL, no boundary escape and native owned/foreign cleanup. Scoped lint, formatting and
strict integration types pass. Final executor `0122c07f…` changes only the main integration test;
product/runtime dependencies compare identical.

The final eight-partition invocation, `runtime/accessibility-final-8-20261025-154452`,
ended native exit 0 at `17:16:03.366646Z`: 182 selected tests pass; the 450 other registered
cases are outside this invocation's name filter, not skipped assertions. Execution used one
worker, bail 1, nice 10, CPUs 0–1 and Compose parallelism one. Both adaptation partitions
complete, including EN teardown at `17:16:02.091Z`.

The one-time reconciliation passes with no errors: **72/72 catalogue equivalents and all six
semantic scenarios**, combining 35 new complete runs with the previously validated 25-run
receipt. The new evidence verifies 6,412 manifest hashes, 682 audit cells, 752 attempts
(717 approved plus 35 setup pilots), unchanged SQL, network boundaries, runtime/served assets,
and native owned removal/foreign preservation. The 174 new axe incomplete nodes in 29 groups
are closed by their paired computed contrast evidence (minimum 8.185:1 against 4.5:1);
original axe reports and prior adjudication remain preserved. No product defect or evidence
uncertainty remains open in this acceptance slice. This does not certify assistive-technology
pronunciation or physical touch/daylight perception.

Proof: `runtime/accessibility-final-8-20261025-154452.reconciliation.json`. Reuse this completed
proof and unchanged product gates; do not replay accepted equivalents for documentary changes.
Required scoped independent reviews pass as recorded below; authorized delivery remains.

The final mandatory review is the third broad round across the complete story history; prior
commits and resumes do not reset that count. Review the changed behavior and acceptance risks,
not another general search. The required baseline diff includes historical raw-evidence retention
cleanup and the accepted Landing ownership migration; inspect their contracts without reprocessing
removed raw artifacts. All earlier failures and bounded conclusions remain historical evidence.

## Tasks & Acceptance

**Execution:**

- [x] `integration/support/accessibility-catalog.ts` — declare semantic public screen/state
      descriptors, selectors, real-oracle requirements and explicit unsupported/gallery mapping.
      Each six-layout matrix cell remains a variant, not an inflated new BDD scenario.
- [x] `integration/support/accessibility-browser.ts` and `.test.ts` — bounded genuine Tab and
      Shift+Tab traversal, semantic identities, hit testing, focus-visible/non-obscuration, target,
      overflow/font/computed-contrast evidence. Do not `.focus()` missed controls to pass. Use full
      Chromium persistent context and native `chrome://settings/appearance #zoomLevel` value `2`;
      confirm DPR doubles and CSS viewport halves on actual product, not CDP/CSS scaling.
- [x] `integration/support/accessibility-evidence.ts` and `.test.ts` — whole production frontend/
      locale/contract/config/lockfile source inventory, compiled backend, exact image/runtime and
      HTTP-served asset identity, immutable formatted captures and append-only failed/success
      attempts.
- [x] `integration/web-accessibility.integration.test.ts` — own a fresh minimal real production
      fixture per bounded test partition. Obtain API oracles and pilot before the matrix. Exercise
      all delivered screen families, default/open evidence, supported system states and all
      seven Ask
      snapshots in both locales at 390/960/1440. Extend actual error/loading/recovery walks,
      true empty
      Search, invalid filters and local confirmation edits. Add 320px and native 200% screen checks,
      motion preference changes and no-WebGL fallback. Keep honest source/SQL/network/cleanup proof.
      Map component-only branches explicitly; do not enable sources or start needless collection.
- [x] `apps/web/src/shell/AppShell.tsx`, `places/resources.ts`, associated tests and
      `styles/components.css` / `place.css` — reproduce bypass/route/focus/clipping observations
      first,
      then batch only demonstrated native interaction fixes with regression tests. Never steal focus
      on background data refresh or locale change; preserve deep source/document anchors and
      history.
- [x] `apps/web/src/search/{SearchResults,SearchFilters}.tsx`, associated tests/styles — correct
      demonstrated focus/error-association/reflow defects without changing query/domain behavior.
- [ ] **External owner boundary (D-080), not a local acceptance claim:**
      `apps/web/src/landing/{LandingPage.tsx,CityScene.ts,copy.ts,landing.css}` and regression
      tests — reproduce motion observations, then batch preference listener/cleanup, static reduced
      rendering and localized pause affordance if necessary. Preserve city scene composition and
      tour.
- [x] `apps/web/src/styles/` and screen tests — repair only measured contrast/320px/zoom/hit-area
      defects. Preserve synchronized DESIGN tokens if a role token truly needs adjustment.
- [x] `apps/web/.impeccable/review/` — preserve diagnostic failures, successful coverage matrix,
      exact keyboard receipts, full/top/region captures, axe incomplete triage, token role table and
      primary W3C methodology. Conduct at most two batched visual inspection rounds with incumbent
      artboards; parent owns one detector call and fresh finite finish reviewer/documenter handoffs.
- [x] This plan and epic — record actual commands/results, surprises, known limits and review.
      Run exact gates serially, integration discovery/browser and unchanged coverage; use
      auto-commit
      implementation → tests/evidence → docs → tracker acceptance, never push.

### D-075 receipt privacy repair

**Files:** `integration/support/accessibility-browser.ts`,
`integration/support/accessibility-browser.test.ts`,
`integration/web-accessibility.integration.test.ts`; this plan, epic Notes and parent report.

- [x] Add a real Chromium fixture with labelled/unlabelled/wrapped and ARIA-referenced
      input/textarea controls, including a React-like textarea `textContent` and value.
      Assert all geometry names and both native keyboard directions retain public labels,
      preserve button/summary names, and contain no private marker anywhere in their JSON.
- [x] Run the focused native test before repair and retain its expected failing result:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/support/accessibility-browser.test.ts -t 'editable operands'
  ```

  Session 94879 failed the private-value assertion before repair. Session 67359 then
  passed privacy but rejected a fixture expectation: a wrapped programmatic-only
  textarea genuinely has its enclosing public label. Correct that expectation, not
  the privacy assertion or any matrix behavior; focused session 4699 passed afterward.

- [x] Centralize a browser-serializable safe control descriptor. Read ARIA labels/references
      and associated label text without input/textarea descendants; otherwise use a fixed
      private-control sentinel. Replace only the three unsafe name fallbacks. Do not read
      editable values, change structural identities or mutate focus/scroll/style.
- [x] Before writing contrast/interaction receipts, run

  ```typescript
  expect(
    JSON.stringify({ geometry, keyboard, contrast }).includes(privateMarker),
    'Private local operands must not enter accessibility receipts',
  ).toBe(false);
  ```

- [x] Repeat all four helper files: native session 39068 passed 19/19 in 35.45s.
- [x] Repeat the exact root gate: session 57468 exited 0 with lint, strict typecheck,
      2,706 unit tests across eight workspaces and every production build passing.
- [x] Repeat complete unchanged coverage: session 10903 exited 0 across all eight workspaces,
      retaining the 80% statement/line/function and 75% branch floors independently per package.
- [x] Repeat native discovery: session 92396 exited 0 with 161 registered tests,
      including all 38 accessibility partitions and the new native privacy regression.
- [x] Refresh and read the baseline diff, then freeze the new executor identity before
      starting all 38 partitions. Record a progress checkpoint with auto-commit, never
      story acceptance or push.

  The 7,492-line consolidated diff was fully read before session 61789 started;
  its SHA-256 is `678fc5eed3112582e74eae31cd173d5ef16f92209cc36782a71f5db2d20d95a8`.
  The frozen source/backend/executor inventories are recorded in the parent report.
  The owner's staged checkpoint produced commits `dba2a9d`, `9db9959` and `6a1b478`.
  This completes the freeze task only, not the interrupted browser verification.

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

The explicit catalog keeps six semantic BDD scenarios. Its 43 bounded partitions are execution
containers: Discovery per locale/width, search, keyboard, details, Ask per locale,
recovery/retained/variants/subreads/context
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

- 2026-10-23 parent Verify: whole session 61368 exited 1 after 21 passing partitions;
  `variants-en-390` failed on Listing 991's footer language control and 16 partitions
  did not execute. Preserve its 0px/clipped measurement and same-stop -5px screenshot;
  the internal browser cause is unproven. Apply the adequate D-073 model to the existing
  language selector: keep its -5px inset in the base rule, with no new abstraction,
  state, wait or changed assertion. Native regression 95407 failed before repair;
  focused 48445 and full browser-helper 24339 passed afterward (13/13, exit 0).
  Exact root session 90723 passed lint, strict typecheck, all 2,706 unit tests and
  production builds (exit 0). Focused production session 67041 passed `variants-en-390`
  in 329.47s (exit 0, one executed partition, 37 filtered), diagnostic only. The changed-file
  detector
  found only an unchanged typography advisory. Preserve unchanged evidence; final
  campaign and finite handoffs remain pending, without another broad audit round.

- 2026-10-22 parent Verify: native whole session 44755 terminated with exit 1 after
  12 passing partitions; `retained-pt-BR-390` failed in Compose startup and 25 partitions
  did not execute. Exact-project Docker events establish PostgreSQL unhealthy at 54.306s
  and accepting connections at 59.422s, before cleanup finished. Add only a 60-second
  PostgreSQL startup grace period; preserve the readiness command, interval, timeout and
  consecutive-failure policy. The native configuration regression failed before repair
  (73087), then the full fixture helper suite passed 14/14 (56142). Focused session 23271
  passed in 406.16s (exit 0, 37 partitions filtered), diagnostic only. Exact root session
  86404 then passed lint, strict typecheck, all unit suites and builds (exit 0).
  Inventory comparison found only Compose and the fixture regression changed; retain
  coverage for unchanged application bytes. A new whole campaign remains pending. Preserve failed
  artifacts and owned/foreign cleanup evidence; do not union partial runs into acceptance.
  All 30 selected normal captures from 44755 were opened and manifest-verified, now
  historical. The one detector completed at 22:36 UTC with no demonstrated new defect.
  Apply the owner's bounded-review directive: retain unchanged evidence and run cumulative
  audits once after a successful whole campaign, not after every partial result.

- 2026-10-22 parent Verify: session 61789 started at 21:59:12.574 UTC and terminated
  with native exit 143 at 22:09:11.068 UTC. Discovery and Search completed; the remaining
  36 partitions did not execute. No native Vitest failure summary or deliberate parent
  interruption was observed; the cause is unproven. Both completed partitions have final
  SQL, manifests and owned/foreign teardown receipts. Five independent receipt audits
  passed across their 36 cells; the later runtime-image comparison failed because the
  recorded images no longer existed. Docker events confirm deletion, not its initiator.
  Preserve these partial diagnostics and require a fresh whole invocation, with no
  timeout/assertion changes or historical-pass union. Corrected the plan's frontmatter
  ticket to epic-local ID `12`, as required by `tickets.py join_plans`; intent-contract,
  baseline and in-progress status are unchanged.

- 2026-10-22 parent Verify / D-075: independent JSON receipt audit found the synthetic
  private operand in 18 Ask interaction artifacts through textarea name fallbacks. Native
  session 1675 was deliberately stopped with exit 143 before edits; its six completed
  partitions are diagnostic only. The interrupted recovery PT/390 partition has no final
  SQL/manifest. At 21:46:46.847 UTC, exact-project containers/volumes/network and its reaper
  were absent; every pre-interruption foreign resource remained, with no manual deletion.
  Preserve the original artifacts and repair the executor, not the product interface.
  The following task extends the existing single BMAD invocation's parent Verify.

- 2026-10-22 parent Verify / D-074: root session 68485 passed lint/typecheck but failed
  two AppShell tests at unchanged 5,000ms deadlines, with 539/541 web passes; build was
  not reached. The isolated file passed 16/16 in 6.00s (session 31708), and the identical
  complete web suite passed 541/541 in 48.61s with two workers (session 7036). Record the
  decision before limiting ordinary web Vitest workers to two, matching existing coverage
  resource control. No test, assertion, isolation, deadline, discovery or coverage policy
  changes. Repeat the exact complete root gate, coverage and browser verification serially;
  retain the original failure rather than substituting these diagnostics for acceptance.
  The exact complete root gate then passed all 2,706 tests and production builds
  (session 62821, exit 0); complete eight-workspace coverage passed serially (session
  81822, exit 0), and all four native helper files passed 18/18 in 30.13s (session 54611).
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
  disk and source/tests remain included. `.dockerignore` is an explicit source/config identity
  input.
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

### 2026-10-25 — Final mandatory review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Pinned Quick returned `[]`; no entries are patched, deferred or rejected.
- Required Impeccable finish disposition: `ship`; documenter: No changes. This is the third
  broad round over the complete story history, not a reset after resume or commit. No new
  product/executor change follows these handoffs; no repeated campaign or product gate is needed.

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

**Final campaign and reconciliation pass.** The authoritative final evidence is recorded in the
execution amendment above and `apps/web/.impeccable/review/accessibility-parent-verify-2026-10-25.md`.
Product lint, strict types, 2,697 unit tests/build and all eight coverage floors remain valid for
unchanged product bytes. Directed executor tests and strict integration types pass. Required
independent handoffs and commit hooks remain before delivery; documentation does not repeat
product gates.

**Historical Parent Verify checkpoint (not acceptance):**

Current serialized whole invocation `accessibility-full-d086-serialized-20261025-0720`
started at `2026-10-25T07:17:44Z` under detached supervisor PID 663133. All 1,197 frozen
inventory hashes match. Full native command, sandbox, assertions, workers and deadlines
remain unchanged; no concurrent root gate/browser job is started. Completion and
reconciliation remain pending. The standalone D-087 observer passed once, exit 0 at
`07:16:40Z`, 60.05 seconds. Four corresponding label boxes are white, top and after-final
viewport PNG bytes identical, viewport/media/computed colors stable and SQL/network/
cleanup valid. This non-reproduction does not resolve historical conflicting final paint.

Latest D-086 integral invocation `accessibility-full-d086-20261025-0649` ended native
exit 1 at `2026-10-25T07:13:14Z`, after 1,477.57 seconds: eight passed, details failed,
34 unexecuted out of 43. Prepared Listing navigation exceeded the unchanged 30-second
load deadline before its next audit. Native executor-preparation evidence retains the
error. Final SQL/network and exact owned/foreign cleanup reconcile. Concurrent abnormal
monitor latency and host load are observations, not a proven cause or reason to inflate
deadlines. Source/backend and actual main executor/support bytes remain frozen.
The directed recovery campaign completed 39 cells and 40 approved scenarios; all 356
manifest hashes match, SQL/network/cleanup pass and Ask inventory stays 27/27. Its
interactive shell ended 143 without a terminal native receipt; no command exit 0 or
story acceptance is claimed. Eight complete full-run partitions separately reconcile
500 hashes, 30 cells, 50 scenarios, eight pilots and 30 axe reports without violations
or incompletes. Partial invocations are never combined into acceptance.

D-087's single temporary observation passed without reproducing the historical paint disagreement.
Its raw evidence and executed source remain in the existing ignored diagnostic directory; no
permanent diagnostic or further capture investigation is part of delivery. The historical PNG
remains inconclusive. Only a new verifiable hypothesis affecting acceptance can reopen that issue.

Preceding D-085 integral invocation `accessibility-full-d085-20261025-0556` ended exit 1
at `2026-10-25T06:35:45Z` after 2,387.39 seconds. With no name filter, unchanged
600-second partitions and `--bail 1`, eleven of the 43 natively discovered partitions
completed, including normal screens and Ask
in both locales: 168 approved cells, 197 approved attempts, 1,676 verified manifest
entries, zero axe violations and ten preserved pseudo-element incomplete nodes with
matched opaque contrast/geometry evidence. SQL/network/native cleanup and frozen
source/backend/executor/runtime/served identities reconcile. Root lint, strict types,
2,697 unit tests and production builds passed after the directed rail-hover repair;
unchanged instrumented TypeScript retains its coverage evidence. See the current parent
verification report and not-ready finish packet for exact commands, artifacts, image
snapshots and remaining gates. Recovery PT/390 failed: its first Tab after catalogue
recovery focuses the footer English button outside the viewport; the focused capture
agrees. Thirty-one partitions were not executed. The failed partition's 220 manifest
hashes and final SQL reconcile; native teardown confirms owned removal and foreign
preservation, but the final boundary scenario was not reached. Initial geometry proves Ask
was still loading and the keyboard inventory grew from 22 to 27 controls. D-086 corrects
that premature recovered-state preparation before auditPair/disclosures, waiting for the
existing visible record and enabled Follow contracts without changing traversal or capture.
Affected-partition and fresh complete verification remain required. No directed or historical
partial run fills missing
coverage, and no story acceptance or commit has occurred. Earlier checkpoints below
are retained history, not the current candidate's acceptance.

Historical checkpoint, D-078: focused session 63552 also hit the unchanged 600-second limit
after 16 approved checks (607.42s invocation, exit 1). D-077 did not solve the concrete
failure, so its uncommitted browser-helper/session changes were removed, not committed.
Keep D-076's existing capture and regressions. Reuse the existing locale/width partition
model for Discovery only: six isolated partitions each exercise Place default/open and
Landing, preserving all 18 cells and every assertion, SQL/network and teardown invariant.
The complete catalog now has 43 partitions at the same 600-second limit. All five helper
files passed 22/22 (18980, exit 0, 54.11s), including the new catalog regression;
native registration listed all 43 partitions (93987, exit 0). The exact root gate passed
(10664, exit 0): lint, strict typecheck, 2,706 unit tests and every build. Post-build
rehash confirms unchanged application source/backend bytes. Directed Discovery EN/1440
passed (32108, exit 0, 220.60s invocation/217.54s test): three matrix cells plus boundaries
approved, no failures, final SQL unchanged, outside/forbidden empty, no diagnostic leak,
owned cleanup and foreign preservation true. Only the fresh complete 43-partition campaign
and its required finish handoffs remain pending; the directed pass is not story acceptance.
No additional UI fix, capture mechanism or broad review round is justified by this timeout.

Previous experiment, D-077 (withdrawn): whole invocation 18229 timed out in Discovery at the
unchanged
600-second limit, after 16 approved checks; it is failed, not a partial acceptance.
The controlled production-build capture probe (31955, exit 0) used the campaign's Chromium
arguments and fresh navigation per variant: six keys cost 12.65s with generic screenshots,
10.92s with direct surface capture and 9.19s with native-view capture, including diagnostic
reads. Viewport, focus and scroll were unchanged at the measured stops. Replace generic
preparation with one direct native-view capture, discard bytes and detach the local CDP
session through the existing failure-preserving cleanup helper. Targeted real-browser
regressions passed 2/2 (82149), including genuine obstruction and dual-error cleanup.
All four affected helper files passed 22/22 in session 86835, exit 0, 67.70s.
The exact root gate passed in session 85843 (exit 0): lint, strict typecheck,
2,706 unit tests and all builds. Rehashed inventories confirm unchanged application
source/backend bytes; only the two keyboard-helper executor files differ.
Focused session 63552 then failed the same deadline. These passing experiment gates do
not accept the current D-078 executor or replace its pending verification.

Previous checkpoint, D-076: whole invocation 72519 exited 1 after four partitions;
Ask PT/960's brand hit-test disagreed with its unchanged-focus screenshot and before/after
styles. Preserve the failed campaign and terminal receipt; do not add another consumer CSS
patch. Replace the two-RAF measurement heuristic with one unconditional native 1px capture,
leaving focus, scroll, CSS, caret and animations unchanged. No passing-result polling/retry.
The real-browser sequencing/obstruction regression failed before repair (28670), then
passed afterward (84660); browser/evidence/fault helpers passed 18/18 (74053), and the
authored-reference test passed 1/1 (89487). Session 40820 passed shared capture 3/3 and
the exact root lint/typecheck/test/build gate, including all 2,706 unit tests. Post-build
rehash confirmed unchanged source/backend bytes and only two intended executor changes.
Focused Ask PT production diagnosis passed in session 37574, exit 0, 366.75s;
the formerly failed brand stop passed both traversal directions. SQL remained unchanged
and owned-resource teardown passed. The other 37 partitions were filtered, not accepted;
a fresh whole invocation remains pending.
Existing unchanged coverage/detector evidence remains
valid, but historical partial passes never establish full-campaign acceptance.

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
helper files passed 12/12 afterward (session 50686). Root session 68485 then failed
two unchanged AppShell deadlines after lint/typecheck passed. D-074 records the resulting
two-worker resource control and required fresh complete gates. Owned cleanup and foreign
preservation of the failed browser invocation passed.
The exact complete root command subsequently passed lint, strict typechecking, all
2,706 unit tests and production builds (session 62821, exit 0). Complete eight-workspace
coverage passed next with unchanged floors (session 81822, exit 0); the four-file native
helper batch then passed 18/18 in 30.13s (session 54611, exit 0). The owner's staged-only
checkpoint commits are `ca5d2ff`, `462184b` and `892362e`; unstaged D-074 changes were
preserved rather than silently included. Neither these commits nor the complete gates
accept the still-unexecuted fresh browser matrix.
The complete matrix test
audit and finite finish handoffs remain pending. No evaluated source/executor/compiled-
backend edits are made while a browser invocation runs. Current results and the explicit
partial manual-paint analysis are recorded in the
[parent verification
report](../../../apps/web/.impeccable/review/accessibility-parent-verify-2026-10-22.md).

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
empty, diagnosticLeak=false, owned/foreign teardown true/true at 16:34:14.435 UTC. Its pilot
bytes are
source `6ec86e4b216996a29009ae496d9ffcdd87cbf5193e93063790861b94a3311c17`,
backend `10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b`,
executor `16fa4175e8fc1950a707bf2b005772542c85b5ce7f03504d32b1c7ca91dc2624`.
Read-only verification matched 1,251 source/backend/executor files and 395 final-run surface
entries.
The parent subsequently added the authored-reference executor; that new input is outside this
pilot identity and must be included in the parent's final Verify identity.
Helpers 11/11 (18.13s), shared capture 3/3 (0.204s), selected web regressions 50/50 (7.14s),
selected
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
    integration/support/accessibility-catalog.test.ts \
    integration/support/accessibility-browser.test.ts \
    integration/support/accessibility-evidence.test.ts \
    integration/support/accessibility-fault.test.ts \
    integration/support/property-capture.test.ts
  ```

- Parent must run all 43 declared owned browser partitions and cleanup serially against final bytes:

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

### Executor reconciliation checkpoint — 2026-10-25

The implementing handoff completed the D-079/D-080 reconciliation only. The catalog now
contains seven operational families, unchanged 43 partitions and six semantic scenarios.
Discovery retains Place default/open for every existing locale/width cell and adds the
owned exact root 308 contract plus `/places`, `/privacy`, `/ask` and `/search` response and
document-navigation checks. Immutable receipts include actual status, headers, response
body and its SHA-256, the expected redirect, and local navigation destinations. The pinned
Supertest implementation explicitly initializes `redirects(0)`; no portfolio request or
network allowance was added. External presentation appearance, accessibility, privacy,
motion and no-WebGL assessment remain an explicit obligation in its owner repository.

Removed only the two helper regressions that read deleted Landing CSS and obsolete local
Landing animation/WebGL/no-WebGL campaign paths. Generic keyboard, obstruction, editable
privacy, semantic naming, contrast, language controls and every operational adaptation/
read/error/empty journey remain. Inspected native zoom and version helpers: zoom already
reloads its supplied operational URL, and version collection reads assets directly;
neither requires another root-navigation repair. Historical authored references remain
unchanged. Added a catalog regression for the seven families, exact Nginx root handler,
local entry paths and external obligation.

Actual verification commands/results:

```bash
pnpm exec prettier --write integration/support/accessibility-catalog.ts
integration/support/accessibility-catalog.test.ts
integration/support/accessibility-browser.test.ts
integration/web-accessibility.integration.test.ts
```

passed (exit 0). `git diff --check` passed.

```bash
pnpm exec vitest run --config vitest.integration.config.ts
integration/support/accessibility-catalog.test.ts
integration/support/accessibility-browser.test.ts
integration/support/accessibility-evidence.test.ts
integration/support/accessibility-fault.test.ts integration/support/property-capture.test.ts
```

ran in native session 11635, exit 1, 29.17s: 10 tests passed and 11 browser-dependent
tests failed at Chromium launch with `No usable sandbox`, before their assertions.
Four files passed, including both catalog tests. The generated 28,774,400-byte ELF core
matching the launch timestamp was removed without staging. No sandbox option was
weakened. Parent D-081 owns the local runtime repair and subsequent helper rerun.

- `pnpm run lint && pnpm run typecheck` ran in native session 24092, exit 2.
  Lint and all eight workspace typechecks passed. The final strict integration check
  failed because the transferred workspace lacks `apps/ai/dist` imports required by
  existing Ask integration tests/probes (TS2307 and resulting TS7006 diagnostics).
  The repository requires a build before standalone integration checking; the parent
  must produce those artifacts and repeat the gate. No assertion/type policy changed.

The new real owned-Nginx checks still require the parent's fresh integral campaign;
this handoff claims no production-browser pass or story acceptance. Parent retains the
full gates, unchanged coverage, browser campaign, renderer repair, final evidence audit,
tracker acceptance and logical commits. Raw historical campaign directories were not
transferred, so historical summaries remain available without their original raw bytes.
The in-progress status and baseline are preserved; no commit or push was performed.

Parent subsequently reported the same five-file helper batch passed 21/21 in session
96066 (exit 0, 68.50s) using the D-081 local sandbox helper with `chromiumSandbox: true`.
Its root tests/build session 57009 is running; the parent will repeat strict integration
typechecking after those required compiled artifacts exist. The original failed helper
and pre-build typecheck results above remain preserved diagnostics.

### Parent resource and gate checkpoint — 2026-10-25

Session 57009 failed the unchanged complete-filter test's five-second deadline. Its isolated
recheck passed in 3.45 seconds (18639). D-082 serializes root workspaces, but session 75782
still failed the first Search readiness wait (2227ms), with 531 other web tests passing.
Isolated SearchResults passed 33/33 in 20.78 seconds (37369); complete web with one worker
passed 532/532 in 148.70 seconds (6694). D-083 therefore reduces the existing web and
instrumented coverage worker limit to one, preserving all tests, isolation, deadlines and
coverage floors. This is a bounded resource choice, not proof of React/jsdom's internal order.

Fresh root session 35526 passed with exit 0: lint, all 2,697 unit tests, every production
build and complete strict typecheck including integration. Build precedes typecheck here
to provide the compiled imports this transferred workspace initially lacked. The eight
workspace counts are 214/649/212/532/222/444/197/227. Session 32481 then passed all eight
coverage suites at unchanged floors, the authored-reference test (1/1, all 15 artboards),
and native registration (169 entries, including all 43 accessibility partitions). The parent
opened all 30 reference PNGs and independently verified their hashes and all 30 dependencies.
The fresh integral production-browser campaign, evidence reconciliation and finite finish
handoffs remain pending. The story stays in progress; earlier failures remain diagnostics.

### Directed pilot repair — 2026-10-25 (D-084)

Native pilot 54110 failed before browser startup (exit 1, 86.90 seconds; 42 partitions
filtered). PostgreSQL and API were healthy, but `compose.yaml` still probes the redirecting
root with wget. Health logs show repeated 404 responses after following the external 308.
The parent stopped only its exact owned web container to end those unintended external
reads; the fixture then failed and cleaned up. Do not claim an empty whole-stack external
network boundary for this failed pilot. Preserve its directory and results unchanged.

Implement only the concrete recovery: change the existing Compose web probe URL to
`http://127.0.0.1:3200/index.html`, an already served static document. Add a regression
covering the probe's local non-root contract and a real owned HTTP receipt for this document
in Discovery, asserting 200 HTML with no Location before continuing. Preserve the exact
root 308, all four operational entry/navigation checks, seven screen families, 43 partitions,
assertions, deadlines, sandbox and existing boundaries. No new endpoint, configuration,
retry, network allowance or UI change. Run the focused regression before and after repair;
the parent owns fresh root gates, a new pilot and full campaign. This is the same necessary
slice under D-080's instruction to inspect concrete remaining redirect mismatches.

D-084 implementing handoff: changed only the existing web healthcheck URL to
`http://127.0.0.1:3200/index.html`; its wget command, interval, timeout and retries remain
unchanged. Added a native regression that runs the real Compose config command with
secret-file loading disabled and requires that exact local non-root probe contract.
Discovery now preserves an immutable `evidence/health-document-response.json` with the
actual owned HTTP response status, headers, complete body and SHA-256, then asserts
200 HTML and no Location before the unchanged root 308 and operational entry checks.

Focused red/green command:

```bash
pnpm exec vitest run --config vitest.integration.config.ts integration/support/fixture.test.ts
-t 'web healthcheck'
```

Before repair, session 92850 failed as expected (exit 1, 1.47s): actual probe URL was `/`
instead of `/index.html`. After repair, session 76810 passed (exit 0, 1.13s; one executed
regression, 14 filtered tests). Formatting of the three changed files passed;
`git diff --check` passed; targeted ESLint for `integration/support/fixture.test.ts` and
`integration/web-accessibility.integration.test.ts` passed in session 2696 (exit 0).
No new endpoint, configuration, retry, allowance, UI change or test deadline was added.
Parent retains the fresh root gates, new owned pilot and full campaign. The failed pilot
54110 and its external-follow evidence remain unchanged and are not accepted as clean.
No commit, push or story acceptance was performed by this implementing handoff.

### Directed contrast repair — 2026-10-25

The fresh integral invocation `accessibility-full-d084-20261025-0234` ended with native
exit 1 after 31 passing partitions and one failing partition; later partitions did not run.
Preserve every raw artifact and do not combine its partial passes into acceptance.
Failure directory:
`apps/web/.impeccable/review/campaigns/accessibility-subreads-pt-BR-1440-2026-10-25T05-19-52-700Z-19a9e879/`.
The failed `A11Y-003-8-place-series-loading-pt-BR-1440-open` contrast role is the rail's
Privacy link: computed foreground and background are both rgb(11,44,107), ratio 1:1.
Native assertions and owned cleanup worked; this is not a provisioning or deadline failure.

Investigate and repair only the demonstrated dark-rail link interaction contrast and its
affected sibling links. The generic `.rei a:hover` rule has greater specificity than
`.rail__foot .privacy-footer-link` and `.rail .brand`; the existing `.shell a:hover` and
`.rail a.nav:hover` show the adequate dark-surface model. Confirm this with a deterministic
native Chromium regression loading the actual repository CSS and hovering the real rail
link classes, including brand and Privacy, without suppressing hover, moving the pointer
away to hide a defect, or changing the contrast observer. Check default/hover/focus and
the affected 960/1440 layouts with numerical contrast assertions. Reuse the existing
Vitest/Playwright support test file and unchanged Chromium sandbox. Do not introduce a
test harness, new dependency, broad visual redesign, color-token change or exemption.

Run that regression red before the minimal CSS repair, then green and the affected helper
batch, lint/typecheck and formatting checks. Reuse the incumbent Placa surface contracts
and read the Impeccable craft floor immediately before UI editing; context was already
loaded once and must not be rerun. No new general detector/review round. Parent owns
post-fix build/gates, targeted owned production verification, fresh full 43-partition
invocation, final census and required finish handoffs. Prior reference captures and
partial white-link contrast adjudications cannot accept this now-demonstrated hover state.
Keep story in progress, preserve its baseline and intent-contract, and append actual
commands/results here. No commit, push, deployment or host-production access.

Directed contrast implementing handoff: after reading the incumbent craft floor, added
only `.rail a:hover { color: var(--enamel-200); }` in the existing component stylesheet.
This follows the existing dark shell hover treatment and overrides the generic page-link
hover on the brand and Privacy links. The more specific navigation hover rule retains
its white foreground. No color token, layout, observer or exemption changed.

The new regression in `integration/support/accessibility-browser.test.ts` loads the real
tokens, components, place and privacy styles in native Chromium. At both 960 and 1440px,
it checks brand, current navigation and Privacy links in default, native keyboard focus,
hover with focus and hover alone. It requires computed text contrast of at least 4.5:1
and focus-outline contrast of at least 3:1. After native hover it uses Tab to remove focus
while asserting that hover remains active; it does not move the pointer away or alter
the unchanged measurement/contrast observer. All launches retain `chromiumSandbox: true`
and use the existing local helper through

```bash
CHROME_DEVEL_SANDBOX=/workspace/repos/real-estate-intelligence/apps/web/.impeccable/review/runtime/chrome_sandbox
```

Focused red/green command, with that environment prefix:

```bash
pnpm exec vitest run --config vitest.integration.config.ts
integration/support/accessibility-browser.test.ts -t 'dark rail links'
```

Before the CSS repair, session 44813 failed as expected (exit 1, 6.91s): eight explicit
1:1 failures covered brand and Privacy, hover and hover-with-focus, at both widths.
After repair, session 95722 passed (exit 0, 6.02s; one executed test, 12 filtered).
The affected helper command, with the same environment prefix, was

```bash
pnpm exec vitest run --config vitest.integration.config.ts
integration/support/accessibility-browser.test.ts
integration/support/accessibility-catalog.test.ts
integration/support/accessibility-evidence.test.ts
integration/support/accessibility-fault.test.ts
integration/support/accessibility-references.test.ts
```

Session 24488 passed all 20 tests in all five files (exit 0, 71.63s).

Repository `pnpm lint` passed in session 32013 (exit 0), including context-boundary and
migration-convention checks. Complete `pnpm typecheck` passed in session 44099 (exit 0),
including all eight workspaces and strict integration typechecking. Prettier reported
the changed CSS and browser regression unchanged, and `git diff --check` passed.
Parent retains the post-fix production build/gates, targeted owned production check,
fresh integral 43-partition invocation, final census and finish handoffs. The failed
partial campaign and all its artifacts remain unchanged and cannot establish acceptance.
The story remains in progress; no commit, push, deployment or acceptance was performed.

Parent post-fix session 84015 passed `pnpm test` (all 2,697 tests) and `pnpm build`,
completing the four current root gates with the preceding full lint and typecheck.
All 30 incumbent authored captures and their 30 dependencies were independently rehashed
without mismatch. They consume authored canvas CSS, not the changed production stylesheet.

Directed owned production invocation `accessibility-focused-d085-20261025-0533`
failed at the unchanged 600-second deadline, native exit 1 at `2026-10-25T05:43:07Z`.
Its ledger retains 26 approved scenario attempts, one inconclusive setup pilot and one
failed executor-preparation attempt; the previously failing contrast case 8 passed.
Its setup consumed 93.119 seconds versus 44.794 in the prior comparable D-084 PT/960
partition. No final campaign, teardown, manifest or SQL-boundary report was written.
Exact-label post-exit inventory found all owned containers, volumes and networks absent;
no recovery mutation was necessary. The separate recovery receipt explicitly preserves
the missing native proof and foreign comparison. Raw interrupted evidence is unchanged.

One controlled warm-image check, `accessibility-focused-d085-warm-20261025-0545`,
uses the same native command, assertions, sandbox and 600-second limit, with no overlapping
expensive gates. It is not an automatic retry or acceptance; a second timeout requires
diagnosis before any further replay or executor adjustment. Fresh integral verification,
final reconciliation and required finish handoffs remain open.

The controlled warm-image invocation passed with native exit 0 at `2026-10-25T05:55:08Z`:
596.29 seconds total, 591.96 seconds in the test, 42 other partitions filtered. Independent
reconciliation validates 264 manifest hashes, 29 approved matrix cells, 30 approved scenario
attempts and one inconclusive setup pilot without issues. All 29 axe reports have zero
violations and incomplete results; 10,760 contrast roles are computed. SQL is unchanged,
outside/forbidden empty, diagnosticLeak false, and native cleanup confirms owned removal
and foreign preservation at `2026-10-25T05:55:08.305Z`. The 1,197 source/backend/executor
files remain byte-identical to the candidate. Supplemental post-exit image inspection
failed because the recorded image ID no longer exists; this is explicitly missing proof,
not a new acceptance claim. Future safe image inspection occurs while images are available.

Fresh integral invocation `accessibility-full-d085-20261025-0556` runs the same native
43-partition file without a name filter and with `--bail 1`, retaining the unchanged
600-second per-test limit and sandbox. No root gate overlaps it. Earlier directed or
D-084 passes cannot fill missing cells. Story acceptance, final census and handoffs remain open.

## Auto Run Result

The accessibility extension is built and independently reviewed. Product fixes preserve Placa,
native keyboard/disclosure behavior, honest source/price distinctions and private prepared Ask
inputs. The final VPS continuation repairs executor preparation/scheduling and genuine sibling-read
readiness while preserving assertions, deadlines, sandboxing, all 72 partition equivalents and the
six semantic scenarios. Production presentation remains externally owned under D-080.

Changed files since the preceding HEAD:

- `apps/web/src/styles/components.css`: measured rail-hover contrast uses existing enamel token;
  `routes.tsx`: formatting of the already accepted redirect.
- `apps/web/vite.config.ts`, root `package.json`, `scripts/test-coverage.sh`: serial shared-host
  execution, with unchanged tests, isolation, deadlines and coverage floors.
- `compose.yaml`: owned web readiness checks local `index.html` without following external root.
- `integration/support/accessibility-catalog.ts` and `accessibility-steps.ts`: existing-fixture
  ordered native tests and explicit partition/state coverage, including external entry boundary.
- Native browser, catalogue, fixture and step regression tests and
  `integration/web-accessibility.integration.test.ts`: demonstrated executor/entry/privacy
  regressions and state preparation; no hidden retry or skip.
- `_bmad/scripts/render_skill.py` and its regression: lazy active-initiative path resolution;
  `.gitignore`: generated immutable render output stays local.
- Existing plan, epic, implementation handoff, parent verification and finish packet: exact
  evidence, failures/limits and mandatory final review outcomes, without another report layer.

Verification: full lint (32013), complete strict types (44099), 2,697 unit tests and production
builds (84015) pass. All eight unchanged coverage floors pass (32481). Directed executor/catalogue
regressions (91938), latest ESLint (25084), strict integration types (27166), scoped formatting,
Markdown lint and diff checks pass. Renderer regression/config utilities pass (64720). Final
native campaign exits 0 (182 selected tests); the one-time proof closes 72/72 equivalents with
zero reconciliation errors. Existing valid results are reused by identity/dependency, with no
repeated product gate for documentation. Required commit hooks remain part of delivery.

Review: Quick zero findings; finish reviewer `disposition: ship`; documenter No changes.
Patches by verdict: high 0, medium 0, low 0. Deferred/rejected findings: none.
Follow-up review recommended: false; no unverified changed risk was established.

Residual limits: no assistive-technology pronunciation or physical touch/daylight certification;
external Landing and all unauthorized production/publication obligations remain outstanding in
their owner scope. Historical inconclusive paint and failed executions remain preserved, without
acceptance claims or indefinite follow-up. Sixteen original host containers remain temporarily
stopped under owner authorization while development continues; Landing, Caddy and Dev Container
are preserved, with the existing restoration order recorded in the parent verification.

Delivery: reviewed implementation, tests and records are committed as `a3b9508`, `731378e`,
`58d3ef0`, `f3f1864` and `0bdd735`. All applicable pre-commit and commit-message hooks pass;
formatting leaves campaign product/executor bytes unchanged. The working copy is clean at
that delivery checkpoint. Story 6.12 is marked done on this evidence; the D-080 external
Landing obligation remains outstanding in its owner scope. The next ticket is selected with
the repository-pinned `_bmad/method/scripts/tickets.py next`, without a ticket-layout migration.
