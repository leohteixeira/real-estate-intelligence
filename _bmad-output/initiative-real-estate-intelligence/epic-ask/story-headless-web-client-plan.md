---
title: 'Headless web client'
type: 'feature'
ticket: '9'
created: '2026-10-26'
status: done
baseline_revision: '026428f245ac1ef3ef312f4f2dff0a098e87fc4c'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/AGENTS.md
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 5.9/CAP-14 lacks a headless web client for live run commands and resumable
SSE. The existing Ask client reads prepared demonstrations; backend acceptance is already proven.

**Approach:** Add the live client under `apps/web/src/headless/`, reusing bounded HTTP/SSE
mechanisms and strict public contracts. Prove the actual client against an owned Compose stack.

## Boundaries & Constraints

**Always:** Preserve caller-owned strong capabilities, explicit creation idempotency keys,
versioned envelopes, ordered lossless continuation and explicit terminal evidence. Preserve the
public prefix when constructing every URL. Bound reads, buffering, reconnects and cancellation;
release subscriptions. Keep existing prepared-client behavior, tests, assertions and coverage.

**Never:** Change visual design, prepared fixtures, backend behavior, migrations or dependencies;
add a parallel process harness, permanent diagnostics, generic framework or unbounded retries.
Never access `.env*`, call live providers, production or external sources. One heavy check at a
time on the shared 8-GB/2-vCPU VPS. Do not commit, push, mark tickets or edit the decision ledger;
the parent owns delivery. No broader audit or unrelated cleanup.

## I/O & Edge-Case Matrix

| Scenario     | Input / State                                        | Expected Output / Behavior                                   | Error Handling                                           |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Admission    | Routed question, strong capability, explicit key     | Create and inspect run/thread; matching replay keeps IDs     | Refusal is sanitized and preserves HTTP status           |
| Confirmation | Low-confidence retained decision                     | Confirm receipt and edited validated inputs, resume same run | Wrong authority/conflict stays an explicit failure       |
| Cancellation | Queued/running/paused run                            | Cancel command and explicit cancelled stream terminal        | Transport abort never manufactures cancellation          |
| Continuation | Disconnect after complete frame                      | Preserve cursor, replay remaining ordered frames once        | Gaps, changed duplicates and wrong identity fail closed  |
| Completion   | completed/failed/cancelled/expired event             | Only explicit terminal envelope finishes successfully        | Early EOF/invalid frame cannot count as completion       |
| Transport    | Partial UTF-8/CRLF, malformed/oversized/stalled body | Existing bounded framing/deadlines and reader cleanup        | Safe error without capability, query or response payload |
| Routing      | Root or `/real-estate-intelligence` base             | Scoped create/inspect/confirm/cancel/SSE URLs                | No global endpoint or redirect credential forwarding     |

</intent-contract>

## Code Map

- `apps/web/src/ask/ask-client.ts`: existing `askTransportPolicy`, deadline/abortable/read/release
  and SSE loop are the adequate model. Extract only the shared bounded transport needed by both
  clients, retaining prepared methods/default config and `followAsk` behavior.
- `apps/web/src/api/client.ts`: `ApiReadError`/`publicRequestId` currently pull in Vite config.
  A config-free `api/read-error.ts` with re-exports from the old path prevents the native client's
  import from executing `import.meta.env`; this is an execution prerequisite, not a new layer.
- `apps/web/src/ask/ask-stream.ts`: `AskStreamDecoder` strictly parses prepared events. A small
  parser/envelope parameter with the prepared default shares its bounded UTF-8/SSE implementation
  with `parseAskLiveEvent`; use `.js` relative imports along this shared native-import path.
- `apps/web/src/ask/ask-session.ts`: prepared-only invariants; do not apply them to live runs,
  where confirmation legitimately returns to queued. Reuse ordering principles, not that model.
- `packages/contracts/src/ask/ask-live.dto.ts`, `intent-decision.dto.ts` and
  `intent-decision.types.ts`: existing strict live run/thread/event, routed create/accepted,
  confirmation and cancel parsers/types. Live modes include routed text and routed explanation.
- `apps/api/src/ask/ask-live.controller.ts`, `ask.controller.ts`: read-only public contract.
  Bearer on all protected operations, Idempotency-Key on create, Last-Event-ID on continuation.
