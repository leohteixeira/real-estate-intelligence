---
title: 'Twelve-month series of the median'
type: 'feature'
ticket: '7'
created: '2026-10-26'
status: 'built'
baseline_revision: 'f2297a5daf80f26d13d51cf9d9c3a4f39340b86e'
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
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 4.7/CAP-9 requires twelve monthly medians from dated retained facts.
The operational series still returns prepared samples while the overview and neighbours are live.

**Approach:** Implement D-097: reconstruct each UTC monthly population from one Market-owned
history snapshot, reusing the established asking-price median. Serve a strictly additive live
series contract and render its actual origin, cutoff and evidence in the existing Place series.

## Boundaries & Constraints

**Always:** Return exactly twelve consecutive ascending UTC months ending in the evaluation month.
Closed months use their final millisecond; the current month uses evaluatedAt. For each cutoff,
select the highest listing revision with BOTH effectiveAt and observedAt at or before it. Apply
current causal membership (the read port already does), then global lowest-active-asking selection
before geography/area, using the existing centavo arithmetic, tie and evidence rule. Each month
has its own population, not movement's matched cohort. Compute own and actual-parent descendant
scopes independently from one read and one clock value. Live points add explicit `asOf`; actual
computedAt equals evaluatedAt, source observation must be at or before asOf, freshness remains
untracked. Keep prepared contracts and their validations exactly intact, with no asOf retrofit.
No history means insufficient data, never prepared fallback or interpolation. Preserve detached
reads, canonical bad input/404/sanitized 500, read-only GETs, keyboard and a11y requirements.

**Never:** New monthly persistence, migrations, snapshots, jobs, dependencies or reporting layers.
No Properties SQL, source/model calls, suppression/freshness work belonging to 4.8/4.5, or general
refactor/audit. Do not read/search/modify `.env*`. No production operations, push or commits from
the implementer; parent owns final review/commits. One heavy workload at a time on the shared
8 GB/2 vCPU VPS; no parallel builds, browser, coverage or broad tests. Keep every existing assertion,
coverage floor, hook and gate; no skip/retry or timeout increase to conceal failures. Do not run
another BMad rendering or expand earlier completed stories. Required skills below apply; local
ADR SQL/Vitest/pnpm/layout conventions override conflicting NestJS defaults.

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                                                 | Expected Output / Behavior                                                                           | Error Handling                   |
| ------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------- |
| Monthly golden history   | Twelve months of dated synthetic listing revisions and actual parent          | Every HTTP point equals manually derived centavos/count/source; parent independently correct         | None                             |
| Calendar boundaries      | UTC year rollover, leap February, exact cutoff and just after                 | Exactly twelve aligned months; inclusive cutoff; current partial month                               | Invalid timestamp fails          |
| Historical lifecycle     | Revisions delivered reversed, removal/reappearance, delayed observation       | Highest eligible revision; removed excluded; no future effective/observed leakage                    | Invalid retained revision fails  |
| Representation           | Current membership, duplicate members, cheaper outside scope, null area, ties | One global active minimum per current property before scope/area; no substitution                    | Invalid money/area fails         |
| Missing history          | Empty place/month, late-created property, country                             | Honest gaps; country has no parent; known empty scope retains identified parent                      | Unknown place 404                |
| Strict compatibility     | Prepared and live payloads, altered asOf/evidence/order/extra fields          | Both original prepared guarantees and new live cutoff/evidence guarantees enforced; detached outputs | Canonical rejection              |
| Read boundary and replay | Same events replayed and repeated series reads; persistence failure           | Stable business results, no writes, no fallback; error detail remains private                        | Sanitized 500                    |
| User journey             | Real HTTP-backed series in PT/EN, 390/960/1440, disclosure/recovery           | Chart/table values and origins agree with parsed live response; cutoff and evidence accessible       | Existing read recovery preserved |

</intent-contract>

## Code Map

- `packages/domain/src/market/remaining-place-figures.ts`: MarketFiguresSnapshot.history contains
  immutable listing states/revisions with CURRENT causal membership. Existing movement reconstructs
  eligible historical states. Reuse/extract only that concrete duplicated rule if needed.
- `packages/domain/src/market/asking-price-median.ts`: global representatives then scope and area;
  selected-source proof, safe integer rounding. Reuse without changing its monetary semantics.
- `packages/domain/src/market/market.read.types.ts` and `packages/contracts/src/market/market.read.types.ts`:
  mirrored public shapes. Series currently prepared-only. Add closed live branch using established
  event-fed-place-figures basis, points with asOf; preserve prepared branch unchanged.
