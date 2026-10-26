---
title: 'Source register and the review gate'
type: 'feature'
ticket: '4'
created: '2026-10-10'
status: done
baseline_revision: '0f1308ef3ae8a8f4e8bb5489c5ed9b73e6079817'
route: 'full'
route_source: 'pinned'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - quick
review_loop_iteration: 3
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
  - 'specs/adrs/0015-handling-of-collected-data.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/listing-sources.md'
  - '_bmad-output/initiative-real-estate-intelligence/epic-collection/story-collection-contracts-and-a-stub-publisher-plan.md'
  - '_bmad-output/initiative-real-estate-intelligence/epic-collection/story-synthetic-source-collected-end-to-end-plan.md'
warnings: []
deferred:
  - 'Rate enforcement, retries, backoff, block detection, and circuit behavior belong to Story 2.6.'
  - 'Run checkpoints, resumption, scheduling, and production execution belong to Stories 2.5 and 2.14.'
  - 'A durable operator audit trail depends on the later identity and operations surfaces.'
---

## Orchestrator Closure — 2026-10-11

Ticket 2.4 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`integration/source-register.integration.test.ts` passed review-gate refusal and reviewed
facade/command enablement. The cleanup-coordinator tests passed; real listing sources remain disabled.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`9e27e5f77119886d5e45721e79a58c56d34d859e`,
`c991622142152761af2a722fcd1f1c239d68f17f`,
`883bcc449373dc2743e65d90699bd470c22dbb8e`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** Collection currently has a minimal database row that proves the synthetic one-shot
path, but it does not represent the source-by-source legal review, access method, rate policy,
licence, or independent permissions required before a source can be operated safely. The existing
database constraint only requires `collection_allowed`, so a mistaken update could enable a real
source whose review is missing, forbidden, unverified, or operationally incomplete. Operators also
lack a narrow command for enabling an approved source and the API cannot report which sources are
currently enabled with their public licence information.

**Approach:** Make `collection.source_register` the authoritative local register. Expand it with an
append-only migration and seed the thirteen candidates documented in `listing-sources.md`, while
leaving only the repository-owned synthetic fixture enabled. Model review outcome, source category,
access policy, rate-policy status, licence status, independent content permissions, and enablement
time explicitly. Enforce the same fail-closed enable gate in the domain model, the application use
case, an atomic PostgreSQL update, and database constraints. Add a database-only worker operator
command, then expose only enabled sources and their public-safe permissions/licence through
`GET /api/v1/collection/sources` in deterministic source-ID order.

## Boundaries & Constraints

**Always:** Treat the checked-in register seed as a reviewed snapshot of `listing-sources.md`, not
as Markdown parsed at runtime. Preserve the distinction between an allowing legal review and an
operationally enabled source. Keep collection, image fetching, and listing-text display permissions
independent and default-denied. Represent rate knowledge explicitly as `not-applicable`,
`unconfigured`, or `configured`; only a configured positive limit/window can satisfy a remote
source's operational gate, and unknown limits remain unknown rather than guessed. Require an
`allowed` review with a review timestamp, collection permission, verified/applicable licence, and
configured rate before enabling a real remote source. Permit `not-required` review and a
`not-applicable` rate only for the repository-owned synthetic fixture. Perform enablement as an
atomic, idempotent conditional database update and preserve the first enablement timestamp.

Use lower-kebab source IDs, bounded public labels/evidence/access values, UTC timestamps, explicit
source categories, and a closed licence union. Keep internal evidence, access-policy details,
review metadata, and rate data out of the public response. Return an envelope shaped exactly as
`{ "sources": [...] }`, list only enabled sources, and sort by `sourceId`. Keep the operator
command database-only: one positional source ID, no source request, object storage, message broker,
schedule, or infrastructure beyond local PostgreSQL. Sanitize persistence failures and preserve
abort/cancellation semantics and bounded cleanup.

