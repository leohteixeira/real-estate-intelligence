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

CI does not run that single serial command: on a hosted runner it needs hours, far beyond one
bounded job. The `integration` job is a matrix over the shards declared in `integration/shards.ts`.
Each shard prepares only what it needs, runs its own files serially, then fails if any owned
`rei-` container, volume or network survived:

```bash
bash scripts/prepare-integration-images.sh full # or web-read, as the shard declares
pnpm run build
pnpm run test:integration:shard web-place
```

CI runs those two preparations and the Chromium installation at the same time.
`prepare-integration-images.sh` builds the distinct fixture images together and then lets the four
serial `prepare-*-images.sh` scripts tag them from the build cache; the accessibility shards use the
`web-read` profile, which builds only the migrations, prepared-search API and web images their stack
starts. Locally, `pnpm run test:integration:prepare` keeps building one image after another.

Shards never run campaigns in parallel inside one job. Many campaigns assert that the Docker
daemon's other containers and volumes are untouched; only a job that owns its daemon can promise
that, so more capacity means more shards, not more Vitest workers. Preparing once in an upstream
job and handing the images to the shards was rejected for the same goal: every `up --build` in a
campaign needs the BuildKit cache, which an exported image does not carry, and the upstream job
would delay every shard by longer than the shard's own concurrent preparation takes.

`web-accessibility` is divided across shards by a Vitest test-name pattern over its independent
partitions. The two longest files, `ask-checkpoints` and `ask-model-explanation`, are each divided
in two by a title text: one shard runs the tests whose title contains it (`only`), another every
test whose title does not (`except`), so the halves are complementary without listing the tests.
`integration/support/shards.test.ts` fails when a discovered file, a half or an accessibility
partition is not in exactly one shard, so add every new campaign to a shard.
Rebalance shards from the measured durations recorded beside the plan: the slowest shard decides
how long CI takes.

A pull request that changes only Markdown, `_bmad-output/` or `specs/` skips the matrix, because no
campaign reads those files; a push to `main` or `feat/phase-1` always runs it. The
`Integration gate` job is the one result to require: it passes only when every shard succeeded, or
when the plan itself skipped the matrix for such a prose-only pull request. `publish` needs it.

For an individual campaign, build first, then select its existing focused alias:

