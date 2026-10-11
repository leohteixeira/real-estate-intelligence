---
title: 'Normalization with the field allowlist'
type: 'feature'
ticket: '4'
created: '2026-10-10'
status: done
baseline_revision: 'e781800bc9bdd03c9e1712d2a7432d8711d8a56c'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/CLAUDE.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0018-snapshot-encryption-and-acquisition-retention.md'
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 3.4 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

`integration/properties-ingestion.integration.test.ts` passed the real-shaped local fixture's
normalization, field allowlist, masked text, no-contact/no-photo storage and per-field provenance
journey. The normalized-listing domain and projection unit suites also passed.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`8b5ed66cac52bc96fbb370900839a271db888cdf`,
`28da1d65c80c20265ea21fb36d0b66bf4ea2091b`,
`557364dc67e8f1b10fe108d3d48245b4a02f9af5`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** Story 3.4 / CAP-3 requires canonical listing attributes with per-value provenance and
privacy-safe persistence. Properties still copies the received fields directly; its ingestion
campaign does not prove a real-shaped local fixture reaches stored and HTTP listing detail without
person identity, contacts, photographs or unmasked description patterns.

**Approach:** Compose an immutable Properties-owned normalized listing from verified Collection
facts, using the existing Provenance kernel and Locations result. Use that model for aggregate
creation, existing SQL columns and unchanged detail projections. Prove the entire journey with a
separately labelled local synthetic fixture sanitized before persistence. Decision D-026 resolves
feature normalization, common HTTP provenance and storage without changing frozen contracts.

## Boundaries & Constraints

**Always:** Preserve the exact received event for Collection evidence verification and immutable
fact storage. Use original source ID, sanitized source URL and acquisition `observedAt` for every
value; keep run/snapshot/hash audit provenance. Monetary values remain positive safe-integer BRL
centavos, area stays m², and room/parking counts remain integers. NFC/trim/whitespace-collapse/
locale-free lowercase features, deduplicated in first-occurrence order, must remain nonempty and
within 100 characters. Unknown valid features survive. Published address and resolved synthetic
geography are distinct; use Locations' public facade and the caller's existing transaction. Keep
same-transaction inbox/fact/entity/outbox, durable identity uniqueness, current text rights and
fail-closed errors. Existing fields inherit common listing provenance and keep field-effective
dates. Apply D-012's skill overrides: explicit SQL, flat contexts, public facades and Vitest.

**Never:** Widen Collection v1/v2 or existing HTTP DTOs; invent optional-value zeros, type aliases,
currency/unit conversions, semantic feature dictionaries or attributes from prose. No new endpoint,
redundant normalized SQL column, migration, original-event mutation, foreign-schema access,
privacy regex duplication, photograph or natural-person data persistence. Do not alter committed
synthetic bytes/catalog/labels, real-source admission, encryption/retention or source rights.
Later facts/corrections remain pending for 3.5; matching, image acquisition, search/counts/reductions,
UI, real models/sources, VPS/deploy/push and `.env*` access are out of scope. No tests, coverage
thresholds or hooks may be weakened. Preserve the existing stash untouched.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                                                                                                                   | Expected Output / Behavior                                                                                                                         | Error Handling                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Canonical initial listing     | Verified v1 with canonical type, centavos, decimal m² and zero room/parking counts                                              | Immutable normalized allowed values, each carrying original source/URL/observedAt; distinct Property/Listing IDs and existing created event        | No error                                                 |
| Feature variants              | `Pool`, `POOL`, decomposed Unicode and repeated whitespace, plus an unknown valid feature                                       | NFC/lowercase/collapsed features, first-occurrence deduplication, no semantic translation or loss of unknown feature                               | Empty normalized or oversized value rejects              |
| Invalid canonical values      | Missing numeric field, string money, foreign currency, unsafe cents, NaN/Infinity, unsupported type, extra personal/photo field | No normalized aggregate, fact, inbox effect or outgoing creation committed                                                                         | Existing strict validation or bounded domain rejection   |
| Different processing time     | Acquisition time differs from event emission and worker time                                                                    | Every value collectedAt equals original observedAt; creation/detail effective dates remain acquisition based                                       | No processing-time replacement                           |
| Real-shaped synthetic fixture | Local in-memory contact name/phone/email/CPF/links/individual CRECI, unit/complement and photo keys                             | Shared sanitizer drops forbidden fields and masks permitted text before canonical snapshot; complete local durable journey remains owned synthetic | Unsupported shape or unsafe provenance fails closed      |
| Description rights denied     | Permission revoked after original ingestion                                                                                     | HTTP detail omits description text/versions/excerpts but retains provenance and effective dates                                                    | Permission lookup failure is sanitized, never permissive |
| Replay/restart                | Repeated event, expired inbox, reconstructed SQL aggregate                                                                      | Same identities and deterministic normalized values/provenance; original evidence and hashes unchanged                                             | No duplicate creation or rewritten observation           |
| Later v1 / corrected v2       | Existing source identity or correction arriving before original                                                                 | Immutable pending-history/pending-correction facts remain unapplied, initial normalized view unchanged                                             | Preserve original verification and retry semantics       |
| Address reference             | Published synthetic street differs from matching label, or historical five-crumb initial place                                  | Locations-resolved reference retained, no label repair; historical initial location remains readable                                               | Unknown/malformed address remains rejected               |