**Never:** Contact, scrape, authenticate to, schedule, or enable a real source in this story. Never
invent a licence, rate, review, permission, or access mechanism that `listing-sources.md` does not
support. Never interpret a known endpoint or a published nominal rate as authorization to collect.
Do not add an HTTP enable endpoint, authentication policy, source adapter, scheduler, checkpoint,
retry/backoff logic, event, outbox record, or audit aggregate. Do not expose review evidence,
access policies, internal rate configuration, or disabled candidates through `/api/v1`. Do not
register the Story 2.3 Aurora, Brisa, and Cobalto replay identities as runtime sources: that replay
is pure fixture data and the reviewed register has one repository-owned `synthetic-data` source.
Do not use ignored environment files, external network access, a deployed service, or the VPS.

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                                                                                    | Expected Output / Behavior                                                                                                                                                                  | Failure Evidence                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Seed audit                  | Migrations run on an empty database                                                                              | All thirteen documented candidates exist once; only `synthetic-data` is enabled; every review, permission, licence, access, category, and rate value matches the checked-in review snapshot | Seed count/identity assertions fail, a real source is enabled, or an undocumented permission/rate/licence appears |
| Synthetic exception         | Repository fixture has `not-required` review, collection permission, not-applicable licence/rate                 | It may remain enabled because it is owned synthetic data and needs no remote access                                                                                                         | Domain or database accepts the same exception for a real/category-mismatched source                               |
| Missing review              | A disabled fixture has no review timestamp or `not-verified` outcome                                             | Enable returns a stable refusal and changes no row                                                                                                                                          | `enabled`/`enabled_at` changes, an adapter is invoked, or a raw database detail escapes                           |
| Forbidden review            | A candidate is documented as prohibited for scheduled storage/collection                                         | Enable is refused even if an endpoint or nominal public rate is known                                                                                                                       | Candidate becomes enabled or the command treats reachability as permission                                        |
| Allowed but non-collectable | Reference/manual-download data has allowing reuse review but `collectionAllowed=false`                           | Enable is refused; legal reuse alone is not an executable collection grant                                                                                                                  | Row becomes enabled or API lists it                                                                               |
| Missing licence             | A real source otherwise appears operable but licence is `not-verified`                                           | Enable is refused                                                                                                                                                                           | Unknown licence is silently treated as licensed                                                                   |
| Missing remote rate         | A real remote source has allowing review but rate status is `unconfigured`                                       | Enable is refused until a reviewed positive rate is recorded in a later controlled change                                                                                                   | A guessed default satisfies the gate                                                                              |
| Invalid configured rate     | Configured rate has non-positive or partial limit/window                                                         | Domain construction and database constraints reject it                                                                                                                                      | Malformed rate persists or enables a source                                                                       |
| Allowed fixture             | A test-only real-like row has allowed dated review, collection permission, verified licence, and configured rate | One command enables it atomically and records `enabled_at`                                                                                                                                  | Eligible row remains disabled or requires unrelated S3/Rabbit/source services                                     |
| Repeated enable             | The same eligible row is enabled twice                                                                           | Both executions succeed idempotently and the original `enabled_at` is preserved                                                                                                             | Second command fails or rewrites enablement time                                                                  |
| Concurrent enable           | Two operators enable the same eligible row                                                                       | Both observe one enabled result and persistence retains one enablement timestamp                                                                                                            | Lost update, duplicate row, or inconsistent result                                                                |
| Unknown source              | Command receives a syntactically valid but absent source ID                                                      | It exits non-zero with a bounded, sanitized not-found message                                                                                                                               | SQL details, connection data, or a false success is printed                                                       |
| Unsafe argument             | Command receives zero, multiple, malformed, or option-like source IDs                                            | It refuses before connecting or changing state                                                                                                                                              | Ambiguous argument is accepted or interpreted as a flag                                                           |
| Cancellation                | Abort is requested before or during the lookup/update                                                            | Work stops, abort reason is preserved, and no later database operation runs                                                                                                                 | Cancellation is converted to a generic persistence error or mutation continues                                    |
| Public list                 | API reads the register                                                                                           | Only enabled sources appear, sorted by ID, with public label, independent permissions, and closed licence union                                                                             | Disabled sources or internal review/access/rate/evidence fields leak                                              |
| No enabled rows             | A controlled test database has all rows disabled                                                                 | API returns `200` with `{ "sources": [] }`                                                                                                                                                  | `404`, `null`, unstable shape, or internal error                                                                  |
| Malformed database row      | Adapter receives an invalid enum, nullable required value, or inconsistent licence/rate tuple                    | Mapping fails closed with a sanitized application error                                                                                                                                     | Invalid public DTO or raw database value escapes                                                                  |
| Direct SQL bypass           | SQL tries to set `enabled=true` on a row that fails any gate predicate                                           | PostgreSQL rejects the update through a CHECK constraint                                                                                                                                    | Application-only validation can be bypassed                                                                       |
| Existing collection         | Story 2.2 runs against `synthetic-data`                                                                          | Its source lookup, one-shot collection, idempotency, and events remain compatible                                                                                                           | The new repository boundary or seed breaks the existing synthetic command                                         |

