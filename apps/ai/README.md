# @rei/ai

NestJS 12 service with isolated LangGraph execution on port 4111.

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

The service exposes dependency-free liveness at `GET /health` and two compiled graphs through
Nest dependency injection. The foundation graph terminates without external I/O. The
`structured-price-v1` graph visits `fixedDecision` and `priceTool`, invoking a scoped typed API
tool rather than performing price arithmetic in AI. Execution is authenticated through
`POST /internal/v1/runs/execute`; see [the foundation reference](../../docs/api/run-executor.md)
and [the live tracer reference](../../docs/api/ask-tracer.md) for the distinct contracts.

There is no model invocation, general autonomous agent or durable checkpoint in this increment.
OpenTelemetry is preloaded before HTTP/Nest, with categorical node spans and W3C propagation,
without recording questions, grants or internal tokens. The API dispatch signing key remains
outside this application.

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
