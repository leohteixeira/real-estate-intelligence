# Integration migration preservation inventory

Baseline: `7738135d2d76d7d8fd749d4609d93aeaf1d4a06d`, plus the uncommitted Market story.
Sixteen campaigns, cleanup helper/test, 11,990 lines and 31 HTTP call sites. Independent TypeScript
AST inspection identified 929 direct assertion calls plus 13 semantic helper calls (942 total),
with embedded child-process assertions inspected separately. The earlier 1,029 textual estimate
was corrected; all 347 static SQL literals remain byte-identical after migration. Loops expand
these into additional checks. This inventory is an acceptance aid, not permission
to replace or reduce the original scenarios. Verify against original code and the final diff.

| Campaign                     | Guarantees that must survive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| audit-tracer                 | HTTP 202/UUIDv7; durable trace context; outbox/inbox/audit atomic rollback; duplicate suppression; malformed/mismatched carriers and sanitized dead letters; legacy queue migration; broker restart with the same paused/unpaused worker; outage and graceful claim release; aggregate order; concurrent relay ownership/lease expiry; exactly five poison attempts; retry continuity after adapter restart; PostgreSQL cancellation and usable pool; bounded retention protecting unpublished events.                                                             |
| synthetic-collection         | Hermetic fixture; exact bytes/content versus manifest hash; real collection CLI; exact SQL/outbox/inbox/audit counts; same-operation IDs; independent run/content deduplication; real broker redelivery suppression.                                                                                                                                                                                                                                                                                                                                               |
| source-register              | Sixteen seeded sources/thirteen reviewed snapshots; closed fixture policy; real enable CLI; reviewed/refused outcomes; SQL review/permission/rate/licensing/URL integrity; concurrent/idempotent enable timestamp; API filtering/private exclusions.                                                                                                                                                                                                                                                                                                               |
| collection-resilience        | Real PostgreSQL/MinIO/RabbitMQ; CAPTCHA durable hold/paused prefix; ack after pause/inbox/schedule disposition; redelivery without forbidden work; fresh-process restart hold; hold-before-pause recovery; page/hold race; explicit review/enable/resume; real MinIO outage, exactly three attempts and no checkpoint advance; same-key recovery.                                                                                                                                                                                                                  |
| resumable-collection         | Genuine old migrations/legacy upgrade; real checkpoint contenders and observed row-lock blocking/typed stale loser; production command SIGKILL after checkpoint one; original prefix/run; exact three resumed identities/events; completed replay; sanitized CLI output.                                                                                                                                                                                                                                                                                           |
| scheduled-collection         | Concurrent pollers, one slot; real worker scheduling/counts; delayed worker SIGTERM, zero exit/deadline; unacked delivery/in-flight slot/prefix retained; same-run restart redelivery.                                                                                                                                                                                                                                                                                                                                                                             |
| properties-contracts         | Compiled API hierarchy/search/detail/listings; all sorting/pagination/cursors; supplementary fixtures; prepared evidence/lifecycle/snapshot variants; strict correlated errors; unchanged collection/outbox.                                                                                                                                                                                                                                                                                                                                                       |
| locations                    | Two fresh CommonJS import orders; twenty places/ten addresses; ten simultaneous transaction leases; normalization/inclusive numbers; ambiguity/all ECMAScript whitespace; SQL/FK ownership; migration replay UUID identity; API restart; missing-table fail-closed.                                                                                                                                                                                                                                                                                                |
| market-contracts             | Twenty scopes; exact figures/parents/registered adjacency/monthly series; empties/unrecorded sale; strict errors/parser negatives; detached mutation-safe reads; whole-table count/digest unchanged after normal and table-failure journeys.                                                                                                                                                                                                                                                                                                                       |
| properties-ingestion         | Real storage/outbox/broker/worker/HTTP; rollback/dead-letter/retry; duplicate/concurrent/inbox expiry; canonical authority/address rejection; correction before original; immutable five-crumb history versus six-crumb blocks; sanitized owned source-shaped fixtures; per-value provenance/current permission/prepared isolation.                                                                                                                                                                                                                                |
| properties-history           | Thirty-nine runs/115 acquisitions/eighteen catalog events; five event types/dates/revisions/lifelines; historical/current corrections; correction-first/completion-first without original receipt; earlier incomplete run fences later run; business-effect/cursor separate commits; failed-parse seen identities; start/observation/completion inversions; terminal/recoverable failures/deadlines; both-entry admission/lookup races; equal-ms UUID order; replay/reverse publication/restart; privacy; integer ranking/ties/geography/cursors/database failure. |
| properties-history-upgrade   | Genuine baseline SQL/pending v1 facts; pre-creation evidence/correction; missing creation envelope; permissions without fabricated completion/run; immutable events/revisions; no inferred absence; real migrations; reverse replay/restart/subsequent complete run.                                                                                                                                                                                                                                                                                               |
| listing-provenance           | Real acquisitions/history versus corrected dates; live revoke/restore/restart; mixed/missing prepared rights; historical encrypted fixture through owned repositories; controlled-clock Nest API; exact expiry with ciphertext still present; interrupted cleanup/new pool/API; durable hashes/no private text.                                                                                                                                                                                                                                                    |
| snapshot-lifecycle           | Genuine pre-4006 upgrade; sanitizer corpus/encryption; concurrent acquisition/dedup/generations; orphan uploads; wrong/unknown keys/swaps/tamper; deadline/exact expiry; failed/idempotent deletion; pool/adapter/job restart; aborted PostgreSQL lock release/delayed PUT; writers/cleanup races; reconciliation scheduling/fairness/deadline/cancellation priority/restart.                                                                                                                                                                                      |
| snapshot-reparse             | Production CLIs; replay/concurrent keys/order; independence from outbox retention; actual broker/inbox/audit; preserved fingerprints/history; legacy recovery; parser/outbox/postappend rollback without correction consumption; absent/corrupt/unsupported/tamper; sanitized private correction; expiry during parse/commit; no reacquisition.                                                                                                                                                                                                                    |
| rabbitmq-healthcheck         | Exact product Compose non-root healthcheck; four simultaneous fresh-storage boots; actual healthy/running; cookie metadata only (UID 100/mode 400); distinct storage/exact owned cleanup.                                                                                                                                                                                                                                                                                                                                                                          |
| source-register-cleanup test | Close before down; down after close failure; success suppressed by failure; both cleanup causes; primary assertion plus cleanup cause.                                                                                                                                                                                                                                                                                                                                                                                                                             |

