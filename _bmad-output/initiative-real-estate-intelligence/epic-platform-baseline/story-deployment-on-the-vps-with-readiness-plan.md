---
title: 'Deployment on the VPS with readiness'
type: 'feature'
ticket: '12'
created: '2026-10-25'
status: 'built'
baseline_revision: '567b03cdb265aca972e236e85404080f85683c5f'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 1.12 requires database-and-broker readiness, CI image builds, and a deployed,
observable VPS stack. Readiness currently probes only PostgreSQL; CI does not build the existing
container images. Deployment is outside the goal's authorization.

**Approach:** Deliver and verify the local readiness and deployment-preparation slice. Reuse the
five Dockerfiles, shared production networks, collector and Tempo (D-088), and existing tracing.
Keep the actual public/default-branch deployment and Tempo trace explicitly pending.

## Boundaries & Constraints

**Always:** Preserve inward dependencies, vendor isolation, trace preload, redaction, mandatory
tests/hooks/coverage. One heavy job at a time on the shared 8 GB/2 vCPU VPS. Isolated real-service
fixtures own their resources. English repository content. Production dependencies belong to shared
infrastructure; application production Compose is separate from development.

**Never:** Push, publish images, deploy, modify shared infrastructure/Caddy, restart other projects,
read `.env*`, enable real collection/model calls, weaken checks, add automatic retries or inflate
timeouts. Do not revisit accepted accessibility evidence or audit unrelated modules.

## I/O & Edge-Case Matrix

| Scenario          | Input / State                                         | Expected Output / Behavior                   | Error Handling                    |
| ----------------- | ----------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| Ready             | PostgreSQL and authenticated RabbitMQ vhost reachable | HTTP 200; both available                     | No mutation of broker topology    |
| Dependency outage | Either or both unavailable                            | HTTP 503; independent statuses               | No credential or driver detail    |
| Slow dependency   | Caller readiness deadline expires                     | Bounded unavailable result; resources closed | No retry; late connection cleaned |
| Liveness          | Dependencies unavailable                              | `/health` remains healthy                    | Neither dependency probed         |
| Production config | Required settings/images missing                      | Compose validation rejects incomplete config | No unsafe development fallback    |

</intent-contract>

## Code Map

- `apps/api/src/health/{health.controller,health.module}.ts` and `config.ts`: existing database-only
  readiness with a 2-second signal; extend the existing health composition.
- `packages/application/src/shared/{database-availability-probe,index}.ts`: model for a small broker
  capability port. `packages/contracts/src/shared/health.ts`: additive broker status.
- `packages/infrastructure/src/shared/persistence/postgres-availability-probe.ts`: currently ignores
  cancellation while querying. `database-connection.ts` already offers `queryAbortable`; reuse it.
- `packages/infrastructure/src/shared/messaging/{rabbitmq-event-broker,index}.ts`: amqplib already
  exists. A readiness handshake must close its connection and never call broker `start()`, which
  creates business topology. Do not expand publisher/subscriber business contracts.
- `apps/api/src/persistence/persistence.module.ts`: existing database probe provider. Worker
  `shared/messaging.module.ts` supplies RabbitMQ configuration conventions; never import worker code.
- `compose.yaml`, `env.example`: existing development configuration; wire API broker URL without
  requiring the owner to edit secrets. `docker/*.Dockerfile`: five existing reusable image builds.
- `.github/workflows/ci.yml`: existing secrets, format, workspace and integration gates; retain them.
- `docker/web-nginx.conf`: SPA currently has no exact `/ready` proxy; preserve the landing redirect.
- `integration/support/{fixture,http}.ts`, `integration/audit-tracer.integration.test.ts`: reuse
  owned Testcontainers fixtures and Supertest wrapper; do not run the whole audit campaign merely
  to test readiness. Existing story 1.8 already proves local trace propagation.
- Read-only `/workspace/infra/compose.yaml` and `observability/collector.yaml`: external networks
  `portfolio-edge`, `portfolio-data`, `portfolio-telemetry`; OTLP receiver forwards to Tempo.
  Shared PostgreSQL is 17.6, while migration 0001 and the UUID generator require PostgreSQL 18.

## Tasks & Acceptance

**Execution:**

- [x] `packages/application/src/shared/` and its barrel -- add the narrow broker availability port
      and test fake, mirroring the database capability without vendor types.
- [x] `packages/infrastructure/src/shared/messaging/` and its barrel -- implement/test a bounded,
      one-attempt authenticated connection probe with closure on success, failure and cancellation.
- [x] `packages/infrastructure/src/shared/persistence/postgres-availability-probe.ts` and tests --
      honor the existing signal using `queryAbortable`, including cancellation regression coverage.
