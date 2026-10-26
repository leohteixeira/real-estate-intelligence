---
title: 'Thread capability and demo quotas'
type: 'feature'
ticket: '12'
created: '2026-10-26'
status: done
baseline_revision: '4ca99ffb50ff57b859bb8f56f5fa2b4a4297ee61'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /home/vscode/.codex/skills/nestjs-modular-monolith/SKILL.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0010-durable-ai-runs-and-remote-checkpoints.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-16's public admission has no visitor identity or daily quota. Existing strong
thread authority must also be demonstrated on all four protected public surfaces.

**Approach:** Apply D-103 through the existing admission transaction and typed refusal contract;
prove limits, concurrency, calendar boundaries, atomicity and authority over real HTTP/PostgreSQL.

## Boundaries & Constraints

**Always:** Default 20 accepted runs per visitor and 100 globally per America/Sao_Paulo calendar
day, both validated positive configuration. The same authenticated opaque random visitor cookie
covers all creation modes/threads; purpose-separate its signing with the existing protected
operational secret. Thirty-day expiry, HttpOnly, SameSite=Strict, Secure and application prefix
in production, explicit local-fixture scope. Pass only a digest to admission; never use the cookie
as thread authority. Matching authorized replay returns before quota charging, even when full.
A new acceptance and its quota effect are atomic with run/event/outbox; refusal/rollback does not
charge. Accepted cancellation/failure still counts. Read/confirm/cancel/SSE never recharge.
The SQL clock determines the day and next midnight after locking, using the named timezone.
Preserve historical bytes, strong capability checks, ordering, deadlines and first-terminal fences.

**Never:** IP fingerprinting, identity in user JSON/documents/events/traces, new credential,
fail-open public admission, silent trusted-caller quota bypass, new engine/queue/rate-limit service,
model calls, UI/headless work, production action, .env access, weakened assertions/hooks/coverage,
automatic retries or longer test timeouts. One heavy operation at a time; no broad audit.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                        | Expected Output / Behavior                                 | Error Handling                               |
| ------------------ | ---------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| First/new identity | No valid cookie, valid capability/key/body           | Issue authenticated opaque identity and admit within quota | Tampering never selects an existing visitor  |
| Visitor limit      | Same visitor across fresh threads, 20 accepted       | 21st is 429 with visitor scope and next local midnight     | No run/event/outbox admission                |
| Global limit       | Multiple visitors reach configured total             | Further new admission is 429/global with reopening         | Concurrent calls cannot over-admit           |
| Replay             | Same capability/key/body after exhaustion            | Same run, no extra charge or effects                       | Changed body/foreign authority still refused |
| Day/rollback       | SQL day boundary or injected failed transaction      | New day opens; rollback leaves allowance unchanged         | Original calendar and atomicity preserved    |
| Thread protection  | Missing/foreign capability with valid visitor cookie | History/confirm/cancel/SSE refused                         | No private payload or effect                 |

</intent-contract>

## Code Map

- `apps/api/src/ask/ask-live.controller.ts::create` parses all five public modes and calls the
  existing facade. Add the same server-validated visitor admission to each path. Keep strong
  Bearer, key/body parsing, request cancellation and text-input refusal. A small cookie helper
  beside this controller is sufficient; Node crypto and existing protected dispatch secret are
  already available. Do not trust forwarded headers to select production cookie security.
- `apps/api/src/ask/ask.config.ts` and `ask.module.ts` own config/composition. Public production
  requests use `/real-estate-intelligence/` although upstream paths are `/api/v1`; use explicit
  production scope and root local scope. Backend request.path cannot infer that prefix.
