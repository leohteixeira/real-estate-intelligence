---
title: 'The worker reaches the AI service through RunExecutor'
type: 'feature'
ticket: '17'
created: '2026-10-11'
status: 'built'
baseline_revision: '556bad91d0a341f2e30e91aff1f85f31baeb1bc4'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
warnings: [oversized]
deferred: []
---

# RunExecutor Implementation Plan

**Goal:** Prove a real worker executes the initial graph on the real isolated AI service through
an authenticated, bounded, vendor-neutral port.

**Architecture:** Ask application port and neutral types; single-attempt infrastructure HTTP
adapter plus test-only fake; worker-owned named resilience composition and one-shot command;
AI-owned authenticated internal endpoint invoking the existing LangGraph. D-044 was recorded
before implementation. No public creation, persistence, provider or deterministic-tool execution.

**Tech Stack:** TypeScript, NestJS 12, LangGraph, existing `@nestjs/resilience`, native Vitest,
Supertest, owned Testcontainers/Compose, Execa and Nock. Bmad-build-auto's prescribed agents,
ticket plan path and source/tests/docs commit sequencing override writing-plans defaults and
unavailable superpowers workflows. Estimated 1,000–1,800 changed lines across >5 meaningful
files selects full; retain ticket high risk for authentication and process isolation.

<intent-contract>

## Intent

**Problem:** Ticket `epic-ask 17` (5.17, CAP-13, after 5.1/1.1/1.4) requires RunExecutor, HTTP
adapter, in-memory fake, internal token, execution endpoint and both processes' configuration.
The verify must observe an actual worker process executing a run on actual AI HTTP, not a ping,
adapter constructed by the test runner or a public prepared preview.

**Approach:** Publish internal closed version-1 foundation execution request/response contracts,
invoke the existing no-op graph and report its actual visited node with correlated identities.
Compose a real production worker command through the port and its policy wrapper. Authentication
is scope-bound, fail-closed and configured only for worker/AI; no question echo or public result.

## Boundaries & Constraints

**Always:** ADRs 0003/0004/0007–0014/0020, D-012/D-043/D-044 win over skill defaults. Application
depends only on domain; neutral port types never expose SDK/HTTP errors. AI cannot depend on
infrastructure or receive DB/broker/storage credentials. All repository content English; pnpm
only; no `.env*` reads/searches/edits. Integration files/helpers/probes are strict TypeScript,
native Vitest/Supertest/owned Compose support; untrusted JSON is unknown, parsed closed. Preserve
every existing scenario, coverage floor, hook and foreign Docker resource. One attempt in adapter
and retry policy; deadline/cancellation cover queue/admission/transport/body read and command cleanup.

**Never:** Model/provider calls, live source/VPS/deploy/push, public arbitrary execution endpoint,
operator-token backdoor, durable run/checkpoint/queue/idempotency claims, business price result,
automatic run startup, new UI, SQL/migrations or alteration of D-043 preview metadata. No fixed
token, credential in URL or logs, redirects, raw cause propagation, unsafe parser cast, Node
test/assert/custom integration HTTP/process harness. The fake is never a deployed provider.

## I/O & Edge-Case Matrix