- [x] `apps/api/src/{health,config.ts,config.test.ts}`, `packages/contracts/src/shared/health.ts`,
      `compose.yaml`, `env.example` -- wire both probes and report both statuses within the existing
      deadline; cover the matrix and preserve liveness.
- [x] `.github/workflows/ci.yml`, new `compose.production.yaml`, `docker/web-nginx.conf` -- build all
      five existing images in CI without publishing; prepare application-only production configuration
      with immutable image inputs, no published ports, scoped networks and resource limits; proxy
      public `/ready` to API. Keep secrets out of all images and infrastructure credentials out of AI.
- [x] `integration/readiness.integration.test.ts` -- prove healthy/unhealthy/recovered dependencies
      through HTTP against owned real PostgreSQL/RabbitMQ, including the web proxy where practical;
      preserve native cleanup and failures. Add configuration tests only for meaningful deployment
      invariants; no parallel test framework or redundant inventories.
- [x] `docs/operations/deployment.md`, `README.md`, this plan and the existing epic -- record exact
      prerequisites, operator commands, image/commit identity, readiness, one Tempo trace spanning
      request/outbox/publish/consumer, rollback and pending evidence. Domain/TLS routing is an operator
      proposal; preserve the live landing. Explain required PG18 and object storage provisioning.

**Acceptance Criteria:**

- Given the isolated local stack, when `/ready` is requested before, during and after independent
  PostgreSQL and RabbitMQ outages, then HTTP status and both dependency fields match reality and
  recover without restarting API; `/health` remains independent and responses expose no secrets.
- Given synthetic production settings, when Compose is validated, then only application services
  use required image/config inputs, bounded resources, external networks and no host ports; missing
  required inputs fail before starting anything.
- Given the checked-in workflow, when its container-build job executes on CI, then all five
  Dockerfiles build for that checked-out commit without publishing; local changed-image builds
  establish feasibility while remote CI execution remains honestly unobserved.
- Given the prepared runbook, when the operator follows it after separately authorizing deployment,
  then it defines the public HTTPS `/ready` check and how to find the complete linked Tempo trace
  for images built from a `main` commit. Until those production checks actually pass, story 1.12
  remains pending production and is never marked done from internal/local proxies.

## Implementation Notes

- The application port reports only broker availability. The infrastructure adapter performs one
  authenticated AMQP connection and closes it without creating a channel or topology. Its socket
  receives the caller's AbortSignal, which also bounds handshake and close work; a late connection
  is still closed. Readiness starts both probes concurrently with the existing two-second signal.
- PostgreSQL readiness now calls the existing disposable `queryAbortable` lease; no retry,
  additional state or raised timeout was introduced. Liveness still probes neither dependency.
- Development API now starts its broker dependency. The owned Compose fixture allocates missing
  broker host ports for older API-only campaigns, preventing accidental default-port collisions.
- Production configuration contains five application services, digest-only image references,
  required process settings, resource limits and scoped external networks. The AI gateway key is
  supplied only to the AI runtime from the operator's secret store, never through a build argument;
  existing ZDR/budget gates remain mandatory. No model request or real collection is performed.
- The CI build job serially builds all five Dockerfiles without publishing. The runbook preserves
  the portfolio landing and proposes a separately authorized demo subdomain/Caddy route. It records
  the shared PostgreSQL 17 incompatibility, required PG18/storage provisioning, rollback and exact
  production evidence still owed.

- Image preparation runs before Vitest discovery in the official integration command, with one
  Compose build invocation per service. The focused readiness alias uses the same prerequisite;
  the UUID scenario only tags prepared images and starts its owned services. Installation/build
  duration is not part of the HTTP deadline. Existing Dockerfiles, pnpm behavior and lockfile stay
  unchanged.

## Plan Change Log

- Readiness adds an automatic RabbitMQ dependency to development API startup. Existing API-only
  campaigns therefore receive owned broker ports from their current fixture helper; the regression
  checks allocation and retention across startup stages.
- The first readiness attempt never reached a fixture or HTTP request: its 240-second command
  limit expired while the existing API Dockerfile packaged its runtime through legacy pnpm deploy,
  after TypeScript compilation. Build history showed no remaining active build or owned runtime.
  Preparation was separated from the scenario rather than raising readiness deadlines or changing
  package/dependency policy. No readiness defect is inferred from that executor limit.

