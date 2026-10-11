---
title: 'Complete price facts'
type: 'feature'
ticket: '3'
created: '2026-10-11'
status: 'built'
baseline_revision: 'f6f9a99e603ca60771f7b8455025a1cc6f059919'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0022-causal-property-price-facts.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0021-event-fed-market-median.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0012-domain-events-and-transactional-outbox.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Market currently freezes each listing's property and consumes only listing events.
Story 4.3/CAP-9 requires one lowest-active-asking fact per property through all eight public event
families, merges, splits, removals and reappearances, without duplicate merged properties.

**Approach:** Implement accepted D-042/ADR 0022: additive strict Properties v2 causal contracts,
independent immutable listing-state and assignment frontiers, durable cross-family replay fences
and atomic Market-owned property minimum/tombstone facts. Prove the complete synthetic event
journey through the actual place overview HTTP on PostgreSQL/RabbitMQ/API/worker.

## Boundaries & Constraints

**Always:** Preserve D-041 median, public response paths/units and prepared-section declarations.
Maintain strict v1 public parsing and current v1 listing producers; assignment zero is their only
membership authority. V2 carries real explicit counters; never infer them. A causal state key is
listing ID/state revision with fact identity excluding only propertyId; assignment key is listing
ID/assignment revision with property identity. Sources remain immutable. Highest frontiers advance
independently. Preserve existing permanent event/listing-event revision fences and add property
aggregate revision and cross-family event-ID fences. Projection and inbox share one transaction;
acknowledgment follows commit. Use one context-local writer lock and coherent reads. Null minima
remain tombstones and contribute no sample. Validate v2 snapshots at declared facts, not whatever
arrived first. Existing v1 evidence must migrate/backfill without rewriting history. Real services
exercise actual SQL, outbox, inbox, broker delivery, HTTP, rollback, upgrade and restart. All new
integration code is strict TypeScript/Vitest using existing Supertest/Testcontainers support.

**Never:** Read Properties SQL, access internal repositories, add ORM/vendor types inward, mutate
price/status based on property revision/time, treat removal as sale/suppression, guess v1 property
causality, enable real sources, read/search/edit `.env*`, access VPS/deploy/push or create a branch.
Do not implement entity resolution, other metrics/counts/neighbours/series/freshness/suppression or
UI. No coverage reductions, skipped tests, bypassed hooks or Node integration test/assert harness.
The production property emitter remains Properties' later story; this story uses public synthetic
v2 events. V1 property events reject explicitly into bounded dead letters, never successful apply.

## I/O & Edge-Case Matrix

| Scenario                     | Input / State                                                                                                                      | Expected Output / Behavior                                                                                                   | Error Handling                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Listing families             | Created, price, description, removed, reappeared with explicit revisions                                                           | Highest state supplies price/status; lowest active per property supplies one fact and HTTP sample                            | No error                                   |
| Property price               | V2 asking-price snapshot with complete causal listingStates                                                                        | Validated derived snapshot advances only explicit state/assignment frontiers; lower snapshots cannot regress                 | Contradictory snapshot rejects atomically  |
| Merge/split                  | V2 full before-membership facts and assignments, retained/new result IDs                                                           | All members have one effective destination; minima/tombstones and own/parent HTTP count each resulting property once         | Invalid cardinality/conservation rejects   |
| Removed member               | Listing removed before split, then reappears                                                                                       | Declared destination survives; reappearance contributes there, not retired property                                          | No error                                   |
| Reversed delivery            | Merge before creates; split before merge; late premerge listing and higher state before older snapshot                             | Final facts, median/count and provenance equal causal-order result, never revive stale membership                            | No timestamp ordering                      |
| Representative eligibility   | Equal prices, globally cheaper listing outside place, null area and all removed                                                    | Listing-ID tie; global minimum before geography/area; unavailable empty median and zero eligible count                       | No substitute representative               |
| Replay                       | Identical listing/property events after inbox expiry and worker restart                                                            | Same evidence/frontiers/minima and HTTP output; trace-only differences harmless                                              | No new durable business rows               |
| Permanent conflicts          | Event ID reused across families; listing-event revision, property revision, source identity or causal state/assignment key changes | Every affected projection/evidence/inbox effect rolls back and durable bounded delivery rejects                              | Canonical external rejection/dead letter   |
| Legacy compatibility/upgrade | Existing 2001 data and v1 listing events; v1 property event                                                                        | V1 evidence and max state/assignment-zero survive upgrade; later assignment not undone; ambiguous property event not applied | Explicit v1 property rejection             |
| Atomic failure/concurrency   | Inject failure after partial merge; competing deliveries/read during projection                                                    | Rollback includes all assignments/minima/inbox; concurrent committed reads remain coherent                                   | Sanitized persistence failure, no fallback |

