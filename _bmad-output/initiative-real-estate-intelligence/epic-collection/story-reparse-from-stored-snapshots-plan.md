---
title: 'Reparse from stored snapshots'
type: 'feature'
ticket: '8'
created: '2026-10-10'
status: done
baseline_revision: 'e912cc836d1050bc922afc32ab874c955eb5ea7e'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0018-snapshot-encryption-and-acquisition-retention.md
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 2.8 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`integration/snapshot-reparse.integration.test.ts` passed the real reparse command, updated
parser/correction publication, durable recovery and zero source-acquisition assertions.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`2b8698412f75f336c3462ceff8dafddb9e6cabe6`,
`f75efed1e584a6d4ecb6fd3fe60b492e749746eb`,
`c3de8579fbb4c76d391ae493fc8769ea6ab7d39e`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** CAP-2 needs parser corrections from stored snapshots without acquiring content again.
The current pipeline has no operator reparse command, correction event or durable operation record.

**Approach:** Reparse one explicitly selected observation from verified stored bytes and publish a
strict v2 correction through the transactional outbox. Preserve original provenance and image
fingerprints; keep operation retries durable and bounded.

## Boundaries & Constraints

**Always:** Follow D-018 and ADRs 0011–0015, 0018–0019. Keep SQL and crypto in infrastructure,
ports in application and strict pure validation in domain. The operator supplies snapshot ID,
parser-revision label and operation key. Bind the key permanently to target/revision; persist its
result and the single correction event atomically. Preserve original run, snapshot, hash, source,
URL and observed time. Reattach trusted original fingerprints, including an intentional empty
array. Distinguish unknown legacy provenance from empty. Fail closed on expiry both at read and
commit, propagate cancellation/deadlines, use caller-owned read resilience and safe telemetry.

**Never:** Fetch a source or photograph, store/reacquire content, enable a real source, extend
retention, invent a run/observation or completion event, duplicate v1 publication, modify counts,
manifest/checkpoint/history, query another context's schema, trust prunable outbox as fingerprint
archive, expose an HTTP operator surface, access VPS, read/edit `.env*`, weaken gates, change the
branch/stash, commit/push as implementer, or implement later fingerprint/removal/UI stories.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                                                       | Expected Output / Behavior                                                                   | Error Handling                                                  |
| -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Parser fix           | Valid original observation, changed parser                                          | New marked v2 correction with corrected facts and identical original provenance/fingerprints | Zero acquisition or image calls                                 |
| Repeat/race          | Same operation, target and revision; restart/concurrent attempts                    | Same durable event/result; one logical correction                                            | Different target/revision for owned key rejects                 |
| Separate corrections | Different operations on same observation                                            | New correction with monotonic per-observation order                                          | Delayed delivery cannot imply new observation or erase ordering |
| Legacy               | Fingerprints not yet stored in row; verified canonical bytes contain original field | Recover original fingerprints independently of changed parser, persist once                  | Missing/invalid field fails closed, never assume empty          |
| Unavailable          | Missing/corrupt/tampered bytes, unsupported source, expired generation              | No new correction, acquisition or ownership success                                          | Safe categorical failure; retained hash/history unchanged       |
| Slow parsing         | Read succeeds, then expiry/cancellation occurs before commit                        | No correction commits                                                                        | Check lifecycle access under lock and existing commit guard     |
| Private fixture      | Real-category canonical local fixture; parser adds sensitive fields                 | Closed sanitized listing, trusted fingerprints, original safe provenance                     | No contact data in SQL/outbox/logs                              |
| Failure              | Parser/SQL/outbox fails or process interrupts                                       | No partial correction, retry with same identity succeeds                                     | Original collection unaffected                                  |

</intent-contract>

## Code Map

- `packages/application/src/collection/listing-source.port.ts` — fetch and parse are separate.
  Reparse receives only a parse capability, never a fetch method.
- `packages/application/src/collection/raw-snapshot-store.port.ts` and
  `apps/worker/src/collection/resilient-raw-snapshot-store.ts` — existing read capability/policies.
  `s3-raw-snapshot-store.ts` authenticates real ciphertext and closes access at expiry; synthetic
  read still needs persisted-hash verification before parsing.
