---
title: 'Erasure of a suppressed listing'
type: 'feature'
ticket: '12'
created: '2026-10-25'
status: 'built'
baseline_revision: 'ed1332ed304d0a8a6f17e8e5298ae0f97eae3b67'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 1
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Collection permanently suppresses an identity, but Properties retains its listing,
history and evidence, with no suppression consumer. Ticket 3.12/CAP-28 requires erasure,
publication, absent search/details and permanent rejection of subsequent parsed facts.

**Approach:** Consume the existing authenticated suppression through the established inbox,
transaction and outbox model; erase owned copies and recalculate surviving membership atomically.
Reuse Collection authority and the existing suppression integration campaign.

## Boundaries & Constraints

**Always:** Collection authority → Properties identity → resolution guard lock order; own-schema
SQL and public context ports; original lineage and rights for surviving listings; exact frozen
Collection events/read DTOs; synthetic isolated fixtures; acknowledgment after commit.
D-095 authorizes replacing an erased group's anchor with the smallest surviving original UUID,
without splitting its surviving membership. Publish an additive strict Properties suppression
contract containing the cause, removed identity and affected before/after property identities,
with causal counters/surviving states needed to describe the change. It must contain no erased
listing values or provenance. Retain only minimal identity/cause receipt for durable no-op replay.
Erase matching retained Properties outbox copies through platform's owning capability, including
group events containing the listing. Already delivered broker copies are not claimed erased;
permanent authority prevents Properties resurrection. Market's derived erasure remains 4.8.

**Never:** Preserve an evidence-bearing anchor, cascade-delete survivors, fabricate a reversible
ListingRemoved or repricing event, broaden audit exceptions, change fixture bytes or grouping
thresholds, bypass hooks/coverage, add automatic retries/timeouts, inspect `.env*`, deploy or run
parallel heavy loads. Continue publishing `feat/phase-1` when delivery requires publication.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                                                         | Expected Output / Behavior                                                                                           | Error Handling                                            |
| --------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Materialized    | Confirmed suppression with history/corrections                        | Owned listing/evidence and publication copies gone; HTTP search/details omit it; one minimal change                  | Atomic rollback on failure                                |
| Pending/unknown | Confirmed suppression before materialization                          | Pending evidence erased; durable successful no-op to later parsed input                                              | Preserve other identities                                 |
| Replay          | Duplicate, restart, inbox pruning                                     | No duplicate change or resurrection                                                                                  | Receipt survives inbox retention                          |
| Group           | Erase non-anchor, anchor, final member                                | Survivors stay together with recalculated detail/minimum; explicit rekey if needed; final property absent everywhere | No erased evidence in remaining minimum/comparison copies |
| Invalid         | Malformed, wrong-type or unconfirmed suppression; forged parsed input | Refused without writes                                                                                               | Existing bounded failure policy                           |
| Interleaving    | Authorized parsed/history work overlaps erasure; cancellation         | Serial outcome with no retained erased copies, or complete rollback                                                  | Existing lock order, no retry masking                     |

</intent-contract>

## Code Map

- `apps/worker/src/properties/{properties.module.ts,index.ts}`, `apps/worker/src/main.ts`:
  add the suppression consumer alongside `ParsedListingConsumer`; preserve telemetry/startup.
- `packages/application/src/properties/consume-parsed-listing.service.ts`: currently throws
  rejected for false authority; acknowledge only confirmed suppressed identities as ignored.
  Reuse its inbox/transaction pattern for the suppression service and owned repository port.
- `packages/application/src/collection/listing-suppression.port.ts` and public Collection
  exports: `ListingSuppressionAuthority.lockAndCheck`; never read Collection tables directly.
- `packages/infrastructure/src/properties/postgres-property.repository.ts`:
  `lockSourceIdentity`, coherent detail/group reads; `property-resolution-guard.ts` shares
  serialization with history/resolution. Resolver never requests Collection identity locks.
- `migrations/1001_properties_create_initial_properties.sql`, `1002_properties_create_listing_history.sql`,
  `1004_properties_create_entity_resolution.sql`: incoming facts/dispositions, original property,
  listing/current/acquisitions/events/run/correction/original effects, assignments, comparisons,
  property state and minimum effects contain owned evidence. `source_work` is shared: retain it.
- `packages/infrastructure/src/properties/postgres-property-resolution.repository.ts`:
  reuse causal assignment/state/minimum calculations, but `save` assumes nonempty authentic
  states and cannot perform deletion unchanged. Anchor FK to incoming fact requires explicit
  rekey before deletion. Ensure the next normal resolution does not undo survivor continuity.
