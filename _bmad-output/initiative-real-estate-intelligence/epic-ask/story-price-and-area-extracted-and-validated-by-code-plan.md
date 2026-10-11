---
title: 'Price and area extracted and validated by code'
type: 'feature'
ticket: '3'
created: '2026-10-11'
status: 'built'
baseline_revision: '4ef64a2a5f6105e772e80a95e4b70b7c8aaab5e1'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0024-deterministic-text-price-admission.md'
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 5.3 / CAP-10 requires requests in Portuguese and English to extract and
validate price/area by code and refuse invalid inputs with a typed outcome. The live tracer
currently requires numeric inputs supplied by the caller and proves only a fixed decision.

**Approach:** Market owns pure deterministic extraction, exact BRL normalization and validation,
exposed through its calculation facade. An explicitly versioned text-only public request is
accepted only after validation, then traverses the actual durable worker/AI/HTTP-tool/SSE path
with immutable inputs, truthful provenance and the existing one-operation allowlist.

## Boundaries & Constraints

**Always:** Follow accepted ADR 0024 / D-046 and earlier retained decisions. Keep API ownership
of Ask SQL; queued/event/reservation/outbox atomicity; authorization-before-thread-preparation;
mode/query/locale-bound replay; exact run/event/thread/execution/input/expiry-scoped grants;
retained receipts and commit-before-ack. Preserve strict legacy structured, prepared and
foundation protocols. New SQL is additive, with populated-data upgrade evidence. Money is
exact safe positive integer BRL minor units; area and rounded result meet existing Market
bounds. Tests use TypeScript/Vitest, Supertest, owned Testcontainers fixtures, exact synthetic
Nock scopes and unchanged coverage floors. Apply Nest DI/public-facade/state-isolation rules
with D-012's repository stack overrides. No question/secret/provider payload reaches telemetry.

**Never:** Ask the absent owner, contact VPS, change `.env*`, push, access real sources or call
providers. Do not calculate in AI/worker, invent inputs, accept numeric inputs in text requests,
strip punctuation permissively, guess ambiguous values, select the first candidate, convert
currency, let text choose URL/SQL/operation, relax contracts/SQL/hooks/coverage, or claim Jev,
confidence gate, explanation, full checkpoints/quotas or UI as part of this story.

## I/O & Edge-Case Matrix

| Scenario          | Input / State                                                                                       | Expected Output / Behavior                                        | Error Handling                                       |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Golden PT         | `Qual é o preço por metro quadrado de um imóvel de R$ 785.000,00 com 68 m²?`, pt-BR                 | Exact 78,500,000 BRL minor units and 68 m²; tool result 1,154,412 | None                                                 |
| Golden EN         | `What is the price per square meter for BRL 785,000.00 and 68 square meters?`, en                   | Same inputs and result                                            | None                                                 |
| Default BRL       | `Calculate price per m2: price 785000, area 68 m2.` or `Preço 785000, área 68 m2.`                  | No currency token required; BRL, same inputs                      | None                                                 |
| Order/context     | Area precedes price; unrelated bedrooms, street number and year surround explicit inputs            | Use only associated price/area candidates                         | Missing/ambiguous when role cannot be established    |
| Decimal/scale     | Locale-correct 785000.50/68.5 (EN), 785000,50/68,5 (PT); mil/thousand/million/k                     | Exact scaled cents and finite area; identical equivalent forms    | Invalid precision/grouping or scale conflict refused |
| Missing/invalid   | Missing price/area; zero/negative/signed/exponent/nonfinite/unsafe values                           | Closed reason, no new effects                                     | HTTP 422 `price_input_refused`                       |
| Malformed token   | Bad grouping, mixed separators, money sub-cent precision, `1e6`, `--785000`, partial numeric suffix | Reject whole token, never salvage interior substring              | Typed invalid price/area                             |
| Ambiguity         | Two price/area mentions or ranges, conflicting labels/units/scales                                  | Never pick a candidate silently                                   | Typed ambiguous price/area                           |
| Unsupported units | USD/US$/EUR/ambiguous bare $, ft²/sq ft/hectares, contradictory currency tokens                     | No conversion or implicit reinterpretation                        | Typed unsupported currency/area unit                 |
| Unsafe arithmetic | Individually valid inputs yielding zero/unsafe rounded minor units                                  | Reuse canonical validation before admission                       | Typed unsafe result                                  |
| Contract/auth     | Text body supplies `inputs` or unknown fields; invalid locale/control/oversize; bad Bearer/key      | Contract/auth refusal, not extraction result                      | Existing 400/401/403/503 policy                      |
| Replay            | Same key/capability/body; changed query with same numbers; foreign authority                        | Same IDs; conflict; no authority/history recovery                 | 409/403 respectively                                 |
| Tool attack       | Unknown operation/path; changed inputs; foreign run/execution; expired/public grant                 | No tool effect or receipt                                         | Existing closed contract/auth refusals               |

</intent-contract>

## Code Map

