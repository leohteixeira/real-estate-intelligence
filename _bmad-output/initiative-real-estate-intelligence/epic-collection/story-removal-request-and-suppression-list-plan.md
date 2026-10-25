---
title: 'Removal request and suppression list'
type: 'feature'
ticket: '10'
created: '2026-10-25'
status: done
baseline_revision: 'b89971935b5255dd2d2d5b93a091f5737deabac1'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md'
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
  - '/home/vscode/.codex/skills/nestjs-modular-monolith/SKILL.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Collection has a suppression event contract but no removal command or durable
suppression checks. CAP-28 requires removal of stored snapshots/fingerprints and prevents a later
run, redelivery or reparse from restoring them.

**Approach:** Add the owner-only command and permanent source/listing suppression authority,
then reuse existing transactions, outbox/inbox, audit and snapshot deletion/reconciliation.
D-091 settles failure/resumption and minimum retained evidence. Reuse existing source adapters,
fixtures and policy composition; no new context or general cleanup framework.

## Boundaries & Constraints

**Always:** Persist suppression before deletion. Confirm cleanup before reporting completion;
failed/cancelled cleanup remains suppressed and resumable. Check at the earliest discovered stable
identity, before payload persistence/parser/photos and under the commit boundary. Preserve fixed
real expiry, hash/fixture compatibility, unrelated shared-object owners, source permissions and
checkpoint/count/manifest semantics. Collection writes only its schema; platform/audit cleanup
uses owner capabilities. Retain only minimum suppression/audit identity, no collected payload or
fingerprint copies. ADRs prevail over skill examples: explicit SQL, simple services, pnpm/Vitest,
transactional outbox, no direct broker publish. One heavy load at a time on shared 8 GB/2 vCPU VPS.

**Never:** Read/search/edit `.env*`; enable real sources or call models; change production/host,
landing, publication or unrelated modules in this implementation. No public removal HTTP endpoint,
new job, automatic retry, skip, raised timeout, weakened gates or accessibility audit. Properties
and Market derived-data erasure stays in stories 3.12/4.8; current authority must prevent new
suppressed facts. Preserve prior completed stories and their evidence.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                   | Expected Output / Behavior                                                                                          | Error Handling                                                |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Remove                         | Known source/listing with snapshots                             | Permanent suppression, confirmed exclusive-object/content/fingerprint cleanup, one audited suppression event        | No retained collected content                                 |
| Replay / absent listing        | Same valid identity repeatedly, including no prior observations | Same suppression identity/event; no recreation or extra event                                                       | Unknown/invalid source or unsafe args fail categorically      |
| Storage failure / interruption | Delete fails or command is cancelled after suppression          | No success claim; suppression and cleanup progress persist; resumed command completes                               | Existing bounded cancellation/resilience, no hidden retry     |
| Later collection               | Fixture still contains suppressed identity                      | No payload persistence, parse/photo work or parsed publication; valid checkpoint and suppression counts             | Other listings proceed                                        |
| Concurrent collection/reparse  | Prepared upload or parse completes after suppression            | Commit and authority checks prevent resurrection; orphan/late upload becomes cleanup eligible                       | Reparse refuses erased evidence                               |
| Shared synthetic content       | Another unsuppressed listing owns identical bytes               | Target references/evidence removed; other owner and object remain usable                                            | Serialize owner/delete races                                  |
| Unexpired real / orphan        | Owned encrypted reservation precedes observation                | Immediate access refusal and deletion eligibility without changing expiry; new reservation carries listing identity | Do not invent ownership for unidentifiable historical orphans |

</intent-contract>

## Code Map

- `packages/domain/src/collection/collection.events.ts`: existing strict
  `CollectionListingSuppressed` v1 needs no version change. Run model already counts suppressed.