| Scenario               | Input / State                                                                                   | Expected Output / Behavior                                                                                 | Error Handling                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Execution              | Configured token, valid v1 UUIDv7 run/thread, foundation step, bounded query and locale         | Real LangGraph noOp visited; correlated foundation-executed evidence, no analysis or question echo         | Closed response only                                         |
| Authorization          | Missing/wrong/malformed Bearer, or absent configured token                                      | No graph invocation or payload disclosure; liveness remains available                                      | Fixed 401/503 category, no token reflection                  |
| Request boundary       | Extra/missing field, wrong version/step/UUID, blank/over-16k query, invalid locale/content type | No execution, no graph state or retained caller payload                                                    | Fixed 400/415 category                                       |
| Response boundary      | Invalid content type/JSON/version, identity/step mismatch, extra keys, oversized body           | No accepted execution evidence                                                                             | Closed rejected failure                                      |
| Dependency failure     | Network, 429/5xx, 400, 401/403, redirect or unexpected exception                                | Exactly one HTTP attempt, mapped closed failure; no fake success or retry                                  | transient/rejected/unauthorized/forbidden, sanitized         |
| Bound resources        | Caller abort/deadline, slow body, bulkhead/rate rejection, open breaker                         | Bounded failure, cancelled work, no second attempt or leaked listeners                                     | Categorical cancelled/transient/exhausted according to cause |
| Disabled configuration | Absent token, invalid configured token, credential/query/fragment/path URL                      | Collection startup preserved when absent; explicit execution refuses; invalid configured settings sanitize | No network on disabled/invalid path                          |
| Fake isolation         | Same port, failure/abort, caller mutation                                                       | Deterministic cloned result and captured input, no caller-owned mutation                                   | Same closed failure vocabulary                               |
| Privacy/isolation      | Real hop plus failure journeys                                                                  | No token/query/raw payload in output; AI has no infra edge/credentials; public prepared reads unchanged    | Every resource cleanup failure retained                      |

</intent-contract>

## Code Map

- `apps/worker/src/ask/ask.module.ts` is empty but already imported once by WorkerModule.
  Existing `collection/collect-synthetic.ts`, `synthetic-collection-command.ts` and command module
  provide explicit Nest one-shot/preload/deadline/SIGTERM/cleanup precedent. Do not activate AI as
  an unconditional worker dependency or start execution automatically.
- `packages/application/src/ask/index.ts` and root index expose fixture read facade; add execution
  port/token here. `shared/external-failure.ts` already supplies sanitized closed ExternalFailure.
- `packages/contracts/src/ask/index.ts` plus `shared/wire.ts` and Ask command parsers provide exact
  object keys, canonical UUID/date and bounded query conventions. Contracts cannot import domain;
  domain neutral execution types keep application independent of wire package.
- `packages/infrastructure/src/ask/index.ts` contains SyntheticAskAdapter. Add HTTP adapter and
  test-only in-memory execution fake here, never wire the fake to production.
- `apps/worker/src/shared/resilience/resilient-event-publisher.ts`, `slow-call-circuit-breaker.ts`
  and `resilience-telemetry.ts` show ordered public-policy plumbing. Reuse shared plumbing, not
  foreign Collection policies. Extend telemetry's explicit safe-name allowlist for Ask.
- `apps/ai/src/graph/no-op.graph.ts` compiles actual START/noOp/END, `GraphModule` exports it.
  Invoke/stream this graph, collecting actual noOp traversal; don't return static echo evidence.
  `app.module.ts`, `config.ts` and `main.ts` hold AI composition/config/startup; health stays open.
- `docker/ai.Dockerfile` currently builds/copies only AI; declare contracts/domain workspace edges
  actually used, copy required manifests/source, recursively build/deploy. Worker Dockerfile
  already copies packages. AI must never acquire infrastructure. Pin lock changes through pnpm.
- `compose.yaml` has worker→DB/broker/storage and AI→API; add AI_URL and internal token only to
  worker/AI without new unconditional worker depends_on. Empty token is a disabled safe default.
- `integration/support/fixture.ts`, `http.ts`, `network.ts` own Testcontainers, Supertest, Execa,
  get-port and exact Nock allowances. Use product Compose with `.env` disabled and fresh ownership.
  `ask-contracts.integration.test.ts` proves prepared API and zero SQL mutation. Fresh Node24 TS
  probes may load compiled product exports but must not import Vitest or recreate assertions.

## Tasks & Acceptance

**Execution:**

- [x] Read the repository instructions and
      `/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` fully before backend edits,
      with architecture-patterns, module-communication, state-isolation, testing-patterns and
      authentication references. Main independently loaded these. This plan is already the active
      bmad-build-auto run: do not invoke/render another build workflow, spawn additional agents,
      commit, push or mark tickets. Parent owns independent verification, review and commits.
