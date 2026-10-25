---
title: 'Explainable entity resolution'
type: 'feature'
ticket: 6
created: '2026-10-25'
status: 'built'
baseline_revision: 'f4b33b71ca9bf57ad04b617e19bfe98cd2c42b7a'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/AGENTS.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Persisted listings still form separate one-listing properties. CAP-4 requires
deterministic, explainable identity decisions with stored probability and reason evidence,
versioned configuration and the fixed automatic/review/separate bands.

**Approach:** Score authenticated current listing evidence, retain immutable acquisition lineage
and store current membership separately. Reuse the history worker cycle, transaction/outbox,
causal property events and detail projections; preserve unrelated completed work.

## Boundaries & Constraints

**Always:** D-092 and prior Properties decisions apply. Merge at probability >=0.90, queue
review from 0.50 to below 0.90, otherwise keep separate. Store configuration, inputs and safe
per-reason evidence; unchanged inputs are idempotent. Preserve original facts, all eighteen
catalog listing events, canonical/date ordering, corrections without fabricated repricing,
activity intervals, individual rights/snapshot provenance and context-owned SQL. Production
remains independent of the Dev Container; use one heavy development task at a time.

**Never:** Runtime fixture labels as an identity oracle; source-neighborhood repair; invented
coordinates; models, real sources, photos, new broker, public mutation endpoint or general
audit. Do not implement full search (3.8), the remaining detail scope (3.9), calibration (3.7)
or derived suppression erasure (3.12). No `.env*` access, weakened gates, timeout inflation,
automatic retries, production operations or unrelated changes during this local story.

## I/O & Edge-Case Matrix

| Scenario            | Input / State                                                         | Expected Output / Behavior                                                             | Error Handling                                                       |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Bands               | Final probabilities below/exactly 0.50 and below/exactly 0.90         | Separate / durable review event / automatic merge; boundaries exact                    | Invalid nonfinite/configuration inputs refuse before writes          |
| Evidence            | Area, bedrooms, differing descriptions and comparable fingerprints    | D-092 score, safe structured reasons, raw/final score and configuration version        | Missing reason explicitly unavailable; no invented agreement         |
| Coordinates         | Current public source contract has no property coordinates            | Unavailable, zero contribution, available denominator only                             | Never substitute reference centroids                                 |
| Weak coverage       | Too little comparable evidence, or empty description/images           | Base coverage below 0.75 caps final at 0.89; no data scores zero                       | No division by zero or identical-empty agreement                     |
| Compatibility       | Different city/state/street/type, same generic image and attributes   | Final zero with retained incompatibility evidence; separate                            | Normalize via existing public Locations helpers                      |
| Source disagreement | COB-BV-001 says Vila Mariana / Rua Cenário Um                         | Group with genuine matching peers; preserve published neighborhood                     | Do not inspect labels/fingerprint substrings                         |
| Group integrity     | A-B and B-C pass but A-C fails                                        | Deterministic complete-link groups, never an incompatible transitive group             | Stable ordering and survivor IDs                                     |
| Updates             | New original, valid correction, removal/reappearance                  | Re-evaluate substantive evidence; split when required; absence alone retains identity  | Corrected matching inputs never replace emitted market facts         |
| Persistence         | Old immutable 1:1 records, restart, concurrent history/resolvers      | Original lineage unchanged; current association and evidence recover atomically        | Rollback leaves no partial assignment/event; bounded cancellation    |
| Causality           | Merge/split, later price/status events, reverse delivery and replay   | Existing v2 assignment counters and genuine listing revisions converge in Market       | Never change non-assignment values under an emitted listing revision |
| Reads               | Grouped details, member listing IDs and old property IDs              | Correct members, selected requested listing, active minimum, individual history/rights | Missing/unavailable dependencies retain current fail-closed behavior |
| Reductions          | Nonminimum change, genuine minimum change, removal/return, later rise | One row per current property and authentic negative minimum effect                     | No correction/association-only fabricated market reduction           |

</intent-contract>

## Code Map

- `packages/domain/src/properties/{property.entity,listing/listing-chronology,listing/normalized-listing.vo}.ts`
  preserve immutable identity/chronology. New flat `property-resolution.ts` owns D-092 pure
  scoring/grouping/configuration and safe evidence, with adjacent units and public exports.
- `packages/domain/src/collection/image-fingerprint.ts` already provides dHash similarity;
  `packages/domain/src/locations/published-address.ts` exports `normalizePlaceName` and
  `normalizeStreetName`. Import other contexts only through their public index.
- `packages/infrastructure/src/collection/synthetic-sao-paulo.dataset.ts` has the runtime
  nine-listing evidence; `packages/domain/src/collection/synthetic-sao-paulo.match-labels.ts`
  supplies test-only exhaustive pair labels. Five positives include a three-member Bela Vista
  property. Aurora Pinheiros shares a generic image/description with Bela Vista but differs in
  street. COB-BV-001 is the intentional neighborhood disagreement. Keep every fixture byte.
- `migrations/1001_properties_create_initial_properties.sql` has immutable `listing.property_id`
  uniqueness; never UPDATE/drop this original relationship. Migration 1002 owns chronology;
  1003 accepts perceptual facts. Use new `1004_properties_create_entity_resolution.sql` for
  necessary assignment/evidence/event-minimum state and constraints in Properties only.
- `packages/application/src/properties/reconcile-listing-history.service.ts` commits
  authenticated completed-run, legacy and correction effects. `postgres-property.repository.ts`
  creation and `postgres-listing-history.repository.ts` mutation are the relevant concurrency
  boundary. Share a short Properties resolution guard with writes; resolver never acquires
  source-identity locks after this guard. It must see a coherent committed snapshot, not merely
  serialize other resolvers. Preserve original source admission/evidence locking and deadlines.
- New `packages/application/src/properties/{property-resolution.repository,reconcile-property-resolution.service}.ts`
  and an in-memory fake provide framework-neutral orchestration/transaction tests. New
  `packages/infrastructure/src/properties/postgres-property-resolution.repository.ts` owns SQL,
  consistent snapshot, persisted current membership, safe pair evidence and publication state.
  Reuse existing transaction, UUID and outbox ports; no new transport or reporting layer.
