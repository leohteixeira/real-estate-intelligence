---
type: epic
title: 'Deterministic place figures'
parent: initiative-real-estate-intelligence
covers: [CAP-9, CAP-28]
after: []
assignee: ''
risk: medium
---

# Deterministic place figures

## Description

The `market` context: its own price facts, fed by events, and the deterministic figures of a place
with their provenance. By the owner's decision it also serves what the Place overview draws beyond
CAP-9: the median of the parent place, the counts of the plate, the neighbours table and the monthly
series of twelve months. Of CAP-28 it erases the facts of a suppressed listing.

## Outcome

For anyone reading a market: every figure of a place is reproducible, dated and counted; the signal
is the neighborhood figure of the first success signal of the spec.

## Requirements

The spec is the requirement source: children cite its ids CAP-9, CAP-28. Where an id is shared with
another epic, Description says which part this epic delivers.

## Done when

1. For a place `/api/v1` returns the median asking price per m² with its movement, the median time
   on market, the price reductions in 30 days, the listings per property and whether a sale price is
   recorded, each equal to its documented rule on the fixture dataset with every property counted
   once at its asking price.
2. Every figure carries its record count, sources and computation time, and a stale figure states
   its age.
3. A price change in `properties` moves the figure through events; no query reads the `properties`
   schema.
4. The parent median, the plate counts, the neighbours table and the twelve-month series are served,
   and the facts of a suppressed listing are gone.
5. The endpoints answer in production over the synthetic dataset.

## Boundaries

The `market` context and its schema. Not the 30-day, 6-month and 12-month analytics and the ranking
of CAP-22, not recorded sale figures (CAP-33).

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`
- design — `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/ux.md`,
  section Place overview

## Notes

- Source conflict: CAP-9 and CAP-22 — the spec keeps a monthly series out of the MVP vs the owner's
  decision above. The correction goes to `bmad-spec`.
- Decision: the MVP Place overview shows everything its artboard draws, the twelve-month series
  included (owner, 2026-10-10). The spec places movement over windows in CAP-22; the series is
  brought forward and the rest of CAP-22 stays in V2.
- Unknown: whether the series is recomputed from price facts or stored as monthly snapshots; the
  series entry settles it.
- Waits on epic-platform-baseline because: it needs the outbox, the kernel and the contract
  conventions.
- Waits on epic-properties because: it needs the `properties.listing.*` and `properties.property.*`
  event contracts and the `locations` facade.
- Tracer bullet: entry 2; entry 1 precedes it so epic-web opens on the contracts.
- Waits on epic-collection because: it needs the `collection.listing.suppressed` event contract.
- Decision: a figure is stale when computed before the last completed collection of its sources;
  `market` consumes `collection.run.completed` (owner, 2026-10-10).
- Decision: a neighbouring place is one registered as adjacent in `locations`, not a sibling in the
  zone (owner, 2026-10-10).
- Decision: D-038 defines parameter-free `/api/v1/places/:id/market`, `/market/neighbours`
  and `/market/monthly-series` reads with explicitly identified `prepared-market-example`
  fixtures, canonical numeric units and per-figure evidence/freshness evaluated at a declared
  fixture instant. Use the unchanged five prepared groups, nine listings, three synthetic sources
  and twenty registered places, with actual parent identity, registered adjacency, explicit empty
  and unrecorded-sale states and November 2025–October 2026 series points. Six-month movement
  and thirty-day reduction examples do not settle later production algorithms; no persisted
  Properties reads, foreign writes, events, collection or external calls are introduced (agent,
  on the owner's behalf, 2026-10-11).
- Decision: D-041 and ADR 0021 define the event-fed median tracer: Market-owned immutable
  event evidence and latest-revision listing facts, permanent replay/conflict fencing, one
  lowest-active-asking representative per property before geography filtering, nullable-area
  exclusion, deterministic integer rounding and selected-source provenance. The overview adds
  the explicit `event-fed-median-with-prepared-sections` variant with a closed `preparedSections`
  list for counts and the five remaining figures; own and actual-parent medians are persisted
  calculations with `untracked` collection freshness, never prepared fallbacks. Prepared
  contracts, neighbours and series retain their strict guarantees. Full property reassignment,
  other metrics, real counts/neighbours, series, completion tracking and suppression remain
  their respective stories (agent, on the owner's behalf, 2026-10-11).
- Decision: D-042 and ADR 0022 add causal Properties v2 contracts with independent listing-state
  and assignment revisions, full removed-member routing and validated snapshot minima. Market
  preserves v1 listing compatibility and permanent evidence, rejects causally ambiguous v1
  property events through dead letters, and atomically maintains one minimum/tombstone fact per
  property without reading Properties SQL. Out-of-order merge/split, replay and removed-member
  reappearance must converge through real-service HTTP journeys; the entity-resolution producer
  remains its own story (agent, on the owner's behalf, 2026-10-11).

- Decision: D-096 settles the six-calendar-month movement using the same eligible-property
  cohort at both instants under current causal membership; select each instant's global active
  minimum before geography/area. Missing paired history is insufficient data. Time on market
  measures earliest known observation of the active property's members, including retained
  removed history, rather than an unprovided source publication date. Thirty-day reductions count
  currently active listings with a confirmed decrease in `(evaluatedAt - 30 days, evaluatedAt]`,
  once per listing, preserving the design's listing unit; their denominator is eligible active
  listings. The ratio divides those listings by distinct represented properties. Other counts,
  neighbours, series and collection completion retain their own stories. Figures explicitly
  distinguish persisted evidence from remaining prepared sections (agent, on the owner's behalf,
  2026-10-26).
