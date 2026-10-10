---
title: 'Shared kernel of the four packages'
type: 'refactor'
ticket: '2'
created: '2026-10-10'
status: done
baseline_revision: 'ff7844fdf2360696e7a05a17d23a7a26b85788c9'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The four packages lack the context-neutral `shared/` foundation required by ADR 0011, while existing ports and PostgreSQL code still occupy generic top-level technical folders. Event and outbox contracts also lack the fixed W3C trace-context slot needed by later propagation work.

**Approach:** Introduce small, vendor-neutral shared kernels in every package, move existing context-neutral code beneath them without breaking package-root consumers, and define tested domain/application primitives that later stories can implement without leaking infrastructure concerns.

## Boundaries & Constraints

**Always:** Keep `@rei/domain` framework-free; use BRL-only immutable money, explicit provenance, UUIDv7 validation, serializable event payloads, and a stable W3C trace-context shape. Keep transaction/outbox abstractions consumer-owned and vendor-neutral, bind outbox appends to a transaction, retain current root exports, colocate deterministic tests, and expose each area through barrels.

**Never:** Add business rules or repositories to `shared/`; generate UUIDs in application code; introduce vendor/OTel types; add SQL migrations, RabbitMQ, relays, consumers, retries, trace propagation, context modules, contract conventions from B6, or VPS work; change public API behavior or unrelated bounded contexts.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                               | Expected Output / Behavior                                          | Error Handling                                        |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| Valid kernel values       | BRL amount, complete provenance, UUIDv7, serializable event | Immutable typed values and stable event/outbox records are produced | No error expected                                     |
| Invalid money or identity | Non-BRL/invalid minor units or non-v7 UUID                  | Construction/parsing is rejected deterministically                  | Throw a domain validation error without partial state |
| Deferred tracing          | Event created before story 1.8 supplies trace data          | Trace-context field remains explicit and empty                      | No vendor default or fabricated context               |
| Persistence move          | Existing API/worker import package-root symbols             | Existing health/readiness wiring compiles and behaves unchanged     | Compatibility remains through root barrels            |

</intent-contract>

## Code Map

