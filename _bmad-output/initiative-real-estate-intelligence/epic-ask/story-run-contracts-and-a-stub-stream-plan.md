---
title: 'Run contracts and a stub stream'
type: 'feature'
ticket: '1'
created: '2026-10-11'
status: 'built'
baseline_revision: '3b2d87d76bc4a8f311b9fe30ddf475d66200f08f'
route: 'full'
route_source: 'auto'
risk: 'medium'
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

# Run contracts and a stub stream Implementation Plan

**Goal:** Freeze the typed Ask wire surface and prove finite fixture SSE journeys through public
states to explicit terminal events.

**Architecture:** Framework-free neutral views and fixture port/service in Ask; synthetic
infrastructure adapter; thin Nest/Express HTTP composition. D-043 supplies read-only prepared
snapshots and scripted previews, not live execution or durability.

**Tech Stack:** TypeScript 6, NestJS 12/Express, existing RxJS, Vitest, Supertest and owned
Compose/Testcontainers support. Use bmad-build-auto's mandatory implementation/review agents; its
plan location and commit sequence override writing-plans defaults and unavailable superpowers
workflows.

**Routing:** Estimated 1,200–2,000 added/modified lines across more than five nonmechanical files,
so auto selects full. Raise ticket low risk to medium because public capability validation, strict
contracts and SSE privacy/framing are externally observable failure boundaries. Main-agent ready
gate reread workflow and plan from disk; every criterion is surface-anchored and resolved by D-043.

<intent-contract>

## Intent

**Problem:** Ask is empty, blocking its screens and headless client. Ticket `epic-ask 1` (5.1,
CAP-14) requires `/api/v1` run/thread/versioned-SSE shapes carrying capabilities, quota rejection,
full thread and edited inputs, plus a fixture per public run state.

**Approach:** Publish strict closed contracts and provider-free fixtures through read-only HTTP and
finite SSE. D-043 was recorded externally before code and mirrored in the epic. Preserve
prepared-snapshot truthfulness and expose no live creation, quota counting or AI capability.

## Boundaries & Constraints

**Always:** All repository content English; pnpm only; inward dependencies; nine contexts;
facade-only cross-context imports. ADRs 0003/0004/0007–0015/0020 and D-012 win over skill
ORM/NX/Jest defaults. Integration campaigns/helpers are strict TypeScript, native Vitest, Supertest
and owned Compose fixtures. JSON enters as unknown and passes public parsers. Keep coverage floors
and every existing scenario. Capabilities protect every run/thread/SSE read; synthetic catalogue
capabilities are deliberately public fixture grants, not credentials for real histories. IDs are
canonical UUIDv7 fixtures, dates UTC, monetary amounts safe BRL centavos, bounded query/inputs.
D-043 previews are labelled examples, not persisted execution.

**Never:** Live POST execution, persistence/migrations, quota policy/global-cap choice, RabbitMQ
publishing, caller-text retention, new provider/dependency, AI calls, fresh UI, VPS/deploy/push,
reading `.env*`, weakening gates or hooks. No Node test/assert/manual HTTP/process harness in
integration. Do not modify AI no-op runtime or foreign-context business code. Real durable event
log, thread execution and reconnect guarantees remain their later stories.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                                                        | Expected Output / Behavior                                                                                                                                                             | Error Handling                                                            |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Catalogue          | GET capabilities/fixtures                                                            | Closed availability/catalogue, seven states, fixture basis/version/date and synthetic-only grants                                                                                      | Invalid query -> canonical 400                                            |
| Snapshots          | Correct Bearer capability and fixture UUID                                           | Full run or ordered full thread; original and confirmed/edited inputs remain distinct; copy isolation                                                                                  | Missing/malformed/wrong capability -> sanitized refusal before disclosure |
| Scripted stream    | Fixture phase queued/running/awaiting_confirmation                                   | Increasing version-1 SSE IDs, phases through recorded synthetic confirmation where needed, explicit completed terminal; no computed result before confirmation                         | Never leak post-header exception messages                                 |
| Terminal previews  | completed/failed/cancelled/expired fixtures                                          | Exactly one explicit matching terminal event, physical completion, no later contradictory event                                                                                        | Failures are closed categorical reasons                                   |
| Resume             | Valid same-run Last-Event-ID                                                         | Replay only later sequence numbers; terminal included unless already consumed; no claim of durable recovery                                                                            | Malformed/foreign/future IDs -> canonical 400 before headers              |
| Strict contracts   | Missing/extra fields, wrong version/state/unit/date, malformed decision/result/input | Public parsers reject; valid fixtures and request shapes round-trip                                                                                                                    | TypeError with fixed generic message, no payload                          |
| Future requests    | Create/confirm/cancel/accepted/quota shapes                                          | Create references nullable thread/place and bounded query/locale; confirm carries proposed intent and edited price/area; quota includes visitor/global scope and UTC reopening instant | Shape validation only; POST routes remain absent                          |
| Privacy/boundaries | Read/replay/mutation attempts                                                        | No SQL/outbox/inbox change, no providers, no caller-text echo or capability in SSE/URLs; unrelated services/resources intact                                                           | Unexpected failures canonicalized                                         |

