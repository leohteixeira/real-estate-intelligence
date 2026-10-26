---
title: 'Persisted parent median, plate counts and neighbours'
type: 'feature'
ticket: '6'
created: '2026-10-26'
status: done
baseline_revision: '76f59441a73fa12dc1d87012c10a71f20f37c434'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/AGENTS.md
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0021-event-fed-market-median.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0022-causal-property-price-facts.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
  - /workspace/repos/real-estate-intelligence/docs/design/README.md
  - /workspace/repos/real-estate-intelligence/docs/design/screens.md
  - /workspace/repos/real-estate-intelligence/docs/design/content-and-locale.md
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 4.6/CAP-9 must serve the actual parent median, plate counts and registered
neighbours with their figures. Parent median already uses retained facts; counts and neighbour
figures still use prepared examples, so the plate/table can contradict the collected population.

**Approach:** Reuse the existing coherent Market snapshot, D-096 calculations and Locations facade.
Compute live counts from the same active represented-property population as duration/ratio/reductions;
serve each registered neighbour's median and movement from retained facts. Preserve prepared test
composition and legacy wire variants explicitly. Update the existing UI's origin disclosures only.

## Boundaries & Constraints

**Always:** Keep global lowest-active-asking selection before scope and area, listing-ID ties,
current causal membership, safe arithmetic, matched-cohort movement and actual contributor proof.
Counts include distinct represented in-scope active properties, all their currently active member
listings and distinct source IDs among those listings; no area requirement for counts. These are
the populations already fixed by D-096, so null-area properties remain counted even when excluded
from the price sample. Reuse calculated record counts/source evidence where they exactly match.
The actual parent's registered descendant scope controls its independent median. Neighbours come
only from `getPlace(id).place.adjacentPlaceIds` and each registered descendant scope, never siblings.
Known empty neighbours stay in the table with insufficient figures; non-neighbourhood places have
their registered empty adjacency. One snapshot and evaluation instant per response, including all
neighbour rows, prevent mixed projection generations. No GET writes or cross-context SQL.

Keep both original overview variants and 4.4's `event-fed-figures-with-prepared-counts` meaning
strictly unchanged for prepared/legacy clients. Add closed `event-fed-place-figures` overview and
neighbours variants for the fully persisted surface; no prepared section/time fields on them.
Overview counts must agree with live contributor populations and source count, without falsely
requiring all properties to have price-eligible area. Neighbour evidence is live/untracked at the
response evaluation time. Monthly series alone remains prepared in its separate endpoint. Preserve
canonical 400/404/sanitized 500 behavior; corrupt persisted facts never fall back to prepared data.

**Never:** Change events, projection writes, migrations, replay fences, source/model usage, monthly
series policy, collection-completion freshness or suppression. No new adapter, persistent state,
reporting layer, general audit or visual redesign. Never read/search/edit `.env*`. Preserve hooks,
assertions and coverage thresholds; no skip, retry or timeout increases. The implementation agent
must not commit, push, deploy, create branches or render workflows. Use only owned synthetic
fixture resources; production/landing remain untouched. One heavy workload at a time on 8GB/2vCPU.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                                                                                | Expected Output / Behavior                                                                                               | Error Handling                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Complete fixture      | Retained facts in neighborhood, actual parent and registered neighbours                                      | HTTP plate counts and parent/table figures match hand calculations and registered identities                             | No error                                               |
| Selection/populations | Duplicate members, null area, cheaper outside-scope representative, removed/reappeared or reassigned members | Count represented properties once, all their active listings and distinct sources; price/ratio populations remain honest | Fail closed on invalid retained data                   |
| Adjacency/empty       | Sibling not registered adjacent; empty adjacent place; country/non-neighborhood                              | Only actual adjacency in registered order, empty rows retained, empty non-neighborhood table and country parent null     | Unknown 404, malformed 400                             |
| Coherence/replay      | Projection revisions/reassignment and replay; detached returned DTOs                                         | One snapshot/clock per response, current causal output, unchanged replay and no GET writes                               | Dependency failure sanitized 500, no prepared fallback |
| Strict compatibility  | Three existing overview variants plus new live responses and malformed counts/evidence                       | Existing meanings retained; mismatched live populations and duplicate/self/wrong-kind neighbour rows rejected            | Public parser rejects invalid wire                     |
| Visible integration   | Actual web stack in pt-BR/en at 390/960/1440px                                                               | Counts and neighbour figures equal HTTP, truthful origin/evidence labels; navigation and design layout remain valid      | Existing independent loading/error/recovery preserved  |