- `packages/domain/src/properties/{properties.events.ts,properties.events-v2.ts,index.ts}`:
  existing removal is reversible/full-fact; use a separate additive strict privacy event/parser.
- `packages/infrastructure/src/shared/persistence/postgres-outbox.ts`: current eraser only
  deletes Collection parsed copies; add a narrowly scoped Properties-copy owning capability.
- `packages/infrastructure/src/properties/{persisted-properties.facade.ts,postgres-property-search.repository.ts,postgres-property-reductions.repository.ts}`:
  verify current reads and ensure prepared detail fallback cannot expose a suppressed identity.
- `integration/listing-suppression.integration.test.ts`: owns real PG18/RabbitMQ/S3 and actual
  removal command. Extend with Properties consumption and HTTP; relay currently parses only
  Collection events and must use the public generic route when Properties events are present.

## Tasks & Acceptance

**Execution:**

- [x] Domain/public application exports, suppression service/port and focused unit tests —
      implement strict additive change, authenticated idempotency and every matrix failure/no-op.
- [x] Owned Properties adapter, narrowly necessary next migration and platform erasure port —
      lock consistently; erase every matching evidence copy; rekey surviving assignments/state before
      deleting the original property; delete minimum copies referencing either side of erased data;
      preserve unrelated rows and valid surviving causal counters. Receipt must not retain payloads.
- [x] Worker module/consumer/startup and affected parsed admission/read paths — expose the
      real broker entry and acknowledgment-after-commit, deny resurrection and fallback leakage.
- [x] Existing suppression campaign — prove materialized/pending deletion, grouped non-anchor/
      anchor/final-member behavior, current HTTP reads/reductions, delayed delivery, rollback,
      real PostgreSQL interleaving and restart/inbox-pruning idempotency without replacing prior cases.
- [x] Existing ADR 0015/epic Notes/API event documentation — record D-095's precise delivered
      contract and its bounded evidence; no duplicate report or new general audit.

**Acceptance Criteria:**

- Given genuine synthetic collection and persisted Properties history, when the actual removal
  command and worker consume suppression, then search excludes the listing and detail endpoints
  return 404 for the erased listing and zero-member property, with no stored matching evidence.
- Given a grouped property, when an anchor or another listing is erased, then HTTP shows only
  surviving members and their own current provenance/minimum, unrelated properties remain intact,
  and the delivered change truthfully identifies any rekey without erased values.
- Given a committed suppression, when old/new parsed messages arrive after restart and inbox
  pruning, then they are acknowledged as ignored with no data or extra erasure publication;
  unconfirmed/forged input still fails closed.

## Implementation Notes

- The D-095 refinement supersedes the original intent block's survivor-state wording without
  changing that historical block. Group changes contain exactly previous/resulting IDs and strictly
  advancing revisions; the notification contains no survivor snapshots, minimum, values or
  provenance. HTTP retains complete current-state/minimum acceptance. Minimal privacy notifications
  are excluded from derived-payload erasure so a later suppression cannot delete an earlier one.
- Added a separate closed privacy event/parser, canonical Collection suppression confirmation port,
  transaction consumer, permanent minimal receipt and worker subscription/startup. Existing event
  types and read DTOs remain frozen.
- Migration 1005 adds the minimal receipt and an optional survivor matching digest. The digest
  records substantive evidence at erasure, so a correction already committed before suppression
  cannot make the first ordinary resolver scan split the retained survivor set. A later substantive
  matching change releases continuity; price/status/acquisition clocks do not.
- The Properties adapter serializes with history/resolution, deletes either-side minimum and
  comparison evidence, rekeys surviving assignments/state/history before deleting original lineage,
  and uses platform's narrow value-bearing publication erasure capability. Shared source work remains.
- Parsed admission acknowledges confirmed suppressed identities even after inbox pruning. History
  completion and business-refusal effects take the Collection identity lock before Properties
  locks. Prepared detail fallback consults current suppression authority.
- Extended the existing campaign without removing its Collection/storage/audit cases. It now runs
  actual Properties broker consumers, persisted chronology/resolution, production API reads,
  non-anchor/anchor/final and pending erasure, SQL rollback/cancellation, authority-lock interleavings,
  broker restart and pruned-inbox replay. The historical upgrade fixture defers 1005 with its 1004
  prerequisite; historical migration files are unchanged.
- Real PostgreSQL interleavings use the existing removal service at the held canonical-authority
  barrier. Actual removal CLI cases still cover final-member, pending, unknown and recovery paths.
  The two-second lock-observation bound and every production deadline remain unchanged.

## Plan Change Log