- `packages/application/src/collection/{collect-source-once,collect-source-run,reparse-snapshot}.service.ts`:
  separate acquisition paths and reparse; both collectors store before parse and publish inside a
  transaction. One-shot result assumes one parsed observation; define a truthful explicit refusal
  for a suppressed one-shot rather than fabricating IDs or silently changing its contract.
- `listing-source.port.ts`, `prepare-image-fingerprints.ts`, infrastructure synthetic sources and
  worker source wrapper/router: source page currently combines discovery and payload. Add only
  the narrow admission seam needed to consult suppression once identity is known, before payload
  work, including after waits and before each photograph; do not add a real-source fetch system.
- `collection-run.repository.ts`, `postgres-collection-run.repository.ts` and in-memory fake:
  observations currently require content and support parsed/failed only. Preserve minimal identity
  evidence for suppressed candidates so counts, manifests and checkpoint progress remain coherent
  without retaining a snapshot/URL/fingerprint or misclassifying suppression as failure.
- `raw-snapshot-store.port.ts`, `snapshot-lifecycle.port.ts`, `postgres-snapshot-lifecycle.ts`,
  `s3-raw-snapshot-store.ts`, `ExpireSnapshots`: real reservations precede uploads but lack listing
  identity; deletion currently permits only expired real generations. Reuse durable tombstones,
  fairness and the existing retention job for immediate suppression cleanup and late PUTs.
  Synthetic keys are globally content-addressed: preserve valid owners and existing keys/bytes.
- `postgres-snapshot-reparse.repository.ts`, `postgres-collection.facade.ts` and parsed evidence:
  lock/check current suppression before reservation/publication/authority. Remove owned reparse and
  parsed evidence before observation deletion. Keep run/completed manifest history coherent.
- `migrations/4012_collection_add_listing_suppression.sql` (new): additive suppression/cleanup and
  identity/guard changes. Earlier migrations remain unchanged. Use existing lifecycle metadata
  where adequate; any new durable state must close a demonstrated crash or ownership gap above.
- `packages/infrastructure/src/shared/persistence/postgres-outbox.ts` and
  `packages/infrastructure/src/audit/postgres-audit-event-log.ts`: retained parsed payloads contain
  fingerprints/text. Necessary owner-scoped erasure capabilities must remove matching copies and
  prevent delayed audit delivery from reintroducing them. Audit is currently append-only: narrowly
  document/implement the D-091 privacy exception rather than disabling immutability globally.
- `apps/worker/src/collection/{reparse-snapshot-command,snapshot-reparse-command.module}.ts`:
  reuse strict CLI/deadline/telemetry/cleanup pattern. Existing collection audit consumer needs
  suppression in its subscription and current-authority protection for delayed parsed messages.
- `integration/{image-fingerprints,snapshot-reparse,snapshot-lifecycle,resumable-collection}.integration.test.ts`:
  reusable native owned PG18/MinIO/RabbitMQ fixtures and CLI patterns. No browser path changes.

## Tasks & Acceptance

**Execution:**

- [x] Application suppression port/service and PostgreSQL/in-memory adapters, migration 4012 and
      required module exports — durable identity, ordered resumable cleanup, existing event outbox.
- [x] Both collectors, source admission/photo path, run persistence and reparse/facade guards —
      enforce suppression across affected paths, with coherent minimal manifests and counters.
- [x] Existing snapshot lifecycle/S3/retention paths — explicit listing reservation, immediate
      suppression eligibility, shared synthetic ownership safety and bounded late-write cleanup.
- [x] Owner-scoped platform/audit capabilities and consumer — erase collected copies while keeping
      minimal audit and inbox semantics; prevent delayed messages restoring erased audit content.
- [x] Worker removal command/module/entry, package script and tools-profile Compose service —
      strict source/listing arguments, categorical results, bounded bootstrap/shutdown, no
      scheduler.
- [x] Colocated meaningful unit tests and `integration/listing-suppression.integration.test.ts` —
      every matrix row, actual CLI, persistence/storage/event/audit, failure/resumption and races.