</intent-contract>

## Code Map

- `packages/application/src/market/market-query.service.ts` — `scope` obtains actual Locations
  identity/descendants and prepared sample. Live overview already reads `readFigures` once and
  computes parent median. `neighbours` currently returns prepared figures; change only the live
  branch, retaining fixture-only composition. Reuse existing facts/clock/error translation.
- `packages/domain/src/market/{remaining-place-figures.ts,asking-price-median.ts}` — existing
  D-096 calculations. Ratio record count counts represented properties; reductions record count
  counts active member listings; ratio sources cover those active members. Counts can reuse these
  exact populations rather than adding a second selection model. No new read/persistence needed.
- `packages/{domain,contracts}/src/market/market.read.types.ts` and contracts `market.read.dto.ts`
  — mirrored closed overview variants and prepared-only neighbour interface/parser. Add the
  selected variant without changing old guarantees; extend live coherence checks narrowly.
- `packages/application/src/locations/locations.facade.ts` — established `getPlace` adjacency and
  `registeredScopeIds`. Use the public facade only; no new Locations capability is necessary.
- `apps/web/src/places/{PlaceOverview.tsx,PlaceNeighbours.tsx,place-client.ts,OverviewFigure.tsx,resources.ts}`
  — current counts render only with prepared time, neighbour origin is always prepared, and
  secondary live labels recognize 4.4's basis. Recognize the new basis and preserve all variants'
  truthful labels; monthly series remains identified as prepared. No CSS/layout changes expected.
- `integration/market-figures.integration.test.ts` — existing owned real PostgreSQL/RabbitMQ/S3,
  worker and HTTP golden journey includes merge, cheaper out-of-scope member, null-area property,
  removal/reappearance, replay/read-only/error assertions. Extend it for counts, parent and actual
  neighbour endpoint goldens rather than introducing another campaign framework or inventory.
- `integration/{market-contracts,market-median,market-price-facts,web-place}.integration.test.ts`
  and `integration/support/overview-{reads,disclosures}.ts` — existing strict regressions and actual
  browser journey. Update intentionally superseded basis/label oracles while preserving assertions,
  fixture freshness tests, accessibility checks and error recovery. Search only necessary callers.
- Existing API controller, application, contract and web tests cover these seams. The prepared
  adapter is `packages/infrastructure/src/market/synthetic-market.adapter.ts`; preserve it.
- `docs/api/market.md`, `docs/testing/integration.md`, existing ADR 0021 and epic Notes — amend
  actual delivered distinction concisely, no new parallel report. Documentation uses its skill.

## Tasks & Acceptance

**Execution:**

- [x] `packages/application/src/market/market-query.service{,.test}.ts` — integrate coherent live
      counts/parent/neighbours, actual facade scopes, detached results and fail-closed errors.
- [x] `packages/{domain,contracts}/src/market/market.read.types.ts`, contracts parser/tests — add
      strict compatible variants, coherent live populations/evidence and adversarial cases.
- [x] `apps/web/src/places/` affected components/client/resources/tests — wire live counts/table
      and English/Portuguese origin copy through existing presentation, preserving prepared variants.
- [x] `integration/market-figures.integration.test.ts` and affected Market regressions — verify
      hand-calculated own/parent/neighbour values, population edges, replay, read-only and failures.
- [x] `integration/web-place.integration.test.ts` and affected helpers — verify actual DOM vs HTTP,
      both locales and existing widths; compare captures with the corresponding Place design.
- [x] Existing API guide, integration guide, ADR/epic notes and this plan — document precise
      delivered behavior, measured results, review handoff and honest residual limits.

**Acceptance Criteria:**

- Given fixture events processed by real owned services, when the fixture neighbourhood overview
  and neighbours are read through the actual HTTP endpoints and strict public parsers, then its
  counts, actual zone median and registered neighbours' figures equal independently derived values.
- Given empty/area-ineligible/reassigned/removed facts and replay, when actual queries run, then
  declared populations and adjacency remain correct without SQL writes or prepared fallback.
