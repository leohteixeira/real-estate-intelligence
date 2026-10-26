# Phase one delivery and final published acceptance

The authorized epics 1–6 are complete: **85 stories done**, with **12 distinct published
journeys approved**. The application remains available at
<https://leohteixeira.com/real-estate-intelligence/places>. Publication used the current
`feat/phase-1` branch manually on the existing VPS, as explicitly authorized by the owner.
No PR, merge, remote CI or registry publication is claimed. The existing production stack
predates this campaign and remains running independently of the Dev Container.

This is the final goal report as well as this campaign's reconciliation. Existing story plans,
accepted ADRs, decisions and earlier evidence remain authoritative for their scoped checks;
this report does not replace them or open another general audit.

## Delivered scope

| Epic                  | Done | Delivered behavior                                                                                                                                                                                                                     |
| --------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Platform baseline |   14 | NestJS 12 and separate LangGraph AI service, inward context boundaries, typed contracts, transactional outbox/inbox, bounded resilience, correlated telemetry, privacy gates and recoverable VPS publication.                          |
| 2 — Collection        |   14 | Permitted synthetic sources, resumable and idempotent collection, schedules, source review, sanitized encrypted snapshots, reparse, retention, image fingerprints and suppression.                                                     |
| 3 — Properties        |   14 | Distinct Property/Listing models, explainable resolution, provenance and history, persisted search with filters/orderings, grouped listings and downstream projections.                                                                |
| 4 — Market            |   10 | Deterministic, dated market figures and series with contribution counts, source evidence and explicit units; asking prices remain distinct from recorded transactions.                                                                 |
| 5 — Ask               |   17 | Typed routed execution, deterministic tools, receipt-bound confirmation/refusal, cancellation, durable checkpoints, resumable SSE, thread capability, daily quotas, labelled model explanation, privacy enforcement and trace linkage. |
| 6 — Web               |   16 | Placa screens in EN/PT, responsive navigation, Place/Search/Property/Listing/Ask, public privacy notice, accepted accessibility checks, independent portfolio presentation, live Ask and public success-signal verification.           |

The final ticket snapshot is [ticket-status.json](ticket-status.json); it contains no unfinished
story. Required independent reviews and handoffs are recorded in the existing plans, including
the final targeted reviews for live Ask and the web refactor sweep. They were not restarted for
this documentation closure.

## Actual publication identities and recovery

Application source: `39236f94ae4432e00cb295a8a08b5b04f3fad35a`, activated
**2026-10-26T21:24:53.940151Z**. Subsequent commits contain probes and delivery records;
they do not require an unchanged-product rebuild. These are immutable local Docker image IDs,
not registry manifest digests:

| Image   | SHA-256                                                            |
| ------- | ------------------------------------------------------------------ |
| migrate | `4595c58fa1ed16f803513ef93bd729f4ac9783f947d0711911d44d276a87e087` |
| api     | `611144071c0cd800a782994e5dbbea176259dca20190bcbef54e8aa5c0c13670` |
| worker  | `aefeb40729db22adbe32c9c39973a47f2e10df00e87dc8f2df2b2b4895c9a953` |
| ai      | `d59ab8dd8fb21e56d8cb2d0414e5ac6b9106c6414bae7f1f2f1e450ee9797872` |
| web     | `98c54d2b27ff2c76b6156663bb61eb0c3c964190d447fc02f99d39d71fb640bd` |

The independent landing uses source `69be18fb639755b28e1ade6a21d7201f631da98c`, image
`sha256:92c79f18bc08626505b4eebc71cbfefa541340e05b45cd82f7867b85842ad551`, activated
**2026-10-26T21:45:04.95773569Z**. Its later checkout commits only adjust the evaluator.

Protected host records are retained at
`/var/backups/portfolio/rei-live-ui-release-20261026T212105Z/` and
`/var/backups/portfolio/rei-landing-ship-20261026T213952Z/`.
The verified application backup/restore is
`/var/backups/portfolio/rei-20261026T212416024245Z`. All 35 migrations are applied to the
dedicated PostgreSQL 18 instance; the shared PostgreSQL 17 was not upgraded or repurposed.
The [existing deployment guide](../../../../../../../docs/operations/deployment.md) records
scoped recovery, immutable identity checks, backup and migration safeguards. Recovery preserves
data and schema compatibility; it never automatically reverses migrations.

Only Caddy publishes ports 80/443. Dependencies remain private, the landing stays available,
and unrelated projects' data, volumes and configuration are preserved. Capacity-sensitive work
ran sequentially on the shared 8 GB / 2 vCPU host. This campaign started no stack and therefore
tears down none.

