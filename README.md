# Real Estate Intelligence

Platform for collecting, normalizing, tracking and analyzing public real estate data. The goal is
not a listing aggregator, but a market intelligence layer that answers questions about price per
square meter, appreciation by region, recent price drops, stale listings and undervalued
properties.

The product specification lives under
[`_bmad-output/`](_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/),
the decisions under [`specs/adrs/`](specs/adrs/) and the architecture document, with its diagrams,
at [`docs/architecture/architecture.html`](docs/architecture/architecture.html).

> Current state: **foundation**. Structure, tooling and processes are in place; there are no
> entities, no collectors, no comparables and no business endpoints.

## Stack

| Layer       | Choice                                                                |
| ----------- | --------------------------------------------------------------------- |
| API         | NestJS 12 on Express (port 8200)                                      |
| Worker      | NestJS 12 standalone application context                              |
| AI          | NestJS 12 + LangGraph in a separate application (port 4111), no tools |
| Persistence | PostgreSQL 18 with PostGIS available, `pg` driver, no ORM             |
| Migrations  | versioned SQL applied by `scripts/migrate.sh`                         |
| Web         | React 19 + Vite 8 + TypeScript 6.0.3 (port 3200)                      |
| Telemetry   | OpenTelemetry Node 0.221, preloaded through `node -r`                 |
| Tests       | Vitest 4                                                              |

The decisions are recorded in [`specs/adrs/`](specs/adrs/).

## Layout

```text
apps/
├── web/       # React frontend
├── api/       # NestJS: HTTP and application orchestration
├── worker/    # crawling and asynchronous jobs
└── ai/        # NestJS + LangGraph runtime, isolated
packages/
├── domain/          # canonical model and deterministic rules
├── application/     # use cases and ports
├── contracts/       # types of the versioned HTTP contract
└── infrastructure/  # adapters; vendor SDKs only here
migrations/    # versioned SQL
specs/adrs/    # architecture decisions
docs/
├── architecture/    # architecture document (HTML, opens in a browser)
└── design/          # design system and screen canvas
```

The dependency direction is always inwards:
`@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.

## Architecture

A modular monolith: the logical boundaries are fixed now, and a separate deploy or database for a
module is a later, operational choice. ADRs 0011 to 0013 describe the target; no
context holds business code yet.

| Context       | Class      | Owns                                                         |
| ------------- | ---------- | ------------------------------------------------------------ |
| `properties`  | Core       | `Property`, `Listing` and its history, entity resolution     |
| `market`      | Core       | Deterministic place figures and their movement               |
| `comparables` | Core       | Comparable sets by stated criteria (V2)                      |
| `collection`  | Supporting | Source register, collection runs, raw snapshots, suppression |
| `locations`   | Supporting | Place hierarchy and reference geography                      |
| `ask`         | Supporting | Threads, natural-language runs, checkpoints, quota           |
| `alerts`      | Supporting | Alert rules and the inbox (after the MVP)                    |
| `audit`       | Generic    | Append-only audit log                                        |
| `identity`    | Generic    | Principal and roles behind Keycloak (after the MVP)          |

- A context is the same folder name in each package and application; inside it, files are grouped
  by aggregate and the technical layer is a suffix.
- A context is the only reader and writer of its PostgreSQL schema. Another context is reached
  through its facade, for a query, or through an event, for a change.
- Events are written to an outbox in the transaction that changes the aggregate and published to
  RabbitMQ by a relay in the worker. Consumers are idempotent.
- Every external system sits behind a port and an adapter, wrapped by one resilience composition:
  timeout, retry with capped exponential backoff and jitter, circuit breaker with a named fallback,
  and an idempotency key on every write.

`@rei/ai` does **not** depend on `@rei/infrastructure`, does not receive `DATABASE_URL` and does not
instantiate a connection pool. It reaches the domain only through typed tools that call `/api/v1`.

## Getting started

```bash
cp env.example .env          # adjust if needed
pnpm install --frozen-lockfile
pnpm run build               # the packages must exist before running the apps
lefthook install             # installs the git hooks
```

The example file is named `env.example`, without a leading dot, because the workspace root
`.claudeignore` excludes every `.env.*` path.

## Commands

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build

pnpm --filter "@rei/api" dev      # http://0.0.0.0:8200
pnpm --filter "@rei/worker" dev
pnpm --filter "@rei/web" dev      # http://0.0.0.0:3200
pnpm --filter "@rei/ai" dev       # http://0.0.0.0:4111

docker compose up -d                       # postgres, api, worker, ai, web
docker compose --profile optional up -d    # + valkey and minio
DATABASE_URL=postgres://realestate:realestate@localhost:5434/real_estate_intelligence \
  ./scripts/migrate.sh
```

The API and the worker are started with `node -r ./dist/otel.js dist/main.js`. The preload is
mandatory: without it the process still starts, but without instrumentation, because `http`,
`express` and `pg` would already have been loaded by the time the SDK tried to instrument them.

## Endpoints

| Service | Method | Route     | Description                                            |
| ------- | ------ | --------- | ------------------------------------------------------ |
| API     | `GET`  | `/health` | Liveness. Touches no dependency at all.                |
| API     | `GET`  | `/ready`  | Readiness. Answers 503 when PostgreSQL does not reply. |
| API     | —      | `/api/v1` | Versioned contract surface, still empty.               |
| AI      | `GET`  | `/health` | Dependency-free liveness.                              |

## Ports

Web 3200, API 8200, AI 4111, PostgreSQL 5434, Valkey 6380, MinIO 9100/9101.

## Quality

The lefthook hooks run gitleaks, prettier, markdownlint, hadolint and ESLint on `pre-commit`; they
validate Conventional Commits on `commit-msg`; and they run the gitleaks history scan plus lint,
typecheck, tests and build on `pre-push`.

```bash
lefthook run pre-commit --all-files
gitleaks git --redact --no-banner
```

Everything in this repository is written in English: code, identifiers, comments, branch names,
commit messages, specifications and documentation. Commits follow Conventional Commits.
