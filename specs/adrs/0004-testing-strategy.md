# ADR 0004 — Testing strategy

- **Status:** accepted
- **Date:** 2026-08-20

## Context

CLAUDE.md requires this repository to verify unit, integration, end-to-end and build through its
own pnpm scripts. The specification requires an evaluation strategy for probabilistic features.

## Decision

- **Vitest 4.1.11** as the single runner, across every package and application. Jest, the NestJS
  default, was rejected to avoid maintaining two runners in the same repository.
- No extra assertion library and no mocking framework: Vitest's `expect` and hand-written doubles
  implementing the ports of `@rei/application`.
- The test scripts use `vitest run --dir src` to scan the source code only. Without it, Vitest
  picks up the compiled tests in `dist/` and fails trying to load them as CommonJS.
- `apps/api/tsconfig.build.json` excludes `src/**/*.test.ts` from `nest build`, so that test files
  never reach the artifact.
- End-to-end tests with Playwright and integration tests against a real PostgreSQL are deferred
  until there is a first business feature. The Dev Container image already ships Playwright's
  system dependencies.
- Evaluation datasets for AI land together with the first agent or tool.

## Consequences

`pnpm test` today covers only deterministic rules and configuration reading. There is no
integration and no end-to-end coverage, which suits the foundation phase but has to change before
the first feature that touches the database.

## Reassessment trigger

Add Playwright once there is a first screen with a real flow. Add Testcontainers, or use the
PostgreSQL from Compose, once there is a first concrete repository.