- `integration/ask-intent-decision.integration.test.ts`: reusable owned fixture/readiness/AI
  startup and cleanup, without its unrelated historical-upgrade matrix.
- `integration/fixtures/ask-intent-fixture-bootstrap.ts`: reuse unchanged production graph with
  only the synthetic decider replaced: `uncertain` yields 0.84; `/fixture/decisions` counts calls.
- `integration/support/fixture.ts`, `http.ts`, `ask-diagnostics.ts`: existing owned lifecycle,
  native assertions, safe failure evidence and resource cleanup. No alternative harness.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/headless/` -- implement typed live create, inspect/thread, confirm, cancel,
      stream/session/follow operations with explicit base URL, capability and AbortSignal. Keep
      browser ownership explicit; no local storage or new credential mechanism. Support both routed
      admission versions using existing strict parsers. Preserve immutable identity and accepted
      evidence across replay; expose snapshots/cursor without replacing stream truth with GETs.
- [x] `apps/web/src/ask/ask-client.ts`, `ask-stream.ts`, `apps/web/src/api/client.ts` and the
      smallest config-free shared modules -- reuse transport/framing without changing prepared
      behavior. New shared import paths must satisfy strict NodeNext and browser bundling.
- [x] `apps/web/src/headless/*.test.ts` and affected existing tests -- exercise every matrix
      row, including terminal variants, prefix, resumption, refusal, abort and malformed transport.
- [x] `integration/ask-headless.integration.test.ts` -- actual imported product client exercises
      HTTP and SSE against native API/worker/AI/PostgreSQL/RabbitMQ. Use normal current migrations,
      allocated ports, fixture-owned tags, scripted AI and exact-owned cleanup. Product fetch is
      permitted; tests themselves use only the repository's approved HTTP/support APIs.
- [x] `package.json`, `docs/testing/integration.md`, `docs/api/ask.md` -- add a focused native
      alias and concise client usage/evidence limits in existing records, without duplicate reports.

**Acceptance Criteria:**

- Given an owned synthetic Compose stack, when the actual client creates an uncertain question
  and repeats its key, then identity remains unchanged and observed SSE includes queued, running
  and awaiting_confirmation. After disconnecting only upon a complete observed frame, confirming
  the retained receipt with edited inputs and resuming the same session, it receives ordered
  remaining events and explicit `ask.completed` with the edited deterministic result. Persisted
  receipt and decider counts prove no second classification.
- Given another paused run, when the client cancels it and follows its stream, then it receives
  explicit `ask.cancelled` with no tool effect, while wrong capability remains refused.
- Given existing prepared Ask tests, when shared transport is reused, then all their behaviors
  remain passing. Given root/prefixed base URLs and broken/failed/expired streams, when client
  tests execute, then scoped requests and matrix outcomes are directly observed.

## Implementation Notes

- Added the config-free headless client with explicit caller authority/key/lifetime and both routed
  admission versions. Inspect/confirm/cancel responses remain separate from stream-owned evidence.
- Extracted only the existing bounded transport into `ask-transport.ts`; the prepared wrapper keeps
  its defaults, methods and follow behavior. `read-error.ts` avoids the Vite configuration import,
  and a parser-parameterized decoder retains `AskStreamDecoder` as the prepared default wrapper.
- The live session retains only its latest snapshot, cursor and serialized frame. Exact latest-frame
  replay is suppressed; older/out-of-order frames and changed duplicates fail closed. This matches
  the server's strictly-after-cursor continuation contract without retaining an expanding history.
  Identity, prior steps, accepted decision, confirmation and deadline remain immutable. Confirmation
  can return to queued; only an admitted explicit terminal event makes the session terminal.
- The native campaign imports the product client directly, uses normal current migrations and the
  existing scripted intent bootstrap unchanged, and owns its tags, ports and exact-label cleanup.
  Complete foreign container/volume inventories are compared before and after teardown.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Shared SSE admission continued after an observer aborted within a
    multi-frame chunk, admitting a later terminal and resolving follow despite cancellation.
    Inspection confirms the decoder invokes the callback for every buffered frame and the
    transport checked cancellation only before the next physical read. Applied signal checks
    immediately before and after complete-envelope admission and a
    queued-plus-terminal coalescing regression. Only the first cursor is retained and the original
    abort reason propagates, without admitting later frames.

The repeated abort class was reassessed at its source: subscription lifetime crosses two execution
boundaries, physical I/O initiation and buffered complete-envelope admission. Lazy work protects
the first; the shared callback must protect the second. One central transport remains sufficient;
no additional state, framework, timeout or retry is needed. This is the single independent review
round for 5.9. After this correction, verification targets that behavior and affected regressions.

## Verification

Run serially. Start with changed headless and existing ask-client/session/stream unit tests.
Run workspace build, strict workspace/integration typecheck, lint/boundary/migration gates;
run the complete web suite with V8 coverage using exactly the include/exclusion flags and
80/80/80/75 floors in `scripts/test-coverage.sh`, scoped to `@rei/web` and one worker. This also
satisfies affected unit verification. Reuse 5.12 coverage and native evidence for unchanged
backend code by source/image identity rather than repeating its 1,070-test coverage and
313-second backend campaign. If backend code changes, run its affected existing coverage too.

Then run the entire new native headless campaign on the stabilized client, followed by changed
file formatting/Markdown lint and diff checks. No skip, retry setting or timeout increase.
Record commands/results and source/image identities here; retain genuine failed attempts and
classify product/executor/evidence defects with a bounded correction before rerunning.

Reuse local `rei-intent-images-{api,migrations,ai,worker}` without build after confirming IDs:
API `sha256:0559ed0168eb06db52f77cef0740fafe9fb17778633b2e6008a4f50a0edc6a56`;
migrations `sha256:3559d29f285dbbcbe6a01f351f06fdee0705d871a319451d24c2e031f9455d0d`;
AI `sha256:22c59a8d531e1f21911ba71aec016fb45f7dd2cb1eb9b6a8ce36fde819b2c8bf`;
worker `sha256:f4c4805c8d84f2120bb5157d82ec4cb23728a2f3970e15589af06fffe8d15ae8`.
Tag only the owned campaign services and preserve foreign resources. The native fixture mounts
this repository read-only for its existing scripted AI bootstrap. Do not start the default stack.

Risk raised from ticket low to medium for authenticated streaming/resumption; estimated change
exceeds 100 lines, selecting full automatically. Broad review count starts at zero for 5.9;
a mandatory independent quick review follows implementation, restricted to changed behavior.

### Implementation verification — 2026-10-26

- Source baseline remains `026428f245ac1ef3ef312f4f2dff0a098e87fc4c`. No backend,
  contract, migration, dependency or prepared-fixture source changed. The unchanged backend's
  1,070-test coverage, 53.38-second quota campaign and 313.46-second intent regression are reused from
  `story-thread-capability-and-demo-quotas-plan.md` by this source identity and the four image IDs
  above. `docker image inspect` confirmed all four exact planned IDs before campaign startup.
- Initial `pnpm --filter @rei/web exec tsc --build --force` failed during implementation on an
  erasable-TypeScript constructor parameter property and the broader event callback type. These
  were product typing defects: replaced the parameter property with an explicit field and emitted
  the admitted typed session snapshot. Full build and strict typecheck passed after correction.
- Focused command passed 6 files / 104 tests in 2.97 seconds:

  ```bash
  pnpm --filter @rei/web exec vitest run --dir src src/headless src/ask/ask-client.test.ts src/ask/ask-session.test.ts src/ask/ask-stream.test.ts
  ```

- `pnpm run build` passed. Vite emitted the existing bundle-size advisory; no gate was weakened.
- `pnpm run typecheck` passed all eight workspace checks and strict NodeNext integration checking.
- `pnpm run lint` passed ESLint, context boundaries and migration conventions.
- Full affected web coverage used exactly the flags from `scripts/test-coverage.sh`, scoped to
  `@rei/web`, with one worker:

  ```bash
  bash -c 'source <(head -n -1 scripts/test-coverage.sh); pnpm --filter @rei/web exec vitest run --dir src --passWithNoTests "${coverage_args[@]}"'
  ```

  All 44 files / 602 tests passed in 139.70 seconds. Statements 96.20%, branches 91.42%, functions
  96.73%, lines 97.23%; unchanged 80/80/80/75 floors and all original includes/exclusions passed.

- First native `pnpm run test:integration:ask-headless` attempt failed in 80.18 seconds
  (78.37-second test). Its evidence assertion incorrectly omitted the real second `running` frame
  emitted with the retained decision. The assertion now requires all four observed frames in order;
  persisted event IDs still independently establish complete ordered continuation.
- That attempt also exposed a product defect: after complete-frame abort, eager `reader.read()`
  could return a rejected promise before the pre-abort guard handled it, producing an unhandled
  rejection. The shared helper now starts fetch/read work lazily after checking its signal.
  The direct regression command passed one selected test:

  ```bash
  pnpm --filter @rei/web exec vitest run --dir src src/headless/ask-client.test.ts -t 'does not start a second read'
  ```

  It proves a single reader call, retained paused evidence, propagated abort identity and a
  released lock. Complete suite verification follows;
  no test was disabled and no timeout or retry policy changed. The failed native attempt completed
  owned cleanup and unchanged full foreign container/volume inventory checks.

- After the abort correction, `pnpm --filter @rei/web run build`,
  `pnpm run typecheck:integration`, and ESLint over all changed TypeScript files passed. The prior
  full-workspace build/typecheck and context/migration gates remain valid for unchanged sources.
- Repeated the complete web coverage command above on the corrected transport: all 44 files /
  603 tests passed in 142.17 seconds, with statements 96.27%, branches 91.42%, functions 96.94%
  and lines 97.24%. Every original coverage floor and include/exclusion remained unchanged.
- Final `pnpm run test:integration:ask-headless` passed its native campaign in 78.23 seconds
  (76.19-second test), with no unhandled errors. Ordered live replay, confirmation, completion,
  cancellation, authority boundaries, retained decision/tool counts, owned cleanup and full foreign
  container/volume inventory equality all passed.
- The first final formatting pass identified one missing blank line around this verification's
  fenced command. Its Markdown invocation also inherited the repository-wide configured glob,
  linting generated BMad artifacts outside the changed scope. These were executor/evidence defects:
  formatted this plan and repeated Markdown lint with `--no-globs` and the exact changed documents,
  preserving every repository rule.
- Final changed-file Prettier, scoped Markdown lint (three documents), and `git diff --check`
  passed. Implementation is ready for the parent-owned independent quick review and delivery audit.
- Independent review found a second abort boundary: a complete-frame callback could abort while
  later frames remained in the same chunk, allowing a buffered terminal to resolve the subscription.
  Caller-owned lifetime must hold both before physical I/O starts and around each complete-envelope
  admission. The existing lazy work guards the first boundary; the shared transport now checks its
  signal immediately before and after `onFrame`, covering prepared and live clients without new
  state, abstractions or retries. A single-chunk queued-plus-terminal regression first reproduced
  successful resolution, then passed after correction with only queued observed, its cursor retained,
  a nonterminal session, the exact abort reason and a released reader. Affected headless/prepared
  client tests passed: two files / 55 tests in 1.33 seconds. Parent owns final broader verification
  against this correction.

### Parent verification after independent-review correction

- The two signal guards and coalesced-frame regression were inspected against the complete
  refreshed unified diff. Every matrix row has direct unit/native assertions; no skip, retry,
  deadline, coverage floor, hook or required gate changed.
- `pnpm --filter @rei/web run build` passed in 5.82 seconds;
  `pnpm run typecheck:integration` passed in 19.04 seconds; ESLint over the two patched TypeScript
  files passed in 3.88 seconds. The existing full-workspace build/typecheck/lint and unchanged
  backend evidence recorded above are reused by source/dependency identity.
- The complete web coverage command above passed 44 files / 604 tests in 138.32 seconds on the
  final runtime. Statements 96.27%, branches 91.42%, functions 96.94%, lines 97.24%; all original
  includes, exclusions and floors remained intact. This is the stabilized affected unit campaign.
- Final `pnpm run test:integration:ask-headless` passed one complete native test in 73.54 seconds
  (71.67-second test). It proved retained confirmation and ordered resumption through explicit
  completion, explicit cancellation, wrong-authority refusals, persisted receipt/decision/tool
  counts, exact-owned cleanup and unchanged full foreign container/volume inventories. No
  unhandled error or provider request occurred.
- The final twelve-file non-document source manifest is retained at
  `/tmp/rei-headless-final-source.json`, SHA-256
  `0ba1d37da1dd7f98ae265f93def68188e8977e76280ac2a2cd72698b6bf4339e`.
  The first test commit was blocked by secret scanning on a deterministic fixture-only key.
  Replaced that literal with an unmistakably synthetic repeated string; no rule or allowlist
  changed. The three directly affected headless test files passed all 55 tests in 1.81 seconds.
  Product/native sources are unchanged, so their final coverage/native results remain valid.
  The delivered manifest is `/tmp/rei-headless-delivery-source.json`, SHA-256
  `90ebd01500b7594ab87d548dfd735c8a3d05f96ccbffb6ae6f442a1f903263a5`.
  Hooks preserve these exact delivered contents.

## Auto Run Result

Implemented the config-free typed live client and stream-owned session under `headless/`, with
explicit authority, scoped URLs, idempotent admission, confirmation, cancellation and bounded SSE
continuation. Shared transport preserves prepared-client behavior and cancellation at both I/O
and buffered-frame admission boundaries. No backend, schema, dependency or visual design changed.

Files changed:

- `apps/web/src/api/client.ts`: preserve the existing error exports through the config-free module.
- `apps/web/src/api/read-error.ts`: retain sanitized error and public request-ID handling.
- `apps/web/src/ask/ask-client.ts`: reuse transport while preserving prepared-client defaults/API.
- `apps/web/src/ask/ask-stream.ts`: share bounded framing through a typed parser parameter.
- `apps/web/src/ask/ask-transport.ts`: share bounded HTTP/SSE, command bodies and abort ownership.
- `apps/web/src/headless/ask-client.ts`: implement typed live commands, reads and resumable follow.
- `apps/web/src/headless/ask-session.ts`: retain ordered immutable evidence and explicit terminals.
- `apps/web/src/headless/ask-client.test.ts`: cover commands, prefix, failures, lifetime and replay.
- `apps/web/src/headless/ask-fixtures.test.ts`: validate shared synthetic versioned test envelopes.
- `apps/web/src/headless/ask-session.test.ts`: prove ordering and retained-evidence invariants.
- `integration/ask-headless.integration.test.ts`: prove the actual client against owned services.
- `package.json`: expose the focused native campaign without rebuilding unchanged images.
- `docs/api/ask.md`: document caller ownership and headless usage.
- `docs/testing/integration.md`: document native execution and evidence limits.
- `epic-ask/epic-ask.md`: record the delivered CAP-14 slice in the existing epic.
- `epic-ask/story-headless-web-client-plan.md`: preserve plan, failures, triage and final evidence.

Review breakdown: one independent quick pass; one medium patch applied, zero high/low patches,
zero deferred and zero rejected findings. Follow-up review recommendation: **false**. Targeted
inspection and the directly affected regression cover the only finding; another broad pass is
not required. Historical reviews and evidence remain preserved.

Verification: the commands and observed results above establish the matrix and unchanged gates.
Final changed-file formatting, scoped Markdown lint and diff checks passed before commits.

Residual limits: prefix behavior is unit-tested and the actual HTTP/SSE journey is local/native;
this story supplies no public HTTPS, browser visual, live-provider or production acceptance.
Those requirements remain with the existing production stories and final published E2E campaign.

## Delivery closure

Story 5.9 is done after the parent observed final native acceptance, affected coverage, unchanged
workspace/backend gates and the required independent review. Delivery commits:

- `e198fe94ee36f486768b4edc741447642cfa786d` — feat: add resumable headless live run client.
- `4863fef50c770523422a4b326492b740b52d9f19` — test: prove headless confirmation and cancellation.
- `e9985b878453074d3882561ab60bd02edd1de409` — docs: record verified headless client delivery.

The built gate observed a clean product repository with all sixteen reviewed files committed and
all twelve delivered source hashes unchanged by hooks. The orchestrator marked 5.9 done and
continues `tickets.py next`. No push, production mutation or provider call belongs to this delivery.