- `packages/application/src/ask/ask-live.facade.ts`, `ask-run.repository.ts`, `ask-run.service.ts`
  carry creation through Market validation to persistence. Add explicit required visitor
  admission metadata, separate from question JSON and thread capability. Update typed callers
  and doubles rather than retaining a public or trusted default that bypasses quota.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts::create` has two transactions: thread
  preparation, then atomic run acceptance. The second already returns replay before thread lock,
  authority and pending checks. Enforce quota immediately before new acceptance under a consistent
  namespaced global advisory lock (reuse `lockAskThread`), not in a separate reservation.
  The existing admitted run is the adequate accounting ledger: add a nullable digest column
  and a suitable admission-time index with an additive 6009 migration; count the SQL daily range
  globally and for the visitor. Historical runs remain readable and count globally by admission.
  No counter table or maintenance subsystem is necessary. Get day/reopening from one SQL-clock
  observation after waiting for locks; do not approximate the day as 24 hours or UTC-3.
- `packages/contracts/src/ask/ask.command.dto.ts::parseAskQuotaRejection` already closes
  code/scope/reopensAt. Reuse it. Add a typed application quota error and exact API exception;
  `apps/api/src/http/api-exception.filter.ts` otherwise strips arbitrary 429 JSON. Keep the
  existing distinct pending-limit refusal and all generic error sanitization.
- Existing controller/config/filter/contract/service/repository tests provide direct seams.
  Update existing direct integration callers mechanically for required visitor metadata and
  explicit fixture policy when their legacy matrix needs more than the public defaults.
  This must not become a production disable flag. Existing campaign assertions remain intact.
- `integration/support/fixture.ts`, `integration/ask-intent-decision.integration.test.ts` and
  the image preparation scripts provide owned PG/API fixtures and serial image tagging.
  Prove the new slice with PostgreSQL and the real API; no consumer/AI/provider is necessary
  because atomic acceptance persists its outbox before dispatch. Retain owned cleanup/foreign
  inventory assertions. Use existing Supertest/Testcontainers/Vitest; no alternate harness.

## Tasks & Acceptance

**Execution:**

- [x] API config/cookie helper and direct tests: authenticated opaque browser identity, expiry,
      production/local cookie attributes, invalid/tampered input, purpose separation and no leakage.
- [x] Application admission ports/service, required callers and direct tests: propagate identity
      for every mode; preserve all existing capability, validation and cancellation contracts.
- [x] Additive migration 6009, repository and tests: atomic daily accounting with locks, SQL
      calendar, replay, pending/authorization precedence and rollback; preserve old documents.
- [x] Typed quota exception/filter and tests: strict 429 body with observable reopening.
- [x] Native public campaign: all matrix rows, all protected surfaces and concurrent caps.
- [x] Existing operational/API docs, epic Notes and this plan: actual policy, config, evidence,
      reviewed identity and bounded anonymous-cookie limitation; no duplicate report.

**Acceptance Criteria:**

- Given one issued visitor identity and valid strong capabilities, when 20 fresh runs are accepted
  across threads/modes and the next is submitted, then public HTTP returns 429/visitor and the
  exact next Sao Paulo midnight, with no extra run/event/outbox. Confirm/cancel/read do not charge.
- Given independent visitors at the global boundary, when concurrent valid requests race, then
  only the remaining capacity is accepted; public 429/global reports reopening and stored effects
  match accepted requests. A matching authorized replay still returns the original identity.
- Given a SQL-clock local-day change and an injected outbox failure, when admission is retried,
  then old-day usage does not consume the new day and rollback consumes no allowance. Historical
  documents remain identical through migration; no run or count is fabricated.
- Given a valid visitor cookie but absent/foreign thread authority, when history, confirmation,
  cancellation or SSE is requested, then each public surface refuses without private effects.
- Given malformed/tampered/expired visitor cookies, when public creation occurs, then the client
  cannot choose another visitor's identity; new identity issuance preserves the independent global
  cap. Public payloads and exported safe telemetry contain no cookie/digest/secret.

## Implementation Notes

- Creation now requires separate `AskVisitorAdmission` metadata through every facade/service/
  repository path. The API verifies a versioned HMAC cookie using a purpose-derived key from
  `ASK_DISPATCH_SECRET`; persistence receives only its SHA-256 digest. Duplicate, malformed,
  expired, future-issued or wrongly signed cookies receive a new random identity. Production
  uses `__Secure-rei_ask_visitor` scoped to `/real-estate-intelligence/`; local fixtures use the
  root-scoped `rei_ask_visitor`. Cookie security follows explicit environment configuration.
- `ASK_VISITOR_DAILY_LIMIT` and `ASK_GLOBAL_DAILY_LIMIT` default to 20 and 100 and reject
  nonpositive, fractional, malformed or unsafe-integer values. There is no disable/bypass flag.
- Migration 6009 adds nullable admission metadata and a covering admission-time index without
  rewriting historical JSON. The existing acceptance transaction serializes new admissions
  under `ask:demo-quota:global`, observes the SQL clock after locks, and counts the named local
  calendar range. Replay, authority and existing pending-capacity checks retain precedence.
  Both typed quota scopes use the existing strict rejection parser and sanitized HTTP filter.
- The native quota fixture runs only owned PostgreSQL, one-shot migrations, RabbitMQ and API
  resources. Its isolated role
  resolves `clock_timestamp()` to a fixture function/table, allowing actual SQL day transitions
  and advisory-lock waits without a production clock switch or catalog replacement. The intent
  upgrade fixture applies independent migration 6009 before using current admission code while
  retaining its populated 6006-to-6007 assertions. No model/provider runs are introduced.
- API and operation docs describe the policy, cookie scope/rotation, deployment ordering and
  bounded anonymous-cookie limitation. A browser identity is not a person: clearing a cookie
  can obtain another identity, while the global cap bounds aggregate accepted use.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; the independent context-free quick reviewer inspected the full unified diff,
  surrounding callers and fixture evidence and returned no supported defect or acceptance gap.

## Design Notes

D-103 resolves both unknowns under the owner's standing delegation, recorded before coding.
A browser cookie is not a person; clearing it can obtain a new identity, while the global cap
bounds aggregate use. Capability sharing does not transfer or bypass visitor quotas.
Risk rises to high for public admission authority, aggregate spending bounds and concurrency.
Full route exceeds 100 nonmechanical lines. D-012/ADR 0020 override Nest Prisma/NX/Jest examples;
existing BMAD artifacts replace interactive planning. No new context or owner change is needed.
Parent owns independent quick review, final gates, commits and orchestrator closure. The
implementer must not commit, push, deploy or delegate; record all verification results in this
plan. No other heavy work is currently running. Internal Docker was recovered after a previous
host OOM with daemon GOMEMLIMIT=512MiB/GOGC=50; do not reset that recovery or start host services.
Use bounded sequential builds and stop to reassess any repeated same-class environment failure.

## Verification

- Run affected direct cases before broader gates. Reuse unchanged code/dependency proofs;
  affected-workspace coverage keeps every current flag/floor and runs sequentially.
- Run `pnpm run build`, `pnpm run typecheck`, `pnpm run lint` sequentially. Update any necessary
  native caller typing without dropping assertions or relaxing strict integration checking.
- Prepare only affected API/migration images serially, with bounded Docker memory, then run the
  final native quota campaign once on the stabilized runtime; reuse unaffected images.
  Record commands, source/image identities, cleanup and limits here. Existing native Ask flows
  require targeted regression when changed admission affects them; do not repeat unrelated work.
- Normal changed-file hooks and `git diff --check` pass; documentation-only closure reuses proofs.

### Implementer evidence (2026-10-26)

- Loaded every frontmatter context file before implementation. Baseline remains
  `4ca99ffb50ff57b859bb8f56f5fa2b4a4297ee61`; the parent owns final reviewed Git identity.
- Affected direct service/repository/API cases passed before broad checks. `pnpm run build`
  passed across all eight workspaces (existing Vite bundle-size warning only). Final
  `pnpm run typecheck` passed across all workspaces and strict integration sources.
- Affected coverage ran sequentially with the entire unchanged `coverage_args` array from
  `scripts/test-coverage.sh` and only its workspace selection narrowed to application,
  infrastructure and API. All floors remain statements/lines/functions 80%, branches 75%.

  | Workspace      | Tests | Statements | Branches | Functions |  Lines |
  | -------------- | ----: | ---------: | -------: | --------: | -----: |
  | Application    |   293 |     90.78% |   89.79% |    94.25% | 92.12% |
  | Infrastructure |   552 |     84.08% |   77.06% |    89.51% | 85.88% |
  | API            |   225 |     95.23% |   86.44% |    98.06% | 96.29% |

- `pnpm run test:integration:prepare-ask-quotas` passed. Both builds were serial with
  Docker `--resource memory=1536m --resource cpu-quota=100000`; no daemon reset or host service
  operation occurred. Image identities:
  `rei-quota-images-api` = `sha256:0559ed0168eb06db52f77cef0740fafe9fb17778633b2e6008a4f50a0edc6a56`;
  `rei-quota-images-migrations` =
  `sha256:3559d29f285dbbcbe6a01f351f06fdee0705d871a319451d24c2e031f9455d0d`.
  API runtime source remained unchanged after image construction.
- The first native campaign stopped at migration startup before HTTP admission: placing the
  clock schema first in the owned role's search path caused the migration runner to create
  another control table and reapply migrations. The fixture now keeps `public` first and uses
  an owned `public.clock_timestamp()` function backed by its fixture clock table. The original
  pre-override connection still uses PostgreSQL's real clock. No catalog function, product
  runtime, assertion or timeout changed; owned cleanup and foreign-inventory assertions passed.
- The next native run reached visitor exhaustion/replay and protected public surfaces, then
  correctly refused the fixture's pause because no durable graph checkpoint existed. The fixture
  now supplies that required checkpoint through `PostgresGraphCheckpointRepository.execute`
  with its real execution grant, following the existing checkpoint fixture pattern. Production
  guards remain intact; cleanup and foreign-resource preservation again passed.
- Before another whole campaign, reassessed the fixture against the canonical existing sequence
  and ran `pnpm exec vitest run --config vitest.integration.config.ts
