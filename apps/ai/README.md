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

Later graphs add typed intent routing and receipt-bound explanations; see
[routed decisions](../../docs/ask-intent-decisions.md) and
[model explanations](../../docs/api/ask-model-explanation.md). OpenTelemetry is preloaded before
HTTP/Nest, with categorical node spans and W3C propagation, without recording questions, grants
or internal tokens. The API dispatch signing key remains outside this application.

## Model provider

This application is the only one that calls a model provider and the only one that receives
`ANTHROPIC_API_KEY` ([ADR 0029](../../specs/adrs/0029-direct-anthropic-provider-for-ask.md)).
It calls the Anthropic Messages API directly through the pinned official `@anthropic-ai/sdk`;
there is no gateway and no secondary model.

- `src/models/anthropic-client.ts` is the single client factory. It pins the API origin and the
  key, disables SDK retries and SDK logging, and accepts an injected `fetch` for tests.
- `AnthropicIntentDecider` classifies the visitor question with `claude-haiku-5-5` and a closed
  structured output (`intent`, `probability`). Its prompt version is
  `ask-intent-classifier-prompt-v1` in `src/models/intent-classifier.prompt.ts`. This is the only
  request that carries the question text.
- `AnthropicLanguageModelAdapter` implements the vendor-free `LanguageModel` port for explanations
  with the same model. Its prompt carries versioned instructions and computed receipt facts only.
- `src/models/anthropic-failure.ts` maps provider errors to the closed failure vocabulary and
  keeps bounded `Retry-After` advice. SDK types do not leave `src/models/`.

Requests are processed under Anthropic's standard commercial API terms. Nothing here verifies or
claims zero data retention. Without a key the classifier degrades to the deterministic
`heuristic-v1` rule and explanations fail closed. Tests never reach the provider: they construct
the real SDK client with an injected `fetch`.

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

Provider-key validation remains explicitly opt-in through `pnpm --filter "@rei/ai" check:keys`. It
loads the repository's local environment file, sends one small billed request to Anthropic and
prints only the provider, model and outcome. `pnpm --filter "@rei/ai" probe:intent --live` runs
the two fixed synthetic classification cases with `ANTHROPIC_API_KEY` from the process
environment. Neither is part of the default test or build flow, and both exit unsuccessfully
without a key.
