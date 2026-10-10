# ADR 0017 — Dead-lettering and delivery retention

- **Status:** accepted
- **Date:** 2026-10-10
- **Extends:** ADR 0012

## Context

ADR 0012 requires bounded dead-lettering and notes that the outbox needs pruning, but deliberately
leaves the operational policy to a later story. The existing consumers use durable classic queues,
manual acknowledgement, publisher confirms and stable logical consumer names. Redeclaring those
queues with a different type or incompatible dead-letter arguments would break the deployed
topology.

## Decision

Failed deliveries are transferred by the application. A missing private delivery-attempt header is
attempt one. After an abortable one-second delay, failures below the limit are published directly
to the source queue with the incremented attempt. The fifth normal handler failure is published to
the durable `<consumer>.dead-letter` classic queue. Malformed and unsupported envelopes go there
without handler execution. Every transfer is persistent and mandatory and must receive a publisher
confirm before the source is acknowledged. An unroutable, failed, closed or ambiguous transfer
retires the broker generation and leaves the source unsettled.

Dead letters are never replayed automatically. Operations may replay the original event identifier
only while its inbox protection remains inside the thirty-day horizon. Recovery after that horizon
creates a new event identifier and an audited operational record. A crash between a destination
confirm and source acknowledgement can duplicate a transfer; inbox idempotency makes this safe, so
five is a bound on normal handler failures rather than an exact global bound across process death.

Published outbox rows are retained for seven days and consumed inbox markers for thirty days. A
worker job runs every five minutes and deletes at most 1,000 oldest eligible rows from each store in
independent transactions. PostgreSQL time defines cutoffs; candidate selection uses row locks with
`SKIP LOCKED`. An inbox marker is protected while an outbox row with the same event identifier is
unpublished. Shutdown actively cancels maintenance SQL by destroying only its leased connection,
including a lease that arrives after cancellation won a pending pool checkout.

Each retention cycle has an OpenTelemetry span. Fixed-cardinality metrics record cycle result,
per-store result and deleted count, duration and cancellation. Logs and telemetry never include
payloads, SQL, event identifiers, credentials or connection details.

## Consequences

The classic topology remains compatible and poison messages can no longer block a logical consumer.
Operators gain a durable recovery surface and a documented replay horizon. Delivery tables remain
bounded with predictable work per cadence, at the cost of an application-managed transfer protocol
and the unavoidable at-least-once ambiguity around publisher confirmation.

## Reassessment trigger

Reconsider application-managed delivery counting if consumers migrate to quorum queues and their
delivery-limit and at-least-once dead-letter features can be adopted without an incompatible
redeclaration.
