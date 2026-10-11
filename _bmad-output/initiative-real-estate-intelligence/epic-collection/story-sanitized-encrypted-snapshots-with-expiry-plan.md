---
title: 'Sanitized, encrypted snapshots with expiry'
type: 'feature'
ticket: '7'
created: '2026-10-10'
status: done
baseline_revision: '8bc0c4ce522cd9a92331f6844a7284259646c15f'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick, quick, quick, quick, quick]
review_loop_iteration: 2
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/specs/adrs/0018-snapshot-encryption-and-acquisition-retention.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0019-expired-snapshot-reconciliation.md
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 2.7 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`integration/snapshot-lifecycle.integration.test.ts` passed real PostgreSQL/MinIO sanitized
and encrypted snapshot, exact 30-day expiry, retained-hash, restart and reconciliation assertions.
Passing reruns do not establish a root-cause fix for historical RabbitMQ startup failures.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`9a6aea818e85ec53c43c5d71dfb98fd50014e746`,
`955745d5f13c691a325465ed33f9e368efb73449`,
`e912cc836d1050bc922afc32ab874c955eb5ea7e`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** CAP-2 and ADR 0015 require real snapshots to contain no personal/contact data, remain
encrypted at rest, and expire thirty days after collection. The existing synthetic-only pipeline
stores and parses original bytes and has no lifecycle seam.

**Approach:** Sanitize canonical JSON and provenance before storage and parsing, encrypt real
generations with authenticated configured keys, and delete expired content through the worker.
Retain historical hashes and observations; preserve the synthetic path byte-for-byte.

## Boundaries & Constraints

**Always:** Follow D-014/ADR 0018, ADRs 0011–0015, repository instructions and
`nestjs-modular-monolith`. Ports belong to application; Node crypto/S3/SQL stay in infrastructure;
use Vitest and append-only SQL migrations. Reserve real generations durably before upload;
coordinate cleanup and commits; enforce fixed thirty-day access expiry; retain idempotent replay,
manifest and checkpoint history. Store before parse; commit one aggregate and its outbox atomically.
Bound every external attempt/cycle, propagate cancellation and never record sensitive payloads.

**Never:** Enable/acquire a real source, use the VPS/network sources, introduce an HTTP operator
surface, store arbitrary raw HTML/CSV, silently decrypt with another/default key, extend expiry on
retry, delete historical observations, weaken coverage/checks, read/write `.env*`, change branches,
commit/push as implementer, or implement reparse/removal/fingerprints/UI stories prematurely.

## I/O & Edge-Case Matrix

| Scenario                | Input / State                                                                                    | Expected Output / Behavior                                                                             | Error Handling                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Private fixture         | Canonical JSON plus person/contact/CPF/CRECI/unit/photos/unknown fields and contact-bearing text | Closed sanitized bytes and provenance reach storage and parser; no prohibited value reaches SQL/outbox | Invalid unsupported shape rejected before persistence                       |
| Encryption              | Sanitized real bytes, explicit key/ID                                                            | Hash identifies plaintext; S3 stores only authenticated ciphertext; reads restore sanitized bytes      | Tamper, swapped identity, wrong/unknown key, malformed envelope fail closed |
| Retry/race              | Same acquisition, concurrent conditional writers                                                 | Stable key/hash/expiry, winner authenticated, no duplicate observation/event                           | No overwrite or deadline renewal                                            |
| Independent acquisition | Same content, new operation identity                                                             | Independent encrypted generation with its own fixed deadline                                           | No synthetic/real namespace collision                                       |
| Expiry                  | Clock just before, at, and after thirty days                                                     | Before: readable; at/after: inaccessible; job deletes blob but keeps hash/provenance/history           | No resurrection or partial-commit availability                              |
| Orphan/restart          | Upload then parse/SQL failure; crash before/after delete                                         | Reserved orphan expires; cleanup resumes idempotently without losing history                           | Transient deletion retried, never reported successful prematurely           |
| Missing key/storage     | No key, invalid config, access denied/outage/abort                                               | Synthetic still operates; real path cannot store plaintext; safe typed errors                          | Existing caller-owned resilience, deadlines and cancellation                |
| Synthetic upgrade       | Existing immutable row/exact bytes and new repeated run                                          | Same keys/hashes/bytes; retained beyond thirty days; replay/change detection intact                    | Migration loses no legacy reference                                         |

</intent-contract>

## Code Map

- `packages/application/src/collection/{listing-source.port.ts,raw-snapshot-store.port.ts,collection-run.repository.ts}`
  — canonical JSON document/storage/run contracts; storage currently only `store`, hard-coded
  synthetic flag. Extend coherently without vendor types.
- `packages/application/src/collection/{collect-source-once.service.ts,collect-source-run.service.ts}`
  — both upload before parser and SQL; currently parse original bytes, require synthetic category,
  and emit parsed events. Sanitize every persisted/parser path, preserve access-review gates and
  legacy replay.
- `packages/domain/src/collection/collection.events.ts` — closed parsed-event validator, not a
  sanitizer. Keep v1 allowlist/no-personal-data guarantee; real parser output must not bypass
  sanitization through text/provenance.
- `packages/infrastructure/src/collection/{s3-raw-snapshot-store.ts,in-memory-collection.adapters.ts,postgres-collection-run.repository.ts}`
  — S3 one-attempt/conditional winner/body-hash verification must survive. SQL currently globally
  keys immutable `raw_object` by hash; historical queries inner-join it.
- `migrations/4001_collection_create_collection_pipeline.sql` and
  `4003_collection_add_resumable_runs.sql` — read-only historical schema/upgrade facts. Add
  `4006_collection_add_snapshot_lifecycle.sql`; preserve legacy rows, immutable metadata and
  observation lookup while separating real generations/availability.
- `apps/worker/src/collection/{collection-command.module.ts,resumable-collection-command.module.ts,collection.module.ts,resilient-raw-snapshot-store.ts}`
  — three independent composition roots own storage lifecycle; bind sanitizer, configured encryption
  and lifecycle consistently. New operations need policies, not SDK retries.
