---
title: 'Provenance and staleness of figures'
type: 'feature'
ticket: '5'
created: '2026-10-26'
status: done
baseline_revision: 'd3af655dfe043cb5fccc8980d07510f1e795870b'
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

**Problem:** Story 4.5 requires every figure's record count, sources and actual computation time,
plus its age when a later completed collection makes it stale. Live Market currently declares
completion untracked and has no consumer for `collection.run.completed`.

**Approach:** Apply D-098: retain the last known completion per source in Market and decorate
existing figures using their actual contributing sources and computation/evaluation instants.
Keep on-demand arithmetic and show explicit stale age through the current provenance component.

## Boundaries & Constraints

**Always:** Consume the strict existing completion event through the existing broker/inbox and
transaction patterns. Retain only source identity and monotonic maximum completion time, using
event occurredAt, never arrival time or listing observation. Replayed/older completions cannot
regress state, including after inbox retention. Preserve rollback/cancellation and sanitized
failures. Start computation from one existing facts snapshot at an actual clock instant, then
read source completions and take evaluation time: this allows a real completion during calculation
and before evaluation without faking computation age. computedAt records that actual calculation
start; evaluatedAt is its later assessment instant. The series population/calendar remains anchored
to evaluatedAt, with its calculation-start stamp supplied independently; this also handles UTC
month rollover without changing the twelve-month or asOf contract. Apply each figure's own source
set independently,
including parent, neighbours, historical points, empty and unrecorded states. If any contributor
has no known completion, or there are no sources, remain untracked with latest=null. Otherwise
latest is the maximum completion of that contributor set, stale iff computedAt < latest; ageSeconds
is (evaluatedAt - computedAt)/1000 for every state. Completion and observations must not exceed
evaluation; historical sources still obey asOf, which remains a population cutoff, not computation.
A completion can predate a newer observation from a still-running collection; live validation must
not incorrectly require observation <= last completed collection. Preserve all monetary/population
rules, detached outputs, canonical errors, prepared examples and their original strict guarantees.
All three live HTTP surfaces must carry valid provenance. Stale UI states include localized age.

**Never:** Cache or store figures merely to create stale data; new jobs, monthly snapshots,
completion manifests/payload inventories, diagnostic frameworks or reporting layers. No Collection
SQL, source/model calls, suppression work from 4.8, broad audit or unrelated cleanup. No reading,
searching or editing `.env*`. No production operation, push or commit by implementer. Parent owns
review and commits. Shared VPS 8 GB/2 vCPU: one heavy workload at a time, sequential builds,
coverage and browser campaigns. No skipped assertion, automatic retry, relaxed threshold or timeout
increase to conceal failures. Preserve prior commits/evidence; no workflow re-rendering.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                                   | Expected Output / Behavior                                                                   | Error Handling                   |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| Completion delivery   | Strict source completion through outbox/broker/worker           | Own Market watermark persists transactionally; no foreign SQL                                | Malformed input rejected         |
| Replay and order      | New, old, duplicate completion; cleared inbox; rollback/cancel  | Maximum remains; duplicate safe after retention; failed transaction leaves no partial effect | Existing delivery policy         |
| Per-figure sources    | Complete, partial, absent and unrelated source coverage         | Max only among actual contributors; partial/empty remains untracked                          | Invalid stored time fails closed |
| Real stale interval   | Facts calculated at T0, source completes at T1, evaluate at T2  | T0 < T1 <= T2 gives stale, latest=T1, exact age T2-T0, unchanged value/provenance            | Future completion fails closed   |
| Current and equality  | Recalculation after completion or completion equals calculation | Fresh; actual computation time retained; no manufactured age                                 | Canonical server failure         |
| Three public surfaces | Overview/parent, neighbours, twelve monthly own/parent points   | Every figure has count/sources/computation/freshness; historical asOf remains exact          | Canonical 400/404/sanitized 500  |
| Strict compatibility  | Prepared examples and live fresh/stale/untracked payloads       | Original prepared constraints and new live time/status/age coherence enforced                | Invalid payload rejected         |
| User evidence         | PT/EN stale disclosures at phone/tablet/desktop                 | Age and computation visible alongside source/count, native keyboard/a11y preserved           | Existing recovery unchanged      |

