# Accessibility implementation handoff

Implementation-only handoff for ticket 6.12. The plan remains in progress. No acceptance,
commit, push, deployment, external source enablement, model call or public write is claimed.
The parent owns BMAD step-03 Verify, finite visual/review rounds and the final integral run.
Historical campaign attempts are immutable diagnostic evidence, not current-build acceptance.

## Product changes

- `AppShell.tsx`, shell resources and regression tests: a 44px skip link to the focusable public
  content; route changes focus content, Filters entry focuses its heading, and Filters exit
  restores its public entry. Initial rendering, locale/refetch and document anchors do not steal
  focus. Filters remains a route section, without a modal trap.
- `SearchFilters.tsx`, `SearchResults.tsx` and Search tests: explicit heading/error associations,
  minimum targets and a stable Filters return identity; keyboard journeys observe actual
  apply/cancel/clear/history, chip removal and the next native Tab, without forced focus.
- `components.css`, `place.css`, `search.css`: measured 44px target repairs and inset indicators
  for language, Ask Continue and selected/unselected segmented controls. Brazil's breadcrumb
  was 32.06px wide by 44px high, so the repair is minimum width. A shared primary button keeps
  only its border-color transition: real Ask follow-example and busy Filters Apply frames
  reproduced unreadable interpolated background with already-white text. Foreground/background
  now swap atomically, preserving existing colors and hover treatment.
- `place.css`: provenance tags preserve their 20px minimum but can wrap within narrow evidence
  columns. The former nowrap synthetic badge extended 8.406px beyond Place320's viewport in the
  neighbour grid. A real-CSS PT/EN neighbour/monthly-column regression proves containment without
  cutting copy, hiding overflow or reducing text/target sizes.
- Landing/CityScene, localized copy and regression: native pause/resume, initial and changed
  reduced preference with disposed listeners; controls separated from the canvas stage in their
  existing reading/tab order. Their sticky layer reserves the stage's full visual footprint;
  the stage's negative top margin compensates flow without shrinking the sticky margin box.
  Only focus-within raises controls above copy, with the existing opaque enamel surface. The
  otherwise empty wrapper does not intercept pointers; its actual navigation/button children
  remain interactive. This preserves canvas interaction, not a hit-test workaround. The canvas,
  city hierarchy, copy and stage remain below content. Declarative scroll margins respect the
  header, and keyboard focus disables smooth tour scrolling so its target arrives with focus.
  No executor focus/scroll repair is used. Native boundary regression covers normal/reduced
  preference at 390/960/1440 and the 720x400 CSS geometry; the campaign proves actual 200% zoom.
  On mobile with a running scene, Pause and the five-stop navigation have separate rows so the
  button cannot obscure the last two targets. Reduced scenes keep the incumbent navigation row.
- `.dockerignore`: excludes only `apps/web/.impeccable` from build context. No evidence is deleted;
  application source/tests stay in context. The file is part of the exact source/config identity.

## Executor and regressions

The new campaign is `integration/web-accessibility.integration.test.ts`. Its browser, evidence,
catalog and transport helpers are `integration/support/accessibility-{browser,evidence,catalog,fault}.ts`.
Their tests cover native keyboard visibility/closed nested disclosures and stable identity,
programmatic-only exclusion and clipped controls, actual enclosing focus paint,
selected/unselected real consumers,
natural-frame primary-button contrast, direct text and differently styled descendants, real SVG
fill versus CSS color, explicit ambiguous SVG stroke triage and private-value non-disclosure.

Every audit retains full unexcluded axe results, forward/reverse Tab receipts, active focus images,
geometry/fonts/text roles, numeric or explicitly manual contrast, top/region/final images, and
exact independent API oracles. Captures settle only after the keyboard receipt; traversal itself
never repairs focus or scroll. Browser chrome transitions remain separate and do not count a
control as reached. No fake browser clock is used for paint or retained cache age.
The shared `property-capture.ts` observes native scroll rest within a 2000ms bound, then resets
instantly for the separate named top capture. It does not alter CSS smooth behavior or normalize
scroll during traversal; real-CSS regression preserves both normal/reduced scroll CSS.

Faults preserve actual admitted bytes and inject only hold, HTTP503, truncation or interrupted
recorded SSE. Valid recovery continues the genuine API request. Distinct subread recovery actions
occur once per native region/alert identity with actual response/dispatch receipts. Canonical
synthetic Property/Listing variants are read as provided; no extra SQL seed/license mutation is used.
Search retention uses supported next-cursor pagination, not a historical visit with gcTime=0.

Transport lifecycle tests use real Chromium cancellation and an open-disclosure primary failure.
The browser-native fetch+AbortController is the transport under test, not a Node HTTP oracle;
independent business oracles still use Supertest. Additional explicitly typed minimal transport
ports test drain bounds and handler errors, with no partial Playwright client casts. Browser
requestfailed is not the terminal action on an intercepted Route: the first explicit route.abort
resolves it. Product-cancelled `aborted`, teardown-only `cleanup-aborted` and successful `valid`
remain distinct. A 5000ms drain bound propagates errors, preserves unfinished dispatches, writes
lifecycle receipts even on failure and returns control to outer browser/SQL/fixture cleanup.

