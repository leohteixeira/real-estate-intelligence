# Real Estate Intelligence

Platform for collecting, normalizing, tracking and analyzing public real estate data. The goal is
not a listing aggregator, but a market intelligence layer that answers questions about price per
square meter, appreciation by region, recent price drops, stale listings and undervalued
properties.

The product specification lives under
[`_bmad-output/`](_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/),
the decisions under [`specs/adrs/`](specs/adrs/) and the architecture document, with its diagrams,
at [`docs/architecture/architecture.html`](docs/architecture/architecture.html).

The CAP-28 privacy records are the
[record of processing operations](docs/privacy/record-of-processing-operations.md) and the
[legitimate-interest assessment](docs/privacy/legitimate-interest-assessment.md).
Both are version 1, accepted as an engineering baseline by the agent on the owner's behalf,
2026-10-10, under D-019. Real processing remains disabled pending their source-specific gates.

> Current state: **synthetic contract foundation**. Collection plumbing and deterministic synthetic
> replay exist. Verified owned-synthetic parsed events now persist an initial single-listing Property
> and Listing, served through the detail routes. Locations persists twenty synthetic reference places;
> property search and counts remain the unchanged prepared fixtures; place reductions read
> actual persisted Properties' original negative price effects, without matching/grouping.
> Market reads now serve explicitly prepared figures, parent comparison, registered neighbours and
> a twelve-month series. Real-source processing, production matching, full history, production market
> figures and comparables are not enabled.

Ask also provides a [real structured price tracer](docs/api/ask-tracer.md): API-owned durable runs,
production worker delivery and an isolated AI graph calling a scoped backend Market tool. Its
prepared seven-state examples remain read-only and separately labelled. Natural-language extraction,
provider calls, confirmation, complete checkpoints and visitor quota are not part of the tracer.

## Stack

| Layer       | Choice                                                    |
| ----------- | --------------------------------------------------------- |
| API         | NestJS 12 on Express (port 8200)                          |
| Worker      | NestJS 12 standalone application context                  |
| AI          | NestJS 12 + LangGraph (port 4111), scoped HTTP price tool |
| Persistence | PostgreSQL 18 with PostGIS available, `pg` driver, no ORM |
| Migrations  | versioned SQL applied by `scripts/migrate.sh`             |
| Web         | React 19 + Vite 8 + TypeScript 6.0.3 (port 3200)          |
| Telemetry   | OpenTelemetry Node 0.221, preloaded through `node -r`     |
| Tests       | Vitest 4                                                  |

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
module is a later, operational choice. ADRs 0011 to 0013 describe the target; collection owns the
existing ingestion foundation and canonical publication evidence. Properties owns immutable initial
aggregates and incoming facts; locations supplies only known-fixture address references.

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
pnpm run typecheck:integration       # strict integration-only check after compiled packages exist
pnpm run test
pnpm run build
pnpm run test:coverage
pnpm run test:integration             # builds once, then all owned real-service Vitest campaigns
pnpm run test:integration:list        # discovery only; starts no fixtures
pnpm run test:integration:audit       # fourteen delivery proofs on an owned stack (after build)
pnpm run test:integration:healthcheck # four parallel fresh-volume RabbitMQ boots
pnpm run test:integration:properties   # isolated compiled-API synthetic read journey (after build)
pnpm run test:integration:locations    # isolated persisted reference/resolution/SQL/HTTP campaign
pnpm run test:integration:market       # isolated prepared Market HTTP/read-only database campaign
pnpm run test:integration:properties-ingestion # isolated collect → broker → persisted HTTP journey

pnpm --filter "@rei/api" dev      # http://0.0.0.0:8200
pnpm --filter "@rei/worker" dev
pnpm --filter "@rei/web" dev      # http://0.0.0.0:3200
pnpm --filter "@rei/ai" dev       # http://0.0.0.0:4111

