---
title: 'TypeScript integration campaigns'
type: 'chore'
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
deferred: []
context:
  - '/workspace/CLAUDE.md'
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/CLAUDE.md'
  - '/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md'
  - '/workspace/.claude/skills/nestjs-modular-monolith/references/testing-patterns.md'
  - '/workspace/repos/real-estate-intelligence/_bmad-output/initiative-real-estate-intelligence/plan-vitest-integration-standard-preservation.md'
---

# TypeScript Integration Implementation Plan

> For agentic workers: implement task-by-task with the active BMad implementation handoff.
> The superpowers execution skills are unavailable; BMad supplies the execution workflow.

**Goal:** All integration code uses TypeScript with genuine strict checking and unchanged guarantees.

**Architecture:** Native Vitest campaigns use shared Supertest, Testcontainers and Nock support.
Independent probes execute erasable TypeScript in fresh Node 24 processes, loading compiled product
code. No production architecture or data behavior changes.

**Tech Stack:** TypeScript 6.0.3, Vitest 4.1.11, existing pinned integration libraries, pnpm.

<frozen-after-approval reason="owner explicitly adds TypeScript; autonomous execution authorized">

## Intent

**Problem:** The owner explicitly requires TypeScript for `integration/`, extending D-039.
**Approach:** Convert every campaign, helper and probe, type the boundaries, add a strict compiler
gate and update all discovery/scripts/conventions. D-040 is recorded before implementation.

## Boundaries & Constraints

**Always:** Keep all sixteen campaigns and 21 support/cleanup tests, SQL, HTTP counts, assertions,
failure/restart/upgrade behavior, real PostgreSQL/RabbitMQ/S3, exact fixture ownership and full
cleanup aggregation. Preserve the overlapping Market story and existing dirty changes. Extend
`tsconfig.base.json` without relaxing its strict flags; noEmit, composite false, declaration false,
NodeNext, node types, allowImportingTsExtensions, erasableSyntaxOnly and verbatimModuleSyntax fit
Node 24 probes. Add only used pinned root type dependencies. Type unknown data via public parsers
or specific local evidence shapes. D-012 overrides skill Jest/ORM advice.

**Never:** Explicit any, ts-nocheck/ts-ignore, ambient wildcard modules, fabricated generic
JSON types, blanket double casts, dropped checks, relaxed compiler/lint/coverage gates. No
Node test/assert/manual HTTP or process harnesses. No `.env*`, owner stash, VPS, deploy/push,
real sources, commits or staging by the implementer. Do not change production or immutable
previous plan intent. Only the parent commits when all work is genuinely verified.

## I/O & Edge-Case Matrix

| Scenario          | Input / state                                      | Expected behavior                                 | Failure behavior                         |
| ----------------- | -------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| Compiler          | Every campaign, helper, probe and config           | Included in strict root typecheck                 | A deliberate type mismatch fails         |
| Discovery         | Root and focused aliases                           | Same 37 cases / 20 files; no probes               | Empty filter fails                       |
| Real journeys     | Existing SQL, faults, upgrades and HTTP            | All sixteen campaigns pass unchanged              | Original failures remain visible         |
| Process isolation | Restart and both import orders                     | Fresh Node processes, compiled production imports | Missing state/imports fail parent Vitest |
| Support           | HTTP cancellation, mocks, staged setup and cleanup | All 21 support cases pass                         | Primary and every cleanup cause retained |

</frozen-after-approval>

## Code Map

- `integration/` currently contains 28 mjs/cjs files: 16 real campaigns, four test files,
  six support helpers and two probes. Convert all to `.ts` (a `.cts` probe is permitted if needed).
- `integration/support/fixture.mjs` — typed minimal injectable lifecycle interfaces must match
  Testcontainers and test doubles without casting a partial mock into a whole runtime client.
- `integration/support/http.mjs` — preserve literal URLs, non-2xx, bodyless POST, headers and
  cancellation. Return unknown JSON by default; campaign parsers or specific evidence types apply.