- `packages/domain/src/market/price-per-square-meter.ts` is canonical arithmetic. Keep its integer
  minor-unit rounding, no second formula. Add `price-input-extraction.ts` and its Vitest test
  for pure grammar/result/refusal types; export via `market/index.ts` and root barrel if needed.
- `packages/application/src/market/market-calculation.facade.ts` and
  `price-per-square-meter.service.ts` own public Market validation. Current service checks safe
  positive BRL minor units, finite area <= 1,000,000, valid computedAt and safe positive result.
  Add extraction facade method, reuse these checks, expose no provider type or infra dependency.
- `packages/application/src/ask/ask-run.service.ts` is a repository pass-through. Add text
  admission here with injected Market facade, not inside SQL adapter/controller/AI. Preserve
  existing `create` semantics; add `createText` result path and explicit facade interface in
  `ask-live.facade.ts` (currently alias of repository). Repository receives validated canonical
  inputs, not a public text body. `ask-run.repository.ts` defines that internal create port.
- `packages/domain/src/ask/ask-live.types.ts` and independent
  `packages/contracts/src/ask/ask-live.dto.ts` currently hard-code structured basis, fixed decision,
  execution step and node evidence. `run-execution.types.ts` / `run-execution.dto.ts` currently
  union only foundation and structured. Add closed text variants/correlations, keep old parsers
  strict. Prepared `ask.command.dto.ts`/`ask.read.dto.ts` shapes remain reserved/fixture-only.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` owns all short transactional
  mutations. `create` retains global hashed creation identity and authorizes before thread prep.
  `claim` persists fenced execution/grant and decision; `tool` compares exact original inputs;
  `complete` verifies persisted receipt. Bind text mode to all those transitions, keep retained
  identity independent of inbox/outbox pruning. Thread basis must agree with every run.
- `migrations/6001_ask_create_structured_runs.sql` has exact-key/basis/state/decision/history/
  receipt constraints; never edit it. Add `6002_ask_text_price_runs.sql` to extend only closed
  text combinations, validate existing data, keep all numeric-column/receipt/state invariants.
- `apps/api/src/ask/ask.module.ts` already imports `MarketModule`; inject
  `MARKET_CALCULATION_FACADE` into Ask orchestration. `ask-live.controller.ts` currently accepts
  only structured requests. Dispatch on closed mode; retain authorization/configuration/key
  validation, use response passthrough status 422 for strict typed refusals, 202 for accepted
  text. `ask.controller.ts`/`ask-live-stream.ts` must recognize truthful text/mixed live snapshots
  while preserving prepared separation. `ask-tool.controller.ts` is the single fixed tool route.
- `packages/application/src/ask/consume-ask-run-request.service.ts` rejects any executor step
  other than structured. Admit text evidence only when it matches the claimed step, then retain
  cancellation/deadline and terminal-commit policy. HTTP executor/dispatch adapters in
  `packages/infrastructure/src/ask/` and their fakes rely on shared strict parsers; test text
  roundtrip/correlation without widening destination/authority. Public event payload stays IDs only.
- `apps/ai/src/graph/price-per-square-meter.graph.ts` currently compiles
  START -> fixedDecision -> priceTool -> END. Text execution must actually visit
  validatedInputs -> priceTool, not rename fixed evidence after traversal. Keep the fixed
  structured graph as a strict branch and reuse the same typed tool. `graph.module.ts`,
  `price-telemetry.ts`, `execution/execution.service.ts` and tools need only truthful text support.
  AI keeps no SQL/broker/storage/dispatch key, no numeric extraction/calculation/provider call.
- `integration/ask-price-run.integration.test.ts` is the real fixture/reference: actual images,
  SQL/outbox/inbox, worker restart, retained receipts, scoped requests and durable SSE. Add
  `integration/ask-text-price-run.integration.test.ts` for text-only public E2E and populated
  structured upgrade. Reuse `integration/support/fixture.ts`, `http.ts`, cleanup and cancellation;
  never create a second harness. Existing prepared/foundation/full tracer campaigns must pass.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/market/price-input-extraction.test.ts` — write table-driven failing
      golden/default/order/decimal/scale and adversarial matrix tests; run focused domain Vitest and
      archive a genuine failing behavioral result before implementation.
- [x] `packages/domain/src/market/price-input-extraction.ts`, `market/index.ts` — implement pure
      bounded full-token parsing with explicit role association, exact BigInt money scaling before
      safe-number conversion, locale-specific format validation and closed refusals. Tests must not
      merely repeat implementation regexes. Preserve unrelated digits and refuse competing candidates.
- [x] `packages/application/src/market/market-calculation.facade.ts`,
      `price-per-square-meter.service.ts`, `price-per-square-meter.service.test.ts` — expose extraction,
      return closed success/refusal, run canonical validation including zero/unsafe result. Test facade
      directly with PT/EN matrix and no I/O. No arbitrary clock/data dependency enters parser.