## Frozen Acceptance Criteria

- Given a fresh database, when the source register is inspected, then it contains exactly the
  thirteen candidate entries documented by `listing-sources.md`, uses explicit categories and
  review/rate/licence states, and leaves every real source disabled. The only enabled seed is
  `synthetic-data`, whose `not-required` review and not-applicable rate/licence are permitted only
  because it is the repository-owned deterministic fixture.
- Given any source registration, when the enable policy is evaluated, then collection permission,
  review outcome/date, source kind/category, licence, and rate policy are evaluated independently
  and fail closed. A real remote source is eligible only with an `allowed` dated review,
  `collectionAllowed=true`, a non-`not-verified` licence, and a configured positive rate limit and
  window. Reference/manual sources with no executable collection permission remain ineligible.
- Given malformed or contradictory register data, when it is constructed in the domain or written
  directly through SQL, then closed enum validation and database CHECK constraints reject invalid
  review/date, licence tuple, rate tuple, synthetic exception, permission, and enabled-state
  combinations. The application service does not provide a path around these invariants.
- Given the operator command `pnpm --filter @rei/worker source:enable -- <source-id>`, when the ID is
  unknown, review is absent/forbidden/unverified, collection is disallowed, licence is unverified,
  or a required remote rate is unconfigured, then it exits non-zero with a bounded reason and does
  not change the row, call a source, initialize object storage, or connect to RabbitMQ.
- Given an eligible reviewed fixture row, when the operator command runs, then one atomic SQL
  operation enables it and records its first enablement time. Repeating or concurrently issuing the
  command succeeds idempotently, reports the source as enabled, and preserves that timestamp.
- Given `GET /api/v1/collection/sources`, when the facade reads the register, then the API returns
  `200` and `{ "sources": [...] }` containing only enabled sources sorted by `sourceId`. Each entry
  has `sourceId`, `displayLabel`, `enabled: true`, the three independent permission booleans, and a
  valid `licensed`, `not-verified`, or `not-applicable` licence; it exposes no evidence, access,
  review, rate, database, or disabled-source data.
- Given the existing Story 2.2 one-shot collection, when its tests and integration path run, then
  `synthetic-data` is still resolved through the collection register and the behavior, persistence,
  idempotency, hashes, and events remain unchanged after the source lookup is moved to the dedicated
  source-register port.
- Given the complete verification campaign, when unit, integration, lint, typecheck, formatting,
  and build gates run, then the refusal and allowed enable paths are demonstrated using local
  fixtures and PostgreSQL only, no real source is contacted or enabled, and no VPS-dependent step
  is required.

</intent-contract>

## Code Map

- `migrations/4002_collection_expand_source_register.sql` -- append-only register evolution,
  constraint replacement, deterministic seed reconciliation from the reviewed source document,
  independent permissions/licence/rate/review fields, enablement timestamp, and database-level
  fail-closed enable gate. Migration `4001` remains unchanged.
- `packages/domain/src/collection/source-registration.ts` -- closed source category, review,
  access/rate, permission, and licence types; invariant validation; eligibility decision with
  stable refusal reasons; public-safe enabled-source projection.
- `packages/domain/src/collection/source-registration.test.ts` -- gate matrix, synthetic-only
  exception, contradictory tuple rejection, independent permissions, and idempotent eligibility.
- `packages/domain/src/collection/index.ts` -- source-register domain exports through the bounded
  context boundary.
