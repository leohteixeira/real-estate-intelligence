# Deploy the prepared VPS application stack

Story 1.12 has verified local readiness and deployment preparation. **Production deployment, public
HTTPS readiness, remote CI execution and a production Tempo trace remain unverified.** On
2026-10-25 the owner authorized the operational work, repository push/PR/CI/image publication/merge
and deployment needed to deliver from `main`. Execute those steps when their gates and
prerequisites are ready; they are no longer deferred for authorization. Use the VPS host Docker
daemon, independently of the Dev Container. Preserve the live portfolio landing and other projects'
data, volumes and configuration; unrelated projects may remain stopped for capacity.

The binding public base is `https://leohteixeira.com/real-estate-intelligence/`. No new domain or
subdomain is authorized. The public-prefix adaptation and production evidence are remaining
delivery work; the earlier local readiness checks do not establish either.

## Prerequisites

- Use the VPS host Docker daemon and Compose v2. Keep one heavy build, campaign or migration job
  active at a time on the shared 8 GB / 2 vCPU VPS. Check available memory before starting the
  application; its configured memory limits total 1,216 MiB, in addition to shared infrastructure.
- Provision a dedicated, bounded PostgreSQL **18** instance, application database, role, volume and
  backup/restore procedure. The existing shared PostgreSQL **17.6 cannot run migration
  0001 or the UUIDv7 generator**, which use native `uuidv7()`. Do not point this stack at that server,
  edit historical migrations or upgrade another product's database through this delivery.
  If needed, provision PostGIS/pgvector capability before migrations that require those extensions.
- Provision a dedicated RabbitMQ user and vhost on `portfolio-rabbitmq`, with application permission
  to declare/publish/consume its topology. URL-encode usernames, passwords and the vhost in URLs.
  Readiness authenticates to this vhost but creates no channels, queues or exchanges.
- Provision private S3-compatible storage, an application snapshot bucket and scoped bucket
  credentials. The worker's storage adapter creates the bucket if absent; the operator must verify
  provisioning, region, access policy and retention. This application Compose starts no storage
  service. Provision a retained 32-byte base64 snapshot encryption key and its versioned key ID.
  Losing the key makes retained encrypted snapshots unreadable; preserve it with backups.
- Ensure shared `portfolio-edge`, `portfolio-data` and `portfolio-telemetry` networks exist.
  Shared collector `portfolio-collector:4318` already forwards OTLP to Tempo (D-088). This delivery
  reuses these services where adequate and starts only dependencies needed for the current step.
- Obtain API/worker `ASK_DISPATCH_SECRET` and AI/worker `AI_INTERNAL_TOKEN` from the operator's
  secret store. Internal authority must match across the named services. Generate the AI token
  using 32–128 URL-safe characters. Supply the approved `AI_GATEWAY_API_KEY` only to AI at runtime
  from the secret store. Preserve the existing fail-closed ZDR route evidence and budget gates;
  configuring a key does not prove a model call or ZDR. Keep real-source registers disabled.
  No command here enables collection or requests model execution.

The production file requires all five image digests and every dependency credential before Compose
can validate. The API and worker have database/broker access, the worker alone has storage and
snapshot keys, and AI receives its scoped execution token, approved gateway key and API URL. Web
receives no secrets. Keys are runtime settings and never image build arguments.
Application processes retain the existing OpenTelemetry preload in their image commands.

## Record the release and prepare images

Use a clean checkout of the exact authorized `main` revision. The CI `containers` job builds the
five existing Dockerfiles sequentially, tags them with the checked-out GitHub SHA and records the
OCI revision label. It does **not** publish images. A passing local build is feasibility evidence;
record the actual remote run URL and conclusion when it exists.

After the required gates pass and the pertinent commits reach `main`, build/publish that revision:

```bash
git switch main
git status --short
git rev-parse HEAD
export REI_RELEASE_COMMIT="$(git rev-parse HEAD)"
# Set REI_IMAGE_REPOSITORY to the authorized registry namespace before this loop.
for image in migrate api worker ai web; do
  docker buildx build --push --file "docker/${image}.Dockerfile" \
    --label "org.opencontainers.image.revision=${REI_RELEASE_COMMIT}" \
    --tag "${REI_IMAGE_REPOSITORY}/${image}:${REI_RELEASE_COMMIT}" .
done
```

Record each published manifest's sha256 digest alongside that full canonical commit, CI run URL,
UTC timestamp and deployment actor in the operator release ledger. Tags provide human lookup;
`compose.production.yaml` runs only `repository/service@sha256:digest` references. Set
`REI_MIGRATE_DIGEST`, `REI_API_DIGEST`, `REI_WORKER_DIGEST`, `REI_AI_DIGEST` and `REI_WEB_DIGEST` to
those 64-character manifest hashes without the `sha256:` prefix. Verify the OCI revision for all
five images, including migrations, against the recorded commit. Do not reuse a developer image
or infer production identity from the worktree or a mutable tag.

Supply required settings in the operator's process environment from the secret store. Never paste
secret-bearing Compose output into logs, tickets or chat. `env.example` is for development only.
Disable automatic env-file loading for every production operation:

```bash
export COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_ENV_FILES=
docker compose --file compose.production.yaml config --quiet
docker compose --file compose.production.yaml pull
```

