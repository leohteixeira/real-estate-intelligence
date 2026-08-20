# ADR 0002 — HTTP framework, workers and the Mastra boundary

- **Status:** accepted
- **Date:** 2026-08-20

## Context

The workspace CLAUDE.md pins Node.js 24, NestJS 11 for the API and the worker, and a separate
Mastra runtime. It also mandates that Mastra reaches domain capabilities only through typed tools
or application services, and that it never receives unrestricted access to the database or to
infrastructure.

## Decision

- The API is a **NestJS 11.2.1** application with `@nestjs/platform-express`, the global prefix
  `api/v1` and `enableShutdownHooks()`. `/health` and `/ready` stay outside the prefix because they
  are operational, not part of the product contract.
- The worker is a **Nest standalone application context**
  (`NestFactory.createApplicationContext`): no HTTP server, but the same modules, providers and
  lifecycle as the API.
- Mastra runs in `apps/ai`, as a separate application on port 4111. It does **not** depend on
  `@rei/infrastructure`, does not read `DATABASE_URL` and does not instantiate a connection pool —
  neither in the code nor in `compose.yaml`.
- The shared packages are `@rei/domain`, `@rei/application`, `@rei/contracts` and
  `@rei/infrastructure`, wired through TypeScript project references. The dependency is always
  inwards: `@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.
- No driver type crosses the boundary: `@rei/infrastructure` exposes the opaque `DatabaseConnection`
  class instead of the `pg` `Pool`.
- **No queue in this phase.** BullMQ and Valkey are deferred until there is a real asynchronous job;
  the `valkey` service is declared in Compose under the `optional` profile and is not consumed.

### `mastra build` and the npm rule

CLAUDE.md forbids `npm` in these repositories. The `mastra build` command invokes `npm` internally
to generate the `package-lock.json` of the deployment bundle. That is why the `build` script of
`@rei/ai` is type checking only, and bundle generation lives in the separate `bundle` script, used
solely by `docker/ai.Dockerfile`. This keeps `pnpm -r build` and CI free of `npm`.

## Consequences

Two different ways of compiling coexist in the repository: `nest build` for the API and
`tsc --build` for the worker and the packages. In exchange, each application uses the tool its
framework expects.

The absence of a queue means the worker is a `setInterval` loop today. Once there is real crawling,
that will not be enough.

## Reassessment trigger

Adopt BullMQ on Valkey once there is a first job that needs retry with backoff, a dead-letter queue
or distribution across multiple workers.
