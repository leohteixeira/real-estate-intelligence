# Run and extend integration tests

## Run the suite

Use Node 24.19.0, pnpm 11.22.0 and an available Docker daemon from this repository. Install with
`pnpm install --frozen-lockfile`. Do not start the default Compose stack or supply `.env*` files.

```bash
pnpm run test:integration:list
pnpm run test:integration
```

The full command builds compiled applications once, then discovers all integration campaigns plus
cleanup/support tests. Files run serially; a campaign can deliberately exercise simultaneous writers
or four parallel brokers. Test and hook deadlines are bounded, and empty discovery fails. Fixture
probes in `integration/fixtures/` and compiled tests under `dist/` are not discovered.

For an individual campaign, build first, then select its existing focused alias:

```bash
pnpm run build
pnpm run test:integration:market
pnpm run test:integration:market-median
pnpm run test:integration:market-price-facts
pnpm run test:integration:ask
pnpm run test:integration:ask-tracer
pnpm run test:integration:ask-text-price
pnpm run test:integration:ask-checkpoints
pnpm run test:integration:ask-delivery
pnpm run test:integration:run-executor
pnpm run test:integration:properties-history
pnpm run test:integration:source-register
pnpm run test:integration:audit
pnpm run test:integration:healthcheck
```

The history alias runs both current-history and historical-upgrade campaigns; source-register also
runs its cleanup regressions. Other aliases cover collection, properties, locations,
properties-ingestion, listing-provenance, snapshot-lifecycle, snapshot-reparse,
resumable-collection, scheduled-collection and collection-resilience. To target support tests:

```bash
pnpm exec vitest run --config vitest.integration.config.ts integration/support
```

The price-facts campaign upgrades populated Market v1 history without rewriting evidence, then uses
the actual outbox, RabbitMQ subscriber, PostgreSQL projection and place overview HTTP to exercise
all eight causal event families. It checks merge/split destinations for removed members, independent
revision frontiers, reverse-first delivery, inbox-expiry/restart replay, bounded dead letters, an
injected SQL minimum failure, concurrent reads and sanitized invalid-data errors. Its reverse-first
phase truncates only its owned fixture's Market projection after preserving the expected durable
snapshot; foreign projects and volumes remain outside its lifecycle.

The Ask campaign checks seven prepared run snapshots and finite scripted SSE previews through public
contract parsers, capability refusals, fixture replay, full ordered threads, edited confirmation
inputs, absent confirmation/cancellation handlers and disabled structured admission. A distinct API
E2E test opens a catalogue grant, reads its
run/thread and reaches an explicit edited-confirmation terminal. Both use the production
PostgreSQL/migrations/API images and compare every owned table count/content digest before and
after: migrated Ask tables stay empty; no retained caller text, outbox write or live AI execution is
added. See the
[Ask API reference](../api/ask.md) for the prepared-only contract and replay limitations.

The structured price campaign (`integration/ask-price-run.integration.test.ts`) runs PostgreSQL,
migrations, API, RabbitMQ, production worker and isolated AI graph with ephemeral scoped authority.
It verifies the 785,000 BRL / 68 m² result, concurrent creation replay, ownership/input refusals,
creation/outbox/inbox rollback, claim replacement, retained Market receipts, SQL JSON constraints,
durable terminal SSE and API restart recovery. Pruning delivery/idempotency records cannot duplicate
a result even with AI stopped; definitive AI authentication refusal reaches a safe failed terminal.
Transient AI outage preserves the claim without a false terminal; restart/redelivery completes it.
It uses Vitest, strict TypeScript, Supertest and the same Testcontainers fixture/teardown standard.
See [the structured tracer reference](../api/ask-tracer.md).