</intent-contract>

## Code Map

- `packages/domain/src/properties/properties.events.ts` — all eight public v1 types and strict
  parser. Do not weaken v1 validators; add a separate v2 contract/parser if clearer. V1 merge
  listingFacts are active-only, have no revisions and cannot route removed members. V2
  `listingStates` entries contain `{ listing, revision, assignmentRevision }`; assignments contain
  `{ listingId, fromPropertyId, toPropertyId, fromAssignmentRevision, assignmentRevision }` with
  consecutive revisions. V2 asking-price payload retains previous/current and adds complete states.
  V2 reassignment retains previous/resulting, replaces unversioned listingFacts with complete states,
  and validates active minima and all-member destinations. Validate selected place/area/provenance
  and lexicographic ties as well as money/status/identity. Export through Properties public barrel.
- `packages/domain/src/shared/domain-event.ts` — existing generic version-capable immutable
  envelope, safe primitives/UUID/time validation; reuse instead of another envelope framework.
- `packages/domain/src/market/asking-price-median.ts` — established global selection before place,
  null-area exclusion, safe rounding and selected-source provenance. Preserve arithmetic unchanged;
  factor a pure representative rule only when needed for consistent stored minima.
- `packages/application/src/market/market-price-facts.port.ts`,
  `consume-market-listing.service.ts` — current five-event union, parser, project-before-inbox
  permanent validation. Broaden to accepted event versions/types without changing consumer name
  `market.listing-price-facts`. Keep public port narrow and provide deterministic in-memory fakes.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` — currently immutable
  listing envelopes and max revision, freezes propertyId. Separate state identity from membership,
  use new Market-only evidence/frontier/property facts and coherent own-schema read. Do not weaken
  permanent conflict checks or mutate old evidence.
- `migrations/2001_market_price_facts.sql` — deployed immutable evidence/current references.
  Add `2002_market_*.sql`, do not rewrite applied migration; safely backfill full retained history
  and current property facts. Preserve listing-event identity across v1/v2; causal snapshot
  references are not another listing event. No cross-schema FK/join.
- `apps/worker/src/market/market-listing.consumer.ts`, `market.module.ts` — same subscriber expands
  to all eight families; use existing transaction/resilience/inbox wiring, no direct broker publish.
- `packages/application/src/market/market-query.service.ts`, `apps/api/src/market/market.module.ts`
  — already reads one persisted coherent facts snapshot for own and actual parent. No endpoint
  addition; keep sanitized 500 on invalid persisted data and canonical request validation/404.
- `integration/market-median.integration.test.ts` — reuse its actual outbox publishing, explicit
  fixture env, registered Locations, unique owned PostgreSQL/RabbitMQ/MinIO/API/worker lifecycle,
  bounded polling, permanent conflict/restart/HTTP evidence and cleanup. Add focused
  `integration/market-price-facts.integration.test.ts`; upgrade proof can be separate campaign.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/properties/properties.events*.ts`, `index.ts` — add/export strict v2
      contracts with complete causal metadata and deterministic minimum validation; preserve v1.
- [x] `packages/domain/src/market/*.ts` — share pure minimum/state rules where useful; test matrix
      calculations, invalid metadata, removed membership, identity-retaining merge/split and detach.
- [x] `packages/application/src/market/market-price-facts.port.ts`,
      `consume-market-listing.service.ts` and their tests — accept v1 listing/v2 eight families,
      explicit v1 property rejection; fake ports prove transaction/abort/inbox behavior.
- [x] `migrations/2002_market_*.sql`,
      `packages/infrastructure/src/market/market-price-facts.pg-repository*.ts` — retain immutable
      envelopes and causal state/assignment evidence; independent highest frontiers, one property
      minimum/tombstone, atomic context-local writer lock, coherent detached reads and safe backfill.
- [x] `apps/worker/src/market/market-listing.consumer*.ts` — subscribe all eight types under the
      existing durable name; test dispatch/parsing and acknowledgment after commit.
- [x] `integration/market-price-facts.integration.test.ts` and optional upgrade campaign — prove
      every matrix row against real services and actual `/api/v1/places/:id/market`, including broker
      rejects, expiry/restart replay, reversed histories, midmerge rollback and v1 migration upgrade.