- `integration/fixtures/` — use `.ts` imports for Node stripping; createRequire may preserve
  synchronous compiled CommonJS import order. Keep children free of Vitest imports.
- `vitest.integration.config.mjs`, `package.json`, `eslint.config.js`, `pnpm-lock.yaml` — rename
  config to `.ts`, preserve all aliases, add `typecheck:integration` and chain after recursive
  typecheck. Extend existing integration lint selectors/regression tests to TS; no rule weakening.
- `docs/testing/integration.md`, `docs/testing/coverage.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`,
  ADRs 0004/0020 — use documentation-writer for runnable TypeScript guidance. Update D-040 record
  in ADR 0020, replacing its now-superseded JavaScript option without erasing history.
- Existing compiled `.d.ts` artifacts are available; build before standalone integration checking
  if needed and document that dependency. Root recursive typecheck currently builds packages.

## Tasks & Acceptance

- [x] Capture current SQL and expectation counts before edits; preserve equivalent bodies.
- [x] Add strict `tsconfig.integration.json`, pinned used `@types/node` 24.19.2,
      `@types/supertest` 7.2.1 and `@types/amqplib` 0.10.8 if used, plus root compiler script.
- [x] Convert shared support and type lifecycle injection, process results, HTTP/options and errors.
- [x] Convert all campaigns and probes; use contract parsers and specific evidence shapes, not
      a recursive arbitrary-property JSON type that makes every property silently legal.
- [x] Rename Vitest config, update every script/reference, enforce typed integration conventions.
- [x] Update normative docs and append implementation/evidence here and to preservation inventory.
- [x] Run lint, root typecheck, units, build, coverage, full real integrations, frozen install,
      discovery, negative compiler probe, unchanged formatting rules and exact owned cleanup checks.

Given any file under integration, when compiler files are enumerated, then it is a TypeScript
file included in strict checking; no JS sources or disabled checks remain.
Given the previous campaign inventory, when the complete suite runs, then all 37 original cases
pass with no skipped cases and original SQL/assertion guarantees preserved.

## Implementation Notes

Prior JS verification is baseline only: parent session 61277 passed all five general gates and
37 integration tests / 20 files in 661.85 seconds. This was baseline evidence at the TypeScript
implementation handoff, not evidence for the typed sources.

TypeScript implementation converts all 28 integration sources and the root configuration, with
unknown HTTP JSON, public contract/domain parsers, specific SQL/event/CLI projections and minimal
injectable Testcontainers lifecycle interfaces. Native Node 24 probes retain compiled production
imports and synchronous CommonJS import-order loading through `createRequire`, without Vitest.
The root typecheck includes the unchanged strict integration project. No production source,
base compiler options, unit discovery or coverage floors were changed.

The owner-approved root test-only `@aws-sdk/client-s3` devDependency uses infrastructure's exact
3.922.0 pin so fault injection is checked against genuine SDK types. Runtime loading remains
`createRequire` relative to the infrastructure manifest, not a new product SDK boundary. The
late-put fault temporarily intercepts the actual SDK prototype and delegates to the original
method; no fake SDK client or blanket cast hides the overload boundary.

An independent parent audit caught one accidental non-null marker inside a synthetic SQL literal.
It was removed and the original whitespace restored; final byte-preservation evidence must use
the corrected sources. The initial recursive compiler rerun also exposed a callback definite-
assignment declaration after ESLint cleanup; the declaration is corrected and the gate rerun.
These initial checks are not reported as successful final verification.

## Plan Change Log

The owner's language addition renews the existing migration before commit. No approval wait is
needed under the original autonomous instruction. Parent review must audit casts and unknown data.

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free Quick reviewer inspected the complete baseline diff,
  acceptance criteria and applicable instructions; independently passed strict integration
  typecheck and all 21 support/cleanup tests. No patches or deferred entries are required.

## Verification