- [x] `packages/domain/src/ask/run-execution.types.ts`, Ask/root indexes — neutral immutable input
      and evidence types with explicit foundation scope; no domain business calculation or SDK.
- [x] `packages/contracts/src/ask/run-execution.dto.ts`, Ask index — exact independent parsers
      for request/response. Version 1, canonical UUIDv7 run/thread, step foundation, query nonblank
      <=16,000 chars, locale pt-BR/en; result foundation-executed and actual noOp node evidence.
      No public terminal/result/capability or echo. Header run/step key must match body if used.
- [x] `packages/application/src/ask/run-executor.port.ts`, Ask/root indexes — port/token using
      neutral types, AbortSignal and absolute deadline; errors use ExternalFailure only.
- [x] `packages/infrastructure/src/ask/http-run-executor.adapter.ts`,
      `in-memory-run-executor.adapter.ts`, indexes — one fixed authenticated POST, no redirects,
      bounded body/abort and request/result identity validation; closed error mapping. Fake clones
      input/result, supports typed failure and cancellation. Add contracts workspace edge only here
      and where consumed; don't use infrastructure inside AI.
- [x] `apps/ai/src/execution/execution.module.ts`, `execution.controller.ts`,
      `execution.service.ts`, `config.ts`, `app.module.ts`, `main.ts` — minimally scoped execution
      authorization before payload validation/invocation; bounded JSON, sanitized parser/unexpected
      errors; invoke existing graph with cancellation and report actual node traversal. Strict
      optional token config: missing disables execution, malformed supplied value fails sanitized.
      Preserve health and never log raw startup exceptions containing config secrets.
- [x] `apps/worker/src/ask/run-executor.config.ts`, `run-executor-resilience.settings.ts`,
      `resilient-run-executor.ts`, `ask.module.ts`, `run-command.module.ts`,
      `run-execution-command.ts`, `execute-foundation.ts` — production port/adapter/policy DI,
      separate explicit one-shot command requiring configuration, inputs read from bounded stdin
      or safe nonsecret args, never token/question in shell argv. Preload OTel, handle signals,
      bound whole operation/cleanup, print only safe parsed evidence, categorical failure. Keep
      existing collection startup when execution disabled and do not bring DB/broker into command.
      Central policy settings are D-044; retry attempts 1 even for transient failures.
- [x] `apps/worker/src/shared/resilience/resilience-telemetry.ts`, workspace manifests/lock,
      `docker/ai.Dockerfile`, `compose.yaml`, root `package.json` — safe telemetry names, truthful
      dependency/build order, command and focused integration aliases, worker AI URL and minimal
      shared token config. No default secret, fixture env file or foreign service dependency.
- [x] Adjacent `*.test.ts` for types/contracts/adapter/fake/auth/service/config/policy/command —
      TDD for every matrix row, exact one-attempt failure counts, abort/body-size/identity, no-op
      actual traversal, fake mutation isolation, disabled config and sanitized error/output.
      Example golden assertion: valid parsed evidence has `outcome === 'foundation-executed'`,
      matching run/thread/step, and actual visited node `noOp`, with no query/token fields.
      Run named failing test before implementation, then focused package Vitest. No suppressions.
- [x] `integration/run-executor.integration.test.ts` — real production AI image and production
      worker executable through Nest RUN_EXECUTOR, random ephemeral token, shared owned fixtures.
      Two distinct tests: HTTP/auth/config boundary integration and worker-command→real-AI E2E.
      Prove unauthenticated/wrong-token refusal, valid traversal, invalid request, no question/token
      logging, zero public fixture/SQL changes and no AI infra credentials. No adapter-only proxy.
- [x] `docs/api/run-executor.md`, `docs/testing/integration.md`, this plan — documentation-writer
      reference for exact endpoint/shapes/errors/config/command, no-op scope, no durable guarantee,
      test commands and independent evidence. Parent runs final gates, review, auto-commits source
      first/tests second/docs last with normal hooks and closes done only after verified built.