- `packages/domain/src/index.ts`, `packages/domain/src/market/price-per-square-meter.ts` -- preserve root API and route market exports through its context barrel.
- `packages/domain/src/shared/` -- add Money, Provenance, UUIDv7 identifiers, primitive event payloads, domain-event base/envelope, barrels, and focused tests.
- `packages/application/src/ports/database-availability-probe.ts` -- move beneath `src/shared/` while retaining the exported token/interface.
- `packages/application/src/shared/` -- add clock, transaction, and transaction-bound outbox contracts plus tests/barrels.
- `packages/infrastructure/src/persistence/` -- move database connection, availability probe, redaction, and tests to `src/shared/persistence/`; preserve root exports.
- `packages/contracts/src/health.ts`, `packages/contracts/src/version.ts` -- move context-neutral public shapes beneath `src/shared/` and re-export unchanged.
- `packages/*/README.md` and package barrels -- document and expose the shared boundary without changing manifests or dependency direction.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/shared/` and `packages/domain/src/market/` -- implement and export the immutable kernel and context barrel with deterministic unit tests; freeze complete event instances, validate three-segment lower-kebab event names, and reject invalid UUIDv7 values.
- [x] `packages/domain/src/shared/` -- validate and canonicalize durable data: strict RFC 3339 timestamps become UTC ISO strings, source URLs must parse as absolute URLs, W3C `traceparent`/`tracestate` values must be valid, and JSON payload validation must reject sparse arrays, cycles, non-finite numbers, and non-plain objects.
- [x] `packages/application/src/shared/` -- relocate the availability port and add clock, transaction, event-envelope/outbox-row, and append-port contracts with contract-focused tests.
- [x] `packages/infrastructure/src/shared/persistence/` -- relocate PostgreSQL connection/probe/redaction code and tests, updating imports and compatibility barrels.
- [x] `packages/contracts/src/shared/` -- relocate context-neutral health/version contracts and preserve package-root imports.
- [x] `packages/*/README.md` and `packages/*/src/index.ts` -- describe the ownership boundary and expose only intended public symbols.

**Acceptance Criteria:**

- Given each package, when its source tree is inspected, then context-neutral kernel/port/persistence code is under `shared/` and no moved duplicate remains outside it.
- Given current API and worker consumers, when the workspace compiles and tests, then their package-root imports and health/readiness behavior remain unchanged.
- Given a domain event and application outbox record, when tracing is absent or supplied, then both use the same explicit vendor-neutral W3C trace-context field that story 1.8 can populate.
- Given malformed event names, W3C carriers, timestamps, source URLs, or JSON payloads, when the shared kernel validates them, then it rejects them before any durable record can be created; accepted timestamps are canonical UTC ISO strings.
- Given a valid event is constructed, when a caller attempts to mutate metadata, trace context, or payload at runtime, then the complete event graph remains unchanged and frozen.
- Given the shared folders, when reviewed, then they contain no business-context rule, repository, vendor type, broker implementation, or database migration.

## Implementation Notes

- Added immutable and runtime-validated domain primitives under `packages/domain/src/shared/`, including JSON-only payload cloning and an explicit nullable W3C trace-context slot.
- Added vendor-neutral clock, opaque transaction, transaction runner, event envelope, outbox row, and transaction-bound append contracts under `packages/application/src/shared/`.
- Moved context-neutral health/version contracts and PostgreSQL plumbing beneath their packages' `shared/` folders while retaining all package-root exports used by API and worker.
- Kept UUIDv7 generation, SQL outbox storage, trace propagation, broker behavior, and all VPS work deferred to their owning stories. Corrected two stale ADR filenames in this plan after resolving them to the repository's same-number normative ADRs.
- Verification passed: 89 focused package tests, 128 repository tests, lint, typecheck, build, path inspection, adversarial compiled-code checks, and staged/unstaged diff checks. The existing Vite chunk-size warning remains non-fatal and unrelated.
- The first implementation attempt was reverted after review exposed six missing validation/immutability invariants. Preserve its correct package moves, compatibility barrels, UUIDv7 validation, transaction-bound outbox API, deep cloning, documentation, and focused-test structure while rederiving the hardened kernel.

## Plan Change Log

### 2026-10-10 — Review loop 1

- Trigger: review reproduced mutable event instances plus acceptance of structurally invalid event names, W3C carriers, timestamps, provenance URLs, and sparse arrays.
- Amendment: split durable-value validation into an explicit task and added observable acceptance criteria for strict/canonical timestamps, absolute URL parsing, W3C carrier validation, dense JSON arrays, event-name structure, and deep event immutability.
- Known-bad state avoided: validated event/outbox records can no longer change after construction or serialize differently from their in-memory representation, and malformed durable metadata cannot enter later relay/telemetry work.
- KEEP: retain the four-package `shared/` layout, root-export compatibility, UUIDv7 branding/validation without generation, transaction-bound outbox port, context-neutral PostgreSQL moves, deep immutable payload cloning, documentation, and focused tests from the first derivation.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 6 findings — high 0, medium 6, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Domain-event metadata remained mutable after construction — reproduced against the compiled event; the plan now requires the complete event instance to be frozen while preserving deep-frozen payload and trace data.
  - `[medium]` `[bad_plan]` Event names outside ADR 0012's three-segment lower-kebab convention were accepted — `garbage`, uppercase, and whitespace forms passed; the plan now requires structural event-name validation and tests.
  - `[medium]` `[bad_plan]` Non-W3C trace carriers were accepted — a `traceparent` value of `garbage` passed; the plan now requires W3C `traceparent` and optional `tracestate` validation.
  - `[medium]` `[bad_plan]` Ambiguous non-RFC-3339 timestamps were accepted and retained — the compiled event accepted `0`; the plan now requires strict RFC 3339 input and canonical UTC ISO storage.
  - `[medium]` `[bad_plan]` Malformed provenance URLs were accepted — both `http://[` and `https://exa%mple.com` passed; the plan now requires native absolute-URL parsing.
  - `[medium]` `[bad_plan]` Sparse arrays passed JSON validation despite serializing holes as `null` — reproduced with a one-slot sparse array; the plan now requires dense-array validation and regression coverage.

### 2026-10-10 — Review pass 2

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `tracestate` parsing accepted CR, LF and non-W3C whitespace around list members while rejecting a valid leading-space value — reproduced against compiled code; parsing now removes only W3C SP/HTAB optional whitespace, rejects the unsafe carriers and accepts a leading-space value whose final character is valid.
  - `[medium]` `[patch]` an enumerable accessor could return a serializable value during validation and `undefined` during cloning — reproduced with a changing getter; validation now rejects accessors through property descriptors without invoking the getter.
  - `[medium]` `[patch]` `isUuidV7` branded uppercase input as canonical — reproduced against compiled code; the type guard now accepts lowercase canonical values only while `parseUuidV7` continues to canonicalize case-insensitive input.

### 2026-10-10 — Follow-up review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` accessor-backed domain-event and provenance inputs could change between validation and assignment — reproduced against compiled code; constructors now capture every input field exactly once and use only those snapshots.
  - `[medium]` `[patch]` accessor-backed trace carriers could pass validation and then store malformed values — reproduced with valid-first/garbage-later getters; both carrier fields are now captured once before validation and construction.
  - `[medium]` `[patch]` array subclasses could override `map()` and inject `undefined` after validation — reproduced against compiled code; serializable arrays must now be ordinary arrays without symbols or enumerable extra properties and cloning reads indexed data descriptors directly.

## Design Notes