</intent-contract>

## Code Map

- `/workspace/.claude/skills/nestjs-modular-monolith/SKILL.md` — required backend skill; load it
  and required references before editing. Apply the ADR overrides recorded above. Use
  `documentation-writer` for the existing reference update; user autonomy supersedes its request
  for outline approval. Do not invoke other development or version-control workflows.
- `packages/domain/src/shared/provenance.ts`, `money.ts`, `serializable.ts` — reuse immutable kernel
  values; Money alone permits zero/negative, so retain Collection's positive-price validation.
- `packages/domain/src/collection/collection.events.ts`, `snapshot-privacy.ts`,
  `snapshot-text-privacy.ts` — canonical allowlist and shared masker. Read-only contracts:
  mandatory numeric attributes, six Collection types (no studio), unique source feature strings,
  strict masked description. Normalization must not change the publication before evidence check.
- `packages/domain/src/properties/property.entity.ts` — composition point currently holding
  `initial`, `resolved`, common provenance; `creationEvent` currently copies original listing.
  Add an owned `listing/normalized-listing.vo.ts` with adjacent tests; follow flat aggregate naming.
- `packages/application/src/properties/consume-parsed-listing.service.ts` — verified evidence
  precedes Locations resolution using the same opaque transaction, then initial/pending routing.
  Preserve authority and idempotency; no Collection or Locations internal imports.
- `packages/infrastructure/src/properties/postgres-property.repository.ts` — price/area SQL columns
  and immutable event/resolved-place hydration are enough authoritative storage; use normalized
  scalar values at creation and reconstruct from the original fact without rewriting it.
- `packages/infrastructure/src/properties/persisted-property.projection.ts`,
  `persisted-properties.facade.ts` — use normalized values while retaining strict read shapes,
  original effective dates, current permission checks and safe derived-price null behavior.
- `packages/domain/src/properties/index.ts`, `packages/domain/src/index.ts` — export only the
  normalized model needed within this layer's composition; no cross-context internals exposed.
- `packages/infrastructure/src/collection/canonical-snapshot-sanitizer.ts` — reusable allowlist
  projection, known-name mask and safe URL cleanup. Synthetic collection normally bypasses it to
  preserve exact bytes: the new test adapter must sanitize before returning its canonical document.
- `integration/properties-ingestion.integration.mjs` — isolated PostgreSQL/MinIO/RabbitMQ, real
  production worker/API, collection evidence/relay, restart/replay/rollback and cleanup. Extend it
  without removing existing assertions; fixture uses an owned existing source and a distinct
  source-listing identity, not the real-category privacy source.
- `apps/api/src/properties/properties.ingestion.test.ts`, adjacent domain/application/repository/
  projection tests — cover HTTP inheritance of common provenance and field-effective dates.
