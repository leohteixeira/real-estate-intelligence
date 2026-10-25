---
title: 'Deployment on the VPS with readiness'
type: 'feature'
ticket: '12'
created: '2026-10-25'
status: blocked
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
blocked_at: '2026-10-25'
blocked_reason: 'Authenticated GitHub API/PR/CI and private GHCR pull access unavailable; required product main CI, five release digests and public production evidence remain unobserved.'
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

- 2026-10-25 owner authorization supersedes historical external-only limitations in this plan:
  scoped VPS operations, dependencies, push/PR/CI/image publication/merge and deployment from
  `main` are authorized for the application, landing and workspace infrastructure. Deliver under
  `https://leohteixeira.com/real-estate-intelligence/`; preserve landing/project paths, exact-root
  presentation redirects and a prefix-preserving operational demo link. Finish current story 2.9
  before resuming ticket order. Update prefix integration and prove actual public journeys,
  readiness, synthetic effects and a linked Tempo trace before acceptance. Prior local evidence
  stays valid for unchanged inputs; no campaign is interrupted for this documentation update.
  Use dedicated bounded PG18 rather than modifying shared PostgreSQL. Keep production independent
  of the Dev Container, protected host configuration, verified backups and targeted recovery.
  A demonstrated CI prerequisite also remains: the existing official MinIO fixture tag is no
  longer downloadable. Story 2.9 restored the exact original manifest locally from a mirror;
  that cache recovery does not establish clean-cache remote CI reproducibility. Resolve the
  immutable fixture-image input before the required remote run, preserving real S3 semantics.

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

### 2026-10-25 — Authorized continuation review pass

- verdicts: 1 findings — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` A database-only recovery can strand a pre-backup published event whose
    consumer commits and acknowledges after the backup. Verified against `rei_backup`,
    `PostgresOutbox.claimPending` (`published_at IS NULL`) and transactional audit consumers.
    The targeted correction requires an observed empty dedicated broker vhost while this app's
    writers are stopped, and recovery into a new empty vhost while retaining the original.
    Applied the empty-vhost precondition before any dump and the new-vhost recovery instructions.
    Five focused tests and a real backlog-rejection/drained-backup rehearsal passed; independent
    targeted follow-up found no remaining defect. No blanket outbox replay, queue purge or
    unrelated-project operation was added.

### 2026-10-25 — Targeted broker/backup follow-up

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The same independent Quick reviewer inspected only the corrected broker-cut
  precondition, tests and new-vhost recovery instructions. The original risk is resolved without
  reopening the public-prefix implementation or accepted historical stories.

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

### Authorized continuation result — 2026-10-25

The continuation prepares prefix-scoped Vite/router/native links, API/SSE/readiness transport,
Nginx/image layout, immutable MinIO input and gated main-only image publication. Its changed files
and direct evidence are itemized in the implementation handoff receipts below. The independent
landing changes preserve the application prefix; shared infrastructure adds scoped PG18/storage,
provisioning, verified consistent backup, digest/revision validation and separately gated proxy
activation. Existing plans and runbook carry the operational sequence; no extra report is created.

Review accounting preserves the earlier broad Quick pass (zero findings), adds one continuation
Quick pass (one high patch), and one strictly targeted follow-up (zero findings). Patched entries:
high 1, medium 0, low 0. Deferred and rejected findings: none. Follow-up recommendation is false;
the demonstrated broker/backup risk has independent closure. No broad accessibility or product
audit was restarted. Final web coverage passed all original floors; direct browser and operator
proofs remain valid. Actual commit hooks, remote gates, main publication and production receipts
remain mandatory. A built plan describes reviewed preparation and does not mark the ticket done.

## Authorized continuation — 2026-10-25

This section applies the owner's later explicit instruction and supersedes the historical
external-only restrictions and local-only acceptance above. Preserve the read-only historical
intent contract, original baseline, accepted readiness code, prior checks and one independent
Quick review. Story 2.9 is now done. Resume this existing story rather than create a new plan.
Continuation source baseline: `cf7092a3d343a26cc868dbd7ecb693d228181169`.
Implementation preparation is recorded below; the historical `baseline_revision` remains unchanged.

### Outcome and delivery phases

Deliver this application on the existing VPS at
`https://leohteixeira.com/real-estate-intelligence/`, from a protected/gated `main` revision,
with immutable published images, public database/broker readiness and the observed linked
HTTP/outbox/publish/consumer Tempo trace. No subdomain. Preserve synthetic-only data, privacy,
landing availability, other project data and one heavy job at a time (8 GB / 2 vCPU).