- [x] Existing ADR 0015, Collection epic Notes, operations/testing guide and this plan — D-091,
      exact command, retained evidence and honest downstream/historical limits, no duplicate report.

**Acceptance Criteria:**

- Given owned synthetic collection on the real fixture stack, when the actual removal CLI runs,
  then target snapshots/fingerprints/content copies disappear, the existing event reaches audit,
  repetition adds no event, and a subsequent run containing that identity never restores them.
- Given a deletion fault or concurrent prepared acquisition/reparse, when removal begins and work
  resumes, then suppression survives restart, no erased observation/publication is recreated,
  cleanup can finish and unrelated valid listing ownership remains available.
- Given an unexpired real-category local fixture with explicit generated encryption material,
  when suppression covers a reservation before observation, then reads and commits refuse it,
  cleanup removes its object and late writes reconcile through existing bounded retention.
- Given unchanged source/history/privacy contracts, when affected integration regressions and
  final repository gates run, then accepted fixture hashes, source permissions, fixed expiry,
  run/checkpoint semantics, strict typing and existing coverage floors continue to pass.

## Implementation Notes

- The owner command records the permanent source/listing authority and its existing suppression
  event in one transaction, deletes objects through the configured storage policy, then invokes
  Collection/platform/audit owner erasure and records completion. Faults and cancellation leave
  the same suppression identity incomplete and resumable; repetition never creates another event.
- Minimal `run_listing_identity` rows preserve manifest/checkpoint history without keeping an
  observation, URL, content or fingerprints. Suppressed discovery/preparation/commit candidates
  count as observed/suppressed, and one-shot collection returns an explicit refusal.
- Real generation ownership is explicit before upload, immutable on retry and immediately
  unavailable on suppression with its original expiry. Historical identities are backfilled only
  from proven observations. Synthetic upload ownership commits before PUT, and object advisory
  locks serialize acquisition/deletion while preserving every unsuppressed owner. Permanent
  synthetic cleanup tombstones close the cancelled late-PUT gap through existing retention.
  Existing monotonic selection and SKIP LOCKED behavior remain bounded across both candidate kinds.
- Listing locks precede run-row locks during page commit, matching removal's preservation of
  historical run identities and avoiding a run-FK/listing-lock inversion. Snapshot generation and
  reparse commits follow the same listing-first order.
- Collection does not write foreign schemas. Platform and audit adapters erase their matching
  parsed copies; audit migration 8002 implements the D-091 scoped deletion exception after audit's
  schema exists. The consumer consults current authority, and audit retains its own minimum erased
  identity to reject delayed delivery independently of prunable inbox markers.
- ADR 0015, the epic Notes and existing deployment/testing guides record the exact owner command,
  retained evidence and boundaries. Properties/Market derived erasure remains stories 3.12/4.8.
  Historical real orphans with no attributable observation remain under original expiry; no
  ownership was invented. No real source, model, production service or public endpoint was enabled.

## Plan Change Log

- 2026-10-25: added the necessary audit-owned migration 8002 alongside Collection migration 4012,
  since the audit schema is created later in migration order. This implements the existing D-091
  owner boundary rather than crossing schemas from Collection.

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Shared synthetic metadata can disappear while a valid owner commits —
    verified `eraseCollectedData` deletes raw metadata using observations alone, while synthetic
    upload ownership commits before collection and the observation FK references `snapshot_content`
    (4006). `getSnapshotMetadata` requires the raw row. Thus the object survives but the other
    listing becomes unavailable until recollected. Re-engaged the original implementer to preserve
    valid owners through the existing ownership/object-lock model and prove the interleaving in
    real PostgreSQL. No public surface or new state was added. The original implementer reused
    sorted object locks
    and excluded unsuppressed upload owners from metadata erasure. The deterministic real-PG
    regression failed before the fix and passed afterward, proving both commits, preserved raw
    metadata/content, available facade metadata and unchanged bytes. Parent inspected the patched
    SQL and test barriers; no further review risk remains for this correction.