- `packages/domain/src/collection/collection.events.ts` — v1 exact decoder; retain it unchanged
  and add strict correction-only v2 construction/dispatch with original linkage and order.
  Generic outbox/broker/audit envelopes already support positive versions.
- `packages/application/src/collection/{collect-source-once.service.ts,collect-source-run.service.ts,
collection-run.repository.ts}` — both original observation commits need durable fingerprints.
- `packages/infrastructure/src/collection/{postgres-collection-run.repository.ts,
in-memory-collection.adapters.ts}` — existing provenance rows/repository fakes. Add a cohesive
  reparse repository rather than expanding cross-context queries.
- `migrations/4006_collection_add_snapshot_lifecycle.sql` and
  `postgres-snapshot-lifecycle.ts` — read-only fixed generation lifecycle, expiry/commit locks.
  New migration 4007 must retain existing rows; never depend on seven-day outbox retention.
- `canonical-snapshot-sanitizer.ts`, `SyntheticListingSource.parse`,
  `SyntheticSaoPauloListingSource.parse` and `fixture-listing-source-router.ts` — pure canonical
  parser and closed sanitizer; real paths only tested with isolated local fixture adapters.
- `apps/worker/src/collection/{resumable-collection-command.ts,collect-resumable.ts,
resumable-collection-command.module.ts}` — bounded command cleanup/signals/spans/composition.
  Reparse root must not start scheduler/subscribers or need broker just to commit its outbox.