The implementation handoff prepares and verifies the necessary code, configuration, tests and
operator commands without committing, pushing or activating production changes. Return the
concrete diff and check results for the required parent review. The parent then completes
commits/hooks, push/CI/merge, image publication and scoped activation/public evidence in this
same story. These phases sequence mandatory review before publication; authorization is already
granted and must not be requested again. Do not mark the story done from implementation alone.

### Implementation tasks for this continuation

- [x] `apps/web/vite.config.ts`, `apps/web/src/{App.tsx,routes.tsx,api,ask,shared,shell}` and affected
      callers: inspect the existing router/URL model and reuse it to support an explicit public
      base while retaining existing root-based owned integration fixtures. Apply the prefix to
      assets, navigation, direct/deep routes, locale links, redirects, API and streaming/SSE.
      Resolve only reachable affected paths; no general accessibility/design audit or new UI.
- [x] `docker/{web.Dockerfile,web-nginx.conf}`, `compose.production.yaml`: build the production
      web for this public base, scope reverse-proxy readiness/API routes, preserve deep-route
      SPA fallback and SSE behavior. Keep secrets out of build args/images. Only web joins edge;
      dependency ports remain private. Existing exact roots ultimately redirect to presentation.
- [x] Existing focused web/unit tests and `integration/` native Vitest/Testcontainers/Supertest/
      Playwright support: add meaningful prefix/deep-link/API/stream regressions and exercise
      affected browser journeys in both languages. Reuse fixtures and prior unchanged readiness
      outage/recovery/a11y evidence. Browser/build/coverage jobs never overlap. No retry/skip or
      inflated timeout. Observe actual product readiness before assertions.
- [x] `compose.yaml` and any exact related fixture image references: replace the unavailable
      MinIO tag with the same original immutable manifest available from the mirror below.
      Preserve the original binary/S3 semantics; local cached tags are insufficient for CI.
- [x] `.github/workflows/ci.yml`: preserve every existing secrets/format/workspace/coverage/
      integration/container gate. Prepare publication of the five images with full revision labels
      and manifest digest evidence from gated `main` only, in serial order. Choose the existing
      GitHub repository registry capability after inspecting it; no secrets in output and no
      bypassing protections. Required local pre-push hooks remain intact.
- [x] In the independent landing repository read its `AGENTS.md` and installed Next documentation
      before changes. `src/content/project-links.ts` currently only appends `places` when pathname
      equals `/`: fix the demonstrated prefixed-root defect using the existing `appRoute`, and add
      focused regression cases in `src/content/presentations.test.ts`. Preserve explicit operational
      links, cards/presentations and other projects. Set the scoped public runtime demo URL through
      its existing production Compose/config mechanism. Do not commit landing work in product Git.
- [x] `/workspace/infra/{portfolio,compose.yaml,caddy/Caddyfile}` and existing infrastructure tests:
      prepare minimal scoped host operations for this app, dedicated bounded PG18 instance/role/
      volume, app RabbitMQ vhost/user, private snapshot storage/bucket credentials, protected
      configuration, backup verification and compatible recovery. Reuse existing networks/limits
      and collector/Tempo, never upgrade/start shared PG17 or unrelated services. Do not call the
      global `up/services/provision` operations that start unrelated projects. Validate candidate
      Caddy then reload only after healthy app activation. Scope Caddy under this app prefix;
      redirect both exact roots to the existing presentation convention; keep landing fallback.
      Reuse the operator lock and protected `.conf` approach where sufficient; no general operator
      redesign, additional reporting layer or data deletion. No host mutation in this preparation
      handoff; provide commands to parent for reviewed activation.