</intent-contract>

## Code Map

- `packages/domain/src/market/{asking-price-median.ts,remaining-place-figures.ts,monthly-asking-price-series.ts}`
  already create complete evidence and actual computation time. Reuse their arithmetic; allow
  monthly
  population evaluation and actual calculation-start stamp to differ (default keeps old callers),
  without changing the twelve-month cutoffs. Add one small pure freshness rule beside them,
  exporting
  from `index.ts`, with matrix unit tests.
  Existing MarketEvidence public type already supports fresh/stale/untracked and ageSeconds.
- `packages/domain/src/collection/collection.events.ts`:
  CollectionRunCompleted/parseCollectionRunCompleted
  strictly validate envelope and payload; sourceId is payload source, completion is occurredAt.
  Import only through `@rei/domain` facade. No new event contract needed.
- `packages/application/src/market/market-price-facts.port.ts`: narrowly add completion read
  capability
  (requested contributor source IDs) and completion projection port; existing adapter can implement
  them. Avoid changing the facts snapshot, which already supplies coherent arithmetic inputs.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts`: current adapter owns
  Market
  transactions and readFigures; extend with parameterized monotonic completion upsert/read. Add the
  next correctly numbered Market SQL migration for source_id primary key and completion timestamp.
  No need to retain completion payloads or duplicate the event ledger. Export existing adapter as
  before.
- `packages/application/src/market/consume-market-listing.service.ts` and
  `packages/application/src/properties/reconcile-listing-history.service.ts`: reuse established
  strict
  parsing, transaction/inbox/cancellation patterns for a narrow completion consumer service. Its
  idempotent max operation remains safe after inbox expiry. Preserve listing projection behavior.
- `apps/worker/src/{market/market.module.ts,market/market-listing.consumer.ts,market/index.ts,main.ts}`:
  add/wire/start the narrowly scoped completion subscription like Properties' existing
  `listing-completion.consumer.ts`; keep readiness after awaited subscription starts and shutdown
  intact.
- `packages/application/src/market/market-query.service.ts`: read facts once and record calculation
  start, read completions once for needed snapshot source IDs, take evaluation clock and compose
  figures/freshness from these inputs without mutating retained input. Apply only each actual
  figure contributor set; monthly population cutoffs use evaluation while evidence uses calculation
  start. No second calculation or retry loop is needed for a clock crossing a month boundary.
  Prepared-only
  branch remains identical. Translate stored DomainValidationError as existing sanitized server
  failure.
- `packages/contracts/src/market/market.read.dto.ts`: liveEvidence currently only allows untracked,
  computedAt===evaluatedAt. Extend live-only validation to truthful <= evaluation, exact age/status,
  null semantics and sorted/source bounds. Keep every prepared validateEvidence rule intact. Monthly
  cutoff derives from evaluatedAt while computation may precede it; preserve exact
  month/order/source
  bounds and make the rare UTC month-rollover interval coherent, not a malformed response.
- `apps/web/src/shared/Provenance.tsx`, shared translations and existing tests: status is already
  localized but age is missing. Add localized stale age via existing formatters/resource
  conventions;
  retain count/source/computation and native disclosure behavior without new component or CSS layer.
- Existing nearby domain/application/adapter/consumer/contracts/web tests use Vitest and fake ports.
  Update necessary fake methods and time assumptions; do not weaken existing prepared or arithmetic
  tests.
- `integration/market-figures.integration.test.ts`: real owned PG/Rabbit/S3/API/worker fixture and
  outbox helpers are sufficient for completion delivery, source isolation, replay/read-only and HTTP
  evidence. A controlled service clock/barrier at the existing native HTTP fixture boundary may
  prove
  an actual completion between computation and evaluation; no production test-mode switch or cache.
- `integration/web-place.integration.test.ts` and
  `integration/support/overview-{reads,disclosures}.ts`:
  existing full PT/EN x 390/960/1440 campaign checks actual HTTP evidence. Add bounded valid stale
  response scenario using the existing controlled interception pattern, preserving recovery to real
  API,
  and label that UI boundary honestly. Retain all value/a11y/keyboard assertions and current fixes.
- `docs/api/market.md`, `docs/testing/integration.md`, ADR 0021 and epic Notes: concise
  D-098/observed
  delivery updates; no duplicate report. Root append-only decision ledger already records D-098.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/market/market-freshness.ts` and nearby tests: implement exact source/time
      rule and matrix edges.