- [x] `packages/domain/src/ask/ask-live.types.ts`, `run-execution.types.ts`,
      `packages/contracts/src/ask/ask-live.dto.ts`, `run-execution.dto.ts`, `ask/index.ts` — add
      text request/accepted/refusal, validated internal create, live basis/decision/evidence branches
      and strict mixed-thread support. Add unit tests in `ask-live.dto.test.ts` and
      `run-execution.dto.test.ts` for unknown fields, forged discriminators, wrong source/nodes,
      inputs, identities/timestamps and unchanged old contracts. Keep contracts domain-independent.
- [x] `packages/application/src/ask/ask-run.service.ts`, `ask-live.facade.ts`,
      `ask-run.repository.ts`, `ask-run.service.test.ts` — add Market-mediated `createText`; refusal
      occurs before repository call. Internal validated text includes immutable derived inputs;
      public text parser never accepts them. Typed in-memory ports prove no effects and unchanged
      structured delegation. Do not conflate extraction refusal with an unexpected infrastructure error.
- [x] `migrations/6002_ask_text_price_runs.sql`,
      `packages/infrastructure/src/ask/ask-run.pg-repository.ts`, `ask-run.pg-repository.test.ts` —
      carry exact mode/fingerprint/basis/source/step through creation, claim, retained receipts and
      completion. Add SQL checks for correlated text/structured provenance without dropping existing
      state/history checks. No data rewrite or authority/grant change. Test mixed-thread basis,
      same-key changed-text/mode conflicts and execution-evidence substitution.
- [x] `apps/api/src/ask/ask.module.ts`, `ask-live.controller.ts`, `ask.controller.ts`,
      `ask-live.controllers.test.ts` — wire Market DI, strict text mode, typed 422 and 202 responses,
      truthful live reads/SSE and capabilities. Authenticate before work; preserve no-query checks,
      disabled configuration, malformed keys and existing structured/prepared routes.
- [x] `packages/application/src/ask/consume-ask-run-request.service.ts`, its test;
      `packages/infrastructure/src/ask/http-run-executor.adapter.test.ts`,
      `http-run-dispatch.adapter.test.ts`, `in-memory-run-executor.adapter.ts`,
      `in-memory-run-dispatch.adapter.ts` and corresponding tests — add exact text-step support,
      correlated evidence and cancellation/recovery assertions. Preserve one attempt, closed origins,
      existing deadlines/fencing, no new worker SQL, model or broad tool selector.
- [x] `apps/ai/src/graph/price-per-square-meter.graph.ts`, `graph.module.ts`,
      `price-telemetry.ts`, `execution/execution.service.ts`, graph/execution/tool tests — real text
      graph visits validatedInputs then actual priceTool; strict text evidence matches receipt. Existing
      foundation/structured nodes remain truthful. Telemetry records bounded identifiers/nodes only.
- [x] `integration/ask-text-price-run.integration.test.ts`, `package.json` — add focused alias
      and real public API E2E using text-only PT/EN requests, queued snapshots/ID-only event, real
      worker/AI/tool/receipt, completed SSE and exact golden result. Test invalid input with no new
      SQL/outbox/tool effects, fingerprint conflict, foreign authority, altered inputs/operation/grant,
      mixed-thread reads and sanitized logs. Second real test upgrades populated structured 6001
      data to 6002 and verifies exact history/event/receipt digests, strict parsers and malicious SQL
      document refusal. Preserve exact owned teardown and foreign Docker resources.
- [x] `docs/api/ask-tracer.md`, `docs/testing/integration.md`, Market context READMEs — document
      verified text grammar, accepted/refused shapes, mode separation, replay and tool allowlist;
      keep prepared and future Jev/gate/explanation limitations explicit. Keep ADR 0024/epic notes
      aligned with observed implementation; record any new owner choice before code, not silently.
- [x] Repository gates and this plan — run all commands below, preserve exact logs, actual
      coverage and real full integration results; append implementation notes and files; leave
      built for the outer closure audit, not done or auto-committed by the implementation subagent.

**Acceptance Criteria:**

- Given the real local Compose stack and valid strong capability/key, when the caller POSTs
  the golden PT and EN text-only bodies, then both return 202 with text-mode IDs, persist equal
  inputs and traverse real worker/LangGraph/HTTP Market tool to persisted completed SSE with
  1,154,412 BRL minor units/m² and one receipt/inbox/terminal-outbox effect per run.
- Given a valid text contract and missing, ambiguous, invalid or unsupported inputs, when POST
  is attempted, then HTTP returns strict 422 with a finite refusal reason and no new thread/run/
  outbox/receipt/execution; malformed contracts and authorities retain their categorical errors.
- Given successful text creation, when an authorized caller retries identical creation, changes
  wording with the same numbers, substitutes structured mode, or uses foreign capability, then
  replay returns the same IDs only for the exact authorized fingerprint; changed body conflicts
  and foreign authority cannot retrieve history or prepare a new thread.
- Given an active text claim, when a tool request substitutes inputs/operation/authority/identity
  or uses an expired grant, then the public/private HTTP boundary rejects it before a new tool
  effect; matching real calls retain one canonical receipt and stale completion cannot commit.