- [x] `docs/operations/deployment.md`, this plan and existing epic: update the concrete runbook,
      release/recovery sequence and concise verification receipts. Preserve failed/prior evidence.
      Record material owner-level decisions before action in the external decisions file and
      English epic Notes; routine scheduling/config plumbing needs no new decision. Never create
      another report duplicating these records.

### Known operational facts and safe inputs

- Host SSH is available as `root@172.18.0.1` using `ssh -F /dev/null -o BatchMode=yes
-o ConnectTimeout=5 -o UserKnownHostsFile=/tmp/rei-vps-gateway-known-hosts
-o StrictHostKeyChecking=yes`. The host checkout `/root/portfolio-workspace` is the bind mount
  of `/workspace`; host production Docker is distinct from container development Docker.
- Host observation 2026-10-25 19:30 UTC: 7,940 MiB RAM, 5,026 MiB available, no swap; only
  landing, Caddy and Dev Container running. Unrelated projects are intentionally stopped.
  Root filesystem has 37 GiB free. Recheck capacity before heavy jobs or activation.
- Previous landing image `portfolio/landing:ef35648c8e97-20261024030918`, image ID
  `sha256:86cf5ebf1ed052c4f866e606bd26e9e75b909ce12068efa1703e709076622e23`;
  Caddy `caddy:2.10.2-alpine`, image ID
  `sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`.
  Caddy binds host `infra/caddy/Caddyfile`. Record/back up its actual bytes and release/config
  securely before activation. Do not export existing credential-bearing container environments.
- Networks `portfolio-edge`, `portfolio-data`, `portfolio-telemetry` already exist. Shared PG17
  stays unchanged and stopped. Required RabbitMQ, collector, Tempo and collector's Loki dependency
  can be selectively started during activation. No global start/restart/prune or volume removal.
- Exact original MinIO manifest is available as
  `public.ecr.aws/y9w4h2u9/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`.
  Its amd64 child is `sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2`;
  image config `sha256:69b2ec208575b69597784255eec6fa6a2985ee9e1a47f4411a51f7f5fdd193a9`.
  Prior bounded diagnosis established DockerHub/Quay original tag unavailable and official
  download 410; do not repeat registry research. Story 2.9 passed with this exact manifest
  locally restored under the old tag. Clean-cache CI still needs the immutable reference.
- Never read, search, inspect or edit `.env*` in any repository/host path. Processes may load
  the existing provider keys using the authorized loader. Newly generated operational settings
  belong in root-owned protected host `.conf` files without logged values; never commit them.
  No real provider calls are needed for this story's trace probe.
- Root workspace has existing uncommitted owner-authorization additions in the two goal documents,
  an intentionally untracked-from-delivery decisions change, and unrelated Python cache. Preserve
  these; only pertinent infra/docs receive independent workspace commits. Product Git is separate.

### Additional observable acceptance

- Given the final delivered main revision, remote CI gates and five immutable image digests are
  recorded and match their OCI revision labels; production runs independently of Dev Container.
- Given real public HTTPS, both exact app roots redirect to presentation; `/places` and deeper
  accepted routes load directly and on refresh, assets/API/stream requests retain the prefix,
  navigation and both languages work, and landing `/`, `/en`, `/pt`, presentations and other
  existing route configurations remain preserved. No global API/readiness route is introduced.
- Given healthy PG18 and authenticated scoped broker, public prefixed `/ready` reports both
  available. A synthetic audit HTTP 202 links one saved carrier/outbox row, publish and consumer
  effect in the existing Tempo. Record actual revision/digests/time, event/trace ID and sanitized
  durable effect evidence. Do not infer a missing observation or call unrelated model/source APIs.