- HTTP diagnosis identified an invalid fixture recovery precondition: RabbitMQ was still
  `health: starting` near the end of polling after `compose start`, so the API correctly reported
  it unavailable. Restarted dependencies now pass the same native Testcontainers health strategy
  and existing 240-second startup allowance before the unchanged 30-second API recovery polling
  begins. The two-second readiness signal and three-second HTTP assertion remain unchanged.

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The independent Quick reviewer inspected the diff, acceptance criteria and
  surrounding consumers; no unmet local requirement or concrete bug was established.

## Verification

- Run the directly affected Vitest unit tests first, then the new isolated readiness integration
  campaign and necessary affected regressions; serialize every build/campaign/coverage job.
- On stabilized code, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build` and
  existing workspace coverage floors must pass. Reuse unchanged historical campaign evidence.
- Validate production Compose with explicit synthetic environment and env-file loading disabled;
  build affected images serially. Retain required independent BMAD review and all commit hooks.
- Record the actual revision and results here. Production/public/remote CI evidence is pending,
  not inferred. Commit the verified local delivery with auto-commit and continue ticket order.

### Recorded local evidence

The delivered runtime inputs are based on commit
`567b03cdb265aca972e236e85404080f85683c5f` plus this uncommitted implementation.
The completed workspace build and local images cover the same runtime contents; later edits are
limited to fixture/test execution, scripts, production configuration and documentation. No
Dockerfile, dependency or lockfile changed. The sorted SHA-256 input manifest at
`/tmp/rei-readiness-runtime-inputs.sha256` has digest
`b5e37012eb518590315b94ed43a8273240fbfbdee1633e019310d89c5cb4f605` and covers:

- API configuration, health controller and health module;
- application broker availability port and shared barrel;
- shared readiness response contract;
- infrastructure broker adapter, messaging barrel and PostgreSQL availability adapter;
- web Nginx configuration.

| Check                                        | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace build                              | All eight workspaces passed on the runtime inputs above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Workspace lint                               | Passed; subsequent integration changes also passed targeted ESLint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Final typecheck                              | All eight workspaces and strict integration project passed; `/tmp/rei-readiness-typecheck.log`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Targeted integration lint                    | Readiness, production config and fixture source/tests passed; `/tmp/rei-readiness-lint-targeted.log`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Direct unit regressions                      | Application fake: 1 passed; infrastructure broker/PostgreSQL/connection: 36 passed; API health/config: 17 passed.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Production configuration and fixture support | 2 files, 35 tests passed, including required missing settings, immutable images, scoped networks and AI-only gateway input.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Separate local image preparation             | Completed successfully in approximately 9 minutes 21 seconds; `/tmp/rei-readiness-image-preparation.log`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Real-service readiness campaign              | Passed in 210.08 seconds (213.58 seconds total), including cleanup; `/tmp/rei-readiness-http-verified.log`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Shell syntax                                 | `bash -n scripts/prepare-readiness-images.sh` passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Full unit gate                               | Contracts 214, domain 649 and AI 212 tests passed; web had 530 passed and 2 timeouts. Recursive execution stopped before the remaining workspaces; `/tmp/rei-readiness-unit.log`.                                                                                                                                                                                                                                                                                                                                                   |
| Targeted web diagnosis                       | The invalid-range case passed on a targeted run; the complete editor/ordering case repeated its unchanged 5-second timeout. A temporary milestone measurement stopped at the initial preview wait, so cumulative interaction cost was not established. Scoping the editor queries was insufficient (1 passed, complete case timed out at 5098 ms); the experimental change was fully restored. Logs: `/tmp/rei-readiness-search-targeted.log`, `/tmp/rei-readiness-search-measurement.log`, `/tmp/rei-readiness-search-scoped.log`. |

A final temporary measurement reached these elapsed milestones with the scoped editor: mount
191 ms, editor available 793 ms, initial preview 1197 ms, property-type interactions/assertions
2509 ms, final type selection 2597 ms, six numeric fields 4012 ms, bedrooms 4122 ms,
bathroom/parking 4414 ms and four time bands 4717 ms. The instrumented history loop then failed
because its diagnostic statements were inserted without a required block, so later flags,
submission and ordering were not measured. The original test was restored and this diagnostic
was not repeated. The observed prefix already consumes most of the unchanged five-second budget;
it does not establish a runtime regression or justify reducing the integrated journey. The
measurement log is `/tmp/rei-readiness-search-final-measurement.log`.

The readiness campaign exercised the following states through both direct API and the local web
proxy: healthy, PostgreSQL paused, recovered PostgreSQL, RabbitMQ paused, recovered RabbitMQ,
RabbitMQ stopped, both dependencies stopped, broker restarted while PostgreSQL remained stopped,
and both restarted. It retained the two-second readiness signal, three-second HTTP assertion and
30-second API recovery polling. Every state checked independent dependency fields and liveness;
the campaign also rejected bad AMQP credentials and a missing vhost, preserved broker queue
names, kept the landing redirect, redacted fixture credentials and preserved the API container ID.
Restarted dependencies passed the existing native health startup gate before recovery assertions.

Prepared local image IDs (verification artifacts, not registry digests or default-branch proof):

- `rei-readiness-images-migrations`: `sha256:74a15cbb35aa689fc0468a155024e5c392fba3c719cd9c38ddab5403b32becfc`;
- `rei-readiness-images-api`: `sha256:678f389adb0f5db7fc9259877b4f8f0cb5c7cedcb22d142c12249b286de3b8f9`;
- `rei-readiness-images-web`: `sha256:772f34b142610798c06bb7f29abdb69fc5ae873217b6db07fdcc3989a4630256`.

The initial coverage command `pnpm run test:coverage` approved contracts, domain and AI with
the existing 80% statement/line/function and 75% branch floors. Coverage results are listed below
in statement/branch/function/line order:

- contracts: 91.03% / 90.88% / 93.23% / 92.71% (214 tests);
- domain: 95.4% / 90.47% / 100% / 96.05% (649 tests);
- AI: 94.18% / 88.74% / 91.9% / 96.3% (212 tests).

Web completed 530 passing tests and two five-second timeouts in 281.70 seconds: the complete
Search editor/ordering case and the AppShell navigation/history case. There was no functional
assertion failure in those cases. Recursive execution then stopped before application,
infrastructure, API and worker. The source and configuration remained unchanged throughout this
coverage run; `/tmp/rei-readiness-coverage.log` records the actual failure. A proposed test
restructure was suspended when the second timeout appeared, pending executor contention analysis.
No experimental web edit was retained. A short `/proc/stat` executor sample during the test
recorded 58.22% CPU steal across two vCPUs, without memory pressure or cgroup throttling. This
establishes loss of available CPU capacity in that interval; it does not establish the exclusive
retrospective cause of each timeout.

The remaining backend workspaces use the same flags and exclusions as
`scripts/test-coverage.sh`, changing only the explicit selection. They run serially; the
contracts/domain/AI results above are reused. The actual continuation command is:

```bash
pnpm -r --filter @rei/application --filter @rei/infrastructure --filter @rei/api \
  --filter @rei/worker --workspace-concurrency=1 exec vitest run --dir src \
  --passWithNoTests --maxWorkers=1 --coverage --coverage.provider=v8 \
  --coverage.reporter=text '--coverage.include=src/**/*.{ts,tsx}' \
  '--coverage.exclude=src/**/*.test.{ts,tsx}' '--coverage.exclude=src/**/*.d.ts' \
  '--coverage.exclude=src/**/index.ts' --coverage.exclude=src/main.ts \
  --coverage.exclude=src/main.tsx --coverage.exclude=src/otel.ts \
  '--coverage.exclude=src/**/*.module.ts' --coverage.exclude=src/App.tsx \
  --coverage.exclude=src/landing/CityScene.ts --coverage.exclude=src/landing/LandingPage.tsx \
  --coverage.exclude=src/landing/copy.ts --coverage.thresholds.lines=80 \
  --coverage.thresholds.statements=80 --coverage.thresholds.functions=80 \
  --coverage.thresholds.branches=75
