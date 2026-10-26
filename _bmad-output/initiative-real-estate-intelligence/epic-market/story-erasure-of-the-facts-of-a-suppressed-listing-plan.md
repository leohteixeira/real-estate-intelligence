---
title: 'Erasure of the facts of a suppressed listing'
type: 'feature'
ticket: 8
created: '2026-10-26'
status: done
baseline_revision: '531e80525288415ae81195b380bc3546751f912c'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Market retains suppressed listings in current facts, causal history and copied event
envelopes. Every place figure, including monthly series, must equal its rule without that listing
(4.8, CAP-28); ordinary `properties.listing.removed` must retain history and close time on market.

**Approach:** Reuse authenticated suppression, transactional consumers and the existing Market
projection. Erase copied content, retain minimal permanent replay fences, apply effective group
redirects from the existing minimal Properties notification, and recompute surviving minima.

## Boundaries & Constraints

**Always:** Market-owned SQL only; Collection authority through its public facade; authenticate
before taking the existing Market writer lock. Preserve strict contracts, permanent business
conflict checks, transaction rollback, ack-after-commit, causal state/assignment independence,
global representative selection before geography/area and all freshness rules. Keep independently
materialized survivor facts. Retain no suppressed content in immutable envelopes. Permanent minimal
identity/cause/fingerprint receipts prevent reappearance after inbox expiry or restart. All erasure
exceptions require authenticated owner receipts and matching rows; unrelated immutability survives.

**Never:** Foreign SQL, forged assignment revisions, changed public suppression contracts, blanket
trigger disabling, dropping an entire group instead of processing survivors, synthetic price changes,
new cache/jobs/UI/report layers, weakened tests/hooks/floors, real sources/models or production data
erasure. No `.env*` access. One heavy workload at a time on the shared 8-GB/2-vCPU VPS; preserve
landing and stopped unrelated services. No child commit, push or deploy.

## I/O & Edge-Case Matrix

| Scenario       | Input / State                                                 | Expected Output / Behavior                                          | Error Handling                   |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| Erasure        | Canonical Collection cause after facts/history                | All owned content removed; figures recomputed without listing       | Atomic receipt and inbox         |
| Delivery order | Collection/Properties notifications in either order           | Erasure and group transition both apply                             | No early-return loss             |
| Before facts   | Suppression precedes delayed listing or group events          | Suppressed member never materializes; survivors still advance       | Strict original wire validation  |
| Replay         | Old delivery, pruned inbox, restart or conflicting envelope   | Exact replay inert; conflict remains rejected                       | Permanent non-payload fences     |
| Group member   | Deleted member of preserved group P                           | Survivors retain group and history; next global minimum selected    | No P-to-P redirect               |
| Anchor chain   | Original anchor A deleted, A-to-B then B-to-C in either order | Effective group C; original causal assignments unchanged            | Resolve chains consistently      |
| Empty group    | Original anchor redirects to null                             | No effective old group; later valid survivor assignment can succeed | Do not tombstone survivor        |
| Mixed envelope | Group event embeds erased member and survivors                | No copied erased payload retained; valid survivors projected        | Preserve family/revision fences  |
| Concurrency    | Projection races suppression or failure before commit         | Serial outcome never restores content; failure rolls back           | Shared writer lock; no ack       |
| Lifecycle      | Ordinary removed then reobserved listing                      | History and original time-on-market semantics preserved             | Suppression remains irreversible |

</intent-contract>

## Code Map

- `packages/domain/src/collection/collection.events.ts` — strict closed suppression envelope;
  aggregate ID is suppression ID, payload is stable source/listing identity.
- `packages/application/src/collection/listing-suppression.port.ts` and
  `packages/infrastructure/src/collection/postgres-listing-suppression.ts` — reuse public authority
  and canonical cause verification, never query Collection SQL from Market.
