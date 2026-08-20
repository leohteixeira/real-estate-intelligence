# ADR 0005 — Observability with OpenTelemetry

- **Status:** accepted
- **Date:** 2026-08-20

## Context

The specification requires OpenTelemetry instrumentation of requests, jobs, collectors, crawling
duration, parsing errors, LLM calls, tool calls, token consumption and enrichment failures.
CLAUDE.md requires correlatable logs, metrics and traces, without recording secrets.

## Decision

- `@opentelemetry/sdk-node` 0.221.0 with an **explicit** set of instrumentations, instead of
  `@opentelemetry/auto-instrumentations-node`: `instrumentation-http` and `instrumentation-pg` in
  both processes, plus `instrumentation-express` in the API only. The automatic package brings
  dozens of instrumentations this project does not use.
- The bootstrap lives in each application's `src/otel.ts` and is **preloaded** by the start script
  (`node -r ./dist/otel.js dist/main.js`). This is not a style detail: calling the SDK from inside
  `main.ts` would be too late, because `http`, `express` and `pg` would already have been loaded
  and could no longer be instrumented.
- OTLP export enabled **only** when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so that the process runs
  without a local collector.
- `OTEL_SERVICE_NAME` identifies each process; the default value is the application name.
- Logging with the **native NestJS Logger**. No pino and no winston: the platform logger is enough
  and avoids one more dependency.
- Connection strings, source credentials and provider keys never reach a log, a span or a metric.
  `@rei/infrastructure` redacts credentials before propagating any driver error.

The Mastra runtime is not instrumented yet, because no agent and no tool are registered.

## Consequences

The start script now depends on the preload; running `node dist/main.js` directly brings the
process up without telemetry. That is documented in the README and is what `compose.yaml` executes.

Correlation between log and trace is not automatic yet: once business handlers exist, the
`trace_id` will have to be injected into the logger context.

## Reassessment trigger

Instrument Mastra together with the first agent or tool, covering model calls, tool calls and token
consumption. Add `trace_id` injection into the logger together with the first business endpoint.
