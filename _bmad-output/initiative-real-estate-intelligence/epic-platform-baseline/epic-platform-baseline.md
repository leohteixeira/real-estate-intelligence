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

- Owner execution update (2026-10-25): publish exact gated `feat/phase-1` commits while the goal
  is in progress; integrate into `main` after all stories are complete. This supersedes the
  earlier default-branch/main-only publication requirement in D-088/D-090 and story 1.12.
  Preserve CI, five immutable image identities, public HTTPS/readiness/Tempo evidence and
  all functional acceptance. Workflow push/publication selectors include the exact branch.

- D-090 (2026-10-25): continuation uses the existing site's explicit public prefix, Vite base,
  router basename and native-link prefixing. GHCR publication is serial and restricted to main
  after all existing CI gates. Scoped operator commands reuse the lock/protected configuration
  for dedicated PG18, private bucket-scoped snapshot storage and the existing broker/Tempo chain.
  Actual restore verification precedes migration; failed migration retains stopped writers and
  Caddy validation/reload is a separate post-health operation. No global start or shared PG17
  change is introduced. Preparation remains uncommitted pending parent review and production proof.

- Owner authorization update (2026-10-25): deliver on the existing VPS using
  `https://leohteixeira.com/real-estate-intelligence/`, preserving exact-root redirects to the
  project presentation and opening the demo at an operational route such as `places`. Required
  push, PR, CI, image publication, merge to `main`, scoped infrastructure changes and production
  checks are authorized. Shared PostgreSQL must remain unchanged; provision a dedicated PG18
  instance. Preserve landing availability, project data and one heavy job at a time. This
  supersedes the earlier subdomain proposal and authorization deferral, not missing evidence.
- Story 1.12 local delivery adds independent database/broker readiness, an exact web `/ready`
  proxy, CI image builds without publishing, application-only production Compose and the
  [VPS runbook](../../../docs/operations/deployment.md). These prepared artifacts do not establish
  B12 or done criterion 6: authorized `main` deployment, public HTTPS readiness, remote CI and a
  linked production Tempo trace remain pending (2026-10-25).

- Decision: deployment preparation reuses the shared OpenTelemetry collector and existing
  Grafana Tempo backend (D-088). Public readiness, deployment from `main`, and the production
  request/outbox/publish/consumer trace remain unverified until authorized deployment. PostgreSQL
  18 compatibility and object storage are explicit prerequisites; the shared PostgreSQL 17 instance
  must not be changed by this story (agent, on the owner's behalf, 2026-10-25).
- Decision: the cross-cutting foundations are their own opening epic (owner, 2026-10-10).
- Decision: the VPS with Docker, the domain with TLS and an AI Gateway key with Zero Data Retention
  already exist (owner, 2026-10-10).
- Decision: `pricePerSquareMeter` lives in the `market` context and other contexts reach it through
  its facade, because `shared/` holds no business rule (ADR 0011) (owner, 2026-10-10).
- Decision: every external model route receiving user text proves Zero Data Retention before
  transmission, fails closed without current evidence and never falls back to a less private route.
  The primary model stays behind the gateway until a direct route proves the same guarantee (ADR
  0014).
  (agent, on the owner's behalf, 2026-10-10).
- Decision: real listings use the closed collected-data allowlist; image-fetch and listing-text
  permissions default to denied; photographs are discarded after deterministic fingerprinting;
  sanitized, encrypted snapshots expire after 30 days while their hash remains; and suppression
  survives erasure and prevents recollection (ADR 0015) (agent, on the owner's behalf, 2026-10-10).
- Assumption: the thin `audit` context lives here because `collection`, `properties` and `ask` all
  feed it and none depends on another for it.
- Decision: classic consumer queues use application-confirmed retry and dead-letter transfers with
  five normal delivery attempts. Published outbox rows are retained seven days, inbox markers
  thirty days, and a bounded instrumented pruning cycle runs every five minutes (ADR 0017)
  (owner, 2026-10-10).
- Decision: entry 3 is the tracer bullet. Entry 11 precedes every code story because the spec and
  ADR 0007 require the instruction files corrected first; entries 1 and 2 precede the tracer because
  it runs on NestJS 12 and uses the ports of the kernel (2026-10-10).
- Decision: V8 coverage is enforced independently per workspace at 80% for lines, statements, and
  functions and at 75% for branches; exclusions are limited to justified generated, declarative,
  composition-root, and browser-verified visual-shell code (owner, D-003, 2026-10-10).
- Decision: the named EventPublisher policy uses five transient-only attempts with 100 ms
  factor-two full-jitter backoff capped at 30 seconds and a 10% rolling 60-second retry budget; a
  10-active/15-waiting bulkhead, 100-attempt-per-second limiter, two-second attempt timeout, and a
  50%-of-20-in-10-seconds breaker also opening on 1.5-second logical calls bound the dependency.
  Its named fallback always rejects so the outbox row remains pending (agent, on the owner's
  behalf, D-005, 2026-10-10).
- Assumption: this epic owns the structure of the environment example file and of `compose.yaml`;
  the entry of any epic that introduces a setting adds it there.
- Decision: every integration campaign uses Vitest, Supertest for real HTTP and Testcontainers
  for isolated real infrastructure; Nock intercepts controlled external HTTP dependencies only.
  Do not use Node test/assert, hand-written assertion frameworks or Vitest wrappers around the
  old campaign subprocesses. Preserve existing guarantees, fault/restart/upgrade scenarios,
  cleanup and workspace coverage floors; audit owns its isolated fixture rather than the default
  stack. Basic fixture file/cryptographic APIs are not a second test framework. D-039 records the
  owner's explicit request and implementation boundaries (owner, 2026-10-11; agent, on the owner's
  behalf, 2026-10-11).
  The normative record is [ADR 0020](../../../specs/adrs/0020-vitest-integration-standard.md);
  [the integration guide](../../../docs/testing/integration.md) defines execution and new tests.
- Decision: the owner additionally requires TypeScript for every integration campaign, helper
  and fresh-process probe. D-040 requires a strict integration compiler gate in root typecheck,
  meaningful types without explicit any or checking suppressions, preserved real-service proofs
  and an updated TypeScript Vitest configuration (owner, 2026-10-11; agent, on the owner's behalf,
  2026-10-11). JavaScript verification remains baseline evidence, not final typed verification.

- Story 1.13 reconciliation (2026-10-26): both deferred instruction findings from story 1.11
  are closed by the delivered Nest migration and current workspace AGENTS. Other plans have no
  deferred review findings; their UUID, delivery, resilience, tracing, retention and production
  prerequisites are covered by their completed owning stories. Story 1.12 records the accepted
  manual `feat/phase-1` release, public prefixed readiness and linked Tempo trace; this supersedes
  the historical pending-production notes above. No remote CI or registry receipt is claimed.
  The legacy concurrent-publisher handoff instant remains modeled by ordering tests plus real
  upgrade coverage, without a synchronized live-race claim or a demonstrated open defect.
  No runtime refactor is justified by the recorded findings. The unchanged-code full gate and
  separately verified manual release delta remain applicable; later business production journeys
  retain their own acceptance and are not inferred from platform closure.