```

Continuation results in statement/branch/function/line order
(`/tmp/rei-readiness-coverage-remaining.log`):

- application: 91.86% / 86.94% / 98.61% / 93.34%; 223 tests, 25.27 seconds;
- infrastructure: 81.51% / 75.7% / 88.58% / 83.56%; 452 tests, 63.31 seconds;
- API: 94.3% / 85.52% / 97.61% / 95.47%; 204 tests, 68.81 seconds;
- worker: 94.42% / 84.77% / 91.52% / 95.66%; 227 tests, 75.58 seconds.

The continuation exited zero. All seven freshly checked workspaces passed their unit tests and
coverage floors (2,181 tests); the unchanged web contributes 532 previously validated tests, for
2,713 tests represented by valid evidence. No new full-root unit pass is claimed.

The unchanged web gate is satisfied by valid recorded evidence from
`epic-web/story-accessibility-at-wcag-2-2-level-aa-plan.md`: 532/532 web tests (session 6694),
2,697 full unit tests and production builds (84015), and all eight unchanged coverage floors
(32481). Identity was verified against baseline `567b03cdb265aca972e236e85404080f85683c5f`:
`git diff <baseline> -- apps/web pnpm-lock.yaml` is empty; the only contracts change adds an
erased interface field; root package changes affect integration aliases/preparation only. These
prior web results remain valid for the delivered source and dependency graph. The new runs above
remain failed temporal observations; no new web pass is claimed. No additional web execution is
needed without an observed change in executor capacity.

Independent BMAD Quick review completed without findings. Commit hooks are enforced by the
parent delivery workflow. Scoped
runtime formatting, five-document Markdown lint and diff checks passed. The web
production source is unchanged by this story. The observed web test timeouts remain a limit of
the new executions; no causal claim or relaxed deadline is inferred from the diagnostic attempts.
Actual VPS
provisioning, registry publication, deployment from `main`, public HTTPS readiness, a linked Tempo
trace, remote CI execution and real-model behavior remain unobserved and outside this delivery's
authorization. Story 1.12 remains pending production.

## Auto Run Result

The local delivery adds concurrent PostgreSQL and authenticated RabbitMQ readiness within the
existing two-second cancellation signal, leaves liveness independent, and prepares bounded
application-only production composition, serial CI image builds and the operator runbook.
The original public/default-branch/Tempo acceptance remains pending production.

Files changed:

- `.github/workflows/ci.yml`: build all five existing images serially without publishing.
- `apps/api/src/config.ts` and `config.test.ts`: require and validate the existing broker setting.
- `apps/api/src/health/health.controller.ts` and its test: combine independent dependency results.
- `apps/api/src/health/health.module.ts`: compose the infrastructure broker probe.
- `packages/application/src/shared/broker-availability-probe.ts` and its test: narrow port and fake.
- `packages/application/src/shared/index.ts`: export the availability capability.
- `packages/contracts/src/shared/health.ts`: include broker status in the response.
- `packages/infrastructure/src/shared/messaging/rabbitmq-availability-probe.ts` and its test:
  authenticate once and close within caller cancellation without topology mutation.
- `packages/infrastructure/src/shared/messaging/index.ts`: export the adapter.
- `packages/infrastructure/src/shared/persistence/postgres-availability-probe.ts` and
  `postgres-persistence.test.ts`: use the existing abortable query lease.
- `compose.yaml` and `env.example`: supply development API broker configuration.
- `compose.production.yaml`: require immutable images and scoped runtime inputs with resource limits.
- `docker/web-nginx.conf`: forward exact `/ready` while preserving the root redirect.
- `integration/support/fixture.ts` and its test: allocate and retain owned broker ports.
- `integration/production-config.test.ts`: enforce concrete deployment configuration invariants.
- `integration/readiness.integration.test.ts`: verify real dependency outages and recovery over HTTP.
- `scripts/prepare-readiness-images.sh`: prepare fixture images serially outside HTTP deadlines.
- `package.json`: wire image preparation into existing integration execution.
- `docs/operations/deployment.md`: document authorized operator prerequisites, acceptance and recovery.
- `docs/testing/integration.md`: document the focused native readiness campaign.
- `README.md`: explain readiness fields and link the deployment preparation.
- Existing epic, ticket entry and this plan: preserve D-088, local evidence and production pending.

Review: one independent Quick pass, zero findings. Patches: high 0, medium 0, low 0.
Deferred findings: none. Rejected findings: none. During delivery, the mandatory secret scanner
rejected an unnecessary synthetic credential-bearing PostgreSQL URI in the configuration fixture.
The implementer removed its credentials, preserving the host/database; the focused production
configuration file passed again (19 tests, 7.59 seconds, exit zero;
`/tmp/rei-readiness-production-config-review-fix.log`). Scanner rules and runtime inputs were
unchanged. This targeted fixture correction does not invalidate the recorded runtime evidence.
Follow-up review recommended: false;
no unverified changed risk was identified. No general audit was opened.

Verification: all five matrix rows have passing direct tests and/or the real-service campaign
recorded above. Fresh unit/coverage evidence covers seven workspaces (2,181 tests); valid unchanged
web evidence covers 532 tests. Build, lint, strict typecheck, native HTTP recovery, configuration,
formatting and Markdown checks passed as recorded. Failed temporal web attempts remain recorded
as execution limitations, and no fresh full-root unit pass is claimed. Documentation changes do
not invalidate these runtime results.

Residual acceptance: provisioning compatible PostgreSQL 18 and object storage, publication and
deployment from `main`, remote CI success, public HTTPS readiness and the linked Tempo trace require
separate production authorization. The story must not be marked done from the local result.

Delivery commits: `578753d` (runtime/configuration) and `adf13bf` (tests) passed every applicable
pre-commit and commit-message hook. Documentation is committed separately with the same hooks.