## Design Notes

Full route: cross-layer privacy/state/storage/concurrency work exceeds 100 lines and five files.
D-091 was recorded in the external append-only decision log before implementation. The domain
boundary is Collection; current transport/audit copies are cleaned through their owners. No new
architecture or unrelated source activation is necessary. Historical unidentifiable orphan
ownership cannot be inferred from its one-way acquisition hash; report that bounded limit.

## Verification

Run serially. Start with focused modified/new colocated tests and the new real-service campaign;
build only necessary package/image prerequisites first. Then affected existing lifecycle, reparse,
resumable, image, synthetic collection and listing provenance campaigns. Use existing image
preparation and fixture
ownership, without starting a default stack. Record exact logs, test names/counts and identities.
The implementer runs these affected checks, no final broad coverage before parent review.
Parent reuses valid receipts and runs final stabilized `pnpm run lint`, `pnpm run typecheck`,
`pnpm run test`, `pnpm run build` and unchanged coverage scripts only for changed workspaces.
Keep all hooks. No repeated product tests for documentation-only changes. Independent Quick review
is mandatory, followed only by targeted demonstrated fixes within the historical review ceiling.

### Implementer receipts — 2026-10-25

Base revision: `b89971935b5255dd2d2d5b93a091f5737deabac1` on `feat/phase-1`;
implementation is uncommitted. No production action or source/model activation occurred.

The necessary package graph is domain → application/contracts → infrastructure → worker.
Worker's tsconfig has no project references, so filtering only worker does not compile those
package dependencies. The stabilized preparation used the dependency closure explicitly:

```bash
pnpm --filter '@rei/worker...' --workspace-concurrency=1 build
pnpm run typecheck:integration
```

Both passed, with five workspace builds in sequence. Logs:
`/tmp/rei-suppression-prerequisites-explicit.log` and
`/tmp/rei-suppression-integration-typing.log`. Emitted code was checked for the full
`run_listing_identity` manifest UNION, explicit real listing ownership, current Collection/audit
checks, listing-before-run lock order and bounded SKIP LOCKED selection before campaign startup.

Frozen runtime inputs SHA-256:
`41cdd10fafd7f055187c70070da24167d783f0427439480c3176fd4bf332081b` (343 files).
Frozen compiled artifacts SHA-256:
`743e84f09a4e3848c6edab7f104178d25c24d95e08c3f9feaee2566892b6b58d` (1,217 files).
The receipts hash sorted relative paths, NUL, exact bytes, NUL for runtime `.ts`/`.json` inputs
under packages/worker excluding test files and dependencies/build output, all migrations,
`compose.yaml`, `pnpm-lock.yaml`; artifacts cover package/worker dist files.
The reproduction/check script is `/tmp/rei-suppression-tree.py`, and its receipt is
`/tmp/rei-suppression-stable-tree.json`. Campaign source SHA-256 under the same framing is
`d78013f9d14d2a9ee84c93ffe2db9220c456a997eabf7d53153a55e87be87772`.
Documentation edits during execution do not change runtime or artifact identity.

Focused units passed: 13 files, 205 tests, 6.08 seconds. Exact command (log
`/tmp/rei-suppression-focused-units-stable.log`):

```bash
pnpm exec vitest run packages/application/src/collection/remove-listing.service.test.ts packages/application/src/collection/collect-source-once.service.test.ts packages/application/src/collection/collect-source-run.service.test.ts packages/application/src/collection/prepare-image-fingerprints.test.ts packages/infrastructure/src/collection/postgres-snapshot-lifecycle.test.ts packages/infrastructure/src/collection/snapshot-lifecycle.test.ts packages/infrastructure/src/collection/completed-event-evidence.test.ts packages/infrastructure/src/collection/postgres-snapshot-reparse.repository.test.ts packages/infrastructure/src/collection/postgres-collection.facade.test.ts packages/infrastructure/src/collection/listing-suppression.test.ts apps/worker/src/collection/remove-listing-command.test.ts apps/worker/src/collection/collection-audit.consumer.test.ts apps/worker/src/collection/collection-resilience.test.ts
```

