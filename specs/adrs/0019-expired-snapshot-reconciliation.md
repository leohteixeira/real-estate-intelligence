# ADR 0019 — Durable reconciliation of expired snapshot tombstones

- **Status:** accepted
- **Date:** 2026-10-10
- **Extends:** ADR 0018

## Context

PostgreSQL transaction cancellation destroys the leased backend to respect the caller's deadline.
Its row lock can therefore disappear before an already dispatched object-store write settles.
Aborting an HTTP client does not prove that the remote server never committed that write. A
late PUT can physically recreate an object after cleanup deleted it and marked its generation
deleted. A sweep that permanently excludes deleted generations cannot discover that blob again.

Decision: D-015 adopts durable reconciliation (agent, on the owner's behalf, 2026-10-10).

## Decision

- Reconcile every expired real generation, including terminal deleted tombstones. Delete its
  object idempotently and persist a separate next-reconciliation timestamp after success.
- Keep the acquisition timestamp, thirty-day expiry, content hash and deleted state immutable.
  Reconciliation never makes a generation available. Access and commits stay forbidden from
  expiry onward, regardless of physical storage availability.
- Use bounded batches ordered by the due reconciliation timestamp and stable identity. Schedule
  the next visit with the already configured worker retention interval; repeated tombstones
  must not trap the first batch forever. Failures leave work due, and restarts resume its durable
  schedule. Attempts remain cancellable and caller-policy bounded.
- Generate local integration encryption keys in memory for each campaign. Do not print or
  version a fixed encryption key.

## Consequences

### Accepted amendment — fair selection under object-specific failures

Decision: D-016 separates due eligibility from durable selection priority
(agent, on the owner's behalf, 2026-10-10).

Ordering only by the due timestamp lets a repeatedly failing cohort monopolize the bounded batch.
Keep the existing expiry and next-reconciliation timestamp as eligibility gates, but select eligible
generations by their oldest durable selection order and stable identity. Atomically advance that
order before attempting deletion, using a collection-owned monotonic sequence. This amendment
supersedes only the original due-timestamp ordering, not due eligibility or confirmation semantics.

Failures remain due and never become falsely deleted or unavailable through selection alone.
Successful deletion still schedules its next reconciliation. The selection order survives restart,
does not depend on wall-clock advancement, and lets a finite eligible cohort progress even with a
batch size of one and persistent failures in earlier objects. Cancellation or a crash after selection
can defer an attempt until another selection, but cannot remove eligibility. No expiry, acquisition
identity, hash, key or public application contract changes.

### Accepted amendment — advance priority only for the next attempt

Decision: D-017 requires incremental durable selection
(agent, on the owner's behalf, 2026-10-10).

Advancing a whole selected batch can preserve its relative order when the first deletion consumes
the cycle deadline. Even a cohort of two can therefore starve its healthy second object. Select
and advance one next candidate atomically before each deletion, using the existing lifecycle port.
Do not advance candidates that have not individually been selected. The configured batch limit
bounds total attempts per cycle; do not attempt the same candidate twice within that cycle.
Cancellation leaves the selected candidate eligible with its advanced durable priority, so a later
cycle can reach previously unselected candidates before retrying the slow object. Retain the
existing sequence, due gates, successful reconciliation schedule, terminal state and fixed expiry.
This amendment refines D-016's selection granularity, without adding a public port method or
changing access/deletion semantics. Verify larger-than-one batches, cycle deadline exhaustion,
fixed-clock progress and restart through a fresh PostgreSQL pool.

Physical deletion converges again after a late remote write or interruption, without extending
database locks past deadlines or claiming an atomic PostgreSQL/S3 transaction. Tombstones require
ongoing bounded storage checks. A storage outage can delay deletion; access remains closed.

## Reassessment trigger

Replace ongoing reconciliation only with a reviewed mechanism that proves equivalent late-write
and restart safety. Revisit its throughput and cadence when real source volume is known.
