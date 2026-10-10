---
title: 'One parsed listing becomes a property'
type: 'feature'
ticket: '2'
created: '2026-10-10'
status: 'built'
baseline_revision: '23eb5eb174a06f8f45ca1540d704d1ec59625841'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0012-domain-events-and-transactional-outbox.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ticket 3.2 requires a real parsed-event → idempotent Property/Listing → HTTP path
with provenance. The current endpoints serve only prepared read-only fixtures.

**Approach:** Persist an initial single-listing Property aggregate plus immutable verified incoming
facts, consuming the existing parsed event through RabbitMQ with transactional inbox/outbox.
Prefer persisted detail behind the existing routes, retaining prepared fallback and honest limits.

## Boundaries & Constraints

**Always:** Follow D-022 and ADRs 0003/0011/0012/0015. Read user-named
`/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` and architecture-patterns,
module-communication, state-isolation and testing-patterns references before changes; D-012 keeps
SQL, current flat contexts, framework-neutral validators and Vitest instead of ORM/Nx/Jest.
Use public context barrels, inward package dependencies, one Property aggregate/transaction,
UUIDv7 generated in PostgreSQL, BRL safe-integer cents, strict canonical event parsers and opaque
transaction scopes. Collection validates its own evidence; properties SQL accesses only properties.
Keep immutable provenance and allowlisted masked data. Atomic inbox/fact/entity/outbox; acknowledge
only after commit; cancellation rolls back. Durable source identity uniqueness outlives inbox.
Only owned synthetic sources; facade-derived current rights with fail-closed descriptions.
Use pnpm and apply_patch; preserve quality gates and all prior passing behaviors.

**Never:** Read/search/edit `.env*`, use real sources/AI/geocoding, access VPS, push or commit.
Do not implement full normalization, persistent place hierarchy, matching/calibration, all history,
suppression, persisted search/counts/reductions, market or UI. Do not guess unknown places or use
fixture labels as matching. No foreign-schema SQL/FKs in properties, raw payload/PII logs,
photographs, contact/unit/complement storage, direct business broker publish or new dependencies.
Do not silently drop or pretend to apply later v1/v2 facts, fabricate a creation from reparse time,
publish extra business event families or widen the frozen HTTP contracts.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                                             | Expected Output / Behavior                                                                                                | Error Handling                             |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Initial observation  | Verified owned-synthetic v1, known address                                | One Property and Listing, initial read provenance, one v1 ListingCreated in same outbox transaction                       | None                                       |
| Same-event replay    | Sequential/concurrent duplicate; worker restart                           | One inbox pair/fact/aggregate/outbox; stable IDs and same initial detail                                                  | Acknowledge after committed dedup          |
| Semantic replay      | Inbox marker expired but original fact remains                            | Persistent fact/source uniqueness prevents duplicate aggregate or creation event                                          | None                                       |
| Later observation    | Another verified v1 for same source identity                              | Preserve initial view; append immutable pending-history fact, no second entity or fake price history                      | None                                       |
| Parser correction    | Verified v2 before/after original v1                                      | Append pending-correction with order/revision/operation/original IDs; first v2 creates no Property; later v1 creates once | No silent discard                          |
| Forged provenance    | Source/run/snapshot/hash/URL/time/event or correction identity differs    | No committed inbox, fact, entity or outbox                                                                                | Throw safely for bounded retry/DLQ         |
| Refused input        | Extra/invalid fields/version, real/unowned/denied source, unknown address | Fail closed, no effect or leak                                                                                            | Existing bounded delivery policy           |
| Failure/cancellation | Abort/failure after inbox/fact/entity before commit                       | All effects rolled back; retry can succeed once                                                                           | Signal-aware transaction; no premature ack |
| Persisted read       | Existing initial Property/Listing by ID                                   | Strict frozen DTO, exact cents/backend price per m², place crumbs, original source/run/hash/time, no sale                 | Missing valid ID uses existing 404         |
| Current text rights  | Permission becomes denied; lookup fails                                   | No text/version/excerpt in property or listing; dependency failure is not permissive                                      | Denied branch or sanitized failure         |
| Prepared fallback    | Existing fixture IDs/search/place/reduction requests                      | Preserve all previous responses; never blend pending records into stub counts/medians                                     | Existing query/error rules                 |

