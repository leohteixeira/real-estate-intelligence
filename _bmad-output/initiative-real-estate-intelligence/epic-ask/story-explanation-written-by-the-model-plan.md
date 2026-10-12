---
title: 'Explanation written by the model'
type: 'feature'
ticket: 10
created: '2026-10-12'
status: done
baseline_revision: '0814e091ecebc34f4f6ad274cc9e590c61eea969'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0027-receipt-bound-model-explanations.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0014-zero-data-retention-for-user-text-routes.md'
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
warnings: [oversized]
deferred: []
---

<!-- prettier-ignore-start -->

<intent-contract>

## Intent

**Problem:** Ask 5.10/CAP-10 lacks the `LanguageModel` generative step. A completed run must explain
only its deterministic tool result, label the explanation model-written, and reject a fake model
asserting another number. Its limits and privacy must hold through fallback and recovery.

**Approach:** D-050/ADR 0027 adds explicit `text-price-explanation-v1` admission and a separate
`price-explanation-v1` graph, with receipt-bound factual generation, gateway-only verified ZDR,
persisted attempt reservations and accepted explanation evidence. Historical tracers stay intact.

## Boundaries & Constraints

**Always:** Market owns deterministic extraction/calculation/formatting; Ask/API owns admission,
authority, receipts, budgets, completion and saver persistence. AI owns provider adapters and a
vendor-free `LanguageModel` capability. Preserve authoritative receipt comparisons, fresh grants,
thread FIFO, three total pending, SQL queue expiry, eight terminal turns/30 days, synchronous
checkpoint ACKs, durable SSE and one-aggregate terminal transactions. Input cap 16,000 characters;
total generation reservations at most 1,000 output tokens per run including public probes and
retry/fallback, never replenished after uncertainty. Returned full text must match the versioned
PT/EN factual grammar and exact same-run receipt; no hidden rewriting into model-written output.
SDK retries disabled; centralized named resilience policies. No transmission without current
verified gateway acknowledgement and ZDR control; policy/cancellation have no fallback or retry.
All integration files TypeScript/Vitest with real owned PG/Rabbit/HTTP and explicit model fakes.
Keep baseline coverage floors and all root gates; record owner choices before work.

**Never:** Mutate old migration meaning or historical documents/checkpoints; widen old two-node
evidence; equate a catalogue/config flag/generated text with ZDR proof; use direct Anthropic,
another run's evidence, question/history/grants in prompts, model math or unsupported prose.
No production fake selector/default evidence, real provider calls, `.env*` access, source activation,
VPS/unblocking/deploy/push, daily quota policy, Jev/confirmation, new UI or general eval-pack story.
No node:test/node:assert, fetch/process harness/assert helpers in integration; no any/casts that
fabricate unknown JSON, suppression directives, skipped tests, retries hiding flakiness or lower gates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| PT/EN facts | New explained admission; receipt 78,500,000 minor units / 68 m² | Public completed result 1,154,412 minor units/m², unchanged receipt, validated model-written explanation | Exact locale facts only |
| Fidelity | Another number, unit/currency, spelled number, forecast/opinion or malformed output | Never completed with fabricated explanation; truthful tool receipt retained | Sanitized definitive refusal, no response echo |
| Privacy | Missing/stale/wrong-model/wrong-route/unacknowledged evidence | Zero user-derived provider calls | Policy refusal; no transient breaker count/retry/fallback |
| Eligible fallback | Primary transient failure, approved secondary | Secondary under same budget/deadline, labelled actual route/model | No weaker route; exhausted/invalid/auth classified explicitly |
| Cancellation | Pre-aborted or cancelled during probe/generation | No subsequent attempt/fallback or invented answer | Closed cancelled outcome |
| Bounds | Input >16,000; token reservation exceeds 1,000; output/usage malformed or oversized | Refused without uncontrolled generation or fabricated usage | Persistent budget never resets |
| Lost checkpoint | Accepted explanation receipt, missing saver acknowledgement | Reclaim uses retained receipt and accepted explanation | No second accepted explanation; fresh authority |
| Lost terminal | Complete graph before terminal commit; new claim | Rebind retained Market receipt, reuse explanation | No model call; one terminal/inbox/outbox |
| Replay/old modes | Same idempotency key/body; old price-v1 runs/checkpoints; mixed thread | Original IDs and evidence; old two nodes unchanged | Conflict/body mismatch and wrong graph version refused |
| Queued expiry | Explained run expires before claim | Honest expired branch; null explanation/result; no attempts/tool/checkpoint | Existing 120s FIFO semantics |

</intent-contract>

<!-- prettier-ignore-end -->

## Code Map

- `packages/domain/src/ask/ask-live.types.ts`, `run-execution.types.ts`, `graph-checkpoint.types.ts`
  — existing unions are closed and price-v1 only. Extend with explicit explained branches, not
  optional explanation for historical modes. Keep deterministic `PriceResult`/`PriceToolReceipt`.
- `packages/domain/src/ask/index.ts`, new `model-explanation.ts` and tests — vendor-free bounded
  factual grammar, same-run binding, versions and canonical proof validation shared by AI/API.
- `packages/contracts/src/ask/ask-live.dto.ts`, `run-execution.dto.ts`, `graph-checkpoint.dto.ts`,
  `index.ts`, new `model-explanation.dto.ts` — strict parsers at public/internal/unknown JSON
  boundaries. Existing evidence has exact two-node tuples. New tuple has explanation third.