- Given first/repeated migration, take a verified restorable backup before touching persistent
  data, retain application/Caddy/landing previous identities and compatible recovery instructions.
  No automatic down migration, data deletion or unrelated service restart occurs.

### Continuation verification sequence

Run directly affected unit/configuration tests first. Then the necessary native prefix/browser
campaign and affected image checks, serially. Run lint/typecheck/test/build and applicable coverage
floors on stabilized changed sources; reuse valid unchanged results with source/dependency identity
noted. The mandatory actual pre-push hook is still executed. Independent review is restricted to
this continuation's changed behavior and affected risks: one earlier broad Quick pass already ran.
No completed story or accepted accessibility campaign is reopened.

After reviewed commits, execute required remote CI and main publication, start only required
host dependencies, verify backup then migrate and activate the application, validate/reload Caddy,
update landing through its own tested release, and perform public HTTPS/journey/readiness/Tempo
checks. Record new evidence here before story closure. Scheduled production collection remains
story 2.12; the final goal campaign runs on the published application after all required stories.

### Implementation handoff receipts — 2026-10-25

Prepared against canonical continuation baseline
`cf7092a3d343a26cc868dbd7ecb693d228181169`. These receipts establish local preparation only.
No commit, push, publication, host provisioning, production migration, proxy reload or landing
activation was performed by the implementer. Parent review and the remaining delivery phases below
are mandatory. D-090 records the scoped publication decision; its append-only Portuguese complement
supplies the external record's required fields. The English epic Notes and this runbook remain in
product Git; landing and shared infrastructure remain changes in their independent repositories.

The existing Vite public base and React Router basename now scope assets, router links and default
API/SSE endpoints. The shared native PropertyRow anchor uses a small public-path helper because
basename does not transform native hrefs supplied by SearchResults or PlaceReductions. External
and hash links retain their existing meanings. Root fixtures continue to use the default `/` build.
Nginx serves only the selected base from its own `/srv/rei` root, strips the prefix only when
forwarding versioned API requests, and retains finite SSE streaming and scoped readiness. Caddy
preserves the prefix, redirects both exact roots to the presentation and keeps the landing fallback.
The independent landing resolver now appends `places` to either origin or configured prefix roots,
preserves explicit operational links, and receives the default demo URL through production Compose.

CI retains every existing gate and prepares a gated-main-only serial five-image GHCR publication
with full OCI revisions and manifest digest artifacts, using Actions `GITHUB_TOKEN`. The native
integration job explicitly installs Playwright Chromium/OS dependencies and its SUID sandbox helper
on the ephemeral runner. Shared infrastructure now has explicitly selected dedicated bounded PG18
and storage services, scoped broker/bucket identities, protected idempotent configuration and
operator commands under the existing lock. A pre-migration backup requires a successful actual
restore plus a validated stopped-storage archive before `COMPLETE`; failed migration keeps this
application's writers stopped. Proxy activation separately requires all four application services
healthy and a valid candidate. No global startup or shared PG17 change is introduced.

| Changed behavior                                                                                 | Direct evidence                                                                                  | Result                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Public base, default/overridden API base, authenticated SSE URL and native anchors               | Five web unit files; `/tmp/rei-continuation-unit-direct.log`                                     | 70/70 passed, 14.68 s                           |
| Production image isolation and owned fixture configuration                                       | Existing production/support tests; `/tmp/rei-continuation-config.log`                            | 35/35 passed, 5.16 s                            |
| Root and prefixed production transport plus bilingual browser journeys                           | `integration/web-prefix.integration.test.ts`; `/tmp/rei-continuation-prefix-browser-sandbox.log` | 2/2 passed, 88.33 s                             |
| Landing root/prefix demo links and preserved explicit routes                                     | `src/content/presentations.test.ts` in landing repository                                        | 3/3 passed; scoped ESLint passed                |
| Operator scope, configuration retention, failed restore/archive/migration and proxy health gates | `python3 -m unittest infra/test_portfolio.py`; `/tmp/rei-continuation-infra.log`                 | 19/19 passed                                    |
| Actual PG18/broker/storage provisioning and verified backup                                      | Isolated native rehearsal; `/tmp/rei-continuation-operator-rehearsal-final.log`                  | Passed; backup receipt `20261025T194822237713Z` |