Testcontainers Compose supports selected services, explicit environment/project/profiles, build and
healthcheck waits. Keep an Execa escape hatch only for actual commands/fault stimuli it cannot
express; do not recreate sixteen manual startup/teardown managers. GenericContainer suits the four
fresh-volume broker probes. Staged migration campaigns must not accidentally start migrations
before loading their real historical baseline.

Supertest must preserve literal malformed paths/query strings and expected non-2xx responses,
headers, correlation, bodyless POST and RabbitMQ management payload/auth. Nock cannot intercept
Docker/subprocess traffic: its process-local guard permits owned services and Docker control only;
controlled synthetic external scopes must be consumed and cleaned. Never mock service semantics.

Collection resilience currently self-spawns its campaign with `--restart-probe`: extract an actual
non-test fixture probe. Locations embeds Node assert in its two import-order probes: emit minimal
module results and assert in the parent Vitest test while preserving process separation.

Polling variants differ in returned values: preserve those values using `vi.waitFor` or
`expect.poll`. Use hooks and named test phases where safe; a sequential campaign remains valid
provided its complete setup/scenario/assertion lifecycle is inside Vitest, not a child script.
Cleanup failures must not replace primary failures or turn failed cleanup into success.

CI currently mutates the default Compose stack around audit only; remove that outer lifecycle and
run the owned suite. The RabbitMQ healthcheck previously had no script/CI invocation: include it.
Unit `--dir src`, coverage floors and historical workflow evidence remain unchanged.

## D-040 TypeScript preservation evidence — 2026-10-11

All 28 integration sources and the Vitest configuration are now TypeScript. The strict compiler
enumerates every source, and the root recursive typecheck includes the dedicated integration
project. The parent independently compares all sixteen campaign SQL-literal sequence hashes and
expectation-call counts to the pre-TypeScript source inventory; every exact hash and count matches
after correcting one accidental marker inside the synthetic campaign's SQL literal. This is static
preservation evidence, not a substitute for real campaign execution.

Typed support/cleanup execution passes the original 21 cases in four files (6.79s); discovery
retains all 37 cases across 20 files without collecting either fresh-process probe. Deliberate
type mismatch and empty-filter checks fail with TS2322/exit 2 and no-test-files/exit 1 respectively.
Final root lint, recursive plus strict integration typecheck, 1,316 unit tests, build, unchanged
coverage gates and frozen install pass. The production build's existing chunk-size warning remains.

Actual implementation logs are listed in `plan-typescript-integration.md`. The initial typed full
real-service run reports 36 passed cases and one failed case in 767.34s, without skips. The failure
identifies a test-side parser default rejecting snapshot-reparse's intentional legacy empty
fingerprints; that adaptation now uses the existing explicit legacy option. The focused real
rerun passes its complete campaign (one test/file, no skips, 24.36s), with a genuine verbose
transcript and JSON report. Post-correction strict compiler, root lint and formatting pass.
Read-only Docker checks find no resources belonging to either typed run after cleanup; unrelated
projects and older anonymous volumes are untouched. The parent's reviewed verbose/JSON full run
remains pending; no full pass is claimed from the failing initial suite plus focused rerun.
Do not infer journey success from discovery or fixture turnover.
Repository-wide Markdown lint still includes generated rendered workflow
findings under unchanged rules. Direct `markdownlint-cli2 --no-globs` validation passes all nine
implementation-owned Markdown files with zero errors; the parent separately obtains zero errors
for all fourteen changed Markdown files under those same rules.

### Reviewed full typed execution

The parent completes the reviewed full suite in session 96246 with exit 0: all 37 tests in
20 files pass, zero failures or pending cases, 646.58 seconds. Actual UTC span is
07:24:34.701–07:35:21.281 on 2026-10-11; the genuine report is
`/tmp/rei-typed-final-ChFnDG/integration.json`. This supersedes the pending full verification
above, without rewriting the earlier failed run. Every campaign executes successfully, including
legacy reparse, restart/import-order probes and 21 support/cleanup cases. The final independent
AST comparison still matches all sixteen exact SQL sequence hashes and expectation counts.
No owned campaign or Testcontainers resources remain after the suite, while all thirteen unrelated
containers and eight labelled volumes match their pre-run inventories. Quick review has no findings
or deferred work; no rule, hook, compiler flag, scenario or coverage floor was weakened.