- `packages/application/src/ask/ask-run.service.ts`, `ask-run.repository.ts`,
  `consume-ask-run-request.service.ts`, new `model-explanation.repository.ts`/service and index
  — Market facade extraction reuse; definitive vs transient/cancelled classification; API-owned
  attempt reservation and accepted explanation capability, not provider SDKs.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` — `create`, `claim`, `complete`.
  Completion locks thread, checks retained inputs/result/provenance/receipt and copies authoritative
  result. Keep those checks; independently validate/persist explanation before terminal effects.
- `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts` — `execute` currently checks
  execution/grant but not requested version against basis; bind before partition read/write.
- New `packages/infrastructure/src/ask/model-explanation.pg-repository.ts` — durable conservative
  reservations and accepted receipt using existing fenced run authority and SQL thread locks.
  Stable binding survives execution rebind; never permit a stale claim to spend/accept.
- `migrations/6001*.sql` through `6004*.sql` read-only — exact old JSON/history and graph checks.
  Add migration `6005_*.sql` following naming conventions; extend predicates through explicit
  new-basis branches, never UPDATE historical JSON or rewrite migrations.
- `apps/api/src/ask/ask-live.controller.ts`, `ask-internal.controller.ts`, `ask.module.ts` —
  explicit new-mode admission/capability and authenticated internal model reservation/receipt
  transport. No arbitrary URL, model name or payload authority from public callers.
- `apps/ai/src/config.ts`, new `models/` port, gateway adapter, privacy verifier, resilience
  wrapper and DI module — no existing model implementation. Keep AI free of infrastructure/DB.
  Official gateway SDK documents createGateway/generateText, maxRetries:0 and provider control;
  inspect exact installed declarations after pinning compatible `ai`/gateway dependencies.
- `apps/ai/src/tools/resilient-price-per-square-meter.tool.ts`,
  `graph/resilient-graph-checkpoint.adapter.ts` — reuse ADR-ordered policy structures and signals;
  worker `shared/resilience/resilient-event-publisher.ts` is read-only behavioral reference for
  transient retry budget, Retry-After/deadline and breaker classification. No cross-app imports.
- `apps/ai/src/graph/price-per-square-meter.graph.ts`, `price-graph.factory.ts`, `graph.module.ts`,
  `price-telemetry.ts` — existing graph ends at priceTool; fresh per-invocation closure holds grants.
  Add explicit version selection/explanation node, injectable model/receipt transport, sanitized spans.
- `apps/ai/src/graph/remote-checkpoint-saver.ts`, `execution/execution.service.ts` — canonical
  durable input excludes authority; saver address hardcodes price-v1; completed recovery skips
  traversal then rebinds tool proof. Preserve this path and immutable receipt while adding evidence.
- `packages/infrastructure/src/ask/in-memory-run-executor.adapter.ts`,
  `in-memory-run-dispatch.adapter.ts` and existing test fixture consumers — exhaustive new branches
  must not fabricate explanation/provider output or weaken old proof assertions.
- `integration/ask-text-price-run.integration.test.ts`, `ask-checkpoints.integration.test.ts`,
  `ask-price-run.integration.test.ts`, `ask-delivery.integration.test.ts` — real stack/upgrade,
  completed-before-terminal recovery and exact historical fixture baselines. Extend existing
  migration tests to new migration without repurposing historical admissions.
- `integration/support/{fixture,http,network,ask-diagnostics}.ts`,
  `integration/fixtures/ask-checkpoint-resume-probe.ts` — owned fixtures, Supertest, exact Nock,
  truthful redacted diagnostics. Nock in parent does NOT intercept Docker AI.
  Add an explicit TS fixture bootstrap composing production graph with scripted LanguageModel
  inside owned AI container; production defaults never gain fake flags. Fresh probes no Vitest.
- `compose.yaml`, `apps/ai/package.json`, `pnpm-lock.yaml`, root `package.json`,
  `docs/api/ask-*.md`, `docs/testing/integration.md` — AI-only key/config wiring without `.env`
  reads; pinned SDK and explained-campaign alias; English implemented protocol/limitations.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/ask/model-explanation.ts` and listed domain/contracts paths — define
      explicit explained admission/live/evidence/version,
      model receipt/budget transport and strict grammar; table-test every matrix/fidelity category.
- [x] `packages/application/src/ask/model-explanation.repository.ts`, listed PG paths and
      `migrations/6005_*.sql` — persist immutable new basis,
      conservative reservations and accepted explanation; bind receipt and graph to retained authority;
      reject cross-run/version/stale/overbudget submissions with no terminal mutation.
- [x] `apps/api/src/ask/ask-live.controller.ts`, `ask-internal.controller.ts`, `ask.module.ts` — expose
      new mode and internal scoped reservation/receipt,
      keep old contracts and public capability authentication/refusals; test real Nest HTTP parsers.
- [x] `apps/ai/src/models/`, `apps/ai/src/config.ts`, `apps/ai/package.json`, `compose.yaml` — implement
      vendor-free LanguageModel, single-attempt
      gateway adapter, authenticated fixed-public-text ZDR probe and bounded evidence, named policy
      routing and budget/deadline enforcement. Pin SDK types; no actual provider call in verification.
- [x] `apps/ai/src/graph/price-per-square-meter.graph.ts` and listed graph/factory/saver/execution
      paths — new third node with same-run-only prompt and actual
      model output, accepted receipt before saver ACK, durable resume and receipt rebind; preserve old
      graph and sync persistence. Table-test paused/error/ambiguous output/pending-write recovery.
- [x] `packages/infrastructure/src/ask/in-memory-run-executor.adapter.ts` and listed adapters/test
      fixtures — extend exhaustive unions without weakening historical
      assertions. Add versioned PT/EN offline fidelity dataset for this grammar, not the full eval pack.
- [x] New `integration/ask-model-explanation.integration.test.ts` and explicit TS fake-model
      bootstrap/probe — actual PG/Rabbit/API/worker/AI/tool/saver path; matrix cases, PT/EN inspect,
      thread/SSE/replay, failure rejection, real reservation races, interrupted generation/accepted
      receipt/terminal recovery, budget across reclaim, and owned teardown/foreign inventory proof.
- [x] `integration/ask-checkpoints.integration.test.ts`, `ask-text-price-run.integration.test.ts`
      and listed historical campaigns — seed genuine pre-6005 schema and
      preserve bytes/IDs/checkpoints; exercise old tracer recovery and new mode in historical thread.