integration/ask-checkpoints.integration.test.ts -t 'cancelled checkpoint turns retain only
the latest eight and age older completed turns'`. It passed in 22.73 seconds (one selected
  test; six filtered), proving nine current admitted routed turns through claim, low-confidence
  decision reservation/acceptance, granted `intent-routing-v1` root checkpoint, completion to
  `awaiting_confirmation`, and refusal. Existing byte/retention assertions and owned/foreign
  cleanup passed. The corrected quota fixture uses that same sequence; no extra probe layer
  was added. Strict integration typecheck also passed after the fixture corrections.
- That whole matrix then passed visitor/global concurrency, all protected surfaces, authorized
  confirmation/replay/cancellation, actual midnight lock wait, outbox rollback and reopened daily
  allowance. Its extra historical DST loop exposed one remaining fixture-clock inconsistency:
  DDL-bound `platform.idempotency_key.created_at` still used the real clock while expiry used
  the 2018 fixture clock. An isolated temporary native PostgreSQL/repository probe reproduced
  SQL 23514 on
  `idempotency_key_expiry_follows_creation`. Reassessed reachable default bindings and rebound
  idempotency creation, thread creation and inbox receipt defaults to the owned fixture clock;
  the production constraint/migrations/runtime remain unchanged. No whole-campaign run resumed
  before verifying this exact correction narrowly.