The browser campaign observes native fixture readiness before assertions and uses real authenticated
prepared SSE over Nginx, without a worker, source or model call. In both English and Portuguese it
loads and reloads Place, clicks Search, follows a native Property anchor, reloads Property, returns
to Search, follows the prepared Ask session through completion, switches locale and reloads, and
loads Privacy. It checks prefixed asset/stream requests and zero off-base requests/page errors.
The default fixture has no price reductions; the same corrected PropertyRow helper serves that
reachable reduction caller. Prefix fixtures also reject global readiness/API/index exposure.

The first browser execution failed at Chromium startup because the container restricts unprivileged
namespaces (`/tmp/rei-continuation-prefix-browser.log`, 2 failed, 78.87 s). It established no browser
journey. The passing execution explicitly sets the existing
`CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox`, retaining sandboxing and all deadlines.
No retry, skip, timeout inflation or assertion weakening was added.

The operator rehearsal copies only the three selected service definitions into a separately named
local Docker project with its own networks, volumes and generated protected fixture configuration.
It runs actual provisioning twice and backup once, verifies native `uuidv7()`, restores
the real custom-format dump, validates the archive, observes healthy storage resumption and requires
the complete marker. All owned resources are cleaned afterward; the host daemon is untouched.
Its first run terminated the MinIO administration client with exit 137 at 256 MiB. At 512 MiB,
provisioning and restore/archive passed but the local Compose rejected `start --wait`. Final code
uses the existing BusyBox image for tar (the original MinIO contains mc but no tar), retains a
512 MiB storage limit, consumes broker listings without early pipe closure, and resumes only
storage with `up --no-deps --no-recreate --wait`. The final full rehearsal passed. Earlier failed
logs remain `/tmp/rei-continuation-operator-rehearsal.log` and
`/tmp/rei-continuation-operator-rehearsal-512.log`; neither is a production failure or approval.

Both local web images built successfully. Root image ID is
`sha256:33252797b05d0911ad14bf0629de4a2fd11e3db10d0ba36554735edb496ad40c`; prefixed image ID is
`sha256:945064d16b590f36237c510a419ecf368d10e91220ab3d48e0a331ed727ca9c8`.
These are local feasibility identities, not published manifest receipts or a main release.
Build logs are `/tmp/rei-continuation-images.log` and `/tmp/rei-continuation-prefix-image.log`.
Hadolint for the changed Dockerfile, shell syntax and scoped ESLint passed. Candidate Caddy
validation passed in an isolated local container. Default shared Compose selection excludes the
new profiled services; explicit profile configuration validates with synthetic settings and
automatic `.env` loading disabled. Previous Caddy bytes were retained before editing at
`/tmp/rei-caddy-before-prefix.Caddyfile`, SHA256
`d918d81c30008e84dc3751e81d0170dae266dec9783b4a5a7cef019407159d55`.
The parent must preserve this copy securely before activating the bind-mounted candidate.

Backend/package sources and the dependency lockfile are unchanged from the canonical continuation
baseline (`git diff --quiet <baseline> -- packages apps/api apps/worker apps/ai pnpm-lock.yaml`
exited zero). Valid accepted readiness outage/recovery, accessibility and seven unchanged workspace
coverage results can be reused with that identity. Changed web coverage remains pending the final
stabilized version after required parent review. No fresh full-root unit or coverage pass is claimed.
The mandatory pre-push hook still runs lint/typecheck/test/build; remote CI still requires complete
workspace coverage and every integration campaign.

