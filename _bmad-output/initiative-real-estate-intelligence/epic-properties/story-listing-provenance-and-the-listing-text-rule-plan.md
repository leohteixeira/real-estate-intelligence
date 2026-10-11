---
title: 'Listing provenance and the listing-text rule'
type: 'feature'
ticket: 10
created: '2026-10-11'
status: done
baseline_revision: '983db6a66dc2633f844489aa582057c32b7918bc'
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
  - /workspace/.claude/skills/nestjs-modular-monolith/SKILL.md
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 3.10 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`integration/listing-provenance.integration.test.ts` passed both public detail surfaces,
current allow/deny/restored source rights, text/version visibility and authentic snapshot lifecycle.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`c3a2cf7fdb02fb6ffa072e57a5897df5c2932f19`,
`15c2a7e938cba7579501783ec2e7c2d7811c1849`,
`8e7a0a60ce27bb23b2edb49dfcbdf4d0e4c7ec5a`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** CAP-8 requires public listing provenance, authentic snapshot status and dates,
full history and permission-governed description/version reads. Durable history exists, but
snapshot availability is hardcoded and prepared detail bypasses current source rights.

**Approach:** Complete the existing versioned listing/property detail through Collection-owned
safe lifecycle metadata and current per-source text permissions on every response path.
Preserve immutable original events and corrected dated-value provenance, and prove both granted
and denied reads through the real isolated local stack.

## Boundaries & Constraints

**Always:** CAP-8, architecture privacy rules, accepted ADRs 0011–0013/0015/0018/0019 and
D-020–D-036; English repository content, pnpm/Vitest/explicit pg SQL, inward dependencies,
own-schema SQL and public context barrels. Frozen v1/v2 events and HTTP DTOs stay unchanged.
Each listing retains source/URL/run/snapshot/hash, first/last collection, per-field effective
dates, acquisition count and full history. Current rights govern all text/versions/excerpts in
both detail GETs. D-036 defines denied dates and durable metadata availability.

**Never:** VPS/server/push/deploy/publish, external messages or real-source collection/enablement;
read/search/edit of any `.env*`; permanent outside-repo writes except append-only Portuguese
decisions; AI/provider calls; a raw-content/download endpoint; cross-schema reads from Properties;
weakening synthetic ingestion authority, tests, coverage, lint or hooks; changes to entity
resolution, search, reductions, source catalog, authentication, UI or earlier chronology policy.

## I/O & Edge-Case Matrix

| Scenario                       | Input / State                                                                         | Expected Output / Behavior                                                                                                    | Error Handling                           |
| ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Allow                          | Durable listing, registered text permission                                           | Sanitized current text, corrected versions with authentic acquisition dates/hashes; complete provenance/history               | Normal success                           |
| Deny                           | Rights revoked or missing; persisted or prepared                                      | No current/versions/text/excerpt anywhere in both serialized details; source link, history, sorted unique changedAt preserved | Default-deny                             |
| Restore                        | Denied then allowed in same process and after restart                                 | Stored/prepared permitted text returns without mutation; originally denied sample stays text-free                             | Never invent text                        |
| Rights failure                 | Register persistence throws                                                           | Safe bounded failure without allowed fallback or leaked description                                                           | Propagate safe API failure               |
| Mixed sources                  | Prepared property with several listings                                               | Each listing uses its own current source rights                                                                               | One source never authorizes another      |
| Retained synthetic             | Exact committed observation and raw reference                                         | Available with unlimited retention and null expiry, original IDs/hash/dates                                                   | Missing metadata unavailable             |
| Real generation                | Historical local encrypted fixture before expiry                                      | Available only with committed available non-deleted matching generation; fixed expiry                                         | No key or object location in public view |
| Expiry                         | Clock just before, exactly at and after fixed deadline                                | Available before; expired from boundary even during delayed deletion; hash/provenance remain after restart                    | No resurrection                          |
| Missing/mismatch               | Wrong source/listing/run/snapshot/hash/clock or missing/unconfirmed/deleted reference | No fabricated available state and no foreign reference disclosure                                                             | Fail closed                              |
| Corrected history              | Original A→B event then correction collapses dated versions                           | Corrected permitted versions may collapse; original event stays; denied changedAt still includes original change              | No event rewrite                         |
| Correction/backfill transition | Corrected dated versions differ without a new market event                            | Denied union includes dated transition; authentic field dates remain; no invented event                                       | Preserve D-027/D-028                     |

