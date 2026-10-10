# @rei/ai

NestJS 12 service with a LangGraph skeleton, executed as a separate application on port 4111.

## Boundary rule

This application **never** receives unrestricted access to the database or to infrastructure. It
reaches domain capabilities only through:

- typed tools that call the versioned HTTP contract of the API (`/api/v1`); or
- application services explicitly exposed to it.

Concretely, that means `@rei/ai` declares **no** dependency on `@rei/infrastructure`, does not read
`DATABASE_URL` and does not instantiate a connection pool.

Examples of tools foreseen by the product specification:

```text
findComparableProperties()
getPropertyHistory()
getRegionStatistics()
searchListings()
```

## State

The service exposes dependency-free liveness at `GET /health` and provides one compiled no-op
LangGraph graph through Nest dependency injection. The graph terminates without external I/O.
There is no agent, model, tool, checkpoint, business endpoint or telemetry yet.

`AI_PORT` defaults to `4111` and accepts only a decimal port from 1 through 65535. Invalid values
fail startup with a clear error. The service binds to `0.0.0.0` for container and Dev Container
port forwarding.

## Commands

```bash
pnpm --filter "@rei/ai" dev      # http://0.0.0.0:4111
pnpm --filter "@rei/ai" typecheck
pnpm --filter "@rei/ai" test
pnpm --filter "@rei/ai" build    # emits dist/main.js
pnpm --filter "@rei/ai" start
```

Provider-key validation remains explicitly opt-in through `pnpm --filter "@rei/ai" check:keys` and
is not part of the default test or build flow.
