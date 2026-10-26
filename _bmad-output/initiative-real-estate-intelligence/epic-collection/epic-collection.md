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

- Decision: D-089 and the accepted ADR 0015 clarification select versioned horizontal dHash64
  (`dhash64-v1`), Sharp 0.35.5 and at most three distinct photographs in source order, processed
  sequentially in memory within 5 MiB/16-million-pixel bounds. Photograph attempts share page
  admission state and recheck independent permission. New acquisition v3/correction v4 preserve
  empty or repeated perceptual evidence without changing strict v1/v2 or historical fixtures;
  reparse never fetches photographs. Hamming similarity applies only to matching algorithm tags;
  matching calibration and real-source activation remain separate
  (agent, on the owner's behalf, 2026-10-25).
- Decision: D-047 and the accepted ADR 0015 clarification close current fingerprint
  representations to SHA-256 and identifiable prepared synthetic labels, preserving every
  published dataset value, and reject demonstrated explicit street unit/complement details.
  No perceptual algorithm, historical rewrite, source permission or exhaustive anonymization
  claim is introduced (agent, on the owner's behalf, 2026-10-11).
- Decision: D-019 accepts version 1 of the
  [record of processing operations](../../../docs/privacy/record-of-processing-operations.md) and
  [legitimate-interest assessment](../../../docs/privacy/legitimate-interest-assessment.md) as an
  engineering baseline under CAP-28 (agent, on the owner's behalf, 2026-10-10). Real processing
  remains disabled; acceptance grants no source permission, legal approval, anonymization claim
  or production evidence. The owner must supply public identity/contact, recipient/transfer and
  non-snapshot retention evidence, and proof of pending pre-collection controls before activation.
- Acceptance: both privacy records are version 1, accepted as an engineering baseline by the
  agent on the owner's behalf, 2026-10-10, under D-019. Their conditional design covers synthetic
  local evidence, transient/indirect-identification risks, fixed snapshot expiry, future images,
  suppression/rights, delivery/telemetry and backups; separate stories retain their obligations.
- Implementation: entry 8 now has the bounded three-argument owner `snapshot:reparse` command,
  strict v2 correction/outbox, immutable durable operation replay/order, original fingerprint
  capture and independent legacy recovery, plus read/commit/deferred-commit expiry guards.
  Strict v1 semantics remain unchanged; intentional-empty originals use a correction-only
  owned-synthetic parser. No new configuration settings or external source enablement were added.
  Final lint/typecheck/build, 832 unit tests across eight workspaces, unchanged coverage gates,
  the actual CLI/storage/DB/broker/audit campaign and all six existing collection compatibility
  campaigns passed; source-register cleanup's five additional tests also passed. Scoped format,
  Markdown, syntax, whitespace and redacted secret checks passed. The plan records exact commands,
  coverage and the distinction between actual CLI and injected changed-parser/privacy fixtures.
  The parent independently repeated all gates, all seven campaigns and 111 focused cases; the
  context-free Quick review reported no findings (agent, on the owner's behalf, 2026-10-10).
- Decision: D-018 defines one explicit snapshot, parser-revision label and operation key per
  operator reparse. Publish only the v2 correction with original observation provenance, durable
  idempotency and original fingerprints; preserve strict v1 reads and never emit completion or
  fetch a source/image. Legacy fingerprints come from hash-authenticated canonical bytes, not
  prunable outbox rows or the changed parser (agent, on the owner's behalf, 2026-10-10).
- Decision: D-017 and the accepted ADR 0019 amendment require incremental single-candidate
  durable selection before each deletion attempt, preserving the total cycle batch bound and
  preventing a slow first object from starving unattempted peers after deadline cancellation
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-015 and ADR 0019 require bounded durable reconciliation of expired tombstones,
  because cancellation may release a database lock before a remote PUT finishes. The access
  deadline and terminal state remain fixed; local campaign keys are generated in memory
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-016 and the accepted ADR 0019 amendment separate due eligibility from a durable
  monotonic selection order, preventing object-specific failures from monopolizing bounded
  reconciliation batches without changing expiry or falsely confirming deletion
  (agent, on the owner's behalf, 2026-10-10).
- Decision: D-014 and ADR 0018 require closed JSON sanitization before storage and parsing,
  authenticated application-side encryption with no default key, acquisition-scoped fixed
  30-day expiry including pre-commit uploads, and durable hash/history preservation. Synthetic
  bytes remain unchanged; only an isolated local fixture exercises the real-data path, with no
  external source enabled (agent, on the owner's behalf, 2026-10-10).
- Decision: D-013 requires per-source Retry-After admission across logical calls, remaining
  delay on canonical failure, a deadline covering initial registry/pending-hold waits, and
  lifecycle-managed telemetry in both operator roots without duplicate worker subscribers
  (agent, on the owner's behalf, 2026-10-10).
- Decision: a source access refusal creates a durable disabled hold, then pauses its run in a
  separate aggregate transaction; redelivery repairs an interrupted pause before acknowledgement.
  Ordinary enablement cannot clear a hold, and scheduling checks source eligibility. D-012 records
  the calibrated local resilience defaults and ADR precedence over skill examples
  (agent, on the owner's behalf, 2026-10-10).
- Decision: before authentication, operator actions are commands run by the owner on the server,
  with no HTTP endpoint (owner, 2026-10-10).
- Decision: the synthetic São Paulo dataset belongs to this epic: labelled matches, one property
  with three listings, history over several runs, fingerprints and a zone for every neighborhood.
- Parked: the third success signal (a real source) waits for the written answer of Caixa; the owner
  agreed on 2026-10-10 that the MVP goes live on the synthetic dataset.
- Resolved: D-089 settles collection story 2.9's algorithm, similarity measure and photograph
  count; implementation and acceptance evidence remain in that story's existing plan.
- Waits on epic-platform-baseline because: it needs the outbox and relay, the resilience
  composition, the kernel and the data-handling ADR.
- Tracer bullet: entry 2; entry 1 precedes it so epic-properties opens on the contracts.
- Assumption: entries that run in parallel take consecutive migration numbers inside the block of
  this context in entry order (3, 4, 5, 7).

- Decision: D-091 makes source/listing suppression permanent before resumable owner-command
  cleanup. Preserve only minimum suppression/audit/run identity and cleanup metadata; erase owned
  Collection/platform/audit collected copies and reject delayed parsed delivery. Shared synthetic
  ownership and real fixed expiry remain intact. Properties/Market derived erasure belongs to
  stories 3.12/4.8; historical unidentifiable real orphans retain existing expiry. Implementation
  and verification evidence remains in the removal/suppression story plan
  (agent, on the owner's behalf, 2026-10-25).

- Story 2.13 reconciled all nine formal plan deferrals on 2026-10-26: eight are covered by
  completed owning Stories 2.5, 2.6, 2.7, 2.14 and 2.12. The remaining durable actor-aware
  source-enable audit is explicitly tracked in the existing Sign-in and protected operations
  epic ticket. Historical deferral lists and production receipts remain intact; the sweep
  changes documentation only and does not reopen source collection or authorization reviews.
