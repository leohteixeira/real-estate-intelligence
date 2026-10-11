---
title: 'Vitest integration standard'
type: 'chore'
ticket: ''
created: '2026-10-11'
status: 'built'
baseline_revision: '7738135d2d76d7d8fd749d4609d93aeaf1d4a06d'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
deferred: []
context:
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/CLAUDE.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0004-testing-strategy.md'
  - '/workspace/repos/real-estate-intelligence/_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/epic-platform-baseline.md'
  - '/workspace/repos/real-estate-intelligence/_bmad-output/initiative-real-estate-intelligence/plan-vitest-integration-standard-preservation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The owner explicitly requires `integration/` to use Vitest and appropriate libraries
such as Supertest, Testcontainers and Nock instead of the Node standard-library testing pattern,
and makes this the standard for future integration tests.

**Approach:** Migrate every campaign into discovered Vitest tests, replacing manual testing and
fixture infrastructure with library-backed support while preserving every existing guarantee.
Record the owner's decision D-039 in normative instructions and an ADR.
The owner's subsequent D-040 requirement makes every integration campaign, support file and
probe TypeScript, with an actual strict compiler gate and typed Vitest configuration.

## Boundaries & Constraints

**Always:** Preserve all assertions and real PostgreSQL/RabbitMQ/S3 behavior, failure/restart/upgrade
proofs while migrating every integration file to TypeScript with effective strict typechecking,
without explicit any, compiler suppressions or weakening the base configuration. Preserve
proofs, workspace coverage floors, explicit SQL, production preload and context boundaries. Use
Vitest `expect`, Supertest HTTP, Testcontainers-owned isolated Compose environments and Nock only
for controlled external HTTP interception/network guards. Use pnpm and exact pinned dev dependencies;
retain Vitest 4.1.11 rather than incidentally upgrading it. Load the local NestJS modular-monolith
skill and relevant testing reference; D-012 overrides its Jest/ORM defaults. Preserve the current
uncommitted Market story, its URL-validation repair, request counts and documentation. Existing
changes are this session's work; the owner directed this overlapping migration before commit.

**Never:** Read/search/edit `.env*`, restore the owner's stash, use VPS/deploy/push/real sources,
change production behavior/catalog/schema, weaken assertions, hide failures or merely run old
Node campaigns from Vitest. No `node:test`, `node:assert`, custom assertions, `node:child_process`,
`node:net` or promisified manual process harnesses in integration tests. Basic file/cryptographic/
module APIs indispensable to fixtures are not a second test framework. Actual product commands
and fresh-process probes may use Execa; do not delete their restart or import-order evidence.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                 | Expected Output / Behavior                                                            | Error Handling                       |
| -------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| Discovery            | Root integration command                      | All sixteen campaigns and cleanup/support tests discovered once; no dist tests        | Empty discovery fails                |
| Real service journey | Unique local fixture                          | Same SQL, asynchronous effects, snapshots and HTTP guarantees                         | Vitest reports failed assertions     |
| Fault and restart    | Broker/storage/process interruption           | Original retries, durable replay, exit status and recovery retained                   | Bound waiting; no swallowed failure  |
| Upgrade              | Historical schema/data and current migrations | Original pre/post-upgrade invariants retained                                         | Setup failure cleans owned resources |
| HTTP                 | Successful/error API and management requests  | Supertest validates real status, body, headers, correlation and cancellation          | Expected non-2xx remains assertable  |
| External dependency  | Mocked synthetic HTTP / unmocked outside host | Nock permits exact interception, rejects external network and leaves no pending mocks | No fake real-service semantics       |
| Cleanup              | Primary failure and teardown failures         | Preserve both causes, clean exact owned stacks/volumes, suppress false success        | Failure remains visible              |

</frozen-after-approval>

## Code Map

- `integration/*.integration.mjs` — sixteen campaigns, 11,990 total integration lines including
  cleanup helper/test; retain scenario bodies, SQL, loops and their 1,029 static assertions.
- `integration/source-register-cleanup.{mjs,test.mjs}` — cleanup cause aggregation already tested;
  retain semantics, migrate test runner/assertions.
- `integration/audit-tracer.integration.mjs` — only campaign using an external default stack;
  replace defaults with owned fixture endpoints and lifecycle. Preserve all fourteen delivery proofs.
- `integration/collection-resilience.integration.mjs` — self-spawned restart probe; extract a
  non-test fixture probe for a genuinely fresh process. Never load Vitest in that child.