- [x] `packages/application/src/market/market-price-facts.port.ts`, existing adapter and next Market
      migration: persist monotonic source completion.
- [x] `packages/application/src/market/consume-market-completion.service.ts`,
      `apps/worker/src/market/` and `main.ts`: transactional completion consumption.
- [x] `packages/application/src/market/market-query.service.ts`, contracts parser and nearby tests:
      apply freshness to all live figures, preserve prepared variants.
- [x] `apps/web/src/shared/Provenance.tsx`, localized resources/tests and existing browser helpers:
      show localized stale age.
- [x] `integration/market-figures.integration.test.ts`: prove consumer effects, HTTP evidence and
      replay;
      prove reachable stale interval at native HTTP boundary without claiming a frozen fixture as
      production.
- [x] `docs/api/market.md`, integration guide, ADR 0021, epic Notes and this plan: record verified
      behavior, exact results and limitations.
- [x] Read nestjs-modular-monolith and relevant communication/state/testing references before
      backend
      changes; repository SQL, facade, Vitest and pnpm rules override generic ORM/NX/Jest defaults.
      Read documentation-writer before explanatory docs. No planning or diagnostic artifacts beyond
      this plan.

**Acceptance Criteria:**

- Given owned real services, when strict completion events pass through the actual worker, then
  Market retains each source's maximum completion, replay/order/rollback are safe, and public
  overview,
  neighbours and series show exact per-contributor provenance/freshness without cross-schema reads.
- Given a calculation before a subsequently observed completion, when HTTP returns that calculation
  at a later evaluation instant, then strict parsing accepts stale with its exact age, source
  completion
  and unchanged numerical evidence; recalculation after completion is fresh and partial coverage
  untracked.
- Given PT/EN at 390/960/1440, when valid stale evidence is disclosed, then explicit localized age,
  sources, computation and count remain accessible; existing real API journeys and recovery pass.
- Given final stabilized code, when applicable build/types/lint/unit/coverage/hooks and affected
  real
  service/browser campaigns run serially, then gates pass with existing assertions and floors
  intact.

## Implementation Notes

- Implemented Market-owned source watermarks, strict transactional completion consumption, per-figure
  source coverage, independent calculation/evaluation instants, live-only contract validation and
  localized stale age. Prepared examples and existing numerical/population rules remain intact.
- Focused verification passed before the service campaign: domain Market 241 tests, application
  Market 42, contracts 127, infrastructure Market 16, worker completion 2 and shared provenance 3.
  The subsequently added UTC month-rollover domain regression is included in final verification.
  Sequential workspace build, lint and integration type checking passed; the existing Vite large
  chunk warning remains informational. Full final gates and service/browser receipts are recorded
  below.
- Capacity operation coordinated by the parent during the running development campaign: gracefully
  stopped only idle host prepublication dependencies `portfolio-infra-rei-postgres-1`,
  `portfolio-infra-rei-storage-1` and `portfolio-infra-rabbitmq-1`. No volume, data or configuration
  changed; Docker-in-Docker campaign services, landing and Caddy were preserved. Available host RAM
  rose to about 2249 MiB. These dependencies remain off during development and can be started
  individually when publication prerequisites are available. Subsequent public HTTPS GETs to the
  landing `/pt` and `/en` returned 200; this confirms landing availability only, with no application
  deployment claim.

