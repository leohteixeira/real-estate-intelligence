# Deploy the prepared VPS application stack

Story 1.12 was accepted on 2026-10-26 after manual publication from `feat/phase-1` commit
`13edbbb7bfee8d69746c34c518191b0dec659754`. Five bounded host builds, immutable image checks,
verified backup/restore, all 35 migrations, healthy application containers, public HTTPS readiness
and one linked production Tempo trace passed. The owner explicitly authorized this release
without PR, merge or remote CI; none is claimed. The registry workflow remains available for
ordinary releases. Local checks, backups and actual public acceptance remain required.

The protected release receipt is
`/var/backups/portfolio/rei-manual-prepublication-20261026T192030Z/publication.json`; it contains
all image identities, observed container state, HTTPS paths, persisted audit effects and the Tempo
export. The verified pre-migration backup is
`/var/backups/portfolio/rei-20261026T192057527951Z`. Trace
`c47e36b2538a1dfaca9a4d770cb891d0` links request, outbox append, publish and consumer for audit
event `01a179a9-c88c-7414-aede-4f30470eb6af`. Synthetic collection, business production proofs
and complete browser journeys belong to the dependent stories; these receipts do not infer them.
Preserve the live landing and other projects' data, volumes and configuration. Use the host Docker
daemon independently of the Dev Container, with one heavy operation at a time.