Stabilized root `pnpm run lint`, strict `pnpm run typecheck` (including the integration compiler)
and `pnpm run build` all exited zero in the serial check session. Logs are
`/tmp/rei-continuation-{lint,typecheck,build}.log`. The build retains its existing large-chunk
warning. Changed-file Prettier checks and the four affected Markdown documents passed
(`/tmp/rei-continuation-format-check.log`, `/tmp/rei-continuation-markdown-scoped.log`). An initial
Markdownlint invocation also scanned ignored generated `_bmad/render` artifacts and failed; those
unrelated artifacts were not changed, and no full local Markdownlint pass is claimed. The scoped
run uses the repository's unchanged rules with CLI `--no-globs` to select the four changed documents.
The Chromium crash core from the initial sandbox failure was removed; no core/cache is a delivery
artifact.

### Remaining continuation delivery gates

- [x] Parent independent review of this continuation delta and targeted corrections.
- [x] Final changed-web coverage, with all existing floors preserved.
- [x] Mandatory hooks and separate product/landing/workspace commits. Preserve unrelated owner
      changes and the external decisions file.
- [ ] Authenticated remote PR/CI/protection observations, reviewed main integration and successful
      gated publication with five full revision/digest receipts. GitHub SSH Git works, but the
      Dev Container has no authenticated gh/API credential, the host has no gh binary/API token,
      and private GHCR pull credentials have not been observed. Obtain valid authorized access;
      do not infer CI/protection success or bypass the gate using another publication mechanism.
- [ ] Scoped host configuration/provisioning, protected previous identities/Caddy backup, successful
      verified pre-migration backup, migration and healthy application activation.
- [ ] Validate/reload only Caddy and release the landing from its own tested repository. The public
      pre-release baseline had 404 for both Real Estate presentations; the landing release must
      establish the checked-in bilingual presentations and preserve the other site routes.
- [ ] Actual public HTTPS direct/deep/reload/navigation/locale/assets/API/finite SSE acceptance,
      public readiness with both dependencies available, and linked production Tempo/outbox/publish/
      consumer effect evidence with full release identities and UTC times.

Story 1.12 and epic criterion 6 remain pending production. The existing deployment runbook contains
the exact scoped activation commands and compatible recovery sequence; no approval is requested
again for work already authorized by the owner.

### Final changed-web coverage — 2026-10-25

The unchanged coverage flags and exclusions from `scripts/test-coverage.sh`, selected only for
`@rei/web`, passed 41 files / 540 tests in 93.72 seconds on the stabilized public-prefix sources.
Statement/branch/function/line coverage is 95.96% / 90.91% / 96.54% / 97.18%, above the existing
80/75/80/80 floors. The command exited zero; `/tmp/rei-continuation-web-coverage.log` retains the
receipt. The subsequent correction concerns only operator recovery and its documentation/tests;
these web results remain valid. The actual mandatory pre-push gate and remote CI are still pending.

### Targeted broker/backup consistency correction — 2026-10-25

The verified review finding is patched: while API/worker are stopped and before any dump,
`rei-backup` reads all queues in the configured dedicated vhost through RabbitMQ's JSON formatter.
Ready/unacknowledged counts must be valid nonnegative integers and all zero, including retry and
dead-letter queues; backlog, invalid observation or CLI failure refuses the backup. The error
instructs draining owned work with the existing worker and stopping/rechecking, never purging.
Unpublished outbox rows remain untouched and replay normally. Recovery instructions now require
new empty PG/object/vhost targets, preserving original messages and configuring the compatible
restored release for only the new vhost before resuming; no `published_at` reset is introduced.