- [x] `package.json`, `docs/testing/integration.md`, `docs/api/market.md` — register focused alias
      and accurately document causal contracts, stored facts, compatibility and additional campaign.
      Use the documentation-writer skill for explanatory/reference changes.
- [x] This plan — append implementation, verification and matrix-test evidence without changing
      intent-contract. Read `/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` and required
      communication/state/testing references before backend changes; accepted ADRs override Prisma,
      NX/Jest defaults. Do not render another BMad workflow or make commits in implementation.

**Acceptance Criteria:**

- Given all eight event families on owned Compose services, when the full fixture is consumed,
  then HTTP own/parent medians have exactly one eligible representative per resulting property,
  correct asking price, selected sources and existing staged provenance; merged predecessors do
  not contribute twice, and removed-at-split members reappear only at their declared destination.
- Given identical causal history delivered in normal and adversarial order, when consumers settle
  and restart after inbox expiry, then HTTP result and permanent projection rows agree; lower
  state/membership revisions never undo a newer one, including retained/reused property IDs.
- Given version-1 evidence in the existing schema, when 2002 is applied and v1/v2 events are
  consumed, then history remains immutable and readable, permanent conflicts still reject and
  assignment-zero v1 observations never undo a later merge/split.
- Given a malformed/conflicting event or injected persistence failure, when delivery is attempted,
  then no partial property facts/assignments/inbox are committed; actual broker evidence shows
  bounded rejection, and GET remains read-only with sanitized failures and no prepared fallback.

## Implementation Notes

Implemented separate public `PropertiesEventV2`/`parsePropertiesEventV2` contracts for all eight
families. V1 validators and producers remain unchanged; the consumer explicitly rejects v1
property events. V2 validates complete declared before/after membership, removed members,
consecutive assignment revisions and deterministic selected minimum details. Existing domain
median arithmetic was preserved; snapshot minimum validation lives with the new public contract.

Migration `2002_market_causal_price_facts.sql` adds permanent normalized event evidence,
immutable source identity and causal state/assignment evidence, independent highest frontiers,
and one selected listing or null tombstone per property. It backfills all retained 2001 evidence
and preserves the deployed legacy tables. The adapter takes one transaction-scoped Market writer
lock, checks permanent fences before replay exit, recomputes all affected property facts and
records inbox effects in the same transaction. Reads hydrate one coherent Market-only SQL result
through the strict public listing parser. No Properties SQL or ORM was introduced.

The existing durable worker subscription expands through the public event-type constant. API
response contracts, own/parent median arithmetic and prepared sections are unchanged. The old
median campaign's deliberate persistence-failure target now follows the new property read table.

Used the required NestJS modular-monolith skill and its communication/state/testing references;
accepted ADRs supplied the repository's explicit SQL, pnpm and Vitest conventions. Used the
documentation-writer skill to distinguish API reference behavior from the integration how-to.
Did not render another BMad workflow, create a branch, commit, deploy or enable production sources.

### Matrix evidence

The focused integration test that actually ran is named
“complete causal facts prove upgrade, all eight families, adversarial delivery, atomic conflicts
and HTTP on owned real services”.
Its owned fixture uses actual PostgreSQL, RabbitMQ, MinIO, API and worker with transactional
outbox publication and public HTTP/Supertest reads. Each row below is asserted in that test:

The upgrade phase additionally attempts deletion from all four new immutable evidence/identity
tables and verifies that their PostgreSQL triggers reject it.
The concurrent split changes the valid committed HTTP pair from 1500/1 to 1750/2, so a duplicate
or partially recomputed representative cannot pass merely because both representatives tie.
Every racing read asserts one of those exact pairs and matching own/parent results.