</intent-contract>

## Code Map

- `apps/api/src/ask/ask.module.ts` is empty but already imported once by `AppModule`; add
  providers/controller here, no global module duplication. `main.ts` uses Nest's **Express**
  adapter, not Fastify.
- `packages/contracts/src/ask/index.ts` is empty and root contracts already exports it.
  `shared/wire.ts` supplies closed-object/discriminated/UUID/date/array validators and `parseWire`;
  `market/market.read.dto.ts` demonstrates cross-field semantic checks. Contracts cannot import
  domain.
- `packages/domain/src/ask/README.md` is placeholder. Add neutral JSON view types and pure
  state/preview invariant helpers; root domain index must export Ask. `shared/uuid-v7.ts`
  canonicalizes uppercase, while public `wireUuid` requires lowercase: publish canonical fixture
  IDs.
- `packages/application/src/market/market.facade.ts` and `market-query.service.ts` demonstrate
  facade + service + neutral views; application depends only on domain, never contracts/Nest/RxJS.
  New Ask fixture port/service belongs to Ask; infrastructure implements it.
- `apps/api/src/configure-api.ts` provides `api/v1`, server-owned request IDs and sanitized errors.
  `http/read-query.ts` handles query-none/IDs and error classification.
  `http/unprefixed-read-paths.ts` plus Properties module shows canonical unprefixed 404 middleware.
- Existing Nest core writes raw error messages after SSE headers: validate all frames before
  returning the Observable, adapt only prepared validated frames via RxJS, and convert post-start
  errors to safe typed terminal events. Explicit stable event IDs, never Nest-generated IDs.
- `integration/market-contracts.integration.test.ts` demonstrates isolated postgres/migrations/API,
  strict public parsing, malformed URL cases and all-owned-table digest equality. `support/http.ts`
  Supertest buffers finite text streams; `support/fixture.ts` owns projects/ports and preserves
  primary/all cleanup failures. `support/network.ts` disallows unowned calls.
- `vitest.integration.config.ts` discovers `*.integration.test.ts`; root strict
  `tsconfig.integration.json` checks them. Root package already has
  Vitest/Supertest/Testcontainers/Nock/Execa/get-port. No dependency addition needed.

## Tasks & Acceptance

**Execution:**

- [x] Read `/workspace/CLAUDE.md`, the repository instructions, and
      `/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` fully before backend edits; load
      its architecture-patterns, module-communication, state-isolation and testing-patterns
      references. Main has independently read them. Apply established ADR overrides; do not invoke
      another story/build-auto workflow or create commits from the implementation agent.
- [x] `packages/domain/src/ask/ask-read.types.ts`, `ask-preview.ts`, `index.ts`, root `src/index.ts`
      — define seven-state/terminal taxonomy, immutable views for
      run/thread/decision/inputs/results/steps/availability/quota and pure preview invariants.
      Record `basis: prepared-ask-example`, fixture version/time and non-live semantics; no
      framework or business calculation duplication.