```bash
pnpm run build
pnpm run test:integration:market
pnpm run test:integration:market-figures
pnpm run test:integration:market-median
pnpm run test:integration:market-price-facts
pnpm run test:integration:ask
pnpm run test:integration:ask-tracer
pnpm run test:integration:ask-text-price
pnpm run test:integration:ask-model-explanation
pnpm run test:integration:ask-checkpoints
pnpm run test:integration:ask-delivery
pnpm run test:integration:ask-headless
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

The figures campaign (`integration/market-figures.integration.test.ts`) owns PostgreSQL, RabbitMQ,
S3-compatible storage, API and worker. Synthetic outbox events arrive as a v2 merge snapshot before
older listing states. Parsed HTTP proves paired movement (current paired median 2000 / prior 1500),
four-property observed duration, three reduced listings out of five active listings, the 1.25 ratio,
null sale and live counts of four properties, five active listings and two active-member sources.
It also proves actual-parent scopes, registered neighbour median 7000 centavos/m² with 100%
matched-cohort movement, known empty rows, registered empty adjacency and country null parent.
It checks removed-member history, reappearance, null-area eligibility, global geography,
restart/inbox-expiry replay, empty scopes, canonical errors
and unchanged retained SQL evidence after reads. A reversed twelve-month event fixture independently
checks every block/parent median in centavos, contributor count, source URL/time and inclusive cutoff,
including removal/reappearance, gaps, replay and actual computation time. Domain tests cover exact
UTC/leap/month-end and thirty-day interval boundaries without depending on wall-clock timing.

The Place browser campaign retains an owned synthetic neighbour through the real outbox and
worker, compares its 450000 centavos/m² median and 50% movement with parsed HTTP, and checks live
counts and origins in PT/EN at 390, 960 and 1440px. Its live monthly series is compared with parsed
HTTP, including nonempty retained neighbour history, monthly cutoffs, actual computation evidence,
source links and contributor counts. Loading/error/recovery, native evidence, accessibility and
navigation assertions remain in place.
Captures under `apps/web/.impeccable/review/` support comparison with the Place artboards; they do
not replace manual visual or accessibility assessment.

D-098 extends the figures campaign with real outbox/worker source completion delivery, monotonic
ordering and inbox-expiry replay, exact per-contributor coverage, and real SQL rollback/cancellation.
Its native HTTP fixture composes the production Market service and PostgreSQL ports with an actual
clock and a broker completion barrier; it proves a reachable stale interval without caching or a
production test-mode switch. All three public HTTP surfaces retain strict evidence, and future
stored completions must return sanitized failures. The Place campaign additionally intercepts one
strictly valid stale overview at the UI boundary in all six language/viewport cases, checks localized
age, count/source/computation and native keyboard/accessibility behavior, then recovers to real API
responses. This interception proves presentation, rather than production stale frequency.

D-099 extends `integration/listing-suppression.integration.test.ts` using the same owned PostgreSQL,
RabbitMQ, object store and actual removal CLI. Its Market scenarios prove full copied-content
erasure, narrow immutable guards, rollback without inbox commit, concurrent projection, legacy and
mixed causal replay after transport/publication expiry, effective consecutive-anchor chains,
non-anchor preservation, null associations and later valid assignments. Hand-computed HTTP checks
cover overview populations/figures/provenance, registered neighbours and all twelve own/parent
monthly points. Ordinary removal/reappearance remains distinct from irreversible suppression.
Run it alone after building:

```bash
pnpm exec vitest run --config vitest.integration.config.ts integration/listing-suppression.integration.test.ts
```

The complete Place campaign invokes the real removal command after its ordinary fixtures, then
checks the actual post-erasure overview, unchanged registered neighbour and twelve empty own/parent
points in PT/EN at 390, 960 and 1440px, including rendered monthly rows and accessibility. Screenshots
use the existing review artifact directory. Its owned fixture does not establish production erasure.

The price-facts campaign upgrades populated Market v1 history without rewriting evidence, then uses
the actual outbox, RabbitMQ subscriber, PostgreSQL projection and place overview HTTP to exercise
all eight causal event families. It checks merge/split destinations for removed members, independent
revision frontiers, reverse-first delivery, inbox-expiry/restart replay, bounded dead letters, an
injected SQL minimum failure, concurrent reads and sanitized invalid-data errors. Its reverse-first
phase truncates only its owned fixture's Market projection after preserving the expected durable
snapshot; foreign projects and volumes remain outside its lifecycle.

The Ask campaign checks seven prepared run snapshots and finite scripted SSE previews through public
contract parsers, capability refusals, fixture replay, full ordered threads, edited confirmation
inputs, refused confirmation/cancellation for catalogue grants and disabled structured admission.
A distinct API E2E test opens a catalogue grant, reads its run/thread and reaches an explicit
edited-confirmation terminal. Both use the production PostgreSQL/migrations/API images and compare
every owned table count/content digest before and after: migrated Ask tables stay empty; no
retained caller text, outbox write or live AI execution is added. See the
[Ask API reference](../api/ask.md) for the prepared-only contract and replay limitations.

The headless campaign (`integration/ask-headless.integration.test.ts`) imports the actual config-free
web client. Its owned current-migration PostgreSQL/API/RabbitMQ/worker stack and scripted AI decider
prove creation replay, retained low-confidence confirmation, complete-frame disconnect, edited-input
continuation on the same session, ordered SSE and explicit completion. Persisted receipt and decider
counts prove no second classification; a separate paused run reaches explicit cancellation with no
tool effect, and foreign capabilities remain refused. It reuses prepared `rei-intent-images-*`
images after building the workspaces; prepare them with `test:integration:prepare-ask-intent` when
backend sources change. It has no live provider, visual or browser-storage evidence. Root and
prefixed URL construction and broken/failed/expired transports are covered by web unit tests.

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
advisory barrier to observe a committed decision before killing API, worker or AI. It verifies one
retained receipt, decision checkpoint and terminal/inbox outcome, contiguous public SSE,
fresh-process native pause/reclaim, isolated grants, immutable checkpoint/write replay, the real
API-owned retention job without business history deletion, and long escaped/Unicode accepted
queries. Native cases also cover both persistence gaps, concurrent fork admission, transaction
rollback, SQL disconnect cancellation, invalid serialized state and a genuine populated
6002-to-6003-to-6004 upgrade. The same populated baseline now applies additive 6005 and rechecks
historical digests. Historical documents, receipts, fingerprints and events are compared before and
after the additive migrations; twelve historical turns prove numeric ordering beyond single digits.
Retention includes a real queue-expired terminal in its eight-turn ranking. Its Node TypeScript
probe imports compiled AI declarations and never imports a test framework. See
[the saver protocol](../api/ask-checkpoints.md).

The ordered-delivery campaign (`integration/ask-delivery.integration.test.ts`) uses owned real
PostgreSQL, RabbitMQ, API, worker and AI fixtures. It races public admission at three total pending,
checks replay/conflict/foreign-authority no-effects, expires queued work with the worker stopped,
and reverses delivery under both default prefetch two and prefetch one while another thread
progresses. Original retained envelopes are published through the production broker; only the
explicit attempt-three header fault case uses direct mandatory confirmed publication. A separate
run-scoped executor fault accumulates genuine failures, observes more than five deferrals at an
earned attempt, and proves the fifth genuine failure reaches the durable DLQ without automatic
replay. Additional cases exercise SQL deadline boundaries despite application-clock drift, busy-lock
fairness, expiry outbox/inbox rollback and cancellation, retained completed graph/receipt recovery,
and creation/delivery replay after temporary platform records are pruned. Rabbit firehose
observation parses the original message body and reads delivery metadata from trace headers. Before
opening AMQP, the fixture waits once for Rabbit application startup; the Compose ping only
establishes runtime availability. See
[the Rabbit CLI readiness semantics](https://www.rabbitmq.com/docs/man/rabbitmqctl.8). Run these
Docker campaigns serially: each teardown verifies that foreign containers and volumes remain exactly
unchanged. All campaign helpers, fixtures and probes are strict TypeScript.

Restart cases resolve the single owned container using exact Compose project/service labels before
signalling it and start that same container promptly. They do not change broker delivery limits or
republish dead letters. An API outage that exceeds the existing delivery budget can still
dead-letter the delivery of a running run; that run then fails with `execution_unavailable` once
its 120-second lifetime ends and its lease has lapsed, so successful brief restart evidence does
not establish unlimited outage recovery. The SQL disconnect case observes actual backend
disappearance and no
committed checkpoint: socket destruction alone can leave a lock wait until the unchanged five-second
PostgreSQL statement timeout.

The text-price campaign (`integration/ask-text-price-run.integration.test.ts`) submits only prose in
PT and EN, then proves equal canonical inputs, exact completed SSE results through the real
worker/graph/Market tool, finite no-effect refusals, immutable replay and mixed-thread ownership. It
attacks operation/input/execution/grant scope, exercises expired-claim recovery and checks sanitized
runtime logs. Its second owned PostgreSQL fixture applies 6001, populates structured
history/events/receipts/outbox/inbox/idempotency records using only historical columns, applies
additive 6002 followed by 6003/6004/6005 and compares exact retained row/evidence digests before
executing a text run in that legacy thread with the current repository. Malicious SQL
basis/source/input/unknown-key changes must still fail. No historical migration is edited or
historical evidence rewritten.

The model-explanation campaign mounts an explicit TypeScript bootstrap inside an owned production AI
container. It composes the production Nest modules and overrides only `LanguageModel` with a
scripted test implementation; production startup has no fake selector. The real API, Market tool,
worker, RabbitMQ, PostgreSQL budget/accepted evidence and native remote saver remain in the flow.
PT/EN inspect/thread/SSE, idempotency, approved output, one transient retry, invented figures,
provider refusal, authentication and malformed usage are checked without a live model request.
Reservations that name the retired gateway route are refused. Real concurrent reservations enforce
the 1,000-token budget across reclaim; FIFO admission, capacity and queued expiry retain their
existing semantics. Pre-aborted requests and an HTTP caller disconnect during generation leave
conservative spend without a second attempt.
Checkpoint-ACK failure after accepted evidence and completed-before-terminal recovery restart only
the owned AI process, then check stable receipt/explanation IDs, fresh authority, unchanged spend
and zero new model calls. A genuine populated pre-6005 native graph checks exact historical
checkpoint/pending-write/document digests, old recovery and an explained run in the same thread.
A populated pre-6010 database holds a completed run with gateway-era attempts and explanation;
the real migration container then applies `6010_ask_anthropic_direct.sql`. The retained bytes are
unchanged, inspect/thread/SSE still read the gateway record beside a new direct-route run in the
same thread, and SQL refuses every mixed gateway/direct shape. The routed campaign does the same
for a `gateway-jev-v1` decision receipt. See
[the implemented model protocol](../api/ask-model-explanation.md).

Every Compose fixture forces an empty `ANTHROPIC_API_KEY` and disables env-file loading, so a key
exported in the developer's shell cannot reach a fixture container. Campaigns that exercise the
provider adapter give the real SDK client an in-process `fetch`; no campaign opens a connection to
the provider.

The RunExecutor campaign has two distinct tests: an authenticated HTTP/configuration boundary
campaign against the production AI image, and a production worker-command E2E journey resolving the
Nest `RUN_EXECUTOR` port and traversing the real no-op graph. Each owns PostgreSQL, migrations, API
and AI fixtures, generates fresh internal authority, verifies no token/question logging or AI
infrastructure credentials, and compares every SQL digest and public Ask catalogue before/after. The
worker command uses bounded stdin and the production worker image without DB/broker modules; wrong
or absent authority fails categorically. Shared exact-label teardown verifies foreign Docker
containers and volumes survive. See [the RunExecutor reference](../api/run-executor.md).

## Verify dependency readiness and production configuration

After building TypeScript, prepare the three readiness images serially with the normal Compose
build command. Image installation and packaging happen outside the HTTP campaign deadline:

```bash
pnpm run test:integration:readiness
```

The official `test:integration` command also prepares these images before discovering campaigns.
To reuse images just prepared for the same source version, run the Vitest file selection directly.
Readiness requires those prepared images, tags them into its unique fixture project, and owns
PostgreSQL 18, authenticated
RabbitMQ and HTTP through both API and production Nginx. It checks independent pause/stop failures,
the shared two-second deadline, both-down statuses, recovery without an API restart, rejected
credentials/vhost, unchanged queues, dependency-free liveness and the existing landing redirect.
After a stopped dependency restarts, its native health condition must pass within the existing
fixture startup allowance before the unchanged API recovery polling begins. A running container
alone does not establish an authenticated broker.
The configuration tests render only synthetic settings with env-file loading disabled; missing
required image/dependency settings fail before startup. They check immutable image references,
resource bounds, no published ports and AI/web network and credential boundaries. Existing API-only
fixtures allocate owned ports for their automatically started broker dependency. These are local
proofs; [the runbook](../operations/deployment.md) keeps public VPS/Tempo and remote CI evidence pending.

## Accessibility partitions share one stack

The 72 `web-accessibility` partitions only read. Each one proves that for itself: it opens a new
browser profile and database connection, refuses every non-GET API request in the browser, and
compares a digest of every table before and after. They therefore share one owned Compose stack per
Vitest worker (`integration/support/accessibility-stack.ts`) instead of booting PostgreSQL,
migrations, the API and the web image 72 times. The stack starts with the first partition that
needs it and is removed after the last. No partition needs a stack of its own: none writes, and all
use the same configuration.

Each partition's `teardown.json` records that its own profile and connection were released and
that foreign resources were preserved, and points to the stack's receipt
(`campaigns/accessibility-stack-*/teardown.json`), which records the removal of the owned project
and the preservation of everything that existed before it started. A partition's `campaign.json`
no longer carries a `stackTornDownUtc`.

## Adopt the web accessibility harness

After building, run the production entries and isolated shared components together:

```bash
pnpm exec vitest run --config vitest.integration.config.ts integration/web-place.integration.test.ts integration/web-components.integration.test.ts
```

Both campaigns own their Compose resources and launch sandboxed loopback Chromium. The component
campaign serves `apps/web/test-fixtures/shared-components/` through an owned Vite process; this
entry is strictly typechecked but absent from the production build and public router. It consumes
parsed synthetic API properties and an event-fed median, then separately labels constructed null,
zero, comparison, returned-to-market and long-content cases. Captures identify the Components and
Search artboards; production captures identify the actual public entries.

The Place journey preserves the public footer, editable unsent Ask draft and return navigation.
Its root evidence reuses `accessibilityEntryContract`: the owned HTML health document and exact
HTTP 308 response are recorded without following the external portfolio destination. Appearance,
accessibility, privacy, motion and WebGL checks of that independent presentation remain outside
this repository's owned campaign. Long-name checks await the catalogue's first visible link after
its serial hierarchy read, then assert the unchanged exact labels, geometry and ancestor navigation.
The reduction branch also waits for its separate property detail before checking its row. Its
acquisition uses one current instant after the retained source observation and proves the resulting
overview remains HTTP 200 and strict-parser valid at a later evaluation instant.

For every future screen entry, import `checkAccessibility` from
`integration/support/accessibility.ts`, await its fonts/content readiness, then scan its complete
page at 390, 960 and 1440px in PT/EN. Use a unique evidence name per screen, width, locale and
state. The harness pins axe 4.13.0, runs WCAG 2/2.1/2.2 A/AA tags without disabled rules or excluded
regions, and fails with rule IDs, target selectors, explanations and help links. JSON evidence under
`apps/web/.impeccable/review/` preserves violations, passed rules and incomplete checks separately.
Add keyboard activation, visible focus, 44px target geometry, local-font, overflow and screenshot
checks alongside the scan; axe cannot establish those requirements by itself.

The component campaign also injects one intentionally unnamed button, verifies that the shared
helper rejects with its rule, help URL and selector, removes the node and scans the restored page.
`expected-failure-unnamed-button-accessibility.json` is evidence of that negative control, not a
production page report or an ignored violation. Normal screen reports must still have no violations.

The web unit suite also checks the semantic text, focus and essential-control token inventory in
`src/shared/token-contrast.test.ts`. Normal text requires 4.5:1 and essential borders/focus require
3:1. Decorative hairlines are not essential control boundaries. D-055 changes Line Strong to
`#7f8ba2`; a regression proves the original value fails against Surface and Porcelain.