| Matrix row                         | Executed assertions                                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listing families and golden median | All five v2 listing families; initial 1500/2, merge 1000/1, removals 1500/1 then 2000/1 then null/0, reappearance 1200/1, split/reappearance 1350/2 and price change 1650/2                                                                                                   |
| Property price                     | Valid declared v2 asking-price snapshot; malformed missing states reaches bounded broker dead letter without durable projection changes                                                                                                                                       |
| Merge/split and removed membership | Complete before/after assignments, retained result ID, removed-at-split members reappear at their destination, no predecessor double counting                                                                                                                                 |
| Adversarial order and replay       | Inbox deletion, worker restart, reverse replay with trace-only difference, then actual reverse-first history; all nine permanent/current Market tables exactly equal the normal-order result                                                                                  |
| Eligibility and provenance         | Null-area exclusion, globally cheaper representative outside own and actual parent geography, no in-scope substitute, equal-price listing-ID tie and selected URL                                                                                                             |
| Permanent conflicts                | Actual bounded dead letters for v1 property event, cross-family event-ID collision, property aggregate revision collision, listing-event revision collision, immutable source identity, causal state key, causal assignment key and malformed snapshot; no projection changes |
| Legacy upgrade                     | Seed two v1 revisions under 2001, apply 2002, verify unchanged original evidence, highest-state/assignment-zero backfill, then later v1 state cannot undo v2 membership                                                                                                       |
| Atomicity/concurrency              | Real SQL trigger aborts a complete four-member merge after assignment writes; all nine Market tables and inbox roll back; duplicate deliveries and reads racing a split observe committed old/new eligible counts only                                                        |
| Read-only and failure paths        | Stopped worker plus repeated GET leaves every projection row unchanged; deliberately malformed persisted representative yields sanitized 500 with no fallback; own/parent prepared basis and untracked freshness stay unchanged                                               |

Domain tests `Properties causal v2 contracts` cover all eight families, strict metadata,
cardinality/conservation, selected place/area/provenance and equal-price ties, removed routing,
retained IDs, detached immutable payloads and all-removed null snapshots. Application tests prove
property-snapshot projection/inbox rollback and abort behavior. Infrastructure tests cover
permanent fence replay/rejection, causal key rollback, snapshot-only state references, removed
destinations/tombstones and coherent detached strict reads. Worker tests prove the unchanged
durable subscriber dispatches all eight public types.

## Plan Change Log

2026-10-11: Added the required implementation/evidence notes and task completion markers without
changing the intent-contract. No scope or acceptance changes. Parent owns review and any commits.

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Valid uppercase UUID facts retained raw v2 payloads and legacy
    backfill JSON, contradicting canonical snapshot evidence at the same state revision —
    the parent reproduced accepted uppercase input producing unequal causal JSON and traced
    UUID normalization through the public parser. Canonical parsed v2 facts, minima and
    assignments are now retained; new adapter evidence and migration backfill canonicalize
    UUIDs without rewriting original v1 envelopes. Regression tests exercise all eight v2
    families, retained uppercase v1 upgrade and same-revision canonical snapshots.
  - `[medium]` `[patch]` The injected midmerge SQL failure proved direct transaction rollback
    but not the acceptance criterion's bounded broker rejection — the parent confirmed the
    trigger was removed before the original broker-conflict checks. The campaign now publishes
    the failing merge through RabbitMQ with the trigger still installed, checks its identity
    in the bounded dead-letter result, and compares all nine Market tables and the entire inbox
    before removing the trigger. The final focused real-service campaign passed.

## Design Notes

Risk is high: causal contracts, migration and concurrent replay span more than five files and
well over 100 lines, so full implementation handoff is required. No UI or design change.
Golden example: A has L1=10,000/L2=15,000; B has L3=20,000, each area 10. Initial own median is
1,500 centavos/m² (2 properties). Merge into C gives 1,000 (1); remove L1 gives 1,500, remove L2
gives 2,000, remove L3 gives null/0; reappear L1 at 12,000 gives 1,200/1. A declared split with
two active representatives restores count 2 and the calculated middle value. Source URLs and
times follow only the chosen representatives. Reverse-order evidence must reach the same result.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all workspace gates
  and strict integration typecheck pass; no weakened configuration or skipped cases.
- `pnpm run test:coverage` — all eight workspace floors pass unchanged.
- `pnpm run test:integration:market-price-facts` — causal facts and any focused upgrade proof pass.
- `pnpm run test:integration:market-median` — existing tracer passes unchanged.
- `pnpm run test:integration` — complete real-service suite passes with no pending/skipped tests,
  including any newly registered upgrade campaign and support/convention regressions.
- `pnpm exec prettier --check <changed supported files>` and
  `pnpm exec markdownlint-cli2 --no-globs <changed Markdown files>` — scoped documentation passes.
- `git diff --check` — no whitespace errors. Inventory Docker before/after real-service runs;
  remove only fixture-owned resources and prove foreign resources unchanged. Audit every matrix
  row against named tests that actually ran and passed; record commands/counts/log locations.

Run all checks from this repository only. Do not read `.env*`, run default Compose, change another
repository, lower thresholds or hide pre-existing global generated-Markdown issues. Parent owns
review/commits and will independently verify the complete diff and gates.

### Recorded results