- `apps/worker/src/properties/{listing-history.job,properties.module}.ts` already owns bounded
  nonoverlapping scheduling, cancellation and telemetry. Run resolution after history using the
  same lifecycle; persisted rescan recovers a crash after a history commit. Unchanged scans
  emit nothing. Work must be explicitly bounded without silently truncating a property/group.
- `properties.events-v2.ts` already validates causal merge/split and minimum-change payloads;
  `properties.events.ts` retains v1 listing facts. Add only the missing strict
  `properties.match.queued-for-review` contract/export. Its payload needs IDs/configuration,
  probability and safe reasons, never description text, image strings or storage keys.
- `packages/infrastructure/src/properties/postgres-listing-history.repository.ts` retains real
  emitted listing events in `properties.listing_event`. Use those immutable facts/revisions
  for causal property event snapshots, applying current assignment separately. Matching uses
  corrected current acquisitions. Do not reconstruct corrected values under an old revision.
- `packages/infrastructure/src/market/market-price-facts.pg-repository.ts` already excludes
  propertyId from listing-state evidence and advances assignment revision independently. Later
  unchanged v1 listing events at assignment revision zero must preserve the higher current
  assignment while advancing actual price/status revision. Prove this before adding mechanisms.
- `packages/infrastructure/src/properties/{persisted-properties.facade,persisted-property.projection}.ts`
  currently read/project exactly one listing. Reuse each member's projection/rights/metadata,
  compose current group and explicitly find the requested listing instead of index zero.
  Old original property IDs resolve their current member group without resurrecting a second row.
- `packages/domain/src/properties/properties.read.types.ts` and mirrored
  `packages/contracts/src/properties/{properties.read.types,properties.read.dto}.ts` currently
  require illustrative `preparedEvidence`. Preserve that branch byte-for-byte; add a
  discriminated real-rule branch with configuration identity and actual score, keeping the
  existing wire field name for compatibility. Direct web consumers are
  `apps/web/src/properties/{PropertyEvidence,property-presentation}.tsx` / `.ts`; adapt narrowly,
  retain existing layout/strings where truthful and preserve prepared journeys.
- `packages/infrastructure/src/properties/postgres-property-reductions.repository.ts` assumes
  initial 1:1 membership. Adapt affected reads to current property membership and persisted real
  minimum effects, preserving D-037 ranking/date/geography. Do not relabel listing-only changes
  or replay historical changes as newly observed property repricing.
- Integration support already provides actual migrated PostgreSQL/MinIO/RabbitMQ, production
  worker/API and strict Vitest/Supertest probes. Reuse `properties-history.integration.test.ts`,
  `properties-ingestion.integration.test.ts`, `properties-history-upgrade.integration.test.ts`,
  `market-price-facts.integration.test.ts` and `properties-contracts.integration.test.ts` rather
  than a new fixture framework. New scoped `property-resolution.integration.test.ts` may compose
  this support to prove genuine collection-to-property behavior.

## Tasks & Acceptance

**Execution:**

- [x] Domain resolution/configuration and adjacent tests — implement D-092 initial weights
      0.150/0.510/0.170/0.085/0.085, Unicode-token NFC/lowercase Jaccard, area min/max,
      bedroom equality, best comparable exact/dHash image score, unavailable coordinates,
      available normalization, 0.75 coverage guard and address/type incompatibility zero.
      Distinguish raw/final result and uncalibrated basis; validate config identity/values.
      Normalize numeric scores to a documented stable precision before band classification,
      so floating arithmetic cannot turn a mathematically exact 0.90 into a review decision.
      Use exact canonical type equality. Complete-link requires every pair automatic;
      stable source/listing ordering and minimum original property UUID determine groups.
      Unit-test every matrix row, including thresholds without changing them for calibration.
- [x] `1004_properties_create_entity_resolution.sql`, application port/service/fake and SQL
      adapter — preserve original rows; atomically record necessary current assignment revisions,
      comparison input/configuration identity, decisions/review event dedupe, authentic minimum
      effects and property event revisions. Shared short write guard prevents stale snapshots;
      no cross-schema SQL. Actual failure/cancel propagates for later existing-cycle recovery.
      Keep comparisons safe enough for later owned erasure; no duplicate content copies.
- [x] Existing event contracts/public exports and new review event tests — strict safe review
      contract, causal v2 merge/split/asking-price changes, correct before/result snapshots,
      authentic listing revisions/assignment increments and deterministic ties. Reassignment
      changes may require separate split then merge transitions to satisfy existing cardinality;
      do not weaken parsers. Only publish genuine minimum changes; initial baseline/configuration
      re-evaluation/corrections cannot invent a market reduction. Preserve v1 history/outbox.
- [x] Worker job/module and adjacent tests — integrate resolution into existing bounded cycle,
      reuse telemetry/cancellation and make persisted restart scans no-op when unchanged. Guard
      chronology creation/current writes consistently. Keep Collection authority and source
      identity semantics unchanged; do not require a new scheduler or broker consumer.
- [x] Persisted facade/projection, read contracts/parsers and directly affected web consumers —
      group real members without replacing their original provenance/history/rights, return the
      requested listing, compute active minimum with stable listing-ID ties and honest summary,
      source/feature agreement and existing activity rules. Expose actual uncalibrated rule
      evidence as a new discriminator, never prepared evidence. Preserve prepared branch and
      all unchanged visual layout. Update only necessary locale text if old wording is false.
- [x] Reductions adapter and adjacent tests — one result per current property from actual
      property-minimum effects, correct geographic scope and historical D-037 semantics;
      nonminimum changes, corrections and merge alone produce no fake reduction.
- [x] `integration/property-resolution.integration.test.ts` and necessary affected existing
      tests — genuine nine-listing collection through broker/worker, real SQL evidence and HTTP
      membership; review/separate boundaries, incompatible generic-image pair, mismatch,
      correction-driven split, minimum change, nonminimum change, removal/reappearance,
      rollback, true synchronized concurrency/history race, restart and reverse/repeated
      Market delivery. Preserve immutable listing event bytes/counts and all prior safety
      assertions. Cover legacy pre-1004 upgrade before applying the actual migration.
