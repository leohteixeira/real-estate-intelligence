---
title: 'Remaining persisted place figures'
type: 'feature'
ticket: '4'
created: '2026-10-26'
status: done
baseline_revision: '0d2ee3ee5328219e8883f1abf7a929311b346fc6'
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
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 4.4/CAP-9 requires reproducible movement, median time on market, thirty-day
reductions, listings per property and unrecorded sale status. The live overview still supplies
prepared examples for these five figures despite retaining causal Market evidence.

**Approach:** Implement D-096 with pure documented domain rules over one coherent Market-owned
read of retained state/history and current causal membership. Serve calculated figures through the
existing `/api/v1/places/:id/market` endpoint with a strict additive provenance variant. Reuse
existing events, projection, SQL and real-service fixtures; no extra persistence model is needed.

## Boundaries & Constraints

**Always:** Preserve ADRs 0021/0022 current highest state/assignment frontiers, immutable evidence,
replay fencing and one global lowest-active-asking representative per property, then geography
and area eligibility for prices. Use listing-ID ties and established safe money rounding. D-096:
movement compares medians of the SAME eligible-property cohort now and six calendar months prior
(UTC, clamp month end). Apply current causal membership at both instants; reconstruct prior
listing state from highest retained revision whose effectiveAt AND observation are at/before the
cutoff. A property must have an eligible representative at both instants and in the requested scope.
Its current representative may differ from the prior one. Movement is `(current paired median /
prior paired median - 1) * 100`; no pair means insufficient data with no invented zero. Its record
count counts paired properties once; sources cover both paired samples. This cohort can differ
from the headline current median; document that limit.

Time on market is median nonnegative elapsed days from earliest known observation among ALL
retained currently assigned members of each currently active represented property, including
removed-member history; reappearance does not reset it. This measures observed duration, never
source publication age. Area is not required for duration, ratio or reductions. Thirty-day
reductions count currently active member listings of in-scope represented properties with at least
one retained `properties.listing.price-changed` confirming previous > current price in
`(evaluatedAt - 30 days, evaluatedAt]`; count each listing once, percentage denominator all those
active listings. Preserve the design's listing unit. Listings/property divides that active listing
count by distinct represented properties. Empty denominators are insufficient, real zero reductions
are available. Sale remains not-recorded/null/count zero/no sources; no inference from removal.
Every live figure carries actual contributing source observations, computation time and honest
untracked completion status. No source fact after computation can silently enter a calculation.

**Never:** Read/write another context's SQL, alter v1/v2 event contracts, remove replay protection,
read/search/edit `.env*`, enable real sources/models, bypass hooks/tests/coverage, use retry or
increase timeout to hide failures. No new neighbour/monthly/freshness/suppression implementation,
new general audit, telemetry framework or UI redesign. Counts remain explicitly prepared for 4.6;
any necessary internal counts for calculations do not claim delivered plate-count integration.
Preserve existing prepared and staged public variants and their strict parsers for unchanged
fixtures. Use a new closed variant identifying only counts as prepared; do not silently relabel
old response meanings. No commit/deploy/push/branch creation by the implementation agent.

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                                                                | Expected Output / Behavior                                                                                                                                         | Error Handling                                          |
| ------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Complete paired history  | Multiple listings/property, six-month observations, price decreases                          | HTTP equals hand-calculated paired movement, observed duration, listing reduction count/percentage and ratio; no duplicate property in medians                     | No error                                                |
| Missing history/empty    | New property or known empty scope                                                            | Movement insufficient without baseline; other eligible figures still computed; empty denominators null; sale not-recorded                                          | No prepared figure fallback                             |
| Lifecycle/eligibility    | Removed/reappeared members, cheapest listing outside scope or null area, equal prices        | Current global representative controls scope; null area excludes prices only; history preserves age; active listing reduction counted once                         | No invented sale or substitution                        |
| Time boundaries          | Exact six-month cutoff, month-end/leap clamping; exact 30-day lower/upper edges              | Prior cutoff inclusive; reduction interval lower exclusive/upper inclusive; future evidence excluded from prior samples and rejected if used at current evaluation | Fail closed on malformed persisted evidence             |
| Causal order/replay      | Reversed event delivery, newer state/assignment followed by older snapshots; repeated events | Figures converge under existing frontiers and remain stable after replay/restart; membership applied coherently                                                    | Existing permanent conflict/rollback behavior preserved |
| Strict/read-only surface | Actual GET and parser; database dependency failure; unknown/malformed place                  | New variant explicitly separates prepared counts; existing variants remain valid; canonical 404/400/500; GET produces no writes                                    | Sanitized 500, no fallback                              |