- `packages/application/src/collection/source-register.repository.ts` -- consumer-owned source
  lookup, atomic enable, and enabled-source list port plus immutable application views.
- `packages/application/src/collection/enable-source.service.ts` -- validate one source identifier,
  distinguish unknown/ineligible/already-enabled states, preserve cancellation, and delegate the
  atomic transition without learning PostgreSQL details.
- `packages/application/src/collection/enable-source.service.test.ts` -- unknown, refused, allowed,
  already-enabled, race/idempotence, cancellation, and repository-call-boundary tests.
- `packages/application/src/collection/collect-source-once.service.ts` and related tests -- use the
  dedicated source-register port for existing execution authorization while preserving Story 2.2.
- `packages/application/src/collection/collection-run.repository.ts` -- retain run persistence only;
  remove the unrelated register lookup from this port.
- `packages/application/src/collection/collection.facade.ts` -- add the enabled-source read model
  and `listEnabledSources()` consumer boundary.
- `packages/application/src/collection/index.ts` -- export the new port, use case, results, and
  public views.
- `packages/contracts/src/collection/enabled-source.dto.ts` -- retain the closed public licence and
  independent permission shapes; add the `{ sources }` response envelope without exposing internal
  policy metadata.
- `packages/contracts/src/collection/enabled-source.dto.test.ts` -- exact JSON contract, immutability,
  closed licence variants, and no-internal-field evidence.
- `packages/infrastructure/src/collection/postgres-source-register.repository.ts` -- strict mapping,
  abortable lookup/list, sorted enabled-source projection, and atomic conditional enable SQL with
  idempotent timestamp preservation and sanitized errors.
- `packages/infrastructure/src/collection/postgres-source-register.repository.test.ts` -- SQL shape,
  mapping, ordering, unknown/ineligible/allowed/already-enabled/concurrent outcomes, malformed rows,
  cancellation, and redaction tests.
- `packages/infrastructure/src/collection/postgres-collection.facade.ts` -- database-backed facade
  for permissions, run/snapshot reads, and the enabled-source list used by the API.
- `packages/infrastructure/src/collection/postgres-collection-run.repository.ts` -- keep only run
  persistence and existing idempotency behavior after register lookup moves to its own adapter.
- `packages/infrastructure/src/collection/in-memory-collection.adapters.ts` and
  `synthetic-collection.stub.ts` -- implement the expanded application boundaries for deterministic
  unit tests without changing fixture publication behavior.
- `packages/infrastructure/src/collection/index.ts` -- export collection implementations through
  the context boundary.
- `apps/api/src/collection/collection.controller.ts` -- exact versioned enabled-source GET endpoint,
  envelope mapping, deterministic ordering, and no write operation.
- `apps/api/src/collection/collection.controller.test.ts` -- route/response shape, empty list,
  disabled/internal-field exclusion, ordering, and sanitized-failure coverage.
- `apps/api/src/collection/collection.module.ts` -- wire the database-backed facade using the
  existing persistence module.
- `apps/worker/src/collection/enable-source-command.ts` -- one-source command runner with strict
  arguments, signal handling, bounded output, exit status, and cleanup.
- `apps/worker/src/collection/enable-source-command.test.ts` -- argument refusal, successful/refused
  result, no unrelated service initialization, cancellation, and cleanup tests.
- `apps/worker/src/collection/enable-source.ts` -- minimal Nest application-context entry point for
  the operator command.
- `apps/worker/src/collection/source-register-command.module.ts` -- database-only command wiring;
  it imports persistence but not S3, RabbitMQ, a source adapter, or the collection run module.
- `apps/worker/package.json` -- expose `source:enable` through pnpm.
- `compose.yaml` -- add a tools-profile source-enable service depending only on migrations and the
  database, with no default enable target.
- `integration/source-register.integration.mjs` -- isolated dynamic-port PostgreSQL/API campaign:
  audit seed, refuse an unreviewed fixture, enable an eligible fixture, verify public listing and
  idempotent replay, prove direct SQL bypass is rejected, and remove its volumes.
- `integration/source-register-cleanup.mjs` and `.test.mjs` -- deterministic cleanup coordinator
  shared by the real campaign, with fault injection for independent/combined teardown failures and
  success ordering.
