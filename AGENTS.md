# Real Estate Intelligence — agent instructions

Repository-specific extension. Read `/workspace/CLAUDE.md` first; what is written here prevails
only inside `repos/real-estate-intelligence`.

## State

Foundation. The four apps, the four packages, configuration, telemetry, the database connection,
health endpoints and one deterministic domain rule (`pricePerSquareMeter`) exist. There are no
entities, no collectors, no comparables, no Mastra tools and no business endpoints.

## Architecture rules

- The dependency direction is always inwards:
  `@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.
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

## Conventions

- Explicit SQL through `pg`. No ORM.
- Migrations are versioned SQL in `migrations/`, applied by `scripts/migrate.sh`. `postgis` and
  `vector` are available in the image, but no extension is enabled by default.
- A single ESLint configuration at the root covers every workspace. Do not create a per-package
  `eslint.config.js`.
- Tests run with Vitest, always with `--dir src`: without it the runner picks up the compiled tests
  in `dist/`.
- The API and the worker start with `node -r ./dist/otel.js dist/main.js`. Do not remove the
  preload.
- Never log a connection string, source credential or provider key.
- `npm` is forbidden. `mastra build` invokes `npm` internally, which is why it stays in the
  separate `bundle` script, used only by the Dockerfile and never in `pnpm -r build`.

## Language

Everything in this repository is written in English: code, identifiers, comments, branch names,
commit messages, specifications, READMEs and any other documentation.

## Commands

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
lefthook run pre-commit --all-files
```

Always run Git from this directory, never from `/workspace`. Do not commit automatically.