</intent-contract>

## Code Map

- `packages/domain/src/collection/collection.events.ts`: strict v1/v2 parsers; v2 includes
  operationKey/parserRevision/originalParsedEventId/order and original provenance. Use public exports.
  `source-registration.ts` exports owned synthetic IDs/check; source kind must also come from SQL.
- `packages/application/src/shared/{transaction,inbox,outbox,event-subscriber}.ts` and
  infrastructure `shared/persistence/{postgres-transaction,postgres-inbox,postgres-outbox}.ts`:
  opaque scope, atomic record and append, abort-aware runner, `postgresClientFor` ownership checks.
  Broker handler resolves before ack; retries/DLQ/drain already exist. Do not rewrite transport.
- `packages/application/src/collection/collection.facade.ts` and infrastructure
  `collection/postgres-collection.facade.ts`: current hash lookup alone does not verify provenance.
  Add a transaction-scoped evidence DTO/query, with collection-only SQL and shared locks as needed.
  Read snapshot_observation (outcome, parsed_event_id, fingerprints), collection_run (source, not
  necessarily completed), source_register (kind/rights), snapshot_reparse (completed correction).
  Update existing synthetic facade/fakes/tests without weakening their permission behavior.
- `packages/application/src/locations/locations.facade.ts` and infrastructure
  `locations/synthetic-locations.adapter.ts`: add minimal known-fixture address resolution through
  public facade. Existing six levels and fictional block IDs suffice. SYN-SP-0001 uses Avenida
  Exemplo, not the prepared Bela Vista block street Rua Cenário Um; return its known neighborhood.
  Exact known portal fixture streets may resolve their prepared blocks. Unknown address returns null.
- `packages/domain/src/properties/{properties.read.types,properties.events}.ts`: frozen detail
  DTOs and ListingCreated constructor; no persisted aggregate yet. Preserve preparedEvidence/null
  production score and synthetic-stub metadata. Put initial aggregate invariants in domain, not SQL.
- `apps/api/src/properties/{properties.module,properties.controller}.ts`: PROPERTIES_FACADE and
  real routes validate with strict contract parsers. Bind a composite facade: persisted getProperty/
  getListing first, synthetic adapter fallback; keep search/reductions untouched and explicit.
- `apps/api/src/collection/collection.module.ts`: existing PostgresCollectionFacade provider needs
  public export/index. Worker collection module needs corresponding public facade wiring.
- `apps/worker/src/properties/properties.module.ts` is empty. Worker main explicitly starts all
  consumers before broker/readiness; add and start new consumer. Locations worker module is empty:
  export a stateless fixture facade through its public barrel. Avoid the API's reverse locations →
  properties dependency; persisted detail can use its stored resolved place references.
- `migrations/`, `scripts/migrate.sh`, `scripts/check-migration-conventions.mjs`: properties range
  starts at 1001. One schema per migration. No collection/locations FK or join from properties.