- 2026-10-25 — Quick review exposed one publication-model defect with two consequences:
  assignment snapshots can lag committed chronology; erasing a later survivor can delete an
  earlier pending suppression notification containing that survivor. Simplify the new unpublished
  event to permanent minimal identity/cause and group ID/revision transitions only. Remove
  `listingStates` and `minimum` from its strict contract and protect minimal suppression
  notifications from derived-payload erasure. HTTP still proves current survivor values/minimum.
  KEEP owned deletion, group continuity/rekey, canonical authority, receipts, lock order and all
  passing acceptance. The owner's bounded-execution instruction takes precedence over a wholesale
  rollback/re-derivation: correct this model in place, without restarting implementation or audit.
  Restore the unsupported Compose command limit from 240000 to its original 180000; keep every
  existing observation/production deadline. Add focused consecutive-suppression-before-relay and
  history-ahead-of-resolution cases to the established campaign, then run it on the final version.

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` Survivor snapshot can lag committed chronology — the adapter uses
    assignment market facts while the independent history transaction can already advance HTTP
    state. D-095 refinement removes unnecessary value snapshots from the privacy event; current
    HTTP data remains acceptance-tested. Targeted model correction, preserving the working slice.
  - `[high]` `[bad_plan]` Later suppression can erase an earlier pending notification — recursive
    outbox erasure matches the survivor copied in the earlier privacy event; its permanent receipt
    prevents republication. The same minimal-event correction removes copied survivor evidence,
    and minimal notifications are excluded from derived-copy deletion. Prove both notifications
    survive consecutive suppression before relay; no recovery mechanism or new event variant.

### 2026-10-25 — Targeted correction review

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- The same independent reviewer inspected the corrected event/parser, adapter, outbox selection
  and focused native cases against both publication findings. Result: No findings. This was a
  targeted follow-up, preserving the first review and its two high findings; no broad audit reset.
- Both findings share the unnecessary survivor snapshot model. Its removal and the minimal-event
  erasure exclusion resolve them without recovery state or replacement publications. Current HTTP
  state/minimum and the original deletion/group acceptance remain required by the final campaign.

## Design Notes

D-095 chooses canonical surviving IDs over content-bearing anchor retention. This is permanent
privacy erasure, distinct from reversible source absence under D-092. Maintain remaining immutable
lineage and minimum history not containing erased data; do not invent historical price movement.
The full route exceeds 100 lines and spans transactions, events, persistence and worker wiring.

## Verification

The passing results below are historical evidence from before the D-095 minimal-notification
refinement. Unchanged deletion/group/lock/receipt behavior reuses that evidence; they do not
establish the changed event contract, outbox exclusion or new interleaving cases. The unsupported
Compose limit is restored to 180000. Focused correction results and pending final gates follow
after the historical record.

- The final extended suppression campaign passed: one file / one test, 270.31 seconds, owned
  project `rei-listing-suppression-1192999`; production migrations/API, PostgreSQL, RabbitMQ and S3
  were real. It includes all prior Collection/storage/audit cases and the new Properties matrix.
  Teardown removed only owned resources. The refined contract is verified separately below.
- Earlier failed attempts identified fixture migration-ledger ownership, a multi-document page
  passed to the one-document command, CLI/bootstrap timing in the lock probe, and a reconstructed
  envelope missing its mandatory trace context. These were corrected with the production migration
  runner, existing multi-document run service, existing in-process removal service and exact retained
  envelope. A no-argument CLI probe took 1.293 seconds before Nest/database bootstrap; it does not
  establish full command startup time. No observation or production timeout was increased; the
  separate unsupported Compose command timeout increase is corrected by the D-095 refinement.
- The real PostgreSQL anchor case also exposed conflicting UUID/text inference in the historical
  minimum rekey. Consistent UUID casts corrected it; the final campaign passed both rekey and
  injected failure/cancellation rollback after rebuilding infrastructure and the API image.
- Root build and standalone integration typecheck passed before the final SQL cast correction;
  the affected infrastructure build passed afterward. Unchanged package build results are retained.
  Focused application suppression/parsed/history tests passed: 49 tests.
- The populated historical-upgrade regression passed with migration 1005 applied after its 1004
  prerequisite. The ordinary resolution regression passed separately: one file / one test,
  171.45 seconds, owned project `rei-property-resolution-1210316-d129e8eb`, including its existing
  browser, outage and restart cases. An initial browser attempt lacked the documented sandbox
  environment; the successful run used the existing root-owned SUID helper with
  `chromiumSandbox: true` unchanged. This was an executor correction, with no source change.
- Final root lint and root typecheck passed, including forced package compilation and strict
  integration checking. The full required coverage command passed on the final source: eight
  workspaces, 243 test files, 2,850 tests. Every workspace cleared the unchanged 80% lines,
  statements and functions / 75% branches floors. The lowest package was infrastructure:
  84.10% lines, 82.26% statements, 88.51% functions and 76.05% branches. This also supplies final
  unit evidence for the strict parser, corrected API fixture and worker consumer.
- `lefthook run pre-commit --all-files` passed all jobs after correcting two documentation line
  wraps. New untracked TypeScript and plan files passed explicit Prettier/Markdown checks;
  root lint and coverage include the new source. The initially empty Git index was restored after
  the hook's automatic staging, with every working-tree change preserved. No commit was created.

### D-095 minimal-notification correction

- Removed `listingStates` and `minimum` from the event, strict parser and adapter calculation.
  Identity/cause, removed internal IDs/counters and previous/resulting group IDs with advancing
  revisions remain. No deletion, rekey, continuity, lock or permanent receipt behavior changed.
- Excluded `properties.listing.suppressed` from value-bearing outbox-copy deletion. Added focused
  parser/adapter/owning-port checks and native cases for a genuine reparse correction committed to
  chronology ahead of resolution, current HTTP minimum/provenance, and consecutive suppressions
  whose minimal notifications survive before relay and after inbox pruning/replay.
- At the correction handoff the final native suppression campaign and parent gates were pending;
  their completed results follow below. Prior native successes remain historical evidence for
  unchanged behavior only.
- Focused correction verification passed: minimal domain event/parser (one file, two tests),
  Properties erasure adapter and persistence owning-port tests (two files, 29 tests). The affected
  domain build passed as the infrastructure tests' runtime prerequisite. No native campaign,
  whole-workspace unit run, coverage run or broad verification was executed for this correction.

- First refined native attempt reached the new chronology-ahead case and failed its fixture-only
  assertion that a reparse correction advances `listing_current.revision` (both counters were 1).
  `ListingChronology.correct()` replaces corrected acquisition values without advancing original
  acquisition revision, and resolution tracks retained listing-event revisions. HTTP already showed
  the corrected minimum while assignment retained the old price. Replace the invalid counter claim
  with direct original/correction event identity and current corrected-value versus old assignment
  evidence. Product code, acceptance assertions and all deadlines remain unchanged. The next
  native run verifies this corrected setup and the remaining before-relay/replay cases; it is not
  a retry of unchanged conditions. The failed 288.72-second attempt is not acceptance evidence.

- Final corrected-contract root build, root lint and root typecheck passed. The latter forces
  package compilation and checks the corrected native fixture under strict integration TypeScript.
  Final affected coverage reused the unchanged arguments/floors from `scripts/test-coverage.sh`:
  domain 34 files / 673 tests (96.03% lines, 95.04% statements, 100% functions, 90.55% branches);
  infrastructure 50 files / 492 tests (84.13% lines, 82.27% statements, 88.66% functions,
  75.98% branches). Direct application suppression and worker consumer regressions also passed.
  Other workspace source/tests and their relevant dependency behavior are unchanged from the
  recorded complete eight-workspace coverage success; their valid results are reused. Resolution
  grouping/migration code is unchanged by the notification correction, so the recorded resolution
  and populated-upgrade native campaigns are reused. No redundant browser rerun is needed.

- The next native attempt passed that corrected-state proof but rejected the new helper's
  domain-class instance at the strict untrusted wire boundary (`event must be a plain object`,
  78.27 seconds total). Reassessed the entire new minimal-notification segment against the existing
  wire/domain and chronology patterns before another attempt. The helper now retains/returns the
  plain seven-field envelope for initial execution and every replay, matching the earlier passing
  case. An existing-parser probe accepts the reusable wire, rejects its domain instance and accepts
  the SQL JSON timestamp shape. Other new-segment parser results are assertion-only, JSONB state is
  read-only, pg dates are converted to ISO and text-array binding follows the existing pattern.
  No product/parser weakening, timeout change, new diagnostic mechanism or general audit was added.
  The next native run verifies the corrected transport boundary and the pending publication cases.

Run affected unit cases first, then necessary history/resolution/Collection/outbox regressions.
Build before standalone integration typecheck; run the extended existing suppression campaign
once on stabilized code, then only affected regressions justified by dependency changes.
Execute required root lint, typecheck, unit, coverage floors, build and
`lefthook run pre-commit --all-files` sequentially; reuse unchanged browser/production evidence.
Use `CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox` if a browser campaign is required.
One heavy workload at a time on the 8 GiB/2-vCPU shared VPS; preserve landing and production.

## Auto Run Result

Implemented permanent Properties erasure with authenticated Collection authority, atomic owned-data
and retained-publication deletion, survivor rekey/continuity, a durable minimal receipt, strict
identity-only change publication and successful ignored delivery for confirmed suppressed facts.

Changed files by responsibility:

- `apps/api/src/properties/{properties.module.ts,properties.controller.test.ts}` — wire current
  suppression authority into prepared detail fallback and its HTTP fixture.
- `apps/worker/src/{main.ts,properties/index.ts,properties/properties.module.ts}` and
  `properties/listing-suppression.consumer{,.test}.ts` — compose and verify the real broker entry.
- `packages/application/src/collection/{index.ts,listing-suppression.port.ts}` — expose exact
  canonical suppression-event verification through the owning context.
- `packages/application/src/properties/{index.ts,listing-suppression.repository.ts,consume-listing-suppression.service{,.test}.ts,consume-parsed-listing.service{,.test}.ts,reconcile-listing-history.service.ts}`
  — atomic erasure orchestration, confirmed-suppression no-op admission and consistent authority locks.
- `packages/domain/src/properties/{index.ts,listing-suppression.events{,.test}.ts,property-resolution{,.test}.ts}`
  — strict minimal publication and unchanged-evidence survivor continuity.
- `packages/infrastructure/src/collection/postgres-listing-suppression.ts` — authenticate the
  exact canonical cause without cross-context SQL.
- `packages/infrastructure/src/properties/{index.ts,persisted-properties.facade{,.test}.ts,postgres-property-resolution.repository{,.test}.ts,postgres-property-suppression.repository{,.test}.ts}`
  — owned deletion/rekey, continuity persistence and suppression-aware detail fallback.
- `packages/infrastructure/src/shared/persistence/{postgres-outbox.ts,postgres-persistence.test.ts}`
  — narrowly erase value-bearing Properties copies while preserving minimal privacy notifications.
- `migrations/1005_properties_erase_suppressed_listings.sql` — minimal receipt and continuity digest.
- `integration/{listing-suppression.integration.test.ts,properties-history-upgrade.integration.test.ts}`
  — real-service acceptance and the populated historical migration dependency.
- Existing epic Notes, ADR 0015, API documentation, integration guide and this plan — delivered
  contract, decisions, review history and bounded evidence; no separate duplicate report.

Review: the first independent quick pass found two high publication-model defects. One scoped
D-095 simplification removed their shared survivor-snapshot cause. The targeted independent
follow-up returned No findings. Patch-route entries 0; deferred 0; rejected 0. Model repairs 1,
resolving both high findings. Follow-up review recommendation: false; no unverified affected
publication risk remains after the final native run. The two subsequent fixture failures and
contract-based corrections remain recorded above and did not change product behavior or deadlines.

Final product/test revision: `2c2b943abce4767085711922545cbdcc5cb73c3b` on `feat/phase-1`.
Implementation commit: `7624f72cc4663adde09b9d403531b495381cf6b9`.

- Final native command: `pnpm exec vitest run --config vitest.integration.config.ts integration/listing-suppression.integration.test.ts`.
  PASS: one file / one test, 63.28 seconds test / 65.03 seconds total. Observed complete before
  2026-10-26 01:50:53 UTC; Vitest reported local start 22:49:18. PostgreSQL, RabbitMQ, S3,
  migrations, worker consumption and production HTTP were real. Both minimal notifications retain
  their identities before relay and through replay/pruning; HTTP reports the corrected surviving
  minimum/provenance. Existing deletion, anchor/non-anchor/final/pending, rollback/cancellation,
  authority interleaving and restart cases also passed. No fixture containers remain.
- Root build, lint and typecheck PASS; affected coverage and direct consumer regressions PASS as
  recorded above. The final wire-only fixture correction also passed strict integration typecheck
  and edited-file lint/format. Unchanged full-workspace, upgrade and resolution evidence is reused
  with its stated limits. No new source/model calls, deploy or production migration occurred.
- Implementation and test commits passed their normal pre-commit and commit-message hooks.
  `lefthook run pre-commit --all-files` also PASS: all six groups, 44.04 seconds.
  Source/test files are unchanged after the verified revision; final records are documentation only.

Remaining limits: already delivered broker copies are outside local retained-copy erasure; Market
owned derived erasure is story 4.8. Public production acceptance remains its separately tracked
stories and is not claimed here. Documentation-only follow-up commits reuse this exact product/test
revision and do not require repeating product campaigns.