- [x] `docs/api/properties-and-locations.md`, `migrations/README.md`, existing plan/epic — concise
      actual behavior, uncalibrated limits, compatibility, evidence and executed gates. No new
      duplicate report. Leave commits to parent after independent scoped review.

**Acceptance Criteria:**

- Given the authentic nine-listing synthetic fixture pipeline, when the production worker
  completes history and resolution, then SQL and actual Property/Listing HTTP agree on five
  current properties with 3/2/2/1/1 members, retain each source's provenance and the COB-BV
  neighborhood disagreement, and stored pair probabilities/reasons/configuration reproduce
  decisions without reading runtime match labels.
- Given exact boundary cases and the generic-image near neighbor, when real resolution runs,
  then >=0.90 merges, [0.50,0.90) produces one durable review publication per unchanged
  decision, below 0.50 remains separate, and no incompatible pair joins by transitivity.
- Given a correction which invalidates a relationship, when reconciliation runs and restarts,
  then a causal split preserves original acquisition/listing history and emits no fabricated
  repricing. Genuine later minimum/status changes emit valid causal effects and nonminimum
  changes do not fabricate property reductions.
- Given concurrent resolution/history and a failed transaction, when the real PostgreSQL
  barriers and rollback/restart journeys execute, then no partial/stale assignment survives,
  unchanged replays emit nothing, and existing Market consumption converges in reverse order
  without revision-evidence conflicts.
- Given prepared and new grouped real detail journeys in both languages, when strict HTTP
  parsers and the affected browser detail scenario run, then actual versus illustrative
  evidence remains explicit, every requested listing is correct, rights remain current and
  existing layout/navigation/keyboard behavior is preserved without broad UI re-auditing.

## Implementation Notes

- Implemented D-092 as a pure domain rule with twelve-decimal normalization, complete-link
  grouping and explicit unavailable/uncalibrated evidence. The persisted facade composes each
  member's own history, rights and snapshots; HTTP selects the requested member explicitly.
- Migration 1004 keeps immutable initial lineage and records current assignments, their actual
  executed configuration identity, safe comparison facts, causal property revisions and safe
  authentic minimum effects. A different configuration can replace the current configuration
  even at a lower version under another ID; maximum stored version is never execution authority.
- Original history and corrected matching inputs remain separate. Entirely new baseline groups
  reconstruct original ordered minimum effects with nullable publication, preserving historical
  reductions without inventing v2 envelopes/outbox/revisions. Per-listing revision precedence
  wins over inverted timestamps; dates remain authentic for reduction selection.
- A transaction-scoped Properties advisory guard covers creation, chronology writes and resolution.
  The existing worker cycle scans at most 200 eligible listings and 10,000 retained listing events;
  overflow refuses the entire transaction. Missing-cause unassigned legacy identities retain their
  existing read view; loss of an already assigned member's causal fact refuses reconciliation.
- Grouped reduction `asOf` includes original initial/acquisition dates and every member history
  effective date, including nonminimum status changes. Catalog ranking is independently fixed at
  Tatuapé 95m→92m, Bela Vista 80m→78m, Santana 67m→65.5m and Vila Mariana 126m→124m (minor units).
  Santana's prior minimum is Aurora's 67m rather than Brisa's individual 68m. Vila Mariana's
  cheaper Cobalto member returns on 1 June 2026 after April/May absence: its genuine status
  transition lowers the property minimum without an individual price change. Prepared examples
  and catalog bytes remain intact.

## Plan Change Log

- D-092 eligibility clarification: the existing upgrade campaign has a legacy listing whose
  only creation envelope expired. New causal resolution requires at least one retained authentic
  listing envelope. Such legacy identities remain explicitly unresolved in their existing read
  view, with no comparison, assignment or invented revision; a future authentic event permits
  entry on the next complete eligible scan. Existing assignments must not silently lose causal
  authority. Listing/event bounds still refuse the entire eligible scan rather than truncate it.
  This avoids an unrecoverable legacy identity blocking every healthy listing indefinitely.
  Preserve the original upgrade assertions and prove eligible progress alongside the exclusion.

- D-092 historical baseline clarification: when every member is newly baselined, reconstruct
  genuine minimum history from retained immutable listing envelopes, respecting each listing's
  revision precedence even when effective dates invert. Store safe minimum facts in the existing
  minimum-effect structure with an authentic cause and optional actual publication; never invent
  a historical v2 envelope, revision or outbox entry. Creation/addition/association is not repricing.
  Mixed previously processed membership does not trigger retroactive replay. Prove a first scan
  after complete history, preserving D-037 ranking without fabricated price events.

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 1 findings — high 0, medium 0, low 0, false 1, maybe-false 0
- findings:
  - `[false]` `[reject]` Historical reduction listing after a correction-driven split —
    D-021 defines the selected listing as provenance, not row granularity; D-037 requires
    original listing/provenance and forbids corrections from replacing or erasing drops.
    D-092 preserves original events through splits. The SQL deliberately retains that historical
    selection; `PlaceReductions` queries current detail by propertyId and labels the drop/source
    as historical. Current membership is not the historical listing identifier's contract.
    The independent reviewer checked these authorities and withdrew the finding. No patch,
    additional mechanism or product rerun is justified by this claim.

## Design Notes

D-092 was recorded before implementation. Initial weights are an explicit deterministic rule
configuration, not measured calibration; unavailable coordinates leave image/area/bedroom/text
effective weights 0.60/0.20/0.10/0.10. Identical image/area/bedrooms can therefore reach exactly
0.90 even with differing descriptions, while the city/street/type gate rejects the intentional
generic-image collision. Base coverage guards prevent perfect sparse agreement becoming an
automatic merge. No coordinate distance code is needed until a real input contract exists.