## Verified implementation results

The companion [JSON packet](accessibility-implementation-handoff.json) contains the full run IDs,
all three hashes per run, exact immutable ledger SHA, timestamps, structural audits, per-threshold
numeric contrast counts/minima, every manual selector and every axe incomplete node. These are
measured implementation diagnostics, not final story acceptance.

Final directed-pilot candidate identity, verified again after the run:

```text
source   6ec86e4b216996a29009ae496d9ffcdd87cbf5193e93063790861b94a3311c17
backend  10215ae490646588bd6a35340aa7c512304f9bbc475a486687e1460fed6a350b
executor 16fa4175e8fc1950a707bf2b005772542c85b5ce7f03504d32b1c7ca91dc2624
```

All 1,251 source/backend/executor file hashes and all 395 final-run `surfaces.json` entries
matched their actual bytes. Final exact-project container, volume and network inventories were
empty. SQL-final was unchanged, outside/forbidden requests empty, diagnostic leak false;
owned removal and foreign preservation were true/true at 16:34:14.435 UTC.
The parent subsequently added `accessibility-references.test.ts` for fresh authored artboards.
That new executor input is not covered by this historical pilot identity; the parent's final
Verify will freeze and record its own complete identity before the integral run.

The last pre-pilot commands all exited 0:

```sh
pnpm exec prettier --write apps/web/src/landing/landing.css integration/support/property-capture.ts integration/support/accessibility-browser.test.ts
pnpm exec eslint integration/support/property-capture.ts integration/support/accessibility-browser.test.ts
pnpm exec tsc --noEmit --project tsconfig.integration.json
pnpm --filter @rei/web typecheck
pnpm exec vitest run --config vitest.integration.config.ts integration/support/accessibility-browser.test.ts integration/support/accessibility-evidence.test.ts integration/support/accessibility-fault.test.ts
pnpm --filter @rei/web exec vitest run --dir src src/landing/LandingPage.test.tsx src/shell/AppShell.test.tsx src/search/SearchResults.test.tsx
pnpm exec vitest run --config vitest.integration.config.ts integration/support/property-capture.test.ts
```

Results were 11/11 accessibility helpers in 18.13s, 50/50 selected web regressions in 7.14s,
and 3/3 shared Property capture regressions in 0.204s. Earlier changed source/test inputs were
also formatted and selected-linted before freezing; the exact root gates remain pending below.

The last directed command was:

```sh
pnpm exec vitest run --config vitest.integration.config.ts integration/web-accessibility.integration.test.ts -t 'partition: adaptation-pt-BR$' --bail 1
```

It exited 0: 223.79s test / 224.92s invocation, one selected partition, 37 not selected by `-t`.
The final run is `accessibility-adaptation-pt-BR-2026-10-22T16-30-30-730Z-b4e456af`: one
inconclusive setup plus 34 approved variants, with no failed attempt or executor error. All eight
families at 320 and native 200%, all seven Ask states at both sizes, normal/pause/resume/changed
reduced/no-WebGL and SQL/network/cleanup boundaries completed. The previous Pause-overlap and
post-receipt capture failures remain unchanged in their own historical run.

These eight directed partitions have a green diagnostic run. Durations below are observed UTC
fixture start-to-teardown, not reconstructed Vitest timings. **Only the last uses the final
identity above**; seven older hashes must not be represented as current-build acceptance.

| Directed partition | Run suffix | Approved variants | Setup pilots | Fixture seconds |
| ------------------ | ---------- | ----------------: | -----------: | --------------: |
| keyboard           | e733108e   |                 7 |            1 |          37.266 |
| ask-pt-BR          | 1e14527d   |                55 |            1 |         230.148 |
| recovery-pt-BR-390 | f28f23c2   |                40 |            1 |         196.953 |
| retained-pt-BR-390 | ae3a9bcd   |                37 |            1 |         325.232 |
| variants-pt-BR-390 | 2717d3db   |                31 |            1 |         110.075 |
| subreads-pt-BR-390 | 2f57edff   |                30 |            1 |         239.518 |
| context-pt-BR-390  | 32ea8733   |                31 |            1 |         134.097 |
| adaptation-pt-BR   | b4e456af   |                34 |            1 |         223.657 |

There are 265 approved variant observations and eight inconclusive setup pilots, **not 265 BDD
scenarios**. All eight ledger audits returned `errors=[]`, `countsTrusted=true`; their per-run
semantic counts intentionally leave unrelated scenarios unexecuted. The JSON names the other 30
partitions without a green directed run. All 38, including these eight, remain required together
against final bytes; earlier red diagnostics and the historical partial invocation do not fill
that requirement.

Final adaptation's opaque numerical set has 6,068 observations and no ratio below its threshold:

