---
title: 'Landing page ready to ship'
type: 'bugfix'
ticket: '11'
created: '2026-10-26'
status: 'built'
baseline_revision: '3c70d8712e39cd0d6c232d2a5d32cd4991649215'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The already published portfolio presentation links Privacy at the domain root,
losing the application's required prefix. CAP-20 also requires recorded real-browser review
of its existing city scene, demo destination, self-hosted fonts and repository visibility.

**Approach:** Reuse the existing operational URL resolver for Privacy, prove its prefixed
link regression, and add a narrowly scoped production presentation mode to the existing
browser executor. Preserve the external presentation migration and private repository;
no new application landing, redesign, general audit or unrelated project test campaign.

## Boundaries & Constraints

**Always:** Keep the landing available, synthetic-only application, public HTTPS and existing
application prefix. One browser/build at a time on the shared 8 GB / 2 vCPU VPS. Preserve
existing timeouts, assertions, hooks, CSP, browser sandbox and unrelated project paths.
All edits belong to their independent repositories. Never read/search/edit `.env*`.

**Never:** Change repository access to public, rebuild the unchanged application, weaken
checks, publish from main, use PR/CI/merge, enable sources or call models for this story.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                          | Expected Output / Behavior                                                     | Error Handling          |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------ | ----------------------- |
| Privacy         | Configured prefixed application root   | Footer reaches prefixed public notice in both locales                          | Missing root omits link |
| Demo            | Published presentation                 | Demo opens prefixed operational Places; cards retain presentations             | No root redirect loop   |
| City            | Real sandboxed browser, desktop/mobile | Rendered WebGL scene with readable lighting, working stop navigation and pause | No uncaught errors      |
| Motion/fallback | Reduced motion or unavailable WebGL    | Readable content and working destinations; no false rendered-scene claim       | Record actual fallback  |

</intent-contract>

## Code Map

- Independent landing: `/workspace/repos/portifolio-landing-page`, baseline
  `5c1cc9e17eed8848857e25adb001f851ea84dbbf`, initially clean. Read its AGENTS.md
  and relevant local Next docs before code edits. Product source stays unchanged.
- Landing `src/app/[lang]/projects/[slug]/page.tsx:220` currently uses
  `new URL('/privacy', raw.live)`. Existing `src/content/project-links.ts:appRoute`
  preserves the configured prefix and is already used for other operational links.
  Extend adjacent `src/content/presentations.test.ts` regression tests.
- `scripts/presentations.browser.mjs` owns the bilingual presentation executor. Add
  an opt-in Real Estate-only mode with unique evidence output, leaving its existing
  default suite intact. Reuse Playwright and native assertions; do not introduce a
  parallel test framework. Existing `scene.performance.mjs` measures the portfolio
  space scene, not this city: reuse relevant PerformanceObserver concepts only.
- `src/components/presentations/real-estate/{LandingPage.tsx,CityScene.ts}` expose
  `.lp-*` controls/canvas, `.lp--flat` and `data-motion` state. Review actual DOM
  before selectors. Scene is procedural Three.js; existing pause/reduced controls
  and no-WebGL flat fallback are implementation, not modification targets.
- `src/content/real-estate.ts`, `src/content/presentations.ts`: existing synthetic
  illustration/current boundary wording. Do not make optional copy/style changes.
- Parent owns manual host landing build/release, public execution and existing product
  deployment guide/epic updates. Existing protected build/release scripts in `/tmp`
  are reusable. Private source remains hidden (no public source link).

## Tasks & Acceptance

**Execution:**

- [x] Landing page + adjacent resolver test: correct only demonstrated prefix loss;
      verify configured root with/without slash and null absence using existing helper.
- [x] Existing presentation executor: opt-in focused production path for PT/EN at
      1440/390, screenshots, real nonempty WebGL pixels, pause/resume and stop navigation,
      reduced motion and unavailable-WebGL readability, demo/privacy destination checks,
      no overflow/page errors, self-hosted font requests and bounded performance readings.
      Record lighting/motion/performance limits. No timed benchmark repetition quota.
