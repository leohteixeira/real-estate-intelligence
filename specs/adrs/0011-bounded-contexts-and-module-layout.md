# ADR 0011 — Bounded contexts, module layout and state ownership

- **Status:** accepted
- **Date:** 2026-10-10

## Context

The brief lists twelve conceptual modules (`properties`, `listings`, `locations`, `collectors`,
`snapshots`, `market`, `comparables`, `analytics`, `search`, `agents`, `alerts`, `audit`) and the
foundation created one empty folder for each in `@rei/domain`. Nothing states which of them are
bounded contexts, which tables each one owns, how one reaches another or how files are laid out
inside one. The first data story would otherwise settle all of that by accident.

Two forces pull in different directions. Co-locating everything of one business concept in one
folder keeps discovery cheap. The four layer packages (`@rei/domain`, `@rei/application`,
`@rei/contracts`, `@rei/infrastructure`) make the inward dependency rule a compile-time fact and
are what keeps `@rei/ai` away from infrastructure (ADR 0007).

## Decision

### Nine bounded contexts

| Context       | Class      | Owns                                                                              | Absorbs from the brief             |
| ------------- | ---------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| `properties`  | Core       | `Property`, `Listing` and its history, entity resolution, property search         | `properties`, `listings`, `search` |
| `market`      | Core       | Deterministic place figures, market snapshots, movement, place-level sale figures | `market`, `analytics`              |
| `comparables` | Core       | Comparable sets and their criteria (V2)                                           | `comparables`                      |
| `collection`  | Supporting | Source register, collection runs, raw snapshots, suppression list                 | `collectors`, `snapshots`          |
| `locations`   | Supporting | Place hierarchy and reference geography                                           | `locations`                        |
| `ask`         | Supporting | Threads, natural-language runs, run events, checkpoints, demo quota               | `agents`                           |
| `alerts`      | Supporting | Alert rules, followed items, the inbox (after the MVP)                            | `alerts`                           |
| `audit`       | Generic    | Append-only audit log                                                             | `audit`                            |
| `identity`    | Generic    | Security principal and roles behind Keycloak (after the MVP)                      | New                                |

- `Property` and `Listing` stay distinct entities inside one context. They share one vocabulary,
  every screen reads them together and a merge moves listings between properties; two contexts
  would turn each of those into a cross-context read.
- `search` is a query over the tables of `properties`, not a context. It becomes one only if a
  dedicated index arrives.
- "Run" means a collection run in `collection` and a natural-language run in `ask`. The contexts
  are named so that neither word needs a prefix inside its own boundary.
- Tactical depth follows the class: rich aggregates, value objects, invariants and domain events
  in the Core contexts; a small aggregate where a real rule exists in the Supporting ones (the run
  state machine, the source review); a thin model in the Generic ones.

### Layer packages stay; a context is a folder of the same name in each

```text
packages/domain/src/<context>/<aggregate>/          entity, value objects, events, rules
packages/application/src/<context>/<aggregate>/     service, repository port, event handlers
packages/application/src/<context>/                 <context>.facade.ts, external ports, index.ts
packages/infrastructure/src/<context>/              SQL repositories and adapters
packages/contracts/src/<context>/                   shapes of the versioned HTTP contract
apps/api/src/<context>/                             Nest module and controllers
apps/worker/src/<context>/                          Nest module, consumers and jobs
```

- Inside a context, files are grouped by aggregate, never by technical layer. The layer is a
  suffix: `.entity.ts`, `.vo.ts`, `.events.ts`, `.types.ts`, `.service.ts`, `.repository.ts`
  (port), `.port.ts`, `.handler.ts`, `.facade.ts`, `.pg-repository.ts`, `.adapter.ts`, `.dto.ts`,
  `.controller.ts`, `.consumer.ts`, `.job.ts`, `.module.ts`.
- Depth is context, aggregate, file. A folder exists only for two or more cohesive files; a single
  file takes a suffix instead. Every context is flat: none passes the test for sub-domains.
- `shared/` in each package holds what no context owns: the domain kernel (`Money`, `Provenance`,
  the domain-event base, identifiers), the outbox, transaction and clock ports, the database
  connection, the messaging and resilience plumbing. It holds no repository and no business rule.
- Tests stay beside the file they cover, as `*.test.ts` (ADR 0004).
- `apps/ai` is organized by capability (routing, explanation, tools, checkpoint), each with its
  port beside its adapters. No SDK type leaves an adapter (ADR 0007).

### Boundaries

- A context is imported only through its `index.ts`, which exports its facade, the DTOs the facade
  returns and its event contracts. Entities, services and repositories of another context are
  never imported.
- A facade only delegates. A synchronous call across contexts is a facade query that returns DTOs.
  A state change in another context happens through an event (ADR 0012).
- One transaction changes one aggregate. A rule that spans aggregates is eventual.
- The boundaries are checked by import zones in the root ESLint configuration, added with the
  first context that holds code.

### State ownership

- One PostgreSQL database, one schema per context, named after it. A context is the only writer
  and the only reader of its schema.
- No foreign key crosses a schema. Another context is referenced by identifier, validated in code.
- The `platform` schema holds the outbox, the inbox and the idempotency keys. It is written only
  through the ports of `shared/`.
- A migration touches one schema and is named `NNNN_<context>_<description>.sql`.
- Identifiers are UUID version 7, generated by PostgreSQL 18.

## Consequences

One business concept is spread over up to six places, so finding it costs more than in a layout
with one package per context. In exchange the dependency rule stays enforced by the compiler, the
isolation of `@rei/ai` stays a property of the package graph and the workspace layout is unchanged.
The same context and aggregate names in every package keep the search mechanical.

`market` and `comparables` cannot read the tables of `properties`. `market` keeps its own price
facts, fed by events; `comparables` asks the facade of `properties` for candidates. Both cost code
that a join would have saved.

The twelve placeholder folders of `@rei/domain` are replaced by the nine contexts.
`packages/application/src/ports/` and `packages/infrastructure/src/persistence/` move under
`shared/` with the first story that touches them.

## Reassessment trigger

Move to one package per context if cross-package navigation becomes a recurring cost in reviews, or
when a context is promoted to its own deploy. Split a context only when four of these six differ
inside it: persona, authorization, execution model, scaling, deployment, failure isolation.