- Given persisted structured runs/events/receipts on 6001, when 6002 is applied and text runs are
  executed in the same system, then historical evidence remains identical, both old and new
  parsers/SQL checks retain their correlated invariants and mixed threads expose truthful basis.
- Given terminal text runs and real API reads/streams, when runs are replayed/reconnected or the
  API restarts, then retained inputs/result/provenance survive and prepared examples remain
  separately non-live; no private text/grant/capability or AI infrastructure credential is exposed.

## Implementation Notes

- 2026-10-11: Main verified the full plan against the READY standard and preserved canonical
  baseline before code. Root `lint:md` discovers ignored `_bmad/render` workflow snapshots and
  reports 1,377 pre-existing generated-document errors after repairing the two plan-format
  errors. Use `markdownlint-cli2 --no-globs` with explicit owned paths, retaining every rule;
  do not edit generated instruction snapshots. Final root product gates remain mandatory.
- 2026-10-11: Implemented Market-owned PT/EN whole-token extraction, exact money scaling and
  shared canonical numeric/result validation without an extraction clock dependency. Genuine RED
  evidence is `/tmp/rei-ask-text-implementation/domain-red.log` (48 failed, 2 passed); expanded
  GREEN evidence is `domain-green.log` in the same directory (79 passed), including trailing
  malformed punctuation, split numeric fragments and spaced/Unicode dash ranges.
- Added closed public text admission/refusal and private execution variants, immutable text
  fingerprints, truthful text/mixed read provenance, mode-matching completion, scoped adapters
  and actual LangGraph `validatedInputs` traversal. Preserved existing structured/foundation/
  prepared branches and the fixed HTTP Market tool; no model or new destination was introduced.
- Added additive 6002 by extending only the existing basis/source predicates while retaining their
  exact-key/state/numeric/timestamp/history checks, plus closed event provenance. Historical 6001
  is unchanged. Two owned real-service tests cover public PT/EN, no-effect refusals, exact terminal
  SSE/reconnect/restart, fenced authority attacks/recovery and populated structured upgrade digests.
- Updated the tracer/integration references and Domain/Application Market READMEs. Files span
  Market extraction/facade, Ask domain/contracts/application/SQL adapters, API DI/admission,
  AI graph/telemetry, migration 6002, focused integration alias and their behavioral tests.
- Root lint/typecheck/unit/build pass; latest root unit run reports 1,711 passing tests across
  all eight workspaces.
  Focused application reports 30 passing tests; focused contracts reports 47.
  Unchanged coverage floors pass in every workspace. Exact logs are under
  `/tmp/rei-ask-text-implementation/` (`lint.log`, `typecheck.log`, `unit.log`, `build.log`,
  `coverage.log`, `application-focused.log`, `contracts-focused.log`). Owned Markdown passes;
  root Markdown still reports the same 1,377 ignored generated-workflow errors in
  `markdown-root.log`, with no suppression or generated-file edits.
- Serial focused real-service verification passes all four files/seven tests, exit 0,
  in `focused-integration-serial.log` (438.83 seconds): both public PT/EN terminal SSE goldens,
  populated 6001-to-6002 upgrade, legacy structured tracer, prepared protocols and foundation
  executor. The final-source full serial `pnpm run test:integration` passes all 26 discovered
  files/46 tests, exit 0, started 11:41:06 UTC and finished in 1,090.27 seconds;
  evidence is `full-integration-serial.log` in the same directory. No skipped tests. The suite
  includes the latest whole-token/foreign-currency matrix and both truthful PT/EN terminal
  SSE goldens. Expected negative-path API errors and retention warnings are test output,
  not failed assertions; the final Vitest summary and command exit establish this result.
- Final cleanup inventory confirms no owned REI fixture containers or volumes remain;
  unrelated portfolio containers and volumes were preserved. Every campaign uses the shared
  exact-owned teardown/foreign-resource checks; no broad cleanup or reaper-only assumption.
  Final exact-path Prettier, owned Markdown and `git diff --check` pass. Status is `built`,
  with outer independent verification/review still owned by the main agent; no commits or pushes.
- Final coverage percentages (statements/branches/functions/lines) are web
  100/100/100/100, contracts 94.79/94.64/98.01/96.94, Domain
  95.02/91.41/100/95.69, AI 97.30/88.46/92.06/98.37, Application
  91.95/86.54/98.58/93.65, Infrastructure 85.07/80.11/89.59/87.02,
  API 93.31/86.12/97.91/94.65 and worker 94.42/84.77/91.52/95.66.

## Plan Change Log