The native real-service campaign passed 1/1 in 38.25 seconds, log
`/tmp/rei-listing-suppression-attempt4.log`:

```bash
pnpm exec vitest run --config vitest.integration.config.ts integration/listing-suppression.integration.test.ts
```

It includes actual CLI invocation/replay/refusal, confirmed target erasure and retained shared
owner access, audit's narrow mutation exception, delayed parsed delivery after deleting the original
inbox marker, incomplete deletion/resumption, prepared acquisition/reparse, full suppressed
checkpoint/count/completed manifest, real pre-observation ownership/cancellation/fixed expiry, and
late real/synthetic PUT reconciliation. PostgreSQL 18, MinIO and RabbitMQ were real owned fixtures;
no browser path was changed.

Earlier failed preparation is not acceptance evidence. Attempt 1 (17.77 seconds) used a fixture
clock fixed before a real-clock CLI run, so canonical source admission correctly rejected a start
before the admitted frontier. The fixture now uses `max(advanced clock, Date.now())`, including
explicit late-write reconciliation advances. Attempts 2/3 (36.86/41.02 seconds) used stale
infrastructure dist because worker-only build omitted its dependencies; the completed manifest
assertion correctly required the missing suppressed identity. No expectation or timeout was
weakened. The surviving full failure log is
`/tmp/rei-listing-suppression-attempt3-stale-dist.log`; attempts 1/2's same-name log was overwritten
before separate attempt logs were adopted, so their full logs are unavailable. Frozen explicit
preparation above corrected the executor gap before attempt 4.

Affected regression campaigns ran serially with `fileParallelism: false`. The initial selection
command and preserved log `/tmp/rei-suppression-affected-regressions.log` are:

```bash
pnpm exec vitest run --config vitest.integration.config.ts --reporter=verbose integration/snapshot-lifecycle.integration.test.ts integration/snapshot-reparse.integration.test.ts integration/resumable-collection.integration.test.ts integration/image-fingerprints.integration.test.ts integration/synthetic-collection.integration.test.ts
```

Four campaigns passed. Lifecycle failed during its deliberate pre-4006 fixture preparation:
the fixture excluded 4006/4007 but included new 4012, which references `snapshot_generation`
created by 4006. This was fixture ordering, not an upgrade failure. Only that fixture now also
defers 4012, applies the unchanged 4006/4007 to the original legacy records, then applies 4012.
No migration, assertion or timeout was weakened. The four passing campaigns remain valid because
runtime, artifacts and their fixtures did not change. Lifecycle alone was repeated, followed by
the affected listing provenance campaign (its real-category fixture now supplies explicit listing
ownership). Both passed in `/tmp/rei-suppression-lifecycle-provenance-regressions.log`:

```bash
pnpm exec vitest run --config vitest.integration.config.ts --reporter=verbose integration/snapshot-lifecycle.integration.test.ts integration/listing-provenance.integration.test.ts
```

| Campaign             | Valid result | Test time  | Log                                                    |
| -------------------- | ------------ | ---------- | ------------------------------------------------------ |
| snapshot-reparse     | 1/1 passed   | 37,407 ms  | `rei-suppression-affected-regressions.log`             |
| resumable-collection | 1/1 passed   | 275,735 ms | `rei-suppression-affected-regressions.log`             |
| synthetic-collection | 1/1 passed   | 51,838 ms  | `rei-suppression-affected-regressions.log`             |
| image-fingerprints   | 1/1 passed   | 35,553 ms  | `rei-suppression-affected-regressions.log`             |
| snapshot-lifecycle   | 1/1 passed   | 20,519 ms  | `rei-suppression-lifecycle-provenance-regressions.log` |
| listing-provenance   | 1/1 passed   | 268,897 ms | `rei-suppression-lifecycle-provenance-regressions.log` |