Exact command output is retained under `/tmp/rei-price-facts-verification.b9rOyu/` for parent audit.

- `pnpm run lint` — passed; `lint.log` includes unchanged ESLint, boundary and migration checks.
- `pnpm run typecheck` — passed, including strict integration checking; `typecheck.log`.
- `pnpm run test` — passed, 1381 tests across 131 files in eight workspaces; `unit.log`.
  Counts: AI 9, web 14, contracts 94, domain 373, application 184, infrastructure 372, API 141,
  worker 194. No skipped or pending tests.
- `pnpm run build` — passed; `build.log`. The existing web chunk-size warning remains advisory.
- `pnpm run test:coverage` — passed all eight unchanged floors (80% statements/lines/functions,
  75% branches); `coverage.log`. Package branch totals range from 82.75% to 100%.
- `pnpm run test:integration:market-price-facts` — passed, one complete campaign in the final
  33.29-second run; `causal-integration-final.log`.
- `pnpm run test:integration:market-median` — passed, existing campaign in 110.93 seconds;
  `median-integration.log`.
- `pnpm run test:integration` — passed, 39 tests across 22 files in 861.07 seconds; no skipped or
  pending tests. All eighteen real-service campaigns and cleanup/support tests ran. Exact output:
  `full-integration.log`.
- Scoped Prettier and `markdownlint-cli2 --no-globs` checks — passed; `prettier.log`,
  `final-test-format.log`, `markdownlint.log`. Final plan notes are rechecked before handoff.
- `git diff --check` — passed; `diff-check.log`.

Initial Docker inventory retains 13 foreign containers and 13 volumes in `docker-before.log` and
`volumes-before.log`. Campaigns clean up only exact fixture-owned resources. Final comparison is
identical after all test processes exit: the same 13 foreign containers and 13 volumes remain, with
no owned fixture leftovers. `docker-after.log`, `volumes-after.log`, `docker-comparison.log` and
`volumes-comparison.log` preserve the evidence; both sorted comparisons passed with empty output.
No daemon-wide cleanup was used.

Nothing remains incomplete within this plan. The production Properties v2 emitter/entity resolver
remains explicitly out of scope, and the context-wide writer lock is the accepted MVP throughput
trade-off in ADR 0022. Parent review and any commits remain parent-owned.

### Independent parent verification

The parent read the complete 2701-line baseline-to-tree diff, including all new files, and ran
the verification commands independently. Exact output is retained under
`/tmp/rei-complete-price-facts-verify-cjHmRq/`.

- Root lint, typecheck (including strict integration), unit tests and build passed; 1381 unit
  tests across 131 files passed. All eight unchanged coverage floors passed.
- Focused causal facts passed in 33.50 seconds; existing median passed in 39.70 seconds.
- Full integration passed: 39 tests across 22 files in 749.10 seconds, no skipped/pending tests.
- Matrix audit additionally ran 26 named focused unit tests with verbose output in
  `matrix-unit.log`; all passed. The executed complete causal real-service campaign covers every
  matrix row as mapped above, including actual HTTP, upgrade, reverse-first history and rollback.
- Scoped Prettier checked 20 supported files; scoped Markdownlint checked six Markdown files;
  staged and unstaged whitespace checks passed.
- Exact Docker ID/name and volume inventories match the pre-verification inventory: 13 foreign
  containers and 13 volumes, no owned leftovers. No foreign resource was stopped or removed.

### Independent post-review verification

The parent read the complete review-fix delta and surrounding migration, parser and broker
failure paths, then repeated every verification command on the final patched tree. Logs are
under `/tmp/rei-complete-price-facts-verify-cjHmRq/` with the `post-review-` prefix.

- Root lint, strict typecheck, unit tests and build passed. Unit tests: 1382 across 131 files;
  the new legacy-envelope/canonical-state regression adds one infrastructure test.
- All eight unchanged coverage floors passed; branch totals remain 82.75%–100%.
- Causal price facts passed in 34.60 seconds; existing median passed in 44.59 seconds.
- Complete integration passed: 39 tests across 22 files in 735.57 seconds, no skips or pending
  cases. Deliberately injected API and retention failures are asserted negative-path evidence.
- The verbose matrix audit passed 27 named tests across domain, application, infrastructure and
  worker files. The executed causal campaign additionally covers canonical v2 input, uppercase
  retained v1 upgrade and same-revision canonical snapshots, and actual broker rejection while
  the injected SQL trigger remains installed, with all nine Market tables and the entire inbox
  unchanged.