- Real serial PT/EN verification exposed an existing busy-admission latency bug: a sibling
  completed with one receipt while the other stayed queued until a full 30-second retry hint
  elapsed. The API now caps that hint at one second without changing the lease, fencing,
  cancellation or admission/execution/HTTP deadlines. A repository regression proves busy
  response has no mutations; both same-thread real language runs remain the outer-surface proof.
  Failure diagnostics retain only owned container state, run/event/receipt counts and recognized
  operational log labels, not questions, payloads, credentials or grants.
  Exact failure evidence: `text-serial-diagnosis.log` under the same `/tmp` evidence directory
  records PT queued with one event/no receipt and EN completed with three events/one receipt,
  healthy worker startup and the unchanged 30-second stream deadline. Named application
  `askAdmissionPolicy` and fake-clock consumer/repository regressions calibrate prompt rechecking.
- Overlapping independent Compose invocations caused genuine foreign-inventory failures.
  They are not counted as successful verification. The interrupted full invocation exited 130;
  exact active project `rei-run-executor-6b916fbf-888f-406d-b9b8-38f19a0313f0` was checked for
  both containers and volumes after interruption: neither remained. Subsequent campaigns run
  sequentially with all ownership checks and finite stream deadlines unchanged.

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 3 findings — high 3, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Explicit unsupported area units were silently interpreted as m² —
    Main reproduced Portuguese feet, square kilometers and m3 as accepted canonical inputs and
    traced Market validation/Ask admission to persistence. Extended the existing bounded unit
    refusal guard; PT/EN Domain and real strict-422/no-effect regressions now pass.
  - `[high]` `[patch]` Known foreign currencies separated by words defaulted to BRL —
    Main reproduced numeric prices followed by in CHF and quoted in CHF, including a contradictory
    BRL marker, and traced the admitted value to Ask persistence. Added bounded in/em and
    quoted/cotado association while preserving supported BRL references and ordinary words;
    PT/EN Domain and real strict-422/no-effect regressions now pass.
  - `[high]` `[patch]` Coordinating and/e discarded competing price or area values —
    Main reproduced selection of 10 from 10 and 20 and 68 from 68 m² and 70, both accepted by
    Market and Ask. Propagated the prior role to coordinated candidates unless explicitly
    associated with supported context units; ambiguity refusals and bedroom/year/street
    preservation pass in Domain, with PT/EN real strict-422/no-effect regressions.

### 2026-10-11 — Follow-up review pass

- verdicts: 5 findings — high 4, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Explicit square miles and milhas quadradas still became m² — Main
    independently reproduced both examples through Domain, Market and Ask; each called the
    repository with area 68. Added the demonstrated spellings to the bounded unit refusal guard
    and Domain/real public strict-422, unchanged-count regressions.
  - `[high]` `[patch]` Explicit pesos and Swiss francs still defaulted to BRL — Main reproduced
    all three PT/EN examples through canonical validation and one repository call each. Added
    bounded foreign-name association without treating ordinary Swiss/peso prose as currency;
    Domain and real no-effect refusal regressions cover the reported inputs.
  - `[high]` `[patch]` Unsupported billion/bilhões scales silently admitted ten BRL — Main
    independently reproduced both examples as 1,000 minor units through Ask persistence.
    The bounded scale check now refuses those whole stated values as invalid_price; supported
    thousand/million/k forms remain unchanged, with Domain and real no-effect regressions.
  - `[high]` `[patch]` Competing values joined by vs selected the first price/area — Main
    reproduced both examples as accepted canonical values with repository calls. Extended the
    existing bounded coordination set; Domain and real public ambiguity regressions cover
    both roles, while the accepted-context table preserves unrelated bedroom numbers.
  - `[medium]` `[patch]` Portuguese há incorrectly triggered the hectare guard — Main reproduced
    the exact valid question as unsupported_area_unit through Market and Ask, with no repository
    call. Associated ambiguous ha with an area measurement; actual ha/hectares remain refused.
    Domain and actual public 202-to-completed evidence cover the reported bedroom context.

## Independent Verification and Matrix Audit

- Main read the complete staged 3,515-line baseline diff, including every new file, at
  `/tmp/rei-ask-text-main-52hIQ4/story-full-initial.diff`. These initial results predate review repair.
- Independently reran root lint/typecheck/unit/build, all passing with 1,711 unit tests.
  Focused Domain/Application/Contracts results are 79/30/47 passing tests respectively.
  Coverage passes every unchanged workspace floor, with the percentages recorded above.
- Main focused real-service verification passes four files/seven tests, exit 0, 206.36 seconds.
  Main full `pnpm run test:integration` passes all 26 files/46 tests, exit 0, 952.61 seconds,
  starting 12:08:54 UTC. Neither campaign overlaps another Compose campaign or skips a test.
  Logs are `focused-integration.log` and `full-integration.log` in that same evidence directory.
- Exact-owned Prettier, all seven changed Markdown files and cached diff whitespace pass.
  Root `lint:md` independently reports 1,377 errors, all under ignored `_bmad/render/`,
  with zero errors outside those generated snapshots. No rule or hook was suppressed.
  Final container/volume inventories show no owned fixture resources; foreign resources remain.