- `integration/{synthetic-collection,resumable-collection,snapshot-lifecycle}.integration.mjs`
  — actual PostgreSQL/MinIO/RabbitMQ fixtures, random ports and owned cleanup. Lifecycle harness
  stages pre-4006 upgrade: do not apply dependent 4007 before 4006 during that stage.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/collection/collection.events.ts`, its tests and `index.ts` — add strict
      version-2 correction marker, operation/revision/original linkage and monotonic order; keep
      all v1 validation and unrelated versions. Test rejection and immutable original identity.
- [x] `packages/application/src/collection/reparse-snapshot.service.ts`,
      `snapshot-reparse.repository.ts`, `index.ts` and colocated tests — implement bounded
      parse-only orchestration, verified original bytes/provenance/fingerprints, durable replay,
      safe failures and atomic correction/outbox. Write failing matrix tests first.
- [x] `packages/application/src/collection/{collection-run.repository.ts,
collect-source-once.service.ts,collect-source-run.service.ts}` and tests — capture original
      fingerprints at original commits without changing collection behavior or event version.
- [x] `packages/infrastructure/src/collection/postgres-snapshot-reparse.repository.ts`,
      in-memory reparse fake, `postgres-collection-run.repository.ts`,
      `in-memory-collection.adapters.ts`, `index.ts` and tests — implement strict metadata lookup,
      fingerprint recovery from independently hash-verified canonical bytes, target ownership,
      per-observation locking/order and expiry-safe SQL/outbox commit; test malformed states.
- [x] `migrations/4007_collection_add_snapshot_reparse.sql` — append durable nullable fingerprint
      provenance and reparse operation state/order; preserve all historical keys/observations.
      No cross-schema FK, no outbox backfill dependency, no alteration of accepted migrations.
- [x] `apps/worker/src/collection/{reparse-snapshot.ts,reparse-snapshot-command.ts,
snapshot-reparse-command.module.ts}` and tests, `apps/worker/package.json`, `compose.yaml`
      — expose owner-only three-argument command, composition and bounded lifecycle; no fetch
      capability or long-lived worker jobs. Reuse existing configuration and OTEL preload.
- [x] `integration/snapshot-reparse.integration.mjs`, `package.json` and affected existing
      campaign upgrade sequencing — exercise real CLI plus changed-parser application fixture,
      actual storage/DB/outbox/relay/inbox audit, repeat/concurrency/restart/expiry/rollback and
      legacy recovery. Do not alter assertions/retries to hide failures.
- [x] This plan and epic Notes — record commands, decisions, safe new settings if any and exact
      observed verification; parent reviews and auto-commits after full checks.

**Acceptance Criteria:**

- Given stored observations and a changed parser, when the operator reparse capability runs,
  then RabbitMQ/audit receive only a marked v2 parsed correction with corrected facts, original
  fingerprints and identical snapshot/run/source/time/hash, while the fake source records zero
  requests and run counts, manifest, checkpoints and original observation history are unchanged.
- Given concurrent same-key invocations and a process restart, when the real CLI repeats,
  then one correction exists and the same durable event is returned; a conflicting target or
  revision is rejected, and another operation receives a higher correction order.
- Given an authentic legacy snapshot and a parser returning invented fingerprints, when reparse
  runs after original outbox pruning, then trusted fingerprints are recovered from stored bytes
  and retained durably; missing provenance is rejected without a partial correction.
- Given unavailable/tampered/expired content or expiry during parsing, when reparse is attempted,
  then no correction, new collection, content upload or retained-access extension occurs; existing
  historical hashes and run metadata remain intact.
- Given a private canonical local fixture and a parser introducing prohibited fields, when reparse
  runs, then actual SQL/outbox contain only the closed sanitized listing and original fingerprints;
  no external source is enabled or contacted.

## Implementation Notes

Implemented on 2026-10-10; implementation remains `in-progress` until the parent's independent
review. No branch change, stash, commit, push, VPS access or `.env*` access was performed.

The owner command is:

```sh
pnpm --filter @rei/worker run snapshot:reparse <snapshot-id> <parser-revision> <operation-key>
```

- Compose exposes the same three arguments through `snapshot-reparse-command` in the `tools`
  profile. It starts a short-lived parse/read-only application context, not a scheduler,
  subscriber or acquisition worker, and does not require RabbitMQ to commit its outbox.
- Migration 4007 adds nullable original fingerprint evidence, immutable operation ownership and
  completion, and a per-observation correction sequence. Original collection commits now retain
  their fingerprints. Legacy `NULL` is recovered once from independently SHA-256/length-verified,
  fatal-UTF-8 canonical JSON; an explicit `[]` is trusted empty evidence, while a missing/invalid
  field is rejected. The changed parser cannot supply or replace this evidence.
- An independently committed pending operation binds the key before parsing. Correction order,
  the v2 outbox event and the completed result commit together under observation/operation locks.
  Same-key process restarts and races return the persisted event; conflicting target/revision
  reuse rejects. Completed replay does not read content or reopen expired access.
- Real-generation access is checked by the existing authenticated reader, under SQL locks, and
  by a deferred commit trigger using the database clock. Parser/outbox/SQL interruption leaves
  no partial correction. Original run counts, manifest, checkpoint, provenance and stored bytes
  remain unchanged; reparse has no fetch, upload, deletion or photograph capability.
- A separate correction-only canonical parser accepts trusted intentional-empty originals for
  owned synthetic source IDs. `SyntheticListingSource.parse`, original v1 publication and v1
  decoding retain their existing semantics. Real-category privacy and changed-parser behavior
  are exercised only with isolated local application fixtures, not enabled external sources.
- No new configuration settings or defaults were introduced. The command reuses existing
  collection deadlines, persistence, caller-owned read resilience, storage/encryption settings,
  OTEL preload, safe categorical failure output and bounded signal/bootstrap/cleanup behavior.

Final code-state verification used:

```sh
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:coverage && pnpm run test:integration:snapshot-reparse
```

All eight workspace gates passed: **832 unit tests**, with no skipped new cases or relaxed gates.
Coverage retains the existing 80% statements/lines/functions and 75% branches thresholds:

| Workspace      | Tests | Statements | Branches | Functions |  Lines |
| -------------- | ----: | ---------: | -------: | --------: | -----: |
| Domain         |   249 |     92.86% |   86.87% |      100% | 93.46% |
| Application    |    96 |     90.82% |   85.44% |    97.91% | 92.32% |
| Infrastructure |   241 |     86.61% |   79.12% |    92.03% | 89.50% |
| Worker         |   189 |     94.42% |   84.64% |    92.13% | 95.85% |
| API            |    25 |     93.67% |   86.56% |      100% | 93.67% |
| Contracts      |     9 |       100% |     100% |      100% |   100% |
| Web            |    14 |       100% |     100% |      100% |   100% |
| AI             |     9 |       100% |     100% |      100% |   100% |

The new isolated PostgreSQL/MinIO/RabbitMQ campaign passed after the final build. Actual fresh
CLI processes prove original fingerprint capture, completed replay/restart, concurrent same-key
invocations, revision/target conflicts and legacy intentional-empty recovery. Separately injected
changed-parser application fixtures prove corrected facts with fabricated fingerprints,
closed real-category sanitization, unavailable/unsupported/tampered bytes, durable interrupted
ownership, before/after-append rollback, expiry during parsing and deferred-commit expiry. Actual
relay/broker/audit/inbox processing records **nine** distinct v2 corrections and rejects duplicate
inbox delivery; source and image acquisition counters remain zero. The original outbox archive is
pruned before reparse, and collection history/storage-count invariants are asserted.

The sequential compatibility command below completed with exit 0: reparse plus all six existing
collection, resumable, scheduled, resilience, lifecycle and source-register campaigns passed.
Source-register's separate cleanup coordinator also passed all five Node tests, with zero skipped,
cancelled or todo tests. No campaign assertions or retry policies were changed.

```sh
pnpm run build && pnpm run test:integration:snapshot-reparse && pnpm run test:integration:collection && pnpm run test:integration:resumable-collection && pnpm run test:integration:scheduled-collection && pnpm run test:integration:collection-resilience && pnpm run test:integration:snapshot-lifecycle && pnpm run test:integration:source-register
```

Final scoped checks also passed:

```sh
git ls-files --modified --others --exclude-standard -z | xargs -0 pnpm exec prettier --check --ignore-unknown
pnpm exec markdownlint-cli2 --no-globs _bmad-output/initiative-real-estate-intelligence/epic-collection/story-reparse-from-stored-snapshots-plan.md _bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md
node --check integration/snapshot-reparse.integration.mjs && node --check integration/snapshot-lifecycle.integration.mjs && git diff --check
git ls-files --modified --others --exclude-standard -z | xargs -0 -r -I{} git diff --no-index -- /dev/null '{}' | gitleaks stdin --redact --no-banner
```

The secret scan includes every modified/untracked file, not just the tracked diff. Markdown lint
reported zero errors and the redacted scan found no leaks. The only build warning is the existing
536.96 kB web `CityScene` chunk; fixture fault-injection warning/error logs accompanied passing
tests, not command failures.

During development, real CLI evidence exposed suppressed completion output, which was fixed in
command logger composition without weakening the assertion. SQL-state tests exposed JSON object
key-order-sensitive comparison; comparison now normalizes key order while preserving exact
metadata values. Invalid fixture setup, test parameter shape, typing/lint issues and a literal
fixture credential-URL scanner finding were corrected before successful verification; no scan
allowlist, coverage threshold, assertion, skip or automatic retry was added. SQL has no configured
Prettier parser, so the existing scoped formatting command uses `--ignore-unknown`.

No browser or HTTP operator surface was opened. Remaining work is parent-owned independent review
and commit; real-source enablement, VPS deployment and later fingerprint/removal/UI stories remain
outside this implementation.

## Plan Change Log

- 2026-10-10: No intent or acceptance change. Added a correction-only owned-synthetic canonical
  parser after the actual CLI intentional-empty fixture showed that routing `[]` through the
  legacy acquisition parser would violate the frozen v1 contract. Independent original-byte
  fingerprint decoding and strict original publication remain unchanged in intent. The parent
  approved this in-scope separation before implementation.
- 2026-10-10: The existing lifecycle upgrade campaign now stages 4007 after 4006, preserving its
  pre-4006 historical fixture and all existing lifecycle assertions.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free Quick reviewer checked acceptance, repository rules and the
  surrounding production command, domain event and SQL paths; no actionable defect was reported.

## Design Notes

D-018 settles operator scope and correction semantics before code. A parser revision is a validated
operator-supplied artifact label, not automatic code-version inference. One target avoids inventing
a bulk-run aggregate; explicit invocations compose. A durable per-observation correction sequence
allows downstream consumers to reject stale corrections without manufacturing market history.
The route is full: persistence, event contracts, command composition and integration exceed
100 changed lines and five files. Risk is raised to high because a false correction or reopened
retention window would corrupt historical facts or expose expired content. ADR precedence over
Prisma/NX/Jest/EventEmitter examples is already recorded in D-012; do not redecide it.

## Verification

- Focused domain/application/infrastructure/worker Vitest suites: every matrix row active and
  passing, including zero-fetch spies and commit-boundary expiry.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`: all eight workspaces.