All log basenames in the table are under `/tmp/`. The final receipt
`/tmp/rei-suppression-final-tree.json`, generated with `python3 /tmp/rei-suppression-tree.py`,
confirms the same frozen runtime, artifact and new-campaign hashes after all six regressions.
The sole post-freeze test edit was lifecycle's explicit migration preparation described above;
documentation edits do not invalidate the accepted runtime evidence. Final `git diff --check`
passed. All owned campaign services were cleaned up; no production service was touched.

Independent Quick review and final broad lint/typecheck/test/build/unchanged coverage gates remain
owned by the parent and are pending at this receipt. The implementer did not run broad coverage.

### Targeted shared metadata correction — 2026-10-25

Only `postgres-listing-suppression.ts`, the existing suppression integration campaign and this
evidence were changed for the accepted review finding. The new regression first failed against
the prior behavior after both transactions committed: surviving `raw_object` count was 0 rather
than 1. The full RED log is `/tmp/rei-suppression-owner-metadata-red.log` (35,763 ms test time).
No assertion or timeout was weakened. Directly affected checks then passed:

```bash
pnpm exec vitest run packages/infrastructure/src/collection/listing-suppression.test.ts
pnpm --filter '@rei/infrastructure...' --workspace-concurrency=1 build
pnpm exec vitest run --config vitest.integration.config.ts integration/listing-suppression.integration.test.ts
```

Logs: `/tmp/rei-suppression-owner-metadata-units.log` (3/3 tests, 436 ms total),
`/tmp/rei-suppression-owner-metadata-build.log` (four prerequisite builds in sequence), and
`/tmp/rei-suppression-owner-metadata-green.log` (1/1 campaign, 36,600 ms test time, 38.33 seconds
total). The emitted erasure SQL was checked for the surviving unsuppressed upload-owner predicate.
No unrelated campaigns or broad gates were rerun. Final `git diff --check` passed.

The same `/tmp/rei-suppression-tree.py` receipt in
`/tmp/rei-suppression-owner-metadata-tree.json` identifies the corrected version:

- Runtime inputs: `8bd83be01bda63448e303500cdab4997694f40a1b0c01a006dd8eabcdf810eb6`.
- Compiled artifacts: `45c38c41f8e7c6f298ee4e164c04f0d8b1bbf1e9110f2bfbaa4e30c59ca03a8b`.
- Updated suppression campaign: `56c4705f2f66e6368fe091baadf0793d5adb943acb6f4fe2147ff3e918c45e25`.

The earlier frozen receipt remains historical evidence for the prior implementation. This
correction supersedes its suppression-erasure result; final verification of affected dependencies
and broad gates remains owned by the parent after this targeted delivery.

### Parent acceptance audit — 2026-10-25

The parent read the complete 4,145-line unified change, including untracked files, against
baseline `b89971935b5255dd2d2d5b93a091f5737deabac1`. All seven intent matrix rows have
corresponding checks in the passing native suppression campaign and focused unit selection:
confirmed removal; absent/repeated identity; failed/cancelled cleanup and resume; later collection;
prepared collection/reparse; shared synthetic ownership; and unexpired pre-observation real
ownership/late writes. The six passing affected regressions preserve the existing lifecycle,
reparse, resumable manifest, image, synthetic collection and provenance contracts. No browser
behavior changed. Independent Quick review completed with one confirmed medium patch, corrected and
proved below.
The parent also inspected the targeted correction and regression barriers. The six previous
regression receipts remain valid: only the suppression erasure method changed, and those campaigns
exercise unchanged acquisition, retention, manifest, reparse and provenance paths rather than
`eraseCollectedData`. The final updated suppression campaign exercises the changed method and
all seven acceptance rows. No second broad review or repeated dependency campaign is necessary.

### Final parent gates — 2026-10-25