</intent-contract>

## Code Map

- `packages/application/src/collection/collection.facade.ts` and `index.ts` -- public
  Collection-owned neutral read boundary; currently only permissions/run/hash. Add safe snapshot
  metadata bound to expected provenance, not vendor storage types. Update in-memory facade/fakes
  and exports consistently, preserving event-authority methods.
- `packages/infrastructure/src/collection/postgres-collection.facade.ts` -- owns all Collection
  SQL. Resolve snapshot observation/run/raw snapshot/generation within this schema, checking
  original identity/hash/date and availability. `snapshot-lifecycle.port.ts`,
  `postgres-snapshot-lifecycle.ts`, migrations 4006 onward and ADRs 0018/0019 define trusted fixed
  generations/tombstones. Reuse safe existing clock abstractions and bounded database policy.
- `packages/infrastructure/src/properties/persisted-properties.facade.ts` -- getListing and
  getProperty currently return prepared fallback directly, persisted-only rights check.
  `persisted-property.projection.ts` -- pure dated history/provenance projection currently
  hardcodes snapshot available/null expiry and derives denied dates only from corrected versions.
  Keep business chronology pure; consume neutral metadata through facade orchestration.
- `packages/domain/src/properties/properties.read.types.ts`,
  `packages/contracts/src/properties/properties.read.dto.ts` -- frozen shape already supports
  available/expired/unavailable and allowed/denied description. Keep unchanged unless strictly
  necessary internal validation; no new public fields or version.
- `packages/infrastructure/src/properties/synthetic-properties.adapter.ts`,
  `synthetic-properties.projection.ts` -- prepared mixed-source/denied/expired examples remain
  explicitly prepared. Gate current rights without claiming their illustrative lifecycle is
  durable evidence; do not alter the catalog, source labels, immutable fixture events or search.
- `apps/api/src/properties/properties.module.ts` and `properties.controller.ts` -- actual
  dependency injection and complete DTO validation; use production wiring for HTTP proof.
- `integration/properties-history.integration.mjs`, `properties-ingestion.integration.mjs`,
  `snapshot-lifecycle.integration.mjs`, `properties-contracts.integration.mjs` -- isolated random
  projects, real database/broker/storage, compiled imports, bounded assertions and exact cleanup.
  Reuse patterns, not assertion weakening. Encrypted fixture cannot go through synthetic-only
  ingestion: create truthful historical fixture through each owner repository/API separately.
- `docs/api/properties-and-locations.md`, `package.json` -- reference and dedicated campaign
  registration. No environment example file changes.

## Tasks & Acceptance

**Execution:**

- [x] `packages/application/src/collection/collection.facade.ts`, `index.ts`, existing fake
      facade and their `*.test.ts` -- introduce safe snapshot metadata query accepting expected
      listing provenance. Define identity matching and unavailable/default behavior; keep the
      public HTTP/events frozen and vendor types outside the boundary.
- [x] `packages/infrastructure/src/collection/postgres-collection.facade.ts` and adjacent
      `*.test.ts` -- resolve committed reference metadata in Collection-owned SQL only. Test
      exact ownership/source/listing/run/hash/date, synthetic retention, real fixed expiry at
      the boundary, missing/unconfirmed/deleted references and persistence failures. Use injected
      clock/doubles where needed; no physical storage probe or encryption credentials in API.
- [x] `packages/infrastructure/src/properties/persisted-properties.facade.ts`,
      `persisted-property.projection.ts` and adjacent `*.test.ts` -- apply current rights to
      both persisted and prepared responses, separately per listing, with no in-place mutation
      or granted failure fallback. Resolve persisted snapshot metadata through Collection and
      bind to current dated provenance. D-036 denied dates unite immutable description events
      and corrected dated transitions without duplicates or source-text exposure.