- [x] `packages/contracts/src/ask/ask.read.dto.ts`, `ask.command.dto.ts`, `ask.sse.dto.ts`,
      `index.ts` — publish closed shapes/parsers;
      run/thread/availability/catalogue/grant/request/acceptance/quota and version-1 progress
      envelopes. Query is nonblank <=16,000 characters; inputs are positive safe integer centavos
      and finite positive area, currency BRL; states/results/terminal markers/confirmation
      chronology agree. Reserve nullable principal ownership. Preserve immutable original vs edited
      inputs and full ordered thread runs. Do not fabricate live model provenance.
- [x] `packages/application/src/ask/ask.facade.ts`, `ask-fixture-read.port.ts`,
      `ask-query.service.ts`, `index.ts`, root `src/index.ts` — facade reads through fixture port,
      validates capability before disclosure and returns clones. Resolve known IDs only; validate
      replay cursor for that run before streaming. Expose no arbitrary state mutation or live
      command dispatch.
- [x] `packages/infrastructure/src/ask/synthetic-ask.adapter.ts`, `index.ts`, root `src/index.ts` —
      deterministic static fixtures per seven public states, earlier complete thread runs,
      degraded/low-confidence proposal, recorded synthetic confirmation with edited inputs,
      successful deterministic price example, unavailable-intent and categorical failure examples.
      Stable canonical IDs, dates, version, catalogue grants and monotonic preview frames. Every
      full preview ends explicitly; snapshots are prepared phases, not live materializations. Do not
      retain caller input or write state.
- [x] `apps/api/src/ask/ask.controller.ts`, `ask.module.ts` — wire GET capabilities/fixtures,
      threads/:id, runs/:id and runs/:id/events under existing version prefix. Reject all queries;
      validate UUID/Bearer/Last-Event-ID; canonical errors before headers; safe JSON SSE event
      type/id/data, no capability in frames, terminate on terminal frame and unsubscribe on
      disconnect. Register canonical unprefixed path refusal if necessary. POST command shapes are
      documented but handlers intentionally absent.
- [x] Adjacent `*.test.ts` for every new domain/service/contract/adapter/controller file — start
      from failing named tests for matrix rows, positive and negative parser recursion, semantic
      state/result/decision invariants, replay identity/order/terminal, caller mutation,
      authorization-first, and typed post-header failure. Test fake fixture port without
      infrastructure and no provider/network. Update the root boundary tests only to assert new
      compliance, never weaken zones.
- [x] `integration/ask-contracts.integration.test.ts` and root `package.json` alias
      `test:integration:ask` — actual production Compose API image on owned postgres/migrations/API
      stack, seven fixture journeys parsed from real SSE frames with strict public parsers, full
      thread/edited-input consistency, terminal classification, current/foreign/malformed replay,
      capability refusals, canonical errors/headers/unprefixed paths, POST absence, clone isolation
      and zero owned SQL-table changes. Include a distinct API E2E fixture flow from catalogue/grant
      to run/thread and explicit terminal. Use no handcrafted assertion/HTTP/parser that bypasses
      public contract validation; SSE transport framing parsing is allowed. All test/resource
      cleanup uses shared support.
- [x] `docs/api/ask.md`, `docs/testing/integration.md` and this plan — documentation-writer
      reference: exact implemented endpoints, public schemas/examples, prepared snapshot vs scripted
      preview distinction, syntax for capability/cursor, non-live availability and command shapes
      without runtime handlers, testing commands and evidence. No invented persistence/quotas/AI
      claims.
- [x] Independently run every final gate after review changes and record counts/log paths;
      auto-commit source first, tests second, docs last on `feat/phase-1`, English scope-free
      messages, normal hooks/no AI trailer/no push. Outer orchestration closes ticket only after
      verified `built`.

**Acceptance Criteria:**

