# Migrations

Migrations are versioned SQL files, applied in lexicographic order by `scripts/migrate.sh`. The
decision to use explicit SQL, with no ORM, is recorded in
[`../specs/adrs/0003-persistence-driver-and-migrations.md`](../specs/adrs/0003-persistence-driver-and-migrations.md).

## Naming convention

```text
NNNN_description_in_snake_case.sql
```

`NNNN` is a four-digit sequential counter, never reused.

## Rules

- Dates and timestamps are stored in UTC (`timestamptz`).
- External identifiers (source + id at the source) carry a uniqueness constraint, so that ingestion
  is idempotent.
- The `postgis` and `vector` extensions are available in the Compose image but are **not** enabled:
  the migration that needs one of them runs the corresponding `CREATE EXTENSION` and justifies the
  need.
- No business migration exists yet: the repository is in the foundation phase.