Automated passes do not certify all WCAG requirements. Review every axe incomplete result and
manually assess screen-reader reading order/pronunciation, focus under daylight, zoom/reflow,
canonical-name comprehension and interaction states introduced by later entries. Search results and
full system states remain owned by their respective stories.

## Verify the Property journey

Build first, then run the owned Property campaign alongside its public navigation regressions:

```bash
pnpm run build
pnpm exec vitest run --config vitest.integration.config.ts integration/web-property.integration.test.ts integration/web-search.integration.test.ts integration/web-place.integration.test.ts
```

Property owns PostgreSQL, migrations, API and production web services, plus a bounded local Vite
process for the authored Property references. Supertest parses actual public responses before
Chromium checks Search return, draft-only Ask, real neighborhood context, removed intervals, denied
descriptions, expired snapshots, no-active/null data, UUIDv7 validation and manual recovery. A
bounded browser read fault exercises both initial failure and retained-data refetch; recovery
returns to the actual API. No external source, model or mutation request is permitted.

The complete PT/EN surface is captured at 390, 960 and 1440px with whole-page axe, keyboard focus,
44px control bounds, local font and overflow checks. Authored references are separately captured at
390×1842 and 1440×1207. Keyboard and local source-link checks open real native evidence targets;
each full-page and viewport capture separately settles fonts, blurs focus, scrolls to document zero
and asserts both window and document scroll coordinates. Interaction metadata records these two
capture-start receipts, the actual visible content paragraph font, local Barlow/Barlow Condensed
font checks and document height. Documents taller than 2400px also receive evidence/source regional
captures. Body-inherited fonts are not evidence of visible content font coverage. Each unique
`property-*` run under `apps/web/.impeccable/review/campaigns/` retains its semantic catalog,
append-only attempts, parsed fixtures, version hashes, immutable evidence copies and exact-label
teardown receipt. Failed attempts remain historical evidence; a later pass does not rewrite them.