Separate current membership is necessary because rewriting immutable `listing.property_id`
would make a member inherit a different listing's initial fact. Complete-link prevents an
incompatible endpoint pair inside a transitive group. Original minimum UUIDs provide stable
survivors without inventing another identifier authority. Removed members retain identity.

Matching's corrected values and Market's immutable event facts are distinct authorities.
Reuse the current causal consumer's independent revision fences; do not add outward event
rewrites unless a focused reproduction proves the existing model insufficient. Price effects
must remain real original/status transitions, not parser corrections or reconciliation time.
Multiple original changes can precede one resolution scan: preserve their authentic ordered
effects instead of silently collapsing a decrease then increase into the final minimum.

Full route is required: cross-layer identity, causal events and membership affect substantially
more than 100 lines/five files. Risk stays high. This is the first review round for 3.6; prior
3.5/6.12 reviews remain historical and do not authorize another broad audit.

## Verification

**Commands:**

- Focused changed-domain/application/adapter/contract/component Vitest tests first; then build
  the affected dependency closure once, serially, before real-worker campaigns. Never trust stale
  compiled dependencies after a partial app build; verify actual emitted files when a mismatch
  is observed. Use existing `--maxWorkers=1` / workspace concurrency settings.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/property-resolution.integration.test.ts`
  — actual synthetic collection, persistence, worker, HTTP, event and concurrency acceptance.
- Affected existing Properties history/upgrade/ingestion/provenance/prepared and Market causal
  campaigns serially — keep required assertions and bound scope to paths actually changed.
- Affected existing property-detail browser scenario in both locales; compare existing artboard
  layout only for changed evidence presentation. Full accessibility campaign from completed 6.12
  is reused where unchanged; do not restart it for this story or documentation.
- Final stabilized tree: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`
  serially with `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1`; unchanged existing coverage arguments
  from `scripts/test-coverage.sh` for affected workspaces, plus mandatory hooks/changed Markdown
  formatting. Reuse valid evidence only where source and resolved dependencies are unchanged.
  Parent owns final broad gates; implementer runs focused checks and necessary scoped journeys
  rather than duplicating the whole gate suite before independent review.

Record exact commands/results/version and failures with bounded conclusions in this plan.
One heavy load at a time; no redundant confidence reruns. Product defects, executor mistakes
and evidence limits receive distinct proportional actions. Final production E2E belongs to the
authorized release continuation from `feat/phase-1`; this local story does not substitute for
required release CI, image digests or public production evidence. Main integration follows all stories.

### Implementation verification receipts (in progress)

- Focused domain/application/adapter/worker/web suites passed: 17 / 3 / 6 / 2 / 22 tests
  respectively. Actual current runtime closure was rebuilt serially with
  `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm --filter @rei/api... --filter @rei/worker... build`.
  Strict integration TypeScript, focused ESLint, migration conventions and `git diff --check`
  passed after the executed-configuration and grouped-asOf corrections. The affected adapter
  suite was rerun (2 files / 6 tests passed, 2.27s):

  ```bash
  pnpm --filter @rei/infrastructure exec vitest run --dir src src/properties/persisted-properties.facade.test.ts src/properties/postgres-property-reductions.repository.test.ts
  ```

- Earlier collection-to-resolution campaign passed one test in 349.55s on an earlier implementation
  snapshot. Preserve as attempt evidence only: subsequent substantive hashes, legacy eligibility,
  baseline minimum facts, execution configuration and asOf behavior changed.
- Campaign session 66694 on source digest
  `e8e1f7fccab4c93747d25853b6e0691d62035d38fc1d520350b83c8a0ae47ef7`
  failed in 475.42s during sandboxed Chromium launch, before browser assertions; all four serial
  image builds, migrations, first real collection and initial grouped HTTP assertions completed.
  Exact error: `Chromium sandboxing failed!` / `No usable sandbox!`; the matching Playwright
  helper was vscode-owned mode 0755. Exact owned Compose cleanup completed. This is environment
  failure, neither a product acceptance pass nor a timeout. No timeout or sandbox gate was changed.
- A short sandboxed Chromium smoke passed using the existing root-owned mode-4755
  `/usr/local/sbin/chrome-devel-sandbox` through `CHROME_DEVEL_SANDBOX`, reporting
  Chromium 156.0.8078.4. No shared cache/host change or `--no-sandbox` was needed.
- Historical TS/TSX/SQL digest before that image preparation:
  `5a825cd42857d76cd6b1237256075cbe4181392598064d55af9e50b1e7994646`.
  Digest is SHA-256 over sorted changed/untracked TS/TSX/SQL paths, each encoded as
  `path + NUL + file bytes + NUL` (32 paths). Source/dist and images were frozen during
  that preparation/campaign. Later scoped executor/UI corrections are recorded below.

- Session 83176, digest `07112e20b6362288be9abed86a2dc3c1a3920256c4e29355035060bb238d7572`,
  failed in 120.36s (125.08s total) at an incomplete catalog oracle: four genuine property
  reductions existed while the test expected three. The immutable catalog independently
  establishes the fourth as Vila Mariana 126m→124m on 1 June, caused by reappearance. No product
  behavior was suppressed. Initial HTTP grouping, actual executed configuration A2→B1, 115
  acquisitions/18 immutable listing events and browser/artboard blocks passed before this assert.
- The browser capture exposed a misleading prepared-evidence prefix in the real-rule disclosure.
  Only that PT/EN prefix was discriminated; a restricted check of real-rule wording and the
  22-test component suite passed. Only the web image was rebuilt afterward. Session 46082 failed
  in 78.53s (82.77s total) before that wording assertion because the initial asynchronous detail
  read had not produced members within Vitest's default polling window. The executor now awaits
  the exact GET/200/body completion before asserting three members, without changing timeouts.
- Session 79311, digest `4853a6199565178bbd94b654bb788b51fd418c7dbc270482531c4710cf44ecff`,
  passed the current browser block, all four independently fixed reduction values/dates/original
  provenance, delayed-baseline equality, no fabricated historical v2 repricing, rollback and
  immutable listing checks. It failed in 120.97s (123.58s total) at a SQL assertion representation
  mismatch: Market bigint revisions were strings while Properties integer revisions were numbers;
  all nine identities, assignments and numeric revision values agreed. Both sides of the affected
  revision comparisons now explicitly select text. Each failed campaign cleaned its exact owned
  containers/volumes; none establishes full backend acceptance.