- `packages/application/src/properties/consume-listing-suppression.service.ts`,
  `packages/infrastructure/src/properties/postgres-property-suppression.repository.ts` and
  `migrations/1005_properties_erase_suppressed_listings.sql` — existing authenticated receipt,
  lock order, physical erasure and minimal Properties notification model. Read-only producers.
- `packages/domain/src/properties/listing-suppression.events.ts` — strict v1 notification carries
  cause, stable identity, nullable listing/original property IDs and group revision transitions.
  No survivor assignment counters. Only an erased original anchor can require ID redirect.
- `migrations/2001_market_price_facts.sql`, `2002_market_causal_price_facts.sql` and
  `2003_market_source_completion.sql` — applied migrations; add the next Market migration instead.
  Current rows depend on immutable evidence; delete currents before evidence. Five tables reject
  update/delete; group JSON may embed the target beyond its aggregate ID. Preserve source watermarks.
- `migrations/8002_audit_allow_collected_data_erasure.sql` — receipt/transaction-local deletion
  exception pattern; keep ordinary immutable protections.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` — existing
  `market:price-facts` writer lock, permanent normalized event conflicts, independent causal
  frontiers, minima recomputation and one-MVCC-snapshot read of current membership/history.
- `packages/application/src/market/consume-market-listing.service.ts` and
  `market-price-facts.port.ts` — project-before-inbox deliberately preserves conflict detection.
- `apps/worker/src/market/{market.module,market-listing.consumer,index}.ts` and worker bootstrap —
  existing durable consumer/start/stop/ack wiring; add only suppression dependencies.
- `integration/{listing-suppression,market-price-facts,market-figures,market-median}.integration.test.ts`
  and `integration/support/fixture.ts` — existing real operator, broker, HTTP, rollback, replay,
  ordering and golden rules; extend these rather than create another harness.
- `integration/web-place.integration.test.ts` — final PT/EN at 390/960/1440 using real owned
  services. Add actual suppression after ordinary fixtures or isolate its identity so later cases
  remain valid. Existing Place components already render returned figures; no new UI justified.

## Tasks & Acceptance

**Execution:**

- [x] `migrations/2004_market_erase_suppressed_listings.sql` — add minimal permanent suppression,
      erased-envelope fences and anchor redirects, with narrowly guarded content deletion.
- [x] `packages/application/src/market/` — add suppression port/service exports that authenticate
      Collection and Properties causes and atomically coordinate erasure, inbox and group transitions.
- [x] `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` — erase all copied
      listing content, screen future embedded identities, preserve survivor state/frontiers and
      original conflict checks, resolve effective group redirects and recompute minima atomically.
- [x] `apps/worker/src/market/` and worker bootstrap — wire strict durable suppression consumers
      through existing public facades, startup, graceful stop and ack-after-commit mechanisms.
- [x] Adjacent `*.test.ts` for changed application/infrastructure/worker paths — verify matrix
      edges and failure behavior without mirroring implementation or replacing real-service proof.
- [x] `integration/listing-suppression.integration.test.ts` and affected Market campaigns — prove
      retention erasure, immutable guards, real delivery/replay/order and hand-computed public figures.
- [x] `integration/web-place.integration.test.ts` — observe actual post-erasure overview, registered
      neighbours and twelve-point own/parent series in all six locale/viewport cases.
- [x] `docs/api/market.md`, `docs/testing/integration.md`, `specs/adrs/0015-handling-of-collected-data.md`,
      `specs/adrs/0021-event-fed-market-median.md`, existing epic Notes and this plan — record D-099,
      exact evidence, limits and recovery; no duplicate report. Parent owns final ticket/commit closure.

**Acceptance Criteria:**

- Given synthetic listings spanning own, actual parent and registered neighbours with retained
  twelve-month history, when the real operator suppresses one listing and events settle, then all
  public overview figures/counts/provenance, neighbour rows and twelve own/parent monthly points
  equal the documented rules evaluated without that listing, including next-cheapest fallback.
- Given suppressed content in legacy and causal envelopes, when deletion commits and old events
  replay after inbox expiry/restart, then owned storage contains no copied price/location/source
  content of the target and public reads never restore it; unrelated immutable evidence rejects
  ordinary update/delete and conflicting business envelopes still fail.
- Given anchor, member, last-member and consecutive-anchor suppression, when notifications and
  delayed mixed-member events arrive in adversarial orders, then survivors converge to their
  correct effective group, preserve their causal history and accept later valid assignments.
- Given a failed or concurrent suppression delivery, when processing settles, then either the
  full transaction rolls back without ack or the complete erasure commits without resurrection.
- Given the final stabilized implementation, when required local gates and independent targeted
  review finish, then mandatory assertions, coverage floors, hooks and all six real browser cases
  pass for the recorded code identity; no unobserved production result is claimed.

## Implementation Notes

- Migration 2004 preserves only permanent stable identity/cause, erased listing IDs, normalized
  SHA-256 event/fact fingerprints and erased-anchor redirects. Each has an existing invariant:
  stable identities screen future content; listing IDs cover assignment-only references; event
  fingerprints preserve event-ID/family/revision conflicts; state/assignment fingerprints preserve
  independent causal conflicts across copied group events; notification fingerprints prevent
  replay from changing transitions; redirects retain the original causal counters and IDs.
- Both closed notification types authenticate their reconstructed canonical Collection cause
  through `PostgresListingSuppression` before the existing Market writer lock. The existing
  trusted Properties notification supplies its transitions. No foreign SQL, new producer
  authority, changed public contract, survivor revision synthesis or new UI was necessary.
- Erasure deletes current references before guarded immutable evidence, fingerprints every
  copied envelope containing the identity or listing UUID, preserves separately materialized
  survivors, and recomputes global minima. New mixed envelopes are strictly parsed before
  screening erased members and projecting surviving state/assignments. Reads translate effective
  membership in their existing single MVCC snapshot; source-completion watermarks are untouched.
- New application and worker consumers reuse transactions, the public Collection authority,
  durable subscriptions, inbox and broker shutdown/ack behavior. Exact redelivery still reaches
  the repository so a Collection-first receipt cannot swallow a later Properties transition.
- The existing owned suppression campaign now exercises the Market matrix through actual
  operator commands, PostgreSQL, broker and HTTP. Its public golden fixture spans a containing
  place, its actual parent and a registered neighbour with 400-day retained history. Existing
  browser campaign adds actual operator suppression after all ordinary fixtures and checks
  all six PT/EN 390/960/1440 cases; no product frontend source changed.

## Plan Change Log

- 2026-10-26: Rejected an additional read-only Properties publication authority after checking
  the smallest accepted model. Canonical Collection cause verification plus the trusted existing
  Properties contract leaves no demonstrated authenticity gap in this story. Requiring a retained
  outbox publication would reject a valid first delayed delivery after retention. The proposed
  authority was removed before final runtime verification; permanent Market receipt/fingerprint
  checks preserve exact and conflicting replay after retention. This is an implementation
  simplification consistent with the accepted plan, with no public contract divergence.
- 2026-10-26: Kept new real-service assertions inside the existing suppression campaign via a
  support helper. Added both anchor-chain orders, a first delayed notification after publication
  pruning and all five unrelated immutable-table guards explicitly to close matrix coverage.

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 1 findings — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Suppressed-state screening bypassed retained stable identity validation —
    a new valid envelope could claim a survivor UUID under a suppressed source identity,
    commit a poisoned erasure mapping and erase that survivor on suppression replay.
    Verified the projection branch, transaction callers and UUID-based erasure selection.
    Moved the existing retained identity check before both suppression branches; no new state,
    public surface or mechanism. Two focused identity-field cases pass; the existing real-service
    campaign now checks rollback, no poisoned receipt/inbox, survivor progress and safe replay.

### 2026-10-26 — Targeted correction check

The same independent reviewer inspected only the identity ordering correction and its regressions.
The original bypass is closed: retained and erased mappings reject before suppressed identity
insertion or state skipping. No remaining demonstrated defect was found. This was inspection only,
not another broad search or execution of gates. Historical review count: one broad quick pass and
one targeted correction check; the review ceiling was not reset.

## Design Notes

D-099 (agent, on the owner's behalf, 2026-10-26): retain causal IDs/revisions exactly as received;
only afterward translate effective group membership through permanent erased-anchor redirects.
Record a redirect only when `previousPropertyId === originalPropertyId` and destination differs
or is null. P-to-P changes never redirect. Resolve chains in projection, minimum recomputation and
snapshot history reads. Null ends an association, not the survivor. Preserve minimal normalized
fingerprints by event ID and family/aggregate/revision when erasing full envelopes. Strict-validate
future mixed envelopes before screening the erased member; keep survivor progress and conflicts.
Collection-first must not discard a later Properties transition. No public contract extension is
needed. Risk raised from medium to high because irreversible content erasure intersects permanent
replay guarantees and causal group membership. Full route exceeds 100 lines and five files.

## Verification

Read workspace/repository AGENTS first; apply `nestjs-modular-monolith` and its relevant
architecture, communication, isolation and testing references before backend changes, and
`documentation-writer` before explanatory docs. Repository explicit SQL, pnpm, Vitest and public
facades prevail over generic skill examples. This is an implementation handoff from an active
BMad invocation: do not render or restart BMad, create a new goal or close the ticket.
The host's three application-only prepublication dependencies remain stopped intentionally;
owned development fixtures are available. Do not restart host services for local verification.
Notify the parent before heavy work; the parent will keep other heavy workloads idle.

Run affected unit scenarios first. On final stabilized code, run sequential workspace build,
typecheck (including integration), lint and required coverage with unchanged floors. Execute real
suppression plus necessary Market price-facts/figures/median regressions with existing owned
fixtures; run each heavy campaign alone, never the unrelated complete integration inventory.
Finish with the complete six-case `test:integration:web-place` campaign including actual erasure.
Reuse valid unchanged dependency/prepared-contract/UI evidence when identity permits; never repeat
product gates for documentation. Record exact commands, results, runtime identity and bounded
limits here. A repeated failure class requires cause/model reassessment before another attempt.
Parent audits the full diff/matrix, obtains the workflow's independent quick review, then commits
runtime, tests and records separately using normal hooks before marking the story done.

### Observed execution evidence (2026-10-26)

- Runtime baseline: Node.js 24.19.0, pnpm 11.22.0; PostgreSQL/RabbitMQ/S3-compatible storage run
  only in disposable Compose-owned synthetic fixtures. Baseline revision is recorded above;
  implementation is uncommitted. Heavy workloads run sequentially in the parent's exclusive slot.
- `pnpm --filter @rei/application typecheck` — passed.
- `pnpm --filter @rei/application exec vitest run --dir src src/market/consume-market-suppression.service.test.ts`
  — 13 tests passed: strict parsing, cause authentication/order, inbox replay, cancellation/failure.
- `pnpm --filter @rei/infrastructure typecheck` — passed.
- `pnpm --filter @rei/infrastructure exec vitest run --dir src src/market/market-price-facts.pg-repository.test.ts`
  — 17 tests passed, including the original 12 and erasure/fences/redirect/conflict additions.
- `pnpm --filter @rei/worker exec vitest run --dir src src/market/market-suppression.consumer.test.ts`
  — 1 test passed: both durable event types, awaited commit and rejection propagation.
- `pnpm run build` — all eight workspaces passed. Existing web chunk-size warning remains;
  product UI code is unchanged.
- Initial `pnpm run typecheck` passed every workspace and rejected a new integration fixture's
  missing required `traceContext`; fixed the fixture, then `pnpm run typecheck:integration` passed.
- First `pnpm exec vitest run --config vitest.integration.config.ts integration/listing-suppression.integration.test.ts`
  — failed after 228.47s at the final ordinary reappearance fixture's strict domain parser:
  `effectiveAt` had changed but active provenance `observedAt` had not. All prior Market erasure,
  public golden figures, history, mixed-envelope, retention replay, rollback, member/reverse-chain
  and null reassignment assertions had passed. This was fixture construction failure, not product
  acceptance evidence for the unexecuted tail. Reassessed the strict-envelope fixture class, moved
  original/lifecycle construction before first DB mutation and corrected provenance. A disposable
  public-constructor preflight passed 1/1; integration typecheck passed again. The preflight test
  was removed afterward; it is not a parallel harness or retained redundant test.
- Corrected suppression command above — **passed 1/1, 80.99s**. Complete matrix now observed:
  legacy/causal payload removal; failure-before-commit rollback; concurrent late projection;
  next-cheapest global survivor and own/actual-parent/neighbour figures; 12 own/parent month points;
  strict mixed envelope with survivors; exact and conflicting replay after inbox/publication
  pruning with fresh service instances; first delayed notification after publication pruning;
  all five unrelated immutable UPDATE/DELETE guards; P-to-P member preservation; chains in both
  notification orders; suppression before facts; null association then valid reassignment;
  ordinary removed/reappeared history; real durable broker delivery and committed inbox.
- Market regression command:

  ```bash
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/market-price-facts.integration.test.ts \
    integration/market-figures.integration.test.ts \
    integration/market-median.integration.test.ts
  ```

  **3/3 files/tests passed, 305.99s**, with serial files/one worker. Existing price-facts
  campaign includes actual worker restart; all fixtures were removed. Suppression-specific replay
  used fresh service/repository instances and PostgreSQL-persisted fences; startup has no
  process-local suppression authority/cache and does not reset permanent state. These are distinct
  observations; no actual process restart after suppression is claimed.

- Final `pnpm run build && pnpm run typecheck && pnpm run lint` — **passed** for the stabilized
  implementation, including integration typecheck, ESLint, context boundaries and migration
  conventions. Existing web chunk warning only. The second build/typecheck was already running
  when the parent requested reuse of unchanged earlier runtime evidence; it was allowed to finish
  and will not be repeated for documentation-only changes.
- Runtime identity: SHA-256 of the ordered `sha256sum` manifest for migration 2004, application
  suppression service/port/market index, Market PostgreSQL repository, worker suppression consumer,
  Market module/index and worker main is
  `8afda2fe48164d97914a7f2abe1b78955516ac6793a1125d673a850e73eefb71`.
  Runtime/config/dependencies have not changed between the first passing build and final gates.
- `pnpm run test:coverage` — **passed all 8 workspaces, 250 files, 2,972 tests** with unchanged
  80% lines/statements/functions and 75% branches thresholds. Expected fault-injection log messages
  occurred within passing tests. Workspace percentages (statements/branches/functions/lines):

  | Workspace      | Statements | Branches | Functions | Lines |
  | -------------- | ---------- | -------- | --------- | ----- |
  | contracts      | 91.87      | 91.63    | 93.57     | 93.53 |
  | domain         | 95.42      | 91.03    | 100       | 96.30 |
  | ai             | 94.18      | 88.74    | 91.90     | 96.30 |
  | web            | 95.97      | 91.10    | 96.54     | 97.19 |
  | application    | 91.36      | 90.41    | 95.52     | 92.64 |
  | infrastructure | 82.66      | 76.46    | 88.86     | 84.47 |
  | api            | 94.30      | 85.52    | 97.61     | 95.47 |
  | worker         | 93.50      | 83.30    | 90.54     | 94.85 |

  Changed Market PostgreSQL repository: 97.63/95.04/100/98.56.

- Initial `pnpm run test:integration:web-place` — executor failure before any browser case,
  120.65s, Chromium sandbox launch SIGABRT. `CHROME_DEVEL_SANDBOX` was unset in the launcher;
  the bundled Playwright helper is vscode-owned mode 0755, while the existing documented helper
  `/usr/local/sbin/chrome-devel-sandbox` is root-owned mode 4755. No product assertion ran.
  Reused the existing documented Dev Container model rather than changing sandbox requirements:
  focused page-launch preflight with the exact campaign flags, `chromiumSandbox: true`, and
  `CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox` passed (Chromium 156.0.8078.4,
  page title verified, normal close). Full retry uses that explicit launcher environment;
  no test assertion or product code changed.
- `pnpm exec markdownlint-cli2 --no-globs` on the six changed Markdown files — passed after
  wrapping one overlong verification command; no runtime gates repeated for this record edit.
- Final browser retry command:

  ```bash
  CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox \
    pnpm run test:integration:web-place
  ```

  **Passed 1/1 file/test, 393.36s total (389.74s test).** Existing ordinary acquisition,
  proxy, recovery, history and locale flows passed before the actual operator suppressed
  `synthetic-data/SYN-SP-0001`. All six suppression cases passed:

  | Width | PT-BR  | EN     |
  | ----- | ------ | ------ |
  | 390   | passed | passed |
  | 960   | passed | passed |
  | 1440  | passed | passed |

  Each case checked real overview figures/counts/provenance, actual parent, unchanged registered
  neighbour median/movement, all twelve own/parent monthly values/counts/provenance, localized
  rendered unavailable values, native history disclosure and accessibility. Six full-page captures
  are retained under ignored `apps/web/.impeccable/review/place-suppressed-{width}-{locale}.png`.
  Visually inspected 390 EN and 1440 PT-BR captures: zero counts/unavailable own+parent figures,
  twelve unavailable monthly rows and surviving Vila Mariana neighbour are visible without
  overlap. Sandbox requirements, campaign limits, assertions and product UI remained unchanged.

- Changed-file `pnpm exec prettier --check` — passed. Final six-file Markdown lint and
  `git diff --check` — passed. Final `docker ps` showed no running fixture containers;
  disposable services/volumes were removed by campaign cleanup.
- Child implementation and required product verification are complete. Parent retains final
  independent targeted review, normal commit hooks and ticket closure; no child commit/push/deploy,
  production erasure or unobserved production result is claimed.

- Parent acceptance audit: read the complete 2,176-line implementation diff and matched all ten
  matrix rows to the passing suppression/Market/browser assertions. Inspection confirms no
  process-local suppression authority or startup reset; replay proof and separate worker restart
  observation retain the limits stated above. Required runtime and test files have not changed.

- Review correction: repository unit file passed **19/19** and integration typecheck passed after
  the three-file retained-identity ordering patch. The prior final gates describe the earlier
  runtime identity; final affected verification follows on the corrected stabilized version.
  The root `core` file was identified by owner/size/timestamps as the initial Chromium abort's
  dump and removed without reading its payload; no other untracked resource was removed.

- Corrected stabilized code: `pnpm run build`, `pnpm run typecheck` and `pnpm run lint` passed.
  The repeat is required by the runtime identity-ordering correction, not by documentation edits.
  Existing unaffected acceptance evidence is preserved. Runtime plus test identity is SHA-256
  `fdf8095781797879ada1c60d51f5f29554e66a0c6a39cdcbdaef6f92cf116e3e`, over the sorted 15 changed
  runtime/migration/test paths; each contributes UTF-8 path, NUL, decimal byte length, NUL and bytes.

- Corrected-code real suppression campaign — **passed 1/1, 249.85s** (246.95s test). This
  includes the added retained-survivor identity attack: rejection leaves no event/fence/inbox
  residue, the next valid survivor state succeeds, and suppression replay preserves its snapshot.
  All prior matrix, public golden, retention, immutability and lifecycle assertions also passed.

- Corrected-code Market regression command — **2/3 passed, 305.77s**; price-facts and figures
  passed and remain valid. Median failed at its one-shot lookup of v1 price-change evidence after
  a generic changed-median poll. Inspection established the executor gap: independently delivered
  v2 property snapshots can update the same median before the v1 listing envelope arrives; a
  numeric change is not evidence of that envelope's persistence. The fixture was cleaned normally.
- Narrow executor correction in `integration/market-median.integration.test.ts`: use existing
  `vi.waitFor` with unchanged 30s/100ms budget to observe the exact synthetic source/listing and
  expected 80,000,000 minor-unit price-change evidence, then retain the HTTP median-change poll
  and strict original envelope assertions. No retry, timeout increase or product change. Integration
  typecheck and changed-file Prettier passed. Only this failed campaign will run again, to verify
  the repaired causal synchronization; both passing regression results are reused.
- Final runtime plus test fingerprint, including that test-only correction, is
  `84ab49d57f1d72d5fc1e891078ad29a9026918ed3b395c83a7aaff4e8c646d00` using the same byte algorithm
  over the now 16 paths. The runtime itself
  remains unchanged from the passing corrected suppression/price-facts/figures campaigns.

- Median campaign with corrected causal synchronization — **passed 1/1, 53.26s** (52.14s test).
  The two already-passing corrected-runtime price-facts/figures regressions were reused.
- Final `pnpm run test:coverage` — **passed all 8 workspaces, 250 files, 2,974 tests**, retaining
  unchanged 80% statements/functions/lines and 75% branches floors. Counts in dependency order:
  contracts 276, domain 697, AI 212, web 549, application 292, infrastructure 501, API 205,
  worker 242.

  Coverage percentages match the earlier table except infrastructure branches now 76.49%;
  infrastructure statements/functions/lines remain 82.66/88.86/84.47. This final run includes both
  added retained-identity regressions. Expected fault-injection logs occur only in passing tests.

- Final browser attempt on corrected runtime — **failed 1/1, 296.62s** (294.92s test),
  at the existing alias-navigation assertion: five expected catalogue links remained zero within
  its poll. Three ordinary visual cases had completed; suppression cases were not reached and
  are not accepted from this run. Sandbox launch succeeded; fixtures cleaned normally.
- Reassessed the repeated executor synchronization class before another attempt. The known-place
  detail/median and the navigation catalogue are independent queries; the latter serially walks
  validated hierarchy roots/children and publishes all neighborhood links together. A heading is
  not its readiness signal. The same campaign already awaits native catalogue-link visibility
  for its long-name case. Controlled fault helpers restore their exact intercepts in `finally`;
  no global Places throttle was found in the affected API path. Cleanup prevents recovering the
  exact last failed request, so no VPS or product fault is claimed from this observation alone.
  The demonstrated test-model gap is scoped to two existing catalogue-count assertions; reuse
  the existing catalogue readiness model instead of another arbitrary delay or broader audit.

- Catalogue executor correction: reused the exact native first-link visible wait already present
  in the campaign before its two five-link assertions. All heading, count, destination and current
  link assertions remain unchanged, as do every timeout and retry setting. No helper, diagnostic
  or product change. The existing Playwright readiness boundary is distinct from Vitest's short
  exact-count assertion; it now observes the dependency actually being checked. Integration
  typecheck and changed-file Prettier passed. Final full browser campaign runs under that changed
  condition; no unchanged runtime/coverage/Market gate is repeated for this test-only edit.
- Final delivered runtime plus test fingerprint is
  `2ee40f10434453ea193a00748db915d8d8ac5729255da3d8e441b1177936e6db`
  using the same byte algorithm over 16 paths. Both subsequent changes affected only integration
  test synchronization; the corrected runtime remains the one verified by all final product gates.

- Final browser campaign after the catalogue readiness correction — **passed 1/1, 443.43s**
  (440.52s test), including all six localized viewport suppression cases and existing navigation,
  accessibility and public figure assertions. No product code changed during this campaign.
  This closes the final verification gap; earlier failed attempts retain their recorded limits.

## Auto Run Result

Implemented irreversible Market-owned suppression through the existing authenticated transaction
and durable transport. All figures and retained monthly populations exclude erased listings;
ordinary reversible listing removal retains its history. Independent survivor facts and permanent
identity/event/causal conflicts remain protected without retaining suppressed envelope content.

Files changed (paths relative to repository root):

- `apps/worker/src/main.ts`
  Start the suppression subscriber through existing worker lifecycle.
- `apps/worker/src/market/index.ts`
  Export the suppression consumer.
- `apps/worker/src/market/market-suppression.consumer.ts`
  Subscribe durably to both strict suppression contracts and await commit.
- `apps/worker/src/market/market.module.ts`
  Compose the authenticated suppression service with existing adapters.
- `migrations/2004_market_erase_suppressed_listings.sql`
  Add minimal permanent fences, anchor redirects and guarded erasure.
- `packages/application/src/market/consume-market-suppression.service.ts`
  Authenticate causes before Market locking and coordinate one transaction.
- `packages/application/src/market/index.ts`
  Expose the new Market suppression capability.
- `packages/application/src/market/market-suppression.port.ts`
  Define the transaction-scoped erasure port.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts`
  Erase copied content, fence replay and preserve effective survivor membership.