- [x] Parent: run affected tests then landing lint/typecheck/tests, independent Quick,
      commit, serial host build/release with previous-version recovery receipt, and
      run the focused public browser mode with sandbox helper; inspect final captures.
      Update existing guide/epic/this plan concisely and close ticket on evidence.

**Acceptance Criteria:**

- Given the published EN/PT presentations, when opening Demo and footer Privacy, then
  they reach `/real-estate-intelligence/places` and `/real-estate-intelligence/privacy`
  over real HTTPS; portfolio cards still link presentations and private source is hidden.
- Given desktop/mobile real Chromium, when inspecting the city and controls, then real
  lighting, motion/pause, stop navigation, performance and fallback observations are
  recorded with screenshots and measured limits, with readable copy and self-hosted fonts.

## Implementation Notes

- Full route: estimated 120–180 executor/regression lines, above the 100-line cutoff.
  Parent already performed the once-per-session Impeccable context; do not rerun.
  Implementer edits landing code/tests/executor and this section only, runs focused
  light checks sequentially and reports. No commits, deploy, subagents or heavy build.
  Parent handles publication, final evidence, mandatory independent review and commits.
  The application remains on `feat/phase-1`; the independently versioned landing already
  uses `main` as its current local branch. No checkout, PR, merge, push or CI is performed.
- Parent landing lint, strict typecheck and all 16 tests pass; scene assets retain hash
  `07ccf19314bed6a579db`. Reuse these results after executor-only corrections; rerun only
  its syntax/lint and the required public journey, then the final serial production build.

- Implementation prepared in the independent landing repository: Privacy now uses
  `appRoute(raw.live, 'privacy')`; the adjacent regression covers prefixed roots with
  and without a slash, query/hash removal and null absence.
- `PRESENTATIONS_REAL_ESTATE_ONLY=1` selects the focused HTTPS executor and explicitly
  enables the Chromium sandbox. It preserves the default suite, existing 30-second
  navigation/action timeouts and launch flags. Unique timestamped captures/JSON cover
  EN/PT at 1440/390, actual WebGL pixel readback/draw counts, pause/resume, all stops,
  reduced motion, unavailable WebGL, self-hosted fonts, destinations and hidden source.
  Observations disclose SwiftShader/shared-host and pixel-readback limits. Actual DOM
  uses `.lp--flat` and `data-motion`; no scene/product hooks were added.
- Implementer checks: focused content tests 4/4, changed-file ESLint, script syntax and
  diff whitespace pass. No build or browser executed here. Parent retains full gates,
  independent Quick review, commit/release/recovery receipt and capture inspection.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Quick review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Demo exact-URL assertion races the documented React index
    redirect to canonical Bela Vista. Surrounding application routes prove the redirect;
    await the established final route and visible operational screen, preserving prefix.
  - `[medium]` `[patch]` Focus/current-stop readiness does not prove final scroll/camera
    geometry. Existing smooth scrolling and eased camera can produce transitional captures;
    use the existing pause after proving resume, then await final destination geometry.
- Same implementer engaged for these executor-only corrections. Follow-up is targeted
  to canonical destination readiness and settled captures, not another broad review.

### 2026-10-26 — Targeted follow-up

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- The same independent reviewer inspected only the canonical-route/semantic readiness
  and settled scroll/paused-scene corrections. No findings remain; no broad review reset.
- Changed executor ESLint, syntax, Prettier and diff checks pass. Unchanged source tests,
  repository lint/typecheck/test results are reused. Static detector exits zero.
- Landing commits: `4ef7f84` corrects Privacy; `69be18f` adds its regression and focused
  executor. Canonical delivered-source revision is
  `69be18fb639755b28e1ade6a21d7201f631da98c`; working copy is clean. No AI calls or
  application source/image change. Host serial build and selected-service release pass;
  public visual acceptance remains pending below.