- Current affected browser evidence is in ignored
  `apps/web/.impeccable/review/runtime/rei-property-resolution-922690-c0b4bf14/`: real and prepared
  PT/EN at 390px and 1440px plus both fixed authored artboards and source hashes. Sandboxed Chromium
  used the existing helper. The real branch required GET 200, three member disclosures, no page
  errors, keyboard-opened evidence, correct actual score/non-calibration/prefix and no horizontal
  overflow. Visual inspection confirmed plaque, palette, type hierarchy and mobile bottom/desktop
  side navigation remain consistent with the artboards; authentic data, per-pair reasons and open
  disclosures increase content height. Prepared data remains explicitly illustrative. These are
  focused affected-surface checks, not a new general accessibility or redesign campaign.
- Session 94883, digest `7c4d97b4bbe057be01eec0f6b4bdb3601d18911350c80fbc75796abe51042020`,
  failed in 124.74s (127.90s total) after the browser, catalog/baseline and normalized Market replay
  assertions passed. The exact-review fixture expected two 0.50 pairs but returned zero because
  it attempted to remove authenticated snapshot fingerprints through a parser correction.
  `ReparseSnapshot` correctly preserves those fingerprints. This was an executor defect, with
  no product patch or weakened evidence authority. Exact owned resources were independently
  confirmed absent after cleanup.
- The executor now acquires complete three-member Aurora manifests without/with comparable image
  evidence at
  monotonic 1 January 2027 12:01/12:02, retaining the original 78m price, before the sparse and
  restored-image bands respectively. Each correction selects its latest authentic snapshot.
  It verifies original acquired fingerprints/price and unchanged immutable listing-event bytes;
  subsequent price/guard/removal effects remain on 2–5 January. A restricted calculation against
  the unchanged catalog confirms both Bela Vista edges at 0.50 review, 0.499918699187 separate,
  0.89 review and 0.90 automatic for these literal inputs. Integration TypeScript, focused ESLint
  and Prettier passed after this executor-only correction (session 53554).
- Session 36774, digest `c83214ba9d5f81acb83c888686cf1540b4c61a08882ceb32cd60cc8731a2b46b`,
  failed in 177.55s (180.10s total) waiting for the added sparse acquisition. The chosen legacy
  `SyntheticListingSource` parser rejects an empty acquisition fingerprint list; its rejected
  document correctly never became downstream chronology. Exact owned cleanup completed. The
  fixture now supplies one unique opaque fingerprint with no comparable peer, the existing D-092
  unavailable-image model. It also checks completed/observed/parsed/failed counts immediately.
  No Collection implementation or evidence authority changed. Corrections themselves already
  support authenticated empty lists; there was no demonstrated correction-protocol defect.
- Before another campaign, a temporary strict TypeScript offline probe validated all nine new
  source documents through the real synthetic adapter/canonical parser and all seven correction
  stages through the real `ReparseSnapshot` service with typed local ports and authenticated
  original hash/length. All fourteen peer results matched the literal 0/0.50/0.499918699187/0.89/
  0.90/restored-automatic bands, retaining original fingerprints and observed times. The exclusive
  opaque fingerprint matches no peer. The probe passed in 0.43s, is preserved only as an ignored
  runtime artifact, and was removed from the implementation diff. Integration TypeScript and
  focused ESLint/Prettier passed; this probe is parser/executor evidence, not real-service acceptance.
- Session 2449 passed the complete focused real-service campaign: 1/1 test, 137.03s (139.73s
  total), TS/TSX/SQL digest `fdd6cdee5462fe60e40c719eab9fcad7f8ee203de69ec7bf3982979cfcb3c50b`.
  It verified 9→5 grouping, authoritative executed configuration A2→B1, 115 acquisitions/18
  immutable listing facts, all four independently fixed D-037 reductions/provenance, delayed
  baseline without invented repricing, current group/history reads, atomic failures, exact
  review/automatic bands with authenticated evidence, review deduplication, concurrent guarded
  history/resolution, genuine minimum and nonminimum price/status effects including `asOf`,
  reverse/duplicate v2 plus later v1 Market frontier preservation, and worker restart convergence.
  Sandboxed Chromium also passed real/prepared PT/EN at 390px and 1440px with the fixed artboards;
  captures are under ignored `runtime/rei-property-resolution-948464-07b4965c/` and the log is
  `runtime/property-resolution-opaque-images.log`. Exact owned containers, volumes and networks
  were independently confirmed absent after cleanup. Existing history/upgrade and parent-owned
  broad verification/review gates remain pending; this receipt does not assert those passed.
- Existing history session 11381 failed in 115.58s (118.31s total) after catalog/grouped rankings,
  corrections/rollback and temporal inversion checks. Three newly distinct auxiliary fixture
  fingerprint templates interpolated uppercase listing identities, violating the existing
  lowercase synthetic fingerprint contract; `SyntheticListingSource.parse` correctly rejected
  the deadline-recovery document. Only these templates now lowercase their identity. No catalog
  bytes, original listing events, production runtime or acceptance values changed. Cleanup completed.
  Before retrying, a temporary strict TypeScript probe passed all 18 fixed/interpolated identities
  (including both admission indices and all three lookup indices), proved normalized uniqueness,
  and parsed 39 documents through the real synthetic adapter/canonical parser: every changed
  fingerprint template plus all 18 ranking date/price variants, zero failures. Integration TypeScript,
  focused ESLint and Prettier passed; the probe is retained only in ignored runtime artifacts.
- Existing history session 85896 failed in 143.03s (144.39s total), after deadline recovery,
  inverted observations and constituent activity intervals passed. At the pre-replay ranking
  assertion Brazil returned six reductions against seven expected; the original assertion
  reported only cardinality, so it does not identify the missing cause. Exact owned cleanup
  was independently confirmed empty. The affected assertion now includes its safe expected
  and actual public rows for a bounded diagnosis; no acceptance value or production code changed.