- [x] `package.json`, `docs/api/ask-model-explanation.md`, `docs/testing/integration.md` — record actual
      supported config, privacy probe
      limitation and no live-model/VPS assertion. Append implementation/proof to this plan.

**Acceptance Criteria:**

- Given a PT or EN explained-mode question and scripted approved model, when the actual local
  API/worker/AI run completes, then public inspect, thread and persisted terminal SSE expose the
  exact tool result and the same validated, receipt-bound model-written explanation and metadata.
- Given a scripted model invents another figure or unsupported statement, when the real run
  executes, then no completed result with that explanation exists and the public failure is
  sanitized; retained deterministic receipt remains unchanged.
- Given missing/stale/contradictory ZDR evidence or caller cancellation, when generation is
  attempted, then no prohibited data transmission, retry or secondary fallback occurs; approved
  transient fallback uses the secondary through the same privacy gate within persistent limits.
- Given interruption after accepted explanation or completed graph but before checkpoint/terminal
  ACK, when a fresh process/claim recovers, then it reuses stable explanation evidence, rebinds
  tool authority and commits exactly one terminal/inbox/outbox, with no budget reset.
- Given replay, concurrent claims/reservations or wrong-version/foreign/stale proof, when public
  replay and real internal HTTP/SQL paths run, then IDs/evidence remain stable, at most 1,000 tokens
  are reserved per run and invalid submissions create no terminal/effect.
- Given populated genuine historical price-v1 state, when migration 6005 and the new application
  run, then historical digests and two-node recovery stay unchanged, new explained runs succeed,
  and FIFO/capacity/expiry/retention plus all root checks/full integration pass unchanged.

## Implementation Notes

Implemented the explicit explained mode and separate three-node graph without changing historical
two-node tuples or the `price-v1` graph. Market owns the locale fact formatter; the versioned grammar
accepts only permutations of the three complete receipt facts. AI returns the whole model response,
and both AI and API validate receipt-bound identity, locale, versions and factual text.

Migration 6005 adds immutable SQL attempt reservations and accepted artifacts, preserves historical
JSON predicates through explicit new-basis branches, and fences insertions with thread locks and
current execution leases. Reservations include public probes, never refund uncertainty, and remain
bounded at 1,000 across reclaim. Accepted evidence is stable across fresh receipt execution rebinds.

AI depends on the vendor-free model port and fixed-origin API transport, not infrastructure or SQL.
Pinned `ai@7.0.137` and `@ai-sdk/gateway@4.0.94`; inspected installed gateway option declarations.
The adapter sets `maxRetries: 0`, ZDR on every attempt and disabled payload telemetry. Current
acknowledgement from an authenticated public-text probe precedes facts; unknown metadata, warnings,
wrong binding and expired evidence fail closed. Named policies retain bounded admission, breaker,
single-attempt retry policy, rate limit, timeout and approved transient-only fallback.

The test bootstrap overrides only the model port inside the owned AI container. No production fake
selector or actual provider call was added. New tests cover strict contracts, exact locale grammar,
gateway controls, privacy and cancellation, scoped Nest HTTP, and native paused/lost-acceptance/
lost-saver/completed-before-terminal recovery. The Docker campaign also exercises real SQL budget
races, same-thread replay/SSE, conservative cancellation spend, additive upgrade and queue semantics.

Implementation-time root lint, typecheck (including integration), unit tests and build passed.
The workspace coverage gate passed with its original floors. Contracts have 183 tests; AI has 154;
domain has 649; API has 197. Final parent gates/review/full serial integration are still required;
these implementation results do not mark CAP-10/5.10 accepted or assert live-provider privacy.

### Implementation verification ledger (2026-10-12)

The final unfiltered `pnpm run test:integration:ask-model-explanation` passed all 13 tests with
exit code 0 in 332.76 seconds (start 00:10:16 UTC), without skipped tests or automatic retries.
The preceding four-case diagnostic selection
passed after correcting two new test assertions: the existing AI HTTP filter returns the sanitized
`{ code: 'unavailable' }` contract, and reservation model/purpose live in JSONB rather than separate
SQL columns. Production behavior and assertions of no fallback, no accepted artifact and retained
spend were not weakened. Neither Vitest retry configuration nor `.skip` tests were added.

The actual campaign covers each matrix row as follows:

- PT/EN facts: real worker completion, complete scripted model text, immutable accepted JSONB,
  deterministic retained receipt/result, public inspect/thread and one persisted terminal SSE.
- Fidelity: a numeric invention fails honestly in both locales with no accepted artifact and the
  same deterministic receipt. Currency/unit/spelled-number/rounding/opinion/forecast/malformed
  variants are the versioned offline domain dataset, not separate Docker provider scenarios.
- Privacy: missing gateway acknowledgement blocks after the public probe. Stale evidence,
  wrong model/route, warnings and contradictory acknowledgement have isolated unit proofs.
- Eligible fallback: a primary transient public-probe failure uses the approved secondary under
  its own gate, with actual route/model metadata and 256 conservative reserved tokens. Explicit
  authentication refusal has no fallback; no live gateway request is claimed.
- Cancellation: pre-aborted HTTP sends nothing; cancelled public probe reserves only 16; actual
  caller disconnect during generation observes one probe/one generation and retains 240 across
  reclaim, without a secondary attempt or accepted artifact.
- Bounds: oversized admission refuses before effects; malformed probe usage blocks; six concurrent
  real 200-token reservations produce five accepts and one refusal, with a persistent total of
  1,000 and no budget reset on fresh claim. Other malformed/oversized output categories are unit-tested.
- Lost checkpoint / lost terminal: real checkpoint insertion failure after accepted evidence and
  complete graph before terminal commit both restart only the owned AI container. Fresh claims
  reuse stable explanation/receipt IDs, rebind execution authority, preserve reservations and
  observe zero model-port calls in the new process. Completion replay has one terminal effect.