- `pnpm run test:coverage`: retain 80% statements/lines/functions and 75% branches unchanged.
- `pnpm run test:integration:snapshot-reparse`: actual bounded CLI and real isolated services.
- Existing collection, resumable, scheduled, resilience, lifecycle and source-register campaigns:
  compatibility and migration sequencing unchanged except staging dependent new migrations.
- Scoped Prettier, Markdown lint, script syntax, whitespace and secret scan: no weakened checks.
- No browser or HTTP operator surface is opened; end-to-end evidence is the actual command,
  storage, PostgreSQL, outbox, broker and audit/inbox chain, entirely local and synthetic.

## Auto Run Result

Status: built. Implemented one bounded owner-operated snapshot reparse with correction-only v2
publication, immutable original provenance/fingerprints, durable operation replay and ordering,
authenticated legacy recovery, closed privacy projection and expiry-safe atomic outbox completion.
No source or photograph acquisition, collection history mutation, HTTP surface or new setting was
introduced. D-018 records the owner's delegated product decision before implementation.

### Files changed

- `_bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md` — D-018 and
  verified implementation/review evidence.
- `_bmad-output/initiative-real-estate-intelligence/epic-collection/story-reparse-from-stored-snapshots-plan.md`
  — immutable intent, implementation record, matrix audit and final review result.