- `docs/api/properties-and-locations.md` — amend existing reference with normalized inheritance,
  feature rule, initial-only truth and real-shaped fixture limitation; no new unrelated document.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/properties/listing/normalized-listing.vo.test.ts` and
      `normalized-listing.vo.ts` — red/green tests for every matrix normalization case; compose only
      allowlisted immutable per-value Provenance, including type/price/currency/area/rooms/features,
      published location, dates, permitted advertiser, masked description and prepared fingerprints.
      Retain separately resolved geography; do not claim reference coordinates came from the source.
- [x] `packages/domain/src/properties/property.entity.ts` and its adjacent test — compose the
      model after strict original-event parsing, expose it read-only, and produce unchanged creation
      events from normalized values. Assert original event/evidence remains byte-equivalent.
- [x] Domain exports and `packages/infrastructure/src/properties/postgres-property.repository.ts`
      with its adjacent test — use normalized scalar writes; reconstruct identical model on reads;
      preserve source identity and historical place compatibility without extra persisted state.
- [x] `packages/infrastructure/src/properties/persisted-property.projection.ts` and adjacent tests
      — project canonical model values into all existing detail attributes, features and agreements;
      retain exact wire keys, rights handling, formula, safe money and effective timestamps.
- [x] `packages/application/src/properties/consume-parsed-listing.service.test.ts` and
      `apps/api/src/properties/properties.ingestion.test.ts` — assert atomic rejection, original
      verification-before-normalization, unchanged pending routing and HTTP per-value inheritance.
- [x] `integration/properties-ingestion.integration.mjs` — add local real-shaped synthetic adapter
      using shared sanitizer before collection returns bytes; prove snapshot/SQL/evidence/outbox/HTTP
      allowlist and masks, normalized values and each value's provenance, restart/replay, current rights
      denial, rejected unmasked/extra fields, and cleanup. Keep original campaign intact.
- [x] `docs/api/properties-and-locations.md` and this plan — reference the actual implemented
      normalization contract and append executed verification evidence, risks and current file list.

**Acceptance Criteria:**

- Given the local real-shaped fixture, when collection runs through real storage, durable broker
  and production worker, then real `/api/v1/properties/:id` and `/api/v1/listings/:id` expose the
  expected canonical attributes and masked description, no forbidden person/contact/photo field,
  and source/URL/original collection time for every attribute through common provenance plus its
  field-effective timestamp; the stored snapshot and all downstream artifacts are allowlisted.
- Given persisted initial records, when API/worker restart and original events replay after inbox
  expiry, then the same IDs, normalized fields and original per-value provenance are returned,
  with one creation and no mutation to original facts or Collection publication evidence.
- Given current denied text rights or rejected source authority, when the actual detail/ingestion
  paths run, then no description leaks or unauthorized aggregate is committed, and existing
  pending-history/correction and prepared read behavior remain unchanged.
- Given the completed story, when every verification command runs, then all checks and original
  coverage/hooks pass without new production access, real-source enablement or `.env*` handling.

## Implementation Notes

Implemented and reviewed on 2026-10-10 against this plan; one medium review finding was patched
and independently verified. The Properties-owned
`NormalizedListing` composes frozen shared `Provenance` values from strictly parsed original facts.
It uses Collection's existing positive safe-centavo, BRL, numeric and privacy validation before
normalizing features. Feature normalization is NFC, trim, whitespace collapse, locale-independent
lowercase, a final NFC pass and first-occurrence deduplication; normalized empty/overlong values
reject. Original facts and publication evidence are unchanged. Resolved Locations geography
remains separate.

Aggregate creation, existing SQL scalar writes and persisted detail projections use the derived
model. Hydration reconstructs it from the original immutable fact and existing resolved reference;
there is no migration or redundant normalized column. HTTP contracts are unchanged: every listing
attribute inherits common source/URL/acquisition provenance and its existing field-effective date.
Current text permission remains authoritative. Later facts/corrections retain pending routing.

The ingestion campaign retains its original assertions and adds a separately labelled, owned local
synthetic source-shaped adapter. Artificial identity/contact/unit/photo fields exist only in memory.
The existing shared sanitizer projects and masks them before the adapter returns canonical bytes.
The campaign checks snapshot, SQL, publication evidence, outbox, HTTP, per-value provenance,
restart/replay, denied current rights and rejected unmasked/extra fields. This is local test evidence,
not real-source admission or production verification.

Current implementation file list:

- `packages/domain/src/properties/listing/normalized-listing.vo.ts`
- `packages/domain/src/properties/listing/normalized-listing.vo.test.ts`
- `packages/domain/src/properties/property.entity.ts`
- `packages/domain/src/properties/property.entity.test.ts`
- `packages/domain/src/properties/index.ts`
- `packages/infrastructure/src/properties/postgres-property.repository.ts`
- `packages/infrastructure/src/properties/postgres-property.repository.test.ts`
- `packages/infrastructure/src/properties/persisted-property.projection.ts`
- `packages/infrastructure/src/properties/persisted-property.projection.test.ts`
- `packages/application/src/properties/consume-parsed-listing.service.test.ts`
- `apps/api/src/properties/properties.ingestion.test.ts`
- `integration/properties-ingestion.integration.mjs`
- `docs/api/properties-and-locations.md`
- This plan.

The caller's `epic-properties.md` decision edit was preserved. At the implementation handoff,
the existing hook `stage_fixed` had restaged tracked edits, including that decision; the new
model/tests and this plan were still untracked. The caller then staged every scoped file solely
to capture and inspect the complete baseline diff. No stash operation, commit, push or deployment
had occurred before independent review.

## Plan Change Log

2026-10-10: No implementation-scope or contract changes. Marked implemented tasks and recorded
the actual model, file list and verification evidence. The existing domain root already re-exports
the Properties barrel, so it required no additional edit.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Lowercasing can reintroduce a decomposed sequence after initial NFC,
    allowing equivalent features to survive deduplication and reach detail/feature agreement.
    The caller independently reproduced `J\u030C` and `\u01F0` as two values through the
    compiled model and traced projection of those values. The same implementing subagent
    reapplied NFC after lowercase, before validation/Set, and added a red/green regression
    proving one NFC value, first-occurrence order and unchanged original input. No new API,
    branch, guard or contract change was needed. Final full verification is recorded below.

One medium patch entry, no high entries, deferred items or rejected findings. The follow-up
recommendation is false under the pinned workflow rule; the normalization regression covers
the demonstrated defect. Review loop iteration remains zero because no plan re-derivation ran.

## Design Notes

D-026 chooses a derived immutable per-value model rather than redundant normalized storage. SQL
already persists the exact allowed canonical fact, original provenance and resolved reference;
hydration must reproduce normalization and may not infer current collection time. The public DTO
already supplies common source/run/snapshot provenance and per-field `validSince` dates, so the
same source/URL/time accompanies each displayed value without an incompatible schema addition.
Strict required Collection inputs remain strict; optional/missing-value evolution needs another
version. The local real-shaped adapter is test evidence, not permission for a real source.

Estimated implementation exceeds 100 lines and five substantive files; full route, high risk.
No browser work is required because no screen or frontend behavior changes.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all workspace gates.
- `pnpm run test:coverage` — all eight unchanged floors (80% statement/line/function, 75% branch).
- `pnpm run test:integration:properties-ingestion` — genuine collection/storage/broker/worker/API
  normalization/privacy, current rights, rollback, identity, pending facts and restart journey.
- `pnpm run test:integration:properties` — unchanged prepared DTOs, filters and HTTP reads.
- `pnpm run test:integration:locations` — six-level reference, original catalog and same lease.
- `pnpm run test:integration:snapshot-lifecycle` — shared privacy/encryption/retention regression.
- `pnpm run test:integration:snapshot-reparse` — exact evidence and unchanged corrected facts.
- `pnpm exec lefthook run pre-commit --all-files` and `git diff --check` — original hooks/whitespace.

If production Collection acquisition or sanitizer code changes, also execute
`pnpm run test:integration:collection` and `pnpm run test:integration:resumable-collection`.
Record every executed command/result and the isolated service project cleanup; do not claim any
production verification. Use auto-commit only after review: exact implementation paths, then test
paths, then documentation paths; English Conventional Commits without scope, trailers or push.

### Executed evidence (2026-10-10)

- Targeted new domain tests first failed because the normalized model did not exist (red), then
  passed after implementation (24 targeted tests at that point).
- `pnpm run typecheck` and `pnpm run build` passed. Build retains the existing Vite large-chunk
  advisory; no bundle threshold was altered.
- The first `pnpm run lint && pnpm run test` stopped at an unused mock query parameter. The test
  mock was corrected without weakening lint. The subsequent command passed all workspace tests:
  1,163 total (web 14, contracts 29, domain 325, AI 9, application 127, infrastructure 334, API 135,
  worker 190).
- `pnpm run test:coverage` passed all eight unchanged floors. Statement/branch/function/line
  percentages: contracts 97.93/97.01/100/100; domain 94.33/90.78/100/94.89; application
  91.14/86.89/96.61/92.4; infrastructure 88.63/82.32/93.21/91.01; API 96.25/92/100/95.91;
  worker 94.45/84.64/92.24/95.87; AI and web 100 in all four metrics.
- `pnpm exec lefthook run pre-commit --all-files` passed all original hooks. The two new untracked
  model/test files also passed explicit `pnpm exec prettier --check` and `pnpm exec eslint`.
  `git diff --check` and `git diff HEAD --check` passed.
- This untracked plan initially needed Prettier formatting, was formatted, and then passed explicit
  `pnpm exec prettier --check` and `pnpm exec markdownlint-cli2 --no-globs` (zero errors).
- `pnpm run test:integration:properties` passed (158 HTTP requests), isolated project
  `rei-properties-1859309-e66a4473`.
- `pnpm run test:integration:locations` passed (66 HTTP requests; 20 places; 10 addresses; 10
  synchronized transaction leases), isolated project `rei-locations-1866578-9dfad0aa`.
- The first `pnpm run test:integration:snapshot-lifecycle` failed during Compose service startup:
  PostgreSQL and MinIO were healthy, but `rei-snapshot-lifecycle-1859708-rabbitmq-1` exited with
  status 1 before application lifecycle assertions ran. Automatic cleanup removed its container
  before broker logs were captured; a later Docker event lookup retained no diagnostic records.
  The underlying startup cause therefore remains unknown and is not claimed as fixed. No code or
  configuration changed before the fresh isolated rerun (`rei-snapshot-lifecycle-1862841`), which
  passed sanitizer/encryption/retention/expiry/orphan/concurrency/restart/legacy assertions. The
  unchanged successful rerun is regression evidence, not an explanation for the initial exit.
  Exact-label container and volume checks returned empty for both lifecycle projects.
- `pnpm run test:integration:snapshot-reparse` passed its real CLI, durable replay/races/restart,
  ordering, legacy, privacy, corruption, expiry, rollback and broker/audit-inbox assertions.
- `pnpm run test:integration:properties-ingestion` passed the entire original campaign and added
  local real-shaped synthetic adapter: sanitized snapshot/SQL/evidence/outbox/HTTP, normalized
  attributes and per-value provenance, restart/replay, denied current rights and rejected
  unmasked/personal/photo fields. Exact project `rei-properties-ingestion-1858169-3369ae4a` printed
  successful container/volume cleanup assertions.
- Production Collection acquisition and sanitizer code were not changed; the plan's conditional
  collection and resumable-collection campaigns did not apply.

All required campaign scripts completed cleanup. Final project-label checks found no retained
containers or volumes for Properties ingestion, Properties reads, Locations, snapshot lifecycle
(failed or successful) or snapshot reparse. No production verification is claimed. The unresolved
first broker startup cause and pending independent review were the limitations at the implementer
handoff; subsequent review and verification are recorded below. No implementation task was incomplete.

### Caller verification and matrix audit (2026-10-10)

The caller read the complete 1,391-line baseline diff, including the three new files, and independently
reran every applicable verification command before review. Lint, typecheck, all 1,163 workspace
tests, build, all eight original coverage floors, all-file pre-commit hooks and both working/index
whitespace checks passed. Targeted verbose runs additionally showed all 56 tests in the six
changed unit/HTTP files executing and passing, with no skipped tests.

- Properties ingestion passed the entire original and added real-shaped synthetic campaign,
  project `rei-properties-ingestion-1876387-9cc5fdc0`.
- Prepared Properties contracts passed 158 real HTTP requests, project
  `rei-properties-1890283-ddd80d78`.
- Locations passed 66 real HTTP requests, 20 persisted places, 10 addresses and 10 synchronized
  leases, project `rei-locations-1891152-f0d2f8a3`.
- Snapshot lifecycle and snapshot reparse both passed unchanged on the caller's first run.
  This does not explain or erase the implementer's earlier unknown RabbitMQ startup failure.
- Campaign cleanup completed; exact-label container and volume queries were empty for the
  caller's ingestion, Properties and Locations projects. A Compose-label inventory after the
  snapshot campaigns found no remaining snapshot lifecycle/reparse campaign resources.
- `git stash list` still shows only the original preservation entry; its contents were not read.

Each matrix row has executed passing coverage:

| Matrix row                    | Executed covering checks                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical initial listing     | NormalizedListing composition, aggregate identity/creation, projection, API serialization and the real ingestion fixture assert canonical numbers, zero counts and per-value provenance.     |
| Feature variants              | NormalizedListing variant/order/unknown/empty-array and invalid-feature cases; application rollback cases; real ingestion detail and feature-agreement assertions.                           |
| Invalid canonical values      | NormalizedListing parameterized rejected values and service malformed-event/no-effects test; genuine broker rejection of unmasked/extra fields leaves campaign counts unchanged.             |
| Different processing time     | NormalizedListing composition, aggregate creation, projection and API tests plus real fixture assert original observation time rather than publication time.                                 |
| Real-shaped synthetic fixture | The real ingestion campaign asserts sanitizer output before Collection bytes, stored snapshot, immutable SQL/evidence, outbox, HTTP allowlist/masks and every normalized value's provenance. |
| Description rights denied     | Projection permission/lookup-failure tests, both API denial/error tests and real ingestion permission revocation retain provenance without text.                                             |
| Replay/restart                | Service sequential/concurrent/restarted replay, repository hydration and real ingestion restart/inbox-expiry replay preserve IDs, normalized model and immutable evidence.                   |
| Later v1 / corrected v2       | Service durable v2-first/later-observation test and original real ingestion pending-fact assertions retain the initial normalized view.                                                      |
| Address reference             | Aggregate unchanged published-address test, service same-scope/unknown-address tests and real ingestion historical five-crumb/six-crumb compatibility; Locations campaign also passes.       |

No production acquisition/sanitizer code changed, so the two conditional collection campaigns
remain inapplicable. No browser verification applies to this backend-only change.

### Post-review verification (2026-10-10)

After the NFC correction, the caller independently repeated every applicable verification command:

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:coverage`
  passed. All 1,164 workspace tests executed: web 14, contracts 29, domain 326, AI 9, application
  127, infrastructure 334, API 135 and worker 190. All eight original coverage floors passed;
  the percentages remained those recorded above. The new model is included by the unchanged
  coverage globs, not excluded from measurement. The existing Vite chunk-size advisory remains.