- Scoped Prettier, six-file Markdownlint and both staged/unstaged whitespace checks passed.
  Final result notes are checked again before committing.
- Docker ID/name and volume inventories match exactly: 13 foreign containers and 13 volumes,
  with no owned leftovers. No foreign resources were stopped or removed.

## Auto Run Result

Implemented complete causal Market price facts for all eight public Properties event families,
with independent state/membership frontiers, immutable replay evidence, coherent property
minima/tombstones and atomic projection/inbox writes. V1 listing contracts and original retained
envelopes remain unchanged. Public own/parent median contracts and arithmetic are preserved.
All integration campaigns, helpers and probes follow the existing strict TypeScript/Vitest
standard with Supertest, Testcontainers and real service semantics.

### Changed files

- `migrations/2002_market_causal_price_facts.sql` — additive immutable causal evidence/frontier
  and property minimum upgrade, with canonical UUID backfill and unchanged legacy envelopes.
- `packages/application/src/market/consume-market-listing.service.ts` — parse all accepted
  families/versions, reject ambiguous v1 property events and retain atomic inbox orchestration.
- `packages/application/src/market/market-price-facts.port.ts` — expose the accepted public
  event union and existing narrow projection capability.
- `packages/domain/src/properties/index.ts` — export the separate public v2 contract/parser.
- `packages/domain/src/properties/properties.events.ts` — expose reusable strict fact parsers
  without changing v1 validation or payload retention.
- `packages/domain/src/properties/properties.events-v2.ts` — strict complete causal contracts
  with canonical parsed payloads and declared minimum/membership validation.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` — immutable fences,
  independent highest frontiers, atomic recomputation and coherent Market-only reads.
- `apps/api/src/market/market.controller.test.ts` — keep failure evidence aligned with the
  new persisted property-minimum read shape.
- `apps/worker/src/market/market-listing.consumer.test.ts` — prove the unchanged durable
  subscription dispatches all eight event families.
- `integration/market-median.integration.test.ts` — target the new read table for deliberate
  persistence failures while preserving the existing median journey.
- `integration/market-price-facts.integration.test.ts` — real-service upgrade, eight-family,
  replay/order, conflict, concurrency, rollback/DLQ and public own/parent HTTP campaign.
- `package.json` — register the focused causal-price-facts integration alias.
- `packages/application/src/market/consume-market-listing.service.test.ts` — transaction,
  snapshot, rejection and abort/inbox regressions.
- `packages/domain/src/properties/properties.events-v2.test.ts` — causal invariants and
  canonical uppercase UUID input across all eight event families.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.test.ts` — permanent
  conflicts, causal writes, unchanged v1 envelopes, tombstones and coherent strict reads.
- `_bmad-output/initiative-real-estate-intelligence/epic-market/epic-market.md` — mirror
  accepted D-042 causal policy in English.
- `_bmad-output/initiative-real-estate-intelligence/epic-market/story-complete-price-facts-plan.md`
  — preserve intent and record implementation, verification, review triage and terminal result.
- `docs/api/market.md` — reference complete event-fed minimum facts and compatibility limits.
- `docs/testing/integration.md` — explain the focused campaign and real-service evidence.
- `specs/README.md` — index accepted ADR 0022.
- `specs/adrs/0022-causal-property-price-facts.md` — accepted causal metadata, evidence,
  compatibility and persistence decision.

### Review outcome

Pinned Quick review reported exactly two findings. Both were independently verified as medium
and patched: canonical causal UUID facts/backfill without legacy history mutation, and actual
bounded broker rejection for injected midmerge persistence failure. No findings were rejected
or deferred; no intent gap or plan loopback was needed.

Patched entry counts: high 0, medium 2, low 0. Two medium patches meet the first-pass count
threshold, but follow-up review is not recommended because no specific unverified review risk
remains: the parent inspected both final fixes, the regression matrix and the actual broker
failure path, and independently reran every gate and real-service campaign successfully.

Verification outcomes and exact counts/logs are recorded above. Scoped formatting and Markdown
checks also cover the final result notes before the source-first, tests-second, documentation-last
commits. Every reviewed path must be committed after the baseline and the working copy must be
clean before this workflow halts with `built`.

### Residual constraints

The context-wide writer lock is the accepted MVP throughput trade-off. Ambiguous v1 property
events deliberately reject; the production Properties v2 emitter/entity resolver is outside this
story. Fixtures remain local and synthetic; no VPS, deployment, real source, push, environment
file change or public UI work was performed. VPS-dependent stories remain owner-blocked.