- `apps/worker/src/market/market-suppression.consumer.test.ts`
  Verify subscription, commit waiting and transport rejection.
- `packages/application/src/market/consume-market-suppression.service.test.ts`
  Verify authentication, order, rollback and cancellation.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.test.ts`
  Verify fences, survivor identity conflicts and transactional erasure.
- `integration/listing-suppression.integration.test.ts`
  Invoke the Market matrix in the existing owned operator campaign.
- `integration/support/market-suppression.ts`
  Exercise real-service erasure, replay, groups, public figures and rollback.
- `integration/market-median.integration.test.ts`
  Await the exact modified-acquisition evidence before its HTTP effect.
- `integration/web-place.integration.test.ts`
  Observe actual suppression in all six localized browser cases.
- `docs/api/market.md`
  Document erasure and public figure semantics.
- `docs/testing/integration.md`
  Document existing campaign coverage and observation limits.
- `specs/adrs/0015-handling-of-collected-data.md`
  Extend owned-data erasure guarantees to Market.
- `specs/adrs/0021-event-fed-market-median.md`
  Record minimal replay fences and effective group membership.
- `_bmad-output/initiative-real-estate-intelligence/epic-market/epic-market.md`
  Record the accepted D-099 integration.
- `_bmad-output/initiative-real-estate-intelligence/epic-market/story-erasure-of-the-facts-of-a-suppressed-listing-plan.md`
  Retain acceptance, review, execution evidence and delivery status.

Review: one high finding patched by moving an existing identity check; zero deferred and zero
rejected findings. The same independent reviewer completed a targeted check of that correction
and found no remaining demonstrated defect. Patched counts: high 1, medium 0, low 0. The high
finding warranted follow-up, which has now been performed; no further unverified correction risk
remains. `followup_review_recommended` is therefore false. No new broad audit was started.

Verification: the focused corrected repository tests (19/19), final build/typecheck/lint,
suppression campaign, all three Market regressions and final eight-workspace coverage passed.
The median fixture's demonstrated causal synchronization defect was repaired within its existing
wait budget and only that failed campaign was repeated. Earlier valid observations remain intact.
The final browser campaign passed all six localized viewport cases after observing catalogue
readiness through its existing native wait. All acceptance and applicable verification gates
are satisfied; status is built.

Residual limits: all destructive effects were confined to owned synthetic fixtures. Production
publication and production-specific acceptance belong to their existing subsequent stories.
Suppression-specific replay and the distinct worker restart observation retain their explicit
bounds recorded above; no unobserved production or post-erasure process restart is claimed.