- `package.json` -- expose the dedicated local integration command if repository convention
  requires it.

## Tasks & Acceptance

**Execution:**

- [x] Add failing domain tests for every eligibility dimension and contradictory state. Implement
      the closed source-registration model with independent permissions, review outcome/date,
      licence, access, category, rate status, synthetic-only exception, and stable refusal codes.
      Export it through the collection boundary and keep the domain package dependency-free.
- [x] Add failing application tests and introduce `SourceRegisterRepository` plus `EnableSource`.
      Require a single lower-kebab source ID, preserve abort reasons, return explicit enabled,
      already-enabled, unknown, and refused outcomes, and never accept policy overrides from CLI
      input. Move `CollectSourceOnce` authorization lookup from `CollectionRunRepository` to the
      new consumer-owned register port without changing its external behavior.
- [x] Write append-only migration `4002`. Relax the obsolete mandatory-review assumption from
      `4001`, add the closed metadata columns and `enabled_at`, replace the weak enable constraint
      with the complete gate, and upsert the thirteen reviewed candidates. Keep all real candidates
      disabled. Do not modify `4001` or synthesize undocumented rate/licence permission.
- [x] Add the PostgreSQL register adapter with strict row hydration, atomic conditional enablement,
      idempotent timestamp preservation, enabled-only sorted listing, abort support, and redacted
      failures. Cover malformed rows, every refusal, repeated/concurrent enable, deterministic
      order, and direct SQL invariant behavior at the appropriate test layer.
- [x] Expand `CollectionFacade` and add the database implementation needed by the API. Preserve
      denied-by-default permission reads and the existing run/snapshot methods. Update in-memory and
      synthetic implementations so all existing tests continue to compile and their semantics do
      not change.
- [x] Add the exact `GET /api/v1/collection/sources` controller and response envelope. Test the
      exact route, enabled-only result, source-ID order, empty result, all licence variants, absence
      of internal fields, and sanitized failure response. Do not add a mutation endpoint.
- [x] Add the worker's database-only `source:enable` entry point and command module. Test zero,
      multiple, option-like, malformed, unknown, ineligible, eligible, repeated, cancellation, and
      cleanup paths. Prove wiring does not initialize a source adapter, S3 client, or RabbitMQ and
      ensure logs never contain policy evidence or database configuration.
- [x] Add the tools-profile Compose service and isolated integration campaign. Start local
      PostgreSQL/migrations/API with dynamic published ports and `COMPOSE_DISABLE_ENV_FILE=1`, audit
      the thirteen-row seed, insert controlled refused/eligible fixtures, run the real operator
      command, inspect the API, replay idempotently, and attempt an invalid direct SQL enable. Tear
      down containers and volumes even on failure.
- [x] Run focused red/green tests while implementing, then run the source-register integration
      campaign, full repository lint, typecheck, unit/integration test suite, build, formatting,
      pre-commit hooks, and final diff/status review. Confirm no ignored environment file, real
      network source, real-source enablement, schedule, deployment, VPS operation, or unrelated
      repository entered the change.

## Implementation Notes

- Migration 4002 reconciles the reviewed thirteen-source snapshot, removes the obsolete coarse
  source kind, and mirrors the domain gate with closed review, access, rate, licence, synthetic
  identity/policy, HTTP(S) licence URL, enablement-time, and bounded-identifier constraints.
  Migration 4001 is unchanged.
- `SourceRegisterRepository` now owns registration lookups, atomic enablement, and public listing;
  the run repository retains only collection-run persistence. Both the existing one-shot collector
  and the new enable use case depend on the dedicated port.
- The worker command has one lower-kebab positional argument, initializes only configuration and
  PostgreSQL persistence, propagates SIGINT/SIGTERM cancellation, attempts Nest and telemetry
  cleanup independently within a bound, and emits no policy evidence or database configuration.
- The API maps an application-owned enabled-source view to the exact public envelope. Internal
  review, evidence, access, rate, disabled rows, and enablement timestamps are absent by
  construction.