### 2026-10-26 — Manual release and directed browser diagnosis

- Landing image `sha256:92c79f18bc08626505b4eebc71cbfefa541340e05b45cd82f7867b85842ad551`
  carries source `69be18fb639755b28e1ade6a21d7201f631da98c`; the serial host build passes.
  Selected landing activation at 21:45:04Z is healthy. Caddy and application images are
  unchanged. Recovery receipt: `/var/backups/portfolio/rei-landing-ship-20261026T213952Z/`.
- Preserve failed browser attempt `real-estate-2026-10-26T21-45-18.529Z`: its sandboxed
  headless browser could not initialize WebGL. Full Chromium reproduced the missing capability;
  Debian Chromium additionally lacks its packaged sandbox helper. These are executor/environment
  limitations, not evidence of a scene defect. The actual flat fallback remained readable.
- Directed GPU logs then identified `DisplayVkXcb ... xcb_connect() failed`. Existing Xvfb
  supplied the missing display connection: an isolated capability probe created WebGL2 with
  the same sandbox setting and SwiftShader flags. No sandbox-disable flag, product patch,
  retry, timeout increase or rebuild. GPU diagnostic files remain in `/tmp/rei-gpu-*`;
  focused attempt `real-estate-2026-10-26T21-49-43.752Z` runs under `xvfb-run -a`.

### 2026-10-26 — Settled-scroll oracle correction

- Preserve the Xvfb attempt's failure at its unchanged 30-second stop-position wait.
  Actual WebGL pixels, motion, pause and resume passed before that failure. Directed
  reduced-motion/no-WebGL inspection established `zone.top=88px`, margin `64px`, root
  scroll padding `24px`, correct focus/current stop and visible heading. The executor
  omitted that existing root padding; no product defect was demonstrated.
- The same implementer corrected only the expected alignment; the same independent Quick
  reviewer found no remaining issue in this targeted diff. Changed-file lint/syntax/format
  checks pass. All 16 stop alignments across EN/PT and 1440/390 pass in the focused geometry
  check. Source and deadlines are unchanged. Landing executor commit
  `29e76ddc1ed64cdf2987c84c482a83a9dab548ff` does not change delivered image bytes.
- Run the complete focused presentation campaign on this stabilized executor under Xvfb;
  retain both prior attempts. Do not repeat the unchanged application or landing builds.

## Verification

- Landing focused `node --test src/content/presentations.test.ts`, then repository
  `pnpm lint`, `pnpm typecheck`, `pnpm test`; preserve all existing tests/assertions.
- Parent serial production image build, protected selected-service publication and
  focused executor against `https://leohteixeira.com`, using existing root-owned
  Chromium sandbox helper. Review actual screenshots and performance results,
  distinguishing SwiftShader/shared VPS measurements from physical-device performance.
- Reuse unchanged application 6.13 gates and public read/Ask/Tempo evidence; no provider call.

### 2026-10-26 — Sampling model reassessment

- Preserve attempt `real-estate-2026-10-26T21-52-37.092Z`: 60 real colors and five
  draws were observed, but synchronous readback consumed 3,510.8 ms and the short
  observation timer ended with one frame. Earlier readback delays reached 18 seconds;
  those intervals include measurement stalls and do not establish ordinary frame speed.
- Before another correction, reassessed that model with the same implementer. Separate
  the existing one-second/three-second performance observation from exactly two genuine
  rendered-frame pixel samples. The latter use the existing native 30-second deadline,
  once, preserving every multicolor/draw/motion/pause/resume assertion. No retry, larger
  deadline, product edit or launch change. The independent targeted reviewer found none;
  syntax/lint/format checks pass. The affected initial/pause/resume probe passes at
  `real-estate-sampling-2026-10-26T21-55-19.777Z`: two changing initial frames, one paused
  hash, two changing resumed frames. Pixel pairs took 3.55/12.82/13.36 seconds; separate
  performance observations are retained, including a 7.87-second scheduled-stop delay.
  These are software/shared-host observations, not a hardware frame-rate guarantee.