- `packages/contracts/src/market/market.read.dto.ts`: series parser at end; strict wireObject,
  validateParent, prepared validateFigure and live validateLiveMedian. Live branch additionally checks
  exact calendar cutoffs, terminal month/evaluation alignment and sources <= cutoff. Do not relax
  prepared point computedAt/month or freshness rules.
- `packages/application/src/market/market-query.service.ts`: monthlySeries still uses fixtures;
  scope/parent resolve registered descendant IDs. Follow existing live neighbours composition,
  single readFigures/clock, sanitized DomainValidationError and structuredClone. Prepared path stays.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts`: readFigures already hydrates
  coherent current/history/price changes using one Market-only SQL statement. No adapter changes needed.
- `apps/web/src/places/PlaceSeries.tsx`, `resources.ts`, `place-client.ts`: current chart/table/read
  query are adequate; MonthlyValue and section/chart currently hardcode prepared. Add localized live
  origin/cutoff via current components, preserve layout/styles and prepared semantics. Overview's
  livePlaceDisclosure must no longer incorrectly declare all monthly series prepared; old staged
  variants remain true. No new UI framework or chart abstraction.
- `integration/market-figures.integration.test.ts`: existing owned PostgreSQL/RabbitMQ/MinIO/API/worker
  outbox/consumer harness with synthetic v2 events and hand calculations. Extend it with twelve-month
  golden fixture and assertions or use its exact support in a focused native test only if necessary.
- `integration/market-contracts.integration.test.ts`: all twenty registered scopes, DB state before/
  after GETs, canonical errors. Update obsolete prepared-series expectations to honest live empty data,
  preserving original contracts in unit fixtures. Other median/price-facts campaigns are regressions.
- `integration/web-place.integration.test.ts`, `integration/support/overview-history.ts`,
  `integration/support/overview-reads.ts`, `integration/support/overview-disclosures.ts`: existing real
  browser campaign. Update series origin/values to live reads and exercise at least one nonempty
  historical point through existing neighbour evidence. Existing readiness uses native visible locator
  waits before exact assertions; preserve these fixes. No product data mocking.
- Nearby `*.test.ts(x)` files in domain/application/contracts/API/web contain existing fixture builders.
  Reuse them and retain prepared branch tests rather than rewrite unrelated tests.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/market/monthly-asking-price-series.ts`, `index.ts` and focused tests:
      implement/export pure monthly reconstruction; test matrix with fixed clocks and hand values.
- [x] Mirrored `market.read.types.ts`, contracts parser/tests and application service/tests:
      serve/validate the additive live series, retain strict prepared path and detached/error behavior.
- [x] `apps/web/src/places/PlaceSeries.tsx`, `resources.ts`, nearby overview/series tests:
      show accurate PT/EN origin, actual compute evidence and separate monthly cutoff; preserve chart.
- [x] Existing Market integration campaigns and web-place/support: prove the matrix through actual
      HTTP/event persistence and UI without replacing assertions with internal proxies.
- [x] `specs/adrs/0021-event-fed-market-median.md`, `docs/api/market.md`,
      `docs/testing/integration.md`, `epic-market.md`, this plan: record D-097 and verified delivery
      concisely in existing records; resolve series unknown in Notes, leave ticket entry read-only.
      Read documentation-writer before explanatory docs; root decisions ledger already has D-097.
- [x] Read required nestjs-modular-monolith skill and matching architecture/state/testing references
      before backend edits. Repository ADRs remain authoritative. No new cross-context reads.

**Acceptance Criteria:**

- Given twelve months of synthetic dated events on owned real services, when actual monthly-series
  HTTP is read, then all twelve own/parent points equal the documented rule month by month with
  correct cutoff, contributing record count/source and actual computation time.
- Given empty/historical lifecycle/out-of-order/representation cases, when the public series is read,
  then gaps and independently calculated parent values are honest, and replay/read leaves DB unchanged.
- Given real Place UI in both languages at all three widths, when series and disclosure/recovery are
  exercised, then chart/table evidence matches parsed HTTP and accurately identifies persisted origin.
- Given old prepared and new live payloads, when parsed, then incompatible cutoff/evidence/freshness/
  order/shape fails; all applicable build/types/lint/tests/coverage/hooks pass without weakening gates.

## Implementation Notes

- Pure reconstruction validates retained revisions, timestamps and monetary/area inputs, then applies
  the existing deterministic median independently to each eligible own/parent population. The query
  service reads history and clock once and returns detached live output, preserving its prepared path.
- The additive strict parser checks UTC calendar alignment, exact cutoffs, actual computation,
  source observation bounds and live freshness; prepared shape and monthly freshness checks remain.
- Place uses the existing chart and native evidence disclosures. Localized monthly population cutoffs
  have machine-readable exact timestamps; actual computation and source evidence remain separate.