Commands: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`,
`pnpm run test:coverage`, `pnpm run test:integration`, `pnpm run test:integration:list`,
`pnpm install --frozen-lockfile`; every required gate must pass. JSON suite reports must show
all actual results, not infer success from discovery. Report actual sessions and residual risks.

### TypeScript implementation checks — 2026-10-11

- Final root lint and recursive typecheck plus `typecheck:integration` pass in session 75470;
  `/tmp/rei-typescript-lint-final.log` and `/tmp/rei-typescript-typecheck-final.log` contain the
  actual command output. The earlier compiler failure is superseded by this corrected rerun.
- Session 14630 completes all 1,316 unit tests across 126 files, production build and unchanged
  workspace coverage gates. Logs: `/tmp/rei-typescript-units.log`,
  `/tmp/rei-typescript-build.log`, `/tmp/rei-typescript-coverage.log`. The production build retains
  its existing web chunk-size warning; no warning threshold was changed.
- `pnpm install --frozen-lockfile` passes with the current pins and lockfile in session 75470;
  `/tmp/rei-typescript-frozen.log`. Compiler file enumeration in session 34426 includes all
  28 integration sources and `vitest.integration.config.ts`, with no JavaScript integration
  sources left; `/tmp/rei-typescript-files.log`.
- Focused support/cleanup execution passes all 21 cases in four files, with no skips, in 6.79s
  (session 32349, `/tmp/rei-typescript-support.log`). Root discovery reports 37 cases across
  20 files (session 74899, `/tmp/rei-typescript-discovery.log`); this is discovery, not campaign
  execution evidence. All fifteen focused aliases resolve their original nonempty selections
  (history: two cases; source-register: seven including six cleanup cases; every other alias: one)
  in session 97915, `/tmp/rei-typescript-focused-discovery-final.log`.
- A temporary included source declaring a string with numeric value makes the strict integration
  compiler exit 2 with TS2322 (session 28741, `/tmp/rei-typescript-negative.log`). The probe is
  removed. An absent test filter exits 1 with `No test files found`, without starting services;
  `/tmp/rei-typescript-empty-filter.log`.
- Formatting passes for all changed integration sources, configuration, manifest, normative
  documents and evidence plans; `/tmp/rei-typescript-format-handoff.log`. The installed
  `markdownlint-cli2 --no-globs` command checks all nine implementation-owned Markdown files
  directly and passes with zero errors under unchanged repository rules;
  `/tmp/rei-typescript-markdown-handoff.log`. The parent independently checks fourteen changed
  Markdown files with the same CLI flag and obtains zero errors. The unfiltered
  `pnpm run lint:md` remains non-green because its existing root glob includes generated
  `_bmad/render` files (1,377 findings; `/tmp/rei-typescript-markdown-final.log`); none concern
  these changed documents, and no rule was relaxed.
- Parent AST audits confirm the exact SQL-literal sequence hashes and expectation-call counts
  of all sixteen campaigns match the pre-TypeScript inventory after the synthetic SQL correction.
  This static preservation evidence does not stand in for running the campaigns.

The initial typed real-service suite completes in session 64614 with 36 passed cases and one
failed case across 20 files (19 passed, one failed), no skips, in 767.34s; actual console output is
preserved in `/tmp/rei-typescript-campaigns.log`. The failure is at the legacy correction in
snapshot-reparse: the test-side public canonical parser's default rejects the campaign's intentional
empty acquisition fingerprints. That fixture adaptation now uses the parser's existing
`allowEmptyFingerprints=true` option only in the revised parser, preserving the legacy input and
production validation. Other newly added canonical-parser calls were audited: they use the original
nonempty seed or sanitized private fixtures with an explicit fingerprint, not legacy empty inputs.
The focused real rerun passes its complete campaign in session 52253: one test in one file,
no skips, 24.36s, exit 0. Actual output is in `/tmp/rei-typescript-snapshot-reparse-rerun.log`;
`/tmp/rei-typescript-snapshot-reparse.json` independently reports success, one passed test,
zero failed/pending tests and the actual passed campaign result. Post-correction strict integration
typecheck, root lint and formatting pass in session 29994; logs are
`/tmp/rei-typescript-typecheck-handoff.log`, `/tmp/rei-typescript-lint-handoff.log` and
`/tmp/rei-typescript-format-handoff.log`.

Read-only Docker checks after the full run and focused rerun (`/tmp/rei-typescript-cleanup.log`)
find no `rei-` campaign containers,
Compose-project-labelled volumes or networks, or run-created Testcontainers containers. Existing
unrelated project resources and five anonymous volumes were left untouched; all five anonymous
volumes have creation timestamps earlier than the first typed run. No prune or broad deletion was
used. This confirms the owned runs cleaned up, not that the failing initial suite passed.

The parent's final post-correction runtime-erasure and AST audit again confirms all sixteen exact
SQL-literal sequence hashes and expectation counts match baseline. Review input is prepared at
`/tmp/rei-typed-review-45Av84/implementation.diff`; no source staging was needed for that audit.

The parent will run the reviewed final full suite with verbose and JSON reporters; the required
actual full JSON report is pending that parent verification, not fabricated from discovery. No
full-suite pass is claimed from the failing initial run or the later focused correction.

### Independent parent gates — 2026-10-11

Post-correction session 93554 exits 0 for root lint, recursive and strict integration typecheck,
all 1,316 unit tests in 126 files, production build and every unchanged coverage floor. Actual logs
are `/tmp/rei-typed-final-ChFnDG/lint.log`, `typecheck.log`, `unit.log`, `build.log` and
`coverage.log`. The independent frozen install also passes, with output in
`/tmp/rei-typed-final-ChFnDG/frozen-install.log`. Both renewed immutable intent hashes match
their approved values after review; the main migration plan now passes unchanged Prettier rules.

### Reviewed complete typed suite — 2026-10-11

Parent session 96246 exits 0 for the complete reviewed command with verbose and JSON reporters:
37 tests across 20 files pass, with zero failed or pending cases, in 646.58 seconds. Actual UTC
execution spans 07:24:34.701–07:35:21.281. The independent report
`/tmp/rei-typed-final-ChFnDG/integration.json` has `success: true`, 37 passed cases and all twenty
actual file results passed; `/tmp/rei-typed-final-ChFnDG/integration.log` contains the transcript.
This final full run supersedes the earlier pending verification and failing initial-run evidence,
which remain above as history. It includes the corrected legacy reparse campaign and both native
TypeScript process probes, all sixteen real-service campaigns and all 21 support/cleanup cases.

The final AST comparison again has sixteen exact SQL sequence hashes and expectation counts
matching baseline. Read-only Docker checks find no owned campaign containers, labelled volumes
or networks, and no Testcontainers containers. All thirteen unrelated project containers and
eight labelled volumes match their pre-run inventories; older anonymous volumes remain untouched.
No production Compose, migration, catalog or base compiler change was required. Final changed-file
Prettier and fourteen-file Markdownlint pass; history scanning reports no leaks in 156 commits.
Actual logs are `format.log`, `markdown.log` and `secrets-history.log` in the same evidence directory.

Quick review reports no findings or deferred work. Every approved matrix row is now verified:
compiler inclusion and its deliberate failure, nonempty/empty discovery, complete real journeys,
fresh-process isolation, and support failure/cleanup aggregation. Existing generated-render Markdown
findings and the web chunk-size warning remain baseline caveats, not newly introduced failures.

## Completion

Reviewed test/configuration sources are committed as `4680370`; the preserved Market implementation
is separately committed as `a0fec00`. Both commits pass normal staged secret, formatting, ESLint
and message hooks without source changes. This built plan and the normative documents are included
in the final local documentation commit. No push is performed, and no VPS-dependent story is
unblocked. The broader autonomous initiative remains unfinished outside this completed change.