- [x] `integration/listing-provenance.integration.mjs` and `package.json` -- add a dedicated
      bounded real-service campaign. Run genuine permitted synthetic acquisitions, changes and
      reparse through actual storage/outbox/broker/worker/HTTP. Verify exact provenance and both
      detail responses under live revoke/restore and restart, including prepared mixed sources
      and missing-source default denial. Add separately labelled historical encrypted fixture
      using each owner's APIs/repositories, actual MinIO, trusted retention timestamps and
      controllable clock through the real facade/HTTP composition. Prove before/exact/after
      expiry, delayed/interrupted cleanup and fresh pool/API restart; never bypass production
      ingestion authority. Assert no text/contact/object key/ciphertext/key disclosure; cleanup
      only exact campaign-owned resources in finally, preserving unrelated services/data.
- [x] `docs/api/properties-and-locations.md`, epic Notes and this plan -- document durable
      metadata meaning, corrected-version versus immutable-event dates, current-rights coverage,
      synthetic versus encrypted-historical proof, real-source/VPS exclusions and actual evidence.
- [x] Every changed behavior -- write regression first, demonstrate red where a gap is fixed,
      implement minimal production change, rerun unit matrix and real campaigns. Preserve all
      earlier catalog/history/reparse/lifecycle and authority assertions and coverage thresholds.

**Acceptance Criteria:**

- Given authentic collected synthetic listings with differing descriptions, when the actual
  worker projects them and both public detail GETs are read, then source/URL/run/snapshot/hash,
  first/last clocks, count, field dates, corrected text/versions and complete events are exact
  and survive replay/restart.
- Given persisted and prepared listings, when source text rights are revoked, absent, restored
  or fail during lookup, then every public detail applies its own current rights, denied bodies
  contain no description or version text, permitted bodies restore only stored permitted text,
  and failures never grant permission.
- Given an actual encrypted local historical snapshot and the genuine synthetic path, when
  reads straddle the fixed expiry and delayed cleanup/restart, then HTTP snapshot status is
  truthful to committed Collection metadata, expiry never extends, original hashes/provenance
  remain and no credentials/raw contents/object locations leak.
- Given original description changes and parser corrections including collapsed or newly
  differing dated versions, when permission is denied, then sorted unique change dates retain
  both original and corrected-transition evidence while immutable history/events remain byte
  identical and no correction emits a source market event.

## Implementation Notes

- Added a neutral Collection snapshot metadata boundary, exact-provenance own-schema lookup and
  injected clock. Missing, foreign or invalid lifecycle evidence is unavailable; retained synthetic
  references have unlimited retention and real generations keep their original fixed expiry.
- Both public detail paths gate each listing against current source rights without mutating
  prepared objects. Denied dates unite immutable original events with corrected dated transitions;
  no public DTO, event, chronology, search, source catalog or migration changed.
- Regression-first evidence: two lifecycle tests failed on the missing boundary method; three
  detail tests failed on prepared bypass, fabricated availability and the collapsed-change date.
  The implementation made the targeted matrix green. Existing HTTP test doubles were updated
  for the new required boundary method without removing or weakening assertions.
- Dedicated real-service campaign passed on 2026-10-11. Genuine synthetic collection used actual
  storage, durable publication, broker, worker, both HTTP GETs and reparse; verified exact provenance,
  authentic field dates/count/history, corrected collapse/new transitions, revoke/restore,
  acknowledged replay after inbox expiry, prepared mixed/missing rights and process restart.
  The separate disabled historical fixture used sanitizer, encrypted MinIO, each owner's
  repositories and the production HTTP module with a controlled clock. It verified before/exact/
  after expiry, interrupted cleanup and fresh pool/API restart before and after physical deletion.
  Ingestion authority explicitly rejected the historical event. Exact project cleanup succeeded;
  no real source collection/enablement, raw endpoint, push, deployment or VPS action occurred.
