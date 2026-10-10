---
type: epic
title: 'Platform baseline'
parent: initiative-real-estate-intelligence
covers: []
after: []
assignee: ''
risk: medium
---

# Platform baseline

## Description

The stack every other epic builds on: NestJS 12 without Mastra, the shared kernel, the `platform`
schema with outbox and inbox, RabbitMQ, the resilience composition, enforced context boundaries, the
ADRs the MVP still owes and a deployed, observable stack. It carries no business capability; it
delivers the constraints of the spec that every context depends on.

## Outcome

For the builders of epics 2 to 6: each context opens on a working, deployed stack with one way to
publish an event, call an external system and cross a boundary; the signal is that the five MVP
epics start in parallel without editing shared files.

## Requirements

- B1: NestJS 12 and LangGraph replace NestJS 11 and Mastra with no change of behaviour; no Mastra
  dependency or `npm` call remains. (ADR 0007; architecture.md, Delivery)
- B2: The `shared/` kernel of each package: `Money`, `Provenance`, the domain-event base, UUID v7
  identifiers, clock, transaction and outbox ports, the database connection. `pricePerSquareMeter`
  moves into the `market` context instead. (ADR 0011)
- B3: The `platform` schema with outbox, inbox and idempotency keys; the relay in `apps/worker`;
  `EventPublisher` with RabbitMQ and in-memory adapters; pruning of published and consumed rows.
  (ADR 0012)
- B4: The resilience composition of ADR 0013 as named configuration around adapters, with the closed
  failure set and policy telemetry. (ADR 0013)
- B5: Boundaries enforced: import zones for the nine contexts in the root ESLint configuration, one
  empty Nest module per context wired in API and worker, a migration-number block per epic and the
  `NNNN_<context>_<description>.sql` convention. (ADR 0011)
- B6: `@rei/contracts` conventions: error with request identifier, pagination, provenance and money
  shapes, one barrel per context. (spec, Constraints, Architecture and operations)
- B7: Compose holds PostgreSQL, RabbitMQ (5672, 15672) and MinIO beside the four applications;
  `env.example` and CI follow. (ADR 0012; architecture.md, Infrastructure and ports)
- B8: OpenTelemetry trace context travels through the outbox, the broker and consumers. (ADR 0005,
  ADR 0012)
- B9: A thin `audit` context: an append-only log fed by events. (ADR 0011)
- B10: The two ADRs the MVP owes are accepted: Zero Data Retention on every route; field allowlist,
  image fingerprints, sanitized and encrypted snapshots, 30-day expiry and suppression list.
  (architecture.md, Decisions awaiting an ADR)
- B11: The instruction files are corrected: NestJS 12 and LangGraph, product specifications under
  `_bmad-output/`, RabbitMQ in the workspace port table. (spec, Constraints, Process)
- B12: The stack is deployed on the owner's Linux VPS behind the existing domain and TLS, with
  `/ready` reporting PostgreSQL and the broker. (spec, Constraints, Architecture and operations)

## Done when

1. `docker compose up` starts API, worker, AI service, web, PostgreSQL, RabbitMQ and MinIO;
   `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passes locally and in
   CI, and `pnpm why mastra` finds nothing.
2. The integration test of the outbox passes against real PostgreSQL and RabbitMQ: an event written
   in a transaction reaches its consumer once in effect, a redelivery is skipped, and a broker
   restart in between loses nothing.
3. A file that imports another context past its `index.ts` fails `pnpm run lint`.
4. The policy tests pass with a fake clock: retry with backoff and jitter, breaker open and
   half-open, per-attempt timeout, fallback.
5. ADRs for Zero Data Retention and for the handling of collected data are accepted under
   `specs/adrs/`, and the three instruction files name NestJS 12, LangGraph and RabbitMQ.
6. The public address answers `/ready` with every dependency up, and one trace shows a request, its
   outbox row, the publish and the consumer.

## Boundaries

`shared/` of every package, the `platform` schema, the thin `audit` context, Compose, CI and
deployment. No business rule of any other context. It owns every edit to the root ESLint
configuration, `compose.yaml`, `env.example` and CI during the MVP; another epic that needs one asks
for it here.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Decision: the cross-cutting foundations are their own opening epic (owner, 2026-10-10).
- Decision: the VPS with Docker, the domain with TLS and an AI Gateway key with Zero Data Retention
  already exist (owner, 2026-10-10).
- Decision: `pricePerSquareMeter` lives in the `market` context and other contexts reach it through
  its facade, because `shared/` holds no business rule (ADR 0011) (owner, 2026-10-10).
- Assumption: the thin `audit` context lives here because `collection`, `properties` and `ask` all
  feed it and none depends on another for it.
- Decision: entry 3 is the tracer bullet. Entry 11 precedes every code story because the spec and
  ADR 0007 require the instruction files corrected first; entries 1 and 2 precede the tracer because
  it runs on NestJS 12 and uses the ports of the kernel (2026-10-10).
- Assumption: this epic owns the structure of the environment example file and of `compose.yaml`;
  the entry of any epic that introduces a setting adds it there.