- Replay / old modes: public same-body replay and conflict, stale/foreign scoped grant and wrong
  graph partition refusal; genuine populated pre-6005 native checkpoint/pending-write/history
  digests survive additive migration, old two-node recovery and a new run in that historical thread.
- Queued expiry: three pending admission slots, fourth refusal, FIFO ordering, 120-second lifetime
  and honest null-artifact queued expiry with no tool/checkpoint/model effects. Eight-turn/30-day
  retention still requires the parent historical/full serial campaigns.

An earlier eight-case run had seven passes and one infrastructure failure before API/database
initialization. Docker reported `failed to create hard link` at API image `COPY --from=build /out ./`
for the `es-toolkit@1.52.0/.../flatMap.mjs` path under `/var/lib/docker/fuse-overlayfs/`.
`docker info --format '{{.Driver}}'` confirms `fuse-overlayfs`. This is evidence of a storage-layer
build failure, not an application fidelity result. Corrective action was ordinary owned fixture
teardown and a subsequent normal rebuild/new campaign after source/build stabilization. No broad
cache pruning, storage-driver change or foreign-resource deletion occurred. Re-executing after this
failed build is distinct from retrying a flaky application assertion; the failed run remains recorded.

Root lint, strict root/integration typecheck and build were re-executed successfully. Root unit tests
and the complete per-workspace coverage command passed with the original 80/80/80/75 floors.
Changed supported files pass Prettier; the two changed protocol/testing docs and this plan pass
Markdownlint using `--no-globs` to avoid unrelated generated `_bmad` artifacts. Final parent gates
below, historical aliases, unfiltered full integration and mandatory review remain pending.

### Model policy repair verification

The parent step-03 verification identified unfinished existing ADR 0009 requirements. Breakers
are now isolated by the fixed approved route/model pairs; typed provider quota exhaustion trips
only the affected breaker immediately. The current exhausted call refuses without fallback.
A subsequent circuit-open unavailable call is transient and may use the approved healthy
secondary, under the original deadline, persistent reservations and privacy gate. A genuine
named outer fallback policy wraps admission; adapters still make exactly one SDK attempt.

