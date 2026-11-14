# ADR 0020 — Vitest integration standard

- **Status:** accepted
- **Date:** 2026-10-11
- **Owner decisions:** D-039; TypeScript amendment D-040

## Context

ADR 0004 selected Vitest as the single runner, but integration campaigns subsequently grew into
standalone Node scripts with bespoke assertions, HTTP, subprocess and fixture lifecycle code.
Sixteen mature campaigns now prove explicit SQL persistence, asynchronous delivery, durable
restart/replay, historical upgrades, snapshots, API contracts and four fresh-volume broker boots.
The owner requires a library-backed Vitest standard while preserving all those guarantees and
the in-progress Market story. D-012 retains explicit SQL and overrides Jest/ORM defaults.

## Decision

Use native Vitest 4.1.11 tests and expectations for every integration campaign, discovered by
`vitest.integration.config.ts`. Unit scripts keep `--dir src`; the integration configuration
includes only integration test files and excludes compiled artifacts and non-test probes.
Campaign files run serially, with bounded deadlines; concurrency inside a campaign remains real.

Use Supertest 7.3.1 for actual API and management HTTP, preserving malformed URLs, expected
non-2xx bodies, correlation headers and cancellation. Use Testcontainers 12.2.0 for isolated
Compose ownership/readiness and standalone brokers; keep production Compose, migrations and
preload unchanged. Execa 10.1.0 executes real product CLI/fault commands and fresh-process
probes. get-port 7.2.0 allocates owned local ports. Nock 15.0.1 guards HTTP and intercepts only
exact synthetic external scopes, never real PostgreSQL, RabbitMQ or S3 semantics.

Every campaign uses unique `rei-` project ownership, explicit fixture environment, no `.env*`,
and exact-label teardown. Shared cleanup retains the primary failure and every cleanup failure,
including setup/readiness and nested connection/adapter/server failures. Pending Nock scopes
fail teardown. ESLint rejects Node test/assert, custom assertions, fetch, child_process, net
reservations and promisified harnesses, including CommonJS/dynamic and unprefixed forms.

## Options considered

- Keep standalone Node harnesses: rejected by the owner and inconsistent with the single runner.
- Run old scripts from Vitest: rejected because setup/assertions would remain outside its lifecycle.
- Mock the database, broker or storage: rejected because retries, transactions, delivery and
  recovery depend on real service semantics.
- Reuse the default Compose stack: rejected because audit must own its fixtures and cleanup.
- Retain ESM JavaScript: selected by D-039 for the initial behavior-preserving migration, then
  superseded by the owner's explicit TypeScript requirement in D-040. The same guarantees and
  readable scenario bodies remain mandatory.

## TypeScript amendment — D-040

All campaigns, helpers, independent probes and the integration configuration use TypeScript.
`tsconfig.integration.json` extends the unchanged strict base configuration, checks without emit,
and uses NodeNext resolution, Node types, `allowImportingTsExtensions`, `erasableSyntaxOnly` and
`verbatimModuleSyntax`. Root typecheck runs this gate after recursive workspace checking; standalone
checking first builds what it imports. JSON enters as unknown and is validated with public
parsers or described by specific local evidence shapes. SDK types are genuine; minimal lifecycle
interfaces cover only consumed injectable methods, without casting partial mocks into full clients.
No explicit any, compiler suppressions or generic arbitrary-property JSON are permitted.

Fresh Node 24 processes strip erasable probe types and load compiled production imports. The
import-order probe retains synchronous CommonJS loading through `createRequire`; neither probe
imports Vitest. This amendment changes no production code, SQL, assertions, coverage floors or
real-service requirements.

## Consequences

Docker and sufficient time/resources are required for the complete suite; CI reserves bounded
integration shard jobs. Shared support must continue to handle staged migrations, profiles, one-shot
commands, faults and exact cleanup. Port allocation reduces clashes but cannot eliminate the
allocation-to-bind race. Fresh probes remain separate processes and report inspectable results
to Vitest; they must never import the runner. Dependency pins and frozen installs add maintenance
work, while optional SSH acceleration build scripts remain disabled because fixtures use Docker.

See [the execution guide](../../docs/testing/integration.md) for commands and the new-test pattern.