- The focused verbose normalization suite passed all 22 tests, including the added regression.
  Independent assertions through the compiled model and actual detail projection confirmed
  `J\u030C` and `\u01F0` produce one NFC feature in both listing features and feature agreement.
- `pnpm exec lefthook run pre-commit --all-files`, `git diff --check` and
  `git diff --cached --check` passed. The API reference clarification separately passed Prettier
  and Markdown lint. No hook, threshold or test was weakened.
- `pnpm run test:integration:properties-ingestion` passed the complete original and added
  production-path campaign, project `rei-properties-ingestion-1896683-5db39ea4`.
- `pnpm run test:integration:properties` passed 158 real HTTP requests, project
  `rei-properties-1910370-945649c4`.
- `pnpm run test:integration:locations` passed 66 real HTTP requests, 20 persisted places,
  10 addresses and 10 synchronized leases, project `rei-locations-1911266-f9405600`.
- `pnpm run test:integration:snapshot-lifecycle` and
  `pnpm run test:integration:snapshot-reparse` both passed, projects
  `rei-snapshot-lifecycle-1897027` and `rei-snapshot-reparse-1898452` respectively. These
  successful runs do not explain the implementer's earlier unknown RabbitMQ startup failure.
- All five campaigns completed cleanup. Exact Compose-project-label container and volume
  queries returned empty for each of the five projects above.