Prepared public reads do not establish persisted unresolved membership. That unavailable branch is
explicitly covered by an isolated parser-validated component regression. Captures and automated
checks do not replace the separate parent-owned visual comparison, finish review or human
screen-reader/daylight/zoom assessment.

## Strict TypeScript checking

Every campaign, shared helper, fresh-process probe and `vitest.integration.config.ts` is included in
`tsconfig.integration.json`. It extends the unchanged strict base configuration. Run
`pnpm run typecheck` for recursive workspace checking followed by integration checking. For a
standalone check, run `pnpm run typecheck:integration` directly: integration imports compiled
package, worker and AI declarations rather than production source, so the script first builds the
`@rei/ai` and `@rei/worker` dependency closures and never depends on a previously built `dist`.
That keeps `lint → typecheck → test → build` valid on a clean tree in CI and in the pre-push hook.

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

## Verify the production public prefix

After building the workspaces, run `pnpm run test:integration:prefix`. Image preparation is serial
and finishes before the native HTTP/browser campaign. The campaign owns separate root and
`/real-estate-intelligence` fixtures with real PostgreSQL and RabbitMQ, matching root and prefixed
web images and unchanged service health gates. Both fixtures read prepared Search, so preparation
also builds the build-stage API image (`rei-prefix-images-api`) that the prepared-Search override
runs. It checks scoped readiness, direct/refresh routes,
asset requests, PT/EN navigation, Search-to-Property native anchors and return links, language
persistence and real authenticated prepared SSE over Nginx. The prefix fixture also rejects global
`/ready`, `/api/v1` and `/index.html` exposure. No worker, model or real-source request is required.
Prior dependency outage/recovery and accessibility campaigns remain valid for unchanged inputs;
this focused campaign establishes only the continuation's changed routing/transport behavior.

