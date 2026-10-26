---
title: 'Provider failures bounded and private'
type: 'feature'
ticket: '11'
created: '2026-10-26'
status: 'built'
baseline_revision: 'c98808698606de813a039b8d2e86104e6eca01e2'
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
  - '/home/vscode/.codex/skills/nestjs-modular-monolith/SKILL.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-15 requires the architecture failure matrix across decision, generation and AI
dependencies. Jev lacks the central policy composition; safe checkpoint/tool transients are not
retried, definitive refusals affect their breakers, and admission can outlive the numeric deadline.

**Approach:** Complete existing named resilience policies, normalize provider failures and bounded
retry advice, and prove the matrix offline. Preserve verified privacy, persistent model budgets,
receipt recovery and the executor's durable-redelivery ownership.

## Boundaries & Constraints

**Always:** ADRs 0009/0013/0014/0027 and architecture failure matrix. Outside-in fallback,
bulkhead, logical breaker, retry, per-physical-attempt limiter and timeout. Bounded attempts,
full jitter, rolling retry allowance and original caller deadline. Check caller cancellation
through admission/backoff/attempt; never answer after cancellation. Verify ZDR before user/facts
transmission; only eligible external routes. Deterministic local Jev degradation remains permitted
by ADR 0014. Every physical generative request gets a fresh persisted reservation, uncertain spend
is never refunded, and retained accepted output is recovered before further spend. Keep existing
typed contracts, SDK retries zero, payload-free telemetry, tests, hooks and gates.

**Never:** Real provider calls, new persistence/budget store, receiver redesign, HTTP retry of
RunExecutor, retry of whole explain/accept, weaker external privacy, source collection, production
operations, commits by implementer, `.env*` access, new dependencies or unrelated audits. One heavy
operation at a time on the shared 8 GB/2 vCPU VPS. Do not relax tests, add skips/automatic test
retries or increase timeouts. No new report or permanent diagnostic inventory.

## I/O & Edge-Case Matrix

| Scenario               | Input / state                                      | Expected behavior                                      | Error handling                                              |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Transient              | 429, 5xx, network, attempt timeout                 | Safe bounded retry within original deadline/allowance  | Typed exhaustion; approved fallback only                    |
| Retry advice           | Valid Retry-After fitting remaining time           | Honor advice; otherwise bounded jitter only when safe  | No attempt beyond deadline or allowance                     |
| Definitive refusal     | 400, authentication, policy, malformed output      | No retry; no transient breaker outcome                 | Sanitized typed failure; local Jev only if permitted        |
| Exhausted quota        | Recognized structured quota failure                | Immediately open only affected model/route circuit     | No current-call paid secondary spend                        |
| Privacy                | Missing/false/warning/expired ZDR evidence         | No user/facts transmission or weaker external fallback | Fail closed; permitted local decision only                  |
| Cancellation           | Caller abort or deadline during queue/backoff/HTTP | Promptly settle and stop further physical attempts     | No generated/local answer; no breaker poisoning             |
| Safe dependency replay | Lost checkpoint/tool response                      | Same stable input/key and durable effect               | Definitive conflict not retried                             |
| Generation retry       | Transient probe or facts request                   | Fresh reservation for every physical attempt           | No reused reservation, duplicate acceptance or budget reset |
| Breaker/admission      | Open/half-open, queued, independent dependency     | Bounded isolated admission and one logical outcome     | Allowlisted categorical telemetry only                      |

</intent-contract>

## Code Map