- The isolated integration campaign uses dynamic host ports and disables implicit environment
  files. It audits every policy field in the thirteen-row seed, exercises refused and eligible
  fixtures, concurrent and repeated enablement, API redaction/order, malformed SQL tuples, URL and
  synthetic-policy constraints, and the database-level bypass guard. Cleanup failures are fatal
  and are aggregated with a primary campaign failure. No real source, deployment, or VPS is
  involved.

- The register's source categories are `synthetic-listing`, `listing`, `reference-geography`,
  `cadastral-file`, and `transaction`. Category describes what the candidate is; it does not grant
  permission. The existing coarse `source_kind` may be migrated or retained only as an internal
  compatibility detail, but there must be one unambiguous source of truth for the synthetic gate.
- Review outcome is `not-required`, `allowed`, `forbidden`, or `not-verified`. `allowed`,
  `forbidden`, and a verified review require `reviewed_at`; `not-verified` may carry the last
  review-attempt timestamp, while null means no review has been attempted. `not-required` has no
  review timestamp and is accepted only for the repository-owned synthetic fixture. Evidence
  remains bounded internal metadata and is never serialized by the public controller or routine
  command output.
- Rate state is a tagged union persisted as status plus nullable limit/window columns:
  `not-applicable` requires both values null, `unconfigured` requires both null, and `configured`
  requires positive integer `limit` and `window_seconds`. This story stores and gates on the
  reviewed policy; Story 2.6 owns enforcement, retry, backoff, and circuit behavior.
- Licence is the existing public union: `licensed` requires bounded label and URL,
  `not-verified` requires both null, and `not-applicable` requires a bounded label and null URL.
  A real executable source cannot enable with `not-verified`. A public response may legitimately
  preserve the union even though the enable gate prevents unknown-licence real rows from appearing.
- Licensed URLs use one deliberately narrow grammar in both TypeScript and PostgreSQL: an absolute,
  case-insensitive `http://` or `https://` scheme; no credentials; an ASCII DNS hostname of one or
  more dot-separated labels, each 1-63 characters, beginning and ending with an alphanumeric and
  containing only alphanumerics or interior hyphens; at least one ASCII letter in the complete
  hostname; and a hostname no longer than 253 characters. Requiring a letter rejects IPv4,
  abbreviated numeric IP-like, and single-integer IP-like hosts. An optional decimal port may be
  `0` through `65535`. An optional path, query, or fragment begins with `/`, `?`, or `#` and
  contains only the documented visible ASCII URI characters
  `A-Z a-z 0-9 . _ ~ : / ? # @ ! $ & ' ( ) * + , ; = % -`. The complete URL is at most 2048
  characters. Whitespace, controls, IP literals, malformed/empty DNS labels, credentials,
  non-HTTP schemes, and ports outside the range are rejected identically at both boundaries.
- Seed all thirteen entries from `listing-sources.md`. GeoSampa fiscal blocks have an allowing
  legal review and CC BY-SA 4.0 but remain operationally disabled because the product decision does
  not enable them and their remote rate is unconfigured. GeoSampa IPTU is manual/CAPTCHA-bound and
  not a listing source, so collection is false. ITBI and Caixa remain unverified. OLX,
  QuintoAndar, and Chaves na Mão remain forbidden for scheduled storage/collection. ZAP, Viva Real,
  Imovelweb, Loft, and Mercado Livre remain unverified. A documented endpoint or nominal rate does
  not override those outcomes. Every documented candidate reviewed on 2026-10-09 carries that
  review-attempt timestamp even when its outcome remains `not-verified`.
- `synthetic-data` is the only enabled seed. Its public label is `Labelled synthetic fixture`, its
  public licence label is `Synthetic data`, and its repository-fixture access/rate are
  not-applicable. It retains all three permissions so Stories 2.1 and 2.2 continue unchanged.
- Enablement does not require an installed source adapter in this story. The command changes only
  reviewed register state; nothing schedules or calls the source. Since no real row is eligible in
  the seed, the only enable success outside the existing synthetic row is a controlled test
  fixture. Later runtime stories must bind enabled IDs to adapters and schedules explicitly.
- Use a conditional `UPDATE ... WHERE` or equivalent single-statement transition whose predicate
  mirrors the database CHECK and domain decision. Treat an already-enabled eligible source as
  success and never replace non-null `enabled_at`. Re-read only as needed to distinguish unknown
  from refusal without opening a time-of-check/time-of-use enable path.