All four required root scripts passed serially with `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1`:
`pnpm run lint` (26.10 s), `pnpm run typecheck` (47.49 s), `pnpm run test` (184.15 s,
233 files / 2,766 tests) and `pnpm run build` (11.62 s). Logs are
`/tmp/rei-suppression-final-{lint,typecheck,test,build}.log`; command receipts are
`/tmp/rei-suppression-final-gates.json`. Strict integration typing is included. Build retains the
existing Vite chunk-size advisory. No check, assertion, deadline or hook was weakened.

Changed-workspace coverage passed in 75.72 s, using the complete `coverage_args` block copied
verbatim from `scripts/test-coverage.sh` and its existing Vitest invocation, filtered only to
application, infrastructure and worker with workspace concurrency 1. Log:
`/tmp/rei-suppression-final-coverage.log`; receipt: `/tmp/rei-suppression-final-coverage.json`.

| Workspace      | Files / tests | Statements | Branches | Functions | Lines  |
| -------------- | ------------- | ---------- | -------- | --------- | ------ |
| application    | 24 / 236      | 91.08%     | 86.80%   | 94.96%    | 92.54% |
| infrastructure | 46 / 468      | 80.80%     | 75.17%   | 87.50%    | 82.74% |
| worker         | 38 / 239      | 93.41%     | 83.30%   | 90.28%    | 94.77% |

Unchanged coverage floors are statements/lines/functions 80% and branches 75%. Other workspaces'
coverage remains reusable for their unchanged measured sources, exclusions and resolved unit-test
dependencies; the full ordinary unit gate above additionally passed all eight
workspaces against the current dependencies. No browser journey was altered by this command.

An initial coverage wrapper had a shell-quoting error while extracting the argument block;
it ran uninstrumented tests and is not coverage evidence. Its log remains
`/tmp/rei-suppression-coverage-uninstrumented.log`. The corrected wrapper copies the existing block
without shell interpolation and produced the instrumented, passing receipt above. This was an
executor defect, with no product or gate change.

The final root build regenerated artifacts from unchanged corrected runtime inputs:
`8bd83be01bda63448e303500cdab4997694f40a1b0c01a006dd8eabcdf810eb6` (343 files).
Its artifact digest is `5a294304992a2f959b444270812b345e065d9c80ed167fbfe405765197b44c9a`
(1,217 files); this does not claim byte identity with the earlier partial build. The final updated
campaign source remains `56c4705f2f66e6368fe091baadf0793d5adb943acb6f4fe2147ff3e918c45e25`.
All essential emitted checks still pass. Only documentation changes follow these gates.

## Auto Run Result

Implemented permanent listing suppression and the strict owner removal CLI, with one suppression
event, ordered resumable cleanup, current-authority collection/reparse guards, minimum run history,
owner-scoped transport/audit copy erasure and bounded existing late-write reconciliation.

Review: one mandatory independent Quick pass; one confirmed medium patch applied; no deferred or
rejected findings. Parent inspected the correction and deterministic failing/passing reproduction.
Patched entry counts: high 0, medium 1, low 0. Follow-up review recommendation: false; the
demonstrated
shared-owner risk is covered by the passing real-PG interleaving, and no unverified changed risk
remains. No additional broad review was started.

Verification: all seven acceptance rows, actual CLI and real PG18/MinIO/RabbitMQ, updated
suppression
campaign, six valid affected regression receipts, full root lint/typecheck/unit/build and unchanged
changed-workspace coverage floors passed. Production, real sources and model calls were untouched.
Residual limits: Properties/Market derived erasure belongs to 3.12/4.8; unidentifiable historical
real
orphans retain original expiry. Publication remains tracked separately by blocked story 1.12.

Files changed:

- `_bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md`:
  Record the accepted removal contract, operation or verified delivery.
- `_bmad-output/initiative-real-estate-intelligence/epic-collection/story-removal-request-and-suppression-list-plan.md`:
  Record the accepted removal contract, operation or verified delivery.