- Given the real UI in English/Portuguese at existing mobile/desktop widths, when a neighbourhood
  is opened and evidence/navigation exercised, then displayed counts/figures match live HTTP with
  truthful origins and the existing design, while prepared monthly series remains explicit.

## Implementation Notes

Live overview counts reuse the D-096 ratio property count, reduction active-listing count and
ratio distinct-source evidence from one snapshot. Actual parent scope and ordered registered
neighbour scopes use the existing Locations facade. Every neighbour row shares one snapshot and
clock, including known empty rows. The new closed `event-fed-place-figures` overview/neighbours
variants have no prepared section or time fields. All three prior overview meanings and the
fixture-only prepared neighbour branch remain; monthly series retains its separate prepared
contract. Public parsers reject mismatched count/source populations and invalid live neighbour
evidence. UI changes are origin copy and existing count rendering, with no layout changes.

The real HTTP golden proves own median 3000 minor units/m² from three eligible properties,
actual parent median 3000, counts 4 properties / 5 active listings / 2 sources, and the actual
registered Vila Mariana neighbour median 7000 with 100% matched movement. It includes null-area
and cross-scope member population edges, empty rows, replay, detachment, read-only and canonical
400/404/sanitized-500 behavior. Browser fixture events independently retain a Vila Mariana
neighbour median 450000 minor units/m² and 50% movement through the production worker.

The existing `web-place` journey required a bounded reconciliation with already delivered public
shell contracts. The first inspection missed its final retired landing block; two isolated
corrections were therefore insufficient. Before another browser attempt, the complete current
test, its setup/imports, remaining width/locale loops, long-name branches and reductions branch,
and its directly called helpers were checked against current routes, Ask controls, public shell,
owned fixture and `accessibilityEntryContract`. The demonstrated superseded assumptions are:

- Privacy was forbidden navigation, although the delivered shell requires its exact localized
  footer link. Assert one visible Privacy/Privacidade link, its actual `/privacy` href and footer
  location; retain all other unsupported-navigation assertions.
- Incoming Ask drafts used removed `.place-draft` static text. Assert the current named editable
  `#ask-draft` input value, literal escaped content with no image, the explicit unsent/unexecuted
  hint and locale-only storage. The surrounding request guard still forbids Ask submissions and
  every non-GET effect.
- Ask entry used the removed unavailable message, `.place-band` and dedicated median backlink.
  Assert the actual empty editable draft, unsent hint, specific example-does-not-analyze-selected-
  place boundary, inspection padding and absence of submitted records; return through the exact
  Places public navigation link and verify the original live median. No follow-up is submitted.
- Root assumed an owned `.lp` WebGL landing, canvas rendering and landing screenshots. Current
  Nginx returns the exact public HTTP 308 to the independently owned portfolio. Reuse the existing
  accessibility campaign's root contract and non-following HTTP mechanism, retain the actual
  response evidence before assertions, and check the owned `/index.html` document. Preserve root
  evidence in every existing width/locale iteration without navigating to the external target.
  External portfolio appearance, accessibility, privacy, motion and WebGL behavior remain the
  already declared obligation in `accessibilityBoundaries`, outside this owned fixture.

The remaining paths execute exclusively against owned synthetic services: acquisition and the
neighbour/reduction events use the existing production worker; search uses the existing prepared
search campaign; place/children/Market/property reads use the real API. Direct/deep/case/trailing-
slash entries, locale persistence, history, missing/invalid places, long identity wrapping and
ancestor navigation remain local routes. Monthly-series faults and system-state transport faults
are scoped interceptions whose recoveries reach that same API. The long-name branch replaces
only registered identity labels; the final reduction branch uses retained event history. No
remaining branch requires an Ask execution, external asset or portfolio navigation. Existing
local accessibility, screenshots, keyboard, recovery and network-effect assertions remain.

The reconciled browser run completed all six width/locale iterations, then failed at the first
long-name navigation assertion. A temporary native shared-fixture reproduction established a
readiness dependency: 14 actual requests included the exact Centro children interception once
and subsequent Norte/Sul/Leste/Oeste children. The plate already had the injected long name;
navigation was still only its title with no error at the assertion deadline. The endpoint/identity
mismatch hypothesis was refuted. Await the existing first visible catalogue link through native
Playwright readiness before the unchanged exact-name/count, overflow, identity, ancestor and click
assertions. This observes completion of the client's serial hierarchy walk; no timeout/retry
setting, public client behavior or assertion is changed. Verify that exact branch directly before
the final campaign, then remove the temporary diagnostic probe.