**Acceptance Criteria:**

- Given owned real AI HTTP and the built worker executable with ephemeral internal token, when the
  production one-shot command executes a foundation run through its Nest port, then evidence
  correlates run/thread/step and reports actual noOp traversal, with no public analysis completion.
- Given the same service, when callers omit/change the token or submit invalid v1 payloads, then
  HTTP refuses safely before graph execution and discloses neither input nor authority.
- Given aborted, expired or failing dependency calls, when the worker invokes the port, then each
  operation has at most one real attempt, bounded completion and the documented safe failure;
  breaker/admission policy never manufactures successful graph evidence.
- Given normal collection configuration without AI token, when the worker starts and existing
  campaigns run, then startup and collection remain functional while explicit execution is closed.
- Given real hop/auth/E2E journeys and before/after resource snapshots, when verified, then public
  prepared Ask reads and every owned SQL digest remain unchanged, AI holds no infrastructure
  credentials/dependency and foreign Docker resources survive exact-label cleanup.

## Implementation Notes

- Loaded every frontmatter context file and the complete NestJS modular-monolith skill plus its
  five required references. Repository/D-044 rules take precedence over sample stack guidance.
- Internal request/evidence v1 shapes use foundation-only neutral types; application remains
  domain-only, while contracts are independently validated and never import domain.
- AI authenticates the scoped endpoint before JSON middleware, streams actual graph updates and
  sanitizes both parser and unexpected failures. Missing authority keeps health available.
- Worker production DI wraps the fixed HTTP adapter in named ordered policies with one attempt.
  The explicit command accepts bounded stdin, preloads telemetry, handles signals and deadlines,
  preserves sanitized primary/cleanup failures and imports no persistence/broker/collection module.
- TDD red runs were recorded for `run-execution.dto.test.ts`,
  `http-run-executor.adapter.test.ts`, `execution.service.test.ts`,
  `run-executor.config.test.ts` and `run-execution-command.test.ts` before their implementations.
  Additional HTTP tests found the oversized parser-error classification, corrected to closed 413.
- An additional red adapter test demonstrated caller mutation during transport could invalidate
  identity correlation; the adapter now snapshots the validated request before making its one POST.
  Worker tests also cover rate refusal, every stalled cleanup and signal-listener restoration.
- Added distinct real-image HTTP integration and production worker-command E2E tests with ephemeral
  authority, SQL/public-read snapshots, privacy/isolation evidence and owned resource cleanup.
  Parent independently owns final campaign/gate evidence, review and ticket status.

## Plan Change Log

- Parent verification found the initial named calibration diverged from the already-recorded
  D-044 values. A failing policy regression established the mismatch; settings and reference now
  retain 3 concurrent/6 queued calls, 1 s admission, 10 attempts/s, 5 s attempt timeout and the
  20-call/10 s breaker with a 4 s slow threshold. This corrects implementation, not intent.
- Additional control-character request/evidence and configured-token regressions confirmed the
  existing non-multiline validators already reject trailing line breaks; no parser change was needed.
- The quick review's two independently reproduced medium findings were patched by re-engaging
  the original implementation agent. Pending context acquisition now remains inside bounded
  finalization; obtainable close failures accompany the exhausted primary. Unsupported parser
  charset and content encoding now produce 415 after authority validation, while unknown
  middleware failures remain sanitized 503. Two command regressions and three HTTP regressions
  passed in the subsequent root test and coverage runs; the intent contract is unchanged.

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Late context cleanup failure was lost after cancellation — the parent
    reproduced a 10 ms deadline, 40 ms context acquisition and rejecting close against the
    compiled command: close ran but the returned failure retained only the exhausted primary.
    Finalization now owns the pending acquisition inside its existing cleanup bound and retains
    obtainable close failures alongside the primary; regressions prohibit execution/output after
    cancellation and bound non-cooperating startup. This is a local lifecycle correction with no
    public surface or speculative guard.
  - `[medium]` `[patch]` Unsupported JSON charset was classified as a service outage — the parent
    reproduced authenticated `application/json; charset=iso-8859-1` against compiled AppModule
    and observed 503 rather than 415. The exception filter now recognizes parser charset/encoding
    media refusals, preserving fixed 415 responses, authorization-before-parser and sanitized
    unknown 503 failures. HTTP regressions exercise the parser boundary; no contract is expanded.