- All 13 immutable matrix rows have executed passing behavioral tests:
  - Golden PT/EN: Domain extraction tables, Market facade tests and both real public terminal
    SSE goldens prove identical inputs and exact 1,154,412 minor-unit results.
  - Default BRL/order/context/decimal/scale: Domain's accepted table proves labels, reversed
    role order, unrelated bedroom/street/year digits and exact equivalent scaled/decimal forms.
  - Missing/invalid/malformed/ambiguity/unsupported units: Domain's refusal table proves the
    whole-token and closed-reason cases; real text admission proves all nine refusal reasons
    leave all six thread/run/event/receipt/outbox/inbox counts unchanged.
  - Unsafe arithmetic: Market facade tests prove rounded-zero and unsafe-large results;
    the real public request proves a typed 422 with unchanged database counts.
  - Contract/auth: executed closed DTO and API boundary tests plus real text requests prove
    extra inputs/fields, invalid locale/control characters and pre-work authority refusal;
    legacy configured/unconfigured and key validation tests also pass in the root suite.
  - Replay: real text E2E proves exact authorized replay IDs, changed wording/mode conflicts,
    foreign capability refusal and denied foreign history.
  - Tool attack: real text E2E proves operation/input/event/execution/public-grant substitution,
    expiry and completion-mode refusal before new receipts; root API path-binding and AI
    fixed-origin/path/redirect tests plus legacy real fencing cover the unchanged allowlist.

## Design Notes

Risk raised from medium to high: wrong normalization or mode correlation can authorize an
incorrect retained financial result, and the change extends security-sensitive SQL/protocols.
Estimated >1,000 modified/new source+test lines across more than five files: full route.
Deep read-only exploration completed by `explore_ask_extraction` and
`explore_market_extraction`; findings distilled above, no detached investigation remains.
D-046 and accepted ADR 0024 were written before implementation. Owner absence authorizes
recorded choices; do not stop for defaults from planning/documentation skills. This BMAD plan
and branch supersede writing-plans' alternate destination, interactive handoff and unavailable
superpowers subskills. Use BMAD's implementation agent and source/tests/docs commit groups.

Expected public shape and local extraction port:

```ts
// Public POST text body: no numeric inputs supplied by the client.
{ mode: 'text-price-v1', threadId: null, placeId: null,
  query: 'What is the price per square meter for BRL 785,000.00 and 68 square meters?',
  locale: 'en' }
// Closed refusal; HTTP 422, no question echoed.
{ mode: 'text-price-v1', code: 'price_input_refused', reason: 'missing_area' }
// Facade success carries only validated canonical inputs; no provider or parsed vendor DTO.
type Extraction = { kind: 'extracted'; inputs: AskInputs }
  | { kind: 'refused'; reason: PriceInputRefusalReason };
```

Grammar version comes from text-price-v1; normalized inputs are retained immutable evidence.
Text node validation establishes input readiness only, never a model decision/confidence claim.
The later Jev/gate story must compose this extractor, not replace it with provider arithmetic.

## Verification

Run inside this repository, save logs in a task-specific `/tmp/rei-ask-text-*` directory and
record exact paths/results. Default tests never contact providers, VPS or real sources.

- `pnpm --filter @rei/domain exec vitest run --dir src src/market/price-input-extraction.test.ts`
  — genuine red first, then all grammar/edge cases green.
- Focused application command — extraction/admission/evidence and no-effect refusal pass:

  ```bash
  pnpm --filter @rei/application exec vitest run --dir src \
    src/market/price-per-square-meter.service.test.ts \
    src/ask/ask-run.service.test.ts src/ask/consume-ask-run-request.service.test.ts
  ```

- `pnpm --filter @rei/contracts exec vitest run --dir src src/ask/ask-live.dto.test.ts src/ask/run-execution.dto.test.ts`
  — closed correlated text/legacy protocols pass.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`
  — all root gates pass, integration TypeScript included, no suppression/threshold weakening.
- `pnpm run test:coverage` — all eight workspaces meet unchanged 80 statements/lines/functions,
  75 branches; archive percentages.
- Focused real-service command — text/legacy E2E and additive SQL upgrade pass:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/ask-text-price-run.integration.test.ts \
    integration/ask-price-run.integration.test.ts integration/ask-contracts.integration.test.ts \
    integration/run-executor.integration.test.ts
  ```

- `pnpm run test:integration` — every discovered campaign/support test passes, no skipped tests,
  no leftover owned resources, no borrowed historical result as new verification.
- `pnpm exec prettier --check <exact changed paths>` and
  `pnpm exec markdownlint-cli2 --no-globs <exact changed Markdown paths>` — formatting and owned
  Markdown pass. Root `lint:md` also discovers ignored generated workflow snapshots; report its
  result separately, do not edit those snapshots or suppress lint rules. Normal hooks must pass.

## Auto Run Result

Implemented Market-owned deterministic PT/EN text admission, exact BRL normalization and
canonical validation before persistence, closed text provenance throughout the durable Ask
worker/AI/tool/SSE path, mode-bound replay and grants, and additive populated-data SQL upgrade.
The structured, prepared and foundation protocols remain strict and separate. This increment
calls no model and opens no UI, VPS, provider or real-source surface.

