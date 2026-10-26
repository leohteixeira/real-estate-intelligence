---
title: 'Public run endpoints and resumable stream'
type: 'feature'
ticket: '8'
created: '2026-10-26'
status: 'built'
baseline_revision: '79a791aa389abcbdf92209afe7c3c74455427e19'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/home/vscode/.codex/skills/nestjs-modular-monolith/SKILL.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-14's public client cannot create routed runs, confirm their retained proposal or
cancel pending work. Existing durable SSE has not proved a disconnect after an observed frame.

**Approach:** Connect the public versioned routed commands to existing application/persistence
seams, add general routed cancellation under the same thread lock, and prove real SSE continuation.

## Boundaries & Constraints

**Always:** Strong caller-known Bearer capability, creation-key/body/authority replay, closed typed
JSON, same retained confirmation and Market operand validation. Cancellation covers queued, running,
confirmed-queued and awaiting routed work. SQL deadlines and first terminal win; preserve evidence
and one atomic terminal/event/outbox/inbox. Fences reject late writes. Keep every historical tracer,
prepared example, original campaign assertion and public-prefix integration. One heavy load at a time.

**Never:** Capability issuance/recovery by creation key, quota/visitor policy, headless/UI work,
provider changes/live calls, new scheduler/remote kill/retry/timeouts, broad audits or historical
contract weakening. No production action, `.env*` access, new dependency or duplicate reporting.

## I/O & Edge-Case Matrix

| Scenario                    | Input / state                                    | Expected behavior                                      | Error handling                                |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------- |
| Routed creation/replay      | Strong authority, closed routed body and key     | 202, same run/thread on matching replay                | Existing 400/401/403/409/429/503              |
| Confirmation                | Awaiting run, matching receipt, validated inputs | Same run resumes without another decision              | Wrong receipt/path/body or authority rejected |
| General cancellation        | Queued/running/awaiting routed run               | Cancelled, visitor_cancelled, one terminal effect      | Existing capability/thread fences             |
| Race/replay/deadline        | Cancel vs terminal/expiry or duplicate cancel    | First terminal retained; no repeated effects           | SQL-clock expiry wins when due                |
| Disconnect/reconnect        | Last complete observed versioned SSE ID          | Every later stored event once, final explicit terminal | Invalid/foreign/future cursor rejected        |
| Consumed terminal/transport | Terminal cursor or broken connection             | Empty completed replay or transport closure            | No fabricated product terminal                |

</intent-contract>

## Code Map

- `apps/api/src/ask/ask-live.controller.ts::create`, `strongAskBearer`, `liveAuthorized` already
  provide public admission, parsing/error/config gates. Add routed selection and a closed matching
  accepted response. Add `/runs/:id/confirm` and `/runs/:id/cancel` in this live controller using
  existing `askRequestWork` cancellation and `readQuery(...,'none')`. Bind path/body run identity.
- `packages/contracts/src/ask/intent-decision.dto.ts` already parses routed create/confirmation;
  `ask.command.dto.ts::parseAskCancelRequest` owns the exact visitor reason. Mirror/export a routed
  accepted response through existing context/root facades if needed; preserve prepared contracts.
- `packages/application/src/ask/ask-run.service.ts`, `ask-live.facade.ts`, `ask-run.repository.ts`
  already own createRouted/confirm/refuse. Add only a cancel delegation seam; update necessary doubles.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` owns `stored`, `authorize`, `lock`,
  `lifecycleAt`, `append`, `expireRouted` and atomic terminal effects. General cancel validates UUID,
  authorizes before and after the thread lock, rereads, rejects historical modes, returns existing
  terminals, checks existing SQL deadlines and appends one cancelled transition. Reuse expiry rather
  than duplicating it. Protect deadline crossing at the actual transition as existing confirmation
  does. Keep existing refusal semantics and retained decision/confirmation/tool/checkpoint data.
- `ask-execution.authorization.ts::authorizeAskExecution` already requires running under the same
  thread lock; tool/decision/model/checkpoint writes use it. `claim` returns terminal, and
  `completeRouted` rejects cancelled terminals. Reuse these fences; no remote interruption protocol.
- `apps/api/src/ask/ask.controller.ts::{run,thread,events}`, `ask-live-stream.ts` and repository
  `events` already implement authorized persisted cursor replay and cancellable polling. Change
  only a demonstrated defect; terminal already consumed means empty completion, not a repeated event.
- Existing controller/service/contract/repository unit tests cover errors, fixture isolation and
  transition doubles. `ask.controller.test.ts` currently asserts missing command routes: replace
  that expectation for actual live commands while retaining prepared-fixture immutability.
- `integration/ask-intent-decision.integration.test.ts` and its scripted decider bootstrap own the
  adequate real API/worker/AI/PG/Rabbit fixture. Extend that campaign, driving this slice through
  public HTTP and a narrowly scoped Supertest stream parser/abort after an observed complete frame.
  Reuse SQL barriers/owned fault injection and public parsers, not fetch/net/Node assertion harnesses.
- `scripts/prepare-ask-intent-images.sh` and pnpm alias prepare four images serially outside the
  unchanged bounded campaign. Tag verified current images into its UUID project; never cold-build
  inside the 600-second scenario. Retain exact ownership, cleanup and foreign-resource assertions.
- `migrations/6006_ask_intent_decisions.sql`, `6007_ask_unavailable_intents.sql` and routed parser
  already permit cancellation without a decision. Preserve them; no schema migration is expected.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/ask/intent-decision.*`, public facade exports and direct tests — close
      routed accepted/confirmation/cancellation transport shapes, reusing existing parsers.