- `integration/{synthetic-collection,properties-contracts,snapshot-reparse}.integration.mjs`:
  isolated Compose/dynamic ports/synthetic credentials/no env-file/compiled apps/scoped cleanup.
  Existing 158-request properties campaign must remain passing; add a separate ingestion journey.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/properties/property.entity.ts`, adjacent test and context/root exports —
      define immutable initial Property-with-distinct-Listing state, source identity, strict
      canonical provenance/values/resolved place references and initial ListingCreated fact.
- [x] `packages/application/src/{collection/collection.facade,locations/locations.facade}.ts` —
      add inward-independent evidence/fixture-resolution ports. Infrastructure owned facades,
      public exports and existing fakes/tests implement them; preserve old API response contracts.
- [x] `packages/application/src/properties/{property.repository,consume-parsed-listing.service}.ts`
      and adjacent tests — scope inbox/fact/entity/outbox atomically. Verify evidence before effects;
      persist explicit pending v1/v2 facts, including correction first. Generate creation IDs once.
      Include deterministic failure and cancellation tests with transactional in-memory ports.
- [x] `migrations/1001_properties_create_initial_properties.sql` and migrations README — properties
      schema, distinct property/listing rows in one aggregate, unique source identity, immutable
      incoming facts/dispositions, SQL constraints/UUIDv7, safe same-key serialization. No foreign FK.
- [x] `packages/infrastructure/src/properties/{postgres-property.repository,persisted-property.projection,persisted-properties.facade}.ts`
      and adjacent tests — legal transaction client, stable semantic replay, deterministic initial
      DTO projection, backend arithmetic and current collection text rights. Delegate prepared
      search/reductions/fallback, never populate them with unresolved ingested records.
- [x] `apps/worker/src/properties/{parsed-listing.consumer,properties.module,index}.ts`, worker
      main, worker locations/collection modules and public indexes — wire named durable subscription,
      signal propagation, facade providers and explicit bootstrap start. Adjacent consumer tests
      prove commit-before-resolution, malformed input and abort propagation.
- [x] `apps/api/src/properties/properties.module.ts`, API collection module/index and
      `apps/api/src/properties/properties.ingestion.test.ts` — wire composed persisted-detail facade
      using legal DI exports; exercise actual Nest HTTP serialization/errors and both rights branches.
- [x] `integration/properties-ingestion.integration.mjs`, `package.json` — new
      `test:integration:properties-ingestion` script. Build/migrate real isolated PostgreSQL,
      RabbitMQ, MinIO, worker/API. Collect/publish fixture through production mechanisms; assert
      actual HTTP detail and DB uniqueness/outbox. Test duplicate concurrency/inbox expiry,
      restart persistence, atomic rollback+replay, invalid provenance/refused source/address,
      v2-first staging/later v1 and pending subsequent observation. Assert cleanup of exact project.
- [x] `docs/api/properties-and-locations.md`, README and this plan — documentation-writer reference
      update: persisted detail versus prepared routes, initial-only projection, pending fact states,
      current permissions and fixture resolver limits; append executed matrix/evidence. No commit.

**Acceptance Criteria:**

- Given an isolated Compose stack and one genuinely collected synthetic parsed fixture, when the
  existing broker delivers it to the production worker and a client GETs the existing property and
  listing routes by their persisted IDs, then both validate against frozen contracts and return
  the fixture's exact canonical price/attributes/place and original source URL/run/hash/time.
- Given repeated and concurrent deliveries and a worker restart, when the same original fixture
  is published again (also after deleting only its test inbox marker), then the real HTTP IDs and
  initial provenance remain unchanged and exactly one aggregate/creation event persists.
- Given a later legitimate observation and a correction delivered before its original observation,
  when the production consumer commits each, then durable disposition/count assertions prove no
  fact loss, no duplicate Property and no fabricated creation/history in HTTP.
- Given invalid provenance/source/address or an injected database failure before commit, when
  the broker retries then dead-letters it, then HTTP has no new entity and all transaction effects
  remain absent; removing the test-only failure and redelivering the genuine event succeeds once.
- Given a permitted source whose current text rights are later revoked, when the existing property
  and listing GETs run, then no description text/version/excerpt leaks, while provenance survives.
- Given the previous prepared fixture campaign and all repository gates, when executed on the
  final tree, then all pass with unchanged coverage floors/hooks, no skipped tests, real sources,
  secret-file reads or external production actions.

## Implementation Notes

- 2026-10-10 — Register schema discovery: migration 4002 removed `source_kind`. Owned synthetic
  authority is verified using the existing owned source-ID allowlist plus synthetic-listing category,
  repository-fixture access, not-required review, enabled
  collection rights and no hold. No register schema recreation or weakened constraint is needed.
  The real journey legally disables the fixture while denying collection, restores its complete
  gate, rejects an event naming the existing real `olx` source, and tests/restores a current hold.
- Production wiring uses the existing SQL driver and opaque PostgreSQL transaction, public context
  barrels, strict domain parsers, worker subscription and transactional inbox/outbox. Migrations
  1001 and 4008 contain immutable evidence update guards but permit later controlled deletion.
  Prepared search/place/count/reduction projections are not blended with this persisted tracer.
- Implementation-stage verification on 2026-10-10: `lint`, `typecheck`, `test`, `build` and
  `test:coverage` passed
  (1,073 tests across 104 suites). Coverage floors remain 80% statement/line/function and 75% branch.
  Lowest workspace results were infrastructure 88.44% statements, 82% branches, 92.91% functions
  and 90.86% lines; all other workspaces also passed. The existing web build chunk-size advisory
  remains unchanged. Original all-files pre-commit hooks, changed-Markdown Markdownlint,
  supported-file Prettier and `git diff --check` passed. Hooks' existing `stage_fixed` behavior
  staged tracked modifications; no commits were made, and new files remain available for parent
  inspection as untracked files.
- Real regression commands passed: `test:integration:properties` (158 real HTTP requests,
  prepared collection/outbox unchanged), `test:integration:collection`,
  `test:integration:resumable-collection` (real crash/restart), and
  `test:integration:snapshot-reparse` (real CLI, durable replay/races/restart, ordering, legacy
  recovery, privacy, corruption, expiry, rollback and broker/audit inbox).
- Campaign harness discoveries were corrected without weakening production constraints: the
  canonical publisher strips extra envelope fields, so malformed-wire negative scenarios use
  raw confirmed AMQP publication; a held register row must also be disabled with null enablement
  time. Earlier failed attempts cleaned their exact isolated projects before retries. They are
  not claimed as successful full ingestion evidence.
- Final `test:integration:properties-ingestion` passed in
  `rei-properties-ingestion-1717593-b173b9cf`. It used production collection, canonical evidence,
  RabbitMQ delivery, worker transactions, reparse command and API HTTP against real PostgreSQL,
  RabbitMQ and MinIO. Its final assertions found two Properties, two distinct Listings, four
  immutable facts/inbox markers and two creation outbox events; the later v1 and v2 remained
  explicitly pending, with unchanged initial-only detail. The campaign asserted exact-project
  container and volume cleanup. A subsequent read-only Docker inventory found no remaining
  `rei-*` campaign containers or labeled volumes; unrelated workspace stacks were left untouched.
- All failed ingestion attempts are retained below. Each exited unsuccessfully and completed
  scoped cleanup; only the final project above is successful full-campaign evidence. No unresolved
  product or harness failure remains from these attempts. The only build warning is the unchanged
  web chunk-size advisory. Independent final parent verification/review is recorded below.

| Failed isolated project                     | Cause                                                                                  | Correction                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `rei-properties-ingestion-1689421-da86994a` | Initial creation timed out: authority SQL referenced `source_kind`, removed by 4002.   | Use the current category/access/review/rights/hold schema and owned allowlist; rebuild images. |
| `rei-properties-ingestion-1696530-59176d34` | Extra-field rejection timed out: canonical production publisher removed the extra key. | Publish intentionally malformed wire via raw confirmed AMQP only in negative harness cases.    |
| `rei-properties-ingestion-1710615-97f334d8` | Hold fixture update violated `source_register_hold_is_coherent` while enabled.         | Disable and null enablement together with the hold; restore the complete fixture gate.         |

Executed I/O matrix (all rows passed; paths are relative to the repository):

| Scenario             | Executed evidence                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial observation  | Domain aggregate tests; application consumer tests; ingestion campaign real collection → worker → strict Property/Listing HTTP.             |
| Same-event replay    | Application concurrency tests; ingestion campaign eight concurrent copies, worker/API restart and stable IDs/detail/counts.                 |
| Semantic replay      | Application expiry tests; ingestion campaign deletes only fixture inbox marker, sends four copies and preserves one aggregate/creation.     |
| Later observation    | Application pending-history tests; ingestion campaign second genuine collection leaves initial HTTP unchanged.                              |
| Parser correction    | Application v2-before-and-after-v1 tests; ingestion campaign production reparse v2 first, then delayed v1, with durable disposition counts. |
| Forged provenance    | Collection evidence mutation/correction tests; application rejection tests; ingestion campaign changed time, price and URL fail closed.     |
| Refused input        | Strict parser/consumer tests; ingestion campaign raw extra field/version, denied/real/held source and collected unknown-address rejection.  |
| Failure/cancellation | Application rollback at inbox/fact/entity/outbox and cancellation; worker commit/abort tests; real injected SQL failure, DLQ and retry.     |
| Persisted read       | Repository/projection and actual Nest HTTP tests; ingestion strict HTTP validates exact cents, backend arithmetic, place and provenance.    |
| Current text rights  | Projection/Nest allowed/denied/dependency-failure tests; ingestion revokes rights and checks both real detail routes retain no text.        |
| Prepared fallback    | Composite facade tests; ingestion search stays five prepared items; unchanged properties campaign passes all 158 HTTP requests.             |

Collection extension evidence: once/paged/reparse tests assert canonical evidence shares the
state/outbox transaction; collection adapter mutation and rollback tests pass. The real collection,
resumable crash/restart and snapshot-reparse campaigns also pass. The ingestion campaign rejects
an immutable fact update and successfully replays after deleting only its already-published
collection outbox row, proving verification does not depend on outbox retention.

## Plan Change Log

- 2026-10-10 — D-023, recorded before implementation: existing collection observation rows cannot
  verify canonical listing values or event emission time. Add collection-owned parsed-event evidence
  port/adapter and `migrations/4008_collection_add_parsed_event_evidence.sql`; both initial/paged
  collection and reparse write strict canonical evidence atomically with their state/outbox. The
  collection facade compares the full received event and original authority, with no foreign SQL
  in properties, fabricated legacy evidence or dependence on outbox retention. Preserve the ADR 0015
  allowlist and later suppression capability. Add mutation/rollback tests and run affected real
  collection, resumable-collection and snapshot-reparse integration campaigns. Intent unchanged:
  this closes its full provenance-verification invariant rather than adding a later capability.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Valid canonical price/area boundaries could make persisted detail fail
    the frozen Property and Listing contracts. The parent reproduced both failures through the
    compiled production aggregate/projection and strict response parsers: maximum safe cents
    divided by 0.01 produced an unsafe integer, while one cent divided by 1,000,000 rounded to zero.
    The same implementer guarded the derived metric with positive safe-integer validation,
    returning the contract's existing `null` branch on either case without changing original cents,
    accepted inputs or public contracts. Five adjacent boundary/ordinary cases now validate both
    frozen response parsers and preserve canonical cents; all eight projection tests passed.

## Design Notes

Route is full: approximately 1,600 production and 1,400 test/integration lines across more than
five nonmechanical files; business failure risk is high. D-022 resolves owner-level scope choices.

The initial aggregate is a deliberately unresolved single listing, not proof that different
source listings are distinct physical properties. First v1 received creates the baseline; further
verified facts wait durably for the later history projector. A v2-first fact waits for v1. One
creation event goes through outbox because ADR 0012 applies even to this tracer. Its original
observation effective time is not the wall-clock or correction time. Event IDs use PostgreSQL.

Example invariant tests to implement with transactional fakes and repeat on real Compose:

```ts
await consume.execute(originalWire, signal);
await consume.execute(originalWire, signal);
expect(state.properties).toHaveLength(1);
expect(state.listings).toHaveLength(1);
expect(state.outbox.map((event) => event.type)).toEqual(['properties.listing.created']);
expect(state.facts[0].disposition).toBe('initial');
```

The collection evidence facade is a read query only; it never mutates another aggregate. Shared
locks on authority/identity rows may span the caller's opaque transaction so verification and
commit do not race a register change. Do not require completed runs, because page events publish
before run completion. Validate the full original identity and v2 reparse record, not just a hash.

Store only canonical allowed fact fields, never untrusted broker JSON before strict hydration.
Keep observation payload immutable; processing disposition may be separately tracked so entry 5
can apply pending facts without rewriting them. Corrections retain original snapshot chronology.
Semantic dedup must remain effective with a new inbox marker and two simultaneous deliveries.

Use separate metadata fixtureVersion for the initial persisted synthetic tracer and asOf anchored
to that view's original observation. The existing dataMode stays synthetic-stub because production
normalization/matching/history remain incomplete. preparedEvidence is explicitly illustrative,
productionMatchScore stays null, and neighborhoodComparison remains null. No measured probability.

## Verification

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all checks pass.
- `pnpm run test:coverage` — retain unchanged 80% statement/line/function and 75% branch floors.
- `pnpm run test:integration:properties-ingestion` — real ingest/read/duplicates/rollback/negative/
  correction/restart journey passes; every matrix row has executed tests and exact project cleanup.
- `pnpm run test:integration:properties` — all 158 existing prepared read requests still pass.
- `pnpm exec lefthook run pre-commit --all-files` and `git diff --check` — original hooks and
  whitespace pass. Run supported-file Prettier and changed-Markdown Markdownlint as well.
- Parent handles independent diff inspection, verification, review and ordered auto-commits;
  implementer must leave changes uncommitted and append evidence, not mark the plan done.

## Auto Run Result

Implemented the initial verified synthetic parsed-event → immutable Property/Listing → existing
HTTP detail path. Collection-owned canonical publication evidence closes full provenance checking;
Properties owns only its schema and stages later v1/v2 facts explicitly without fabricating history.
Initial creation, durable deduplication, inbox and outgoing creation event share one transaction.

### Files changed and ordered commit plan

The owner-authorized local commits are implementation first, tests second and documentation last.
No push or deployment is included. Exact paths and one-line descriptions follow.

#### Implementation — `feat: persist verified initial synthetic properties`

- `apps/api/src/collection/collection.module.ts`
  — Export the Collection facade for legal cross-context DI.
- `apps/api/src/collection/index.ts` — Expose the API Collection module through its public barrel.
- `apps/api/src/properties/properties.module.ts`
  — Bind persisted-first detail with prepared fallback and current permissions.
- `apps/worker/src/collection/collection.module.ts`
  — Provide and export the worker Collection evidence facade.
- `apps/worker/src/collection/index.ts`
  — Expose the worker Collection module through its public barrel.
- `apps/worker/src/locations/index.ts`
  — Expose the worker Locations module through its public barrel.
- `apps/worker/src/locations/locations.module.ts` — Provide stateless fixture geography resolution.
- `apps/worker/src/main.ts` — Start the durable parsed-listing consumer before readiness.
- `apps/worker/src/properties/index.ts`
  — Expose the worker Properties module through its public barrel.
- `apps/worker/src/properties/parsed-listing.consumer.ts`
  — Subscribe with strict parsing, abort propagation and commit-before-ack behavior.
- `apps/worker/src/properties/properties.module.ts`
  — Wire ingestion services, repository, inbox/outbox and context facades.
- `migrations/1001_properties_create_initial_properties.sql`
  — Create immutable initial aggregates, facts and durable source uniqueness.
- `migrations/4008_collection_add_parsed_event_evidence.sql`
  — Store immutable canonical parsed publication evidence under Collection ownership.
- `package.json` — Add the isolated real-service property-ingestion verification command.
- `packages/application/src/collection/collect-source-once.service.ts`
  — Persist canonical publication evidence atomically with initial collection state/outbox.
- `packages/application/src/collection/collect-source-run.service.ts`
  — Persist canonical publication evidence atomically with paged collection state/outbox.
- `packages/application/src/collection/collection-run.repository.ts`
  — Extend collection persistence with the inward evidence port.
- `packages/application/src/collection/collection.facade.ts`
  — Expose transaction-scoped verification of complete parsed publications.
- `packages/application/src/collection/index.ts`
  — Export canonical publication evidence types and port.
- `packages/application/src/collection/parsed-event-evidence.port.ts`
  — Define the framework-neutral transaction-scoped publication evidence port.
- `packages/application/src/collection/reparse-snapshot.service.ts`
  — Persist canonical correction evidence atomically with reparse state/outbox.
- `packages/application/src/collection/snapshot-reparse.repository.ts`
  — Extend reparse persistence with canonical evidence recording.
- `packages/application/src/locations/locations.facade.ts`
  — Expose minimal fixture-address resolution without geocoding.
- `packages/application/src/properties/consume-parsed-listing.service.ts`
  — Atomically verify, deduplicate, persist initial aggregates or stage later facts.
- `packages/application/src/properties/index.ts`
  — Export the ingestion service and repository contracts.
- `packages/application/src/properties/property.repository.ts`
  — Define Properties-owned persistence, source locking and fact dispositions.
- `packages/domain/src/properties/index.ts` — Export the immutable initial Property aggregate.
- `packages/domain/src/properties/property.entity.ts`
  — Validate and freeze distinct Property/Listing identities, provenance and creation facts.
- `packages/infrastructure/src/collection/in-memory-collection.adapters.ts`
  — Record canonical evidence in isolated collection orchestration fakes.
- `packages/infrastructure/src/collection/in-memory-snapshot-reparse.repository.ts`
  — Record canonical evidence in isolated reparse orchestration fakes.
- `packages/infrastructure/src/collection/index.ts`
  — Export the PostgreSQL canonical-evidence adapter.
- `packages/infrastructure/src/collection/postgres-collection-run.repository.ts`
  — Append canonical evidence using the caller's active transaction.
- `packages/infrastructure/src/collection/postgres-collection.facade.ts`
  — Verify full publications and source/correction authority under shared SQL locks.
- `packages/infrastructure/src/collection/postgres-parsed-event-evidence.ts`
  — Insert only strict canonical parsed v1/v2 publications in the legal transaction.
- `packages/infrastructure/src/collection/postgres-snapshot-reparse.repository.ts`
  — Append correction evidence using the caller's active transaction.
- `packages/infrastructure/src/collection/synthetic-collection.stub.ts`
  — Refuse fabricated publication authority in the prepared stub.
- `packages/infrastructure/src/locations/synthetic-locations.adapter.ts`
  — Resolve only known synthetic addresses to their honest reference geography.
- `packages/infrastructure/src/properties/index.ts`
  — Export persisted repository, detail projection and composite facade.
- `packages/infrastructure/src/properties/persisted-properties.facade.ts`
  — Prefer persisted detail, recheck text rights and leave prepared search unchanged.
- `packages/infrastructure/src/properties/persisted-property.projection.ts`
  — Project original initial facts with strict DTOs and safe nullable derived money.
- `packages/infrastructure/src/properties/postgres-property.repository.ts`
  — Persist and hydrate aggregates using only Properties SQL and active transaction scopes.

#### Tests — `test: verify atomic property ingestion and persisted detail`

- `apps/api/src/properties/properties.controller.test.ts`
  — Update controller test composition for the persisted-detail dependency seam.
- `apps/api/src/properties/properties.ingestion.test.ts`
  — Exercise actual Nest HTTP persisted detail, contracts and text-rights branches.
- `apps/worker/src/properties/parsed-listing.consumer.test.ts`
  — Verify strict wire handling, abort propagation and resolution after commit.
- `integration/properties-ingestion.integration.mjs`
  — Exercise production ingest-to-HTTP, rollback, replay, restart and negative real-service cases.
- `packages/application/src/collection/collect-source-once.service.test.ts`
  — Assert initial collection evidence shares the state/outbox transaction.
- `packages/application/src/collection/collect-source-run.service.test.ts`
  — Assert paged collection evidence shares the state/outbox transaction.
- `packages/application/src/collection/reparse-snapshot.service.test.ts`
  — Assert correction evidence shares the reparse state/outbox transaction.
- `packages/application/src/properties/consume-parsed-listing.service.test.ts`
  — Cover atomic effects, concurrency, expiry, pending facts, refusal and cancellation.
- `packages/domain/src/properties/property.entity.test.ts`
  — Cover immutable canonical aggregate state, provenance and initial creation invariants.
- `packages/infrastructure/src/collection/parsed-event-evidence.test.ts`
  — Cover full evidence mutation/refusal, correction identity and atomic rollback.
- `packages/infrastructure/src/locations/fixture-address-resolution.test.ts`
  — Cover honest known-neighborhood/block resolution and unknown-address refusal.
- `packages/infrastructure/src/properties/persisted-property.projection.test.ts`
  — Cover permissions, prepared fallback and both frozen DTO money boundaries.
- `packages/infrastructure/src/properties/postgres-property.repository.test.ts`
  — Cover own-schema transaction ownership, strict hydration and invalid persisted data.
- `packages/infrastructure/src/properties/property.test-fixture.ts`
  — Provide canonical initial synthetic facts for isolated Properties adapter tests.

#### Documentation — `docs: record property ingestion decisions and verification`

- `README.md` — Advertise the local ingestion campaign and persisted initial detail limits.
- `_bmad-output/initiative-real-estate-intelligence/epic-properties/epic-properties.md`
  — Mirror owner decisions D-022 and D-023 in English.
- `_bmad-output/initiative-real-estate-intelligence/epic-properties/story-one-parsed-listing-becomes-a-property-plan.md`
  — Record intent, execution, matrix evidence, review triage and build result.
- `docs/api/properties-and-locations.md`
  — Document persisted-first detail, pending facts, permissions and safe derived money.
- `migrations/README.md` — Describe the Properties and canonical Collection evidence migrations.

### Review result

Quick review completed after the parent read the full unified diff and audited all eleven matrix
rows against executed tests. One medium finding was verified and patched; high/low/false/maybe-false
counts are zero. No findings were rejected or deferred. The same implementer applied the smallest
projection guard and five strict-contract boundary cases; the parent reread the updated full diff
and repeated all verification commands on the patched tree.

Patched entry counts: high 0, medium 1, low 0. Follow-up review recommendation is `false`: this
first pass has neither a high patch nor two medium patches, and no specific unverified risk was
identified by the review. The frontmatter records the quick lens and an empty deferred list.

### Independent final verification

All commands below completed successfully on 2026-10-10 after the review patch:

- `pnpm run lint` — ESLint plus existing context, migration and repository convention checks passed.
- `pnpm run typecheck` — all workspace type checks passed.
- `pnpm run test` — 1,078 tests across 104 suites passed; none skipped or weakened.
- `pnpm run build` — all packages and applications built; only the pre-existing web chunk advisory.
- `pnpm run test:coverage` — all eight workspaces passed the unchanged 80% statement/line/function
  and 75% branch floors.
- `pnpm run test:integration:properties-ingestion` — project
  `rei-properties-ingestion-1753774-0d4062cd` passed production collection/evidence/broker/worker/
  strict HTTP, atomic rollback and genuine retry, replay/concurrency/inbox expiry/restart, immutable
  pending v1/v2 facts, authority/mutation/address refusal, current text rights and prepared isolation.
  Final assertions retained two Properties, two Listings, four facts/inbox markers and two creation
  outbox events. The exact project containers and volumes were cleaned.
- `pnpm run test:integration:properties` — project `rei-properties-1760792-b9a31270` passed all
  158 real HTTP requests with prepared collection/outbox unchanged.
- `pnpm run test:integration:collection` — production synthetic collection passed.
- `pnpm run test:integration:resumable-collection` — real crash/restart campaign passed.
- `pnpm run test:integration:snapshot-reparse` — real CLI, durable replay/races/restart, ordering,
  legacy recovery, sanitized privacy, corruption, expiry, rollback and broker/audit inbox passed.
- `pnpm exec lefthook run pre-commit --all-files` — original secrets, ESLint, Prettier, Markdownlint,
  shell and Dockerfile checks passed, without bypassing any hook.
- Supported changed-file Prettier and `markdownlint-cli2 --no-globs` on all five changed Markdown
  files passed; both unstaged and cached `git diff --check` passed.

Before review, the parent independently ran the same full gates and real campaigns, including
successful ingestion project `rei-properties-ingestion-1733581-ab4fa181` and prepared HTTP project
`rei-properties-1741002-54f68e01`. Those results were repeated after the patch rather than used as
substitutes for final verification. The implementer's earlier staged/untracked report is historical;
the parent inspected every changed path, including all new files.

### Residual limits

This is still an unresolved, initial-only synthetic tracer. Durable later observations/corrections
await their history projector; search, counts and reductions remain prepared fixtures. Geography is
known-fixture reference resolution, not normalization or geocoding. No production matching,
calibration, real collection or browser/UI change is claimed. These are the recorded D-022/D-023
boundaries, not hidden successful capabilities. The unchanged web chunk advisory remains.

VPS-dependent work stays pending for the owner, as reiterated during this run. No VPS access,
push, deployment, real source, AI processing, new dependency or secret-file read occurred.
