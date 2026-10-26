---
title: 'Scheduled collection in production'
type: 'feature'
ticket: '12'
created: '2026-10-26'
status: 'built'
baseline_revision: 'f672ecb2f78c51b5b67d9da5c2c088a3f5d21129'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The live stack has no collected synthetic dataset or observed scheduled production
run. The existing fixture adapter selects only October, so its current CLI cannot seed the
versioned historical dataset required by downstream production acceptance.

**Approach:** Add the smallest owner seed command that collects the existing monthly dataset
chronologically through the current collection service, then enable the existing synthetic
schedules and observe actual durable runs and a corresponding Tempo trace on the host.

## Boundaries & Constraints

**Always:** Preserve source review, suppression, sanitization, raw storage, idempotency, checkpoints,
outbox and bounded cleanup. Reuse existing application services and Nest command composition.
Keep the default adapter cycle and normal scheduler behavior unchanged. Only synthetic sources.
One heavy job at a time on the 8 GB / 2 vCPU VPS; keep landing available. Production uses host Docker.

**Never:** Read/search/edit `.env*`, expose secrets, fabricate completed runs or insert derived
Properties/Market rows directly, activate real sources, change history/ADRs, reset active schedules,
raise timeouts or bypass hooks. Manual branch publication needs no PR, merge or remote CI.

## I/O & Edge-Case Matrix

| Scenario            | Input / State                                        | Expected Output / Behavior                                                               | Error Handling                                                |
| ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Historical seed     | Existing dataset, enabled synthetic portals          | Chronological monthly/source runs persist actual snapshots, parsed events and completion | Fail with categorical error; preserve committed progress      |
| Resume              | Same dataset version and operation keys              | Existing completed runs replay without duplicate effects                                 | Preserve checkpoint/idempotency rules                         |
| Cycle selection     | Existing monthly cycle or invalid/cross-cycle cursor | Selected bytes match dataset; default stays October                                      | Reject unknown cycle and cross-cycle cursor                   |
| Production schedule | Enabled synthetic source, idle due schedule          | Worker produces completed record with identities/counts and a Tempo collection span      | Diagnose a concrete failed stage; do not reset in-flight work |

</intent-contract>

## Code Map

- `packages/infrastructure/src/collection/synthetic-sao-paulo-listing-source.ts` and its test:
  constructor currently takes delay only; fixed `2026-10` cycle/cursor. Add an optional validated
  dataset cycle argument, default unchanged. Reuse the exact existing bytes/parser/admission.
- `apps/worker/src/collection/resumable-collection-command{,.module}.ts`: reuse command lifecycle,
  `readCollectionCommandConfig`, telemetry and provider tokens. The module owns real storage,
  source register, transactions, identifiers, clock and outbox; no worker/scheduler is started by it.
  A seed command may construct `CollectSourceRun` with these existing providers and a per-cycle
  `ResilientListingSource`, without another persistence or storage implementation.
- New `apps/worker/src/collection/seed-synthetic{,-command}.ts` and focused command tests:
  seed all dataset runs/source IDs in catalogue order, stable version/cycle/source operation keys,
  one run at a time, cancellation and existing deadlines/cleanup. No clock override. Require all
  intended sources enabled before mutation; use existing owner enable CLI before execution.
- `apps/worker/package.json`: add the owner seed script using the normal OTel preload.
- `SYNTHETIC_SAO_PAULO_DATASET` and version in infrastructure are immutable fixture inputs.
  `buildSyntheticSaoPauloReplay` has no persistence and must not fake collected runs here.
- `integration/scheduled-collection.integration.test.ts`: existing SQL readback oracle for
  request/run/observations/inbox/slot; do not run its isolated Compose stack for public acceptance.
- `docs/operations/deployment.md`: append concise seed/schedule operation and actual evidence.
- Root `infra/portfolio` protected configuration/compose/`rei_sql` are existing host mechanisms;
  parent operates them after reviewed commits. No unrelated infrastructure edits are planned.

## Tasks & Acceptance

- [x] Extend and test explicit historical fixture selection without changing default behavior.
- [x] Implement and test the seed owner command, reuse real collection service and composition.
- [x] Add script and concise operation instructions; keep records in this plan/runbook.
- [ ] Parent reviews/gates/commits, builds only affected images serially, records recovery and
      exact delivered revision, and activates scoped host services after verified backup.
- [ ] Parent enables three owned portals using the existing CLI, seeds the dataset, safely enables
      idle schedules, and records actual run, observation, request/inbox and Tempo identities.

**Acceptance Criteria:**

- Given the real deployed stack, when the seed command completes, then the versioned synthetic
  months and sources have real completed collection runs and raw/parsed evidence; replay adds no
  duplicate observations or events.
- Given enabled due synthetic schedules, when the deployed worker polls, then a run completes with
  the expected three source listing identities, correct counts, one request/inbox effect, cleared
  slot and future next run; its collection trace is retrievable from the existing Tempo backend.