The next full run passed those six cases and all three long-name branches, then exposed the final
reduction branch's second dependency. A temporary exact-branch reproduction returned the genuine
history golden with HTTP 200, rendered its historical evidence and still showed property-detail
loading after issuing the actual property UUID request. `PropertyRow` renders only after that
separate parsed query. Await its first visible row natively before preserving the original exact
row count, historical values, whole-page accessibility, focus and Enter navigation assertions.
The complete final branch was checked against both reads and its sole helper caller.

That probe also demonstrated a pre-existing fixture contradiction: `acquireOverviewReduction`
hardcoded January 2027 while the actual Market clock was October 2026, producing an honest
fail-closed overview HTTP 500. Its sole permanent caller is this branch. Use one actual current
acquisition instant, assert it follows the original retained source observation, and verify the
post-acquisition overview is HTTP 200/strict-parser valid with an available median and an
evaluation instant at or after the acquired observation. This corrects synthetic input rather
than weakening future-fact validation. The same targeted branch must pass before another full
campaign; temporary probes are removed and their results retained only in execution logs/notes.

## Plan Change Log

- Browser-oracle reconciliation: update only demonstrated retired public-shell, Ask and root
  expectations to their delivered equivalents. No product behavior, fixture ownership, timeout,
  retry, assertion gate or coverage floor changes. Replace the obsolete local landing rendering
  obligation with the authoritative exact owned redirect receipt; do not claim external coverage.
- Long-name synchronization: establish the owned catalogue's existing visible-link readiness
  before asserting its injected label. Exact intercepted endpoint is correct; the serial client
  hierarchy had not yet published its complete list. Preserve all long-name checks and deadlines.
- Reduction synchronization and clock: observe the existing dependent PropertyRow readiness and
  replace a demonstrated future synthetic acquisition with a checked actual instant. Preserve
  historical goldens, all interaction/accessibility assertions and the fail-closed product policy.

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: Independent context-free quick reviewer reported no findings after reading the full
  25-file diff, acceptance plan and required context. No patches, rejected findings or deferrals.

## Design Notes

Full route: expected change exceeds 100 lines across application, strict public contracts, web
origins and real HTTP/browser verification. Keep the accepted model: no new projection or decision
is needed to count the D-096 population or traverse registered adjacency. Earlier 4.4 evidence
remains valid for unchanged arithmetic, projection and persistence; affected response campaigns
must prove the final new integration. The mandatory NestJS skill's SQL/facade/Vitest divergence
is already settled by repository ADRs; do not reopen ORM/NX/CQRS decisions.

All six current Place top captures were inspected against the existing authored `Main`, `PlaceEN`
and `DesktopPlace` captures in `apps/web/.impeccable/review/accessibility-authored-2026-10-25T05-25-30-208Z-d981c2b6/`.
The 390px plate remains 358px wide; 960/1440px plates remain 560px with a 232px rail. Barlow
Condensed plate typography and the existing color, grid, separators and focus treatment remain.
Live count/origin paragraphs wrap without clipping in either locale, and neighbour values fit
their existing row. Differences from authored static fixture names, populations and broader
future navigation are existing delivered boundaries, not a redesign or fabricated live data.
The six Place accessibility receipts have zero automated violations; manual screen-reader,
ambient-light and comprehension checks remain outside this automated evidence.

## Verification

Execute sequentially, including within pnpm/Compose, on the shared 8GB/2vCPU VPS. No competing
heavy build, coverage, browser or integration campaign. Keep deadlines and retries unchanged.

- First run directly affected application/contracts/web unit tests and necessary domain tests.
- Run `pnpm run build`, then `pnpm run lint`, then `pnpm run typecheck`, all passing. Strict
  integration typecheck is mandatory; build first for exported compiled packages.
- Run `pnpm run test:integration:market-figures`, then affected existing Market contracts/median/
  price-facts campaigns serially; record genuine golden and matrix results on stabilized code.