- Given the real owned API and catalogue, when a client uses the synthetic grant to read each of the
  seven state fixtures and stream its preview, then versioned public events follow the declared
  scripted transition sequence to one explicit completed/failed/cancelled/expired terminal, with no
  later frame and no provider call.
- Given an awaiting-confirmation fixture, when the client reads its full thread and preview, then
  the earlier run, immutable question/original inputs, sub-0.85 degraded decision, nothing-computed
  pause, recorded synthetic confirmation and edited inputs are all representable without a live
  model or overwritten earlier value.
- Given wrong/missing capability or malformed/foreign cursor, when real HTTP reaches run/thread/SSE
  paths, then access is refused with sanitized canonical JSON before any stream/history disclosure,
  server-generated request ID and no sensitive error text.
- Given a valid same-run cursor, when the fixture preview is opened, then only later stable sequence
  IDs are emitted with its terminal still explicit; metadata makes clear this proves fixture replay
  only.
- Given malformed nested shapes or inconsistent states/terminals/inputs, when public parsers receive
  them, then strict validation fails; valid request/acceptance/quota samples round-trip with
  reopening time and no actual submission endpoint.
- Given all fixture API journeys and the owned database before/after, when compared, then every
  table count/content digest is unchanged, no Ask table/outbox write exists and all foreign Docker
  containers/volumes survive cleanup unchanged.

## Implementation Notes

Implemented framework-free Ask views and preview invariants, independent closed wire contracts, an
authorization-first fixture query facade, a deterministic synthetic adapter, and thin Nest versioned
read/SSE endpoints. Only availability/catalogue use `/ask`; run/thread routes follow D-043. Reserved
command parsers include the required `Idempotency-Key` header shape without live POST dispatch.
Canonical UUID, capability and cursor checks reject trailing-control values.

Added adjacent domain/contracts/application/infrastructure/controller tests and the production Ask
integration campaign, with a distinct catalogue-to-edited-terminal API E2E journey. API docs
distinguish prepared snapshots, finite scripted previews and fixture-only replay. Existing
framework/dependency boundaries, coverage floors, migrations and AI no-op runtime are unchanged.

The implementation agent accidentally rendered the installed bmad-build workflow before reading this
plan's explicit prohibition on a nested workflow. It stopped after rendering/reading, ran no story
workflow or commit, reported the mistake, and preserved generated unrelated state. Final independent
gates, review and commit sequencing remain the outer orchestrator's responsibility.

## Plan Change Log

- Verification correction: use `pnpm run test:coverage`, the repository's canonical root script.
  The planned recursive `--if-present run test:coverage` exits successfully without measuring
  anything because individual packages do not define that script. No coverage configuration or
  threshold changed; the root script measures all eight workspaces independently.

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Nonterminal runs accept a terminal history step — independently
    reproduced by changing a completed fixture to running and clearing its result/terminal;
    both public run and SSE parsers still accepted the completed final step. This lets future
    wire clients admit contradictory progress. Patched the existing terminal-step check to
    require the final terminal phase to match the run state. Parent-executed run and SSE
    regressions reject all four terminal phases in a nonterminal running run; no new surface.
  - `[medium]` `[patch]` Recorded confirmation inputs can change between preview frames —
    independently reproduced by changing the completed frame's confirmed price and matching
    result while retaining the recorded confirmation timestamp; per-frame parsers and the
    application preview invariant both accepted it. A consumer can calculate from inputs
    different from its observed confirmation. Patched equality of all existing confirmation
    fields across subsequent frames. Parent-executed HTTP/controller regression proves that
    individually valid price/area edits with consistent results cannot change a recorded
    confirmation; fixture and wire shapes remain unchanged.

## Matrix Test Audit

The parent independently ran the root unit suite (138 files / 1,413 tests) and the focused Ask
production-image campaign (1 file / 2 tests, 87.73 seconds). Every matrix row has executed, passing
coverage; none relies on a skipped or merely declared test:

- Catalogue: adapter test `publishes seven canonical UUIDv7 fixtures, synthetic grants and non-live
availability`, contract test `closes catalogue, synthetic grant and availability shapes with seven
public states`, and the seven-journey integration test.
- Snapshots: contract test `round-trips edited confirmation without replacing immutable original
inputs`, application tests `refuses malformed and wrong authority before any history or preview
read` and `returns deep clones on every public surface and handles authorized missing fixtures`,
  plus both integration journeys.
- Scripted stream: domain test `requires ordered run-scoped transitions, immutable snapshot
identity and exactly one explicit terminal`, API test `converts a post-start source exception into
a closed failed terminal and unsubscribes on terminal`, and both integration journeys.
- Terminal previews: SSE contract test `requires explicit matching terminal events and categorical
safe failures` and the seven-journey integration test's four terminal classifications.
- Resume: application test `rejects foreign, malformed, zero, future and wrong-version cursors
while replaying only later frames` and the seven-journey integration test's real HTTP cursor
  cases, including consumed terminals.
- Strict contracts: read tests `recursively rejects missing and extra fields in every nested run
object with a fixed message` and `rejects wrong dates, units, identifiers, state, proposal and
terminal semantics`, plus command and SSE rejection tests.
- Future requests: all four `future Ask command contracts` tests and the API test `has no POST
runtime handlers for reserved command shapes`; the integration campaign verifies the same 404s.
- Privacy/boundaries: API sanitization/authorization tests and both production-image integration
  tests, including unchanged counts/content digests for every owned SQL table and owned cleanup.

Named unit output is in `/tmp/rei-ask-stub-verify-2uy9pE/ask-unit-named.log`; focused campaign output
is in `/tmp/rei-ask-stub-verify-2uy9pE/ask-focused.log`. Its executed test names are `Ask contracts:
seven production API SSE journeys, authority, replay and zero SQL changes` and `Ask API E2E:
catalogue grant opens a full thread and an edited-confirmation terminal preview`.

After the review patches, the parent repeated root unit verification (138 files / 1,416 tests)
and the focused production-image campaign (1 file / 2 tests, 87.97 seconds). It also independently
executed all 18 tests in the three affected regression files: contracts output is in
`/tmp/rei-ask-stub-verify-2uy9pE/contracts-regressions-parent.log` and controller output in
`/tmp/rei-ask-stub-verify-2uy9pE/api-regressions-parent.log`. The new tests are `rejects every
terminal final step in an otherwise nonterminal running run`, `rejects terminal step phases hidden
inside nonterminal running progress`, and `preserves recorded edited confirmation across
individually valid preview frames`.

## Design Notes

D-043 deliberately freezes examples before execution. Fixture catalogue grants protect only public
synthetic histories; they are not deployed ownership credentials. A fixture's state is its prepared
snapshot phase; its stream is a labelled scripted preview of the subsequent path, including
already-recorded synthetic confirmation. Reads never claim to mutate a live run or implement ADR
0012's event log. Future execution must keep wire invariants and replace this fixture provider with
durable authority. No screen changes, so no browser artboard acceptance in this story.

## Auto Run Result

Implemented strict typed Ask run/thread/command/SSE contracts and seven prepared synthetic
fixtures through authorized versioned HTTP reads and explicit finite terminal streams. This is a
read-only example capability, not live AI execution, persisted history, quota enforcement or
durable reconnect. No UI, migration, provider, dependency or environment change was needed.

Changed files:

- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md` —
  Mirrors D-043's owner-authorized prepared fixture semantics.
- `apps/api/src/ask/ask.module.ts` — Wires the synthetic fixture port, facade and HTTP controller.
- `docs/testing/integration.md` — Adds the Ask campaign and its real-service/API E2E verification.
- `package.json` — Adds the focused test:integration:ask command.
- `packages/application/src/index.ts` — Exports Ask from the application package.
- `packages/contracts/src/ask/index.ts` — Exports Ask wire types and parsers.
- `packages/domain/src/ask/README.md` —
  Describes framework-free Ask views and prepared preview invariants.
- `packages/domain/src/index.ts` — Exports Ask from the domain package.
- `packages/infrastructure/src/index.ts` — Exports the Ask infrastructure adapter.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/story-run-contracts-and-a-stub-stream-plan.md`
  Records intent, execution, matrix evidence and review outcomes.