</intent-contract>

## Code Map

- `packages/domain/src/market/asking-price-median.ts` — established selection/rounding/provenance;
  reuse or narrowly factor helpers without changing its rule. Add documented remaining-figure
  calculation beside it, exporting through public barrel. `ListingFact` lives in
  `packages/domain/src/properties/properties.events.ts`; it carries effectiveAt/provenance but
  NOT source listedAt. Existing listing price events carry previousMinorUnits.
- `packages/application/src/market/market-price-facts.port.ts` and
  `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` — readCurrent currently
  returns representatives only. Add a narrow coherent read of ALL current assigned member facts,
  immutable state history and confirmed decrease evidence required by the rules, using one SQL
  snapshot of existing own-schema tables. Keep readCurrent for existing callers. Reuse strict
  public parsers; do not expose pg inward. No migration unless a concrete necessity is discovered.
- `migrations/2002_market_causal_price_facts.sql` — existing state_evidence/current,
  assignment_evidence/current, price_event_evidence and property_price_current. State identity
  excludes propertyId; current assignment supplies it. History includes snapshot-discovered state
  facts. Decrease confirmation comes from immutable listing price-change event envelopes.
- `packages/application/src/market/market-query.service.ts` — current live median branch; obtain
  one coherent snapshot and clock instant for all figures/parent. Preserve prepared neighbours and
  monthly paths and injected fixture-only mode. Existing domain failures become sanitized server
  failures, never prepared fallbacks.
- `packages/{domain,contracts}/src/market/market.read.types.ts`,
  `packages/contracts/src/market/market.read.dto.ts` — mirrored public types and strict parsers.
  Existing basis is `event-fed-median-with-prepared-sections`; all six paths are still prepared.
  Add a distinct `event-fed-figures-with-prepared-counts` variant with exact preparedSections
  `['counts']` and preparedEvaluatedAt; validate new live metrics at evaluatedAt independently
  of prepared counts. Preserve legacy variants unchanged and update affected public clients/tests.
- `integration/market-median.integration.test.ts`, `market-price-facts.integration.test.ts`,
  `market-contracts.integration.test.ts`, `integration/support/` — reuse owned Compose/ports,
  real PostgreSQL/RabbitMQ/S3, API/worker, outbox publication, strict public parsing, bounded polls,
  read-only evidence and cleanup. New focused native TS/Vitest campaign should prove outer HTTP
  golden values including v2 membership, history, replay and empty states. Update assertions on
  intentionally changed live overview basis in existing campaigns; preserve prepared-only tests.