- `apps/worker/package.json` — telemetry-preloaded owner command script.
- `apps/worker/src/collection/reparse-snapshot-command.test.ts` — argument, lifecycle and signal tests.
- `apps/worker/src/collection/reparse-snapshot-command.ts` — bounded three-argument command lifecycle.
- `apps/worker/src/collection/reparse-snapshot.ts` — executable entry point and categorical failures.
- `apps/worker/src/collection/snapshot-reparse-command.module.ts` — parse/read-only dependency root.
- `compose.yaml` — short-lived tools-profile command without a broker dependency.
- `integration/snapshot-lifecycle.integration.mjs` — preserve pre-4006 fixture staging before 4007.
- `integration/snapshot-reparse.integration.mjs` — real CLI/storage/SQL/broker/audit correction journey.
- `migrations/4007_collection_add_snapshot_reparse.sql` — evidence, operation/order and expiry guards.
- `package.json` — isolated real-service campaign script.
- `packages/application/src/collection/collect-source-once.service.test.ts` — original evidence assertion.
- `packages/application/src/collection/collect-source-once.service.ts` — retain original fingerprints.
- `packages/application/src/collection/collect-source-run.service.test.ts` — resumable evidence assertion.
- `packages/application/src/collection/collect-source-run.service.ts` — persist parsed fingerprint
  evidence.
- `packages/application/src/collection/collection-run.repository.ts` — observation fingerprint
  port fields.
- `packages/application/src/collection/index.ts` — reparse application facade exports.
- `packages/application/src/collection/reparse-snapshot.service.test.ts` — orchestration matrix failures.
- `packages/application/src/collection/reparse-snapshot.service.ts` — replay, verification and
  atomic correction.
- `packages/application/src/collection/snapshot-reparse.repository.ts` — vendor-free durable
  reparse port.
- `packages/domain/src/collection/collection.events.test.ts` — strict v2 and unchanged v1 contract tests.
- `packages/domain/src/collection/collection.events.ts` — correction contract and safe label validation.
- `packages/domain/src/collection/index.ts` — correction domain facade exports.
- `packages/domain/src/collection/snapshot-privacy.ts` — closed correction projection with trusted
  empty images.
- `packages/infrastructure/src/collection/canonical-correction-parser.test.ts` — correction-only
  parser tests.