- The existing event campaign now includes twelve reversed monthly revisions, removal/reappearance,
  an independent parent contributor and replay/read integrity. Browser checks compare every displayed
  own/parent value and evidence against the actual HTTP response used by the page.

## Plan Change Log

## Review Triage Log

- Parent inspected the complete 25-file diff against the baseline and audited every matrix row.
  Monthly HTTP golden assertions cover all twelve own/parent values, cutoffs, counts and sources;
  domain tests cover calendar/lifecycle/representative boundaries; strict parser and prepared
  compatibility checks remain; real-service replay/read snapshots and sanitized failure assertions
  cover the read boundary. The full browser campaign checks actual HTTP-backed historical values,
  evidence and recovery in both locales at all three widths. No parent finding remains.
- Review is pinned to quick. Adversarial, edge-case and verification-gap lenses are skipped by
  that selection; one context-free independent reviewer receives the final diff and acceptance.

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free quick reviewer returned “No findings.” No patch, deferral,
  rejection or additional review round is required.

## Design Notes

D-097 chooses recomputation, not monthly storage. `asOf` is necessary because a month-end cohort
cutoff is different from actual computation time. No new storage/event semantics are introduced.
The history already has complete causal states and current membership (4.3); currency and evidence
reuse ADR 0021 (4.2). Route full: meaningful multi-layer behavior exceeds 100 changed lines.

## Verification

- Focused checks passed: domain monthly reconstruction (6), contracts (125), application (12),
  API controller (6, including stale prepared compatibility) and web series/overview (33).
  Full workspace build, lint, all workspace types and strict integration types passed.
- Owned real-service campaigns passed: `test:integration:market-figures` (349.45s including image
  build), `test:integration:market` (37.80s), `test:integration:market-median` (60.63s), and
  `test:integration:market-price-facts` (47.23s).
- The first browser run stopped at the new 390px PT historical empty-point contributor label:
  values/cutoffs/computation/source links through that point passed, but the executor expected
  plural for zero. Existing resources and direct `Intl.PluralRules` confirmation show PT 0/1 use
  `one`, 2 uses `other`; EN 1 uses `one`, 0/2 use `other`. The helper now uses that locale rule,
  preserving every zero/value/evidence assertion. The full final browser run passed (383.73s),
  covering both locales at 390/960/1440, all live monthly values/evidence, keyboard/a11y and recovery.
- Rendered the existing Main, PlaceEN and DesktopPlace artboards with local fonts into ignored review
  captures and visually compared final phone/tablet/desktop captures. The inherited enamel shell,
  typography, gutters and panel/chart layout remain intact; live gaps and revised origin copy fit
  without clipping or overlap. No shipping image/style assets changed.
- Final lint and serial workspace types passed. The initial plain-pipe command
  `pnpm run lint && pnpm -r --workspace-concurrency=1 typecheck && pnpm run test:coverage`
  completed contracts/domain/AI coverage gates, then exited 143 during web without a test failure
  or coverage result. The source of SIGTERM was unobserved. Cumulative cgroup `oom=2/oom_kill=1`
  agrees with the previously recorded 4.6 baseline; no fresh pre-run sample was available.
  The three completed gates were reused on unchanged code/dependencies; only the five incomplete
  workspaces resumed through a direct foreground PTY, preserving every script coverage argument/floor.
  The five-workspace PTY run completed successfully with no further interruption; all eight gates
  pass (2,935 tests). OOM counters remained unchanged after the executor change.

- All-files hooks passed across completed jobs: ESLint, formatting, secrets, shell and Dockerfile
  passed in the full invocation. Markdown initially found two long added documentation lines; after
  rewrapping and updating their staged version, the isolated Markdown job passed on all tracked files.
  The untracked plan and new domain files were explicitly formatted; the plan passed Markdown lint.
  Current handoff receipts and exact coverage resume command are in
  `/tmp/rei-monthly-series-verification.md`; corrected Markdown hook stdout is in
  `/tmp/rei-monthly-series-hooks-markdown-corrected.log`. Other campaign stdout was returned through
  tool sessions and was not retained in separate raw log files. The implementer made no production
  actions or commits; final authorized commits are owned by the parent.

| Workspace      | Tests | Statements | Branches | Functions |  Lines |
| -------------- | ----: | ---------: | -------: | --------: | -----: |
| contracts      |   274 |     91.71% |   91.49% |    93.52% | 93.40% |
| domain         |   688 |     95.36% |   90.92% |      100% | 96.25% |
| ai             |   212 |     94.18% |   88.74% |    91.90% | 96.30% |
| web            |   549 |     95.97% |   91.09% |    96.54% | 97.19% |
| application    |   274 |     91.33% |   90.42% |    95.76% | 92.57% |
| infrastructure |   493 |     82.38% |   76.18% |    88.71% | 84.21% |
| api            |   205 |     94.30% |   85.52% |    97.61% | 95.47% |
| worker         |   240 |     93.45% |   83.30% |    90.37% | 94.81% |

