# ADR 0013 — Anti-corruption layer and resilience for external systems

- **Status:** accepted
- **Date:** 2026-10-10
- **Extends:** ADR 0009

## Context

ADR 0009 bounds failure and cost for the AI providers only. Listing sources, object storage, the
broker, the AI service seen from the worker and, later, Keycloak and the open-data files fail in
the same ways and have no policy. The ports named so far (`ObjectStorage`, `ListingSource`,
`LanguageModel`) are a list, not a rule: nothing says who declares a port, what may cross it or
what a retry is allowed to repeat.

## Decision

### Anti-corruption layer

- Every external system is reached through a port declared by the context that needs it, in
  `@rei/application`, and named for the capability, not the vendor. The adapter lives in
  `@rei/infrastructure`, or in `@rei/ai` for AI providers, and translates the vendor model to the
  canonical one in both directions.
- No vendor type, error, status code or identifier format crosses a port. An adapter maps failures
  to a closed set: transient, rejected, unauthorized, exhausted, forbidden by policy, cancelled.
- Every port has an in-memory fake used by unit tests (ADR 0004).

| Port                           | Context      | Adapters                                                  |
| ------------------------------ | ------------ | --------------------------------------------------------- |
| `ListingSource`                | `collection` | Synthetic dataset, open-data file, a reviewed site or API |
| `RawSnapshotStore`             | `collection` | S3-compatible storage (MinIO, R2)                         |
| `TransactionSource`            | `market`     | ITBI files, once their reuse is confirmed                 |
| `ReferenceGeography`           | `locations`  | GeoSampa fiscal blocks (V2)                               |
| `RunExecutor`                  | `ask`        | Internal HTTP to the AI service                           |
| `IdentityProvider`             | `identity`   | Keycloak (after the MVP)                                  |
| `EventPublisher`               | `shared`     | RabbitMQ; in-memory for tests                             |
| `IntentDecider`                | `apps/ai`    | Jev through the gateway; the heuristic                    |
| `LanguageModel`                | `apps/ai`    | Primary and secondary models through the gateway          |
| `CheckpointSaver`, typed tools | `apps/ai`    | Internal HTTP to the API                                  |
| Embedding model, reranker (V2) | `apps/ai`    | External API or local model                               |

`RawSnapshotStore` replaces the `ObjectStorage` port named earlier: the context asks to keep, read
and delete a snapshot, and the adapter owns keys, buckets and encryption at rest. `ListingSource`
both fetches and parses, so a stored snapshot can be parsed again without a request to the source.

### One policy composition

The composition of ADR 0009 applies to every adapter that leaves the process, in API and worker as
in `apps/ai`, through `@nestjs/resilience`: fallback, bulkhead, circuit breaker, retry, rate
limiter, per-attempt timeout, from the outside in. An adapter makes one attempt and never retries
by itself. A redelivered message is the retry of a job; it is not multiplied by a retry inside the
adapter.

- **Retry.** Transient failures only, within the remaining deadline, with capped exponential
  backoff and full jitter: `sleep = random(0, min(cap, base * 2^attempt))`. `Retry-After` is
  honoured when it fits the deadline.
- **Retry budget.** Retries are capped at about one tenth of the calls in a rolling window.
- **Circuit breaker.** Opens on the error rate of a sliding time window with a minimum number of
  calls, and on slow calls. One logical operation is one outcome.
- **Bulkhead.** One pool per dependency, so a failing one cannot take the capacity of another.
- **Fallback.** Every breaker has a named fallback. None returns an improvised result.

### Idempotency

Only an idempotent operation is retried. A write carries a key that the receiver deduplicates.

| Operation                   | Key                                              |
| --------------------------- | ------------------------------------------------ |
| Create a run                | `Idempotency-Key` header, kept in `platform`     |
| Store a listing observation | Source and identifier at the source (ADR 0003)   |
| Store a raw snapshot        | Content hash, used as the object key             |
| Publish an event            | Event identifier, sent as the message identifier |
| Consume an event            | Consumer name and event identifier (ADR 0012)    |
| Execute a run step          | Run identifier and step                          |
| Save a checkpoint           | Thread and checkpoint identifiers                |

### Policy per adapter

| Adapter                    | Retried                               | Not retried                             | Fallback when the breaker is open                   |
| -------------------------- | ------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| Listing source             | `429`, `5xx`, timeout, network        | Login wall, CAPTCHA, block, `403`       | Pause the run at its checkpoint; source is degraded |
| Raw snapshot store         | Timeout, network, `5xx`               | Access denied                           | Fail the job for redelivery; nothing is parsed      |
| Event publisher            | Timeout, network, missing confirm     | Rejected message                        | The row stays pending in the outbox                 |
| Run executor               | Nothing at the HTTP layer             | Everything; redelivery repeats the step | The run fails with a typed reason                   |
| Checkpoint saver and tools | Timeout, network, `5xx` on safe calls | `4xx`                                   | The node fails; the run fails or is redelivered     |
| Identity provider          | Key-set fetch                         | Invalid token                           | Last key set within its lifetime, else refuse       |
| Jev and generative models  | ADR 0009                              | ADR 0009                                | ADR 0009                                            |

- A block by a source is never retried or worked around: it opens the circuit at once and disables
  the source until its register entry is reviewed.
- The rate limiter of a listing source takes its rate from the source register, and image requests
  consume it.
- PostgreSQL is not wrapped in a breaker. Pool and statement timeouts bound it and `/ready` reports
  it.

### Configuration and telemetry

- Each policy is a named configuration object. Timings and thresholds live there, are calibrated in
  the stories with fake clocks and never appear as constants in an adapter. Starting values: base
  100 ms, factor 2, cap 30 s and three to five attempts for service calls; base 1 s and cap 5 min
  for listing sources; breaker at half the calls failing among at least twenty in ten seconds.
- Policy events feed OpenTelemetry per dependency: retry, timeout, bulkhead rejection, breaker
  transition, rate limiting and fallback, without payloads or credentials.

## Consequences

Swapping a vendor is writing an adapter, and every dependency fails in a bounded, visible and
uniform way. Each new adapter owes a failure mapping, a fake and a policy before it ships, and the
policies add configuration that has to be calibrated instead of guessed.

## Reassessment trigger

Add a durable-execution engine only if a process other than a natural-language run must resume
step by step after a crash and checkpoints plus redelivery do not cover it. Revisit the starting
values with the first production measurements.