Five focused operator tests passed, including ready/unack backlog, malformed counts/CLI failure,
writer-stop/check/dump ordering, drained complete backup and existing restore/archive failures
(`/tmp/rei-broker-cut-unit.log`). The owned local rehearsal observed actual RabbitMQ JSON for an
empty vhost, one ready retry message and ACK-drained retry/dead-letter queues. Backlog rejected
before any dump/COMPLETE; the drained cut completed real restore/archive verification and healthy
storage resumption, receipt `20261025T195711581176Z` (`/tmp/rei-broker-cut-rehearsal.log`). Only fixture
resources were removed. The two edited documents passed scoped Markdownlint and Prettier. No
product/browser/coverage/build rerun, commit or host activation occurred; parent web coverage and
review records above remain preserved. Independent targeted follow-up returned no findings.

### Reviewed continuation commit checkpoint — 2026-10-25

Product implementation:
`690ece9a56101f278832a815ab42e0738c22150c`; tests:
`5dd43b36026b4a9d5cab7f74f0cc4fe3ab3e3313` passed all applicable pre-commit
and commit-message hooks without automatic content changes. The final complete operator regression
suite passed 22 tests (`/tmp/rei-continuation-infra-final.log`), including the corrected broker cut.
The plan is built preparation; the ticket remains in progress pending the remote and production
acceptance below. No push/main/CI/publication/deploy success is inferred from these commits.

### Remote source and host prerequisite checkpoint — 2026-10-25

The actual product pre-push hook passed in 266 seconds: secret history scanning, lint,
strict typecheck, all eight workspaces' 2,743 unit tests and build. Product branch
`feat/phase-1` was pushed through `67ecf44fc7842e76a78121080651257585e96b53`;
`/tmp/rei-continuation-push.log` preserves the receipt. Workspace `main` is now `5e2be61`
and landing `main` is `5c1cc9e`, both accepted by ordinary non-force pushes. Neither
repository has a remote CI workflow. Product `main` integration and its required CI
remain unobserved; successful branch transport does not establish either gate.

Before host changes, protected backup
`/var/backups/portfolio/rei-prepublication-20261025T200131Z` verified the original Caddy
bytes and configuration copies and retained previous image identities. The landing
image remains `portfolio/landing:ef35648c8e97-20261024030918`, image ID
`sha256:86cf5ebf1ed052c4f866e606bd26e9e75b909ce12068efa1703e709076622e23`.
Caddy remains `caddy:2.10.2-alpine`, image ID
`sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`.
The candidate has not been reloaded and no application migration has run.

Host `rei-config`, `rei-services` and `rei-provision` completed. Dedicated PostgreSQL
reports version 180006 and native UUIDv7; RabbitMQ's application user has permission
only in its own vhost. Dedicated storage, PostgreSQL and RabbitMQ are healthy. Tempo
and Loki initially did not report ready; a targeted subsequent readiness observation
returned HTTP 200 `ready` for both, without restart. Public `/en` and `/pt` still
return HTTPS 200. The latest host observation had 3,931 MiB available RAM with no swap;
other projects remain stopped and shared PostgreSQL 17 remains unchanged. Logs:
`/tmp/rei-host-services.log` and `/tmp/rei-host-provision.log`. Runtime gateway
configuration was installed via the authorized process loader into a root-protected
host configuration without exposing values or making a model call.

**Product defect:** the demonstrated backup consistency defect is corrected and its
independent targeted follow-up found none. **Executor defect:** the earlier Chromium
sandbox launch and local operator command/resource issues are resolved by the recorded
passing scenarios. **Evidence limitation:** Git SSH transport works, but authenticated
GitHub API/PR/CI access and private GHCR pull credentials are unavailable through the
observed authorized mechanisms. This prevents observing mandatory remote gates,
integrating the product release into `main`, obtaining the five published digests and
performing the accepted production release. No token search or substitute release
mechanism is justified. Resume this story when that access is available; continue
independent eligible work meanwhile. Public application journeys, persisted synthetic
effects and the linked Tempo trace remain explicitly unproved. Existing unchanged-code
checks, accepted accessibility evidence and final prefix tests remain reusable.