The binding public base is `https://leohteixeira.com/real-estate-intelligence/`. No new domain or
subdomain is authorized. The prefix is active in production. Public routing, assets and readiness
are observed; dependent stories still establish their business journeys through the published UI.

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
- Public Ask admission defaults to `ASK_VISITOR_DAILY_LIMIT=20` and
  `ASK_GLOBAL_DAILY_LIMIT=100`, both positive safe integers. These apply in every environment;
  there is no trusted-caller or production bypass. Migration 6009 adds nullable visitor digests
  and an admission index without rewriting historical documents. Deploy it before the new API.
  The API purpose-separates visitor-cookie signing from dispatch using the same protected secret.
  Rotating that secret invalidates visitor cookies as well as existing dispatch proofs; the global
  daily ledger remains effective. Production cookies use Secure/HttpOnly/SameSite=Strict at
  `/real-estate-intelligence/`, regardless of the upstream `/api/v1` path or forwarded headers.
  Cookie expiry is 30 days; clearing cookies can reset a browser allowance, so retain the global cap.
  Identity is excluded from public payloads and exported safe telemetry. See
  [the admission contract](../api/ask-tracer.md#anonymous-demo-admission).
  No command here enables collection or requests model execution.

The production file requires all five image identities and every dependency credential before Compose
can validate. In registry mode those identities are manifest digests; in manual mode they are local
Docker image ID hashes, as described below. The API and worker have database/broker access,
the worker alone has storage and snapshot keys. AI receives its scoped execution token,
approved gateway key and API URL. Web
receives no secrets. Keys are runtime settings and never image build arguments.
Application processes retain the existing OpenTelemetry preload in their image commands.

## Prepare the authorized manual release

Use a clean, locally verified checkout of the full `feat/phase-1` commit. Record its 40-character
revision, local gate receipts, UTC time and deployment actor. Build the five existing Dockerfiles
serially on the host from the clean commit archive, with the revision label on **each** image.
Bound each build to 1536 MiB memory and one CPU. From the application checkout:

```bash
set -euo pipefail
release_commit="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"
for image in migrate api worker ai; do
  git archive "$release_commit" | docker buildx build --load \
    --resource memory=1536m --resource cpu-quota=100000 \
    --label "org.opencontainers.image.revision=${release_commit}" \
    --file "docker/${image}.Dockerfile" --tag "portfolio/rei-${image}:${release_commit}" -
done
git archive "$release_commit" | docker buildx build --load \
  --resource memory=1536m --resource cpu-quota=100000 \
  --label "org.opencontainers.image.revision=${release_commit}" \
  --build-arg VITE_PUBLIC_BASE=/real-estate-intelligence/ \
  --build-arg "VITE_PRIVACY_CONTROLLER_NAME=${VITE_PRIVACY_CONTROLLER_NAME:-}" \
  --build-arg "VITE_PRIVACY_CONTACT_EMAIL=${VITE_PRIVACY_CONTACT_EMAIL:-}" \
  --file docker/web.Dockerfile --tag "portfolio/rei-web:${release_commit}" -
for image in migrate api worker ai web; do
  docker image inspect --format \
    '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' \
    "portfolio/rei-${image}:${release_commit}"
done
```

These are public build settings; runtime credentials never enter build arguments. D-069 permits
absent privacy identity for the synthetic-only demo: keep absent values empty and never invent
them. Real processing stays disabled until the accepted privacy prerequisites are supplied.

The operator still enforces host execution and its existing exclusive lock for activation.
Privately edit the
root-owned 0600 `/etc/portfolio/real-estate-intelligence.conf` using `sudoedit`: set
`REI_RELEASE_MODE=manual`, `REI_RELEASE_COMMIT` to that full revision, and each existing
`REI_{MIGRATE,API,WORKER,AI,WEB}_DIGEST` field to its image's 64-character `.Id` hash **without**
`sha256:`. Keep `REI_IMAGE_REPOSITORY` populated for base-file interpolation; the manual override
replaces every resolved image, so no repository reference is used for application activation.
The historical field suffix does not establish a published registry manifest receipt. Record
manual mode plus all five full `sha256:` image IDs in the release receipt; claim no registry
publication, manifest digest or remote CI result for this path.

`rei-deploy` reads the selector from protected configuration, defaults its absence to `registry`,
and rejects any other value. Manual mode adds `compose.production.manual.yaml` after the unchanged
production base. Each image is exactly `sha256:<hash>` with `pull_policy: never`; migration and
activation also pass `--pull never`. Before stopping writers or taking a backup, the operator
checks all five identities, requires each local image to exist, and compares both the actual
Docker `.Id` and full OCI revision label with protected settings. A missing/mismatched image
refuses deployment without pulling, backing up or migrating. The existing `busybox:1.37.0` backup
helper and dedicated storage image must also already be present: manual backup passes `--pull never`
to the archive helper and storage resumption, so an absent helper fails backup before migration.
Protected settings take precedence over inherited Compose environment variables. All networks,
credentials, health gates and limits
remain those of the production base.

To return to registry operation, privately set `REI_RELEASE_MODE=registry` (or remove the selector)
and replace all five identity fields with the actual registry manifest hashes for the recorded
revision. Never reuse manual Docker image ID hashes as published registry receipts. Both modes
use the same scoped
`rei-services`, `rei-provision`, `rei-deploy` and `rei-proxy` commands below and the same backup,
broker-cut, migration-failure and proxy gates. Retain previous release mode, revision and all five
identities before changing configuration so recovery selects the matching image source.

## Registry release workflow

Use a clean checkout of the exact gated `feat/phase-1` revision while the goal is in progress.
The existing secrets, format, workspace, coverage, real-service integration and container jobs
remain mandatory. The workflow accepts pushes to `main` and `feat/phase-1`; publication depends
on all five required jobs and runs only for those exact push refs.
Publication authenticates to GHCR with its scoped Actions `GITHUB_TOKEN`
and publishes all five images serially. Its `release-<full-sha>` artifact
contains BuildKit metadata and `images.txt` with the full revision and immutable manifest references.
The web image is built with `VITE_PUBLIC_BASE=/real-estate-intelligence/`; privacy controller name
and contact use the existing public repository variables. Set those approved public identity
variables before publishing. No provider key or infrastructure credential enters a build argument.
A passing local build is feasibility evidence. Record the actual remote run URL and conclusions.
Do not substitute a developer image or an ungated push for those gates. Branch protections and
required review remain unchanged. The parent delivery performs the actual mandatory pre-push hook.

For this private repository, the host also needs authenticated GHCR pull access with package-read
permission. Load that credential through the approved protected operator mechanism and use
`docker login ghcr.io --password-stdin`; never print it, embed it in commands or save it in Git.
The three repositories are private. The preparation environment has working GitHub SSH Git
access, but the Dev Container has no authenticated `gh` session and the host has no `gh` binary.
No API/registry credential was observed. Remote CI/PR/protection observations and private registry
pulls require valid authorized access. CI/PR observations must be obtained through an authorized
API or UI; missing evidence is not a pass.

Record each published manifest's sha256 digest alongside that full canonical commit, CI run URL,
UTC timestamp and deployment actor in the operator release ledger. Tags provide human lookup;
`compose.production.yaml` runs only `repository/service@sha256:digest` references. Set
`REI_MIGRATE_DIGEST`, `REI_API_DIGEST`, `REI_WORKER_DIGEST`, `REI_AI_DIGEST` and `REI_WEB_DIGEST` to
those 64-character manifest hashes without the `sha256:` prefix. Verify the OCI revision for all
five images, including migrations, against the recorded commit. Do not reuse a developer image
or infer production identity from the worktree or a mutable tag.

The existing workspace operator now supplies scoped `rei-*` operations under its existing
exclusive operation lock. Run from `/root/portfolio-workspace` on the VPS host. Automatic `.env*`
loading is disabled; the operator passes only explicit protected `/etc/portfolio/*.conf` files.
Do not print resolved Compose configuration or inspect container environments.

```bash
# Read capacity and current service identities before any heavy operation.
free -m
df -h /root/portfolio-workspace
sudo ./infra/portfolio rei-config
```

`rei-config` preserves existing shared credentials and creates only this application's settings,
root-owned with mode 0600. It refuses to generate replacement keys when dedicated volumes already
exist without their configuration. Privately populate `real-estate-intelligence.conf` with
`REI_RELEASE_COMMIT` (full gated release SHA on `feat/phase-1`), the five manifest digests from
Actions and the approved
runtime gateway key. Preserve the generated snapshot key. Existing approved loaders may populate
the gateway key without exposing its source or value. Runtime keys never enter image builds.

Required settings are `REI_IMAGE_REPOSITORY`, the five `REI_*_DIGEST` values, `DATABASE_URL`,
`RABBITMQ_URL`, `ASK_DISPATCH_SECRET`, `AI_INTERNAL_TOKEN`, `AI_GATEWAY_API_KEY`, `OBJECT_STORE_ENDPOINT`,
`OBJECT_STORE_REGION`, `OBJECT_STORE_BUCKET`, `OBJECT_STORE_ACCESS_KEY_ID`,
`OBJECT_STORE_SECRET_ACCESS_KEY`, `SNAPSHOT_ENCRYPTION_KEY_ID` and
`SNAPSHOT_ENCRYPTION_KEY_BASE64`. Dependencies use their provisioned Docker DNS names or approved
private endpoints; there is no development credential fallback. Do not share the resolved config.

## Start and route the stack

Prepare only the dedicated PG18/PostGIS and MinIO services, existing RabbitMQ and the existing
collector/Tempo/Loki chain. No global `up`, `services` or `provision` command belongs in this release.
The scoped dependency list excludes shared PG17, Elasticsearch, Grafana and unrelated projects.
The dedicated database/storage have no published ports, bounded CPU/memory/PIDs and named volumes.
Each has a 512 MiB memory bound; storage includes measured headroom for its bundled administration
client during provisioning. The rehearsal with 256 MiB terminated that client with exit 137.
The exact original immutable MinIO manifest also supplies its bundled `mc` binary for provisioning;
there is no separate CLI image dependency. Provisioning creates `rei_app`, its database and broker
vhost, a private `rei-snapshots` bucket and an application identity limited to that bucket's
list/get/put/delete operations. It grants no administrative storage access to the worker.

Before editing the bind-mounted Caddy candidate or updating landing configuration, securely retain
the previous actual Caddy bytes, landing image ID/tag and protected release settings. The preparation
copy `/tmp/rei-caddy-before-prefix.Caddyfile` contains the pre-edit candidate bytes; the parent must
retain its verified identity in protected host backup storage before activation. Editing the mount
does not reload Caddy's active configuration.

```bash
sudo ./infra/portfolio rei-services
sudo ./infra/portfolio rei-provision
sudo ./infra/portfolio rei-deploy
```

`rei-deploy` validates all required settings and verifies every image against `REI_RELEASE_COMMIT`.
Registry mode pulls manifest-pinned images; the explicitly selected manual mode uses only the
verified local image IDs and never pulls application images. It stops only this app's API/worker,
then takes a
pre-migration backup even on the first deployment. Before any dump, while API/worker are stopped,
it queries every queue in the configured dedicated RabbitMQ vhost using actual JSON counts. All
ready and unacknowledged counts must be zero, including retry/dead-letter queues; a backlog,
failed query or invalid observation refuses the backup before preserving data. Drain owned work
through the existing worker, then stop API/worker and recheck. Never purge messages or touch
another application's vhost. Pending unpublished outbox rows may remain: the restored worker
replays them normally. Do not reset `published_at`; retention makes blanket replay unsafe.

The backup restores the actual custom-format
dump into a separately named temporary verification database with `--exit-on-error`, including
object owners. Only that verification database is removed afterward. While writers remain stopped,
it stops only dedicated storage long enough to archive the original volume using the existing
BusyBox image with a read-only volume mount and no network, validates the archive, and resumes it
if previously running. The backup contains database globals, encrypted objects,
protected configuration/encryption keys, Caddy bytes, previous container image identities and hashes.
A `COMPLETE` marker is written only after successful verification. A failed restore/archive prevents
migration. Treat the backup directory as secret-bearing and retain it outside the application volume.

After successful backup, migrations run once; API, worker, AI and web activate without building or
starting dependencies. A migration/activation failure leaves API and worker stopped. Successful
activation does not reload Caddy or prove public acceptance. No seeded production collection or
model execution is enabled.

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

The production web uses Vite assets, router basename, native row links, same-origin JSON and SSE
under the same explicit base. Root-based owned fixtures continue to build at `/`. Nginx strips only
the API prefix and disables response buffering for SSE; Caddy preserves the application prefix and
flushes streams. Both Caddy exact roots redirect to `/en/projects/real-estate-intelligence`.

After healthy application activation, validate and reload only Caddy:

```bash
sudo ./infra/portfolio rei-proxy
```

Release the tested landing through its own independent repository/operator command. Its production
Compose defaults the Real Estate runtime demo URL to the site prefix; explicit operational URLs
remain unchanged. The landing resolver appends `places` to the configured origin/prefix roots.
The pre-release public observations had 404 for both Real Estate presentations; verify that the
new landing release establishes its checked-in bilingual presentations as well as preserving `/`,
`/en`, `/pt`, other presentations and existing application route configuration.

Before accepting the route, verify the asset base, client router, links, redirects, API,
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
HTTP statuses, UTC times and trace IDs. Restore the previous release mode, full revision and all
five identities from the release ledger (local Docker image IDs for manual; manifest digests for registry),
retain the corresponding local images, and validate with `config --quiet`; stop API/worker writes
and start the compatible prior
application images. Applied migrations are not automatically reversed. Check prior image/schema
compatibility before restart; if incompatible, use the verified pre-release backup through the
verified recovery procedure, accepting and recording its recovery-point data loss.
For incompatible schemas, keep current writers stopped and restore into a separately provisioned
empty PostgreSQL 18 target using the retained globals and `pg_restore --exit-on-error`. Use the same
PostGIS-capable image, application role/owner, extensions and encryption keys. Restore `snapshots.tar`
only into a new empty dedicated object volume while its storage process is stopped, then restore
matching protected storage credentials. Verify private bucket access and snapshot decryption before
pointing a compatible image release at those recovery targets. Retain both original volumes and
record the recovery point; no in-place overwrite or automatic down migration is provided.

Broker recovery also requires a **new empty dedicated vhost**, such as
`real-estate-intelligence-recovery-<UTC>`, alongside the new PostgreSQL/object targets. Preserve the
original vhost and all messages; never reuse, purge or delete it during recovery. Through the
existing protected infra Compose connection, create the unused name with `rabbitmqctl add_vhost`
and grant only the application identity scoped permissions with
`rabbitmqctl set_permissions -p <new-vhost> rei_app '.*' '.*' '.*'`; grant no management/admin tags
or other vhost permissions. Verify its queue list is empty. Privately set the restored release's
`RABBITMQ_URL` to that exact new vhost, with matching scoped credentials, before resuming its
API/worker. Use a release compatible with the restored schema and keys. The proven empty broker
cut at backup means every published pre-recovery-point event has completed its transactional
consumer effect; unpublished rows remain replayable. A new recovery vhost prevents later messages
from the original timeline entering restored state. Keep the original targets intact for evidence.

Restore the securely retained prior Caddy bytes, validate, and reload only Caddy when returning to
the prior routing configuration. Restore landing's previous image tag through its existing rollback
command if needed. Do not use global backup/restore: those target unrelated PG17 databases.
Never delete original volumes, run broad prune commands or restart another project to recover this stack.
Repeat public readiness and the synthetic trace check after rollback.

The release evidence must include the full commit and source branch, selected release mode, five
local Docker image IDs for manual mode or manifest digests and observed remote CI run for registry
mode, public TLS/readiness receipt, linked Tempo trace and database evidence, and rollback/backup
receipt. Remote CI and registry publication are not claimed or required for the owner-authorized
manual release.
These checks passed for the manual release recorded above. Repeat the affected acceptance checks
when a later release changes their code or dependencies; documentation alone needs no product rerun.

## Remove and permanently suppress a collected listing

Run the owner-only worker command against the intended application's database and object store,
using its existing protected configuration. There is no removal HTTP endpoint or scheduled job.
For an already configured development tools profile:

```bash
pnpm --filter @rei/worker listing:remove synthetic-data SYN-SP-0001
docker compose --profile tools run --rm listing-removal-command synthetic-data SYN-SP-0001
```

The two positional arguments are the registered source ID and stable source listing ID. Unknown
sources, unsafe identifiers, options and extra arguments fail. Use the exact identity recorded by
Collection; a source URL or snapshot ID is not a listing identity. The command shares the existing
collection deadline, storage resilience, telemetry and bounded shutdown configuration.

A successful result includes `completed: true`, the permanent suppression ID and its event ID.
Repetition returns that identity and emits no additional suppression event. Suppression commits
before cleanup: a storage failure, cancellation or nonzero exit requires rerunning the same command
after the cause is resolved. Do not remove suppression rows to recover cleanup. A failed attempt
has already blocked collection, access, reparse and new parsed-event authority, but does not certify
physical deletion. Existing snapshot retention reconciles late writes using durable tombstones;
keep that worker capability running after an interrupted upload.

Removal erases the target's observations, parsed/reparse evidence, image fingerprints and matching
platform/audit parsed payloads. Shared synthetic bytes remain usable by other unsuppressed owners.
Minimum suppression/audit identity, inbox markers, historical run identity/count/checkpoint/manifest
and necessary cleanup metadata remain. Real generation expiry remains fixed. Historical real
orphans without identifiable listing ownership retain their original expiry. Existing Properties
and Market derived-data erasure is reserved for stories 3.12 and 4.8; do not describe Collection
completion as erasure of those future capabilities. See [ADR 0015](../../specs/adrs/0015-handling-of-collected-data.md).