- Targeted domain, application, contracts, controller and web unit tests first; record exact commands.
- `pnpm run build`, `pnpm run lint`,
  `pnpm -r --workspace-concurrency=1 typecheck && pnpm run typecheck:integration` sequentially.
- `COMPOSE_PARALLEL_LIMIT=1 pnpm run test:integration:market-figures`, then
  `COMPOSE_PARALLEL_LIMIT=1 pnpm run test:integration:market`, then affected median/price-facts
  regressions when their assertions/dependencies changed; otherwise document exact valid reuse.
- `CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox COMPOSE_PARALLEL_LIMIT=1 pnpm run test:integration:web-place`
  on final stabilized version. Inspect generated captures against existing authored Place reference;
  preserve full a11y/keyboard/recovery checks and do not launch other heavy work simultaneously.
- `pnpm run test:coverage` with existing floors; reuse unchanged workspace results only with recorded
  code/dependency identity proof and retain all eight gate evidence.
  `pnpm exec lefthook run pre-commit --all-files`.
- Parent reads unified diff, audits every matrix row against executed tests and obtains required
  independent quick review. Parent makes authorized implementation/test/docs commits, marks story
  done only after verified delivery and follows tickets.py next.
  No need to repeat product tests for docs.

## Auto Run Result

The live series reconstructs twelve monthly own/parent medians from retained Market history,
with exact population cutoffs and truthful computation/source evidence. Existing prepared
contracts and presentation remain supported. No migration, dependency or operational mechanism
was added.

Files changed (repository-relative):

- `packages/domain/src/market/monthly-asking-price-series.ts`: pure monthly reconstruction.
- `packages/domain/src/market/monthly-asking-price-series.test.ts`: deterministic boundary cases.
- `packages/domain/src/market/index.ts`: exports the monthly calculation.
- `packages/domain/src/market/market.read.types.ts`: domain live/prepared series variants.
- `packages/contracts/src/market/market.read.types.ts`: mirrored public series variants.
- `packages/contracts/src/market/market.read.dto.ts`: strict live cutoff/evidence validation.
- `packages/contracts/src/market/market.read.dto.test.ts`: live and prepared contract checks.
- `packages/application/src/market/market-query.service.ts`: single-read live series composition.
- `packages/application/src/market/market-query.service.test.ts`: composition and detached results.
- `apps/api/src/market/market.controller.test.ts`: prepared compatibility through HTTP controller.
- `apps/web/src/places/PlaceSeries.tsx`: localized live origin and separate cutoff evidence.
- `apps/web/src/places/resources.ts`: accurate PT/EN series disclosure strings.
- `apps/web/src/places/PlaceOverview.complete.test.tsx`: live rendering and evidence assertions.
- `apps/web/src/places/overview-fixtures.test.ts`: narrowed prepared fixture typing.
- `integration/market-contracts.integration.test.ts`: honest empty live series across registered scopes.
- `integration/market-figures.integration.test.ts`: twelve-month HTTP golden and replay/read proof.
- `integration/support/overview-history.ts`: dated synthetic historical contributor.
- `integration/support/overview-reads.ts`: actual HTTP-to-browser monthly evidence comparison.
- `integration/support/overview-disclosures.ts`: live origin and population cutoff assertions.
- `integration/web-place.integration.test.ts`: historical-series journey at every locale/width.
- `docs/api/market.md`: live monthly contract and semantics.
- `docs/testing/integration.md`: campaign scope and evidence.
- `specs/adrs/0021-event-fed-market-median.md`: D-097 retained-history monthly rule.
- `_bmad-output/initiative-real-estate-intelligence/epic-market/epic-market.md`: accepted decision.
- This plan: acceptance, verification, review and delivery accounting.

Review: one independent quick pass, zero findings; patches 0, deferred 0, rejected 0.
Follow-up recommendation is false; no unverified changed-behavior risk was identified.
Parent full-diff inspection and matrix audit also passed. Verification above covers final product
code and tests; documentation-only finalization reuses those results. All eight coverage gates
and the complete browser campaign passed without lowering assertions or thresholds. Ordinary
commit hooks remain enabled. The executor SIGTERM cause remains unobserved within the stated
limit; all incomplete coverage gates subsequently passed under the changed executor condition.

Residual scope: collection-completion freshness and suppression are separate planned stories
4.5 and 4.8. Freshness is explicitly untracked here. Production publication is not evidenced by
these owned local-service campaigns; the existing deployment dependency remains recorded.