## Reconciled campaign

Run: `published-final-20261026T221746Z`, started **2026-10-26T22:17:46.733866Z**.
The ledger contains **17 attempts: 2 pilots, 12 approved scenario attempts and 3 inconclusive
executor-error attempts**. Pilots do not add coverage; their successful observations are reused
for the matching business scenarios without another mutation. Effective coverage is 12/12;
there are no failed, blocked, interrupted or unexecuted effective scenarios. The three original
inconclusive attempts remain visible.

Nine scenario approvals use fresh final-image browser/HTTPS observations. Three reuse prior
receipts under the version scopes below. Width/locale variations and intermediate clicks are
not counted as additional business scenarios.

| Scenario    | Result and evidence scope                                               | Observed acceptance                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PUBLIC-01   | Approved; fresh HTTPS and browser                                       | Trusted TLS; landing `/`, `/en`, `/pt` and both presentations preserved; exact app roots redirect to the EN presentation; prefixed deep routes, refresh, assets, API, SSE and readiness.                              |
| COLLECT-01  | Approved; unchanged backend component evidence plus fresh downstream UI | Three real synthetic portal schedules completed; snapshot/replay and persisted Property/Market effects verified; actual collector Tempo export.                                                                       |
| PLACE-01    | Approved; fresh EN/PT at 1440/390                                       | Dated median, contribution count, source and parent navigation; exact canonical median 951220 centavos/m², rounded display BRL 9512/m², one Aurora contributor.                                                       |
| PROPERTY-01 | Approved; fresh EN/PT at 1440/390                                       | One property groups three source listings; provenance, no recorded sale, direct navigation and refresh.                                                                                                               |
| SEARCH-01   | Approved; fresh EN/PT at 1440/390                                       | UI ordering matches actual backend minor-unit values `[885135, 918519, 951220, 958333, 993902]`; min 2/max 1 rejected visibly with associated invalid state.                                                          |
| SEARCH-02   | Approved; fresh EN/PT at 1440/390                                       | Max asking BRL 1 gives zero results; the responsible filter is named; relaxation restores five resolved rows and refresh retains the result.                                                                          |
| LISTING-01  | Approved; targeted fresh recheck                                        | `AUR-BV-001`, asking 78000000 centavos, original source/SHA-256, permitted description, eight complete UTC field times, refresh and return to the three-listing Property.                                             |
| PRIVACY-01  | Approved; targeted fresh recheck                                        | Strict register response matches all four enabled synthetic sources and twelve permissions in EN/PT at both widths; no invented controller/contact or real-source activation.                                         |
| RECOVERY-01 | Approved; targeted fresh recheck                                        | A browser transport interruption limited to the prepared-catalog GET exposes a readable error; explicit retry succeeds in EN/PT at 390px, preserving the unsent draft with zero writes.                               |
| ASK-01      | Approved; fresh live pilot, SQL and Tempo                               | One admission, real confirmation pause, one receipt-bound confirmation and truthful completed `unavailable_intent/listing_search/not_available`; six persisted events, one decision receipt and no model explanation. |
| ASK-02      | Approved; exact unchanged application image                             | Live public question produces deterministic 1154412 centavos/m² and separately labelled actual model prose under the retained ZDR evidence, with persisted operands/result and one linked trace.                      |
| LANDING-01  | Approved; exact unchanged landing image                                 | EN/PT × 1440/390 × motion/reduced/no-WebGL, twelve completed cases; city stops, real movement/pause, fonts, demo and prefixed Privacy links.                                                                          |

The [catalog](../catalog/coverage.md), generated BDD files, append-only
[attempt ledger](attempts.jsonl) and [adjudications](adjudications.jsonl) preserve individual
expectations, timestamps, environment manifests and evidence references. The
[structural audit](audit.json) reports `countsTrusted: true`, 12 conclusive approvals and zero
integrity errors. It checks bookkeeping, not business correctness or visual fidelity by itself.

### Version groups and bounded limitations

- Fresh browser captures target the application and landing identities above. Read, search,
  validation, listing, privacy and recovery probes made no writes. The confirmation pilot is
  the campaign's sole fresh admitted run.
- Historical scheduled collection and canonical Property/Market receipts originate from
  application `b570a09427bea39ea03d4dda93c7dc0e0c502899`. The recorded Git comparison finds
  **no changes** in `apps/api`, `apps/worker`, `packages`, `migrations` or `pnpm-lock.yaml`
  through the delivered application revision. This is reusable component evidence, supplemented
  by fresh downstream UI; it is not relabelled as a final-image scheduler re-execution.