| Painted role             | Observations | Minimum required | Lowest measured |
| ------------------------ | -----------: | ---------------: | --------------: |
| Normal text              |        3,789 |              4.5 |        4.607518 |
| Large text               |          129 |                3 |       10.539366 |
| Essential field boundary |           40 |                3 |        3.170879 |
| Focus indicator          |        2,110 |                3 |        6.113981 |

This numerical set excludes 25 manual Landing text observations: five navigation label selectors
in each of reflow320, native zoom720, normal390, changed-motion390 and no-WebGL390, all PT-BR.
Twenty are conservatively retained 1px clipped labels; five are visibly named active stops.
Sibling canvas/scrim composition is not replaced by the opaque ancestor's color. Their geometry,
scrim and exact selectors are in the JSON, with no numerical approval.

The packet also retains 18 axe incomplete nodes: 14 in final adaptation (Landing overlap/background
and Listing320 pseudo-element cases), plus four historical Listing variants. Exact states,
targets, locales, widths and reasons are listed independently of numerical observations.
These need explicit finish adjudication; zero axe violations does not approve incomplete nodes.

## Required final verification

Do not substitute the directed pilots for this command. Run serially after the diff review:

```sh
pnpm exec vitest run --config vitest.integration.config.ts integration/support/accessibility-browser.test.ts integration/support/accessibility-evidence.test.ts integration/support/accessibility-fault.test.ts integration/support/property-capture.test.ts
pnpm exec vitest run --config vitest.integration.config.ts integration/web-accessibility.integration.test.ts --bail 1
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
pnpm run test:coverage
pnpm exec vitest list --config vitest.integration.config.ts
```

The native `--bail 1` stops after a failed partition and its teardown, not by interrupting a live
fixture. All not-started cells remain unexecuted. Do not overlap root gates/coverage/browser runs,
increase timeouts, add retries/skips or reformat immutable historical campaign directories.

The exact 38 partition names, in execution order, are:

```text
discovery
search
keyboard
details
ask-pt-BR
ask-en
recovery-pt-BR-390
recovery-pt-BR-960
recovery-pt-BR-1440
recovery-en-390
recovery-en-960
recovery-en-1440
retained-pt-BR-390
retained-pt-BR-960
retained-pt-BR-1440
retained-en-390
retained-en-960
retained-en-1440
variants-pt-BR-390
variants-pt-BR-960
variants-pt-BR-1440
variants-en-390
variants-en-960
variants-en-1440
subreads-pt-BR-390
subreads-pt-BR-960
subreads-pt-BR-1440
subreads-en-390
subreads-en-960
subreads-en-1440
context-pt-BR-390
context-pt-BR-960
context-pt-BR-1440
context-en-390
context-en-960
context-en-1440
adaptation-pt-BR
adaptation-en
```

These are execution containers for six semantic scenarios, not 38 independent BDD stories.
The catalog's `stateMapping` is the exact state-to-partition mapping. Normal/open layouts span
PT/EN and 390/960/1440. Adaptation spans all eight families at 320 CSS px and real native 200%
browser zoom, applicable nested evidence/seven Ask states, pause/reduced/no-WebGL.

## Preserved failures and limits

`accessibility-diagnostic-adjudications.json` and `accessibility-diagnostic-followup.json` retain
append-only causal adjudications. Original failed ledgers, screenshots and manifests are not
rewritten. Earlier executor readiness/cardinality/inventory/clock mistakes are distinguished
from reproduced product defects. The historical 15-partition invocation exited 1 with 2 passed,
13 failed and one asynchronous lifecycle error; it is not acceptance.

The 15:45 context timeout has no SQL-final or original teardown callback proof. Exact-project
resources disappeared through the reaper before manual intervention, but that later inventory
does not establish the missing original SQL/foreign baseline comparison. It remains incomplete.
The 16:03 context bounded-drain failure is a different run: SQL-final proved unchanged and
teardown proved owned removal/foreign preservation; its failure remains failed. Subsequent narrow
Chromium regression reproduced requestfailed-without-terminal-Route as its cause.

Opaque roles are gated numerically (normal text 4.5, large text 3, essential boundary/focus 3).
Alpha/canvas/gradient/shadow/composition roles and axe incomplete results are not numerically
approved. Their exact selectors/state/locale/width and evidence references belong in the companion
JSON packet for finite human review. Screen-reader pronunciation and physical touch/daylight
remain human-assessment limits. Untracked Market freshness, public Ask unavailable commands/quota,
and source-register-prohibited source examples are mapped explicitly to existing component
evidence or unavailable capabilities, never described as exercised production branches.

The pre-existing change to `epic-web.md` belongs to the parent/user and was not edited here.

The campaign captures rendered product UI, not newly rendered authored artboards. Prior pointers
include `review/reference-{Main,DesktopPlace,PlaceEN,Search,States,Components}.{png,json}`,
`reference-{Ask,DesktopAsk}.png`, `property-reference-*`, `listing-reference-*` and the existing
Search authored-reference packet. Their metadata/source SHA must be checked against current
authored files before reuse. No new render-authored LandingDesktop/LandingMobile reference is
claimed; the parent resolves that reference gap before integral Verify without changing product
bytes. This does not replace the plan's finite visual comparison.
