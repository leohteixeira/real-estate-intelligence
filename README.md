# Real Estate Intelligence

Platform for collecting, normalizing, tracking and analyzing public real estate data. The goal is
not a listing aggregator, but a market intelligence layer that answers questions about price per
square meter, appreciation by region, recent price drops, stale listings and undervalued
properties.

The product specification lives at `/workspace/docs/real_state_intelligence.md`.

> Current state: **foundation**. Structure, tooling and processes are in place; there are no
> entities, no collectors, no comparables and no business endpoints.

## Stack

| Layer       | Choice                                                      |
| ----------- | ----------------------------------------------------------- |
| API         | NestJS 11 on Express (port 8200)                            |
| Worker      | Nest standalone application context                         |
| AI          | Mastra 1.25 in a separate application (port 4111), no tools |
| Persistence | PostgreSQL 18 with PostGIS available, `pg` driver, no ORM   |
| Migrations  | versioned SQL applied by `scripts/migrate.sh`               |
| Web         | React 19 + Vite 8 + TypeScript 5.9.3 (port 3200)            |
| Telemetry   | OpenTelemetry Node 0.221, preloaded through `node -r`       |
| Tests       | Vitest 4                                                    |

The decisions are recorded in [`specs/adrs/`](specs/adrs/).

## Layout

```text
apps/
├── web/       # React frontend
├── api/       # NestJS: HTTP and application orchestration
├── worker/    # crawling and asynchronous jobs
└── ai/        # Mastra runtime, isolated
packages/
├── domain/          # canonical model and deterministic rules
├── application/     # use cases and ports
├── contracts/       # types of the versioned HTTP contract
└── infrastructure/  # adapters; vendor SDKs only here
migrations/    # versioned SQL
specs/adrs/    # architecture decisions
```

The dependency direction is always inwards:
`@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.

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

| Method | Route     | Description                                            |
| ------ | --------- | ------------------------------------------------------ |
| `GET`  | `/health` | Liveness. Touches no dependency at all.                |
| `GET`  | `/ready`  | Readiness. Answers 503 when PostgreSQL does not reply. |
| —      | `/api/v1` | Versioned contract surface, still empty.               |

## Ports

Web 3200, API 8200, Mastra 4111, PostgreSQL 5434, Valkey 6380, MinIO 9100/9101.

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