- `apps/worker/package.json`: Implement suppression, scoped erasure, ownership or command wiring.
- `apps/worker/src/collection/collection-audit.consumer.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `apps/worker/src/collection/collection-audit.consumer.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `apps/worker/src/collection/collection-command.module.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `apps/worker/src/collection/collection-resilience.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `apps/worker/src/collection/collection.module.ts`: Implement suppression, scoped erasure,
  ownership or command wiring.
- `apps/worker/src/collection/fixture-listing-source-router.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `apps/worker/src/collection/listing-removal-command.module.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `apps/worker/src/collection/remove-listing-command.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `apps/worker/src/collection/remove-listing-command.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `apps/worker/src/collection/remove-listing.ts`: Implement suppression, scoped erasure, ownership
  or command wiring.
- `apps/worker/src/collection/resilient-listing-source.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `apps/worker/src/collection/resumable-collection-command.module.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `compose.yaml`: Implement suppression, scoped erasure, ownership or command wiring.
- `docs/operations/deployment.md`: Record the accepted removal contract, operation or verified
  delivery.
- `docs/testing/integration.md`: Record the accepted removal contract, operation or verified
  delivery.
- `integration/listing-provenance.integration.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `integration/listing-suppression.integration.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `integration/snapshot-lifecycle.integration.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `integration/snapshot-reparse.integration.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `migrations/4012_collection_add_listing_suppression.sql`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `migrations/8002_audit_allow_collected_data_erasure.sql`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/collect-source-once.service.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `packages/application/src/collection/collect-source-once.service.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/collect-source-run.service.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `packages/application/src/collection/collect-source-run.service.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/collection-run.repository.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/index.ts`: Implement suppression, scoped erasure, ownership
  or command wiring.
- `packages/application/src/collection/listing-source.port.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/listing-suppression.port.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/prepare-image-fingerprints.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `packages/application/src/collection/prepare-image-fingerprints.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/raw-snapshot-store.port.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/remove-listing.service.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `packages/application/src/collection/remove-listing.service.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/application/src/collection/snapshot-lifecycle.port.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/audit/postgres-audit-event-log.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/in-memory-collection.adapters.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/in-memory-listing-suppression.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/in-memory-snapshot-lifecycle.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/index.ts`: Implement suppression, scoped erasure,
  ownership or command wiring.
- `packages/infrastructure/src/collection/listing-suppression.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `packages/infrastructure/src/collection/postgres-collection-run.repository.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/postgres-collection.facade.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/postgres-listing-suppression.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/postgres-snapshot-lifecycle.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `packages/infrastructure/src/collection/postgres-snapshot-lifecycle.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/postgres-snapshot-reparse.repository.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/s3-raw-snapshot-store.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/snapshot-lifecycle.test.ts`:
  Verify removal behavior or preserve the affected acquisition/lifecycle contract.
- `packages/infrastructure/src/collection/synthetic-listing-source.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/collection/synthetic-sao-paulo-listing-source.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `packages/infrastructure/src/shared/persistence/postgres-outbox.ts`:
  Implement suppression, scoped erasure, ownership or command wiring.
- `specs/adrs/0015-handling-of-collected-data.md`: Record the accepted removal contract, operation
  or verified delivery.

### Delivery closure — 2026-10-25

Implementation: `a1aff55c418adf6ac8ea26ff855039a6263890d0`.
Tests: `d0c6e66ae2a15c86855c307d793e5c227ade05d7`.
Verified delivery record: `53a46cd0b4643df3f7beba9b23b9c38f1b732a59`.
All 56 reviewed files appear after the canonical baseline; the working copy was clean before
marking this ticket done. Every staged secret, formatting, ESLint/Markdown and Conventional Commit
hook passed. Code/test formatters reported unchanged files, preserving the verified runtime and
campaign identities. The orchestrator marks 2.10 done on the acceptance, targeted independent
review correction and final gate receipts above. No publication or downstream erasure is claimed.
