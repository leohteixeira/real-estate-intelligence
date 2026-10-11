---
type: epic
title: 'Properties, listings and their history'
parent: initiative-real-estate-intelligence
covers: [CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8, CAP-28]
after: []
assignee: ''
risk: high
---

# Properties, listings and their history

## Description

The `properties` context, with the `locations` context beside it: parsed listings become `Property`
and `Listing` records on the place hierarchy, entity resolution decides which listings are one
property and shows why, every change is an event, and `/api/v1` serves search, the property and the
listing with its provenance. Of CAP-4 it delivers matching and evidence; of CAP-28 the erasure of a
suppressed listing.

## Outcome

For anyone reading a property: one property with its listings, its evidence and its reconstructed
history; the signal is the property half of the first success signal of the spec.

## Requirements

The spec is the requirement source: children cite its ids CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8,
CAP-28. Where an id is shared with another epic, Description says which part this epic delivers.

## Done when

1. Fixture listings of one property resolve to one `Property` holding several `Listing` records,
   each match storing its probability and evidence per reason, under the 0.90 and 0.50 thresholds
   read from versioned configuration.
2. Replaying the event fixture yields `ListingCreated`, `ListingPriceChanged`,
   `ListingDescriptionChanged`, `ListingRemoved` and `ListingReappeared` in order with dates and
   previous values.
3. `/api/v1` answers search with every filter and ordering of `ux.md`, the result reporting its
   count and its own median asking price per m²; the property response of CAP-7; the listing
   response of CAP-8, with description text only where the source allows it.
4. The real-shaped fixture is stored with allowlisted fields only and a masked description; a
   suppressed listing is erased and stays out.
5. The largest reductions of a place are served for the Place overview.
6. The endpoints answer in production over the synthetic dataset.

## Boundaries