- `docs/api/market.md`, `docs/testing/integration.md`, existing ADR 0021 and epic Notes — concise
  amendment for D-096 rules/provenance and focused command; no duplicate report or architecture.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/market/` — implement documented pure D-096 rules and unit-test every
      matrix edge, safe arithmetic, source evidence, cutoff and matched-cohort semantics.
- [x] `packages/application/src/market/`, `packages/infrastructure/src/market/` — extend existing
      read capability minimally; coherent own-schema history/current facts; fake-port orchestration
      and actual SQL tests. Preserve projection and all permanent causal/replay protections.
- [x] `packages/contracts/src/market/`, mirrored domain types, affected API/web call sites — add
      closed variant and strict tests; preserve field units and existing prepared response guarantees.
- [x] `integration/market-figures.integration.test.ts`, necessary existing Market campaigns,
      `package.json` — register/run focused synthetic public HTTP journey covering the matrix.
- [x] `docs/api/market.md`, `docs/testing/integration.md`, `specs/adrs/0021-event-fed-market-median.md`
      — document actual rules and measured evidence concisely using documentation-writer skill.
- [x] This plan — append implementation, exact test/log evidence and remaining limits. Load
      nestjs-modular-monolith skill and relevant references before backend changes; accepted ADRs
      override its ORM/Jest/NX and extra-layer defaults. No workflow render or commit by implementer.

**Acceptance Criteria:**

- Given owned real services and fixture events with known historical/current values, when the
  worker settles and GET `/api/v1/places/:id/market` is parsed publicly, then all five remaining
  figures equal the documented rules and exact manually derived expected values, with contributing
  record counts, sources, computation time and explicit remaining prepared counts.
- Given missing prior data, lifecycle changes, reassignment, adversarial order and replay, when
  the corresponding fixture journey is executed, then HTTP preserves eligibility/causal rules and
  honest insufficient-data/not-recorded states without fixture fallback or writes on GET.
- Given unchanged prepared clients and malformed new responses, when strict public parsing and
  existing Market regressions run, then old variants still pass and invalid new data rejects;
  existing canonical request and server failure behavior remains valid.

## Implementation Notes

- Implemented D-096 as a pure domain calculation beside the existing asking median. The
  application reads a single coherent snapshot and clock instant; the PostgreSQL adapter joins
  only existing Market tables and overlays current causal assignments on retained states.
  Projection writes, frontiers, immutable event identity and migrations are unchanged.
- Added the closed `event-fed-figures-with-prepared-counts` contract while preserving both older
  variants. Prepared counts remain independent of live contributor populations. The web client
  accepts the new basis and uses its existing evidence disclosures to label the five figures as
  collected events, with explicit prepared counts/neighbours/monthly-series copy in both locales.
- Loaded the plan's complete context and the `nestjs-modular-monolith` skill with state-isolation
  and testing references before backend work. Applied `documentation-writer` to the API guide,
  integration guide and ADR 0021 amendment. The supplied plan replaces workflow rendering; no
  workflow, commit, branch, push or deployment was performed by the implementer.
- The first focused HTTP campaign failed at the duration source oracle after its numerical
  golden assertions passed: the expected source URL/time incorrectly selected property D's
  100-day observation. Consolidating the latest contributing observation for that source selects
  property C's 10-day earliest observation (`/4`, `time(10)`), as both the established evidence
  rule and persisted fixture show. Corrected that exact URL/time expectation after checking the
  other source oracle. Original failure: `/tmp/rei-market-figures.integration.log`, 428.66 seconds
  in the test / 431.43 seconds total. No startup failure or timeout change occurred.
- Fractional-duration assertions use ten decimal places of days (less than approximately nine
  microseconds) to bound differences between the even-median expression and the independent
  `150 + elapsed days` oracle. This was anticipatory floating representation tolerance; the
  initial exact duration assertion had passed. Dates, source observations, integer counts,
  money, movement and ratio assertions remain exact. No tolerance or timeout was widened after
  an observed product mismatch.

The corrected focused campaign passed with the final server code: one native Vitest journey,
367.47 seconds in the test / 370.66 seconds total. Command:
`pnpm run test:integration:market-figures`; log:
`/tmp/rei-market-figures.corrected.integration.log`. HTTP golden values were headline 3000
centavos/m² (three properties), paired movement `(2000 / 1500 - 1) * 100` (two properties),
observed duration `150 + elapsed days` (four properties), three reductions among five active
listings (60%), ratio 1.25 and unrecorded sale. After reappearance, age was preserved, the ratio
became 1.5 and reductions remained three among six listings (50%). Replay/restart preserved all
retained digests; GET and canonical dependency-failure journeys performed no writes. All owned
Compose resources were cleaned by the existing fixture.

Affected regressions passed serially on the frozen package/app inputs:

| Command                                        | Result     | Duration     | Log                                           |
| ---------------------------------------------- | ---------- | ------------ | --------------------------------------------- |
| `pnpm run test:integration:market-median`      | 1/1 passed | 64.10s total | `/tmp/rei-market-median.integration.log`      |
| `pnpm run test:integration:market-price-facts` | 1/1 passed | 56.38s total | `/tmp/rei-market-price-facts.integration.log` |
| `pnpm run test:integration:market`             | 1/1 passed | 30.21s total | `/tmp/rei-market-contracts.integration.log`   |

The directly affected initial unit runs passed (domain 25, contracts 81, application 11 and
infrastructure 11 tests). The full web suite after the client provenance correction passed all
545 tests in 41 files, 75.19s, using
`pnpm --filter @rei/web test -- src/places/place-client.test.ts src/places/PlaceOverview.complete.test.tsx`.
The web script's argument forwarding selected the full `src` suite, including the named tests.

Final `pnpm run build`, `pnpm run lint` and `pnpm run typecheck` passed after the client changes.
Type checking includes strict `tsconfig.integration.json`; logs are
`/tmp/rei-market-figures.build.log`, `/tmp/rei-market-figures.lint.log` and
`/tmp/rei-market-figures.typecheck.log`. The build retains the existing nonblocking Vite warning
for the web bundle exceeding 500 kB.

Remaining product limits are deliberate: counts, neighbours and monthly series remain prepared;
completion is untracked; sales are unrecorded; duration is observed history and movement is the
matched cohort, which can differ from the headline sample. Only synthetic source fixtures were
used. Parent-owned independent quick review and auto-commit remain delivery gates.

The root `pnpm run test:coverage` measured passing suites/floors for contracts (230 tests), domain
(682), AI (212), web (545), application (273) and infrastructure (493), then exposed two stale
API Market controller test assumptions. The aggregate SQL fake still returned the old list instead
of one snapshot row, and the stale-example assertion still assigned prepared freshness to movement.
The complete affected test seam was updated in one bounded pass: coherent fake current/history
inputs, explicit new basis, unchanged malformed-fact rejection, and prepared freshness/detachment
assertions on monthly series. This changes only a test excluded from the API production build.
The four real HTTP results and six unchanged coverage results remain valid. Original coverage
failure and all preceding measured results are preserved at `/tmp/rei-market-figures.coverage.log`.

API and not-yet-run worker coverage use `/tmp/rei-market-figures-api-worker-coverage.sh`, an exact
copy of `scripts/test-coverage.sh` with its final pnpm selector narrowed to
`pnpm -r --filter @rei/api --filter @rei/worker --workspace-concurrency=1 exec`; all Vitest options,
exclusions, isolation, deadlines and coverage thresholds remain unchanged. This avoids repeating
six already valid workspace suites. Log: `/tmp/rei-market-figures.api-worker-coverage.log`.

All eight workspace coverage gates passed across the retained root results and targeted
completion: **244 files / 2,880 tests**, with unchanged 80% statements/lines/functions and 75%
branch floors. Per-workspace measurements:

| Workspace      | Files | Tests | Statements | Branches | Functions |  Lines |
| -------------- | ----: | ----: | ---------: | -------: | --------: | -----: |
| contracts      |    13 |   230 |     91.21% |   91.05% |    93.28% | 93.01% |
| domain         |    35 |   682 |     95.29% |   90.85% |      100% | 96.20% |
| AI             |    18 |   212 |     94.18% |   88.74% |    91.90% | 96.30% |
| web            |    41 |   545 |     95.97% |   90.91% |    96.54% | 97.18% |
| application    |    27 |   273 |     91.19% |   90.28% |    95.72% | 92.44% |
| infrastructure |    50 |   493 |     82.38% |   76.18% |    88.71% | 84.21% |
| API            |    21 |   205 |     94.30% |   85.52% |    97.61% | 95.47% |
| worker         |    39 |   240 |     93.45% |   83.30% |    90.37% | 94.81% |

The new domain calculation measured 98.90% lines / 97.53% branches; Market SQL adapter coverage
is 100% lines / 96.55% branches. Corrected API coverage took 25.52s and worker completion took
27.39s. The root command's original exit status remains recorded as failed; these package-scoped
successful measurements resolve its demonstrated test-seam failure without repeating unchanged
workspaces or claiming a clean one-shot root run.

After the API test correction, `pnpm --filter @rei/api typecheck` passed; log:
`/tmp/rei-market-figures.api-final-typecheck.log`. The first mandatory
`lefthook run pre-commit --all-files` passed shell, Dockerfile, secrets, ESLint and Prettier, but
markdownlint identified two overlong lines in the API guide. Both were wrapped without changing
meaning; explicit linting of all changed/new Markdown confirmed the plan and other docs had no
additional violations. Original hook evidence: `/tmp/rei-market-figures.hooks.log`. The hook's
configured `stage_fixed` staged tracked task changes, including the existing epic note. The
second hook attempt still linted the prior staged API guide because Lefthook temporarily hides
unstaged edits; comparing the index with the clean working copy proved the input mismatch.
That attempt is retained at `/tmp/rei-market-figures.hooks.corrected.log`. The corrected guide
and all four new task files were staged for the final full-diff hook gate and parent-owned
review/commit. No commit was made.

The complete staged diff passed `lefthook run pre-commit --all-files` in 43.92 seconds: shell,
Dockerfile, staged secrets scan, Markdown formatting/linting, source formatting and ESLint all
passed. Final hook evidence: `/tmp/rei-market-figures.hooks.full-diff.log`. The earlier guide-only
confirmation also passed (44.78 seconds), recorded at `/tmp/rei-market-figures.hooks.final.log`.
Only this evidence paragraph changed afterward; it passed explicit Markdown/format checks and
was staged without repeating completed runtime gates or hooks. Final index/worktree whitespace
checks passed. The implementation handoff is ready for the parent-owned independent quick
review and authorized auto-commit.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The independent context-free quick reviewer read the plan, context and complete
  unified diff and returned “No findings.” No patch, deferral or additional review is required.

## Design Notes

The change spans domain arithmetic, retained-history SQL, strict contracts and genuine HTTP
verification, well above 100 lines and five files: full implementation handoff. D-096 resolves
owner unknowns before implementation. Existing facts suffice; no new persistent projection,
observability layer or historical-membership mechanism is justified for the accepted paired-cohort
rule. Later series policy remains undecided by this story. No visual change is opened here.

## Verification

Run heavy operations SEQUENTIALLY on the shared 8GB/2vCPU VPS. Keep landing/production untouched;
no parallel build, coverage or broad integration campaign. Preserve original timeout/retry gates.

- First run the directly affected domain/application/contracts/infra unit tests.
- `pnpm run build`, then `pnpm run lint`, then `pnpm run typecheck` — all pass.
- Run the registered focused real-service Market figures HTTP campaign on stabilized code.
- Run existing Market median, price-facts and contracts campaigns as affected regressions, serially;
  reuse earlier valid results only for unchanged behavior/dependencies, explain the exact limit.
- `pnpm run test:coverage` — all existing coverage floors pass; subsumes full unit-test run.
- `lefthook run pre-commit --all-files` — every mandatory hook passes, no bypass.

Parent owns independent quick review and auto-commit after evidence. Preserve previous evidence;
no model calls, production deploy or browser campaign is required by this backend-only slice.

## Auto Run Result

Implemented all five remaining place figures with D-096's matched-property movement, observed
median duration, listing-unit reductions, listings/property and unrecorded sales. Current causal
membership and immutable retained evidence feed one Market-only SQL snapshot. Existing projection,
events, replay fences and prepared response variants retain their contracts. The new strict
variant identifies counts alone as prepared; bilingual web disclosures match that distinction.

Changed files by responsibility:

- `packages/domain/src/market/{remaining-place-figures.ts,remaining-place-figures.test.ts,index.ts,market.read.types.ts}`
  — deterministic calculations, boundary/eligibility/provenance tests and public types.
- `packages/application/src/market/{market-price-facts.port.ts,market-query.service.ts,market-query.service.test.ts}`
  — coherent input capability and clock-bound orchestration.
- `packages/infrastructure/src/market/market-price-facts.pg-repository{,.test}.ts` — one owned-schema
  read with strict retained-state and event hydration.
- `packages/contracts/src/market/{market.read.types.ts,market.read.dto.ts,market.read.dto.test.ts}`
  — additive closed provenance variant and exact live contributor relationships.
- `apps/web/src/places/{OverviewFigure.tsx,PlaceOverview.tsx,PlaceOverview.complete.test.tsx,place-client.ts,place-client.test.ts,resources.ts}`
  — accepted response, truthful figure labels and English/Portuguese prepared-section disclosure.
- `apps/api/src/market/market.controller.test.ts` — actual HTTP module coverage using coherent inputs.
- `integration/{market-figures,market-median,market-price-facts,market-contracts}.integration.test.ts`
  and `package.json` — real-service golden journey and preserved affected regressions.
- Existing epic Notes, this plan, `docs/api/market.md`, `docs/testing/integration.md` and ADR 0021
  — accepted rules, provenance, verification and bounded delivery record.

Independent quick review: zero findings, patches, deferrals and rejections. Patched counts:
high 0, medium 0, low 0. Follow-up review recommendation: false. Parent inspected the complete
unified diff and the measured results against the acceptance matrix before independent review.

Verification passed: the four real-service HTTP campaigns, build, lint, strict workspace and
integration typecheck, all eight coverage gates (244 files / 2,880 tests) using the valid unchanged
results plus corrected API/worker completion, and mandatory all-files hooks. The original failed
oracles, stale API fixtures and hook index mismatch remain recorded above with their exact fixes;
no clean root coverage run is falsely claimed. Product inputs remain unchanged after those
measurements. Documentation-only finalization reuses that evidence.

Residual limits: counts, neighbours and monthly series are prepared, collection completion is
untracked and sale price is unrecorded, as assigned to subsequent stories. No production migration,
deploy, source/model calls, push or main merge occurred in this story. Public production acceptance
remains separately tracked; the current delivery branch is `feat/phase-1`.

Final product/test revision: `cbcdcee1ba2a3f99fb5d2732677cc07c3c879613` on `feat/phase-1`.
Implementation commit: `cbf799e072cd7acff33d0628f64db70eff875bfd`.
Both commits passed normal pre-commit and commit-message hooks. Recorded at
2026-10-26 02:38:24 UTC. Runtime/test inputs match the successful evidence above;
only this documentation changed afterward.