- Stabilized executor `caf1c86f72db6a11fffe1a0500c805e239376461` runs the complete
  focused presentation matrix in `real-estate-2026-10-26T21-56-51.346Z`. Product images
  and all existing timeouts/assertions remain unchanged.

### 2026-10-26 — Interrupted final invocation and scoped continuation

- Session 55379 ended with SIGTERM (exit 143), without an assertion failure or final
  completion. Its checkpoint retains six completed EN cases (1440/390 × motion,
  reduced and no-WebGL); PT motion captures are partial and are not accepted.
  Signal origin remains unestablished. Preserve `interruption.json` alongside the
  original report and captures. No product defect is inferred from that interruption.
- Reuse the six valid cases on the unchanged delivered image. A minimal strict
  `PRESENTATIONS_REAL_ESTATE_LOCALE=en|pt` option selects the remaining locale;
  unset retains the full matrix. It records scope in the existing report, rejects
  invalid input before launch and changes no assertion, deadline or sampling logic.
  Run PT once and reconcile both immutable result sets, without another build.

- Targeted independent follow-up: no findings. Selector-only commit `9c047ca` passes
  syntax, changed-file lint/format and invalid-input validation. PT continuation is
  `real-estate-2026-10-26T22-05-52.894Z`; no rebuilt image or changed product byte.

## Auto Run Result

Privacy now uses the existing prefixed route resolver. The independent landing changes
`src/app/[lang]/projects/[slug]/page.tsx` (footer destination),
`src/content/presentations.test.ts` (four resolver regressions) and
`scripts/presentations.browser.mjs` (focused public evidence and resumable locale scope).
This plan, the existing epic and deployment guide record acceptance and recovery.

- Review: two medium executor findings patched; targeted follow-ups report zero.
  No deferred or rejected findings. Follow-up recommendation is false: the canonical
  destination and settled geometry are proved; no remaining unverified changed risk.
- Verification: focused 4/4, repository lint/typecheck and all 16 tests pass; changed
  executor syntax/lint/format and invalid-locale validation pass. Serial host build
  and landing-only publication pass. Unchanged application gates are reused.
- Public matrix closes 12 distinct cases: EN/PT × 1440/390 × motion/reduced/no-WebGL.
  EN's six completed checkpoints in `real-estate-2026-10-26T21-56-51.346Z` are reused;
  that invocation was interrupted (SIGTERM/143), not declared wholly passed. PT's
  continuation `real-estate-2026-10-26T22-05-52.894Z` completes all six and exits 0
  at 22:12:51Z. Same delivered image/source, unchanged assertions and deadlines.
- All completed cases retain font HTTP 200, no page errors/overflow, stop captures and
  fallback evidence; motion cases prove changing real pixels, pause and resume. Actual
  Demo reaches canonical prefixed Places and Privacy returns 200. Private source stays
  hidden. Parent inspected EN/PT desktop/mobile city, plan and flat-fallback captures:
  copy, controls, selected marker and lighting are readable; reduced/fallback content
  remains usable. No scene or optional style change is necessary.
- Limits: software SwiftShader on the shared VPS is not physical-device performance.
  Pixel readback stalls and scheduled-stop delays remain in raw evidence; no ordinary
  FPS guarantee is inferred. Unknown signal origin remains bounded to the interrupted
  invocation. Earlier failed attempts are preserved, not converted into passes.

Acceptance is satisfied on the delivered landing source `69be18fb639755b28e1ade6a21d7201f631da98c`
and image `sha256:92c79f18bc08626505b4eebc71cbfefa541340e05b45cd82f7867b85842ad551`.
Later executor-only commits through `9c047ca` require no image rebuild. No PR, merge,
remote CI, provider call or application image change was needed.
