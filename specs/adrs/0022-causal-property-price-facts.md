# ADR 0022 — Causal property membership and complete Market price facts

- **Status:** Accepted
- **Date:** 2026-10-11
- **Accepted by:** the agent on the owner's behalf, 2026-10-11
- **Owner decision:** D-042

## Context

Story 4.3 requires one lowest-active-asking fact per property after every listing/property event,
including merge, split and removal. ADR 0021 already selects the representative correctly, but its
listing projection freezes property identity. Properties v1 property events contain no listing-state
revision, comparable assignment frontier or removed-member routing. Property revisions belong to
different aggregates; effective time and delivery order do not establish causality. No production
property-event emitter exists yet: Properties entity resolution remains its own story.

## Decision

Keep the strict public v1 parser, fixtures and existing listing producers. Add explicit v2 public
contracts for all eight Properties event types. Keep listing `revision` as the positive safe-integer
state frontier and introduce independent, nonnegative safe-integer `assignmentRevision` for each
listing's effective property. Initial assignment is zero. V2 listing events carry both frontiers.

V2 property payloads contain `listingStates`: complete listing facts and their state and assignment
revisions, including removed members. Asking-price events describe the derived current minimum
at those declared states; previous snapshots are historical descriptions, not authority to overwrite
current state. Merge/split states describe the before-assignment membership. Each assignment
declares `listingId`, `fromPropertyId`, `toPropertyId`, `fromAssignmentRevision` and
`assignmentRevision`, with the latter exactly one greater than the former. Every declared member,
including a removed one, has a destination. Preserve exact conservation of active snapshot members,
merge/split cardinality and retained-property-ID support. Validate representative tie-breaking,
price, area, place and provenance against the declared facts, not arrival-time Market state.

Store immutable causal state and assignment evidence separately from their highest frontiers.
A snapshot can establish evidence before the original listing event arrives: its explicit counters
make that safe. Identical causal evidence is harmless; different content at an identical causal key
rejects and rolls back. Listing state identity excludes property ID because membership has its own
frontier; source/source-listing identity remains immutable. Advance each frontier independently,
never replacing a larger one with a late snapshot. A v1 listing establishes only assignment zero:
late v1 observations cannot undo later reassignment. Future reassignment-aware producers use v2.

Market rejects v1 property events explicitly through the existing bounded retry/dead-letter path.
Their strict public parser remains available, but absent counters are never inferred from dates,
UUIDs, property revisions or arrival. Do not claim universal v1 convergence or a completed live
entity-resolution producer. Durable dead-letter evidence is not a successfully applied projection.

Preserve immutable v1 listing evidence and permanent replay fences beyond inbox retention. Add a
Market-only migration which backfills its state and assignment frontiers from retained v1 evidence.
A permanent normalized envelope fence spans all eight event types; event-ID reuse across listing
and property families is also a conflict. Retain distinct listing-event revision fencing and add
property-aggregate/event-revision fencing across property types. Snapshots referencing a state
revision are causal evidence, not another listing event at that revision.

Serialize the Market projection writer inside its transaction and recompute one representative
fact per affected property from the independent current frontiers. Keep an explicit null/tombstone
fact when no active member remains. This simple MVP context-local serialization makes membership,
minimum, evidence and inbox changes atomic without cross-context locks. Read from a coherent
Market-only snapshot. ADR 0021 remains authoritative for global selection before geography,
listing-ID ties, nullable-area exclusion, deterministic money arithmetic and selected provenance.
Neither timestamps nor stale property minima override a current listing price/status.

## Options considered

- Timestamp, UUID or delivery-order reassignment: rejected; not causal and contradicts revision
  authority when effective time moves backward.
- A happy-path-only v1 implementation: rejected; incorrectly claims complete event coverage.
- Durable pending v1 projections: useful for bounded compatibility, but insufficient for recurring
  lineage and removed-member split routing. Not substituted for this story's complete guarantee.
- Additive causal v2 contracts: accepted under ADR 0012 before property producers exist, while
  preserving current v1 listing consumers and public parsing compatibility.
- Properties SQL lookups or facade access to internal state: rejected by ADR 0011.

## Consequences

The Market schema gains retained causal evidence and current property facts. Existing v1 evidence
must survive migration and replay; suppression must remove all relevant evidence in its later story.
Future Properties matching must emit v2 metadata rather than inventing missing causal counters.
Only synthetic events are exercised here. No new endpoint, prepared-section change, collection
freshness, real counts, neighbour computation, monthly-series policy, source access or VPS work
is introduced. Unit tests and strict TypeScript/Vitest PostgreSQL/RabbitMQ/HTTP journeys must prove
out-of-order convergence, all event families, restart/inbox-expiry replay and atomic conflicts.

## Reassessment trigger

Reassess writer throughput when event volume justifies partitioned locks, preserving coherent
reads and all replay fences. Reassess compatibility when a genuine v1 property producer is found;
do not infer absent causal metadata silently.