- `integration/locations.integration.mjs` — two CommonJS import-order probes embed Node assert;
  return inspectable results and assert in Vitest, retaining two separate processes.
- `integration/rabbitmq-healthcheck.integration.mjs` — four concurrent brokers/fresh volumes;
  use Testcontainers containers, preserve exact Compose healthcheck and private cookie metadata.
- `compose.yaml`, `docker/*.Dockerfile`, `scripts/migrate.sh` — immutable production fixture
  definition and preload; Testcontainers Compose must support staged services, profiles, build,
  one-shot migrations/commands and faults without changing these files.
- `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `eslint.config.js` — scripts,
  dependency pins, root config enforcement and CI migration; existing unit coverage stays unchanged.
- `specs/adrs/0004-testing-strategy.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`,
  `docs/testing/coverage.md` — unit `--dir src` convention needs an explicit integration-config
  exception and a link to new ADR `0020-vitest-integration-standard.md` and execution guide.

## Tasks & Acceptance

**Execution:**

- [x] Root `package.json` / lockfile — add only used test dev libraries, pinned runner 4.1.11,
      Testcontainers 12.2.0, Supertest 7.3.1, Nock 15.0.1, Execa 10.1.0 and get-port 7.2.0;
      preserve every focused command, add complete suite and healthcheck commands.
- [x] `vitest.integration.config.mjs`, `integration/support/` — explicit test-only discovery,
      bounded serial campaign execution, library-backed fixture lifecycle, HTTP and network support;
      focused tests prove rejection, readiness/cleanup failures and no resource leakage.
- [x] `integration/` campaigns — convert to `*.integration.test.mjs`, native Vitest tests and
      expectations, Supertest requests and Testcontainers setup/cleanup. Preserve assertion inventory;
      any mechanical rewrite uses a reviewed codemod, never deletes a scenario or collapses checks.
- [x] `integration/fixtures/` — preserve fresh-process restart/import-order probes and actual
      production CLI checks with Execa. No test discovery or fixture setup at module-import time.
- [x] `eslint.config.js`, `.github/workflows/ci.yml` — enforce the new convention and make CI
      call the owned Vitest suite rather than prepare/destroy the default stack in shell.
- [x] ADR 0020, instructions and `docs/testing/integration.md` — document scope, commands,
      libraries, isolation, failure handling and new-test pattern; use documentation-writer.
      Add a short amendment/link in ADR 0004 rather than erase historical decisions.
- [x] This plan and Market story plan — append implementation, preservation inventory and exact
      final verification evidence; retain immutable Market intent and previous review log.

**Acceptance Criteria:**

- Given every original campaign, when the full root Vitest integration command runs, then every
  migrated campaign passes against owned real services and all original scenario checks survive.
- Given isolated API calls, fault injection, historical upgrade and restart probes, when executed,
  then HTTP/SQL effects and durable guarantees match the previous tests without Node test/assert.
- Given a setup or assertion failure, when cleanup runs, then exact owned resources are removed
  and neither primary nor cleanup failures are suppressed or reported as success.
- Given a future integration test, when lint and explicit discovery run, then forbidden manual
  patterns fail lint and the test is discovered without unit/dist cross-contamination.

## Implementation Notes

- Migrated every campaign to native discovered Vitest tests; setup and assertions execute inside
  the reported lifecycle. Original strict deep comparisons remain `toStrictEqual`.
- Shared support uses Testcontainers Compose/containers, Supertest, Nock, Execa and get-port.
  Audit now owns its endpoints. Restart/import-order evidence remains genuinely fresh-process.
- Every nested resource cleanup retains primary and secondary failures; all resource releases run
  even after a previous release fails. Explicit caught-state preserves thrown falsy values.
- Root ESLint enforces both built-in spellings and CommonJS/dynamic forms, with ESLint API
  regression tests. CI invokes the complete owned suite without touching the default stack.
- D-039 is recorded in ADR 0020, instructions and the execution guide. Unit discovery/coverage,
  production Compose/preload, migrations, catalogs and the overlapping Market story are unchanged.

## Plan Change Log

- 2026-10-11: The owner explicitly renegotiated implementation language with "Use typescript
  tambem para esses arquivos". D-040 renews the frozen intent before typed implementation,
  retaining all previous guarantees and permitting only presentation normalization of the
  renewed block. The previous block hash was
  `9b89e273d15367ed65863b905668f129369f935d16ed5a4c8d4b457061c6f32f`.
  The formatting handoff finding remains historical; it is superseded by this user-directed
  renewal, not by disabling hooks or changing acceptance criteria. The supplemental typed plan
  is [the TypeScript plan](plan-typescript-integration.md).

- 2026-10-11: Owner-directed migration accepted for autonomous execution. The plan is larger
  than the usual compact target because preservation of sixteen mature campaigns is essential;
  the supporting inventory keeps scenario detail separate. No implementation scope was dropped.
- 2026-10-11: The earlier Code Map estimate of 1,029 static assertions was textual. Independent
  TypeScript AST inspection established 929 direct assertion calls plus 13 semantic assertion
  helper calls (942 total), with embedded child-process assertions inspected separately. All 347
  static SQL literals remained byte-identical after migration. This corrects the evidence estimate,
  not the frozen preservation intent or scenario scope.

## Review Triage Log

- `medium` / `patch` — Quick review found arrow-function custom assertions, `globalThis.fetch`
  and aliased global fetch references accepted by the integration ESLint rules. The parent reproduced
  all three through `ESLint.lintText` with zero errors. Extend the existing selectors and their
  regression inputs without changing production or campaign behavior.
- `medium` / `rejected` — Quick review confirmed the approved frozen table fails Prettier. A fix
  editing this build's locked plan is prohibited by the workflow; the main planning artifact remains
  outside all commits, without ignores, formatter exceptions or weakened hooks. The 69 other changed
  files pass the parent's unchanged Prettier check. This does not claim a clean local tree or a passing
  broad local formatting command while the uncommitted artifact exists.
- `low` / `patch` — Parent handoff inspection found the Market plan links to the main migration
  plan that must remain uncommitted. Replace that link with the committed preservation inventory
  and execution guide so the committed documentation does not contain a missing relative target.

## Design Notes

The owner's subsequent D-040 requirement supersedes the original ESM JavaScript design choice:
use TypeScript throughout integration with strict compiler checks. Lifecycle belongs to shared
Testcontainers support, not sixteen bespoke managers.
Only genuinely independent HTTP dependencies are intercepted; live services and product processes
remain real. A Vitest test may retain a sequential multi-step campaign, but all setup and assertions
run inside its reported lifecycle. Use explicit integration includes; never globally remove unit
`--dir src`. Build compiled application artifacts once before the full integration suite.

## Verification

- Parent independently reran lint, typecheck, unit tests, build and coverage after the final
  cleanup changes in session `61409`: exit 0; 1,316 unit tests across 126 files passed and every unchanged
  workspace coverage floor passed. The pre-existing nonfatal 536.96 kB CityScene warning remains.
- Latest independent focused support verification, session `33505`: exit 0; 21 tests across four files
  passed. Native one-shot state checks cover successful/nonzero exits and pending running,
  paused and never-started containers; adapter checks preserve ownership and bounded deadlines.
- Focused scheduled alias, session `40467`: exit 0; the complete scheduled collection and
  SIGTERM/restart journey passed in 40.268 seconds after the fixture corrections below.
- The complete integration command passed in session `14314`: exit 0, 37 tests across 20 files,
  zero failed/pending tests, 674.15 seconds. JSON execution timestamps are 2026-10-11
  06:08:42.495–06:19:56.651 UTC. Actual verbose completion output is chunk `0e7372`; the complete
  machine-readable result is `/tmp/rei-vitest-evidence.if6KGX/full-integration.json`. It records
  sixteen passing real-service campaigns and 21 passing support/cleanup cases, not inferred
  discovery progression. Two final teardown-only corrections followed their full-run campaign
  execution and are verified separately below; comment repairs were independently AST-identical.
- Final latest-code Audit/Resumable verification, session `64238`: exit 0, both real campaigns
  passed in 133.76 seconds (Audit 92.489 seconds; Resumable 40.007 seconds). Actual JSON timestamps
  are 06:20:08.052–06:22:21.819 UTC and report is
  `/tmp/rei-vitest-evidence.if6KGX/final-cleanup-campaigns.json`; final output is chunk `efd239`.
  This run verifies the final publisher/connection cleanup aggregation changes, not just discovery.
- Latest implementation lint session `30133` passed after all comment and teardown corrections.
  Final read-only Docker checks found no campaign-owned `rei-` containers or labeled volumes;
  pre-existing foreign repositories' stopped resources were left untouched.
- Independent discovery session `5696` returned exactly 37 cases in 20 files without fixtures.
  Every existing focused alias also passed discovery. An actual negative discovery command with
  `__unregistered_integration_probe__` returned exit 1 and `No test files found`, without fixtures.
- Changed implementation/docs/config files and the preservation inventory pass Prettier;
  editable main-plan prefix/suffix match Prettier output. The approved frozen table does not,
  and its original bytes are intentionally retained. No ignore or rule exception was introduced.
  The existing pre-commit `prettier --write` would rewrite those locked bytes if this planning
  artifact were committed normally; the owner must resolve that handoff without weakening hooks.
- Focused Markdownlint using unchanged repository rules passed all thirteen changed documents.
  The broad CLI expands generated BMad globs and retains the unrelated 1,377 baseline errors;
  this is separate from the frozen-table Prettier limitation.
- `git diff --check` passed. Final `gitleaks git --redact --no-banner` passed, scanning 156 commits
  and 7.19 MB with no leaks. No `.env*`, commit, push, VPS or real source was accessed; the
  implementation agent did not stage files. The parent separately staged session-owned paths.
  The parent reran the unchanged staged-secret gate after the Audit URI correction: exit 0,
  718,771 bytes scanned with no leaks, without an ignore or rule suppression.
- Independent preservation comparison found all 347 SQL literals byte-identical and migrated
  expectation counts no lower than the original direct assertion counts, with Market's 43 checks
  unchanged. Production Compose/preload, migrations, coverage scripts and catalogs were not edited.
- The exact implementation-owned path list, including paired old/new campaign paths, is
  `/tmp/rei-vitest-evidence.if6KGX/implementation-changed-paths.txt`. It excludes the preserved
  overlapping Market application/domain/contracts/infrastructure implementation.

### Complete-suite campaign results

These are actual passing assertion-result rows from the final JSON, with durations rounded to
milliseconds. The four remaining result files contain 9 fixture, 4 HTTP/network, 2 ESLint convention
and 6 source-cleanup cases, all passing.

| Campaign                   | Result | Duration  |
| -------------------------- | ------ | --------- |
| Audit tracer               | Passed | 87.433 s  |
| Collection resilience      | Passed | 23.521 s  |
| Listing provenance         | Passed | 26.314 s  |
| Locations                  | Passed | 24.508 s  |
| Market contracts           | Passed | 17.006 s  |
| Properties contracts       | Passed | 15.860 s  |
| Properties history upgrade | Passed | 25.639 s  |
| Properties history         | Passed | 103.187 s |
| Properties ingestion       | Passed | 164.583 s |
| RabbitMQ healthcheck       | Passed | 6.730 s   |
| Resumable collection       | Passed | 39.832 s  |
| Scheduled collection       | Passed | 37.128 s  |
| Snapshot lifecycle         | Passed | 12.844 s  |
| Snapshot reparse           | Passed | 24.062 s  |
| Source register            | Passed | 25.451 s  |
| Synthetic collection       | Passed | 27.554 s  |

### Correction chronology

- The first complete attempt was cancelled after a mechanical rewrite confused a local callback
  named `fetch` with HTTP fetch and stalled an admission latch. Renamed it `beforeFetch`, retained
  both-entry admission/lookup scenarios and corrected the codemod. Exact cancelled history
  resources were removed and independently checked absent. That run is not passing evidence.
- Session `82635` completed with 34 of 35 tests passing in 704.24 seconds; scheduled collection
  alone failed at its retained migration wait. The exact owned migration had already exited 0,
  but Docker Compose 2.40.3 `wait` only selected running containers. A fresh owned reproduction
  confirmed `exited 0` followed by the same command failure; both projects cleaned up exactly.
- The retained wait now resolves project/service labels including exited containers and uses
  Testcontainers' public one-shot exit strategy. Per-stage environment overrides are forwarded,
  preserving the delayed-worker checkpoint/SIGTERM scenario. Two focused regressions were added.
- Nested cleanup now aggregates all release failures and thrown falsy values. The final broker
  cleanup also retains release failures alongside post-cleanup verification failures. Strict deep
  comparisons remain `toStrictEqual`, and polling preserves original intervals/deadlines/values.
- A final read-only paired diff identified stale source-position comments from the cleanup
  printer. Removed the accidental URL/SQL fragments without changing executable expressions;
  the codemod now omits comments when printing generated nested replacements. Audit's fixture
  PostgreSQL URI now uses URL field assignments, preserving runtime values while satisfying the
  unchanged staged-secret rule; no suppression or ignore was added.
- Screened comments in all sixteen campaigns. Restored 87 original annotation lines at their
  relevant scenario locations in seven transformed campaigns, removing misleading duplicates and
  source-position attachments. Independent TypeScript structural AST comparisons against the
  staged pre-repair files were identical in all seven; no SQL, assertion or executable body changed.
- The final release audit replaced Audit's publisher `Promise.all` and Resumable's ignored close
  `Promise.allSettled` with `cleanupAll` callbacks. Every release now runs and every rejection is
  retained; the existing multiple-release/falsy-primary regression covers this call pattern. The
  concurrent product scenarios and their asserted `Promise.allSettled` results were not changed.

### Matrix and acceptance evidence

| Approved scenario    | Concrete verification                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery            | Explicit integration includes collect sixteen campaign files and four support/cleanup files; `passWithNoTests: false` rejects empty discovery. Every focused alias is checked with `vitest list --json`, without fixture setup.                                                                                                 |
| Real service journey | All sixteen complete campaign bodies use real PostgreSQL, RabbitMQ and/or MinIO as originally required; preservation inventory covers every scenario, 942 original assertion sites and all 347 unchanged SQL literals.                                                                                                          |
| Fault and restart    | Audit delivery faults, collection resilience/restart, resumable and scheduled SIGTERM checkpoints, snapshot interruption/cancellation and history admission/replay races retain real commands and durable SQL effects. Fresh-process restart probe imports compiled production modules, not Vitest.                             |
| Upgrade              | Properties history upgrade retains historical schema/data and current migration assertions; Locations retains migration replay/restart and two genuinely fresh compiled import-order processes.                                                                                                                                 |
| HTTP                 | `support/http.test.mjs` proves malformed wire queries, expected error bodies, bodyless POSTs, correlation headers and AbortSignal cancellation; campaign expectations cover real API/management status, body and state effects.                                                                                                 |
| External dependency  | Nock regression consumes an exact synthetic scope, rejects an unmocked outside host and fails/clears unfinished mocks. Owned endpoint registration keeps real service semantics live.                                                                                                                                           |
| Cleanup              | Fixture regressions prove partial-start cleanup, exact label queries, readiness failure, teardown failure, leakage failure and combined causes. Nested release tests execute later releases after earlier failures and preserve undefined, false, zero and empty-string throws; source cleanup retains all five original cases. |

The future-test convention is additionally exercised through ESLint's API: prefixed/unprefixed
built-ins and static/dynamic/CommonJS variants fail, as do custom assertions, manual HTTP and
promisified process harnesses. Native expectations remain accepted. Unit discovery and existing
coverage thresholds are unchanged; the complete integration command builds production artifacts
once and runs only the explicit integration configuration.

### Final D-040 completion — 2026-10-11

The owner-directed TypeScript renewal resolves the historical frozen-table formatting handoff:
both renewed immutable blocks retain their approved hashes and the main plan passes unchanged
Prettier and Markdownlint rules. The earlier exclusion from commits is superseded, without an
ignore, rule exception or hook bypass. This plan is included in normal final documentation commits.

Independent parent session 93554 passes lint, recursive and strict integration typecheck,
1,316 unit cases in 126 files, build and all unchanged coverage floors. Final typed session 96246
passes every real campaign and support case: 37 tests / 20 files, zero failures or pending cases,
646.58 seconds. Actual report: `/tmp/rei-typed-final-ChFnDG/integration.json`; actual UTC span:
07:24:34.701–07:35:21.281. Every assertion-result row passes, including the legacy snapshot reparse.
No campaign-owned or Testcontainers resources remain; the thirteen unrelated containers and
eight labelled volumes match the pre-run inventories. All sixteen TypeScript SQL sequence hashes
and expectation counts match baseline. Frozen install, changed-file formatting, scoped Markdown
and history secret scanning also pass under unchanged rules.

The renewed Quick review has no findings, patches or deferrals. Historical review findings and
correction chronology remain above; all implementation fixes are verified in this final typed run.
The final typed plan records compiler inclusion, the deliberate negative probe, focused discovery,
process isolation and the complete actual results. No VPS, production deployment, real source,
owner stash or push is involved. The existing web chunk warning and generated-render Markdown
findings remain explicitly recorded baseline caveats.

The owner-authorized local commit grouping separates the preserved Market implementation
(`a0fec00`), native typed campaigns/configuration (`4680370`) and final normative documentation.
Normal hooks pass, with no bypass or push. Both migration plans are built; story 4.1 is accepted
as done by the autonomous orchestrator after its actual verification. The broader initiative
and VPS-dependent work are not claimed complete.
