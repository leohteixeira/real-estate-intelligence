# ADR 0003 — PostgreSQL driver, ORM and migrations

- **Status:** accepted
- **Date:** 2026-08-20

## Context

PostgreSQL is the primary database. The specification foresees PostGIS for geospatial queries and
`pgvector` for semantic search, both as future (V2) capabilities, and requires deterministic
calculations for price per m², comparables and market metrics.

## Decision

- Data access through the **`pg` (node-postgres) 8.23.0 driver**, wrapped in the
  `DatabaseConnection` class of `@rei/infrastructure`. **No ORM**: no Prisma, no TypeORM, no
  Drizzle, no Kysely.
- No `pg` type is re-exported. The applications receive `DatabaseConnection`, not `Pool`.
- Migrations are **versioned SQL files** in `migrations/`, applied in lexicographic order by
  `scripts/migrate.sh`, which tracks what has already run in the `schema_migrations` table.
- The Compose image is `postgis/postgis:18-3.6-alpine`, which makes PostGIS available, but **no
  extension is enabled**: the migration that needs `postgis` or `vector` runs the corresponding
  `CREATE EXTENSION` and justifies the need.
- Connection errors go through `redactConnectionError` before being logged.
- Timestamps in UTC (`timestamptz`); the pair (source, identifier at the source) carries a
  uniqueness constraint, so that ingestion is idempotent.

The ORM was rejected mainly because of the domain: geospatial queries, comparables and price time
series are exactly the kind of SQL that ORMs hide behind abstractions that are hard to audit. The
specification requires those calculations to be explainable.

## Consequences

Row-to-object mapping written by hand, with more code per query and no migrations generated
automatically from a declarative schema. In exchange, the SQL that produces an average price per
neighborhood stays visible and reviewable.

## Reassessment trigger

Adopt a typed query builder such as Kysely once manual mapping passes roughly 30 queries or starts
producing recurring defects. Reassess Prisma only if it gains native PostGIS support.