### Files changed

- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md`
  — Record the accepted D-046 owner-delegated decision.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/story-price-and-area-extracted-and-validated-by-code-plan.md`
  — Retain immutable intent, review triage and independently executed evidence.
- `apps/ai/src/execution/execution.service.ts`
  — Execute both closed price graph modes and retain actual traversal evidence.
- `apps/ai/src/graph/price-per-square-meter.graph.test.ts`
  — Prove actual text graph traversal and unchanged structured behavior.
- `apps/ai/src/graph/price-per-square-meter.graph.ts`
  — Add truthful validatedInputs traversal while reusing the fixed Market tool.
- `apps/ai/src/graph/price-telemetry.ts`
  — Permit the text validation node without logging questions or authorities.
- `apps/api/src/ask/ask-live.controller.ts`
  — Expose text capabilities and strict 202 acceptance or typed 422 refusal.
- `apps/api/src/ask/ask-live.controllers.test.ts`
  — Test text admission, typed refusal and pre-work boundary checks.
- `apps/api/src/ask/ask.module.ts`
  — Inject the public Market facade into Ask admission.
- `docs/api/ask-tracer.md`
  — Document text grammar, refusal protocol, replay and execution boundaries.
- `docs/testing/integration.md`
  — Document the strict TypeScript real text-price campaign.
- `integration/ask-price-run.integration.test.ts`
  — Retain legacy real E2E with sanitized failure diagnostics.
- `integration/ask-text-price-run.integration.test.ts`
  — Prove real PT/EN E2E, no-effect refusals, authority fencing and populated upgrade.
- `integration/support/ask-diagnostics.ts`
  — Capture safe owned operational evidence without private content.
- `migrations/6002_ask_text_price_runs.sql`
  — Add correlated text provenance while preserving existing SQL invariants.
- `package.json`
  — Add the focused text-price integration script.
- `packages/application/src/ask/ask-admission.policy.ts`
  — Bound busy retry hints without shortening persisted execution leases.
- `packages/application/src/ask/ask-live.facade.ts`
  — Expose typed text admission through the Ask public facade.
- `packages/application/src/ask/ask-run.repository.ts`
  — Accept internally validated canonical text inputs.
- `packages/application/src/ask/ask-run.service.test.ts`
  — Prove Market-mediated admission and zero repository calls on refusal.
- `packages/application/src/ask/ask-run.service.ts`
  — Extract and validate through Market before any persistence.
- `packages/application/src/ask/consume-ask-run-request.service.test.ts`
  — Test mode correlation, cancellation and bounded sibling rechecking.
- `packages/application/src/ask/consume-ask-run-request.service.ts`
  — Require exact execution mode and identity correlation before completion.
- `packages/application/src/ask/index.ts`
  — Export the named admission policy.
- `packages/application/src/market/README.md`
  — Explain Market admission validation and no-I/O ownership.
- `packages/application/src/market/market-calculation.facade.ts`
  — Expose deterministic extraction as a public Market capability.
- `packages/application/src/market/price-per-square-meter.service.test.ts`
  — Test PT/EN canonical inputs and unsafe-result refusal.
- `packages/application/src/market/price-per-square-meter.service.ts`
  — Reuse canonical numeric and rounded-result validation during admission.
- `packages/contracts/src/ask/ask-live.dto.test.ts`
  — Test closed text contracts and correlated legacy/text provenance.
- `packages/contracts/src/ask/ask-live.dto.ts`
  — Define closed text requests, refusals, evidence and mixed-thread parsers.
- `packages/contracts/src/ask/run-execution.dto.test.ts`
  — Reject discriminator, node, identity and timestamp substitutions.
- `packages/contracts/src/ask/run-execution.dto.ts`
  — Dispatch the execution union to strict text parsers.
- `packages/domain/src/ask/ask-live.types.ts`
  — Represent truthful text admission, provenance and scoped execution.
- `packages/domain/src/ask/run-execution.types.ts`
  — Include both closed price execution variants.
- `packages/domain/src/market/README.md`
  — Explain the bounded deterministic extraction capability.
- `packages/domain/src/market/index.ts`
  — Export the pure extraction capability.
- `packages/domain/src/market/price-input-extraction.test.ts`
  — Cover 111 PT/EN accepted and adversarial extraction cases.
- `packages/domain/src/market/price-input-extraction.ts`
  — Parse bounded PT/EN whole tokens with exact money and finite refusals.