- Run the existing `test:integration:web-place` script with
  `CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox`; preserve all assertions and capture
  design checks. If the alias differs, use its exact existing registered package command.
- Run all mandatory workspace coverage gates with unchanged floors, serially. Reuse valid
  unchanged workspace measurements where code/dependency identities permit and state their limit;
  run changed workspaces/dependents. Coverage subsumes the unit-suite gate.
- Run `lefthook run pre-commit --all-files`; normal commit hooks remain parent-owned gates.

Load `nestjs-modular-monolith` and matching references before backend changes. Use
`documentation-writer` for technical documentation. Parent owns complete diff/matrix inspection,
independent quick review, auto-commit and ticket closure after successful implementation evidence.

Measured on the implemented runtime before the bounded browser-oracle reconciliation:

- Affected application 12, contract 105, web 42, domain 26 and actual API controller 6 tests passed.
  The controller seam explicitly asserts the new basis, zero live counts, live neighbours and
  absence of prepared metadata.
- Full eight-workspace build, root lint, serial workspace typecheck and strict integration
  typecheck passed. The unchanged Vite bundle-size warning remains. Subsequent browser-only
  oracle changes also passed strict integration typecheck.
- Real campaigns passed serially: Market figures 1 test / 346.88s; Market contracts 1 / 195.43s;
  median 1 / 70.98s; price facts 1 / 79.52s. These remain valid because runtime identity has not
  changed during browser-oracle corrections.
- The first piped browser executor exited 143 before a product assertion. Kernel logs were
  inaccessible; cgroup counters had no attributable pre-run comparison. Direct foreground PTY
  execution with normal `write_stdin` continuation tests the bounded orchestration-cancellation
  hypothesis without changing product/test deadlines. Its subsequent attempts reached real
  assertions; cgroup `oom=2`, `oom_kill=1` remained unchanged. The three demonstrated stale-oracle
  failures were privacy prohibition, removed Ask static draft and removed local landing. They
  are recorded above; no product assertion failure is suppressed or represented as a pass.
- Domain coverage reuse is bounded to the successful 4.4 result at
  `cbcdcee1ba2a3f99fb5d2732677cc07c3c879613`: 35 files / 682 tests; statements 95.29%, branches
  90.85%, functions 100%, lines 96.20%, recorded in `/tmp/rei-market-figures.coverage.log` and the
  completed 4.4 plan. A narrow diff against that revision shows only domain `market.read.types.ts`
  changed; its tests, every other domain file, manifest, lockfile and coverage script are identical.
  Prior/current TypeScript transpilation emits identical JavaScript (SHA256
  `2029fc05f591623ea8a4c90ca1a67b465e6ed95d03b6f0f47c822fc60b358021`). Domain has no runtime
  dependencies. Reuse does not extend to the seven workspaces whose code or contracts/application
  dependencies changed; their current coverage remains required with the unchanged script options.
- Direct native shared-fixture checks proved the two readiness corrections before reintegration:
  long-name branch 1 test / 60.46s and final reduction branch 1 / 65.55s, including both locale
  reduction goldens and the post-acquisition 200/strict-parser/clock assertions. Temporary probes
  were removed. Before/after logs are `/tmp/rei-parent-counts-long-name-probe-{before,after}.log`
  and `/tmp/rei-parent-counts-reduction-probe-{before,after}.log`.
- Final unchanged sandboxed `test:integration:web-place` command passed: 1 test / 352.09s
  (349.28s test). It completed all six PT/EN × 390/960/1440 cases, all three long-name/ancestor
  cases and both genuine reduction/accessibility/focus/Enter cases. Log:
  `/tmp/rei-parent-counts-web-place-final.log`; browser captures, zero-violation accessibility
  receipts and the six exact non-following root/document receipts remain under
  `apps/web/.impeccable/review/`. Earlier failed full-run evidence is retained at
  `/tmp/rei-parent-counts-web-place-reconciled.log` and
  `/tmp/rei-parent-counts-web-place-synchronized.log`. Final cgroup counters remain `oom=2`,
  `oom_kill=1`; no new OOM event or attributed product assertion was suppressed.