## Plan Change Log

- The first web-place run stopped after the 390/PT default capture in 181.89 seconds: the existing
  `system-state-reads.ts` helper still asserted that live synthetic-data must be untracked and that
  live stale evidence was impossible. Actual acquisition correctly returned fresh under D-098.
  That partial run does not approve the six-case campaign. Read the entire campaign and its direct
  state/read/disclosure/history/HTTP/parser/cleanup helpers together: acquired synthetic-data is
  tracked/fresh; Properties-only synthetic-neighbour remains untracked; controlled stale evidence
  passes the strict live parser and is removed before real recovery. Updated only the proven old
  helper expectation/comment; kept functional, accessibility, retry, value and navigation assertions.
- Product Docker inputs stayed identical after that helper-only correction. Retained exact web
  `sha256:9091adf2badd66ed337d3fc0f442ee41298e5fa04e2d2426d3597efb94866260` and previously retained
  worker/migrations images. Owned cleanup had removed the prepared API stage, so re-exported its
  existing cached layers as `rei-d098-images-prepared-api:latest`,
  `sha256:bad4d913f04e96f243b48b5cf98431a58979e3e65613281777d567d4743f1c28`; every install, COPY and
  product build step reported CACHED, with no product recompilation. The corrected browser run uses
  a temporary prepared-search Compose override with these explicit images and reset build entries;
  the original fixture is restored after execution. No permanent configuration or timeout change.

- The initial real Market-figures run reached the native stale HTTP boundary after completion,
  source-coverage, replay and rollback assertions, then failed in 315.4 seconds because Supertest's
  automatically allocated port was outside the fixture's registered endpoint set. The correction
  allocates/registers an owned loopback port and closes the native server with `preserveCleanup`.
  Rechecked that whole boundary together: strict plain event envelope, outbox/broker/inbox delivery,
  production service/PG ports and real clock, JSON/strict parser, network guard and cleanup. No
  production behavior, assertion, threshold or timeout changed. Integration TypeScript passed after
  correction; the corrected campaign runs on that fixture.

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The independent context-free quick reviewer inspected the complete diff and
  surrounding contracts, callers, fixtures and applicable instructions; no changes were requested.
- Parent inspection read the complete 2270-line diff and matched every matrix row to passing
  domain/application/adapter/consumer/contracts/UI tests and the real-service/browser receipts.
  Completion, monotonic replay and rollback use the real worker/SQL campaign; the native HTTP
  boundary proves the actual stale interval on all three surfaces. Strict prepared compatibility
  and UTC rollover are covered by the passing unit gates; all six UI cases passed.

## Design Notes

D-098 retains a tiny source watermark because Collection owns completion and Market cannot query
its SQL. Freshness intentionally measures the owner's completion-vs-computation rule, not event
projection lag. A completion read during calculation and a later evaluation instant make a real
stale
interval representable without caching. Validate future timestamps fail-closed and preserve
historical
population cutoffs. Full route: cross-layer behavior and tests exceed 100 lines; raise risk to
medium
for persistent event consumption and contract evolution. Prior arithmetic/projection evidence stays
valid.

## Verification

- Corrected `CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox COMPOSE_PARALLEL_LIMIT=1
pnpm run test:integration:web-place`: **passed 1/1**, 352.53 seconds test / 355.20 seconds campaign.
  All six PT/EN x 390/960/1440 cases passed, including strict-valid controlled stale disclosures,
  localized age, native keyboard, accessibility and recovery to the actual API. This UI interception
  proves rendering; the separate native HTTP service campaign proves the real stale interval.
  Reused the exact retained images above, then restored `prepared-search.compose.yaml` byte-for-byte
  (no Git diff). No assertion, retry, timeout or coverage threshold was relaxed. OOM counters stayed
  at the original cumulative baseline.