The `properties` and `locations` contexts and their schemas. Not place figures (epic-market), not
the screens (epic-web), not review of uncertain matches (epic-authentication-and-operations).

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`
- design — `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/ux.md`,
  sections Search results, Filters, Property, Listing and provenance

## Notes

- Story 3.10 implementation: exact-provenance Collection metadata now supplies persisted snapshot
  status, and both persisted/prepared detail GETs apply current per-source text rights. Denied
  dates preserve immutable changes and corrected dated transitions without rewriting events.
  The dedicated isolated campaign passed genuine synthetic storage/outbox/broker/worker/HTTP,
  correction/replay/restart and mixed/missing-rights proof separately from encrypted historical
  owner-repository fixtures, exact expiry and interrupted/deleted cleanup with fresh HTTP pools.
  Unit/coverage checks and the normal pre-push hook passed; public DTOs/events, catalog, search
  and ingestion authority stayed unchanged. No real source or production/VPS action occurred
  (agent, 2026-10-11).

- Decision: D-036 resolves snapshot availability through exact-provenance Collection-owned
  durable metadata, not a physical-storage health promise; real generations expire at their
  original boundary even before cleanup. Preserve hashes and safe identifiers, never object keys
  or raw contents. Both persisted and prepared listing/property detail apply current per-source
  display permission, default-deny and error-safe, without inventing missing text or mutating
  cached fixtures. Denied changedAt is the sorted unique union of immutable description-event
  dates and corrected dated-version transitions, without rewriting or manufacturing events.
  Prove genuine synthetic collection separately from an explicitly labelled owner-repository
  historical encrypted fixture; do not weaken ingestion authority or enable a real source
  (agent, on the owner's behalf, 2026-10-11).

- Decision: D-033 preserves authentic Removed completedAt and the frozen v1 temporal guard by
  selecting the latest authenticated original observedAt/snapshotId at or before that completion,
  independently of the canonical comparison frontier and corrected/current values. When no original
  exists by completion, the identity is not yet evidenced active at that instant: process the run
  without an impossible absence event or rejection, retaining the later observation. Verify existing
  and new identities under genuine held-document/earlier-empty-completion concurrency, both HTTP
  endpoints and replay/restart (agent, on the owner's behalf, 2026-10-11).

- Decision: D-034 completes D-029 by durably retaining constituent canonical activity periods,
  closing only the corresponding open period at its authentic completion. Public lifelines and
  exposure are a derived union of valid non-negative intervals, never a destructive open union or
  a closure at the greatest historical removal. Preserve genuine gaps, immutable dates/events,
  revisions, counts, maximum asOf and D-028 backfill. Verify Created(1), Removed(4), Reappeared(6),
  Removed(7), Reappeared(3), Removed(5) as [1,5] plus [6,7], five days rather than six, including
  real concurrent collection, durable state, both HTTP details and replay/restart
  (agent, on the owner's behalf, 2026-10-11).

- Decision: D-031 separates canonical run/fact publication order from the dated acquisition
  series. Retain every valid acquisition even when observation times invert across concurrent
  runs; immutable events compare original canonical frontiers, while dated values/current
  provenance select by observedAt/snapshotId. D-028 event-free backfill is legacy-only, never
  a shortcut for new completion-driven identities. Preserve authentic dates, status/manifests,
  union exposure, maximum asOf and replay/restart (agent, on the owner's behalf, 2026-10-10).

- Decision: D-032 clarifies D-030: transient deadline/timeout aborts preserve same-key running
  recovery, including combined command signals and adapters that translate abort into cancelled.
  Only deliberate cancellation and deterministic rejection terminalize; preserve independent
  bounded cleanup, holds and completed-run safety (agent, on the owner's behalf, 2026-10-10).

- Decision: D-029 preserves canonical event revisions and authentic effective dates even when
  overlapping runs produce non-monotone effective dates. Normalize active lifelines as an interval
  union, merge overlapping/touching returns without negative absence, count exposure only once,
  and derive metadata.asOf from the greatest retained acquisition/event time. Prove actual delayed
  absence completion followed by an earlier-observed return, restart and later observation without
  rewriting events or moving their dates (agent, on the owner's behalf, 2026-10-10).

- Decision: D-030 gives permanently rejected or explicitly cancelled one-shot attempts a durable
  internal failure terminal, preserving identity/ownership/start time but never complete-manifest
  authority. Failed keys remain terminal; new requests use new keys. Transient infrastructure
  failures remain same-key recoverable and access refusals remain held/paused. Terminal cleanup
  is bounded, independent of an already-aborted signal and cannot replace a concurrent completion;
  preserve frozen v1 events/HTTP DTOs (agent, on the owner's behalf, 2026-10-10).

- Decision: D-028 preserves the published creation/event frontier when upgrading an existing
  initial identity whose authenticated pending original predates that initial acquisition.
  Backfill valid original evidence in observedAt/snapshotId order for acquisition counts, dated
  values, first observation and the first lifeline, without replacing newer current values,
  rewriting creation/revisions/events or emitting retroactive pre-creation market events.
  Never silently consume valid older evidence, infer absence without completion authority or
  bypass completion-bound creation for new identities; verify a real pre-migration database
  with replay/restart (agent, on the owner's behalf, 2026-10-10).

- Decision: D-027 adds immutable acquisition history and separate current/correction projections,
  authenticated durable Collection completion evidence and restartable per-listing reconciliation.
  Canonical source runs/facts, not broker arrival, determine ordering; earlier active runs form a
  durable barrier. Incomplete/failed/paused runs never infer absence, and failed or suppressed
  observed identities remain seen. Active events use acquisition observedAt; removal uses verified
  completion time. Original market events are never rewritten or emitted for parser corrections;
  highest authenticated per-snapshot correction order only changes dated value projections.
  Preserve initial evidence and existing creations without re-emission, frozen v1 events/DTOs,
  current text permissions and the full immutable catalog; verify its 18 listing events plus a
  separate five-type journey (agent, on the owner's behalf, 2026-10-10).

- Decision: "furthest below the median" and the deviation of a row use the median of the result set
  itself, so this epic does not wait on epic-market (owner, 2026-10-10).
- Decision: this epic owns two contexts, `properties` and `locations`, because the place hierarchy
  has no consumer before a listing is normalized.
- Unknown: the weights of the match reasons and their calibration against the labelled synthetic
  dataset; the entity-resolution entries settle it.
- Waits on epic-platform-baseline because: it needs the outbox, the kernel and the contract
  conventions.
- Waits on epic-collection because: it needs the `collection.snapshot.parsed`,
  `collection.run.completed` and `collection.listing.suppressed` contracts, the fingerprints in the
  parsed payload and the facade for source permissions, run and snapshot hash.
- Tracer bullet: entry 2; entry 1 precedes it so epic-market and epic-web open on the contracts.
- Assumption: `locations` owns the neighborhood-to-zone mapping as a seed; the parsed address of a
  listing carries the neighborhood only.
- Decision: calibration tunes the reason weights only; 0.90 and 0.50 stay fixed and a proposed
  change goes to the owner (owner, 2026-10-10).
- Decision: `locations` keeps a seeded adjacency between neighborhoods for the neighbours table
  (owner, 2026-10-10).
- Decision: D-020 freezes the versioned property/listing/search/reduction and place DTOs plus the
  eight listing/property v1 events, served by explicitly labelled synthetic read-only adapters.
  Preserve the shared `totalItems` cursor envelope; validate all UX query parameters without
  changing collection v1 types. Supplement only fictional block/adjacency and permission/expiry
  examples; do not fabricate market medians, measured match scores, source rights or sale facts.
  Denied descriptions contain no text on any response path. Production persistence, matching,
  event publication and match events belong to later stories; the existing framework-neutral
  validators/facades and Vitest override conflicting modular-monolith skill defaults as in D-012
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-024 persists the six-level prepared reference, neighborhood-zone mapping and
  registered fixture adjacency in locations migration 5001. Internal PostgreSQL UUIDv7 IDs retain
  separate stable public place IDs. Add a distinct fictional Avenida Exemplo block in Bela Vista,
  with prepared range 100–199 and null coordinates; preserve the Collection dataset and v1/v2
  contracts. A separate facade address query accepts an optional published number: resolve only
  one normalized registered block, using its range when given; ambiguity, unknown geography,
  invalid numbers and unit/complement fail closed. Never infer a number or coordinates or store
  queried addresses. API and worker use persisted geography, retaining prepared counts/metadata
  and frozen read contracts; the supplemental block has zero prepared properties. New ingestion
  uses its correct block without rewriting existing historical views. No real geography, PostGIS,
  public mutation, new business event or production action
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-025 supplements D-024 with a second fictional block for Rua Cenário Um in
  Vila Mariana (prepared range 100–199, null coordinates, zero prepared properties), totaling
  twenty seeded places. Resolve all nine catalog addresses and the tracer from their published
  geography. COBALTO_BELA_VISTA's intentional Vila Mariana address disagreement is preserved:
  matching labels must never correct its neighborhood, street or zone
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-022 makes entry 2 a persisted synthetic tracer: collection-owned transaction-scoped
  evidence verifies every v1 observation and v2 correction. Inbox, immutable incoming fact, first
  Property/Listing and only ListingCreated outbox commit atomically. Stable source identity remains
  unique after inbox expiry; later observations/corrections are explicitly pending for entry 5,
  including corrections arriving first. Resolve known fixture addresses through locations, using
  the known neighborhood rather than a mismatched fictional street block. Detail GETs prefer
  persistence with prepared fallback; search/counts/reductions stay stubbed. Preserve synthetic
  metadata and unmeasured evidence, and check current text permissions on reads. No real source,
  grouping algorithm or production action is authorized (agent, on the owner's behalf, 2026-10-10).
- Decision: D-021 completes the unpublished stub contracts with all six place levels and explicitly
  fictional blocks, signed property-price change percentages, property-level reductions, prepared
  probability/reasons and structured feature/type agreement. Reassignment events allow surviving
  property IDs and include dated active listing facts that validate conserved prices and both sets
  of minima without foreign reads. Production resolution, matching and calibration stay deferred
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-023 adds collection-owned canonical parsed-event publication evidence, written
  atomically by both collection paths and reparse with their state/outbox. The collection facade
  checks exact received values and emission time as well as original provenance and current source
  authority. Evidence is update-immutable, privacy-allowlisted and subject to later suppression;
  missing legacy evidence fails closed rather than being invented. Properties never reads foreign
  tables or depends on outbox retention. Re-run affected collection/reparse journeys
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-026 introduces a Properties-owned immutable per-value normalization model using
  kernel Provenance, original sanitized source URL and acquisition observedAt. Preserve validated
  numeric/type values; normalize features with NFC, trimmed/collapsed whitespace and locale-free
  lowercase, deduplicating in first-occurrence order without semantic aliases or unknown-value
  dropping. Reject empty/out-of-bounds normalized features. Reconstruct from immutable persisted
  facts and resolved geography without redundant storage or rewriting Collection evidence. Existing
  HTTP fields inherit their common listing provenance and retain field-effective dates; frozen
  Collection v1/v2 and read DTOs remain unchanged. Reuse shared privacy sanitation and prove a
  local real-shaped fixture through synthetic collection, storage, broker, worker, SQL and HTTP.
  No real-source authority, model, new endpoint, history application or VPS action is introduced
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-035 completes canonical-run admission with a Collection-owned per-source
  transaction guard shared by both registration paths and canonical selection. Capture a new
  start/identity only after the guard, commit its running boundary before external acquisition,
  and prevent an invisible earlier registration or a tied start/runId from falling behind progress.
  Preserve authentic dates, accepted facts/events, retry identity, neutral ports/schema isolation,
  bounded cancellation and short lock lifetimes; acquire in a consistent order rather than
  upgrading compatible source locks. Prove held registration/commit and pre-capture waits through
  both actual collection entries, PostgreSQL, worker/HTTP, replay and restart
  (agent, on the owner's behalf, 2026-10-11).