- The caller read the complete patched 1,458-line baseline diff and the subsequent API reference
  clarification. All nine matrix rows retain executed passing coverage. Conditional collection
  campaigns remain inapplicable; no frontend/browser, real-source, VPS or production verification
  is claimed. No `.env*` access, push or deployment occurred.

## Auto Run Result

**Outcome:** Story 3.4 is built. Properties now derives an immutable allowlisted listing with
original per-value provenance, deterministic Unicode-safe feature normalization and separately
resolved geography. Existing SQL writes and HTTP detail projections consume that model without
changing contracts, endpoints, migrations or immutable Collection evidence. The genuine local
ingestion journey proves sanitization before canonical storage, downstream privacy, provenance,
replay/restart and current text-rights enforcement using an explicitly synthetic fixture.

**Reviewed changed files:**

- `packages/domain/src/properties/listing/normalized-listing.vo.ts` — immutable allowlisted
  values, original acquisition provenance and validated NFC/lowercase feature normalization.
- `packages/domain/src/properties/listing/normalized-listing.vo.test.ts` — canonical values,
  privacy rejection, provenance, immutability, normalization and Unicode regression coverage.
- `packages/domain/src/properties/property.entity.ts` — compose normalized initial values and
  unchanged creation-event shape while retaining original facts and resolved reference.
