---
type: epic
title: 'Collection of listings with raw snapshots'
parent: initiative-real-estate-intelligence
covers: [CAP-1, CAP-2, CAP-4, CAP-28]
after: []
assignee: ''
risk: high
---

# Collection of listings with raw snapshots

## Description

The `collection` context: the source register, scheduled collection runs, sanitized and encrypted
raw snapshots, image fingerprints, the suppression list and the synthetic São Paulo dataset every
other epic reads. Of CAP-4 it delivers the fingerprints computed at collection; of CAP-28 the
removal routine, the suppression list, the source register and the privacy records.

## Outcome

For every downstream context and for the owner as controller: listings arrive as parsed,
provenance-carrying events from permitted sources only; the signal is the collection half of the
third success signal of the spec, proven on fixtures until a real source is allowed.

## Requirements

The spec is the requirement source: children cite its ids CAP-1, CAP-2, CAP-4, CAP-28. Where an id
is shared with another epic, Description says which part this epic delivers.

## Done when

1. A scheduled collection run over the synthetic dataset is idempotent, resumes from its checkpoint
   after a restart, backs off when rate-limited, shuts down gracefully and records what it
   collected, changed and failed.
2. The fixture payload holding a contact name, a phone number, an e-mail address and a CPF number is
   stored as a sanitized, encrypted snapshot without them; an expired snapshot leaves its hash.
3. `reparse` over stored snapshots publishes `collection.snapshot.parsed` again without one request
   to the source.
4. A source without a register entry holding its review cannot be enabled; a fixture source that
   allows images yields one fingerprint per photograph fetched and stores none, and one that does
   not yields none.
5. The `remove` command deletes the snapshots and fingerprints of a listing, publishes
   `collection.listing.suppressed`, and a later run over a fixture that contains it does not restore
   it.
6. The synthetic São Paulo dataset is seeded in production and a scheduled run completes there; the
   record of processing operations and the legitimate-interest assessment are in the repository.

## Boundaries

The `collection` context, its schema and the `ListingSource` and `RawSnapshotStore` ports. It owns
the synthetic dataset and the operator commands of the MVP (enable a source, start a run, reparse,
remove). Not normalization into `Property` and `Listing`, not the privacy notice page.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`
- constraint —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/listing-sources.md`;
  spec, Constraints, Privacy and sources

## Notes

- Decision: before authentication, operator actions are commands run by the owner on the server,
  with no HTTP endpoint (owner, 2026-10-10).
- Decision: the synthetic São Paulo dataset belongs to this epic: labelled matches, one property
  with three listings, history over several runs, fingerprints and a zone for every neighborhood.
- Parked: the third success signal (a real source) waits for the written answer of Caixa; the owner
  agreed on 2026-10-10 that the MVP goes live on the synthetic dataset.
- Unknown: the fingerprint algorithm, its similarity measure and how many photographs of a listing
  are fetched; the fingerprint entry settles it.
- Waits on epic-platform-baseline because: it needs the outbox and relay, the resilience
  composition, the kernel and the data-handling ADR.
- Tracer bullet: entry 2; entry 1 precedes it so epic-properties opens on the contracts.
- Assumption: entries that run in parallel take consecutive migration numbers inside the block of
  this context in entry order (3, 4, 5, 7).