- Given the unchanged landing and other projects, when public readiness and landing are checked,
  then both remain available and only this application's resources were changed.

## Implementation Notes

Full route: estimated above 100 implementation/test lines. Implementer runs focused tests only;
parent owns broad gates, review, commits and production operations. Prerequisite collection plans preserve
fixed synthetic retention, permission checks, durable checkpoints, holds, scheduled request keys
and telemetry; no second executor or general audit is needed. Parent alone performs production.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Independent Quick review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Seed receipts are suppressed by Nest's global log levels — verified in
    the installed `Logger.registerLocalInstanceRef` and `ConsoleLogger.log`; the command needs
    an independent explicitly enabled receipt logger and an emission regression. The original
    implementer replaced the command logger with an explicitly configured `ConsoleLogger`; the
    regression reproduced zero receipts before the fix and observes all 78 seed/replay receipts
    after it, while Nest global logging remains restricted.
  - `[medium]` `[patch]` Native production acceptance remains unobserved — the unchecked parent
    tasks accurately describe the remaining work. Execute the already planned reviewed deployment,
    seed/replay, native scheduler/Tempo and HTTPS readbacks before marking this story done. This
    is a pending evidence obligation, requiring actual operation rather than another code layer.

## Verification

- First run the directly affected adapter/command tests; then affected collection wiring tests.
- Parent runs required lint, strict typecheck, unit/coverage and build gates serially on final code;
  reuse unaffected workspace coverage and prior native campaigns where code/dependencies permit.
- Prove historical seed and replay with actual host storage/DB/outbox consumers; inspect source
  metadata, all monthly run counts, retained snapshots and absence of real-source enablement.
- Observe one native scheduled run and its persisted identifiers/Tempo span; record exact
  production images, UTC, readiness and landing. Do not infer success from a CLI exit alone.
- Scoped formatting, Markdownlint, whitespace, independent Quick review and normal commit hooks.

## Implementation Evidence

- Historical adapter focused tests: 23 passed, including all 13 cycles' exact fixture bytes,
  parser behavior, admission suppression, unknown cycle and cross-cycle cursor rejection.
- Worker focused tests: 30 passed across seed command, existing resumable command, resilience
  composition and fixture source router. Seed tests exercise the actual `CollectSourceRun` with
  in-memory unit ports: 39 completed runs, 115 parsed observations, exact stored bytes, committed
  checkpoints, interruption/retry and replay without additional observations, objects or events.
  These unit checks do not claim PostgreSQL/S3 or public production acceptance.
- The 115-observation total reflects `COB-VM-001` being absent in April and May 2026.
- Affected infrastructure and worker builds passed; scoped ESLint passed.
- The seed reuses the existing 30-second default deadline per run, without raising configuration;
  catalogue execution is sequential. The command starts no scheduler or worker consumers.
- Parent retains broad gates, independent review, commits, host backup/deployment, schedule
  activation and actual database/raw-storage/Tempo/public acceptance evidence.

## Parent Verification

- Repository lint and strict workspace plus integration typecheck passed on the changed tree.
- The matrix's historical seed, replay/resume and cycle-selection rows are covered by the
  23 adapter and 30 focused worker tests reported above. Real production schedule evidence is
  deliberately pending activation; no unit result substitutes for that acceptance row.
- Existing full checks at `37edd6ce638f4f94faff21446d7c12640fc6922e` remain valid for unchanged
  domain, application, contracts, API, AI and web code/dependencies. The two changed workspaces
  receive full unit coverage with unchanged thresholds. Prior browser campaigns remain preserved.

- Affected full coverage passed: infrastructure 567 tests, 84.12% statements / 77.16% branches;
  worker 255 tests, 93.54% statements / 82.73% branches. Mandatory thresholds unchanged.
- Full repository build passed after strict typecheck; logs are `/tmp/rei-seed-{lint,typecheck,
coverage,build}.log`. Only one heavy check ran at a time.

## Auto Run Result

- Implemented the owner-only historical seed with optional validated adapter cycle selection,
  actual collection services and stable replay keys. The executable retains the OTel preload.
- Changed adapter, worker command/entry/script, their focused tests, this plan and the existing
  deployment runbook. No dependencies, migrations, scheduler behavior or product UI changed.
- One medium code patch applied (receipt logger); one medium operational evidence obligation is
  still pending parent activation. No deferred or rejected findings. Targeted inspection confirms
  `ConsoleLogger` owns its explicit levels independently of Nest's static `Logger` configuration.
- After the correction, seed tests passed 13/13, scoped ESLint and worker build passed, and the
  complete worker coverage passed 256 tests with 93.54% statements and 82.73% branches. Reused the
  unchanged infrastructure coverage, repository lint, strict typecheck and full build above.
- Follow-up code review recommendation: false; the reproduced logging risk has a direct emission
  regression and no unverified code risk remains. Production acceptance remains open below and
  is not inferred from these checks. The story is built, not accepted or done.