- No `collection.source.enabled` event is introduced. `enabled_at` is the evidence this story
  requires; durable actor identity and operational audit are intentionally deferred until their
  owning boundaries exist. The CLI still emits a concise operator result without sensitive policy
  evidence.
- The API controller should depend on `CollectionFacade`, not `DatabaseConnection`. Infrastructure
  performs strict database mapping and returns an application-owned view; contracts map that view
  to JSON. Internal policy fields are omitted by construction instead of deleted from an object.
- Story 2.3's `synthetic-portal-aurora`, `synthetic-portal-brisa`, and
  `synthetic-portal-cobalto` remain pure replay identities. Registering them now would create four
  public synthetic sources and falsely imply runtime scheduling. Stories 2.5/2.14 may revisit that
  mapping when replay becomes an executable multi-observation flow.

## Review Triage Log

- **Quick review iteration 1 (2026-10-10):** Accepted and addressed all four findings. A
  `not-verified` review can now distinguish never-reviewed (`reviewed_at = null`) from an
  unsuccessful dated review attempt; all documented candidates reviewed on 2026-10-09 retain that
  timestamp in the exact seed snapshot.
- PostgreSQL now enforces the synthetic fixture's not-applicable rate/licence policy even while the
  row is disabled, and validates licensed URLs as absolute credential-free HTTP(S) URLs. The
  integration campaign proves rejection of a contradictory disabled synthetic row, a non-HTTP
  licence URL, and a credential-bearing licence URL through direct SQL.
- Integration teardown now treats connection or Compose cleanup failure as a campaign failure and
  aggregates cleanup failures with the original assertion/runtime failure rather than replacing
  it. Follow-up review remains recommended, so the story stays `in-review`.
- **Quick follow-up iteration 2 (2026-10-10):** Accepted the remaining medium licence-URL parity
  finding and low teardown-test finding. Domain and SQL now enforce the explicit shared DNS URL
  grammar above, with parity cases for percent/bracket hosts, out-of-range ports, malformed labels,
  credentials, protocols, whitespace/control, supported ports, and the seeded licence URL.
- Cleanup coordination is extracted into a dependency-injected helper used by the real campaign.
  Deterministic tests cover clean completion, close failure, Compose-down failure, both cleanup
  failures, and combined primary/cleanup failure; success is observable only after both cleanup
  operations complete. Follow-up review remains recommended and status remains `in-review`.
- **Quick follow-up iteration 3 (2026-10-10):** Accepted the final numeric-host parity finding.
  Both grammar implementations now require at least one ASCII letter in the hostname, so
  `127.0.0.1`, `127.1`, and `2130706433` are rejected in domain and direct-SQL tests while the
  seeded and controlled DNS hostnames remain accepted.
- **Final closure review (2026-10-10):** No findings remained. The reviewer confirmed that the
  domain and PostgreSQL predicates inspect only the hostname, reject all three numeric forms at
  both boundaries, preserve positive DNS/seed URLs, and introduce no URL-grammar parity regression.
  The story is `built` and no further follow-up review is recommended.

## Verification

**Planned commands:**