- Diagnostic history session 87100 failed in 122.53s (124.78s total), identifying the missing
  `OWNED-OBSERVATION-EXISTING` 1,300,000→1,200,000 reduction. A live read showed its processed
  revision stuck at 3 against retained revision 7; the new counterpart remained at 1 against 5.
  The latter still appeared through the legacy fallback. The resolver constructed the v2 envelope
  date from only resulting states, so an inverted timestamp preceding the previous minimum's
  provenance violated the existing strict v2 contract and rolled back the scan. The correction
  takes the maximum authentic before/after state date for the envelope, retaining the original
  cause and minimum-effect date. The existing regression now requires revision catch-up, original
  reduction values/dates/provenance, persisted authentic effects and valid envelope chronology;
  fallback alone cannot satisfy it. Runtime changed, so session 2449 is no longer final runtime
  evidence; history and the focused resolution campaign must execute again after the serial build.
- Corrected history session 78140 passed 1/1 in 246.46s (250.62s total), digest
  `6544d31fe3419f4ccfbc42d426fbb99479d946b8de8fdc06575d34d976a82e9e`.
  Both inverted identities reached their complete retained revisions (7/7 and 5/5), retained
  the original 1,300,000→1,200,000 effect and B provenance/date, and produced valid persisted
  facts with the online envelope respecting A's later authentic date. All original catalog
  39/115/18 assertions, four independent catalog reductions, deadline/admission races, tied
  starts, corrections, replay/restart, ranking/pagination/date inversion and privacy assertions
  passed. Exact owned containers, volumes and networks were independently confirmed absent.
  The local dependency closure, strict integration TypeScript, focused ESLint/Prettier and serial
  worker/API image builds passed before this campaign; worker image is `sha256:d27368512eb16957d11f9b75afaf27c011c8087c9417852120cec2799ee27f49`
  and API image is `sha256:8dbb060f6f5711c6fd4e79f013ac17b72b175d1e32de52d618bd3f9721b61399`.
  Log: ignored `runtime/properties-history-causal-envelope.log`. Parent now owns the requested
  infrastructure coverage slot before the final focused and remaining affected campaigns.
- The unchanged infrastructure coverage gate initially failed at 75.70/71.54/79.57/77.44
  statements/branches/functions/lines despite 468 passing tests. Added isolated adapter/facade
  regressions using the existing property fixture and typed ports: corrected matching inputs,
  original identity/hash, historical baseline effects, causal revision ordering, merge/split,
  review deduplication, configuration/causal/bound/cancel failures, transaction rollback,
  requested-member rights/history/summary, and authoritative current configuration reads.
  These complement the real PostgreSQL campaigns; SQL assertions alone are not their oracle.
  Focused units passed 16/16 across three files; infrastructure TypeScript and focused ESLint
  passed. Re-measured coverage passed all 478 tests/47 files at 81.98/76.01/88.67/83.84 with
  existing 80/75/80/80 floors and exclusions unchanged. Log: `/tmp/rei-resolution-infrastructure-coverage-final.log`.
  Only tests changed; the history 78140 runtime and serially built images remain valid.
- Parent independently measured the other five stable workspaces with the existing coverage
  script flags/floors: domain 95.02/90.34/100/95.87 (670 tests), contracts
  91.03/90.88/93.23/92.71 (214), application 90.81/86.79/95.12/92.27 (239), web
  95.96/90.82/96.54/97.18 (542), worker 93.42/83.30/90.28/94.78 (239), all passing.
  Log: `/tmp/rei-resolution-other-coverage.log`. Metrics use statements/branches/functions/lines.
- Final focused resolution session 10819 passed 1/1 in 466.55s (468.83s total), with the
  corrected causal-envelope runtime and all eight sandboxed real/prepared PT/EN 390/1440
  browser captures. All previously described backend acceptance, four independent catalog
  minimum values/provenance, configuration authority, exact bands, guard/rollback, reverse
  Market replay and restart assertions passed. Source identity was frozen throughout:
  `2a463a8d5f434664b0afd8e6e4ae326b284937d3c03c329c8ff56635b1a2ffd7`
  (sorted Git-listed TS/TSX/SQL paths and bytes under apps/packages/integration/migrations,
  each separated by NUL). Log: ignored `runtime/property-resolution-final-causal-envelope.log`;
  captures: `runtime/rei-property-resolution-999470-783d6c8a/`. Exact owned containers,
  volumes and networks were independently confirmed absent. Subsequent ingestion changes
  only select each requested member by ID instead of array position, preserving all
  original data/value assertions; prepared executor formatting also changed. Production
  source/dependencies remain unchanged, so this focused receipt is reusable.
- Final upgrade session 26439 passed 1/1 in 44.59s (49.53s total). The genuine pre-1004
  schema upgraded through the actual migration; unresolvable legacy history stayed readable
  without an invented assignment/creation/market event while the eligible identity advanced.
  Original pending/earlier-than-creation facts, corrections, permissions, reverse replay,
  restart and later complete-run assertions passed. Exact owned cleanup was confirmed empty.
  Log: ignored `runtime/property-resolution-upgrade-final.log`. The start overlapped the last
  approximately eight seconds of the preceding executor TypeScript/ESLint command; both
  finished successfully, and later campaigns require the prior final exit code before starting.
  Frozen executor/source digest is `60ad7d92234b94a505ccc3e5e344af3cfb6bfa6f969da1d0194bcf9d9aa46b63`;
  production-only TS/TSX/SQL digest (same definition, excluding integration and `.test.` files)
  is `cbe191cef9534af2752eaa37036a5920a57c9816edd03d3d0e9232f4f8864460`.