- Explained Ask was observed on the exact delivered `39236f94` images at
  21:33:05–21:33:16Z, including SQL and Tempo. It was not submitted again for the final report.
- Landing evidence uses the exact `69be18fb` image. Six completed EN checkpoints survived an
  invocation terminated by SIGTERM (143), whose origin remains unknown. Only those completed
  checkpoints were accepted; the six PT cases come from a separate successful continuation
  with exit zero. Partial interrupted PT work was excluded.
- Landing uses sandbox-enabled Chromium/SwiftShader on this shared VPS. Real rendered pixel
  changes and pause were observed; no physical-device frame-rate or throughput guarantee is
  inferred. Final representative screenshot inspection supplements the existing accepted
  artboard/accessibility checks; it is not a new comprehensive WCAG certification.

### Persisted effects and trace linkage

Baseline **22:18:02.474817Z** versus final readback **22:26:06.407948Z**:
Ask runs **+1**, events **+6**, collection runs **0**, Properties **0**, Listings **0**, raw
objects **0**. Physical table counts remain nine Properties/nine Listings; the search contract
returns five resolved search rows. Selected API, worker, AI, web and landing container IDs,
image IDs, start times and healthy states are unchanged. See
[side-effect-comparison.json](side-effect-comparison.json) and
[readback.json](../fixtures/readback.json).

The fresh confirmed run is `01a17a4b-8f7b-7986-a149-ca7038b52a10`, trace
`30b349e28bba2eb325e2d7a31b30cb66`. Independent persistence shows routing →
awaiting_confirmation → confirmed → completed, with the accepted decision bound to the
confirmation receipt; Tempo contains 25 linked spans. Its unavailable intent is presented
truthfully rather than inventing a listing-search result.

The reused explained run is `01a17a21-aa64-74bf-9a36-8dbaa3b18c05`, trace
`6ab91c62eace9c80bcf41db46838755d`. Independent arithmetic is
`78500000 / 68 → 1154412` centavos/m². The observed gateway model is
`anthropic/claude-haiku-5.5`, with 167 output tokens and retained affirmative privacy
acknowledgement under per-request ZDR enforcement. Routing is explicitly **heuristic-v1,
degraded**; this does not establish successful Jev classification. Monetary model cost is
unavailable and is not estimated.

The historical Aurora schedule run is `01a179c8-06d9-72dd-a956-124d420b3572`, with three
observed/parsed items and zero failed items. Native collector trace
`7bf7fc47424d67d830d13412c6780f69` is correlated through its isolated activation window,
counts and interval. That collector span exports no run identifier; no stronger identifier
linkage is claimed.

### Findings and executor corrections

No new functional defect or mandatory UX defect was established. Three executor findings were
resolved by targeted rechecks; original attempts and catalog assumptions remain intact:

1. LISTING-01 selected four current/historical provenance groups. Scoping the existing selector
   to current provenance resolved the ambiguity without a product change.
2. PRIVACY-01 incorrectly assumed three sources/nine permissions. The established contract
   requires **all** enabled sources: baseline `synthetic-data` plus Aurora, Brisa and Cobalto
   are four/twelve. The original assumption is preserved, and the corrected oracle compares
   the actual strict register contract with rendered permissions.
3. RECOVERY-01 used whole-context offline mode, which paused TanStack Query and affected
   unrelated bootstrap reads. That attempt did not establish the intended failed-read
   condition. The revised model aborts only browser GET `/api/v1/ask/fixtures` under the
   application prefix, then removes the abort before explicit retry. Responses are real;
   no server outage or whole-browser offline recovery is claimed.

Native 15-second waits, assertions and zero automatic retries remain unchanged. The repeated
executor-oracle class was reassessed against actual contracts rather than patched in the
product. [findings.json](../findings.json) and
[visual-review.json](visual-review.json) record the evidence and limits.

## Verification retained for the delivered code

The final stabilized application already passed root lint/context/migration checks, all eight
workspace type checks plus strict integration checking, and the serial eight-workspace build.
Recorded final web coverage: **45 files / 634 tests**, 95.79% statements, 91.31% branches,
96.92% functions and 97.17% lines. AI: **26 files / 356 tests**, 95.1% statements,
90.57% branches, 95.48% functions and 96.75% lines. Contracts: **737 tests**. Other workspace
unit and real-service integration results are reused with their unchanged dependencies and
original plans; these totals are not a new combined test-run claim.