- `packages/domain/src/properties/property.entity.test.ts` — aggregate identity, published
  address, normalized creation and unchanged original-fact assertions.
- `packages/domain/src/properties/index.ts` — export the Properties-owned normalized model.
- `packages/infrastructure/src/properties/postgres-property.repository.ts` — normalized scalar
  writes and deterministic hydration from existing immutable persisted evidence.
- `packages/infrastructure/src/properties/postgres-property.repository.test.ts` — scalar write,
  provenance reconstruction and historical persisted-reference coverage.
- `packages/infrastructure/src/properties/persisted-property.projection.ts` — normalized detail
  values and feature agreement with unchanged provenance, rights and wire contracts.
- `packages/infrastructure/src/properties/persisted-property.projection.test.ts` — detail values,
  inherited provenance, acquisition dates and permission-safe text projection assertions.
- `packages/application/src/properties/consume-parsed-listing.service.test.ts` — strict rejection,
  immutable verification, atomic rollback, replay and unchanged pending-fact routing coverage.
- `apps/api/src/properties/properties.ingestion.test.ts` — HTTP normalization, inherited per-value
  provenance, effective timestamps and current text-rights behavior.
- `integration/properties-ingestion.integration.mjs` — real-shaped local synthetic sanitization
  and end-to-end durable storage/broker/worker/HTTP normalization/privacy evidence.