- The corrected temporary DST probe passed in 17.98 seconds: 20 actual repository admissions
  at `2018-11-04T03:00:00Z`, exact 21st visitor rejection reopening at
  `2018-11-05T02:00:00Z`, and 20 retained idempotency creation times matching the same fixture
  clock. The diagnostic test was removed after this evidence; no alternate permanent harness
  or extra prerequisite layer was introduced.
- Final `pnpm exec vitest run --config vitest.integration.config.ts
integration/ask-demo-quotas.integration.test.ts` passed in 53.38 seconds (52.06-second test),
  within the original 600-second bound. Assertions covered all five public modes, concurrent
  20-visitor and 100-global caps with actual effect counts, historical NULL-identity accounting
  and byte preservation, strict scoped 429s, authorized replay and mismatches, all protected
  public surfaces, authorized confirmation/replay/cancellation without recharge, invalid cookie
  replacement, real advisory-lock waiting across SQL midnight, failed-outbox rollback, 20
  reopened next-day slots, and the 23-hour DST day. Public payload/log privacy assertions and
  exact pre/post foreign container/volume inventory and metadata assertions passed. Only owned
  PostgreSQL, one-shot migration, RabbitMQ and API containers ran; no worker, AI service, model
  or browser ran.
- Existing routed-intent regression command `pnpm exec vitest run --config
vitest.integration.config.ts integration/ask-intent-decision.integration.test.ts` passed in
  313.46 seconds (311.93-second test), within its unchanged 600-second bound. New API/migration
  images were retagged as the fixture inputs; unchanged AI/worker images were reused:
  `sha256:22c59a8d531e1f21911ba71aec016fb45f7dd2cb1eb9b6a8ce36fde819b2c8bf` and
  `sha256:f4c4805c8d84f2120bb5157d82ec4cb23728a2f3970e15589af06fffe8d15ae8` respectively.
  Full existing confidence, confirmation, restart, cancellation, stale-grant, rollback,
  terminal-race and populated-upgrade assertions remained intact. Execution was scripted local
  AI with no provider call. Owned cleanup and foreign resource/metadata assertions passed.