- [x] `packages/application/src/ask/ask-run.{repository,service}.ts`, necessary doubles/tests and
      `packages/infrastructure/src/ask/ask-run.pg-repository.ts` / existing repository tests — implement
      cancel with authority/races/deadlines/atomic effects; test direct affected cases before
      broad gates.
- [x] `apps/api/src/ask/ask-live.controller.ts`, existing live/HTTP/stream tests — connect routed
      create, inspect, confirm and cancel; preserve sanitized errors, strict inputs and disconnect signal.
- [x] `integration/ask-intent-decision.integration.test.ts` and existing fixture if necessary — exercise
      public commands, actual observed-frame disconnect/reconnect, cancellation states, deadlines,
      late authorities and SQL rollback without removing any prior matrix assertions.
- [x] `docs/ask-intent-decisions.md`, epic Notes and this plan — document actual public protocol,
      D-101, final evidence and any bounded limitation in the existing records.

**Acceptance Criteria:**

- Given public routed POST with a valid key and capability, when it is replayed or inspected, then
  HTTP observes one durable identity and actual typed result; changed body/foreign authority fail.
- Given awaiting work, when public confirmation names its retained receipt and valid edited operands,
  then that run resumes once without another decision; wrong path/receipt/body/authority fails.
- Given queued, running or awaiting work, when authorized public cancellation commits, then HTTP
  and stored SSE show one cancelled terminal, pending siblings can proceed and stale execution,
  tool/decision/checkpoint/terminal writes cannot append later effects. Already committed evidence
  survives; duplicate cancellation and cancellation after another terminal preserve first truth.
- Given queued/confirmation deadlines or concurrent cancellation/completion and injected transaction
  failure, when commands reach the public boundary, then existing SQL-clock expiry or one terminal
  wins, and real PostgreSQL proves atomicity without partial event/outbox/inbox effects.
- Given a real open SSE stream with a complete frame observed, when the client aborts, events accrue
  and it reconnects with that observed Last-Event-ID, then concatenated received frames equal stored
  ordered history exactly, each ID occurs once and an explicit terminal ends the stream. Repeat
  after API restart; terminal cursor is empty, hostile cursors/authority remain rejected.

## Implementation Notes

- Loaded all frontmatter context before implementation. Existing Ask ports, Market validation,
  SQL transactions and execution authorization remain the model; no migration or dependency was
  needed. Historical and prepared contracts remain intact.
- Public creation selects `routed-text-v1` through `createRouted` and returns the closed identity
  acceptance without authority issuance. Confirmation binds path/body identity and retained receipt;
  cancellation reuses the exact existing visitor reason. Both return the typed retained run.
- General cancellation authorizes before and after the thread lock, rereads retained state and
  returns existing routed terminals unchanged. It reuses `expireRouted` before and at the transition,
  preserving SQL deadline precedence and all prior evidence, then commits one terminal/event/outbox/
  inbox transaction. The existing running-state fences reject late writes. Refusal is unchanged.
- SSE production code required no change. The campaign parser aborts only after a complete frame is
  observed, then reconnects from that exact cursor, including after API restart. Existing assertions
  remain; the primary routed creation and confirmation journey now also uses public HTTP.
- Full coverage was run once with unchanged flags/floors because a prior unchanged-source and
  dependency identity comparison had not been established before that run. No second full run is
  needed for documentation-only evidence updates.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. One independent quick lens inspected the complete changed diff, acceptance and
  surrounding code; no issue was reported. Parent read the entire diff and verified the matrix
  against executed direct tests, full coverage and the real campaign. No broad follow-up is needed.

## Design Notes

D-101 is recorded before coding in the owner's append-only ledger and epic Notes. ADR 0023 already
requires caller-known authority; no new issuance is needed. New live commands target routed mode;
historical tracers retain their published capabilities and explicit command rejection. Cancellation
returns an existing terminal unchanged, with truthful state, rather than overwriting it. General
cancel does not require a decision receipt because queued/running work may not have a decision.

Full route applies to more than 100 nonmechanical lines across HTTP, contracts, application,
persistence and proof. Risk rises from medium to high because cancellation and authority races can
otherwise produce invalid effects. Existing ADRs override Nest examples (D-012/ADR 0020); existing
BMAD plan/handoff overrides interactive planning. Parent owns independent quick review, final
verification/commits/ticket closure. Implementer must not commit/push/delegate or alter production.

## Verification

- Direct changed contract/application/API/repository/stream cases first — exact transport, authority,
  transition, replay and cancellation boundaries pass without skips or retries.