- Current coverage passed for all seven changed/dependent workspaces, serially, with the standard
  coverage script's identical V8 options, exclusions and floors (80% statements/functions/lines,
  75% branches). `/tmp/rei-parent-counts-coverage.sh` copies that script and narrows only its
  workspace selector to `--filter '!@rei/domain'`; the proven domain reuse above supplies the
  eighth gate. Fresh measurement totals are 209 files / 2225 tests; supported totals including
  unchanged domain are 244 files / 2907 tests. The command exited 0. Full transcript:
  `/tmp/rei-parent-counts-coverage.log`.

| Workspace      | Files / tests | Statements | Branches | Functions | Lines  | Evidence                      |
| -------------- | ------------- | ---------- | -------- | --------- | ------ | ----------------------------- |
| Domain         | 35 / 682      | 95.29%     | 90.85%   | 100%      | 96.20% | Unchanged runtime reuse above |
| Application    | 27 / 274      | 91.27%     | 90.33%   | 95.76%    | 92.52% | Current serial run            |
| Contracts      | 13 / 254      | 91.40%     | 91.26%   | 93.43%    | 93.17% | Current serial run            |
| AI             | 18 / 212      | 94.18%     | 88.74%   | 91.90%    | 96.30% | Current serial run            |
| Web            | 41 / 547      | 95.97%     | 91.02%   | 96.54%    | 97.19% | Current serial run            |
| Infrastructure | 50 / 493      | 82.38%     | 76.18%   | 88.71%    | 84.21% | Current serial run            |
| API            | 21 / 205      | 94.30%     | 85.52%   | 97.61%    | 95.47% | Current serial run            |
| Worker         | 39 / 240      | 93.45%     | 83.30%   | 90.37%    | 94.81% | Current serial run            |

Mandatory `pnpm exec lefthook run pre-commit --all-files` passed in 43.69s: shell, Dockerfile,
secrets, Markdown formatting/lint, Prettier and ESLint. The initial hook run identified three
overlong prose lines in the changed API/integration guides; wrapping those exact lines resolved
the gate. Final log: `/tmp/rei-parent-counts-hooks-final.log`. This result paragraph was added
afterward and receives explicit Markdown formatting/lint checks; no runtime files changed.

Implementation and verification are ready for the parent-owned complete diff/matrix inspection,
mandatory independent quick review and authorized commit/closure workflow. No implementation
commit, push, deployment, production operation or external portfolio request was performed.

## Auto Run Result

Implemented live plate counts and registered-neighbour median/movement using the existing coherent
Market snapshot and D-096 populations. Actual-parent scope remains independently resolved through
Locations. Added the strict compatible `event-fed-place-figures` overview/neighbours variants and
truthful PT/EN origin disclosures; no event, migration, projection or layout changes.

Changed files comprise eight implementation files (Market query service, mirrored read types,
strict parser, Place overview/neighbours/client/resources), twelve test/support files (API,
application, contracts, web components, four Market campaigns and the existing browser journey
with three helpers), and five existing delivery records including this plan. The API guide,
integration guide, ADR 0021 and epic notes describe the final behavior and evidence limits.

Parent inspection accounted for the complete changed behavior and acceptance matrix, including
counts without area eligibility, actual adjacency/parent scopes, snapshot/clock coherence, strict
legacy variants, read-only/error/replay paths, and browser-oracle/input/readiness corrections.
The mandatory independent quick review returned zero findings. Patches applied: high 0, medium 0,
low 0. No rejected or deferred findings. Follow-up review recommendation: false; no unverified
changed-behavior risk requires another review.

Verification is recorded above: build/lint/types passed, all four affected real HTTP campaigns
passed on the final runtime, the final complete sandboxed browser campaign passed, and all eight
coverage gates are supported by seven fresh measurements plus narrowly proven domain reuse.
Mandatory all-files hooks passed; normal commit hooks remain enabled. Documentation-only review
accounting does not require another product campaign.

Residual limits retain their existing stories: monthly series is prepared, collection completion
is untracked, suppression integration is separate, and sale is unrecorded. The unchanged Vite
bundle-size warning remains. External portfolio rendering and manual accessibility assessments
are not claimed by this owned automated campaign. No push or production deployment occurred.

Delivered runtime revision: `04aca28cca211fe5ad0179c15ae32a6aacc8c043`. Verified test/support revision:
`3a5a22291cb21d38a96faafd5300c8b42c1ee38d`. Both commits passed their normal pre-commit
and commit-message hooks.