- Runtime/config/build-source manifest SHA-256:
  `e4692d500088b9e8a9bba84f8dc3ab8eebb20586d1e5a6ea4a87ed1d5f6c4aa2`;
  session manifest `/tmp/rei-quota-runtime.sha256` covers the 15 changed runtime/config/build
  files. Final native quota test SHA-256:
  `4b20664ff2a9bf4446b18b271db05ca1bf44aea1d8bdf656020f36fc0d61feeb`.
- During test adaptation, initial typechecks caught an overloaded Express cookie spy type and
  an incorrect array passed to the variadic cleanup helper; both test-only issues were corrected
  before the passing full/strict typechecks. No production typing, assertion or gate was relaxed.
- Final `pnpm run lint` passed, including all ESLint, context-boundary and migration-convention
  checks. No assertion, timeout, worker count, coverage floor or hook configuration was weakened.
- Final strict integration typecheck passed after every fixture correction. Changed-file
  Prettier formatting passed; initial Markdown lint identified three documentation line wraps,
  corrected without product changes, and the final six-file Markdown lint passed. Shell syntax
  for the bounded image-preparation script and `git diff --check` passed. Documentation-only
  closure reuses all product proofs above.
- Implementer execution is complete. Parent-owned final unified-diff/matrix audit, independent
  quick review, staged commit hooks and ticket/orchestrator closure remain the delivery gates.
  No commit, push, production action, environment-file read, provider call or browser run was
  performed by this implementation.

### Parent verification and matrix audit (2026-10-26)

Read the complete final unified diff, including all new files, and inspected both passing native
outputs. All six intent matrix rows ran in the final quota campaign: new/tampered identity,
visitor exhaustion, concurrent global exhaustion, authorized and conflicting replay, actual
lock-wait day transition with rollback, and missing/foreign authority on protected surfaces.
Direct tests additionally prove production cookie scope and closed configuration/error contracts.
Existing routed-intent regression covers affected lifecycle/recovery dependencies. The final
coverage, build, types, lint and fixture proofs above are reused without confidence reruns.

## Auto Run Result

Implemented authenticated anonymous admission and atomic named-calendar demo quotas while
preserving strong conversation capability, historical documents and existing execution behavior.
The required independent quick review returned zero findings: no patches, deferrals or rejected
findings. Patched counts are high 0, medium 0 and low 0. Follow-up review recommendation: false;
no unresolved changed-behavior risk was identified. No other review lens ran.

Changed files:

- `epic-ask.md` (in this epic) — record D-103, implementation and prior completed trace review.
- `story-thread-capability-and-demo-quotas-plan.md` (in this epic) — retain scope, review and
  exact verification provenance.
- `tickets.toml` (in this epic) — resolve the explicitly decided quota/identity unknowns.
- `apps/api/src/ask/ask-live.controller.ts` — forward verified visitor admission for every
  creation mode.
- `apps/api/src/ask/ask-live.controllers.test.ts` — verify all-mode identity propagation and typed
  quota mapping.
- `apps/api/src/ask/ask-visitor.cookie.test.ts` — prove expiry, purpose, attributes and
  malformed-cookie renewal.
- `apps/api/src/ask/ask-visitor.cookie.ts` — issue and authenticate purpose-separated browser
  identities.