- `pnpm run build`, `pnpm run typecheck`, `pnpm run lint`, sequential — existing gates pass.
- Existing workspace coverage with unchanged script flags/floors — run affected packages; reuse
  valid unchanged code/dependency results when demonstrated, otherwise one serial full coverage run.
- `pnpm run test:integration:prepare-ask-intent`, then
  `pnpm exec vitest run --config vitest.integration.config.ts integration/ask-intent-decision.integration.test.ts`
  — final stabilized images pass the entire original and added public journey matrix.
- Owned formatting/Markdown checks, normal commit hooks and `git diff --check` — pass. Record
  actual source/image identities and outcomes; docs-only updates do not rerun product tests.

### Implementer evidence (2026-10-26)

- Final direct changed cases: contracts 10, application 1, infrastructure 43 and API/HTTP/stream 26
  passed (80 tests). `pnpm run build`, `pnpm run typecheck` and `pnpm run lint` passed sequentially.
  The existing Vite large-chunk warning remains informational.
- The unchanged `pnpm run test:coverage` passed 3,097 tests across all eight workspaces. Affected
  statements/branches/functions/lines percentages: contracts 90.70/89.69/92.54/92.66, application
  91.27/90.20/95.63/92.66, infrastructure 83.45/77.13/89.30/85.26 and API 94.65/85.29/97.82/95.76.
- Owned Prettier, documentation Markdown and `git diff --check` passed. The parent owns independent
  review, final commit hooks, commits and ticket closure; the implementer does not commit or publish.
- The seven-file source manifest (controller, routed DTO/types, repository/service ports,
  PostgreSQL repository and extended campaign) has SHA-256
  `083afae389216f4d1498eeba63640bd79248de02d799d2fbd2f692ffa9994332`.
- Serial `pnpm run test:integration:prepare-ask-intent` passed for all four services. The native
  campaign passed 1/1 in 223.46 seconds (220.93 seconds in the test), within the unchanged
  600-second bound, with zero unhandled errors. It retained every original assertion and passed
  public identity replay, confirmation, both observed-frame SSE abort/reconnect cases (one across
  API restart), cancellation states, pending-sibling release, outbox/inbox rollback, post-lock
  authority change, SQL expiry, preserved evidence, late-write fences and terminal races. Owned
  fixture containers were removed after completion.
- The first campaign attempt exposed a test-helper lifecycle error: unbuffered Superagent completes
  at response headers, before the custom parser observes a frame. Diagnosis preceded the retry.
  The custom parser now owns buffered completion and aborts only after one complete parsed event;
  heartbeat blocks are drained from the same chunk. Strict integration typecheck, targeted ESLint
  and Prettier passed after this test-only correction; production code and prepared images did not
  change. The succeeding full campaign used those same images.
- Prepared image IDs (the campaign tags these into its owned UUID project):
  - migrations: `sha256:55fcc29b700b7276ca80a93aae6ab42c3d4eee170599b131fdd1243b42f838d4`
  - API: `sha256:94a2d8e654bb841d051817be250e7378f26ba4b3a96a3177ea28481e4f01f713`
  - AI: `sha256:9e763633eb476766c8c7e70e094a77ea2fd318a9e7930ec06860ea51b1552334`
  - worker: `sha256:be9ad55c26207d6a53df86091345b35404dcf4012440b99799d358612be1cfd8`

## Auto Run Result

- Implemented public routed create, inspect, receipt-bound confirm and general cancel with retained
  capability and identity replay. Existing durable SSE now has observed-frame reconnect evidence,
  including API restart. Cancellation preserves evidence, SQL expiry and first-terminal truth.
- Changed `ask-live.controller.ts` for HTTP commands; routed DTO/types for closed acceptance;
  repository/service ports for cancellation; PostgreSQL repository for atomic state transition;
  existing controller, contract, service and repository tests plus the original real campaign for
  public protocol and race proof. Updated existing protocol documentation, epic Notes and this plan.
- One independent quick review reported zero findings. Patches: high 0, medium 0, low 0. Deferred
  and rejected findings: none. `followup_review_recommended: false`; no unverified follow-up risk.
- Matrix audit passed: creation/replay and confirmation are exercised by direct API/contracts tests
  and public campaign; cancellation states/races/deadlines by repository tests and real SQL campaign;
  observed-frame reconnect/cursors and consumed terminal by public campaign; transport closure by
  the executed existing `ask-live-stream.test.ts`. All covering tests ran and passed.
- Parent consumed the successful final build, strict typecheck, lint, coverage and full campaign
  evidence above without repeating unchanged product checks. The corrected test-helper lifecycle
  passed strict integration typecheck, targeted lint/format and the final entire campaign. Its
  failure is bounded to that executor; no product SSE defect was demonstrated.
- Finalization uses normal mandatory commit hooks. Only documentation changed after successful
  product verification. No migration, dependency or production change and no remaining acceptance
  defect is known for this slice. Public production evidence and final goal campaign remain at
  their applicable later delivery steps.