- `pnpm --filter @rei/domain test`
- `pnpm --filter @rei/application test`
- `pnpm --filter @rei/contracts test`
- `pnpm --filter @rei/infrastructure test`
- `pnpm --filter @rei/api test`
- `pnpm --filter @rei/worker test`
- `pnpm run test:integration:source-register` (or the repository-conventional dedicated script)
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run build`
- `pnpm exec prettier --check .`
- `lefthook run pre-commit --all-files`
- `git diff --check`
- `git status --short`

**Evidence required:**

- Focused tests prove the complete eligibility/refusal matrix at domain and application layers.
- PostgreSQL evidence proves the append-only migration, exact seed, atomic/idempotent update,
  timestamp preservation, deterministic public listing, and direct-SQL CHECK protection.
- API evidence proves the exact versioned route and public-safe response shape.
- Worker evidence proves strict arguments, refusal/success exit behavior, cancellation, cleanup,
  and database-only dependency wiring.
- The isolated Compose campaign proves an unreviewed fixture is refused, an allowed fixture becomes
  visible through the real facade/API, a repeat is idempotent, and invalid direct SQL is rejected.
- Full gates prove Story 2.1/2.2/2.3 regressions remain green and no real source or VPS is involved.

**Results:**

- Focused package tests passed: domain 173 tests, infrastructure 131 tests, and worker 96 tests;
  the application, contracts, and API package suites also passed during implementation.
- `pnpm run test` passed before the final command-lifecycle additions with 459 tests. The five
  added lifecycle cases then passed in the 96-test worker suite.
- `pnpm run test:coverage` passed every configured statement, branch, function, and line threshold.
- `pnpm run test:integration:source-register` passed after the final SQL-bound and exact-seed audit
  changes. `pnpm run test:integration:collection` also passed, preserving the Story 2.2 one-shot
  path.
- After quick review iteration 1, the domain suite passed with 156 tests, migration conventions and
  full workspace typecheck passed, and a fresh source-register campaign passed with the dated
  `not-verified` seed plus direct-SQL synthetic-policy and licence-URL rejection. The success line
  was emitted only after cleanup completed.
- After quick follow-up iteration 2, the domain suite passed with 170 tests and the extracted
  cleanup coordinator passed all five deterministic cases. A fresh source-register command reran
  those tests before the Compose campaign, then PostgreSQL accepted the supported maximum-port URL
  and seeded URLs while rejecting percent/bracket hosts, port `99999`, malformed/empty labels,
  credentials, and non-HTTP schemes. Cleanup completed before the success line was emitted.
- After quick follow-up iteration 3, the domain suite passed with 173 tests and a fresh PostgreSQL
  campaign rejected `127.0.0.1`, `127.1`, and `2130706433` through direct SQL while retaining the
  positive seeded and maximum-port DNS URLs. The cleanup coordinator again completed before the
  success line was emitted.
- `pnpm run lint`, including context-boundary and migration-convention checks, passed after the
  final changes. Repository typecheck and build passed; the worker typecheck was repeated after
  the command-lifecycle tests. The build retained only the existing non-failing Vite chunk-size
  warning.
- Changed-file Prettier checks, story-plan Markdown lint, and `git diff --check` passed. The global
  Prettier and all-files Lefthook commands remain blocked by pre-existing formatting and Markdown
  line-length findings in unrelated generated/BMad files; Story 2.4 files are clean.

## Auto Run Result

- **Summary:** Added an authoritative, fail-closed source register with thirteen reviewed
  candidates, a database-only operator enable command, and a public enabled-source listing. Only
  the repository-owned synthetic fixture is enabled in production seed data.
- **Review result:** Independent quick review and three focused follow-up iterations are complete.
  The implementation handoff audit added a source-ID database bound, exact seed metadata
  assertions, and end-to-end command cleanup/cancellation tests. All accepted findings were fixed,
  and the final closure review reported no remaining findings.
- **Verification:** Domain/application/contracts/infrastructure/API/worker tests, coverage, the
  source-register and existing collection integrations, lint, typecheck, build, changed-file
  formatting, Markdown lint, and whitespace checks passed with the baseline exceptions recorded
  above.
- **Residual risks:** Rate enforcement, retry/backoff/circuit behavior, scheduling, checkpoints,
  production deployment, and durable operator identity/audit remain deliberately deferred to
  their owning stories. No real-source operation or VPS dependency was introduced.

## Deferred reconciliation — Story 2.13 (2026-10-26)

- Source rate, retry, backoff, block and circuit behavior: closed by completed Story 2.6.
- Checkpoints/resumption, scheduling and production execution: closed by completed Stories 2.5,
  2.14 and 2.12 respectively. Production authorization was subsequently granted; Story 2.12
  retains the actual seed, replay, scheduled-run and Tempo evidence.
- Durable operator audit with authenticated actor identity remains owned by the existing
  [Sign-in and protected operations epic ticket](../epic-authentication-and-operations/epic-authentication-and-operations.md).
  Its explicit tracked collection deferral preserves this work outside the Phase 1 goal;
  `enabled_at` and the current owner-only CLI do not claim to implement actor-aware audit.