## Design Notes

D-044 makes the foundation step explicit: actual inert graph execution is not a price run or a
public completed state. Future steps require versioned contracts. Missing token disables the hop,
not unrelated collection; no development shared secret is invented. Request carries bounded query
for the future run seam but the no-op graph does not use/retain/return it. Operation identity is
run+step without claiming durable deduplication. No UI/artboard change belongs to this story.

## Auto Run Result

Implemented an authenticated production worker-to-AI execution hop through `RUN_EXECUTOR`, with
closed foundation contracts, single-attempt HTTP, a test-only fake, named resilience policies,
actual no-op graph traversal and an explicit bounded worker command. Public prepared Ask previews
remain non-live; no persistence, tool, provider or public run-creation guarantee is introduced.

### Files changed

- `packages/domain/src/ask/run-execution.types.ts` — neutral immutable foundation input/evidence.
- `packages/domain/src/ask/index.ts` — exports the neutral execution types.
- `packages/application/src/ask/run-executor.port.ts` — vendor-neutral execution port and DI token.
- `packages/application/src/ask/index.ts` — exports the application port.
- `packages/contracts/src/ask/run-execution.dto.ts` — closed v1 request and evidence parsers.
- `packages/contracts/src/ask/index.ts` — exports the independent wire parsers.
- `packages/contracts/src/ask/run-execution.dto.test.ts` — malformed/extra-field and scope regressions.
- `packages/infrastructure/src/ask/http-run-executor.adapter.ts` — authenticated bounded single POST.
- `packages/infrastructure/src/ask/in-memory-run-executor.adapter.ts` — isolated test-only fake.
- `packages/infrastructure/src/ask/index.ts` — exports both adapters through the context boundary.
- `packages/infrastructure/src/ask/http-run-executor.adapter.test.ts` — transport/fake failure matrix.
- `packages/infrastructure/package.json` — declares the consumed contracts workspace dependency.
- `packages/infrastructure/tsconfig.json` — references built contracts for correct build ordering.
- `apps/ai/src/execution/execution.authorization.ts` — fail-closed constant-time scoped authority.
- `apps/ai/src/execution/execution.controller.ts` — internal foundation execution HTTP endpoint.
- `apps/ai/src/execution/execution.http.ts` — authority-before-parser and sanitized HTTP failures.
- `apps/ai/src/execution/execution.module.ts` — composes the isolated graph execution module.
- `apps/ai/src/execution/execution.service.ts` — observes real bounded LangGraph traversal.
- `apps/ai/src/execution/execution.http.test.ts` — parser/auth/media/unexpected-error regressions.
- `apps/ai/src/execution/execution.service.test.ts` — real graph, authority and cancellation tests.
- `apps/ai/src/app.module.ts` — registers graph execution without infrastructure dependencies.
- `apps/ai/src/config.ts` — validates optional internal authority with safe disabled defaults.
- `apps/ai/src/config.test.ts` — checks absent/malformed authority and privacy-safe errors.
- `apps/ai/src/main.ts` — configures scoped HTTP before parsing and sanitizes startup failure.
- `apps/ai/package.json` — declares only the domain/contracts workspace edges it consumes.
- `apps/worker/src/ask/ask.module.ts` — registers the real execution adapter and policy wrapper.
- `apps/worker/src/ask/execute-foundation.ts` — safe one-shot process entry and categorical output.
- `apps/worker/src/ask/resilient-run-executor.ts` — wraps the port in ADR-ordered named policies.
- `apps/worker/src/ask/run-command.module.ts` — minimal command DI without DB/broker modules.
- `apps/worker/src/ask/run-execution-command.ts` — bounds stdin/startup/execution and owned cleanup.
- `apps/worker/src/ask/run-execution-command.test.ts` — process deadlines/signals/cleanup regressions.
- `apps/worker/src/ask/run-executor-resilience.settings.ts` — central D-044 policy calibration.
- `apps/worker/src/ask/run-executor.config.ts` — validates the fixed destination and internal token.
- `apps/worker/src/ask/run-executor.config.test.ts` — configuration and real policy failure matrix.
- `apps/worker/src/shared/resilience/resilience-telemetry.ts` — allowlists safe Ask policy names.
- `apps/worker/package.json` — declares contracts and the OTel-preloaded execution command.
- `integration/run-executor.integration.test.ts` — distinct real HTTP and worker-to-AI E2E journeys.
- `docker/ai.Dockerfile` — builds/deploys the actual AI domain/contracts dependency graph.
- `compose.yaml` — minimal worker/AI authority and explicit tools-profile command service.
- `package.json` — focused integration and execution command aliases.
- `pnpm-lock.yaml` — pins added workspace edges and retains the root Node type pin.
- `docs/api/run-executor.md` — exact internal contract, failures, policies and command reference.
- `docs/testing/integration.md` — focused command and real campaign verification scope.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md` — English D-044 mirror.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/story-the-worker-reaches-the-ai-service-through-runexecutor-plan.md`
  — preserved intent, implementation, review triage and independent verification evidence.