The checkpoint campaign (`integration/ask-checkpoints.integration.test.ts`) uses an owned SQL
advisory barrier to observe a committed decision before killing API, worker or AI. It verifies
one retained receipt, decision checkpoint and terminal/inbox outcome, contiguous public SSE,
fresh-process native pause/reclaim, isolated grants, immutable checkpoint/write replay, the real
API-owned retention job without business history deletion, and long escaped/Unicode accepted
queries. Native cases also
cover both persistence gaps, concurrent fork admission, transaction rollback, SQL disconnect
cancellation, invalid serialized state and a genuine populated 6002-to-6003-to-6004 upgrade.
Historical documents, receipts, fingerprints and events are compared before and after the additive
migrations; twelve historical turns prove numeric ordering beyond single digits. Retention includes
a real queue-expired terminal in its eight-turn ranking. Its Node
TypeScript probe imports compiled AI declarations and never imports a test framework. See
[the saver protocol](../api/ask-checkpoints.md).

The ordered-delivery campaign (`integration/ask-delivery.integration.test.ts`) uses owned real
PostgreSQL, RabbitMQ, API, worker and AI fixtures. It races public admission at three total pending,
checks replay/conflict/foreign-authority no-effects, expires queued work with the worker stopped,
and reverses delivery under both default prefetch two and prefetch one while another thread progresses.
Original retained envelopes are published through the production broker; only the explicit
attempt-three header fault case uses direct mandatory confirmed publication. A separate run-scoped
executor fault accumulates genuine failures, observes more than five deferrals at an earned attempt,
and proves the fifth genuine failure reaches the durable DLQ without automatic replay.
Additional cases exercise SQL deadline boundaries despite application-clock drift, busy-lock fairness,
expiry outbox/inbox rollback and cancellation, retained completed graph/receipt recovery, and
creation/delivery replay after temporary platform records are pruned. Rabbit firehose observation
parses the original message body and reads delivery metadata from trace headers.
Before opening AMQP, the fixture waits once for Rabbit application startup; the Compose ping
only establishes runtime availability. See [the Rabbit CLI readiness semantics](https://www.rabbitmq.com/docs/man/rabbitmqctl.8).
Run these Docker campaigns serially: each teardown verifies that foreign containers and volumes
remain exactly unchanged. All campaign helpers, fixtures and probes are strict TypeScript.

Restart cases resolve the single owned container using exact Compose project/service labels before
signalling it and start that same container promptly. They do not change broker delivery limits or
republish dead letters. An API outage that exceeds the existing delivery budget can still leave a
running run with a dead-lettered delivery; successful brief restart evidence does not establish
unlimited outage recovery. The SQL disconnect case observes actual backend disappearance and no
committed checkpoint: socket destruction alone can leave a lock wait until the unchanged five-second
PostgreSQL statement timeout.

The text-price campaign (`integration/ask-text-price-run.integration.test.ts`) submits only prose
in PT and EN, then proves equal canonical inputs, exact completed SSE results through the real
worker/graph/Market tool, finite no-effect refusals, immutable replay and mixed-thread ownership.
It attacks operation/input/execution/grant scope, exercises expired-claim recovery and checks
sanitized runtime logs. Its second owned PostgreSQL fixture applies 6001, populates structured
history/events/receipts/outbox/inbox/idempotency records using only historical columns, applies
additive 6002 followed by 6003/6004 and compares exact retained row/evidence digests before
executing a text run in that legacy thread with the current repository. Malicious SQL
basis/source/input/unknown-key changes must still fail. No historical migration is edited or
historical evidence rewritten.

The RunExecutor campaign has two distinct tests: an authenticated HTTP/configuration boundary
campaign against the production AI image, and a production worker-command E2E journey resolving
the Nest `RUN_EXECUTOR` port and traversing the real no-op graph. Each owns PostgreSQL, migrations,
API and AI fixtures, generates fresh internal authority, verifies no token/question logging or AI
infrastructure credentials, and compares every SQL digest and public Ask catalogue before/after.
The worker command uses bounded stdin and the production worker image without DB/broker modules;
wrong or absent authority fails categorically. Shared exact-label teardown verifies foreign Docker
containers and volumes survive. See [the RunExecutor reference](../api/run-executor.md).

## Strict TypeScript checking

Every campaign, shared helper, fresh-process probe and `vitest.integration.config.ts` is included in
`tsconfig.integration.json`. It extends the unchanged strict base configuration. Run
`pnpm run typecheck` for recursive workspace checking followed by integration checking. For a
standalone check, run `pnpm run build` first, then `pnpm run typecheck:integration`; integration
imports compiled package declarations rather than production source.

`requestHttp().json()` returns unknown. Validate public responses with contract parsers, and type
SQL projections, broker/CLI evidence and injected lifecycle methods with specific consumed shapes.
Do not use explicit any, suppression directives, arbitrary-property JSON types or casts of partial
mocks into complete runtime clients. Node 24 fresh-process probes use only erasable TypeScript, load
compiled product code and never import Vitest. See the D-040 amendment in ADR 0020.

## Add a campaign

Name the file `integration/<capability>.integration.test.ts`. Keep imports side-effect-free:
allocate ports, start services and perform assertions inside the reported test lifecycle. Use the
shared fixture rather than introducing another process or port manager:

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
campaigns provide complete examples. `withCampaign` also adapts retained Compose fault and migration
commands to the same Testcontainers-owned lifecycle. Only actual product commands and fresh-process
probes use Execa. Assert child JSON/exit evidence in the parent Vitest test, not with a second test
framework in the child.

Staged startup honors that stage's environment overrides, including deliberate worker delays.
One-shot migration waits resolve exact project/service labels including already-exited containers
and use Testcontainers' bounded exit-status strategy. A nonzero exit fails; running or paused
containers remain pending until completion or the configured deadline.

Use native `expect` and `vi.waitFor`/`expect.poll`, preserving each probe's interval and deadline.
`requestHttp` uses Supertest and keeps literal malformed queries, bodyless requests, error payloads,
headers and AbortSignal behavior. It intentionally makes non-2xx responses assertable.

## Isolation and failures

Real PostgreSQL transactions/SQL, RabbitMQ delivery/restarts and S3-compatible storage remain real.
Nock permits exact synthetic external mocks and owned HTTP endpoints only; unmocked outside hosts
are refused. Check consumed scopes; pending scopes fail and are removed after each test. This HTTP
guard is not a general firewall for subprocesses or arbitrary non-HTTP sockets: fixtures must remain
synthetic and explicitly scoped.

Fixtures disable Compose env-file loading, own unique `rei-` projects and ports, and remove only
their labeled containers and volumes. No default development stack, remote service, VPS or real
source belongs in a campaign. Both shared port helpers probe `0.0.0.0`, matching Compose's wildcard
publication rather than checking only one loopback interface. This prevents selecting a port already
bound on another local interface, including Docker's internal DNS. get-port still cannot prevent an
unrelated process claiming a port after allocation; an allocation/bind failure must fail visibly and
trigger owned teardown.

Wrap work/resource release in `preserveCleanup`; use `cleanupAll` when multiple releases must all
run. Both primary and cleanup errors remain visible, including thrown falsy values. Diagnostic log
retrieval can be best-effort, but never suppress teardown, assertion or readiness failures. After
failure, inspect exact project labels before removing anything; do not run broad Docker prune
commands. Support tests cover setup failure, dual failure, ownership and leak detection.

## Keep the quality gates

Run lint, typecheck, unit tests, build and `pnpm run test:coverage` as well as integration tests.
Unit scripts still use `--dir src`, and [coverage floors](coverage.md) are unchanged. ESLint rejects
forbidden Node/manual harness patterns in static, dynamic and CommonJS imports, with prefixed and
unprefixed built-ins. Basic file/crypto/module fixture APIs are permitted. Record changes to this
standard through [ADR 0020](../../specs/adrs/0020-vitest-integration-standard.md), not an ad hoc
per-package runner or ESLint configuration.