The outbox row in this story is an application-level record contract, not a PostgreSQL table. ADR 0011 assigns UUID generation to PostgreSQL 18; the domain kernel therefore brands and validates UUIDv7 values but does not generate them. Trace context is a stable optional value object (`traceparent` plus optional `tracestate`) shared by the domain event and outbox record; actual capture and propagation remain deferred to story 1.8.

Use one shared timestamp parser for event and provenance values. Require an RFC 3339 date-time with an explicit `Z` or numeric offset, reject calendar normalization, and store `toISOString()` output. Validate `traceparent` as W3C version `00` with non-zero 32-hex trace ID, non-zero 16-hex parent ID, and two hex flags; validate supplied `tracestate` as a non-empty, bounded list-member string without control characters. Event types require exactly `context.aggregate.action`, each segment lower-kebab; concrete event authors remain responsible for choosing a past-tense action. Dense-array validation must inspect indexes rather than array callbacks that skip holes.

## Verification

**Commands:**

- `pnpm --filter @rei/domain test && pnpm --filter @rei/application test && pnpm --filter @rei/contracts test && pnpm --filter @rei/infrastructure test` -- all shared-kernel and relocated tests pass.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` -- the full repository quality gate passes.
- `find packages -path '*/src/*' -type f | sort` -- moved `ports/` and `persistence/` files exist only below package `shared/` folders.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

### Summary

Added the four package-level `shared/` boundaries required by ADR 0011. The domain package now
provides immutable and runtime-validated money, provenance, UUIDv7, timestamp, trace-context and
domain-event primitives; the application package owns vendor-neutral clock, transaction and
transaction-bound outbox contracts; context-neutral health/version contracts and PostgreSQL
plumbing now live below their respective shared folders without breaking package-root consumers.

### Files changed

- `packages/domain/src/shared/` and `packages/domain/src/market/index.ts` — add the framework-free
  shared kernel, compatibility barrel and focused validation/immutability tests.
- `packages/application/src/shared/` — relocate the database availability port and add clock,
  transaction and outbox contracts with contract tests.
- `packages/contracts/src/shared/` — relocate health and API-version contracts with a root-export
  compatibility test.
- `packages/infrastructure/src/shared/persistence/` — relocate the PostgreSQL connection,
  availability probe and redaction implementation/tests.
- `packages/*/src/index.ts` and `packages/*/README.md` — preserve public imports and document the
  ownership limits of each shared boundary.
- `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-shared-kernel-of-the-four-packages-plan.md`
  — records implementation, plan repair, review triage and verification evidence.

### Review findings

- First pass: six medium `bad_plan` findings. The plan was amended to make complete event
  immutability, event-name structure, W3C carrier validation, strict/canonical timestamps, absolute
  source URLs and dense JSON arrays observable requirements; the initial implementation was
  reverted and re-derived.
- Second pass patches: three medium entries. W3C optional whitespace is now parsed without hiding
  unsafe characters, payload accessors are rejected without evaluation, and the UUIDv7 type guard
  preserves its canonical lowercase invariant.
- Follow-up patches: three medium entries. Durable constructor inputs and trace carriers are now
  captured exactly once, and array validation/cloning no longer permits polymorphic behavior or
  extra observable state.
- Deferred: none. Rejected: none.
- Follow-up patched counts by entry verdict: high 0, medium 3, low 0.

### Follow-up review recommendation

`false`. The follow-up pass patched no high-severity entries, so the work has converged under the
workflow's follow-up rule.

### Verification performed

- Focused package suites passed: domain 82, application 3, contracts 1 and infrastructure 3 tests
  (89 total).
- `pnpm run lint` and `pnpm run typecheck` passed for all workspace projects in scope.
- `pnpm run test` passed 128 tests: domain 82, application 3, contracts 1, infrastructure 3, web 14,
  AI 9, API 10 and worker 6.
- `pnpm run build` passed for all workspace projects in scope.
- Compiled-code adversarial checks confirmed complete event freezing; rejection of malformed names,
  traces, timestamps, URLs, sparse arrays, unsafe `tracestate` whitespace and changing accessors;
  acceptance of a W3C-valid leading-space trace-state value; and canonical UUID parser behavior.
- Follow-up compiled-code checks confirmed single-read snapshots for events, provenance and trace
  carriers; rejection of array subclasses and enumerable extra properties; and cloning of ordinary
  array indexes without invoking an overridden `map()` method.
- Source-tree inspection confirmed no moved files remain in the old application `ports/`,
  infrastructure `persistence/` or top-level contracts locations.
- `git diff --check` and `git diff --cached --check` passed.

### Residual risks

No review risk remains open after the follow-up pass. UUID generation, SQL outbox persistence,
trace propagation, brokers and migrations remain intentionally deferred to their owning stories.
The web build retains its pre-existing non-fatal Vite warning for the 536.96 kB `CityScene` chunk.