### Review and residual scope

The pinned quick lens returned exactly two findings: high 0, medium 2, low 0, false 0,
maybe-false 0. Both independently reproduced medium findings routed to patch and were fixed by
the same implementation agent; two command and three HTTP regressions passed after the changes.
Deferred findings: 0. Rejected findings: 0; there are no rejected reasons to omit. No intent-gap
or bad-plan loopback occurred. Patched entry counts are high 0, medium 2, low 0.

Follow-up review recommendation: false. Two medium patches trigger consideration on a first
pass, but no specific unverified risk remains from either finding: executed regressions cover
late context acquisition/close failure, bounded non-cooperating startup, unsupported charset and
encoding after authorization, and privacy-safe unknown failures. Complete integration and exact
owned-resource inventory verification also passed after the final code patches.

Residual scope is explicit: the inert foundation step does not provide price analysis, durable
run/checkpoint storage, dispatch, idempotency, providers or public command endpoints. A JavaScript
promise ignoring cancellation cannot be forcibly stopped; bounded finalization reports its
timeout, and the production command's DI factories perform no external startup I/O. Port
allocation cannot eliminate the allocation-to-bind race. The existing Vite chunk-size advisory
is unchanged. No UI/artboard, live source, VPS, `.env*`, push or deployment is part of this change.

### Verification performed

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — exit 0;
  all eight workspaces, strict integration typing and 144 unit files/1,503 tests passed.
- `pnpm run test:coverage` — exit 0 in all eight projects; unchanged 80% statements,
  lines and functions and 75% branches floors remain enforced.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/run-executor.integration.test.ts`
  — exit 0; both real-image HTTP integration and production worker-command E2E passed in 132.36 s.
- `pnpm run test:integration` — exit 0; 24 files/43 tests passed in 827.31 s after
  the final review patches, with no skipped tests or retries.
- The four support/convention/cleanup test files — exit 0; 21 tests passed.
- Scoped Prettier, Markdown lint, integration ESLint and Dockerfile lint passed. Staged and
  unstaged whitespace checks passed. Final Docker inventories equal all 13 original containers
  and 13 original volumes; no owned fixture or Ryuk remains. The existing user stash is intact.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all unchanged gates pass.
- `pnpm run test:coverage` — all eight packages pass unchanged 80/80/80/75 floors.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/run-executor.integration.test.ts`
  — real-worker/AI integration and distinct E2E journeys pass, owned teardown verified.