- Unit suite: 1,238 tests passed across all eight workspaces. Coverage passed unchanged floors;
  lint, typecheck and build passed. Normal pre-push hook passed secret-history and workspace checks.
  Normal pre-commit safely skipped without staged files; parent-managed finalization remains.
  Changed-file formatting/Markdown and `git diff --check` passed. Global `lint:md` still reports
  1,377 errors confined to ignored generated `_bmad/render` snapshots; excluding those snapshots
  passed all 97 repository Markdown files without changing the lint configuration.
- Earlier real-service regressions passed unchanged: prepared contracts (158 HTTP requests),
  ingestion, encrypted snapshot lifecycle and snapshot reparse. The full history campaign passed
  39 genuine catalog runs, 115 acquisitions and exactly 18 immutable catalog market events,
  including correction ordering, admission races, replay, restart and current privacy. Its chained
  baseline-upgrade campaign passed pending v1 facts, permission/correction gating, immutable
  creation/events/revisions, reverse replay/restart and a new completed run. Both exact projects
  cleaned up successfully. All implementation tasks are complete; independent parent review and
  final ticket/commit handling remain outside this implementation handoff.

## Plan Change Log

## Review Triage Log

### 2026-10-11 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free quick reviewer read the plan, repository rules, full diff,
  lifecycle schemas/ports, projections, dependency wiring and dedicated campaign; final result `[]`.

## Design Notes

Full/high route: estimated 400–700 production/test/campaign lines across more than five files,
including privacy and durable lifecycle. Existing DTOs already express every required outcome.
D-036 is recorded before implementation. Current register errors may fail the request safely,
but must never return permissive prepared fallback. Availability means durable confirmed
reference, not an object-store health probe. The acquisition itself remains auditable after
expiry, and no new raw endpoint is needed. Denied changedAt is not a claim that each corrected
transition is an immutable source event; full history retains that distinction.

## Verification

**Commands:**

- `pnpm run lint` -- unchanged primary lint passes.
- `pnpm run typecheck` -- every workspace passes.
- `pnpm run test` -- all deterministic unit suites pass, no skip/only/todo.
- `pnpm run build` -- fresh compiled imports and all apps pass.
- `pnpm run test:coverage` -- existing coverage floors pass unchanged.
- `pnpm run test:integration:listing-provenance` -- dedicated genuine HTTP/rights/lifecycle proof.
- `pnpm run test:integration:properties` -- prepared contract regression.
- `pnpm run test:integration:properties-ingestion` -- provenance/authentication/sanitation regression.
- `pnpm run test:integration:properties-history` -- full catalog and real baseline upgrade pass.
- `pnpm run test:integration:snapshot-lifecycle` -- encryption/retention/reconciliation regression.
- `pnpm run test:integration:snapshot-reparse` -- retained original/correction evidence regression.
- Exact changed-file Prettier/Markdown, `git diff --check`, normal pre-commit/pre-push hooks --
  pass without staging surprises or weakening; report generated ignored snapshot Markdown
  errors separately if the global Markdown command still fails.

**Independent parent verification (2026-10-11):** Read the complete staged baseline diff,
including all new files. Fresh lint, typecheck, 1,238 unit tests, build and coverage passed;
all eight workspace coverage floors remained unchanged. Every integration command above
passed again: dedicated provenance; 158 prepared-contract HTTP requests; authentic ingestion;
history with 39 runs, 115 acquisitions and 18 immutable catalog events plus the genuine prior
schema upgrade; snapshot lifecycle and reparse. Each isolated campaign cleaned its exact project.
Normal staged pre-commit and the complete pre-push hook both passed; no push was performed.
Changed-file formatting/Markdown and the 97 non-generated repository Markdown files passed.
The global `lint:md` command still reports 1,377 errors, exclusively in ignored generated
`_bmad/render` snapshots; no lint configuration or generated snapshot was changed.