- `apps/api/src/ask/ask.controller.test.ts` —
  Covers actual HTTP, authority, edited confirmation and safe stream failures.
- `apps/api/src/ask/ask.controller.ts` —
  Exposes authorized reads and finite, sanitized versioned SSE previews.
- `docs/api/ask.md` — References public endpoints, schemas, synthetic grants and non-live semantics.
- `integration/ask-contracts.integration.test.ts` —
  Proves seven production-image journeys and edited-terminal E2E without SQL changes.
- `packages/application/src/ask/ask-fixture-read.port.ts` —
  Defines the framework-neutral fixture read boundary.
- `packages/application/src/ask/ask-query.service.test.ts` —
  Verifies authority-first reads, clones and run-scoped replay.
- `packages/application/src/ask/ask-query.service.ts` —
  Checks authority and cursors before reading prepared views.
- `packages/application/src/ask/ask.facade.ts` — Publishes the explicit Ask read facade.
- `packages/application/src/ask/index.ts` — Exports the Ask application surface.
- `packages/contracts/src/ask/ask.command.dto.test.ts` —
  Covers reserved request, acceptance, quota and idempotency shapes.
- `packages/contracts/src/ask/ask.command.dto.ts` —
  Validates closed future command shapes without runtime execution.
- `packages/contracts/src/ask/ask.read.dto.test.ts` —
  Covers recursive validation and cross-field run/thread semantics.
- `packages/contracts/src/ask/ask.read.dto.ts` —
  Validates public prepared views and matching history/state semantics.
- `packages/contracts/src/ask/ask.read.types.ts` —
  Declares neutral typed Ask wire shapes independently of domain.
- `packages/contracts/src/ask/ask.sse.dto.test.ts` —
  Covers versioned progress, cursor IDs and explicit terminals.
- `packages/contracts/src/ask/ask.sse.dto.ts` — Validates run-scoped version-1 SSE envelopes.
- `packages/domain/src/ask/ask-preview.test.ts` —
  Covers valid transitions, stable identity and explicit terminal completion.
- `packages/domain/src/ask/ask-preview.ts` —
  Enforces sequence, identity and immutable recorded confirmation.
- `packages/domain/src/ask/ask-read.types.ts` —
  Defines seven public phases and neutral immutable prepared views.
- `packages/domain/src/ask/index.ts` — Exports Ask domain types and pure invariants.
- `packages/infrastructure/src/ask/index.ts` — Exports the synthetic Ask adapter.
- `packages/infrastructure/src/ask/synthetic-ask.adapter.test.ts` —
  Verifies all fixtures, edited confirmation, catalogue and clone isolation.
- `packages/infrastructure/src/ask/synthetic-ask.adapter.ts` —
  Supplies seven deterministic prepared fixtures and finite scripted streams.

Review: two medium findings, both patched; high/low/false/maybe-false findings zero. No rejected
or deferred finding, intent gap or re-derivation. The same implementation agent made the two
local invariant corrections; the parent independently reran the 18 affected tests and all root
gates. Every finding retains its own evidence and applied correction in Review Triage Log.

Follow-up recommendation: false. First-pass patched counts are high 0, medium 2, low 0. Two
medium patches meet the count trigger, but no specific unverified risk remains in either fix:
all four terminal-phase contradictions and individually valid price/area confirmation changes
have independently executed regression coverage. No new public shape or branch of execution
was introduced. All post-patch root gates and the full integration suite passed independently.

Residual limits: grants protect deliberately public synthetic histories only; replay is fixture
replay, not a durability promise. Future live execution must implement durable ownership,
commands, quota accounting and event retention in its own stories. The existing web build emits
its unchanged chunk-size advisory. VPS-dependent stories remain owner-blocked.

## Verification

Implementation-agent evidence (before final independent review gates):