- `pnpm run test:integration` — every campaign passes after final code/review changes.
- `git diff --check` and scoped Docker before/after snapshots — clean whitespace, foreign resources
  preserved, no owned fixture/Ryuk remainder. No push and user stash preserved.

### Independent post-review evidence

After the final code patches, the parent reran unchanged root lint, recursive and strict integration
typecheck, unit tests and build. All eight workspaces passed: 144 unit files and 1,503 tests.
Coverage passed independently in all eight projects with unchanged 80% statements/lines/functions
and 75% branches floors. AI has 25 passing tests and 85.71% branches; worker has 219 passing tests,
94.33% statements, 84.62% branches, 91.78% functions and 95.71% lines. The focused real-image
campaign passed both HTTP integration and production worker-command E2E tests in 132.36 seconds.
The parent also reran the four support/convention/cleanup files: 21 tests passed. The complete
integration command finished successfully in its original process: 24 files and 43 tests passed
in 827.31 seconds, without skipped tests or retries. After automatic Ryuk teardown, the exact
Docker inventories equal all 13 original foreign containers and 13 volumes, with no owned
resources remaining. The original user stash is preserved; nothing was pushed.

### Independent pre-review evidence

The parent ran the unchanged lint, recursive/strict integration typecheck, unit and build gates:
144 files and 1,498 unit tests passed. All eight coverage projects passed their unchanged floors.
The focused production-image integration and distinct worker-command E2E passed: two tests in
145.98 seconds. Four support/convention/cleanup files also passed all 21 tests. Scoped formatting,
Markdown lint and staged/unstaged whitespace checks passed. The full integration command passed:
24 files and 43 tests in 827.25 seconds, with no skipped or retried tests. Exact final Docker
inventories match all 13 original foreign containers and 13 volumes; no owned fixture or Ryuk
remains. The original user stash is preserved and nothing was pushed.

Every matrix row has executed, passing coverage. A separate verbose run passed seven focused
unit files with 88 tests; the mappings below refer to those results and the two real-image tests,
not to tests merely present in the source tree.

| Matrix row             | Executed covering tests and observed behavior                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution              | `execution.service.test.ts` observes actual compiled graph updates; both `run-executor.integration.test.ts` tests validate correlated real-service evidence, including the production worker executable.                                                                                     |
| Authorization          | `execution.service.test.ts` rejects missing, wrong and malformed authority; `execution.http.test.ts` and the real HTTP campaign refuse before malformed JSON parsing and preserve health.                                                                                                    |
| Request boundary       | `run-execution.dto.test.ts` rejects invalid identity/version/step/query/locale and extra fields; HTTP tests and the real campaign reject malformed JSON, body size and media type.                                                                                                           |
| Response boundary      | Contract and HTTP-adapter tests reject manufactured evidence, identity mismatch, bad JSON/content type and oversized bodies; valid evidence is parsed closed.                                                                                                                                |
| Dependency failure     | `http-run-executor.adapter.test.ts` counts one attempt for network, 400/401/403/429/500 and redirect failures; worker policy tests prove transient failure is not retried.                                                                                                                   |
| Bound resources        | Adapter tests bound non-cooperating transport/body reads; worker policy tests cover deadline/admission, full queue, rate refusal and open breaker; command tests cover stalled stdin, SIGTERM, cleanup deadlines and restored listeners.                                                     |
| Disabled configuration | AI and worker configuration tests reject unsafe settings and accept disabled defaults; HTTP tests preserve health while execution is disabled; real worker-command E2E rejects absent authority. Every existing collection campaign passed in the full suite without requiring AI authority. |
| Fake isolation         | Adapter/fake tests prove captured-input/result cloning, reader/caller mutation isolation, closed failure, abort and expiry.                                                                                                                                                                  |
| Privacy/isolation      | Both real-image tests scan authority/query output, inspect AI dependency/credential isolation and compare every SQL digest and prepared Ask catalogue; command tests retain sanitized primary and cleanup failures.                                                                          |