- Opened the existing authored `reference-DesktopPlace.png` and `reference-PlaceEN.png` beside the
  six final `place-{390,960,1440}-{pt-BR,en}.png` captures. Existing navy/blue/yellow identity,
  numerical hierarchy, desktop sidebar, phone bottom navigation and focus visibility remain
  coherent. The existing live collected-data page uses Bela Vista, its real counts, schematic map
  and sparse monthly population rather than the authored Pinheiros fixture. No new visual
  inventory, CSS layer or unrelated design change was added.
- Final changed TypeScript/TSX Prettier checks, all five changed Markdown formatting/lint checks,
  the corrected integration helper ESLint check and `git diff --check` passed. A documentation line
  was wrapped to satisfy MD013; product inputs were unchanged.
- Implementation and parent matrix/diff audit are complete; independent quick review found no
  defects. Implementation and test commits passed all applicable normal pre-commit and commit-message
  hooks without changing tested inputs. Documentation delivery and final ticket closure follow.

- Affected real-service regressions: `COMPOSE_PARALLEL_LIMIT=1 pnpm exec vitest run --config
vitest.integration.config.ts integration/market-contracts.integration.test.ts
integration/market-median.integration.test.ts integration/market-price-facts.integration.test.ts`:
  **passed 3/3**, 131.94 seconds tests / 136.01 seconds campaign, sequential files and owned cleanup.

- Final sequential workspace build, all eight workspace TypeScript checks, integration TypeScript
  and lint passed. `git diff --check` passed. The existing Vite chunk-size advisory is unchanged.
- `pnpm run test:coverage`: **all eight gates passed**, 2953 tests / 248 files, using unchanged
  80% statements/lines/functions and 75% branches. Exact percentages:

  | Workspace      | Tests | Statements | Branches | Functions | Lines |
  | -------------- | ----: | ---------: | -------: | --------: | ----: |
  | contracts      |   276 |      91.87 |    91.63 |     93.57 | 93.53 |
  | domain         |   697 |      95.42 |    91.03 |       100 | 96.30 |
  | ai             |   212 |      94.18 |    88.74 |     91.90 | 96.30 |
  | web            |   549 |      95.97 |    91.10 |     96.54 | 97.19 |
  | application    |   279 |      91.33 |    90.34 |     95.45 | 92.62 |
  | infrastructure |   494 |      82.41 |    76.18 |     88.75 | 84.24 |
  | api            |   205 |      94.30 |    85.52 |     97.61 | 95.47 |
  | worker         |   241 |      93.48 |    83.30 |     90.46 | 94.83 |

- Tested implementation identity: base `d3af655dfe043cb5fccc8980d07510f1e795870b` plus the 30 changed
  or untracked files under `apps/`, `packages/`, `integration/`, `migrations/`. Sorted relative
  paths hashed as UTF-8 path, NUL, decimal byte length, NUL, file bytes give SHA-256
  `19594f4410fc83555c8e3a9b9fa8d3a62e84a22f0addfbcc96ca823b888ec2ec`.
  Documentation/plan edits are excluded so verified product identity stays assessable during handoff.
  The last additional file is the corrected integration-only system-state helper; product source
  and Docker inputs remained identical to the passing coverage and real-service campaigns.

- Corrected `COMPOSE_PARALLEL_LIMIT=1 pnpm run test:integration:market-figures`: **passed 1/1**, test
  311.25 seconds / campaign 314.19 seconds. Real consumer source coverage, max/order/replay after
  inbox retention and worker restart, rollback/cancellation, independent historical/parent/neighbour
  evidence, three native HTTP stale routes with actual intervening completion, fresh recalculation,
  detached/read-only output and real API future-completion sanitized failures all passed.
  Cgroup OOM counters remained at their pre-campaign baseline (`oom=2`, `oom_kill=1`).