- `packages/infrastructure/src/collection/canonical-correction-parser.ts` — owned synthetic pure parsing.
- `packages/infrastructure/src/collection/in-memory-collection.adapters.ts` — original evidence
  in collection fake.
- `packages/infrastructure/src/collection/in-memory-snapshot-reparse.repository.ts` — isolated
  reparse fake.
- `packages/infrastructure/src/collection/index.ts` — reparse adapter facade exports.
- `packages/infrastructure/src/collection/postgres-collection-run.repository.ts` — original
  evidence SQL writes.
- `packages/infrastructure/src/collection/postgres-snapshot-reparse.repository.test.ts` —
  evidence/state tests.
- `packages/infrastructure/src/collection/postgres-snapshot-reparse.repository.ts` — locks,
  ownership and verification.
- `packages/infrastructure/src/index.ts` — correction parser infrastructure export.

### Independent verification and matrix audit

The parent read the complete 3,254-line staged baseline diff, including all new files, then ran:

```sh
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:coverage
pnpm run test:integration:snapshot-reparse && pnpm run test:integration:collection && pnpm run test:integration:resumable-collection && pnpm run test:integration:scheduled-collection && pnpm run test:integration:collection-resilience && pnpm run test:integration:snapshot-lifecycle && pnpm run test:integration:source-register
pnpm --filter @rei/application exec vitest run --dir src src/collection/reparse-snapshot.service.test.ts --reporter verbose && pnpm --filter @rei/infrastructure exec vitest run --dir src src/collection/postgres-snapshot-reparse.repository.test.ts src/collection/canonical-correction-parser.test.ts --reporter verbose && pnpm --filter @rei/domain exec vitest run --dir src src/collection/collection.events.test.ts --reporter verbose && pnpm --filter @rei/worker exec vitest run --dir src src/collection/reparse-snapshot-command.test.ts --reporter verbose
```

Every command exited 0. All **832** workspace tests and **111** separately named focused cases
passed without skips. Coverage matched the implementation table above and retained every existing
gate. All seven real-service campaigns passed; source-register cleanup added five passing Node
tests. Scoped Prettier, Markdown lint, JavaScript syntax, staged whitespace and redacted staged
secret scan also passed; owned containers were absent after cleanup.

Every matrix row had an active passing covering test:

- Parser fix: the application v2 provenance/empty-image case and real campaign changed-parser
  correction preserve original fingerprints/history and assert zero source/image calls.
- Repeat/race: durable replay and both concurrent-winner unit cases, plus actual fresh CLI replay,
  same-key process races and conflicting target/revision assertions in the real campaign.
- Separate corrections: fake increasing-order test, SQL lock/order cases and real correction
  sequences 1–6; strict v2 marker and original snapshot identity distinguish history from correction.
- Legacy: independent empty-evidence recovery and invalid-evidence unit cases, plus actual CLI `[]`
  recovery after original outbox pruning and injected invented-fingerprint correction.
- Unavailable: missing/corrupt/read-failure and malformed-byte unit cases, plus actual storage
  corruption, missing object, unknown source, authenticated tamper and expired read assertions.
- Slow parsing: cancellation/deadline and expired-commit unit cases, plus real parser-time and
  deferred-commit expiry failures with no outbox event and unchanged acquisition deadline.
- Private fixture: the real campaign's encrypted isolated fixture and parser-introduced private
  fields are closed/masked in actual SQL/outbox while original fingerprints remain unchanged.
- Failure: parser/outbox unit failures and actual durable parser interruption/retry, before-append
  rollback and post-append rollback with no partial event or consumed correction order.

### Review and residual risks

Quick was pinned by the workflow; other lenses were skipped. Review findings: **0**; patches
applied: high 0, medium 0, low 0; deferred items: 0; rejected findings: 0.
Follow-up review recommended: **false**, with no unverified patched risk.

The actual owner CLI intentionally parses owned synthetic sources only. Real-category privacy,
changed-parser and expiry behavior is tested with local application fixtures, not external source
enablement. The operator-supplied parser revision remains an artifact label, not code inference.
The existing large `CityScene` build warning remains unrelated. VPS/production-dependent stories
remain owner-pending under D-006; there was no VPS access or deployment in this story.