- `packages/infrastructure/src/ask/ask-run.pg-repository.test.ts`
  — Prove retained mode conflicts and non-mutating busy hints.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts`
  — Persist mode-bound replay, provenance, scoped claims and completion.
- `packages/infrastructure/src/ask/http-run-dispatch.adapter.ts`
  — Correlate terminal provenance with the submitted execution evidence.
- `packages/infrastructure/src/ask/http-run-executor.adapter.ts`
  — Correlate text execution and immutable receipt inputs.
- `packages/infrastructure/src/ask/in-memory-run-dispatch.adapter.ts`
  — Keep fake completion mode correlation strict.
- `packages/infrastructure/src/ask/in-memory-run-executor.adapter.ts`
  — Return only scoped, parsed price receipts and truthful fake evidence.
- `packages/infrastructure/src/ask/text-price.adapters.test.ts`
  — Test HTTP and in-memory scope, cancellation and defensive copies.
- `specs/adrs/0024-deterministic-text-price-admission.md`
  — Record accepted text admission and provenance architecture.

### Review and follow-up

The first pinned Quick lens reported three verified high findings, all routed to minimal patches:
unsupported explicit units, foreign currency references separated by words, and competing
coordinated values. Patched counts: high 3, medium 0, low 0. Nothing was deferred or rejected.
The same implementation agent added 12 genuine failing refusal regressions, five accepted-context
regressions and corresponding real public no-effect regressions, then fixed the bounded guards.
Main read the complete repaired 3,619-line snapshot and independently repeated every gate.
Those first-pass results are historical; the latest verification below follows the second repairs.

A fresh context-free follow-up Quick lens reported five additional findings. Main independently
reproduced all ten reported examples through Domain, canonical Market validation and Ask admission.
Verdicts: high 4, medium 1; patched counts: high 4, medium 1, low 0. Nothing was deferred or rejected.
The same implementation agent added 11 refusal and four acceptance cases; genuine RED was
10 failed/101 passed in `/tmp/rei-ask-text-implementation/review-two-domain-red.log`, then GREEN
111 passed in `review-two-domain-green.log`. Its edited real integration file passed two tests,
exit 0, 174.76 seconds in `review-two-text-integration.log`, including strict no-effect refusals,
actual acceptance/completion of the Portuguese bedroom context and unchanged terminal/upgrade proof.
Main read every incremental source/test change and rewrote the full baseline snapshot at
`/tmp/rei-ask-text-main-52hIQ4/story-full-followup-patched.diff` (3,863 lines before final notes).
The immutable intent block is byte-identical to the previously committed plan.

Follow-up review remains recommended: true. This follow-up pass patched four high entries.
Specific unverified risk: combinations of multiword foreign-currency modifiers and scale/unit
associations outside the demonstrated regression forms could still admit an unscaled numeric
prefix, while the newly contextual ha guard could misassociate nearby unrelated numbers.
A fresh context-free Quick pass must trace those pre-persistence boundaries before the outer
orchestrator marks the story done; passing this finite table does not establish exhaustive refusal.

### Final verification

All evidence is under `/tmp/rei-ask-text-main-52hIQ4/`, with final-source logs prefixed
`followup-review-`. Focused Domain/Application/Contracts: 111/30/47 tests, exit 0. Root lint,
typecheck, unit and build: exit 0; unit total 1,743 across all eight workspaces. Root coverage:
exit 0 with unchanged 80 statements/lines/functions and 75 branches floors in every workspace.
Final percentages (statements/branches/functions/lines): web 100/100/100/100; Contracts
94.79/94.64/98.01/96.94; Domain 95.09/90.83/100/95.75; AI 97.30/88.46/92.06/98.37;
Application 91.95/86.54/98.58/93.65; Infrastructure 85.07/80.11/89.59/87.02; API
93.31/86.12/97.91/94.65; worker 94.42/84.77/91.52/95.66.

Final focused real-service campaign: four files/seven tests, exit 0, 210.01 seconds. Final full
`pnpm run test:integration`: 26 files/46 tests, exit 0, 969.92 seconds.
Campaigns ran serially without skips. Prettier checks all 45 supported-format baseline paths;
its first invocation including SQL exited 2 because no SQL parser is configured, not because
of a formatting defect. Migration 6002 retains passing migration-convention, whitespace and
real populated-upgrade checks. Supported-path Prettier, all seven owned Markdown files and
working/index whitespace pass, exit 0. Logs are `followup-review-prettier-supported.log` and
`followup-review-markdown-owned.log`. Root Markdown remains exit 1 with exactly 1,377 pre-existing
errors, all in ignored generated `_bmad/render/` snapshots, zero outside them; no suppression,
coverage reduction or hook bypass. Expected negative-path API errors and snapshot-retention
warnings do not replace the passing Vitest assertions and final command exit.

All 13 immutable matrix rows were re-audited against these executed tests. New PT/EN refusal
cases return strict 422 and preserve all six thread/run/event/receipt/outbox/inbox counts.
Golden actual terminal SSE, populated upgrade/history digests, replay, mixed provenance,
restart/reconnect, scoped tool attacks and legacy prepared/foundation campaigns all pass.
No product-source changes followed this final-source verification. Production/VPS-dependent
stories remain blocked for the owner; this build does not authorize or claim their completion.
Final container/volume inventories contain no owned fixture resources, including Ryuk;
unrelated portfolio resources were preserved. Exact cleanup evidence is in the
`followup-review-final-container-inventory.log` and
`followup-review-final-volume-inventory.log` files.