- `apps/api/src/ask/ask.config.test.ts` — prove defaults and invalid quota/secret rejection.
- `apps/api/src/ask/ask.config.ts` — validate daily limits and explicit cookie environment.
- `apps/api/src/ask/ask.module.ts` — compose the existing repository with configured quotas.
- `apps/api/src/http/api-exception.filter.test.ts` — prove strict refusal preservation and generic
  sanitization.
- `apps/api/src/http/api-exception.filter.ts` — retain only the typed closed quota refusal.
- `apps/api/src/http/ask-quota.exception.ts` — map application quota refusal to the public contract.
- `apps/api/src/private-trace-exporter.test.ts` — prove cookie and visitor digest export removal.
- `compose.production.yaml` — forward production quota settings with safe defaults.
- `compose.yaml` — forward the same validated local quota settings.
- `docs/api/ask-tracer.md` — document anonymous admission and strict daily refusals.
- `docs/api/ask.md` — distinguish prepared examples from current live admission.
- `docs/operations/deployment.md` — document migration ordering, quota configuration and cookie
  rotation.
- `docs/testing/integration.md` — describe the bounded native quota campaign and fixture clock.
- `integration/ask-checkpoints.integration.test.ts` — adapt required visitor metadata for existing
  lifecycle proof.
- `integration/ask-demo-quotas.integration.test.ts` — exercise the full public quota and
  capability matrix natively.
- `integration/ask-intent-decision.integration.test.ts` — retain populated upgrades and affected
  runtime regression.
- `migrations/6009_ask_demo_quotas.sql` — add nullable digest accounting without rewriting
  documents.
- `package.json` — register serial quota preparation and native campaign scripts.
- `packages/application/src/ask/ask-live.facade.ts` — require independent visitor admission in
  text/routed ports.
- `packages/application/src/ask/ask-run.repository.ts` — define required admission metadata and
  validated quota policy.
- `packages/application/src/ask/ask-run.service.test.ts` — preserve metadata and abort/error
  forwarding assertions.
- `packages/application/src/ask/ask-run.service.ts` — preserve visitor metadata through
  deterministic validation.
- `packages/infrastructure/src/ask/ask-run.pg-repository.test.ts` — prove quota precedence,
  atomicity and no bypass.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts` — enforce locked atomic quotas using
  the SQL calendar.
- `scripts/prepare-ask-quota-images.sh` — build only changed images under resource limits.

Verification: full build, full types, final strict integration types and full lint passed; 1,070
affected-workspace coverage tests passed at unchanged floors. Final native quota and routed-intent
campaigns passed, with the source/image identities and durations above. All six intent matrix
rows passed. Canonical checkpoint and isolated DST prerequisite proofs passed before the final
quota run. Formatting, Markdown, shell syntax and diff checks passed. Normal staged hooks remain
enabled; orchestrator closure records the resulting commit identities after successful delivery.

Residual limits: an anonymous browser identity does not identify a person; the independent global
cap remains the aggregate bound. Migration 6009 must precede the new API when deployed. This story
makes no live-model, billing, public-HTTPS or production rollout claim; downstream publication
and the final published E2E campaign remain separate required goal work.

## Story Closure

Story 5.12 is done. Acceptance, all six matrix rows and affected dependency regressions passed
on the delivered source; independent quick review returned zero findings. The built delivery
verified all 32 reviewed paths committed and all 25 non-document source hashes unchanged after
normal hooks. No product check was repeated for documentation-only closure.

Delivered commits:

- `99e5ceafd5bacb58ebcb492bc8a42dcb072fc531` — implementation.
- `4a11cc0e6f41c57d954179ae3c4a0d2149c423a6` — direct and native verification.
- `66f609cbfdeef3daa9b628cb0e3aac39a4ec30eb` — policy, operations and evidence.

Normal secrets, formatter, ESLint, shell, Markdown and commit-message hooks passed where
applicable. The first documentation commit attempt correctly failed Markdown line-length checks
on the parent-added file descriptions; wrapping those lines resolved it without a code change
or bypass. The orchestrator marked ticket 5.12 done only after the reviewed delivery was clean.
Publication and final published E2E evidence remain required downstream goal work; this closure
adds no production claim.
