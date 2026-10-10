# ADR 0012 — Domain events, transactional outbox and the single broker

- **Status:** accepted
- **Date:** 2026-10-10
- **Extends:** ADR 0010

## Context

ADR 0011 forbids one context from writing the state of another, so contexts need a way to tell
each other what happened. ADR 0010 has the API publish a durable run command to RabbitMQ after it
stores the run. Those are two writes to two systems: a crash between them leaves a queued run that
no worker will ever see, or a command for a run that was never stored. The ingestion pipeline has
the same shape at every step.

The owner also decided, after ADR 0010, that RabbitMQ is the only broker and carries collection and
parsing jobs as well. That decision has no record yet.

## Decision

### Events

- A fact that another context may need is a domain event named `context.aggregate.action`, in
  kebab case and past tense: `properties.listing.price-changed`, `collection.snapshot.parsed`,
  `ask.run.completed`.
- An event carries an identifier, its type and version, the aggregate identifier, the time it
  occurred, the trace context and a payload of serializable primitives and identifiers. It never
  carries an entity, a vendor type, a credential or personal data.
- A schema change that a consumer could not read raises the version. Both versions are published
  until every consumer moved.
- The event contracts of a context are part of its public `index.ts`.

### Transactional outbox

- A service appends its events to `platform.outbox` in the same transaction that changes the
  aggregate. Nothing publishes to the broker from inside a request or a business transaction.
- A relay in `apps/worker` claims pending rows in identifier order with `FOR UPDATE SKIP LOCKED`,
  publishes each as a persistent message with publisher confirms and marks it published only after
  the confirm. A failed publish leaves the row pending and is retried under ADR 0013.
- Commands that follow a state change take the same road. The run command of ADR 0010 becomes the
  event `ask.run.requested`, written with the `queued` run.
- Delivery is at least once. Order is kept per aggregate at the relay and is not guaranteed at the
  consumer.

### Consumers

- Every consumer is idempotent. It records the pair of consumer name and event identifier in
  `platform.inbox` in the same transaction as its effect; a pair already present is acknowledged
  and skipped.
- A consumer acknowledges explicitly, after its transaction commits. A message that keeps failing
  is dead-lettered after a bounded number of deliveries and stays visible to Operations.
- A consumer that needs more than the payload asks the facade of the publishing context.
- One queue per consumer, so one slow consumer never delays another.

### Broker and stream

- RabbitMQ is the only broker: natural-language runs, collection and parsing jobs and domain
  events. Local ports are 5672 and 15672. API and worker hold its credentials; `apps/ai` holds none.
- Valkey stays optional with no consumer.
- Progress of a natural-language run is stored as rows of `ask.run_event`, each with a sequence
  number. The SSE endpoint replays from `Last-Event-ID` and then follows; PostgreSQL
  `LISTEN/NOTIFY` only wakes it up. No event exists only in memory.
- Tests use an in-memory publisher behind the same port. It never runs in a deployed process.

### What stays synchronous

- Everything inside one aggregate, in one transaction.
- Queries across contexts, through a facade.
- Tool calls and checkpoint saves from `apps/ai` to the API (ADR 0010).

## Consequences

A stored change and its event can no longer diverge, and a broker outage delays events instead of
losing them. The price is latency between the commit and the publish, one more table that grows and
must be pruned, and duplicate handling in every consumer.

Reads that cross contexts become eventually consistent: a market figure may trail a price change by
the relay interval, which is why every figure already carries its computation time.

## Reassessment trigger

Replace polling with logical replication if the relay interval becomes visible in run start time
or the outbox outgrows a single relay. Add Valkey pub/sub only if `LISTEN/NOTIFY` cannot fan
progress out to the number of API instances in use.