The receipts include `/tmp/rei-success-final-lint-v2.log`,
`/tmp/rei-success-final-typecheck.log`, `/tmp/rei-success-web-coverage-final.log`,
`/tmp/rei-success-final-build.log` and the clean Impeccable detector receipt
`/tmp/rei-success-impeccable-detect.json`. The separate landing's lint, typecheck, focused
checks, sixteen-test suite and build are retained with its accepted image.

The new bounded final probe passed Prettier, ESLint and
`pnpm exec tsc -p tsconfig.integration.json --noEmit`; its final hash and unchanged deadlines
are in [executor-identity.json](../scripts/executor-identity.json). Each affected browser phase
passed after its relevant executor correction. Documentation changes do not repeat product
coverage, builds or the browser campaign. Normal commit hooks remain mandatory.

## Important existing decisions and design reconciliation

- **D-001** keeps model privacy fail-closed. **D-019 / D-069** retain synthetic-only processing
  and truthful privacy disclosures without inventing a controller or contact.
- **D-039 / D-040** establish strict TypeScript and the Vitest integration model.
  **D-051** fixes web routing/data/localization; the public prefix uses those existing mechanisms.
- **D-090**, together with the owner's later explicit manual-branch authorization, delivers
  the existing VPS prefix with dedicated PG18, protected configuration and recovery rather
  than treating production as an external pending action.
- **D-094** separates persisted search from prepared UI examples; **D-096** fixes deterministic
  Market rules and units. Prepared examples are not represented as newly collected facts.
- **D-100** fixes confirmation refusal/expiry semantics; **D-101** preserves routed commands
  and first terminal state; **D-102** versions the decision/tool/explanation chain;
  **D-103** fixes anonymous daily quotas at 20 per visitor and 100 globally by default.

Existing design/spec reconciliations preserve behavior and facts: **D-058 / D-061 / D-063**
use native expansion to retain complete evidence while matching Place/Property/Listing density;
**D-064** makes full UTC timestamps available through keyboard/touch expansion. **D-069**
implements the specified public privacy document without inventing an artboard or identity.
**D-080** reconciles presentation ownership with the independent portfolio repository. Cards
continue to open the presentation; the demo resolver preserves the application prefix and opens
an operational route; exact application roots redirect to the presentation.

These are existing recorded decisions, not new decisions taken during report preparation.
The owner's append-only decision file remains outside product Git. Routine scheduling and
executor corrections did not create new ADRs or decision entries.

## Environment additions and safe defaults

No owner edit to a secret file is needed for the installed synthetic demo. Names are listed
without secret values. Checked-in examples and configuration functions remain the reference
for validated ranges; protected host configuration supplies production credentials.