docker compose up -d                       # postgres, api, worker, ai, web
docker compose --profile optional up -d    # + valkey and minio
DATABASE_URL=postgres://realestate:realestate@localhost:5434/real_estate_intelligence \
  ./scripts/migrate.sh
```

Integration tests follow [the execution and authoring guide](docs/testing/integration.md) and
[ADR 0020](specs/adrs/0020-vitest-integration-standard.md). They own isolated `rei-` projects and
ports, do not require the default development stack, and never load `.env*`. Every campaign,
helper, probe and the root integration configuration is TypeScript, checked by
`tsconfig.integration.json` through the root typecheck command (D-040). Unit tests retain
`--dir src` and the unchanged per-workspace coverage floors.

The API and the worker are started with `node -r ./dist/otel.js dist/main.js`. The preload is
mandatory: without it the process still starts, but without instrumentation, because `http`,
`express` and `pg` would already have been loaded by the time the SDK tried to instrument them.

## Endpoints

| Service | Method | Route                                                          | Description                                            |
| ------- | ------ | -------------------------------------------------------------- | ------------------------------------------------------ |
| API     | `GET`  | `/health`                                                      | Liveness. Touches no dependency at all.                |
| API     | `GET`  | `/ready`                                                       | Readiness. Answers 503 when PostgreSQL does not reply. |
| API     | `GET`  | `/api/v1/properties`, `/api/v1/listings/:id`, `/api/v1/places` | Synthetic properties, listings and place navigation.   |
| AI      | `GET`  | `/health`                                                      | Dependency-free liveness.                              |

The [properties and locations API reference](docs/api/properties-and-locations.md) documents all
seven GET families, query validation, paging, event contracts, stable fixture IDs, description
permissions, expiry and the explicit synthetic-only limitations. Responses are tagged
`synthetic-stub`; no property read starts collection or writes the outbox. Detail is persisted-first
with prepared fallback. Initial detail is stable across duplicate delivery and worker restart;
verified later observations and parser corrections are stored as pending facts, not applied history.
Descriptions require the source's current display permission on every persisted read, failing closed
when denied or unavailable. Ingestion is restricted to registered owned synthetic sources and exact
known fixture addresses; it is not production normalization or entity resolution.
Locations reads the owned PostgreSQL reference without an in-memory fallback. New observations
resolve to registered fictional street blocks with six crumbs; historical five-crumb snapshots stay
immutable. The two supplementary blocks have null coordinates and zero prepared properties. Exact
accent/case/space and Rua/R. or Avenida/Av. normalization is supported; optional published numbers
select inclusive ranges and are not stored. There is no geocoder, fuzzy matching or real geography.

The [Market API reference](docs/api/market.md) documents parameter-free
`/api/v1/places/:id/market`, `/market/neighbours` and `/market/monthly-series` reads.
Every response declares `basis: 'prepared-market-example'` and a fixed fixture evaluation instant;
these are detached prepared examples over the unchanged catalog, not persisted Market facts.
The parent is the actual registered parent (Pinheiros compares with Zona Oeste); neighbours use
registered adjacency only. Empty registered blocks remain readable with null figures, and sale
prices are explicitly unrecorded. GETs neither ingest data nor write database/outbox state.

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

## Portfolio presentation ownership

The bilingual public presentation now lives in the independent Next portfolio repository at
`https://leohteixeira.com/{en|pt}/projects/real-estate-intelligence`. This application keeps its
operational routes, including `/places`, `/ask`, `/search`, property/listing details and `/privacy`.
The Nginx configuration redirects only the exact `/` root (308) to the English presentation;
API and application deep links keep their existing handlers. A client-side fallback preserves
presentation fragments during local Vite navigation.

The original Placa typography, journey copy, city geometry, WebGL scene, motion controls and
synthetic examples were migrated to the portfolio. The presentation distinguishes current
synthetic-contract capabilities from designed future behavior. This change does not publish a
Real Estate demo. A configured demo origin links to `/places` instead of the redirected root.