The CI runner installs the pinned Playwright Chromium and OS dependencies before this gate. It
installs Chromium's bundled SUID sandbox helper on the ephemeral runner and sets
`CHROME_DEVEL_SANDBOX`. In a Dev Container where unprivileged namespaces are restricted, use the
existing root-owned helper (for example
`CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox pnpm run test:integration:prefix`).
Keep `chromiumSandbox: true`; a sandbox startup failure is an executor failure, not browser evidence.

## Verify listing removal and suppression

After building the application, infrastructure and worker prerequisites, run the native owned
PostgreSQL 18/MinIO/RabbitMQ campaign serially with other heavy checks:

```bash
pnpm exec vitest run --config vitest.integration.config.ts integration/listing-suppression.integration.test.ts
```

It invokes the actual worker collection/removal commands and verifies permanent replay identity,
owner-scoped Collection/platform/audit erasure, delayed parsed delivery after an inbox marker is
removed, shared synthetic ownership, storage failure/resumption, prepared collection/reparse,
suppressed portal checkpoint/count/manifest evidence, and an explicitly owned encrypted local real
reservation with cancellation and late-PUT reconciliation. The local real fixture generates its
key in memory and performs no outside source or photograph requests. It also consumes suppression
through the real Properties broker entry, materializes history and
resolution, and checks production HTTP search/details/reductions, non-anchor/anchor/final-member
erasure, pending evidence, atomic SQL rollback/cancellation and durable replay after inbox pruning.
The D-095 refinement adds chronology-ahead-of-resolution HTTP minimum checks and consecutive
minimal suppression notifications retained before relay and after replay/pruning; its final native
campaign evidence is recorded separately in the story plan.
Market derived-data erasure and historical orphan attribution remain outside this campaign.