- `docs/api/properties-and-locations.md` — existing reference explains normalization, provenance
  inheritance, initial-only semantics and synthetic-fixture limits.
- `_bmad-output/initiative-real-estate-intelligence/epic-properties/epic-properties.md` — English
  owner-behalf mirror of D-026's normalization, provenance and storage decisions.
- `_bmad-output/initiative-real-estate-intelligence/epic-properties/story-normalization-with-the-field-allowlist-plan.md`
  — intent, implementation, review triage, executed matrix coverage and final built handoff.

**Review:** One medium finding patched; zero high findings, deferred items or rejected findings.
The defect was independently reproduced, corrected by the same implementer and covered by a
red/green regression plus full repeated verification. Follow-up review recommended: false.

**Verification:** All required workspace gates, 1,164 tests, eight unchanged coverage floors,
original hooks and five real-service integration/API campaigns passed after the patch, with
exact campaign cleanup verified. Evidence and project identities are recorded above.

**Residual risks and limits:** The earlier isolated RabbitMQ startup exit remains unexplained;
later successful runs are not claimed as a root-cause fix. The existing Vite bundle advisory
remains unchanged. Real-source admission and VPS/production behavior are unverified and out of
scope. Later observations and corrections remain pending by design for story 3.5. No unrelated
changes, source rights, dependencies, environment files or original stash contents were altered.

**Handoff:** Built, not owner-accepted/done. Local commits are grouped as implementation, tests
and documentation under the authorized auto-commit workflow; no push or deployment is authorized.