**Matrix test audit:** The verbose targeted invocation ran all four relevant infrastructure
test files: 25 tests passed, none skipped. Allow/Deny/Restore/Rights failure/Mixed sources are
covered by the prepared-source permissions test, existing both-endpoint rights test and real
provenance campaign, including HTTP error redaction. Retained synthetic/Missing or mismatch
are covered by exact committed metadata and publication-only-stub tests. Real generation/Expiry
are covered by confirmed-generation boundary tests and encrypted historical HTTP expiry,
interrupted cleanup and fresh-pool restart assertions. Corrected history/Correction or backfill
transition are covered by the immutable-event/corrected-transition union test and the real
reparse campaign's collapse/new-transition assertions. The same dedicated campaign verifies
exact original provenance, field dates, hashes, immutable history and both detail endpoints.
Every matrix row has an executed passing behavior assertion, not merely a registered test.

## Auto Run Result

**Status:** built. Completed listing provenance and the listing-text rule without changing
public contracts or enabling real collection. The two detail endpoints apply current rights
per listing, preserve original and corrected change dates, and report committed lifecycle
metadata with exact fixed retention. Original immutable events and audit hashes survive expiry.

**Files changed:**

- `packages/application/src/collection/collection.facade.ts` -- neutral metadata port.
- `packages/application/src/collection/index.ts` -- public metadata type exports.
- `packages/infrastructure/src/collection/postgres-collection.facade.ts` --
  own-schema metadata and expiry lookup.
- `packages/infrastructure/src/collection/synthetic-collection.stub.ts` --
  honest unavailable publication-only metadata.
- `packages/infrastructure/src/properties/persisted-properties.facade.ts` --
  current per-listing rights and lifecycle orchestration.
- `packages/infrastructure/src/properties/persisted-property.projection.ts` --
  unavailable default and union of change dates.
- `packages/infrastructure/src/collection/postgres-collection.facade.test.ts` --
  exact binding, missing evidence and expiry tests.
- `packages/infrastructure/src/collection/synthetic-collection.stub.test.ts` --
  publication-only availability regression.
- `packages/infrastructure/src/properties/persisted-properties.facade.test.ts` --
  rights, restoration and corrected-history regressions.
- `packages/infrastructure/src/properties/persisted-property.projection.test.ts` --
  updated boundary doubles with existing assertions preserved.
- `packages/application/src/properties/reconcile-listing-history.service.test.ts` --
  updated complete Collection double.
- `apps/api/src/properties/properties.ingestion.test.ts` -- required metadata double.
- `integration/listing-provenance.integration.mjs` --
  real isolated HTTP/rights/encryption/expiry/recovery campaign.
- `package.json` -- dedicated integration command registration.
- `docs/api/properties-and-locations.md` -- durable metadata and permission reference.
- `_bmad-output/initiative-real-estate-intelligence/epic-properties/epic-properties.md` --
  English D-036 decision mirror.
- This story plan -- intent, implementation and verification record.

**Review outcome:** quick/pinned; 0 findings, 0 patches, 0 deferred items and 0 rejected findings.
Patched entry counts: high 0, medium 0, low 0. Follow-up review recommended: false; no unresolved
review risk was identified. No repair loop or intent-contract amendment was required.

**Verification:** Every listed command passed independently except the separately reported
global generated-snapshot Markdown caveat. The matrix audit passed all 11 rows; targeted tests
passed 25/25 and full unit suites passed 1,238/1,238. Real campaigns covered both public detail
endpoints, original provenance, current permissions, encrypted historical expiry, delayed cleanup,
replay/restart and the genuine previous-schema upgrade. Normal pre-commit/pre-push hooks passed.

**Residual risks:** Snapshot `available` means a committed confirmed reference, not instantaneous
object-store health. Local encrypted historical proof is not authorization for real collection.
Existing ignored generated Markdown lint errors and the non-failing Vite chunk warning remain
unchanged. VPS-dependent stories await the owner's explicit unblock; no VPS, deployment, push,
real-source collection or environment-file access occurred. Final whole-product evaluation remains
part of the overarching initiative, not a claim made by this story.
