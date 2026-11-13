# ADR 0009 — AI provider resilience policies

- **Status:** accepted; amended by [ADR 0029](0029-direct-anthropic-provider-for-ask.md), which
  removes the gateway, the secondary model and the Zero Data Retention requirement
- **Date:** 2026-10-09

## Context

Jev and generative models are synchronous external dependencies. Nested retries, unbounded
concurrency and privacy-blind fallback can stall workers, multiply cost and route data through an
unapproved provider.

## Decision

- External AI adapters make one HTTP attempt. Policy objects from `@nestjs/resilience` own retry,
  timeout, circuit-breaker, bulkhead, rate-limit and fallback behavior.
- The logical order, outside-in, is fallback, bulkhead, circuit breaker, retry, rate limiter and
  per-attempt timeout. One logical operation is one breaker outcome; each real attempt consumes a
  limiter token.
- Jev falls back to the deterministic heuristic. Claude Haiku 5.5 is the primary generative model;
  `deepseek/deepseek-v4-flash-0731` through Vercel AI Gateway is the secondary model.
- `429`, `5xx`, timeout and network failures are transient. `400 invalid_request` is not retried or
  counted as a transient provider failure. Authentication and authorization errors are not retried.
  An identifiable exhausted quota opens the circuit immediately.
- Caller cancellation is propagated without fallback. `Retry-After` is honored only within the
  remaining deadline; other retries use bounded exponential backoff with jitter.
- Gateway calls require Zero Data Retention. A request that cannot satisfy or verify that policy
  fails closed and never falls back to a less private route.
- Typed resilience events feed metrics and traces without prompts, responses, credentials or other
  sensitive payloads.

## Consequences

Failure and cost are bounded in one policy layer. Provider outages produce explicit degraded or
failed outcomes, while privacy requirements remain invariant during fallback. Policy timing and
thresholds stay centralized and can be tested with fake clocks and HTTP servers.

## Reassessment trigger

Revisit the order or failure classes when another synchronous provider class is added, when a
provider publishes a fixed rate contract, or when production evidence shows that the initial
budgets do not meet latency and availability objectives.