- `pnpm run lint`: passed; `/tmp/rei-ask-implementation-lzKyi3/lint.log`.
- `pnpm run build` and `pnpm run typecheck`: passed, including strict integration checking.
- Affected unit suites passed: domain 377 tests, application 189, contracts 107, infrastructure 376
  and API 146. These include named authorization-before-disclosure, recursive closed-object
  rejection, safe post-start SSE failure and immutable edited-input tests beside the corresponding
  source files.
- `pnpm run test:integration:ask`: 1 file / 2 tests passed in 89.96 seconds;
  `/tmp/rei-ask-implementation-lzKyi3/ask-integration.log`. Reported tests:
  `Ask contracts: seven production API SSE journeys, authority, replay and zero SQL changes` and
  `Ask API E2E: catalogue grant opens a full thread and an edited-confirmation terminal preview`.

The checklist below was completed independently by the outer orchestrator after review patches,
not by the implementation agent.

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all root gates pass;
  integration compiler included.
- `pnpm run test:coverage` — all existing 80% statement/line/function and 75% branch
  floors pass unchanged.
- `pnpm run test:integration:ask` — actual HTTP/SSE integration and API E2E journeys pass without
  skip/retry, clean owned teardown.
- `pnpm run test:integration` — every campaign passes after final patches.
- `pnpm exec prettier --check <changed-non-canvas-files>` and `git diff --check` — scoped formatting
  and whitespace clean; Markdown checks for changed docs.
- `git status --short`, full canonical HEAD, and exact pre/post Docker container/volume inventory —
  only story paths changed; unrelated resources and user stash preserved.

### Final independent post-review evidence

All commands exited zero, with no skip or retry. Logs below share the directory
`/tmp/rei-ask-stub-verify-2uy9pE/`:

- `pnpm run lint`: passed; `lint-after-review.log`.
- `pnpm run typecheck`: passed, including strict integration TypeScript;
  `typecheck-after-review.log`.
- `pnpm run build`: passed; `build-after-review.log`. Only the pre-existing web chunk-size
  advisory remains.
- `pnpm run test`: 138 files / 1,416 tests passed; `test-after-review.log`.
- `pnpm run test:coverage`: all eight workspaces passed unchanged floors (80% statements,
  lines and functions; 75% branches); `coverage-after-review.log`. Lowest workspace results
  are 88.42% statements, 83.25% branches, 91.87% functions and 90.56% lines.
- Parent affected regression reruns: 18 tests in 3 files passed; `contracts-regressions-parent.log`
  and `api-regressions-parent.log`.
- `pnpm run test:integration:ask`: 1 file / 2 tests passed in 87.97 seconds;
  `focused-after-review.log`. Real production API/PostgreSQL, public SSE parsers, full thread and
  edited-input API E2E, unchanged SQL content.
- `pnpm run test:integration`: all 23 files / 41 tests passed in 796.44 seconds;
  `integration-after-review.log`. The focused and full Compose campaigns ran serially after
  review patches, never concurrently.
- Scoped Prettier and Markdown lint: passed; `format-after-review.log` and
  `markdown-after-review.log`. The first Markdown check identified long newly added evidence
  lines; they were soft-wrapped without changing rules, then the complete check passed.
- `git diff --check` and staged whitespace check: passed. Only the 33 reviewed story paths
  changed from canonical baseline `3b2d87d76bc4a8f311b9fe30ddf475d66200f08f`.
- Exact before/after Docker inventory matched byte-for-byte: all 13 pre-existing containers and
  13 volumes preserved, no owned campaign or Ryuk resources left. The pre-existing user stash
  remains untouched. The immutable intent-contract SHA-256 remains
  `613b444852c45806effe8bb203036006d8ce78a71d84b09ae20fdb6b1a0b89f8`.

The documentation commit's first normal hook run flagged the public synthetic grant in a curl
authorization example. Replaced the literal with a catalogue-supplied shell variable, without
changing the API or allowing/ignoring any scanner rule; the normal redacted staged scan then passed.

Reviewed source, tests and documentation are committed separately with normal hooks and no push.
Outer ticket closure is separate from the build-auto built checkpoint.
