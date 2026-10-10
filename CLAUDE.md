# Real Estate Intelligence — agent instructions

Repository-specific extension. Read `/workspace/CLAUDE.md` first; what is written here prevails
only inside `repos/real-estate-intelligence`.

## State

Foundation. The four apps, the four packages, configuration, telemetry, the database connection,
health endpoints and one deterministic domain rule (`pricePerSquareMeter`) exist. There are no
entities, no collectors, no comparables, no AI tools and no business endpoints.

## Architecture rules

- The dependency direction is always inwards:
  `@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.
- The API, worker and AI applications use NestJS 12. The separate AI application uses LangChain
  and LangGraph and stays on port 4111.
- `@rei/domain` depends on nothing. `@rei/application` depends on `@rei/domain` only.
- Vendor SDKs live **only** in `@rei/infrastructure`. No vendor type is re-exported: the
  applications receive `DatabaseConnection`, never the `pg` `Pool`.
- `@rei/ai` **never** receives `DATABASE_URL`, an object storage credential or a dependency on
  `@rei/infrastructure`. It reaches the domain only through typed tools that call `/api/v1` or
  through application services explicitly exposed to it.
- `Property` and `Listing` are distinct entities. History is first-class. Entity resolution is
  explainable. Asking price is never conflated with transaction price.
- Market calculations, geospatial filters and comparables are deterministic and stay in the
  backend. An LLM may interpret or explain the result, never produce it.
- Collectors respect the sources' ToS, robots, rate limits and licensing. In development, use
  synthetic datasets or explicitly permitted sources.

### Bounded contexts (ADR 0011)

- Nine contexts: `properties`, `market`, `comparables` (Core); `collection`, `locations`, `ask`,
  `alerts` (Supporting); `audit`, `identity` (Generic). Do not add a context without an ADR.
- A context is the same folder name in `@rei/domain`, `@rei/application`, `@rei/infrastructure`,
  `@rei/contracts`, `apps/api` and `apps/worker`. Inside it, group files by aggregate and express
  the layer as a suffix (`listing.entity.ts`, `listing.service.ts`, `listing.pg-repository.ts`).
  Never create `entities/`, `services/`, `repositories/` or `dto/` folders.
- Import another context only through its `index.ts` (facade, DTOs, event contracts). Never import
  its entities, services or repositories.
- A context reads and writes only its own PostgreSQL schema. No foreign key and no join crosses a
  schema; reference another context by identifier.

### Events and the outbox (ADR 0012)

- One transaction changes one aggregate and appends its events to `platform.outbox`. Never publish
  to RabbitMQ from a request or from inside a business transaction.
- Name events `context.aggregate.action`. Payloads carry primitives and identifiers only.
- Every consumer is idempotent through `platform.inbox` and acknowledges after its commit.

### External systems (ADR 0013)

- Reach every external system through a port named for the capability, with its adapter in
  `@rei/infrastructure` (or in `@rei/ai` for AI providers) and an in-memory fake for tests.
- An adapter makes one attempt. Retry, timeout, circuit breaker, bulkhead, rate limit and fallback
  belong to the `@nestjs/resilience` policy that wraps it; timings live in named configuration.
- Retry only idempotent operations; every write carries an idempotency key. A block, a login wall
  or a CAPTCHA from a source is never retried.

## Conventions

- Explicit SQL through `pg`. No ORM.
- Migrations are versioned SQL in `migrations/`, applied by `scripts/migrate.sh`. `postgis` and
  `vector` are available in the image, but no extension is enabled by default.
- A single ESLint configuration at the root covers every workspace. Do not create a per-package
  `eslint.config.js`.
- BMad product specifications live under `_bmad-output/`; `specs/adrs/` holds normative ADRs.
- Tests run with Vitest, always with `--dir src`: without it the runner picks up the compiled tests
  in `dist/`.
- The API and the worker start with `node -r ./dist/otel.js dist/main.js`. Do not remove the
  preload.
- Never log a connection string, source credential or provider key.
- `npm` is forbidden. Use pnpm for every repository install, script and build.

## Language

Everything in this repository is written in English: code, identifiers, comments, branch names,
commit messages, specifications, READMEs and any other documentation.

## Commands

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
lefthook run pre-commit --all-files
```

Always run Git from this directory, never from `/workspace`. Do not commit automatically.