- Normative: `specs/adrs/0009-ai-provider-resilience-policies.md`,
  `specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md`,
  `specs/adrs/0014-zero-data-retention-for-user-text-routes.md`,
  `specs/adrs/0027-receipt-bound-model-explanations.md`, and
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`
  (failure matrix near lines 468–490). Read these targeted contracts, not other story histories.
- `apps/ai/src/models/intent-decider.ts` owns the adequate pinned-SDK bridge, public probe,
  acknowledgement gate, closed decision parsing and local fallback. Add the missing policy layer
  without replacing that bridge. `graph/graph.module.ts` currently wires the raw adapter directly.
  Jev probe and classification are separate real HTTP attempts: each needs limiter admission.
- `models/gateway-language-model.adapter.ts`, `gateway-quota.ts`, `model-failure.ts` and
  `language-model.port.ts` already normalize generative failures and structured exhausted quota.
  Reuse that allowlist for Jev and convey only bounded canonical retry advice, never raw headers
  or provider messages. Use the existing pinned-SDK injected HTTP harnesses.
- `models/receipt-model-explainer.ts`, `model-explanation.settings.ts` already provide isolated
  route breakers, eligible secondary, conservative reservations and get-before-fallback recovery.
  Its attempts=1 leaves the explicit transient-retry matrix unfinished. Retry only the failed
  outbound phase, acquiring a NEW reservation each time; retain privacy/deadline checks before
  transmission. Never retry whole generation/acceptance or spend one reservation twice.
- `graph/resilient-graph-checkpoint.adapter.ts`, `graph-checkpoint-resilience.settings.ts` and
  `tools/resilient-price-per-square-meter.tool.ts`, `price-per-square-meter-resilience.settings.ts`
  already implement policy order but hardcode one attempt, omit transient-only breaker recording,
  and check numeric deadline only before queue admission. Complete these wrappers, leaving raw
  HTTP adapters as one-attempt adapters. Preserve RemoteCheckpointSaver's acknowledgement ordering.
- Receiver replay is already safe:
  `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts`
  deduplicates put by checkpoint ID/digest and writes by checkpoint/task/index; reads are safe.
  `ask-run.pg-repository.ts::pricePerSquareMeter` locks/authorizes and returns one retained receipt
  per run. Grants are checked but not consumed. No API, SQL or migration change is expected.
- `apps/worker/src/ask/resilient-run-executor.ts` already has a whole-operation deadline race,
  transient-only logical breaker and exactly one HTTP attempt; `run-executor.config.test.ts`
  proves queue/timeout/cancel/breaker behavior. Reuse the pattern; preserve redelivery as retry
  owner.
- `apps/worker/src/shared/resilience/retry-budget.ts` and
  `resilient-event-publisher.ts::retryPolicy` are the adequate model for rolling allowance,
  Retry-After/deadline fit and full jitter. Adapt within AI ownership; do not import worker source.
  A small AI-local shared helper is justified only to prevent divergent implementations of this
  required policy across the affected wrappers, not to generalize unrelated resilience.
- `models/model-telemetry.ts`, `tools/price-tool.telemetry.ts` and module wiring are the existing
  categorical event projection model. Add only missing named decision/checkpoint projection.
- Existing model, checkpoint/tool and worker config tests are the primary verification seams.
  `integration/ask-checkpoints.integration.test.ts`, `ask-model-explanation.integration.test.ts`
  and `run-executor.integration.test.ts` already prove real receiver/idempotency behavior; reuse
  that evidence when contracts and receiver dependencies remain unchanged. No Docker campaign is
  required by this ticket's offline acceptance unless a changed seam leaves a concrete gap.

## Tasks & Acceptance

**Execution:**

- [x]
  `apps/ai/src/models/{intent-decider,language-model.port,gateway-language-model.adapter,model-failure}.ts`
  and named settings/policy seam -- complete Jev composition and sanitized failure/retry advice;
  preserve native SDK, privacy and local fallback semantics.
- [x] `apps/ai/src/models/receipt-model-explainer.ts` and `model-explanation.settings.ts` -- add
      bounded safe per-phase transient retries with fresh reservations and existing route isolation.
- [x] `apps/ai/src/{graph,tools}/resilient-*.ts` and their settings -- complete safe retries,
      transient-only breaker accounting and whole-operation cancellation/deadline coverage.
- [x] `apps/ai/src/{models,graph,tools}/*telemetry*.ts` and necessary module wiring -- project
      missing named categorical events through the existing model; preserve payload exclusion.
- [x] Existing affected `*.test.ts` plus a compact AI policy matrix suite -- prove every matrix
      row using fake clocks and injected fake HTTP. Keep original privacy, recovery and budget
      assertions.
      Add worker cases only for a demonstrated missing executor matrix observation; do not change
      its
      established single-attempt policy.
- [x] `docs/api/ask-model-explanation.md`, existing decision/checkpoint API documentation as
      affected and this plan -- concisely update operational retry semantics and verified limits.

**Acceptance Criteria:**

- Given production module wiring and intercepted provider/dependency HTTP, when the architecture
  failure matrix is exercised offline, then physical attempts, circuit outcomes, retry advice,
  deadline/cancellation, eligible routing and sanitized telemetry match the matrix above.
- Given repeated generative transient failures and a persistent remaining budget, when a retry or
  approved fallback sends another request, then each request has its own prior reservation, bounded
  cumulative spend and valid privacy evidence; recovery returns retained output without new spend.
- Given unchanged receiver contracts and existing replay proofs, when checkpoint/tool requests are
  retried after a lost response, then stable keys/inputs preserve one durable effect and refusal
  remains definitive; the executor itself still sends once and relies on durable redelivery.

## Implementation Notes

- Added AI-local rolling retry allowance and whole-operation deadline race, following the existing
  worker model without importing worker code. Dependency/Jev phases allow three physical attempts;
  generative phases allow two. Full jitter uses 100 ms exponential base / 1 s cap, a ten-second
  10% allowance with two low-traffic retry slots, and a complete 3.5-second attempt must fit.
  Canonical provider advice is honored only when bounded (30 s) and fitting the original deadline.
- Production GraphModule now composes the Jev policy around the existing pinned SDK bridge.
  Probe/classification each consume physical admission; only a failed phase repeats. Sanitized
  Gateway normalization is shared with generation, preserving zero SDK retries and ZDR checks.
- Every generative HTTP request obtains a new persisted reservation. Receipt lookup, reserve and
  accept are not retried by this policy; lost acceptance recovers retained output before secondary
  spend. Original privacy, receipt-recovery and aggregate budget assertions remain in place.
- Logical breakers record transient provider outcomes and successful slow calls (2.5 s), while
  preserving real successful output. Jev records once per decision; existing generative route
  breakers record once per outbound phase after its retries. Structured exhausted quota trips only
  the affected route and suppresses current-call paid fallback. Definitive refusals, local admission
  pressure and caller/original-deadline cancellation do not count as transient provider failures.
- Added allowlisted decision/checkpoint telemetry and hardened the existing tool projection;
  arbitrary messages, headers, grants, requests and payload fields are discarded.
- No receiver, API contract, SQL, worker, dependency or lockfile changes. Checkpoint/tool replay
  keeps identical requests and authority. Their existing all-4xx definitive classification is
  preserved
  per ADR 0013; provider 429 retry is proved at the native SDK seam. Worker RunExecutor remains one
  HTTP request per delivery.

## Plan Change Log

- 2026-10-26: Implemented the planned AI policy slice. Added successful slow-call handling to the
  existing generative breakers to satisfy ADR 0013, using the nearby slow-success marker pattern.
  No acceptance or verification scope was removed.

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 1 finding — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Native Gateway transport/nonconforming unsuccessful HTTP failures were
    rejected before cause/status classification in `models/gateway-failure.ts`. Verified against
    pinned SDK `asGatewayError`, `extractApiCallResponse`, `createGatewayErrorFromResponse` and
    `handleFetchError`: connection resets and unsuccessful HTML envelopes become
    `GatewayResponseError`. Both callers then bypass required retry/breaker/fallback behavior.
    The same implementer applied a closed normalization correction and native-SDK regressions;
    successful malformed output remains definitive. The four directly affected suites passed 116
    tests, including native SDK connection-reset/502-HTML/503-nonconforming-body retry, reservation,
    fallback and breaker observations. No new public surface or policy was needed.

## Verification

Implementation verification (2026-10-26):

- Directly affected model/dependency suite: 11 files / 226 tests passed before the final matrix
  additions (`/tmp/rei-provider-targeted-third.log`). Final slow-success/matrix pair: 2 files /
  42 tests passed (`/tmp/rei-provider-slow-check.log`), including 29 matrix observations. The final
  complete AI run below includes every affected suite and these additions on the final code.
- Before the independent review patch, exact `scripts/test-coverage.sh` Vitest arguments/floors,
  restricted with `pnpm --filter @rei/ai
exec vitest run --dir src --passWithNoTests`: 22 files / 300 tests passed. Coverage: statements
  93.96% (1261/1342), branches 88.82% (986/1110), functions 94.18% (243/258), lines 95.83%
  (1173/1224). Floors remain 80/75/80/80 respectively. Log:
  `/tmp/rei-provider-ai-coverage-final.log`.
- Fake-clock observations cover exact 200 ms provider advice, full-jitter attempts at 0/50/150 ms,
  refusal when another complete attempt cannot fit, and zero elapsed time on that refusal. Native
  SDK HTTP interception proves production DI, probe/user admission and closed normalization.
  Additional observations cover logical open/half-open, slow successful output, quota isolation,
  queue/backoff/attempt cancellation, fresh reservations, expired privacy and retained acceptance.
- Baseline identity snapshot checked all 1,299 tracked identities: changes are confined to 19
  existing AI/docs files plus new AI sources/tests and this plan. Receiver implementations,
  contracts, integration proofs, worker, manifests and lockfile are unchanged. Existing receiver
  replay/integration evidence and baseline 5.8 workspace coverage (3,097 tests) remain reusable for
  unchanged code. No Docker campaign or live provider call was run.
- `pnpm run build`: passed (`/tmp/rei-provider-build-final.log`); the existing web chunk-size
  warning
  remains informational.
- `pnpm run typecheck`: passed, including integration TypeScript
  (`/tmp/rei-provider-typecheck-final.log`).
- `pnpm run lint`: passed, including context and migration boundary checks
  (`/tmp/rei-provider-lint-final.log`).
- Changed-file Prettier: 25 initial files passed (`/tmp/rei-provider-format-final.log`).
  Markdownlint with
  `--no-globs` to retain repository rules and restrict configured global globs: four changed
  Markdown
  files passed (`/tmp/rei-provider-markdown-final.log`). `git diff --check` passed.
- Independent quick review found one confirmed medium normalization defect. The same implementer
  fixed it; parent inspected the exact changed branch and native-SDK regressions. Targeted four-file
  regression: 116 passed (`/tmp/rei-provider-response-error-fix.log`). Final reviewed AI coverage:
  22 files / 309 tests passed in 26.76 seconds; statements 93.97% (1263/1344), branches 88.88%
  (992/1116), functions 94.18% (243/258), lines 95.84% (1175/1226). Original floors remain intact.
  Log: `/tmp/rei-provider-ai-coverage-reviewed.log`. Other seven workspaces' unchanged 2,827 tests
  and unchanged receiver integration proofs are reused by content/dependency identity.
- Final reviewed build passed (`/tmp/rei-provider-build-reviewed.log`). Strict typecheck passed
  (`/tmp/rei-provider-typecheck-reviewed-final.log`) after a type-only test-helper annotation;
  the initial diagnostic is retained in `/tmp/rei-provider-typecheck-reviewed.log`. No product
  behavior changed after the final coverage run. Lint passed
  (`/tmp/rei-provider-lint-reviewed.log`). No known acceptance defect remains;
  normal hooks are required on each commit and recorded at outer ticket closure.

Route: full, because the substantive policy, adapter and matrix-test changes exceed 100 lines
and affect more than five files. Risk remains the ticket's high rating.

- Start with the directly affected model/policy and checkpoint/tool suites using one Vitest worker.
  New timers use fake clocks; fake HTTP intercepts every provider request. No credentials needed.
- On stabilized code run AI unit coverage using the exact arguments/floors from
  `scripts/test-coverage.sh` restricted to `@rei/ai`; if worker changes, run its coverage too.
  Preserve all floors. Reuse baseline 5.8 full coverage (3097 tests) for unchanged workspace code
  and dependency identities; check the final diff before declaring that reuse valid.
- Run `pnpm run build`, then `pnpm run typecheck`, then `pnpm run lint` sequentially. Run format
  and Markdown checks for changed files. Do not repeat passing product checks for doc-only edits.
- Parent performs the one required independent quick review of the final baseline diff, triages
  concrete findings and runs normal commit hooks. No broad review reset; investigate only changed
  behavior and affected risks. Report commands/counts and any genuine missing evidence in this plan.

## Auto Run Result

Implemented the architecture's offline AI failure matrix with bounded named policies, original
caller deadlines, privacy checks before transmission, stable dependency replay and fresh persistent
reservations for every generative physical attempt. SDK retries remain zero; RunExecutor retains
durable redelivery as its sole retry owner.

Files changed:

- `apps/ai/src/shared/ai-resilience.ts`: rolling retry allowance, bounded jitter/advice and
  whole-operation cancellation.
- `apps/ai/src/shared/ai-policy.telemetry.ts`: categorical decision/checkpoint event projections.
- `apps/ai/src/shared/ai-policy-matrix.test.ts`: offline fake-clock/native-SDK failure matrix.
- `apps/ai/src/models/gateway-failure.ts`: closed shared failure normalization and canonical retry
  advice.
- `apps/ai/src/models/gateway-language-model.adapter.ts`: reuse the shared normalization at the SDK
  boundary.
- `apps/ai/src/models/intent-decider.ts`: single physical call seam with per-attempt privacy checks.
- `apps/ai/src/models/resilient-intent-decider.ts`: production Jev policy composition and permitted
  local degradation.
- `apps/ai/src/models/intent-resilience.settings.ts`: named bounded Jev policy settings.
- `apps/ai/src/models/language-model.port.ts`: bounded canonical retry advice in the existing typed
  failure.
- `apps/ai/src/models/model-explanation.settings.ts`: named generation retry settings.
- `apps/ai/src/models/receipt-model-explainer.ts`: per-phase retries with new reservations and
  retained-output recovery.
- `apps/ai/src/models/model-test.fixture.ts`: preserve the receiver's budget-decline semantics.
- `apps/ai/src/models/receipt-model-explainer.test.ts`: retain explanation/budget assertions under
  physical retries.
- `apps/ai/src/models/receipt-model-resilience.test.ts`: physical retry, cancellation and
  slow-success observations.
- `apps/ai/src/models/gateway-language-model.adapter-sdk.test.ts`: native transport/error-envelope
  retry and reservation regressions.
- `apps/ai/src/graph/graph.module.ts`: production policy and categorical telemetry wiring.
- `apps/ai/src/graph/graph-checkpoint-resilience.settings.ts`: named checkpoint retry settings.
- `apps/ai/src/graph/resilient-graph-checkpoint.adapter.ts`: safe replay retry, transient breaker
  and original deadline.
- `apps/ai/src/tools/price-per-square-meter-resilience.settings.ts`: named tool retry settings.
- `apps/ai/src/tools/resilient-price-per-square-meter.tool.ts`: safe replay retry, transient breaker
  and original deadline.
- `apps/ai/src/tools/price-tool.telemetry.ts`: strict allowlisting and idempotent projection
  initialization.
- `apps/ai/src/tools/price-tool.telemetry.test.ts`: payload/unknown-event rejection assertions.
- `docs/api/ask-checkpoints.md`: replay, deadline and retry semantics.
- `docs/api/ask-model-explanation.md`: fresh physical reservations and bounded generation retry
  semantics.
- `docs/ask-intent-decisions.md`: production decision retry, admission and degradation behavior.
- This plan: acceptance, bounded review triage and verification evidence.

Review: one independent quick pass; one medium patch, zero high/low, zero deferred and zero
rejected findings. Parent verified the cause against the installed pinned SDK and inspected the
closed correction and native-SDK regressions. The initial strict check also caught a test-helper
literal inference; an explicit `string` parameter annotation fixes it without changing emitted
runtime or the 309-test coverage identity. Follow-up review recommended: false (one medium patch,
no named unverified affected risk). No broad review restart and no new decision were needed.

Verification: directly affected 116 tests, final complete AI coverage 309 tests with all original
floors, build, strict typecheck, lint and changed-file formatting/Markdown checks; see the recorded
logs above. Unchanged workspace/receiver evidence is reused by identity. Each commit retains normal
hooks; outer ticket closure records their observed result.

Residual limit: this ticket proves offline behavior with fakes and native SDK HTTP interception.
It does not claim a real provider outage, live ZDR observation or production publication. Those
remain their explicitly authorized live/deployment stories; no production action was required here.
