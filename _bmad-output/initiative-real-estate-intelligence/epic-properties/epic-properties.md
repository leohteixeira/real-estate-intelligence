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