Run the affected snapshot lifecycle, snapshot reparse, resumable collection, image fingerprint and
synthetic collection campaigns after this campaign, preserving fixed expiry, accepted fixture
hashes, independent source permissions and existing coverage gates. Exact results and tested tree
identity belong in the [existing story plan](../../_bmad-output/initiative-real-estate-intelligence/epic-collection/story-removal-request-and-suppression-list-plan.md).

## Verify public Ask demo quotas

Build first, then run `pnpm run test:integration:ask-quotas`. Preparation builds only API and
migration images serially with 1536 MiB memory and one-CPU build-container limits. The native
Vitest campaign owns PostgreSQL, migrations and the API (plus its readiness broker); it starts
no consumer, AI runtime or provider. All five creation modes share one cookie. It checks default
20/100 admission, concurrent visitor/global boundaries, authorized replay at exhaustion,
no-effect refusals, strong authority on history/confirm/cancel/SSE, tampered/expired identities,
real outbox rollback and historical document bytes through migration 6009.

Only the owned fixture role resolves `clock_timestamp` through an SQL fixture function/table,
allowing an observed admission-lock wait to cross local midnight and a historical 23-hour day
in Sao Paulo to be asserted without waiting for a date or introducing a product test switch. The real
admission query, locks, counts and transactions remain unchanged. Owned teardown and unchanged
foreign container/volume inventory are asserted. Existing native Ask campaigns remain the
regression evidence for graph execution, checkpoints, deadlines and first-terminal behavior.
