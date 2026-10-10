# @rei/application

Use cases and **ports**. Depends on `@rei/domain` only.

Ports are interfaces declared here and implemented by adapters in `@rei/infrastructure`. The
dependency direction is always inwards:
`@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.

One folder per bounded context, mirroring `@rei/domain` (ADR 0011). Inside it, one folder per
aggregate holds the service, the repository port and the event handlers; the context root holds
its facade, the ports to external systems and the `index.ts` that exports the facade, its DTOs and
the event contracts, and nothing else. `shared/` owns only context-neutral consumer-side ports:
database availability, clock, opaque transactions and transaction-bound outbox appends. It does
not contain a repository, provider SDK or persistence implementation.

- A query across contexts goes through a facade. A change across contexts is an event appended to
  the outbox in the same transaction as the aggregate (ADR 0012).
- A port to an external system is named for the capability, such as `RawSnapshotStore`, never for
  the vendor, and exposes no vendor type or error (ADR 0013).