Required settings are `REI_IMAGE_REPOSITORY`, the five `REI_*_DIGEST` values, `DATABASE_URL`,
`RABBITMQ_URL`, `ASK_DISPATCH_SECRET`, `AI_INTERNAL_TOKEN`, `AI_GATEWAY_API_KEY`, `OBJECT_STORE_ENDPOINT`,
`OBJECT_STORE_REGION`, `OBJECT_STORE_BUCKET`, `OBJECT_STORE_ACCESS_KEY_ID`,
`OBJECT_STORE_SECRET_ACCESS_KEY`, `SNAPSHOT_ENCRYPTION_KEY_ID` and
`SNAPSHOT_ENCRYPTION_KEY_BASE64`. Dependencies use their provisioned Docker DNS names or approved
private endpoints; there is no development credential fallback. Do not share the resolved config.

## Start and route the stack

Take and verify a restorable database backup before applying migrations. Preserve the prior release
ledger and its image digests. Run one migration owner with API and worker writes stopped:

```bash
docker compose --file compose.production.yaml stop api worker
docker compose --file compose.production.yaml run --rm migrations
docker compose --file compose.production.yaml up --detach --wait api worker ai web
docker compose --file compose.production.yaml ps
```

The migration runner records applied versions and stops on SQL failure. Stop the release on any
failed migration or unhealthy service; inspect sanitized owned-service logs. Restrict changes
and restarts to affected services; do not automatically retry a failed migration. The
application file publishes no host ports: web reaches API over its private network; only web
joins `portfolio-edge`. AI has no data-network membership. The production memory/CPU/PID bounds
and rotated logs are in the file.

Route only `/real-estate-intelligence` and `/real-estate-intelligence/*` in the existing Caddy site
to the application. Preserve `/`, `/en`, `/pt`, project presentations, other applications and
landing resources. Record the current Caddy configuration/release and recovery path, validate the
candidate configuration, then reload Caddy rather than restarting it.

Both exact application roots (`/real-estate-intelligence` and `/real-estate-intelligence/`)
redirect to the project presentation using the existing convention. Portfolio cards continue to
open `/{en,pt}/projects/real-estate-intelligence`; the presentation's demo button opens an
operational route such as `/real-estate-intelligence/places`. When appending `/places`, the landing
link resolver must retain the configured application prefix instead of replacing it with an
origin-relative path.

Before applying the route, adapt and verify the asset base, client router, links, redirects, API,
streaming/SSE and readiness URLs for the prefix. No global `/api`, `/ready` or application route
may capture paths owned by the landing or another project. Verify public HTTPS, direct navigation
and refresh of deep routes, navigation, assets, API, streaming and both languages; a home-page
HTTP 200 is insufficient. Use `REI_PUBLIC_BASE_URL=https://leohteixeira.com/real-estate-intelligence`
(without a trailing slash) for the scoped checks below.

## Verify readiness and the linked Tempo trace

```bash
curl --fail-with-body --silent --show-error "${REI_PUBLIC_BASE_URL}/ready"
```

Expected HTTP 200:

```json
{ "status": "ready", "database": "available", "broker": "available" }
```

A dependency failure returns HTTP 503 with independent `database` and `broker` fields and no
credential/driver details. Both probes start concurrently within one two-second cancellation
signal. Liveness `/health` on API touches neither dependency; the public web exposes `/ready`
through an exact proxy route. Database and broker connection/query resources are cancelled or
closed, and no automatic readiness retry or topology mutation occurs. Readiness covers database
and authenticated broker reachability; storage, AI, migrations and consumer lag need their own
operational evidence. Internal HTTP success alone does not establish the public HTTPS criterion.

Send one authorized synthetic audit request with a recorded sampled W3C
carrier (generate fresh IDs per run):

```bash
trace_id="$(openssl rand -hex 16)"
span_id="$(openssl rand -hex 8)"
curl --fail-with-body --silent --show-error --request POST \
  --header "traceparent: 00-${trace_id}-${span_id}-01" \
  "${REI_PUBLIC_BASE_URL}/api/v1/audit/traces"
```

Record the HTTP 202 `eventId` and trace ID. In the existing Grafana Explore Tempo data source,
open that trace ID and inspect API request/transaction, the worker outbox publication and the
RabbitMQ consumer span. The outbox row is durable evidence rather than a separate service span:
using the operator's secure SQL client, inspect `platform.outbox` for this exact `event_id`, its
`trace_context`, publication timestamp, and the corresponding `audit.event_log` effect and
`platform.inbox` consumer marker. Confirm one linked trace ID across request, saved carrier,
publish and consumer. Capture a sanitized Tempo permalink/export and row evidence with commit,
image digests and UTC time. A local trace or four unrelated spans does not satisfy this production
criterion. Do not run real collection or model requests to produce the proof.

## Roll back and retain evidence

On failed public readiness or missing trace evidence, stop the release and retain sanitized logs,
HTTP statuses, UTC times and trace IDs. Restore all five previous image digests from the release
ledger and validate with `config --quiet`; stop API/worker writes and start the compatible prior
application images. Applied migrations are not automatically reversed. Check prior image/schema
compatibility before restart; if incompatible, use the verified pre-release backup through the
verified recovery procedure, accepting and recording its recovery-point data loss.
Never delete volumes, run broad prune commands or restart another project to recover this stack.
Repeat public readiness and the synthetic trace check after rollback.

The release evidence must include the full `main` commit, five manifest digests, remote CI run,
public TLS/readiness receipt, linked Tempo trace and database evidence, and rollback/backup receipt.
Until these checks actually pass on the authorized VPS, story 1.12 and epic criterion 6 stay pending
production even when all local checks pass.