- Ingestion session 33610 failed in 143.45s (144.91s total) after authority/replay and
  correction-before-original assertions. Its independently intended second/historical
  fixtures reused all matching signals from the first listing, legitimately joining it;
  the first member's authentic absence/status date then changed grouped `asOf` from the
  second member's 10 October observation to 25 October. This was a fixture-model defect.
  Re-evaluated all dependent summary/place, date, minimum, rights and member-selection
  assertions before changing the existing custom source consistently to exclusive opaque
  fingerprints per source listing ID. No production rule or original expected value changed.
  A temporary offline probe extracted the actual custom/real-shaped initializers from the
  test, passed all five documents through the real adapter/canonical parser, proved unique
  fingerprints, preserved Locations rejection of the unknown address, and ran the real
  domain resolver: four valid singleton groups, no automatic pair. The six pair probabilities
  were 0.89/0.89/0.541666666667/0.89/0.541666666667/0.541666666667. Probe/log are ignored
  `runtime/ingestion-fixture-preflight.{mjs.artifact,log}`; exact failed-project cleanup was confirmed
  empty. Only the ingestion executor changed; final focused/runtime and upgrade evidence
  remain valid. The next ingestion attempt tests this explicit corrected fixture model.
- Ingestion session 66319 passed the corrected independent-membership and historical
  summary/date/restart assertions, then failed in 148.91s (150.20s total) on feature order:
  grouped agreement returns the deterministic lexical set `café/pool/unknown amenity`,
  while the source listing correctly preserves `pool/café/unknown amenity`. The executor
  now asserts both literal orders separately and checks every agreement's sole member,
  source and 100% reporting. All remaining provenance/normalization/restart/rights
  assertions were checked against this aggregation model and retained. No product code
  or fixture value changed; the five-document real-parser/resolver preflight remains
  applicable. Exact owned cleanup was independently confirmed empty.
  The API reference's first-occurrence requirement applies to listing normalization;
  its PropertyDetail agreement definition and mirrored types/parser impose no source
  order on aggregated rows. The remaining per-field agreement, singleton rule evidence,
  original bytes/model, replay/restart and current-rights assertions retain that distinction.
- Final ingestion session 11055 passed 1/1 in 185.28s (186.47s total): the complete production
  collection/evidence/broker/worker/HTTP path, correction before delayed original, historical
  five-crumb and current six-crumb places, rollback/concurrency/inbox expiry/restart, immutable
  original/model, per-value provenance, source/agreement feature orders, reporting evidence,
  authority/address/mutation rejection, local sanitized document and current rights all passed.
  Log: ignored `runtime/property-resolution-ingestion-aggregate-order.log`. Exact owned
  containers, volumes and networks were independently confirmed absent before provenance started.
- Final provenance session 9194 passed 1/1 in 49.11s (50.50s total): genuine storage/outbox/
  broker/worker/HTTP acquisitions, corrected dates with immutable events, live source revoke/
  restore and restart, mixed/missing prepared rights, historical encrypted owner-repository
  fixture, exact expiry/interrupted cleanup, fresh pool/API restart, durable hashes and privacy.
  Expected dependency-failure API probes remained fail-closed. Exact owned cleanup was
  independently confirmed empty. Log: ignored `runtime/property-resolution-provenance-final.log`.
- Final prepared contracts session 71473 passed 1/1 in 27.04s (28.31s total), including
  155 real HTTP requests, the strict prepared discriminator/illustrative evidence and all
  unchanged contract/error/geography assertions; Collection and outbox counts stayed unchanged.
  Exact owned cleanup was independently confirmed empty. Log: ignored
  `runtime/property-resolution-prepared-final.log`.
- Final Market session 98862 passed 1/1 in 51.19s (52.57s total), preserving the
  genuine legacy upgrade, all eight causal fact families, reverse/repeated delivery,
  atomic conflict/rollback/recovery and real HTTP assertions. The focused resolution
  receipt separately proves later v1 listing facts preserve the higher reassignment
  frontier. Log: ignored `runtime/property-resolution-market-final.log`. The existing
  campaign ownership cleanup passed, and the final Docker inventory contains no
  `rei-` campaign containers, volumes or networks; unrelated services were left untouched.
- Implementation handoff identity: original baseline remains
  `f4b33b71ca9bf57ad04b617e19bfe98cd2c42b7a`. Final sorted Git-listed TS/TSX/SQL
  path/byte digest is `7fbf3b1238cd96860aedaf5c281982590ed0c52461dc61e57eb9117549c5b031`;
  production-only digest remains
  `cbe191cef9534af2752eaa37036a5920a57c9816edd03d3d0e9232f4f8864460`.
  After final resolution 10819, only affected executors and documentation changed;
  its runtime/browser receipt, corrected history 78140, upgrade 26439 and all six
  workspace coverage receipts remain applicable. Ingestion 11055, provenance 9194,
  prepared contracts 71473 and Market 98862 passed afterward. No command remains active.
  Execution tasks are complete; the story remains in progress for parent-owned full
  diff verification, final local gates and independent review. Release CI and authorized branch
  publication remain part of the applicable release stories, independently of local 3.6 closure.

| Acceptance                                                                       | Concrete evidence                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentic nine-listing grouping, actual configuration and explainable decisions  | Domain/application units; focused resolution 10819 SQL/HTTP 9→5 and A2→B1 checks                                                                                         |
| Exact bands, incompatible pairs and durable review deduplication                 | Domain units; focused resolution 10819 authentic 0.50/below-0.50/0.89/0.90 stages                                                                                        |
| Correction/split, causal minima/status and original history                      | Focused resolution 10819; history 78140 original 39/115/18, four literal reductions and processed-revision catch-up                                                      |
| Atomic failure, history race, restart and reverse/repeated Market delivery       | Focused resolution 10819; upgrade 26439; Market 98862; ingestion 11055                                                                                                   |
| Requested member, current rights, strict prepared/real evidence and preserved UI | Facade/contract/web units; provenance 9194; prepared contracts 71473; focused resolution 10819 sandboxed PT/EN real/prepared at 390px and 1440px with authored artboards |