- Retained exact local images under `rei-d098-images-{api,worker,migrations}:latest` for reuse after
  harness-only changes: API `sha256:296feb1885baf98b84006e6eb05cdf15dcc20f23db1bed3fe148ad7d21fce978`,
  worker `sha256:8d6ea6e305203c7e3c81a8389158bfd143640e9b4dba2b38461f2bd4ded2aefc`, migrations
  `sha256:2d57f8189730b833351db1b015e6cdbde7dc0d5663b5c0c14dac5dbafe7b2a1d`. No product input
  changed after this campaign. These are development verification images, with no publication.

- First run targeted new/changed domain, service, adapter, consumer, contracts and UI tests, and
  required dependency regressions. Build dependencies only as needed, sequentially.
- `pnpm run build`, `pnpm run lint`, `pnpm -r --workspace-concurrency=1 typecheck`,
  `pnpm run typecheck:integration` sequentially on final product code.
- `COMPOSE_PARALLEL_LIMIT=1 pnpm run test:integration:market-figures` with completion/stale proof.
  Run affected Market contract/median/price-facts regressions only when their code/assertions or
  dependencies invalidate prior receipts; otherwise record exact retained identity and reuse.
- `CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox COMPOSE_PARALLEL_LIMIT=1 pnpm run
test:integration:web-place`
  once final stabilized UI/helpers are ready. Compare existing authored Place references with final
  captures; no new visual inventory. Preserve full six-case a11y/keyboard/recovery campaign.
- Existing eight workspace coverage gates with unchanged floors. Prefer direct foreground PTY for
  long coverage to avoid the twice-observed plain-pipe executor interruption; no retry or timeout
  change.
  Reuse only demonstrably unchanged workspace/dependency receipts, documenting exact identity.
- All required hooks remain. Complete only missing hook jobs after a documentation-only correction;
  stage the corrected Markdown before Lefthook reads it. Parent owns final full diff/matrix
  inspection,
  independent quick review, authorized grouped commits, done transition and next ticket.

## Auto Run Result

Implemented per-contributor collection freshness and explicit localized stale age without changing
figure arithmetic, prepared contracts or historical population cutoffs. The tested implementation
identity above was reproduced by the parent before review. No production deployment is claimed.

Files changed:

| File                                                                          | Change                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/places/resources.ts`                                            | Localized calculation age.                                      |
| `apps/web/src/shared/Provenance.tsx`                                          | Display stale age in existing disclosure.                       |
| `apps/web/src/shared/Provenance.test.tsx`                                     | Verify PT/EN age and unaffected statuses.                       |
| `apps/worker/src/main.ts`                                                     | Await completion subscription startup.                          |
| `apps/worker/src/market/index.ts`                                             | Export completion consumer.                                     |
| `apps/worker/src/market/market-completion.consumer.ts`                        | Subscribe and await transactional handler.                      |
| `apps/worker/src/market/market-completion.consumer.test.ts`                   | Verify subscription and commit/error propagation.               |
| `apps/worker/src/market/market.module.ts`                                     | Wire existing persistence and completion service.               |
| `migrations/2003_market_source_completion.sql`                                | Retain Market-owned finite source watermark.                    |
| `packages/application/src/market/consume-market-completion.service.ts`        | Strict completion consumption with atomic inbox.                |
| `packages/application/src/market/consume-market-completion.service.test.ts`   | Verify replay, cancellation and rollback.                       |
| `packages/application/src/market/index.ts`                                    | Export completion service.                                      |
| `packages/application/src/market/market-price-facts.port.ts`                  | Expose source completion capabilities.                          |
| `packages/application/src/market/market-query.service.ts`                     | Apply independent contributor freshness to all surfaces.        |
| `packages/application/src/market/market-query.service.test.ts`                | Verify snapshot/time order, per-surface evidence and rollover.  |
| `packages/contracts/src/market/market.read.dto.ts`                            | Validate strict live freshness and age.                         |
| `packages/contracts/src/market/market.read.dto.test.ts`                       | Cover valid/malformed live states and rollover.                 |
| `packages/domain/src/market/index.ts`                                         | Export pure freshness rule.                                     |
| `packages/domain/src/market/market-freshness.ts`                              | Evaluate coverage, maximum completion and exact age.            |
| `packages/domain/src/market/market-freshness.test.ts`                         | Cover source/time matrix and detached output.                   |
| `packages/domain/src/market/monthly-asking-price-series.ts`                   | Separate calculation stamp from monthly population cutoff.      |
| `packages/domain/src/market/monthly-asking-price-series.test.ts`              | Verify UTC rollover and invalid ordering.                       |
| `packages/infrastructure/src/market/market-price-facts.pg-repository.ts`      | Parameterized monotonic upsert and source-scoped reads.         |
| `packages/infrastructure/src/market/market-price-facts.pg-repository.test.ts` | Verify owned SQL, filtering and malformed timestamps.           |
| `integration/market-contracts.integration.test.ts`                            | Preserve comparisons with variable exact age.                   |
| `integration/market-figures.integration.test.ts`                              | Prove real delivery, replay, stale HTTP and sanitized failures. |
| `integration/market-median.integration.test.ts`                               | Assert age from actual calculation/evaluation.                  |
| `integration/support/overview-reads.ts`                                       | Verify controlled stale disclosure and actual API recovery.     |
| `integration/support/system-state-reads.ts`                                   | Expect fresh after genuine completed acquisition.               |
| `integration/web-place.integration.test.ts`                                   | Exercise stale evidence in every language/viewport case.        |
| `docs/api/market.md`                                                          | Document exact live provenance and time semantics.              |
| `docs/testing/integration.md`                                                 | Explain distinct real-service and controlled UI proof.          |
| `specs/adrs/0021-event-fed-market-median.md`                                  | Record D-098 completion/time model.                             |
| `epic-market.md`                                                              | Record delivered D-098 behavior in existing Notes.              |
| `story-provenance-and-staleness-of-figures-plan.md`                           | Record execution, evidence, review and delivery.                |

Review: quick only, zero findings; zero patches, deferred or rejected items. Patched counts:
high 0, medium 0, low 0. Follow-up review recommendation: false; no specific unverified product
risk was identified. Build, types, lint, all eight coverage gates, affected real-service campaigns
and full six-case browser campaign passed as recorded above. Normal staged hooks on implementation
and test commits passed, including secrets, Prettier, ESLint and commit-message validation.
Documentation secrets, Prettier, Markdown lint and commit-message hooks also passed. A long line
added by the parent was wrapped after the Markdown hook rejected it; no product verification was
repeated for that documentation-only correction.

Limits: native HTTP deliberately schedules a real completion during assessment; it establishes
reachability rather than production frequency. UI interception establishes rendering only. Failed
partial executor campaigns remain recorded with their concrete corrections. No assertion, timeout,
coverage floor or required gate changed. Publication and remaining stories belong to the continuing
goal and are not claimed complete by this story.

## Delivery

- Delivered on `feat/phase-1`: implementation `715142a`, tests `266cb56`, documentation
  `a4325fe7b18b80d35dec407c408078e3e538ab48`. All normal applicable hooks passed.
- Parent verified all 35 reviewed paths appear after the recorded baseline, no reviewed path remains
  uncommitted, the working copy is clean and all 30 implementation/test inputs still produce the
  recorded tested SHA-256. Diff whitespace check passed.
- `tickets.py mark 4.5 done` completed after those checks. This closure only records delivery;
  no product input changed and no passing product campaign was repeated.
- Story 4.5 acceptance and applicable gates are satisfied. Continue the existing goal with
  `tickets.py next`; publication and other stories remain separately tracked.