Quota classification uses actual installed Gateway/APICallError types and exact structured
discriminants, not error message substring matching. The gateway's documented 402
`quota_for_entity_exceeded` and `insufficient_funds` signals are described in the
[Vercel budget documentation](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets)
and [official gateway spend reference](https://github.com/vercel/vercel-plugin/blob/main/skills/ai-gateway/references/spend-observability.md).
The exact 429 `insufficient_quota`, `credit_balance_exhausted` and
`organization_usage_limit_exceeded` signals follow the
[provider quota documentation](https://help.openai.com/en/articles/5955604-troubleshooting-api-rate-limits-and-429-errors).
Only bounded structured error bodies are parsed; raw payloads and SDK causes never enter
the failure contract, traces or metrics. Caller/package aborts, privacy, authentication,
rejected output and budget refusal do not count as transient provider-health failures.
Attempt timeout is transient only while the caller's bounded deadline remains live.

Lifecycle-managed typed resilience listeners now feed allowlisted policy counters/span events.
Model-attempt spans include actual approved model/route, purpose, bounded evidence age and
validated token usage; metric labels remain categorical. Provider-operation success is labelled
`succeeded`, not accepted explanation evidence. No question, prompt, response, provider message,
grant, secret or arbitrary policy source is projected. Listener removal is tested.

Three adversarial tests first failed against the previous implementation, proving shared-circuit,
quota and package-abort defects. The repaired focused model suite has 92 passing tests, including
multi-run primary/secondary isolation, open/half-open recovery, immediate quota trip, the named
fallback event, five nontransient classes, actual policy timeout, repeated caller cancellation and
numeric deadline expiry before abort-timer dispatch.
The final root `lint`, `typecheck` (including strict integration), `test`, `build` and
`test:coverage` all pass for this repair. Root unit counts are web 14, contracts 183, domain 649,
application 222, infrastructure 444, AI 193, API 197 and worker 227. Coverage retains the original
80% statement/line/function and 75% branch floors independently in every workspace. The only
build warning is the existing web chunk above 500 kB. This follow-up does not claim
a new Docker campaign: the prior 13-case owned-stack evidence above remains historical and the
parent must run the final Docker aliases/full serial suite and mandatory review before commits.

Original intent-table whitespace was restored from the parent's pre-implementation capture.
Narrow Prettier range comments outside the immutable intent block protect its exact bytes during
the unchanged normal Markdown hook. No expectations, global formatting configuration or hooks
were changed; this plan passes normal Prettier and Markdownlint checks.

### Privacy matrix audit closure

The parent step-03 audit found that the previous wrong-route test title overstated its inputs.
Six new orchestration cases explicitly prove wrong provider route, wrong provider model,
zero-data-retention control warnings, runtime-malformed route/model values, and privacy evidence
expiring during the second reservation. Runtime corruption uses `Reflect.set` on a genuine
typed result, with mutation assertions; there are no `any`, suppression directives or fabricated
complete-client casts. The direct evidence-verifier case now also injects an actual wrong route.

Every bad-probe case observes exactly one fixed public probe, 16 conservative reserved tokens,
no facts-generation call, no named fallback event and no accepted evidence. The expiry case uses
the existing injectable clock and typed transport; the second reservation reaches the evidence
TTL while the overall deadline remains live. It refuses by policy before sending facts, without
fallback or acceptance, and retains both reservations (240 tokens), rather than refunding spend.

Actual verification: `pnpm --filter @rei/ai exec vitest run src/models` passes 98 tests in five
files; `pnpm --filter @rei/ai run test` passes all 199 tests in 17 files. Root `pnpm run lint`,
AI `tsc --noEmit`, changed-file Prettier, plan Markdownlint and `git diff --check` pass.
Only this test file and these notes changed. No production behavior, immutable intent,
shared runtime/build artifact, Docker resource or live provider was changed; the parent's active
serial Docker campaign is left undisturbed. The earlier root/coverage ledger remains historical.

### Parent verification and matrix audit

After the privacy audit closure, the parent ran root `lint`, `typecheck`, `test`, `build` and
`test:coverage` successfully with exit code 0. Strict integration TypeScript participates in root
typecheck. All 2,135 unit tests passed: web 14, contracts 183, domain 649, application 222,
infrastructure 444, AI 199, API 197 and worker 227. Every workspace passed the unchanged
80% statement/line/function and 75% branch floors. The existing web chunk-size warning is unchanged.
Changed supported files passed Prettier, changed Markdown passed Markdownlint and staged/unstaged
whitespace checks passed. No gate, hook, retry or discovery rule was weakened.

The final parent serial aliases passed the actual owned-stack cases: model explanation 13/13
(447.70 seconds), structured tracer 1/1 (72.63), text-price 2/2 (83.41), checkpoints 6/6
(372.33), delivery 4/4 (223.71) and RunExecutor 2/2 (59.27). After the explicitly recorded
schema inventory repair below, the prepared Ask contract/API E2E alias passed 2/2 in 54.52 seconds.
Its unchanged all-schema digest assertion now includes the new model tables. The subsequent
unfiltered `pnpm run test:integration` is still running; this ledger does not claim its result
or acceptance. All timings are elapsed seconds; actual Vitest display clocks are UTC-03.

All ten immutable matrix rows have tests that actually ran and passed:

- PT/EN facts and fidelity: six parameterized model-stack scenarios passed, observing public
  inspect/thread/SSE and immutable receipt/artifact evidence. All 649 domain tests passed,
  including the broader adversarial factual grammar dataset.
- Privacy: actual missing acknowledgement stack scenarios passed; the 199-test AI run includes
  explicit wrong route, wrong model, contradictory/malformed evidence, control warnings and
  evidence expiry during reservation, with zero facts calls and no retry/fallback.
- Eligible fallback: actual approved-secondary transient scenarios passed in both locales;
  AI policy tests also passed for isolated breakers, quota exhaustion, timeout and named fallback.
- Cancellation: actual pre-aborted/cancelled probe and disconnected generation cases passed,
  proving no subsequent attempt/artifact and conservative reservations across reclaim.
- Bounds: actual oversized admission/malformed usage scenarios and the concurrent SQL budget
  race passed; parser/grammar/policy unit cases passed for other malformed or oversized values.
- Lost checkpoint: accepted artifact followed by real checkpoint insertion failure and fresh AI
  recovery passed with stable proof, unchanged reservations and no new model call.
- Lost terminal: completed native graph before terminal commit and fresh claim passed with
  retained receipt/artifact identity, fresh authority and one terminal/outbox effect.
- Replay/old modes: public replay/conflict, scoped stale/foreign/wrong-version refusals and genuine
  pre-6005 upgrade cases passed. The six-test checkpoint campaign also passed real API/worker/AI
  restart, fixed-horizon/eight-turn retention and populated historical migration checks.
- Queued expiry: capacity three/fourth refusal, FIFO and SQL-expired null-artifact/no-attempt cases
  passed in the model and four-test ordered-delivery campaigns.

The full unfiltered campaign and mandatory step-04 review remain pending. No browser journey is
claimed by this API-only increment, no live provider privacy is asserted and no VPS story is unlocked.

### Parent final verification outcome

The unfiltered `pnpm run test:integration` passed all 73 tests in 29 files with exit code 0,
without skips or configured retries, in 2,120.79 seconds. It rebuilt all eight workspaces before
discovery. Its actual UTC start was 04:04:13 on 2026-10-12 (Vitest displayed 01:04:13 UTC-03).
The preceding repaired Ask alias passed both tests, so every command in the Verification section
now has a successful actual result. Expected injected-fault logs do not represent failed assertions.

After the two-line explicit schema-inventory repair, the parent additionally reran root `lint`,
`typecheck`, `test` and `test:coverage`; all passed with exit code 0 and the same 2,135-test total
and unchanged per-workspace coverage floors. The full integration command supplied the final
successful root build. No production source changed after the earlier root verification.

All campaign-owned containers and named volumes were absent at completion. The Testcontainers
reaper belongs to the framework's process lifecycle, not a remaining product fixture; it was not
manually deleted. Exact fixture teardown assertions passed throughout the serial suite, preserving
foreign containers and volumes. The parent did not prune caches or delete unrelated resources.
Staged and unstaged whitespace checks pass. The immutable intent body still has SHA-256
`60111ec02a30a9c943f349e9e36fb77b2462e59c833cae6067558c858eff7197`.

Step-03 verification and the ten-row matrix audit are complete. Mandatory quick review, normal-hook
commits and ticket acceptance remain pending; no live model, deployment, VPS unlock or UI campaign
is claimed by this verification.

### Parent review repair verification

The quick review reported one malformed-success classification defect. The parent independently
reproduced it offline through the pinned SDK and compiled classes: a valid public probe followed
by missing-usage HTTP 200 permitted four calls, 480 conservative reserved tokens and secondary
acceptance. The original implementing agent repaired only the adapter's closed error classifier
and added eight actual-SDK regressions plus five classification cases. The focused two-file run
passed all 45 tests; the malformed-success variants had failed before the repair.

The parent read every repair line, including the complete new SDK regression file, rewrote the
review diff including that untracked file, and reran root `lint`, strict `typecheck`, `test`,
`build` and `test:coverage`. All passed with exit code 0. The new actual total is 2,148 unit tests:
web 14, contracts 183, domain 649, application 222, infrastructure 444, AI 212 and API 197.
The worker has 227 tests. Every workspace retains the original 80% statement/line/function and
75% branch floors;
AI coverage is 94.18/88.74/91.90/96.30% respectively. Changed-file Prettier, Markdownlint and
staged/unstaged whitespace checks also pass. No immutable intent, state guard, public surface,
SDK retry setting, migration, hook, discovery rule or coverage threshold was changed by the repair.

A fresh serial execution of every listed Ask integration alias and the full unfiltered suite
started after the successful root gates. Its results are pending at this ledger entry, so the
earlier 73-test campaign remains historical evidence rather than a claim about the repaired tree.

The serial aliases subsequently passed all 30 actual cases: model explanation 13/13 in 399.35
seconds, structured tracer 1/1 in 70.24, text-price 2/2 in 77.11, checkpoints 6/6 in 373.53,
ordered delivery 4/4 in 201.92, RunExecutor 2/2 in 54.01 and prepared Ask contracts/API E2E 2/2
in 34.22. The first alias started at 04:52:03 UTC. The full unfiltered command successfully
rebuilt all eight workspaces and is now executing; this update does not claim its final outcome.

The post-repair unfiltered campaign subsequently passed all 73 tests in 29 files with exit code 0
in 1,894.03 seconds, without skips or configured retries. Its actual UTC start was 05:12:26 on
2026-10-12 (Vitest displayed 02:12:26 UTC-03), and the parent observed completion at 05:44:00 UTC.
Every command in the Verification section now has a successful result on the repaired tree.
The final all-state owned container and named-volume inventories are empty. Exact fixture teardown
assertions passed, preserving foreign resources; no broad prune or manual foreign deletion ran.
Root verification remains 2,148 passing unit tests with unchanged coverage floors.

## Plan Change Log

### Prepared catalogue schema inventory repair

The parent's serial verification passed the explained campaign (13), structured tracer (1),
text-price campaign (2), checkpoints (6), ordered delivery (4) and RunExecutor (2), then the
prepared Ask catalogue campaign failed both tests at its exact migrated-table inventory assertion.
Migration 6005 correctly adds `ask.model_attempt` and `ask.model_explanation`; the old fixture
assertion still enumerated only the six historical tables. The explicit expected inventory now
includes both new tables. Every Ask table must still be empty, and the complete all-schema
row-count/content-digest comparison must remain identical after each prepared fixture journey.
This extends the no-effects proof to the new tables rather than removing or relaxing it.

The failed catalogue run took 33.55 seconds and stopped the shell chain before the unfiltered
suite. Its evidence remains in the implementation history; a fresh catalogue run and full suite
are required. Vitest's `Start at` values in this environment use UTC-03, not UTC; earlier ledger
entries labelling such values UTC should be interpreted with this three-hour offset. The parent
explained campaign started at 03:40:20 UTC and passed in 447.70 seconds.

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 1 finding — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Malformed successful gateway JSON was classified as transient, permitting
    secondary fallback instead of definitive refusal — the parent reproduced a valid public probe
    followed by missing-usage HTTP 200 through the pinned SDK: four calls, 480 reserved tokens and
    an accepted secondary explanation. Gateway `z.any()` success parsing permits this body; AI
    usage normalization throws an unstructured error, and the existing adapter default made it
    fallback-eligible and a provider-health failure. The smallest repair corrects that closed
    error classification: unrecognized normalization exceptions are sanitized `rejected`, while
    recognized SDK transport/HTTP and package attempt-timeout classifications and cancellation
    precedence remain intact. No public surface or new state guard is added. The original
    implementation agent applied the patch and added actual pinned-SDK offline regressions for
    missing usage, null usage and empty JSON, with a healthy secondary, 22 independent runs per
    variant, 240 retained tokens, no fallback/artifact/circuit events and subsequent healthy primary
    recovery. Its two-file focused run passed 45 tests; the parent then reran every plan gate,
    including 2,148 unit tests, 30 alias cases and the full 73-test integration campaign, all passing.
    No finding was rejected or deferred, and the immutable intent is unchanged.

## Design Notes

Full route exceeds 100 lines and five nonmechanical files. Risk raised from ticket medium to high:
money assertion integrity, user-derived privacy, persisted versioning and restart-safe budget.
Three synchronous read-only explorers mapped existing adapters, durable proof and fixture gaps.
D-050 was recorded before implementation and mirrored in accepted ADR 0027/epic Notes.

The grammar is deliberately a closed factual language, not a claim that arbitrary natural
language is verified. Model text is actually generated and returned, not post hoc synthesized
with a misleading label. Golden BRL inputs 78,500,000 minor units / 68 m² yield 1,154,412
minor units/m² (BRL 11,544.12); no new rounding or deal assessment is admissible.

The gateway documents ZDR acknowledgement in routing metadata, not an independent catalogue
attestation. A fixed public probe obtains current acknowledgement before user-derived facts,
with no real call made by this story's tests. Unknown contract/control warnings fail closed.
Probe and generation reserves must be charged conservatively before transmission; accepted
explanation receipt covers saver gaps. Do not promise exactly-once provider network delivery.

Use the mandatory Nest skill, applying D-012's explicit SQL/facades/application ports and
Vitest over its incompatible ORM/NX/Jest examples. BMAD plan/handoff overrides interactive
writing-plan defaults. No second workflow render or parallel coding stories; no VPS unlock.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — root gates pass,
  strict integration TypeScript included, no test/coverage/config weakening.
- `pnpm run test:coverage` — every workspace retains 80% statement/line/function and 75% branch.
- `pnpm run test:integration:ask-model-explanation` — added actual owned-stack matrix passes,
  no real provider, exact foreign resources survive cleanup.
- Existing `test:integration:ask-tracer`, `ask-text-price`, `ask-checkpoints`, `ask-delivery`,
  `run-executor`, `ask` — all actual cases including populated historical upgrades pass.
- `pnpm run test:integration` — full unfiltered serial suite after root build, no skips or retries.
- `pnpm exec prettier --check <changed supported files>` and
  `pnpm exec markdownlint-cli2 <changed markdown>` — changed files pass; SQL conventions via lint.
- `git diff --check` — clean whitespace; final owned Docker inventory empty without foreign deletion.

Parent executes final gates and mandatory review before auto-commit with normal hooks. Only after
actual verification/review, mark 5.10 done and commit acceptance. No UI opened; browser campaign
belongs to the goal's later final verification, not this API-only story.

## Auto Run Result

### Implemented change

Implemented explicit receipt-bound, model-written price explanations through a separate three-node
graph. Historical tracers remain unchanged. The API owns durable conservative token reservations,
accepted artifacts and authoritative completion; AI uses a vendor-free capability with single-attempt
gateway adapters, current route/model privacy acknowledgement, bounded resilience and categorical
telemetry. Accepted artifacts survive saver/terminal gaps without new generation spend.

### Files changed

- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md`
  — Mirror the owner's delegated explanation design decision in epic Notes.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/story-explanation-written-by-the-model-plan.md`
  — Preserve immutable intent and record implementation, actual verification and review triage.
- `apps/ai/package.json`
  — Pin the AI/Gateway SDK dependencies used by the single-attempt provider adapter.
- `apps/ai/src/config.ts`
  — Expose bounded AI gateway configuration without database or infrastructure credentials.
- `apps/ai/src/execution/execution.controller.ts`
  — Accept the explicit explained graph execution contract.
- `apps/ai/src/execution/execution.service.ts`
  — Validate explained completion and reuse durable artifacts on fresh-authority recovery.
- `apps/ai/src/graph/explained-price.graph.test.ts`
  — Test the third-node graph, receipt validation and durable explained-state behavior.
- `apps/ai/src/graph/explained-price.graph.ts`
  — Add the receipt-bound third-node explanation graph without changing historical tracers.
- `apps/ai/src/graph/graph.module.ts`
  — Wire the model capability, scoped transport and telemetry lifecycle through dependency
  injection.
- `apps/ai/src/graph/price-graph.factory.ts`
  — Select the explicit graph version with per-invocation tool/model authority.
- `apps/ai/src/graph/price-telemetry.ts`
  — Extend closed graph-node telemetry without recording content or authority.
- `apps/ai/src/graph/remote-checkpoint-saver.ts`
  — Persist canonical explained graph state under the matching versioned partition.
- `apps/ai/src/models/gateway-language-model.adapter.test.ts`
  — Test SDK controls and closed quota/authentication/cancellation/error classifications.
- `apps/ai/src/models/gateway-language-model.adapter.ts`
  — Use single-attempt ZDR SDK controls and definitive malformed-success classification.
- `apps/ai/src/models/gateway-privacy.verifier.ts`
  — Validate current route/model acknowledgement and fail closed on malformed evidence.
- `apps/ai/src/models/gateway-quota.ts`
  — Classify bounded structured provider quota signals without message guessing.
- `apps/ai/src/models/http-model-explanation.adapter.test.ts`
  — Test scoped model capability transport and sanitized failures.
- `apps/ai/src/models/http-model-explanation.adapter.ts`
  — Call the fixed-origin API reservation/artifact capability using scoped authority.
- `apps/ai/src/models/language-model.port.ts`
  — Define the vendor-free generation capability and sanitized closed failures.
- `apps/ai/src/models/model-explanation.port.ts`
  — Define the model reservation/artifact transport and run-scoped context.
- `apps/ai/src/models/model-explanation.settings.ts`
  — Centralize approved models, token bounds, deadlines and named policy settings.
- `apps/ai/src/models/model-failure.ts`
  — Preserve cancellation precedence and transient-only fallback/health classification.
- `apps/ai/src/models/model-telemetry.test.ts`
  — Test categorical telemetry projection and listener removal.
- `apps/ai/src/models/model-telemetry.ts`
  — Project allowlisted attempt/policy telemetry and manage listener teardown.
- `apps/ai/src/models/model-test.fixture.ts`
  — Provide explicit test-only receipt, acknowledged model and transport fixtures.
- `apps/ai/src/models/receipt-model-explainer.test.ts`
  — Test receipt fidelity, privacy evidence, output bounds and orchestration.
- `apps/ai/src/models/receipt-model-explainer.ts`
  — Gate receipt facts, reserve persistent budget and validate accepted model output.
- `apps/ai/src/models/receipt-model-resilience.test.ts`
  — Test named fallback, isolated breakers, quota, timeout and deadline behavior.
- `apps/api/src/ask/ask-internal.controller.test.ts`
  — Exercise strict internal model HTTP parsing and scoped authentication.
- `apps/api/src/ask/ask-internal.controller.ts`
  — Expose authenticated scoped internal model reservation/artifact operations.
- `apps/api/src/ask/ask-live.controller.ts`
  — Admit the explicit explained mode while preserving historical request contracts.
- `apps/api/src/ask/ask.module.ts`
  — Register the API-owned explanation repository and internal controller.
- `compose.yaml`
  — Pass AI-only gateway configuration without enabling a fake production selector.
- `docs/api/ask-model-explanation.md`
  — Document implemented explained-mode contracts, bounds and privacy limitations.
- `docs/testing/integration.md`
  — Document the explicit TypeScript/Vitest explained owned-stack campaign.
- `integration/ask-checkpoints.integration.test.ts`
  — Extend actual historical upgrade/recovery proof through additive migration 6005.
- `integration/ask-contracts.integration.test.ts`
  — Include both model tables in exact prepared-catalogue no-effects inventory proof.
- `integration/ask-model-explanation.integration.test.ts`
  — Verify real owned-stack locale, privacy, budget, replay, expiry and recovery cases.
- `integration/fixtures/ask-model-fixture-bootstrap.ts`
  — Compose production graph wiring with an explicit test-only scripted model capability.
- `migrations/6005_ask_model_explanations.sql`
  — Add immutable fenced attempt/artifact storage and explicit new-basis predicates.
- `package.json`
  — Register the explained owned-stack Vitest integration alias.
- `packages/application/src/ask/ask-live.facade.ts`
  — Validate explained public completion through the existing Ask facade.
- `packages/application/src/ask/ask-run.service.ts`
  — Carry explicit explained-mode evidence through authoritative run orchestration.
- `packages/application/src/ask/index.ts`
  — Export the application-level explanation capability through the context boundary.
- `packages/application/src/ask/model-explanation.repository.ts`
  — Declare the API-owned reservation/artifact repository port.
- `packages/contracts/src/ask/ask-live.dto.ts`
  — Parse additive explained admission/live evidence without widening old tuples.
- `packages/contracts/src/ask/graph-checkpoint.dto.ts`
  — Parse version-bound explained checkpoint state and evidence.
- `packages/contracts/src/ask/index.ts`
  — Export the strict canonical explanation transport contracts.
- `packages/contracts/src/ask/model-explanation.dto.test.ts`
  — Reject malformed/foreign canonical explanation and reservation transport values.
- `packages/contracts/src/ask/model-explanation.dto.ts`
  — Parse closed reservation requests, responses and receipt-bound explanation artifacts.
- `packages/contracts/src/ask/run-execution.dto.ts`
  — Parse explicit explained execution and terminal evidence branches.
- `packages/domain/src/ask/ask-live.types.ts`
  — Add the explicit explained basis and public evidence branch.
- `packages/domain/src/ask/graph-checkpoint.types.ts`
  — Represent the separate three-node graph checkpoint version.
- `packages/domain/src/ask/index.ts`
  — Export vendor-free explanation validation and canonical types.
- `packages/domain/src/ask/model-explanation.test.ts`
  — Exercise the versioned adversarial factual grammar and binding dataset.
- `packages/domain/src/ask/model-explanation.ts`
  — Validate the closed factual grammar and stable same-run receipt bindings.
- `packages/domain/src/market/index.ts`
  — Export deterministic receipt fact formatting through the Market boundary.
- `packages/domain/src/market/price-explanation-facts.ts`
  — Format exact locale-specific deterministic price facts without model arithmetic.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts`
  — Validate authoritative explanation evidence before terminal aggregate effects.
- `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts`
  — Fence saver operations to the retained basis and graph version.
- `packages/infrastructure/src/ask/in-memory-run-executor.adapter.ts`
  — Preserve exhaustive execution branches without fabricating model output.
- `packages/infrastructure/src/ask/index.ts`
  — Export the concrete API-owned explanation repository.
- `packages/infrastructure/src/ask/model-explanation.pg-repository.ts`
  — Persist conservative run budgets and immutable artifacts under current SQL authority.
- `pnpm-lock.yaml`
  — Lock the approved AI/Gateway SDK dependency graph.
- `specs/README.md`
  — Index the accepted receipt-bound explanation ADR.
- `specs/adrs/0027-receipt-bound-model-explanations.md`
  — Record the accepted explained-graph, truth, budget and privacy design decision.
- `apps/ai/src/models/gateway-language-model.adapter-sdk.test.ts`
  — Exercise malformed HTTP-success normalization through actual pinned SDKs offline.

### Review disposition

The quick lens reported one finding. Independent actual-SDK reproduction verified the malformed
HTTP-success normalization defect as high severity. Its trivial closed-classification patch is
applied, with five focused classifier cases and eight actual-SDK cases, including 22 independent
runs for each malformed-success variant and a healthy secondary that must never be used.
Patched entry counts: high 1, medium 0, low 0. Deferred 0; rejected 0. Every reported finding is
preserved individually in the Review Triage Log.

Follow-up review recommendation is false: the specific normalization/fallback/provider-health
risk is directly covered through the actual pinned SDK, caller orchestration and fresh healthy
primary recovery. No specific unverified repair risk remains after parent tracing and focused
regressions. This does not transform routing acknowledgement into independent retention attestation.

### Verification performed

- Parent root lint, strict typecheck including every integration TypeScript file, unit tests, build
  and coverage passed after the review repair. All eight workspaces built; 2,148 unit tests passed.
  The unchanged coverage floors are 80% statements, lines and functions and 75% branches.
- Parent serial model/tracer/text-price/checkpoint/delivery/executor/prepared-Ask aliases passed
  all 30 cases, including 13 explained-mode cases. The actual durations are recorded above.
- The post-repair full unfiltered integration command passed 73 tests in 29 files with exit code 0
  in 1,894.03 seconds after rebuilding all eight workspaces. Its UTC start was 05:12:26. All-state
  owned container and named-volume inventories are empty; foreign resources were preserved.
- Parent inspected every material implementation and repair diff, the ten-row matrix and actual
  SDK source paths. Focused repair verification passed 45 tests in two files.
- Changed-file Prettier, Markdownlint and staged/unstaged whitespace checks passed. The final evidence
  update is rechecked before normal-hook commits; no hook or quality-gate bypass is authorized.
- Immutable intent body SHA-256 remains
  `60111ec02a30a9c943f349e9e36fb77b2462e59c833cae6067558c858eff7197`.

### Residual risks and limits

A fixed public probe supplies current route/model acknowledgement as engineering evidence, not
independent provider retention attestation. No live provider, real source, key-file inspection,
VPS unlock, deployment, push or browser campaign is claimed. The closed PT/EN factual grammar is
not a verifier for arbitrary prose, and conservative reservations do not promise exactly-once
provider network delivery. UI and general evaluation-pack work remain separate stories.

### Acceptance and commits

The build-auto iteration halted built after verification and normal-hook commits. The parent
confirmed that all 67 reviewed files appear after the immutable baseline and none remains
uncommitted; the working tree was clean. Only then did the ticket tool mark 5.10 done.
This accepts this story, not the entire initiative or any VPS-dependent story.

- Implementation: `de3ff816b2a52145383b82e6c2a33a3eed71795b`.
- Tests: `2095452c30cd7503cf64898a7ddf93042639c04f`.
- Documentation and review evidence: `41f96dd540e7bc304c4eb5aad61a4bd10a84b003`.

All hooks passed without bypass, including secret scanning, formatting, ESLint, Markdownlint and
the Conventional Commit message check. Hooks reported no content rewrites. Parent final verification
passed 2,148 unit tests, 30 targeted integration cases and all 73 cases in the 29-file unfiltered
suite, with unchanged 80/75 coverage floors. No push or deployment was performed.