- Parent final lint initially failed on the preserved ignored ingestion preflight `.mjs`: the
  repository-wide ESLint invocation still discovered it and reported four missing Node globals.
  Preserved its exact bytes as `runtime/ingestion-fixture-preflight.mjs.artifact`, retaining the
  existing log without shipping probe code or changing lint rules/exclusions. This executor-artifact
  correction does not change production/tests/dependencies or invalidate campaign/coverage receipts.

- Parent final workspace typecheck found one additional prepared API test accessing the new
  evidence union without narrowing its discriminator. Checked every `illustrativeProbability`
  consumer; the others are narrowed or fixture definitions. Added an explicit prepared-kind
  assertion/guard to this API test, preserving all existing expectations. Its focused suite passed
  104/104 in 3.06s (`/tmp/rei-resolution-api-prepared-test.log`). Only test code changed; production
  and prior real-service evidence are unchanged. Final typecheck resumes after focused checking.

- The full unit gate then found two HTTP failures in the initial-only API fixture. Its fake
  database returned an initial-property row for every matching ID, including the new grouped
  snapshot query, so that invalid row caused HTTP 500. Rechecked the two database fakes in the
  affected API module: the prepared one already returns no rows; the initial-only fixture now
  explicitly returns no current assignment for the grouped query. Its legacy expectations and
  all permissions/failure assertions are unchanged. Real PostgreSQL grouping and legacy upgrade
  receipts already cover the corresponding product paths. Run the complete API suite before
  retrying the mandatory final unit gate; no production/dependency change is required.

- Parent verification completed against the stabilized source: `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1`
  with `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` and `pnpm run build` passed. After
  the last test-only fake correction, affected API ESLint/TypeScript and its complete 204-test
  suite passed; the mandatory complete unit command then passed all 2,798 tests in 236 files,
  followed serially by build. Logs: `/tmp/rei-resolution-final-lint.log`,
  `/tmp/rei-resolution-final-typecheck.log`, `/tmp/rei-resolution-api-final-{lint,typecheck,test}.log`,
  `/tmp/rei-resolution-final-{test,build}-stable.log`. The parent read the complete baseline diff
  and every subsequent test/document delta; original baseline remains unchanged.
- Final all-source TS/TSX/SQL digest is
  `85e525d36d8c074253efd8a81182585854218dd116968e60009850597997633b`.
  Production-only digest remains
  `cbe191cef9534af2752eaa37036a5920a57c9816edd03d3d0e9232f4f8864460`.
  Previous six-workspace coverage and seven real-service/browser campaign receipts remain valid:
  subsequent edits only narrowed two prepared test branches, corrected an initial-only API fake,
  formatted one test guard and updated documentation/preserved a temporary artifact.
- Matrix audit passed: Bands/Evidence/Coordinates/Weak coverage/Compatibility/Group integrity are
  covered by passing domain units plus resolution 10819; Source disagreement by resolution 10819
  SQL/HTTP and facade units; Updates/Persistence/Causality by resolution 10819, history 78140,
  upgrade 26439, ingestion 11055 and Market 98862; Reads by facade/API/web units, provenance 9194,
  prepared contracts 71473 and the eight focused browser captures; Reductions by the four fixed
  catalog oracles and online minimum/nonminimum/removal/return assertions in 10819/78140. Every
  named covering suite executed and passed; no skipped, disabled or unregistered case is counted.

## Auto Run Result

- Built: deterministic D-092 scoring, complete-link grouping, durable versioned decisions and
  review deduplication; immutable original lineage with current membership; causal assignment
  and authentic minimum events; grouped reads and truthful actual-rule evidence.
- Changed files (42, grouped by purpose):
  - `packages/domain/src/properties/{property-resolution,property-match.events,index,properties.read.types}.ts`:
    deterministic matching, safe event evidence and public domain contracts.
  - `packages/application/src/properties/{property-resolution.repository,reconcile-property-resolution.service,in-memory-property-resolution.repository,index}.ts`:
    atomic orchestration, port and deterministic fake.
  - `packages/contracts/src/properties/properties.read.{dto,types}.ts`:
    additive prepared/actual evidence discriminator and strict parsing.
  - `packages/infrastructure/src/properties/{postgres-property-resolution.repository,property-resolution-guard,postgres-listing-history.repository,postgres-property.repository,postgres-property-reductions.repository,persisted-properties.facade,index}.ts`:
    guarded persisted resolution, authentic history and coherent grouped reads.
  - `apps/worker/src/properties/{listing-history.job,properties.module}.ts`:
    reuse the existing bounded worker cycle and restart scan.
  - `apps/web/src/properties/{PropertyEvidence.tsx,property-presentation.ts,property-resources.ts}`:
    render actual evidence without mislabeling it as prepared.
  - `migrations/1004_properties_create_entity_resolution.sql`: owned assignment/evidence/minimum state.
  - Fifteen adjacent/API/web/worker/integration test files: exact bands, safe evidence,
    atomicity, causality, persisted grouping, legacy recovery and unchanged prepared behavior.
  - This plan, `epic-properties.md`, `docs/api/properties-and-locations.md` and
    `migrations/README.md`: acceptance receipts, contract semantics and migration operation.
- Review: one independent Quick pass; one false finding rejected on the specific normative
  refutation above and withdrawn by its reviewer. Patches high/medium/low: 0/0/0; deferred: none.
  Follow-up recommendation: false; no patched or named unverified acceptance risk remains.
- Verification: final lint/typecheck, 2,798 tests in 236 files and serial build passed;
  six existing affected coverage gates and seven real-service campaigns passed, including
  eight sandboxed browser captures across PT/EN and mobile/desktop. Detailed identities,
  attempts, cleanup and reuse limits remain in the existing verification receipts above.
  Implementation/test commit hooks passed unchanged formatting, ESLint, secret scanning and
  Conventional Commits validation; documentation hooks run during finalization.
- Residual limits: initial scores are explicitly uncalibrated; calibration is 3.7. Search,
  remaining detail and suppression-derived erasure retain their existing story boundaries.
  This local acceptance supplies no claim of remote CI, registry publication or public deploy;
  those remain required in their release stories from the active branch. Main integration
  follows completion of all stories. No real sources or model calls were used.