- `apps/worker/src/{config.ts,main.ts,worker.module.ts,worker-shutdown.ts}` and
  `shared/delivery-retention.job.ts` — reuse bounded
  non-overlap/immediate-start/stop-await/categorical telemetry patterns. A provider alone does not
  start a job.
- `integration/{synthetic-collection,resumable-collection,scheduled-collection,collection-resilience}.integration.mjs`
  — isolated real PostgreSQL/RabbitMQ/MinIO harnesses and exact-byte/legacy migration assertions.
  Reuse explicit local credentials, random ports, no env-file loading and owned cleanup.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/collection/` and colocated tests — specify deterministic closed
      projection/masking boundaries with adversarial canonical fixtures first; reject unsafe
      identifiers/URLs and unsupported shapes without leaking values.
- [x] `packages/application/src/collection/` — introduce sanitizer/lifecycle capabilities and
      integrate both collection flows; parser receives sanitized documents, metadata/event payloads
      stay safe, synthetic bytes stay unchanged. Add in-memory fakes and matrix tests before
      implementations.
- [x] `packages/infrastructure/src/collection/` — implement sanitizer/AEAD codec, one-attempt
      encrypted storage/read/delete and durable lifecycle reservation/cleanup. Authenticate winners
      and plaintext integrity; separate expiry from immutable hash/history, include uncommitted
      uploads, and test cancellation/concurrency/crash recovery.
- [x] `migrations/4006_collection_add_snapshot_lifecycle.sql` and
      `postgres-collection-run.repository.ts` — migrate legacy data without identity loss; persist
      real acquisition references and reject expired/stale generations at commit. Keep
      replay/change/checkpoint behavior independently of deleted blob availability.
- [x] `apps/worker/src/collection/`, `config.ts`, `main.ts`, `worker.module.ts`,
      `worker-shutdown.ts`, and `compose.yaml` — wire all three roots and actual retention
      lifecycle; provide safe synthetic defaults, optional explicit encryption settings and named
      bounded cleanup configuration. Never add a plaintext/key fallback or test-time clock switch to
      deployment.
- [x] `integration/snapshot-lifecycle.integration.mjs` and `package.json` — add isolated
      real-service campaign exercising the actual collection/worker components with local
      fixture/key and injected test clock, never registered external sources. Assert raw S3
      ciphertext, authenticated sanitized read, parser/SQL/outbox privacy, exact expiry/deletion,
      orphan cleanup, independent acquisitions, concurrent operations and restart recovery.
- [x] Existing colocated adapter/service/config/wiring/shutdown suites and earlier integration
      campaigns — prove backward compatibility and unchanged coverage gates; document verification
      and new safe configuration in this plan.

**Acceptance Criteria:**

- Given an isolated contact-bearing real-category fixture and explicit encryption key, when the
  collection flow runs, then MinIO contains authenticated ciphertext whose decrypted snapshot and
  persisted SQL/outbox/parser inputs contain none of its prohibited contact/name/CPF/photo values,
  while its allowed listing facts and sanitized provenance remain usable.
- Given the completed fixture and an orphaned upload, when the clock reaches each acquisition's
  exact thirty-day deadline and the actual worker retention component cycles, then reads fail and
  both physical blobs disappear; the completed run still replays with its original content hash,
  manifest and counts and no additional fetch/event.
- Given concurrent storage/cleanup, a failed deletion, and restart between deletion and durable
  confirmation, when the operations resume, then expiry never extends/resurrects content, cleanup
  eventually converges, and a later independently acquired generation remains intact.
- Given legacy synthetic rows and a missing encryption key, when migrations and normal worker/
  operator collection roots run, then the same synthetic hash/key/bytes survive beyond thirty days,
  each root uses the intended policies, and no real source becomes enabled or gets a plaintext path.

## Implementation Notes

### Required repair derivation

The fourth review exposed another incomplete scheduling case. Re-derive from the preserved baseline
under the accepted D-016 and D-017 amendments to ADR 0019; the intent contract remains unchanged.

- `expire-snapshots.service.ts` — select only the next single due candidate before each deletion,
  using `listExpired(now, 1, signal)`. Bound total attempts by the configured batch limit and do
  not attempt the same key twice in a cycle. Do not advance a whole batch of unattempted keys.
  Preserve immediate cancellation, per-object failure continuation, categorical aggregate failure,
  caller-owned policies and counting only confirmed reconciliation. Selection remains durable
  before the attempted effect; no new public lifecycle method or configuration is required.
- Domain privacy pattern and every privacy-boundary test — fully mask `06.12.34.56.78`,
  `+33 6.12.34.56.78`, `CRECI N.º 12345-F` and `CRECI n°: 12345-F`, retaining all previously
  covered phone/CRECI/name formats and allowed property facts.
- Retention tests and isolated lifecycle campaign — prove a cohort fitting in a batch larger than
  one progresses when the first slow deletion consumes the existing cycle timeout. At a fixed
  clock, cancel after its durable single-candidate selection, then restart through a fresh
  PostgreSQL pool and reconcile healthy peers before the slow object recovers. Keep the slow
  object due, preserve all state/access invariants, and test no duplicate attempt within a cycle.
  Use the actual retention/job and caller policy boundaries; do not add retry, delay, timeout or
  assertion changes to hide the demonstrated cancellation outcome.

- `migrations/4006_collection_add_snapshot_lifecycle.sql` — add a collection-owned monotonic
  selection sequence and nonnegative durable generation selection order. Keep temporal due gates,
  immutable acquisition metadata and terminal deletion unchanged.
- `postgres-snapshot-lifecycle.ts` — select at most the requested limit of due generations by
  oldest selection order and stable key, then atomically advance selected priorities before
  returning them. Use explicit SQL and cancellable I/O. Do not mark selected work deleted or
  reschedule its due timestamp merely because an attempt is about to run.
- `in-memory-snapshot-lifecycle.ts` — mirror durable selection ordering deterministically, including
  repeated cycles at the same fixture timestamp. Keep failed work eligible and rollback behavior.
- `snapshot-privacy.ts` — fully mask the reproduced `CRECI nº 12345-F`, `CRECI n° 12345-F` and
  `CRECI: 123.456-F` notations; extract explicitly labelled contact `firstName`/`lastName` values
  before dropping their containing object. This extends existing deterministic masking, not
  arbitrary-prose recognition.
- Colocated tests and `integration/snapshot-lifecycle.integration.mjs` — retain every existing
  proof and add structured-name/CRECI regressions over sanitizer, parser, raw decrypted content,
  SQL and outbox. Prove finite-cohort cleanup progress with size-one batches at a fixed clock,
  persistent earlier deletion failures, cancellation after selection, and a fresh PostgreSQL pool
  after restart. Failed objects remain eligible; healthy later blobs disappear without waiting for
  failed-object recovery. On recovery the failed object can still be reconciled.

**KEEP instructions:** Preserve the authenticated envelope, canonical projection, stable plaintext
hash and acquisition identity, fixed exact expiry, final post-COMMIT read guard, all previously
fixed contact formats, source-review gates, SQL/outbox atomicity, pre-upload reservations, late-PUT
tombstone reconciliation, byte-for-byte synthetic compatibility, all three composition roots,
safe configuration and caller-owned resilience. Preserve all prior tests and isolated integration
assertions; do not weaken their expectations. The parent saved the validated pre-repair code/test
diff at `/tmp/story27-preserved-D017.diff`. It may be read and used to reconstruct
these KEEP parts through `apply_patch`, then amended for the required repairs; it is not a second
source of requirements. Do not alter agent instructions, secrets, unrelated files, branch or stash.

- Closed canonical projection now masks contact-bearing permitted text and sanitizes provenance
  before either collection path stores or parses it. Parser output is projected again, including
  newly labelled contact names. Unknown document/listing metadata, unit/complement and photo fields
  are omitted. Unsupported formats and unsafe identities fail with categorical errors.
- Real storage uses explicit AES-256-GCM configuration, a strict versioned envelope, random
  twelve-byte nonces, sixteen-byte tags and authenticated object/hash/media/key identity.
  Conditional winners are decrypted and their plaintext hashes checked; SDK retries remain disabled.
  Fresh HTTP(S) sockets avoid relying on transport retries after a MinIO conditional-PUT socket
  closure.
- Migration 4006 adds immutable historical content metadata and acquisition-scoped generation
  reservations. Row locks serialize upload/read/deletion and observation commits; a deferred
  database trigger revalidates real references at commit. Reservations precede upload, retain the
  initial thirty-day deadline and cover uncommitted/orphaned content. Deletion retains replay,
  counts, manifests, checkpoints, observations and hashes. Existing migrations are unchanged.
- D-015/ADR 0019 covers remote writes that settle after PostgreSQL cancellation releases its row
  lock. Expired generations remain eligible even after confirmed deletion. Successful idempotent
  deletion persists a separate next-reconciliation timestamp using the existing retention interval;
  due scans retain that timestamp and fixed expiry as eligibility gates. Under D-016, a
  collection-owned monotonic sequence advances selected generations' durable priority atomically
  before deletion attempts. Eligible work is ordered by oldest selection priority and stable key;
  failures and cancelled attempts remain due while later objects progress at the same clock.
  Terminal deletion and the initial expiry never change. A restart resumes both the durable
  schedule and selection priority. Metrics count confirmed reconciliations rather than claiming
  each check removed a new physical object.
- All three worker composition roots provide sanitization, PostgreSQL lifecycle coordination and
  optional explicit encryption. The actual worker starts immediate, bounded, non-overlapping expiry
  cycles, cancels active work and awaits it during shutdown. Read and deletion have separate named
  caller-owned resilience policies and safe categorical telemetry.
- Synthetic exact bytes, existing SHA-256 keys and indefinite retention remain unchanged. No real
  adapter/source enablement, external source request, operator HTTP surface or deployment was added.

### Safe configuration

`SNAPSHOT_ENCRYPTION_KEY_ID` and `SNAPSHOT_ENCRYPTION_KEY_BASE64` must either both be absent or both
be explicitly supplied. The identifier accepts 1–64 safe identifier characters and the key must be
canonical base64 representing exactly 32 bytes. There is no checked-in, generated, ephemeral or
plaintext fallback. Absent keys keep synthetic operations working and reject real storage/read.
Unknown identifiers and wrong keys cannot decrypt an existing generation; multi-key rotation remains
outside this story. No encryption values are recorded in this plan. The isolated local integration
campaign generates its encryption keys in memory for each run and never prints them; this is a
fixture mechanism, not a deployment fallback.

| Setting                               | Default | Bounds         |
| ------------------------------------- | ------- | -------------- |
| `SNAPSHOT_RETENTION_INTERVAL_MS`      | 300000  | 100–2147483647 |
| `SNAPSHOT_RETENTION_BATCH_SIZE`       | 100     | 1–1000         |
| `SNAPSHOT_RETENTION_CYCLE_TIMEOUT_MS` | 10000   | 100–2147483647 |

Production uses the system clock. Only the isolated campaign injects a deterministic clock through
the existing application seam. Access expires at the exact boundary even when physical cleanup lags
during a storage outage. Known labelled names are masked deterministically; arbitrary-prose name
recognition is not claimed, as specified by ADR 0018.

## Plan Change Log

- 2026-10-10 — D-015/accepted ADR 0019 adds durable expired-tombstone reconciliation after a
  reproduced late-PUT/cancellation race. Added restart and bounded-batch proofs without changing the
  intent contract, fixed expiry or terminal deleted state.
- 2026-10-10 — D-016/accepted ADR 0019 amendment repairs selection starvation demonstrated with
  a persistent first-key failure and a size-one batch. Separate due eligibility from durable
  monotonic selection priority; keep all validated invariants and regression proofs listed above.
  Re-derive from baseline and cover the two newly reproduced structured-privacy formats too.
- 2026-10-10 — D-017/accepted ADR 0019 amendment repairs full-cohort starvation when the first
  deletion consumes the cycle deadline. Advance priority only for the next individually selected
  candidate, keep the total attempt bound, and never repeat a key within a cycle. Re-derive from
  baseline with all KEEP invariants and prior regression evidence; add larger-batch cancellation/
  restart progress and dotted-phone/CRECI notation regressions. The intent contract is unchanged.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Common regional CRECI and formatted international phone strings survived
    permitted text projection — The parent reproduced the mask result and traced the same projection
    through canonical storage and parser output. The implementer extended the existing patterns;
    domain, sanitizer/parser, bypassed-storage and real-service SQL/outbox/decrypted-content
    regressions now cover those exact formats while preserving permitted property facts.
  - `[high]` `[patch]` A read could return plaintext after COMMIT crossed the fixed expiry — The
    parent traced the actual transaction runner's callback-before-COMMIT ordering and confirmed
    there was no final guard on the returned bytes. The implementer rechecks the existing
    cancellation/accessibility guards after the lifecycle promise settles. Regressions use the
    actual PostgreSQL lifecycle and transaction runner, proving pre-expiry success, exact-boundary
    rejection and cancellation during connection release. No public surface or new state was added.

### 2026-10-10 — Follow-up review pass

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Common French spaced phone numbers survived permitted text projection —
    The parent reproduced both international and domestic strings through the existing mask. The
    implementer extended that pattern without a new public surface; domain, sanitizer/parser,
    storage-bypass and decrypted-content/SQL/outbox regressions cover the demonstrated formats.
  - `[high]` `[patch]` One failed deletion prevented later selected keys from being attempted —
    The parent reproduced three cycles in which only the first failing key was attempted. The
    implementer continues the existing selected batch and reports a categorical aggregate failure
    afterward; cancellation still stops immediately. Regression cycles confirm that a healthy
    selected key is reconciled, the failed key remains due, and its eventual recovery succeeds.

### 2026-10-10 — Confirmation review pass

- verdicts: 3 findings — high 3, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Common numbered/dotted CRECI notation survives projection — The parent
    executed the built mask and reproduced two unchanged credentials and one partially masked
    credential. The repair derivation extended the existing pattern; domain, sanitizer/parser,
    bypassed-storage and real decrypted-content/SQL/outbox regressions now pass for all three.
  - `[high]` `[patch]` Structured contact first/last names are not extracted — The parent executed
    the built name extractor and confirmed an empty list and unchanged contact-bearing description.
    The repair derivation extended the existing labelled-name extractor; regressions now cover
    snapshot bytes, parser output and SQL/outbox. No arbitrary-prose recognition was introduced.
  - `[high]` `[bad_plan]` Persistent failures monopolize an entire bounded selection — The parent
    executed the actual expiry service and in-memory lifecycle with size one for three cycles;
    every attempt targeted the earlier failing key. The actual PostgreSQL query has equivalent
    unchanged due ordering. D-016 amends the scheduling plan with durable selection priority while
    preserving eligibility. Re-derivation preserved every KEEP invariant and added atomic durable
    selection priority; fixed-clock size-one tests pass across failures, cancellation and restart.

### 2026-10-10 — Final confirmation review pass

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Dotted French phones and abbreviated CRECI notation survive projection —
    The parent executed the built mask for all four reported strings and confirmed unchanged
    output. The canonical sanitizer, parsed projection, S3 canonical-byte validator and event
    validator all share that mask; there is no later privacy guard. Re-derivation extended
    the existing pattern and shares it with the event validator without a circular dependency.
    All four formats pass domain, sanitizer/parser, storage-bypass, decrypted-content and SQL/outbox
    regressions in independent parent verification.
  - `[high]` `[bad_plan]` Advancing a whole batch starves healthy peers after cycle cancellation —
    The parent executed the actual expiry service and in-memory lifecycle with two keys and
    limit two; cancellation in the first delete produced three attempts of only that key.
    Tracing the actual PostgreSQL query confirmed that every selected key advances before the
    first attempt. D-017 amends selection granularity to one next candidate, with bounded unique
    attempts per cycle and preserved due/access/deletion semantics. Code was re-derived from the
    saved baseline diff, preserving all KEEP proofs. Independent parent verification passed the
    actual-job larger-batch fixed-clock campaign, cancellation after durable selection, fresh-pool
    restart and healthy-peer progress before slow-object recovery. The existing caller deadline is
    checked before and after selection; the reproduced deadline-delivery race also has a passing
    deterministic regression. No policy, timeout, retry, delay or assertion was weakened.

### 2026-10-10 — Incremental-selection confirmation review pass

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Toll-free and internationally grouped phones survive projection — The
    parent reproduced unchanged masks for `0800 123 4567`, `0800-123-4567`, `+34 612 345 678`
    and `+351 912 345 678`, then traced shared projection, event validation and S3 revalidation.
    The same implementer extended only the existing phone alternatives, with no public surface or
    retention change. All six demonstrated phone/credential formats now mask completely in the
    parent's built-code check; domain/event, sanitizer/parser, storage-bypass and real decrypted
    content/SQL/outbox assertions pass. Allowed numeric listing facts remain unchanged.
  - `[high]` `[patch]` Parenthesized-region and trailing-prefix-period CRECI notation survives —
    The parent reproduced unchanged masks for `CRECI (SP) 12345-F` and `CRECI Nº. 54321-F`
    and traced every established boundary. The same implementer extended the existing credential
    alternative to consume both demonstrated notations. Domain/event and infrastructure regressions
    now pass, and the independently executed real PostgreSQL/MinIO campaign removes them from
    decrypted bytes, parser inputs/output, SQL provenance and outbox without weakening prior checks.

## Design Notes

Deep read-only exploration found no sanitizer/encryption/expiry seam. Original documents bypass
storage on their way to the parser, so storage-only masking is insufficient. Upload-first ordering
also leaves orphans invisible to observation-only expiry scans. D-014/ADR 0018 settle these gaps
before code; exact internal lifecycle schema remains implementer-owned within those invariants.
Route is full: privacy-sensitive cross-layer changes exceed 100 lines and five files.

## Verification

### Parent verification and matrix audit

After the fifth review's two pattern-only patches, the parent independently read every changed
pattern and regression, then executed full lint, typecheck, test, build and coverage again. All
776 tests passed without skips: domain 238, application 82, infrastructure 219, worker 180, API 25,
contracts 9, AI 9 and web 14. The four focused suites passed too. Every matrix row below remains
covered by active passing tests; additional numeric-fact assertions ensure the privacy patch does
not discard permitted property facts. All six real-service scripts passed in one serial chain,
including the unchanged resilience campaign and source-register's five cleanup-coordinator tests.
Scoped formatting, Markdown lint, syntax and whitespace checks passed. The redacted reviewed-diff
secret scan passed. No test, assertion, coverage gate, policy, timeout or retry was weakened.

After D-017 the parent independently read the full 5713-line diff, including the new shared text
helper, and the final implementation notes. Full lint, typecheck, all 757 tests, build and coverage
passed again. Focused suites passed with domain 225, application 82, infrastructure 213 and worker
180 tests. Unchanged gates remain 80% statements/lines/functions and 75% branches. All 49 supported
changed files passed Prettier; all four changed Markdown files passed scoped Markdown lint. Script
syntax and staged/unstaged whitespace checks passed. The expanded real PostgreSQL/MinIO lifecycle
campaign passed independently, including the actual-job larger-batch deadline/cancellation/restart
scenario and every existing privacy, encryption, historical-replay and late-PUT assertion.
All six integration scripts then passed in the parent's single serial command chain; source-register
also ran all five cleanup-coordinator tests with zero skips. The unchanged resilience campaign
passed, without establishing the cause or a fix for the historical initial RabbitMQ publish failure.

The parent independently read the complete baseline diff, including all new files, and reread
the full 5143-line diff after D-016 re-derivation. Full lint, typecheck, test, build and coverage
commands passed, as did the four focused workspace suites, supported-file and Markdown Prettier
checks, scoped Markdown lint and staged / unstaged whitespace checks. All 740 tests ran without
skips; coverage thresholds are unchanged. The parent also read every post-review code, test and
fixture change independently. The expanded real-service lifecycle campaign passed independently,
including labelled names, numbered/dotted CRECI and fixed-clock fair selection after failure,
cancellation and fresh-pool restart. All six integration scripts passed serially in the parent
verification, including the unchanged resilience campaign. A mistyped script name interrupted the
first command chain after two passing campaigns; the remaining four ran under their existing
correct names and passed. The implementer's earlier transient publish failure remains unexplained;
the independent passing run is not claimed as a root-cause fix. Inspection confirmed that the
initial publish establishes its own bounded broker connection and topology before confirmation;
no evidence survives that distinguishes its connection, transport or confirmation failure phase.
No retry, delay, timeout or assertion was changed. The staged secret scan initially flagged the
fixture URL's literal credential syntax; constructing that URL through its credential properties,
as established by the
existing campaigns, removed the finding without changing scanner rules or exemptions. The parent
reran the secret scan, full lint and the lifecycle campaign after that correction; all passed.

| Matrix row              | Executed passing evidence                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private fixture         | Domain privacy projection; infrastructure canonical sanitizer; both application privacy-seam tests; integration assertions over parser input, observations and outbox.                            |
| Encryption              | Authenticated envelope nonce/identity/hash tests and malformed-envelope rejection; integration ciphertext inspection, authenticated read, wrong/unknown-key, swapped-object and tamper rejection. |
| Retry/race              | Concurrent storage winner authentication and stable expiry tests; integration concurrent collection with one replay, one key and no duplicate event.                                              |
| Independent acquisition | Unit independent-acquisition test; integration same plaintext hash with distinct keys/deadlines and preservation of the later live generation.                                                    |
| Expiry                  | Exact-boundary storage/read test; integration just-before and at-deadline reads, physical absence, retained replay/manifests/counts and SQL expiry/immutability guards.                           |
| Orphan/restart          | Reserved-orphan/delete-before-confirmation tests; integration failed parsing/deletion, fresh-pool restart, actual PostgreSQL cancellation/late PUT and durable size-one reconciliation batches.   |
| Missing key/storage     | Configuration pairing and bounds; unit missing-key, unsanitized-byte, forbidden/outage/cancellation and independent read/delete policy tests; integration missing-key refusal.                    |
| Synthetic upgrade       | Existing S3/store/service suites and composition-root tests; integration pre-4006 migration preserving exact key/hash/bytes, retention after thirty days and historical replay.                   |

Every covering suite ran and passed in the parent's full and focused verification output; every
integration assertion above ran in `test:integration:snapshot-lifecycle`. No matrix row relies on an
unregistered, filtered-out, skipped or disabled test. This story has no HTTP operator or browser
surface; the isolated stack exercises the actual collection and worker components as planned.

### Implementation evidence

- D-017 repair verification on 2026-10-10: reproduced all four dotted-phone/abbreviated-CRECI
  masking failures and the larger-batch priority advancement failure before repair. Retention now
  selects exactly one next candidate per attempt, bounds total attempts, and never deletes a key
  twice in a cycle. The expanded actual-job/caller-policy integration also exposed a deadline race:
  deletion policy exhaustion can precede delivery of the worker cancellation callback. A failing
  deterministic regression proved a second selection after that exhausted deadline. The service now
  checks the existing caller deadline before and after selection using the wall clock, independently
  of its trusted acquisition/expiry clock; no timeout, retry, delay, public port or configuration
  changed.
- Shared contact text detection now covers `06.12.34.56.78`, `+33 6.12.34.56.78`,
  `CRECI N.º 12345-F` and `CRECI n°: 12345-F` in canonical projection, parser projection,
  canonical-byte storage rejection and the closed parsed-event description validator. A small
  domain text helper avoids a circular dependency while retaining the existing masking export.
  The real-service campaign verifies these formats across decrypted bytes, parser input/output,
  SQL provenance and outbox alongside every previous privacy assertion.
- Final D-017 full lint, typecheck, test, build and coverage passed with 757 tests: domain 225,
  application 82, infrastructure 213, worker 180, and the other four workspace suites. The
  unchanged coverage gates remain 80% statements/lines/functions and 75% branches. The expanded
  PostgreSQL/MinIO campaign passed its fixed-clock size-three cohort through the actual retention
  job and deletion policies, with a slow first deletion consuming the unchanged cycle timeout,
  cancellation after durable single selection, two fresh-pool restarts, healthy-peer progress
  before slow-object recovery, and preserved expiry, availability, deletion, hash and acquisition
  invariants. The first expanded campaign failed the newly added progress assertion and drove the
  deadline guard repair; its assertions were retained.
- Final D-017 serial integration verification passed synthetic collection, resumable crash/restart,
  scheduled shutdown/restart, collection resilience and source-register in one unchanged command
  chain. Source-register's five cleanup-coordinator tests also passed, with zero skips. Scoped
  supported-file Prettier, plan/ADR Markdown lint, script syntax and staged/unstaged whitespace
  checks passed. The earlier D-016 initial RabbitMQ publish failure below remains historical
  evidence with an unexplained cause; these passing campaigns do not establish a cause or fix.

- D-016 repair verification on 2026-10-10: first reproduced failing tests for all three numbered/
  dotted CRECI formats, structured contact `firstName`/`lastName`, and size-one selection
  starvation. After repair, full lint, typecheck, test, build and coverage passed with 740 tests
  (domain 217, application 78, infrastructure 209, worker 179, and the other workspace suites).
  No coverage threshold changed. Scoped supported-file Prettier and whitespace checks passed.
- The expanded isolated PostgreSQL/MinIO lifecycle campaign passed structured-name and CRECI
  privacy assertions over sanitized/decrypted bytes, parser inputs and output, SQL and outbox.
  Its fixed-clock size-one cohort preserves a persistently failing object, cancels after durable
  selection, opens a fresh PostgreSQL pool, removes healthy later blobs before failure recovery,
  and finally reconciles the failed object. Selection alone changes neither availability nor
  deletion confirmation, due timestamp, acquisition identity or expiry. Every prior lifecycle
  integration assertion remains active.
- D-016 serial integration verification: synthetic collection, resumable crash/restart and
  scheduled shutdown/restart passed. The first unchanged collection-resilience run failed during
  its initial scheduled event publish (`collection-resilience.integration.mjs:301`), before the
  deliberate outage/cancellation assertions, with a categorical transient
  `event-publisher.publish` failure. Its owned fixtures were cleaned up. A separate unmodified
  diagnostic rerun passed all resilience assertions; no broker retry, sleep, timeout, policy or
  campaign assertion changed. The initial failure remains part of the verification evidence and
  indicates intermittent initial-publish behavior; the passing rerun does not establish its cause.
  Source-register and its five cleanup-coordinator tests subsequently passed in a separate run
  because the first serial chain stopped at that failure. All owned integration fixtures were
  removed after verification.

- Full `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` and
  `pnpm run test:coverage` passed on 2026-10-10. Unchanged per-workspace gates remain 80%
  statements, lines and functions, and 75% branches. Final focused suites after D-016: domain 217
  tests, application 78, infrastructure 209 and worker 179; all 740 tests across eight workspace
  suites passed in independent parent verification, including every prior privacy,
  transaction-boundary and retention regression.
- The new isolated PostgreSQL/MinIO campaign passed privacy assertions over parser inputs, SQL and
  outbox payloads, raw ciphertext inspection, authenticated reads, tamper/identity/key rejection,
  concurrent acquisition, fixed deadlines, orphan cleanup, deletion failure/restart recovery,
  independent generations and byte-for-byte legacy synthetic retention/replay. Expanded assertions
  also passed database-level expired-reference/immutable-expiry/no-undelete guards and the actual
  PostgreSQL abort/late-MinIO-PUT race. A new pool resumes due reconciliation, removes the late
  blob, and processes all retained generations in size-one batches without trapping the first batch.
- Established synthetic collection, resumable crash/restart, scheduled shutdown/restart, collection
  resilience and source-register integrations passed with the appended migration. All five passed
  again in the final serial regression rerun after the reconciliation change; the source-register
  cleanup coordinator's five tests also passed.
- Scoped Markdown and supported-file Prettier checks passed. Repository-wide `lint:md` remains
  blocked by 1467 existing violations in unrelated generated/rendered BMad documents; the story plan
  passes its scoped check. No rules were weakened and unrelated documents were not changed.
- Build output retains the existing Vite large-chunk warning; no gate was weakened.

**Commands:**

- `pnpm --filter @rei/domain test`, `pnpm --filter @rei/application test`,
  `pnpm --filter @rei/infrastructure test`, `pnpm --filter @rei/worker test` — focused matrix green.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — every workspace green,
  unchanged 80% statements/lines/functions and 75% branches.
- `pnpm run test:integration:snapshot-lifecycle` — actual PostgreSQL/MinIO fixture/lifecycle proof;
  use the package script added by this story.
- Serial `pnpm run test:integration:collection`, `pnpm run test:integration:resumable-collection`,
  `pnpm run test:integration:scheduled-collection`,
  `pnpm run test:integration:collection-resilience`, `pnpm run test:integration:source-register` —
  established runtime/migration/privacy gates intact.
- Scoped `pnpm exec prettier --check <changed supported files>`,
  `pnpm exec markdownlint-cli2 --no-globs <plan and ADRs>` and `git diff --check` — formatting
  clean; never expand patterns into ignored configuration files. Repository-wide `pnpm run lint:md`
  retains the unrelated existing-document failures described above.

## Auto Run Result

Implemented closed canonical sanitization before storage and parsing, authenticated AES-256-GCM
real snapshots, immutable acquisition-scoped thirty-day expiry and historical hash/replay retention.
The actual worker performs bounded, cancellable, incremental durable reconciliation, including
orphans and terminal tombstones after late remote writes. Synthetic bytes and unlimited synthetic
retention remain unchanged. No real source, new HTTP/browser surface or production deployment was
introduced.

### Reviewed files and commit plan

The complete reviewed change contains 50 files. Commit these exact groups in the following order,
on the existing branch, without push or co-author trailers:

1. `feat: add sanitized encrypted snapshots with fixed retention` — 32 implementation files.
2. `test: verify snapshot privacy encryption and fair cleanup` — 14 test/harness files.
3. `docs: record snapshot lifecycle decisions and verification` — four documentation files.

| Commit group   | File                                                                                                                       | Change                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Implementation | `apps/worker/src/collection/collection-command.module.ts`                                                                  | Wire sanitizer, lifecycle and configured encryption into one-shot collection.          |
| Implementation | `apps/worker/src/collection/collection-resilience.settings.ts`                                                             | Define separate bounded snapshot read and deletion policies.                           |
| Implementation | `apps/worker/src/collection/collection.module.ts`                                                                          | Wire scheduled collection and the retention component.                                 |
| Implementation | `apps/worker/src/collection/resilient-raw-snapshot-store.ts`                                                               | Wrap immutable snapshot operations in caller-owned resilience.                         |
| Implementation | `apps/worker/src/collection/resumable-collection-command.module.ts`                                                        | Wire privacy and encrypted lifecycle into resumable commands.                          |
| Implementation | `apps/worker/src/config.ts`                                                                                                | Read optional explicit keys and safe retention defaults.                               |
| Implementation | `apps/worker/src/main.ts`                                                                                                  | Start retention and await its shutdown.                                                |
| Implementation | `apps/worker/src/shared/resilience/resilience-telemetry.ts`                                                                | Instrument snapshot policies without sensitive values.                                 |
| Implementation | `apps/worker/src/worker-shutdown.ts`                                                                                       | Drain retention alongside other worker components.                                     |
| Implementation | `apps/worker/src/worker.module.ts`                                                                                         | Keep composition configuration explicit and env-file behavior controlled.              |
| Implementation | `compose.yaml`                                                                                                             | Expose optional encryption and bounded retention configuration.                        |
| Implementation | `packages/application/src/collection/collect-source-once.service.ts`                                                       | Sanitize before storage/parser and project parsed output again.                        |
| Implementation | `packages/application/src/collection/collect-source-run.service.ts`                                                        | Preserve resumable collection invariants across encrypted acquisitions.                |
| Implementation | `packages/application/src/collection/index.ts`                                                                             | Export application privacy and lifecycle contracts.                                    |
| Implementation | `packages/application/src/collection/raw-snapshot-store.port.ts`                                                           | Define acquisition identity and snapshot read/delete capabilities.                     |
| Implementation | `packages/domain/src/collection/collection.events.ts`                                                                      | Keep parsed collection event validation closed and privacy-safe.                       |
| Implementation | `packages/domain/src/collection/index.ts`                                                                                  | Export deterministic snapshot privacy functions.                                       |
| Implementation | `packages/infrastructure/src/collection/in-memory-collection.adapters.ts`                                                  | Preserve synthetic storage behavior with the extended port.                            |
| Implementation | `packages/infrastructure/src/collection/index.ts`                                                                          | Export collection adapter implementations without vendor types.                        |
| Implementation | `packages/infrastructure/src/collection/postgres-collection-run.repository.ts`                                             | Persist generation references while preserving replay and historical hashes.           |
| Implementation | `packages/infrastructure/src/collection/s3-raw-snapshot-store.ts`                                                          | Store authenticated ciphertext and enforce exact access expiry.                        |
| Implementation | `apps/worker/src/collection/snapshot-retention.job.ts`                                                                     | Run cancellable retention cycles with categorical telemetry.                           |
| Implementation | `migrations/4006_collection_add_snapshot_lifecycle.sql`                                                                    | Add immutable snapshot history, durable generations and selection priority.            |
| Implementation | `packages/application/src/collection/expire-snapshots.service.ts`                                                          | Reconcile expired snapshots with incremental durable selection.                        |
| Implementation | `packages/application/src/collection/snapshot-lifecycle.port.ts`                                                           | Define durable reservation, expiry and reconciliation boundaries.                      |
| Implementation | `packages/application/src/collection/snapshot-sanitizer.port.ts`                                                           | Define canonical document and parsed-output sanitization.                              |
| Implementation | `packages/domain/src/collection/snapshot-privacy.ts`                                                                       | Mask contact-bearing text and reject unsafe identifiers deterministically.             |
| Implementation | `packages/infrastructure/src/collection/canonical-snapshot-sanitizer.ts`                                                   | Validate canonical JSON and sanitize bytes and provenance.                             |
| Implementation | `packages/infrastructure/src/collection/in-memory-snapshot-lifecycle.ts`                                                   | Mirror durable lifecycle and selection priority in deterministic tests.                |
| Implementation | `packages/infrastructure/src/collection/postgres-snapshot-lifecycle.ts`                                                    | Reserve generations and coordinate access, deletion and priority in PostgreSQL.        |
| Implementation | `packages/infrastructure/src/collection/snapshot-aead-codec.ts`                                                            | Authenticate versioned AES-256-GCM envelopes and plaintext integrity.                  |
| Implementation | `packages/domain/src/collection/snapshot-text-privacy.ts`                                                                  | Share contact-text detection between sanitization and event validation without cycles. |
| Tests          | `apps/worker/src/collection/collection-resilience-wiring.test.ts`                                                          | Verify lifecycle and caller policies across worker composition roots.                  |
| Tests          | `apps/worker/src/config.test.ts`                                                                                           | Verify paired keys and retention configuration bounds.                                 |
| Tests          | `apps/worker/src/worker-shutdown.test.ts`                                                                                  | Verify retention cancellation and shutdown ordering.                                   |
| Tests          | `package.json`                                                                                                             | Register the isolated snapshot lifecycle integration campaign.                         |
| Tests          | `packages/application/src/collection/collect-source-once.service.test.ts`                                                  | Cover one-shot sanitization and synthetic compatibility.                               |
| Tests          | `packages/application/src/collection/collect-source-run.service.test.ts`                                                   | Cover resumable sanitization, replay and acquisition identity.                         |
| Tests          | `apps/worker/src/collection/resilient-raw-snapshot-store.test.ts`                                                          | Verify independent snapshot read/delete policies and cancellation.                     |
| Tests          | `apps/worker/src/collection/snapshot-retention.job.test.ts`                                                                | Verify immediate bounded non-overlapping cycles and shutdown.                          |
| Tests          | `integration/snapshot-lifecycle.integration.mjs`                                                                           | Prove privacy, encryption, exact expiry, races, orphan/restart and fair cleanup.       |
| Tests          | `packages/application/src/collection/expire-snapshots.service.test.ts`                                                     | Cover bounded unique attempts, failures, cancellation and fair progress.               |
| Tests          | `packages/domain/src/collection/snapshot-privacy.test.ts`                                                                  | Cover closed projection and demonstrated contact/name formats.                         |
| Tests          | `packages/infrastructure/src/collection/postgres-snapshot-lifecycle.test.ts`                                               | Verify cancellable transactions and durable priority selection SQL.                    |
| Tests          | `packages/infrastructure/src/collection/snapshot-lifecycle.test.ts`                                                        | Cover storage privacy, keys, identity, races, exact expiry and reconciliation.         |
| Tests          | `packages/domain/src/collection/collection.events.test.ts`                                                                 | Reject demonstrated contact formats at the parsed event boundary.                      |
| Documentation  | `_bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md`                                      | Record accepted snapshot privacy, reconciliation and fairness decisions.               |
| Documentation  | `_bmad-output/initiative-real-estate-intelligence/epic-collection/story-sanitized-encrypted-snapshots-with-expiry-plan.md` | Record intent, repairs, review triage and independently executed verification.         |
| Documentation  | `specs/adrs/0018-snapshot-encryption-and-acquisition-retention.md`                                                         | Accept closed sanitization and acquisition-scoped encrypted retention.                 |
| Documentation  | `specs/adrs/0019-expired-snapshot-reconciliation.md`                                                                       | Accept durable tombstone reconciliation and failure-independent selection.             |

### Review outcome

Five Quick review passes reported 11 findings, each independently triaged and recorded above:
nine high patches and two high bad-plan repairs under D-016/D-017. All were resolved and verified.
There were no medium, low, false or maybe-false verdicts, no rejected findings and no deferred items.
The two bad-plan loopbacks preserved the intent contract and every KEEP invariant while re-deriving
the implementation. Other review lenses were not selected by the pinned Quick workflow.

This pass applied two high patches, zero medium and zero low patches. Follow-up recommendation is
`false`: both demonstrated defects and their existing boundaries have executed passing regressions,
and no specific unverified risk remains from these patches. The historical RabbitMQ failure below
is not a new defect from either privacy patch and is not claimed to have been fixed.

### Final verification

| Check                                                                  | Outcome                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Full lint, typecheck, test and build                                   | Passed; 776 tests, zero skips.                                                                                      |
| Coverage                                                               | Passed in every workspace with unchanged 80% statements/lines/functions and 75% branches.                           |
| Focused domain/application/infrastructure/worker suites                | Passed: 238/82/219/180 tests.                                                                                       |
| Snapshot lifecycle integration                                         | Passed real PostgreSQL/MinIO privacy, encryption, exact expiry, races, orphan/restart and fair-progress assertions. |
| Collection, resumable collection and scheduled collection integrations | All passed serially after the final patches.                                                                        |
| Collection resilience and source-register integrations                 | Both passed serially; cleanup coordinator passed 5/5, zero skips.                                                   |
| Supported-file Prettier and scoped Markdown lint                       | Passed for 49 supported files and all four Markdown files.                                                          |
| Integration script syntax and staged/unstaged whitespace               | Passed.                                                                                                             |
| Redacted reviewed-diff secret scan                                     | Passed; normal staged secret and formatting hooks remain required for each commit.                                  |
| Matrix audit                                                           | Every row maps to active executed passing assertions; no disabled or unregistered test is credited.                 |

### Residual risks and boundaries

- The historical initial RabbitMQ publish failure remains unexplained. The later unchanged
  campaigns pass but do not prove its cause or a root-cause fix. No retry, sleep, timeout or
  assertion was changed to conceal it.
- Known labelled contact names and the demonstrated contact formats are masked deterministically.
  Arbitrary-prose name recognition and a legal privacy opinion are not claimed. Unsupported
  canonical shapes fail closed.
- Multi-key rotation requires a later reviewed contract before changing a live key with unexpired
  generations. No key or key value was checked in or printed.
- Storage outages may delay physical deletion; exact-boundary access remains closed and durable
  reconciliation remains due. A successful reconciliation counts a confirmed check, not necessarily
  a newly removed physical blob.
- Existing unrelated generated Markdown violations and the existing Vite large-chunk warning
  remain documented; no rule or gate was weakened.
- Production/VPS work remains the owner's pending action under D-006. All evidence here uses
  isolated local fixtures; no source was enabled or production system accessed.
