# ADR 0010 — Durable AI runs and remote checkpoints

- **Status:** accepted
- **Date:** 2026-10-09

## Context

Natural-language runs can wait for capacity, survive process restarts and pause for user
confirmation. In-memory execution would lose progress, while direct database or broker access from
the AI runtime would violate its isolation boundary.

## Decision

- The NestJS API is the public facade for run creation, inspection, confirmation, cancellation and
  Server-Sent Events.
- RabbitMQ carries durable run commands. API and worker own broker credentials, acknowledgements,
  idempotency, redelivery and dead-letter handling; `apps/ai` has no broker access.
- PostgreSQL is the source of truth for threads, runs and LangGraph checkpoints. The API owns this
  persistence and exposes a typed internal saver contract to `apps/ai`; the AI runtime never opens
  a database connection.
- Runs execute serially within a thread and concurrently across threads. A thread initially allows
  three pending runs, and a queued run expires after two minutes.
- Checkpoints are retained for 30 days and keep the terminal state plus up to eight relevant turns.
- Public progress uses resumable, versioned SSE and always reaches an explicit terminal event.
- The MVP protects a thread with an opaque capability and public-demo quotas. Ownership contracts
  reserve a principal identifier for future Keycloak integration.

## Consequences

Runs survive API, worker and AI-process restarts without granting infrastructure credentials to the
graph runtime. The API becomes responsible for storage lifecycle and stream resumption, while the
worker becomes responsible for delivery semantics and per-thread ordering.

ADR 0005's AI instrumentation trigger is now met: traces must correlate HTTP, AMQP, graph nodes,
decision calls, tools, model calls and checkpoint operations.

## Reassessment trigger

Reassess remote checkpoints if measured latency makes node-level persistence impractical, or move
from capability ownership to Keycloak when authenticated multi-user access enters scope.