| Configuration                                                                                                                                                    | Default or requirement                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_PUBLIC_BASE`                                                                                                                                               | Development `/`; published build `/real-estate-intelligence/`, shared by assets/router and relative API paths.                                                                                    |
| `VITE_API_BASE_URL`                                                                                                                                              | Absent uses the public base; no global endpoint escaping the prefix.                                                                                                                              |
| `VITE_DEMO_URL`, `VITE_REPOSITORY_URL`                                                                                                                           | Absent/invalid becomes no link; public URLs only.                                                                                                                                                 |
| `VITE_PRIVACY_CONTROLLER_NAME`, `VITE_PRIVACY_CONTACT_EMAIL`                                                                                                     | Absent/invalid remains unset; no fabricated identity.                                                                                                                                             |
| `ASK_VISITOR_DAILY_LIMIT`, `ASK_GLOBAL_DAILY_LIMIT`                                                                                                              | 20 and 100, positive safe integers.                                                                                                                                                               |
| `ASK_DISPATCH_SECRET`, `AI_INTERNAL_TOKEN`                                                                                                                       | No credential default; execution remains disabled without configured authority. Protected, scoped runtime values are installed.                                                                   |
| `API_BASE_URL`, `AI_URL`, `AI_GATEWAY_API_KEY`                                                                                                                   | Explicit internal service origins and approved runtime gateway key for live execution; no embedded or public fallback key.                                                                        |
| `ASK_TRACER_DEADLINE_MS`                                                                                                                                         | Optional bounded override, 100–10000 ms; absence retains the existing graph deadline. No change was made to acceptance waits.                                                                     |
| `OUTBOX_RELAY_INTERVAL_MS`, `OUTBOX_RELAY_BATCH_SIZE`, `OUTBOX_CLAIM_LEASE_MS`                                                                                   | 1000 ms, 25, 130000 ms; lease validated against operation/batch bounds.                                                                                                                           |
| `WORKER_INTERVAL_MS`, `RABBITMQ_RECONNECT_INTERVAL_MS`, `WORKER_OPERATION_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`                                                     | 30000, 1000, 5000, 15000 ms.                                                                                                                                                                      |
| `EVENT_DELIVERY_LIMIT`, `EVENT_REDELIVERY_DELAY_MS`, `EVENT_HANDLER_TIMEOUT_MS`, `BROKER_DRAIN_TIMEOUT_MS`                                                       | 5 attempts; 1000, 120000, 10000 ms.                                                                                                                                                               |
| `COLLECTION_SCHEDULE_INTERVAL_MS`, `COLLECTION_SCHEDULE_BATCH_SIZE`, `COLLECTION_CONCURRENCY`, `COLLECTION_RUN_TIMEOUT_MS`                                       | 1000 ms, 10, 2, 115000 ms; production capacity can select lower validated concurrency.                                                                                                            |
| `COLLECTION_DEADLINE_MS`, `SYNTHETIC_PAGE_DELAY_MS`                                                                                                              | 30000 and 0 ms.                                                                                                                                                                                   |
| `OUTBOX_RETENTION_MS`, `INBOX_RETENTION_MS`, `DELIVERY_RETENTION_INTERVAL_MS`, `DELIVERY_RETENTION_BATCH_SIZE`                                                   | 7 days, 30 days, 300000 ms, 1000; bounded pruning.                                                                                                                                                |
| `LISTING_HISTORY_INTERVAL_MS`, `LISTING_HISTORY_BATCH_SIZE`, `LISTING_HISTORY_TIMEOUT_MS`                                                                        | 250 ms, 25, 5000 ms.                                                                                                                                                                              |
| `SNAPSHOT_RETENTION_INTERVAL_MS`, `SNAPSHOT_RETENTION_BATCH_SIZE`, `SNAPSHOT_RETENTION_CYCLE_TIMEOUT_MS`                                                         | 300000 ms, 100, 10000 ms.                                                                                                                                                                         |
| `SNAPSHOT_ENCRYPTION_KEY_ID`, `SNAPSHOT_ENCRYPTION_KEY_BASE64`                                                                                                   | Explicit paired versioned ID and 32-byte key; no invented default key. Preserve with backups.                                                                                                     |
| `OBJECT_STORE_ENDPOINT`, `OBJECT_STORE_REGION`, `OBJECT_STORE_BUCKET`, `OBJECT_STORE_ACCESS_KEY_ID`, `OBJECT_STORE_SECRET_ACCESS_KEY`                            | Explicit private application storage configuration; no source credential in evidence.                                                                                                             |
| `DATABASE_URL`, `RABBITMQ_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`                                                                               | Existing dependency/telemetry settings reused with scoped production authority; AI receives no database or storage credential.                                                                    |
| `REI_RELEASE_MODE`, `REI_RELEASE_COMMIT`, `REI_IMAGE_REPOSITORY`, `REI_MIGRATE_DIGEST`, `REI_API_DIGEST`, `REI_WORKER_DIGEST`, `REI_AI_DIGEST`, `REI_WEB_DIGEST` | Host operator defaults to registry mode; installed authorized mode is `manual` with exact revision/local image identities. No credential or registry receipt is implied by the historical suffix. |

See the existing [deployment guide](../../../../../../../docs/operations/deployment.md),
[worker configuration](../../../../../../../apps/worker/src/config.ts) and
[example names](../../../../../../../env.example). Runtime secrets never enter image build
arguments, commits, screenshots or public reports. `.env*` files were not inspected or edited.

## Pending work and reproduction

There is **no owner-only pending action required to accept or use this synthetic delivery**.
Real-source activation remains outside this goal and still requires genuine source rights,
processing/privacy prerequisites and review. Later main integration, PR/remote CI and registry
publication were not part of the owner's authorized manual publication method; none is silently
claimed. Optional V2 enhancements do not reopen the completed stories.

[Reproduction instructions](../scripts/reproduce.md) use the committed bounded probes and
preserve operation identities. Do not replay the paid explanation, reseed/schedule collection,
or restart services just to regenerate this report. Raw JSON, PNGs, traces and the append-only
ledger remain local in this campaign directory under the existing evidence-retention convention;
only Markdown delivery records and the TypeScript executor are versioned. Production recovery
receipts remain in the protected host backup paths above.
