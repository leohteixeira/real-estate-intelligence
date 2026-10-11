# Run and extend integration tests

## Run the suite

Use Node 24.19.0, pnpm 11.22.0 and an available Docker daemon from this repository. Install with
`pnpm install --frozen-lockfile`. Do not start the default Compose stack or supply `.env*` files.

```bash
pnpm run test:integration:list
pnpm run test:integration
```

The full command builds compiled applications once, then discovers all sixteen campaigns plus
cleanup/support tests. Files run serially; a campaign can deliberately exercise simultaneous
writers or four parallel brokers. Test and hook deadlines are bounded, and empty discovery fails.
Fixture probes in `integration/fixtures/` and compiled tests under `dist/` are not discovered.

For an individual campaign, build first, then select its existing focused alias:

```bash
pnpm run build
pnpm run test:integration:market
pnpm run test:integration:properties-history
pnpm run test:integration:source-register
pnpm run test:integration:audit
pnpm run test:integration:healthcheck
```

The history alias runs both current-history and historical-upgrade campaigns; source-register
also runs its cleanup regressions. Other aliases cover collection, properties, locations,
properties-ingestion, listing-provenance, snapshot-lifecycle, snapshot-reparse,
resumable-collection, scheduled-collection and collection-resilience. To target support tests:

```bash
pnpm exec vitest run --config vitest.integration.config.ts integration/support
```

## Strict TypeScript checking

Every campaign, shared helper, fresh-process probe and `vitest.integration.config.ts` is included
in `tsconfig.integration.json`. It extends the unchanged strict base configuration. Run
`pnpm run typecheck` for recursive workspace checking followed by integration checking. For a
standalone check, run `pnpm run build` first, then `pnpm run typecheck:integration`; integration
imports compiled package declarations rather than production source.

`requestHttp().json()` returns unknown. Validate public responses with contract parsers, and type
SQL projections, broker/CLI evidence and injected lifecycle methods with specific consumed shapes.
Do not use explicit any, suppression directives, arbitrary-property JSON types or casts of partial
mocks into complete runtime clients. Node 24 fresh-process probes use only erasable TypeScript,
load compiled product code and never import Vitest. See the D-040 amendment in ADR 0020.

## Add a campaign

Name the file `integration/<capability>.integration.test.ts`. Keep imports side-effect-free:
allocate ports, start services and perform assertions inside the reported test lifecycle.
Use the shared fixture rather than introducing another process or port manager:

```ts
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { ComposeFixture, allocatePorts, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

test('owned API answers its real health endpoint', async () => {
  const [postgresPort, apiPort] = await allocatePorts(2);
  const fixture = new ComposeFixture(`rei-example-${randomUUID()}`, {
    POSTGRES_PORT: String(postgresPort),
    API_PORT: String(apiPort),
    POSTGRES_USER: 'rei_fixture',
    POSTGRES_PASSWORD: 'controlled_fixture_only',
    POSTGRES_DB: 'rei_fixture',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  await preserveCleanup(
    async () => {
      await fixture.up(['--build', 'postgres', 'migrations', 'api']);
      await vi.waitFor(
        async () => {
          const response = await requestHttp(`http://127.0.0.1:${apiPort}/health`);
          expect(response.status).toBe(200);
        },
        { timeout: 30_000, interval: 200 },
      );
    },
    () => fixture.down(),
  );
});
```

Supply every service-specific fixture variable required by the chosen product services; existing
campaigns provide complete examples. `withCampaign` also adapts retained Compose fault and
migration commands to the same Testcontainers-owned lifecycle. Only actual product commands and
fresh-process probes use Execa. Assert child JSON/exit evidence in the parent Vitest test, not with
a second test framework in the child.

Staged startup honors that stage's environment overrides, including deliberate worker delays.
One-shot migration waits resolve exact project/service labels including already-exited containers
and use Testcontainers' bounded exit-status strategy. A nonzero exit fails; running or paused
containers remain pending until completion or the configured deadline.

Use native `expect` and `vi.waitFor`/`expect.poll`, preserving each probe's interval and deadline.
`requestHttp` uses Supertest and keeps literal malformed queries, bodyless requests, error
payloads, headers and AbortSignal behavior. It intentionally makes non-2xx responses assertable.

## Isolation and failures

Real PostgreSQL transactions/SQL, RabbitMQ delivery/restarts and S3-compatible storage remain
real. Nock permits exact synthetic external mocks and owned HTTP endpoints only; unmocked outside
hosts are refused. Check consumed scopes; pending scopes fail and are removed after each test.
This HTTP guard is not a general firewall for subprocesses or arbitrary non-HTTP sockets: fixtures
must remain synthetic and explicitly scoped.

Fixtures disable Compose env-file loading, own unique `rei-` projects and ports, and remove only
their labeled containers and volumes. No default development stack, remote service, VPS or real
source belongs in a campaign. get-port cannot prevent an unrelated process claiming a port after
allocation; an allocation/bind failure must fail visibly and trigger owned teardown.

Wrap work/resource release in `preserveCleanup`; use `cleanupAll` when multiple releases must all
run. Both primary and cleanup errors remain visible, including thrown falsy values. Diagnostic
log retrieval can be best-effort, but never suppress teardown, assertion or readiness failures.
After failure, inspect exact project labels before removing anything; do not run broad Docker
prune commands. Support tests cover setup failure, dual failure, ownership and leak detection.

## Keep the quality gates

Run lint, typecheck, unit tests, build and `pnpm run test:coverage` as well as integration tests.
Unit scripts still use `--dir src`, and [coverage floors](coverage.md) are unchanged. ESLint rejects
forbidden Node/manual harness patterns in static, dynamic and CommonJS imports, with prefixed and
unprefixed built-ins. Basic file/crypto/module fixture APIs are permitted. Record changes to this
standard through [ADR 0020](../../specs/adrs/0020-vitest-integration-standard.md), not an ad hoc
per-package runner or ESLint configuration.
