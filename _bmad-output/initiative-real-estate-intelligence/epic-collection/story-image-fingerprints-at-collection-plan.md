---
title: 'Image fingerprints at collection'
type: 'feature'
ticket: '9'
created: '2026-10-25'
status: done
baseline_revision: '04811bcc7edbd2f091fc919eaa15d233491b9c45'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md'
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md'
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ticket 2.9 requires permitted photograph acquisition, deterministic perceptual
fingerprints in the parsed event, no stored images and shared source rate accounting. Existing
sources only fetch listing pages and supply prepared fingerprints.

**Approach:** Add the necessary transient image capability to the existing collection boundary,
reuse its per-source resilience and original-fingerprint persistence, and implement the bounded
D-089 algorithm. Evolve only affected event/read/reparse paths; preserve historical contracts.

## Boundaries & Constraints

**Always:** ADRs 0011–0015/0018–0020; inward dependencies, source permissions, cancellation,
transactional observation/outbox evidence, redaction, strict TypeScript/Vitest integration.
One heavy job at a time on the shared 8 GB/2 vCPU VPS. Owner decision D-089 is binding:

- Horizontal dHash64, `dhash64-v1:` plus 16 lowercase hex digits. Orient by EXIF, flatten alpha
  over white, grayscale, resize to 9x8 with Lanczos3; compare right > left, row order, MSB first.
  Pin Sharp 0.35.5 only in infrastructure for JPEG/PNG/WebP decoding; maximum 5 MiB compressed
  and 16 million input pixels. Bound native computation and keep processing sequential.
- Select at most the first three distinct photo URLs in source order; share the page's actual
  per-source rate/cooldown/policy state. Check current independent image permission before each
  attempt, including after policy waits. Denied means no image requests and empty fingerprints.
- Exactly one fingerprint per successfully fetched selected photo, including equal hashes.
  Any selected-photo failure fails observation preparation; no falsely complete partial evidence.
- Preserve strict v1 acquisition and v2 correction readers and historical synthetic bytes/labels.
  Use acquisition v3 when new representation or emptiness requires it, and correction v4 when
  perceptual evidence requires it. New contracts preserve equal perceptual hashes in order.
- Hamming distance 0–64 and similarity `1 - distance / 64` apply only to matching algorithm tags.
  Preserve SHA-256/prepared synthetic evidence; never claim cross-algorithm perceptual similarity.

**Never:** Persist/log photo bytes, photo URLs or decoder metadata; enable/call real sources;
read `.env*`; push, publish, deploy or change shared infrastructure. Reparse never acquires photos.
Do not alter matching weights/thresholds, removal semantics, accessibility or frontend behavior.
Do not weaken tests, timeouts, coverage, hooks or gates, or add a second source rate limiter.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                                                | Expected Output / Behavior                                                                | Error Handling                                      |
| ------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Permitted photos          | More than three references, including a repeated URL                         | First three distinct URLs requested in order; one hash each; no stored media/URLs         | Existing source policy per attempt                  |
| Denied or absent photos   | Image permission false or no references                                      | No image request; empty new acquisition evidence                                          | Listing collection remains usable                   |
| Determinism/collision     | Same photo, encoded variant, or equal perceptual results                     | Stable versioned hash; preserve multiplicity; defined Hamming result                      | Reject malformed/mixed algorithm input              |
| Source failure/revocation | Rate limit, access refusal, cancellation or permission changed during a wait | Shared rate/cooldown/hold; no unauthorized next attempt; no completed partial observation | Existing canonical failures and checkpoint handling |
| Invalid media             | Unsupported format, corrupt/oversized body or pixel count                    | Bounded failure; no stored media or partial parsed event                                  | Categorical redacted failure                        |
| Historical/reparse        | v1/v2 fixture or new original evidence                                       | Historical bytes unchanged; corrections preserve original fingerprints without HTTP       | Strict version-specific validation                  |

</intent-contract>

## Code Map

- `packages/application/src/collection/listing-source.port.ts`: current fetchPage/parse boundary;
  there is no photo capability. Keep discovery/references transient and acquisition unavailable
  to `Pick<ListingSource, 'parse'>`. Add only the capability needed by the two collection flows
  and its deterministic in-memory fake; vendor decoder types must stay in infrastructure.
- `collect-source-once.service.ts` and `collect-source-run.service.ts` in that folder: both
  sanitize real documents before store/parse and persist original fingerprints with observation,
  parsed evidence and outbox. Acquire from transient original references, then attach only computed
  fingerprints to the trusted listing. Preserve sanitization, resume/replay and refusal handling.
- `apps/worker/src/collection/resilient-listing-source.ts`: its private source-policy map is the
  sole source admission state. Extend it for photo attempts rather than creating a second wrapper
  map. Reuse `CollectionDependencyPolicies`, current registry checks, pending durable holds,
  Retry-After and whole-call deadline. Keep parsing pure.
- Worker collection command/resumable-command/regular modules and fixture router: compose the
  capability consistently. Existing owned synthetic sources/replay keep prepared evidence and
  make no new photo request. No real-source router/activation is introduced.
- New infrastructure decoder/computer and photo acquisition adapter as necessary: single attempt,
  bounded in-memory input, no disk/cache and no hidden HTTP retry or redirect bypass.
  Any HTTP adapter accepts only its explicit configured photo origins, never an arbitrary
  origin from a listing; the integration scope is synthetic and exact. Decoder pin
  is necessary because no existing package decodes actual photographs. Application ports and
  in-memory fakes justify vendor isolation, not a general media subsystem.
- `packages/domain/src/collection/collection.events.ts`: v1 currently requires nonempty unique
  fingerprints; v2 exclusively corrects existing observations. Add explicit compatible versions
  and strict dispatch without broadening v1/v2. Reuse common payload validation carefully.
- `packages/domain/src/collection/snapshot-privacy.ts` and infrastructure
  `postgres-snapshot-reparse.repository.ts::originalFingerprints`: independent SHA-256-only
  guards need the accepted perceptual representation; retain closed real-data privacy behavior.
- `migrations/4007_collection_add_snapshot_reparse.sql`: existing immutable original-fingerprint
  JSONB column is sufficient. `4008_collection_add_parsed_event_evidence.sql` checks versions
  `(1,2)`; add a new append-only collection migration, leaving old SQL untouched.
- `postgres-collection.facade.ts`: acquisition queries select version 1 and corrections version 2.
  Include the new counterparts without counting a correction as an observation.
- `packages/domain/src/properties/property.entity.ts`, `listing/normalized-listing.vo.ts`,
  `listing/listing-chronology.ts` and
  `packages/application/src/properties/reconcile-listing-history.service.ts`: current v1-specific
  parser/instanceof classifications need equivalent acquisition/correction handling. Do not change
  identity resolution or history rules beyond recognizing the new representation/version.
- `reparse-snapshot.service.ts`: consumes only parsing/read capabilities and replaces parser
  fingerprints with original verified evidence. Preserve legacy NULL versus trusted empty list,
  authenticated bytes, expiry and operation idempotency. Never reconstruct by fetching media.
- `integration/support/fixture.ts`, `snapshot-lifecycle.integration.test.ts` and
  `snapshot-reparse.integration.test.ts`: reuse owned real PostgreSQL/RabbitMQ/S3 fixtures, raw
  storage inspection and correction evidence. Nock is limited to exact synthetic image scopes.
- ADR 0015/D-047 and privacy ROP-04 already require transient processing and reserve this decision;
  amend the existing ADR/epic/records concisely under D-089, not another redundant report.

## Tasks & Acceptance

**Execution:**

- [x] Domain collection fingerprint/event files and colocated tests — implement D-089 format,
      distance/similarity and explicit compatible contracts; prove deterministic known vectors,
      empty/duplicate new evidence, malformed rejection and unchanged v1/v2 behavior.
- [x] Application collection capability/fake and both collectors/tests — honor permission,
      bounded ordered selection, failure and trusted evidence attachment without raw media escaping.
- [x] Infrastructure collection adapter/decoder, package manifest/lockfile and tests — pin the
      required decoder and prove actual image formats, deterministic normalization, bounds and
      cancellation. Reuse ordinary process lifetime rather than permanent diagnostics.
- [x] Worker source wrapper/router/composition and tests — share actual admission state between
      page/photo calls, recheck permission after waits, preserve access hold and source refusal.
- [x] Collection migration, facade/reparse/privacy paths plus necessary property consumers/tests —
      recognize new versions without rewriting historical data or misclassifying corrections.
- [x] `integration/image-fingerprints.integration.test.ts` — exercise permitted/denied acquisition
      and reparse with real local persistence/storage/broker and synthetic HTTP, inspecting exact
      requests, stored JSON/objects, original fingerprints, evidence and outbox/consumer effects.
- [x] Existing ADR 0015, collection epic, privacy records and this plan — record D-089 and actual
      evidence concisely. Resolve the ticket's settled unknown at orchestration delivery.

**Acceptance Criteria:**

- Given the isolated permitted source, when the real collection orchestration fetches photographs,
  then its parsed event and immutable observation contain one computed result per selected photo,
  source request accounting includes images, and neither S3, SQL nor outbox stores media or
  photograph URLs.
- Given an otherwise collectible source without image permission, when collection runs, then zero
  photograph requests occur and a valid parsed event contains empty fingerprint evidence.
- Given image failure, revocation or cancellation, when preparation cannot finish, then no complete
  partial parsed observation is committed and the existing hold/checkpoint/recovery rules apply.
- Given a newly fingerprinted observation, when reparse runs after acquisition buffers are gone,
  then the correction preserves original hashes and acquisition receives no request; old fixtures,
  strict v1/v2 contracts and downstream observation/correction history remain compatible.

## Implementation Notes

- D-089 is implemented through an infrastructure-only Sharp 0.35.5 decoder and a single-attempt
  explicit-origin HTTP adapter. Transient photo references live outside snapshot bytes; both
  collectors attach only the computed ordered evidence. The existing worker policy instance
  admits page and photo attempts, rechecks image permission after waits and retains durable holds.
- v3 acquisitions and v4 perceptual corrections subclass the existing semantic acquisition and
  correction classes, preserving downstream classification. Strict historical v1/v2 readers,
  prepared fixture bytes, matching weights and chronology rules remain unchanged.
- Native work is sequential per process, with cache disabled, one libvips thread, a two-second
  operation limit, 5 MiB compressed input and 16 million pixels. Invalid, aborted or unsupported
  media produces categorical failures without recording decoder payloads.

## Plan Change Log

- Owner subsequently authorized scoped production/main delivery for REI, landing and workspace
  infrastructure. This newer user instruction supersedes the historical push/deploy prohibition
  for later authorized delivery; the current image-acquisition story/campaign scope stays unchanged.
  Any subsequent deployment uses `https://leohteixeira.com/real-estate-intelligence/` and preserves
  the portfolio landing page. This implementation handoff performs no deployment.

- Added necessary Properties migration `1003_properties_accept_perceptual_collection_facts.sql`
  alongside Collection migration 4011. Inspection found the existing incoming-fact table also
  checked versions `(1,2)`, and pending acquisition/correction queries selected only those versions.
  Without this scoped update authenticated new facts would fail persistence or remain unreconciled.

## Review Triage Log

### 2026-10-25 — Review pass

- verdicts: 1 finding — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Photograph URLs escape through automatic HTTP telemetry at
    `packages/infrastructure/src/collection/http-listing-photo.ts:48`. Parent verified the
    worker's unconditional HttpInstrumentation preload and the installed outgoing attribute
    builder's `url.full` assignment. Allowed image requests can therefore export forbidden URL
    evidence. The original implementer applied OTel suppression only around acquisition and added
    a real HTTP/in-memory-export regression. Both success and failure keep photo URLs out of spans,
    while collection and ordinary HTTP traces remain linked; removing suppression fails the
    regression (five spans instead of three), restoring it passes eight focused tests.

### 2026-10-25 — Targeted follow-up review

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- Scope: only the corrected HTTP suppression, regression and affected trace context. The same
  independent reviewer confirmed both protocols enter suppression before instrumented request
  creation, callbacks inherit that context, and decoding/caller continuation occurs outside it.
  HTTP metrics omit URL/path; the actual-instrumentation test proves success and 503 exclusion
  while preserving ordinary parent linkage. No general review was reopened.
- Follow-up patched counts: high 0, medium 0, low 0; no unresolved tracing risk remains, so another
  follow-up review is not recommended.

## Design Notes

Route full: necessary cross-layer versioning and image acquisition exceed 100 lines and five files.
Risk raised to high because image permission, transient privacy and durable history are invariants.
D-089 settles the owner choices before implementation. Decoder documentation and algorithm model:
[Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/),
[Sharp resize](https://sharp.pixelplumbing.com/api-resize/),
[ImageHash horizontal dHash implementation](https://github.com/JohannesBuchner/imagehash/blob/master/imagehash/__init__.py).
No equivalence to Pillow output across decoders is claimed; this tagged pipeline is pinned and tested.

## Verification

- First run tests directly covering changed behavior, then required affected regressions.
- Run one native real-service image campaign and the affected reparse/history campaigns on final
  stabilized runtime inputs. Use existing fixtures/commands; no general audit or unrelated campaign.
- Keep lint, strict typecheck, unit tests, build, existing coverage floors, independent BMAD review
  and every applicable hook. Serialize heavy checks and image preparation. Record exact commands,
  identity and outcomes in this plan. Reuse unchanged evidence only when source and relevant
  dependency identity prove validity; a changed root lockfile alone is not proof of runtime impact.
- Do not repeat passed checks for confidence or rerun product tests after documentation-only edits.
  An environment failure receives one bounded diagnosis and a changed condition/hypothesis before
  any rerun. Preserve failed observations honestly; never claim a new full pass from partial runs.

### Execution evidence (2026-10-25, implementation candidate)

- `pnpm install --frozen-lockfile`: passed. The lockfile only adds Sharp and its closure; no
  existing lockfile lines are removed/replaced. The prior coverage-v8 → Vitest peer edge was
  preserved after initial install resolution churn. `apps/web` and `packages/contracts` importers,
  sources and dependency closure are unchanged from baseline; their prior unit/coverage evidence
  is reusable. The repository build and strict typecheck nevertheless include both workspaces.
- `pnpm run build`: passed across all eight workspaces. Existing Vite chunk-size advisory remains.
- `pnpm run typecheck`: passed across all workspaces and integration TypeScript.
- Targeted domain event/dHash, Sharp and HTTP tests: 4 files / 142 tests passed.
- Initial application collection tests exposed two obsolete real-category expectations for prepared
  fingerprints without photo references. Updated those assertions to the accepted empty evidence;
  the subsequent complete application suite passes.
- Backend unit/coverage gate: used `coverage_args` unchanged from `scripts/test-coverage.sh` with
  `pnpm -r --filter '!@rei/web' --filter '!@rei/contracts' --workspace-concurrency=1 exec vitest run
--dir src --passWithNoTests "${coverage_args[@]}"`. All 175 files / 1,988 tests passed. Coverage
  (statements/branches/functions/lines): Domain 95.45/90.62/100/96.08; Application
  92/87.35/97.95/93.61; Infrastructure 81.70/75.82/88.50/83.74; Worker
  94.05/84.52/91.33/95.24; API 94.30/85.52/97.61/95.47; AI 94.18/88.74/91.90/96.30.
  Existing floors 80/75/80/80 and exclusions were preserved.
- Initial native image campaign stopped before application execution because Docker Hub no longer
  serves the pinned `minio/minio:RELEASE.2025-09-07T16-13-09Z` and no image was cached. Official Quay
  also lacked the tag. Recovery uses the original upstream multiarchitecture manifest
  `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` from
  `public.ecr.aws/y9w4h2u9/minio`, independently recorded by
  [Red Hat advisory 7148629](https://access.redhat.com/solutions/7148629). This restores the exact
  existing release locally; Compose, product dependencies and fixture contracts are unchanged.

- After exact-image recovery, the native fixture reached PostgreSQL and failed its initial source
  insertion because a licensed source requires `licence_url`. Inspected every register CHECK and
  corrected only fixture metadata to an explicit synthetic licence URL before the targeted rerun.
- `pnpm run lint`: passed ESLint, context boundaries and migration conventions.

- Two further native fixture-boundary failures were preserved: a hydrated domain instance was
  passed to the Properties consumer's intentionally strict plain-wire reader, then a single outbox
  claim left causally later correction events pending. The successful prefix had already verified
  permitted/denied acquisition, spacing, storage privacy, corrupt-image recovery, immutable reparse
  and Properties ingestion/classification. The fixture now supplies a plain event envelope and
  uses the established snapshot-reparse campaign's causal batch-drain relay; no runtime parser,
  outbox policy or consumer was broadened. Added exact publication/audit ID-set assertions so an
  incomplete drain cannot satisfy the audit gate. Parent requested a targeted independent check
  of that relay adaptation before the next campaign execution.

- Parent independently inspected the corrected executor model against the established
  snapshot-reparse relay and actual outbox causal claim SQL, then authorized continuation.
- `pnpm exec vitest run --config vitest.integration.config.ts
integration/image-fingerprints.integration.test.ts`: passed the complete real PostgreSQL,
  RabbitMQ and MinIO campaign (1 file/1 campaign, 37.50 seconds). Proves permitted and denied
  collection, first-three-distinct ordering/multiplicity, shared request spacing, encrypted
  sanitized snapshot and SQL/outbox privacy, failed preparation with checkpoint recovery,
  immutable original hashes/idempotent reparse, v3/v4 facade and Properties persistence/query
  classification, and exact complete broker/audit publication sets including correction v4.

- MinIO recovery is local-cache evidence only. Fresh remote CI/development caches still cannot
  pull the official Compose tag from Docker Hub; the successful local campaign does not prove
  clean-cache reproducibility. Parent will address this demonstrated CI prerequisite in the
  separately authorized platform delivery before remote execution, preserving this story's scope.

- Required historical regressions: `pnpm exec vitest run --config vitest.integration.config.ts
integration/snapshot-lifecycle.integration.test.ts integration/snapshot-reparse.integration.test.ts
integration/properties-history.integration.test.ts integration/properties-history-upgrade.integration.test.ts`:
  all 4 files / 4 complete campaigns passed in 557.93 seconds. Initial Docker API/worker preparation
  consumed most of the first phase; existing invocation/timeouts remained intact, with no campaign
  restart or extra confidence runs. Fixtures and volumes were removed successfully.
- Final integration TypeScript and native-campaign ESLint checks passed. Prettier verified all
  34 implementation/plan files. Plan Markdown lint and `git diff --check` also passed after wrapping
  two existing long prose lines; no product behavior changed during this final documentation check.
- Final staged hooks and independent whole-story BMAD review belong to the parent delivery agent;
  implementation handoff does not claim those still-pending gates.

### Parent matrix audit

The parent read the complete staged unified diff against the canonical baseline. All six
matrix rows have executed passing coverage: permitted selection/order/multiplicity and durable
privacy in the native image campaign; denied/absent photographs in that campaign and transient
preparation tests; determinism/collision and malformed/mixed representations in domain/Sharp
and event tests; revocation/shared admission/holds in worker resilience and preparation tests,
with failed-observation/checkpoint recovery in the native campaign; invalid and bounded media
in HTTP/Sharp tests and the corrupt-media native recovery; historical/reparse behavior in the
native image campaign plus all four historical lifecycle/reparse/history campaigns. These
covering tests ran in the reported 142 targeted tests, 1,988 backend tests and five native
campaigns. No skipped or merely registered test is used as evidence. No additional product
verification is required for the authorization-only documentation changes.

### Privacy patch verification

The parent read the complete suppression change and real instrumentation regression. The patch
adds existing pinned OTel core/runtime and HTTP-instrumentation/test importer entries only;
existing dependency resolutions remain unchanged. The implementer ran the affected two files:
eight tests passed, with a failing negative control before restoration. First-pass patched
counts: high 1, medium 0, low 0. A targeted follow-up inspection addresses the remaining risk
that HTTP instrumentation could still export photograph URLs or suppress unrelated tracing;
no additional general review is opened.

- Parent final `pnpm run lint && pnpm run typecheck && pnpm run build`: passed after the privacy
  patch, across all eight workspaces and strict integration TypeScript. The existing Vite
  chunk-size advisory is unchanged. Final infrastructure unit/coverage reused the unmodified
  `coverage_args` from `scripts/test-coverage.sh` with the infrastructure filter: 45 files /
  465 tests passed, including the real HTTP telemetry regression. Coverage is
  81.70/75.95/88.52/83.75 (statements/branches/functions/lines), above unchanged required floors.
  Other workspace and historical integration evidence remains valid: no other runtime or
  existing dependency resolution changed in this privacy patch.

- Final stabilized campaign: `COMPOSE_PARALLEL_LIMIT=1 pnpm exec vitest run --config
vitest.integration.config.ts integration/image-fingerprints.integration.test.ts` passed
  1 file / 1 complete campaign in 37.33 seconds after the telemetry patch. Owned application
  fixtures and volumes were cleaned up. No product rerun is needed for the remaining record edits.

## Auto Run Result

Implemented bounded, permission-controlled transient photograph acquisition and deterministic
versioned perceptual evidence. Both collection flows share source admission; strict historical
contracts and acquisition-free immutable reparse are preserved. Real sources remain disabled.

Changed files, grouped by their delivered responsibility:

- Domain collection event/fingerprint/privacy files and exports: dHash64, compatible v3/v4,
  strict legacy dispatch and closed real-data representation; Property initialization accepts
  acquisition v3 and still rejects corrections.
- Application collection port, preparation and both collectors: first-three-distinct acquisition,
  independent current permission, ordered multiplicity and atomic failed preparation; reparse
  restores verified original evidence without HTTP.
- Infrastructure photo HTTP/Sharp adapters and exports: bounded single-attempt decoding and
  narrow automatic-tracing suppression. Manifest/lockfile pin Sharp and declare existing OTel
  versions without replacing prior dependency resolutions.
- Worker source/router files: photographs reuse the exact page admission state, including
  rate waits, permission revocation and durable source holds.
- Collection facade/reparse and Properties history repositories plus migrations 1003/4011:
  recognize new acquisition/correction versions through persistence and pending queries.
- Colocated domain/application/infrastructure/worker tests and the native image campaign:
  deterministic media, failures, permission, privacy, tracing and actual durable downstream effects.
- Existing ADR 0015, collection epic/tickets and privacy records: D-089 and bounded synthetic
  evidence. Existing platform epic/plan and deployment runbook: owner's newer public-prefix/main
  authorization, with actual production evidence still explicitly unobserved.

Independent Quick review: one verified high privacy finding, patched at the HTTP acquisition
boundary. No deferred or rejected findings. The targeted independent follow-up found zero issues;
its patched counts are high 0, medium 0, low 0, so no further review is recommended. The initial
high patch and its negative-control regression are recorded above; no new broad audit was opened.

Verification: all six matrix rows have executed passing tests; lint, strict typecheck, all-workspace
build, backend tests/coverage, final infrastructure tests/coverage, final native image campaign
and four historical regression campaigns pass as recorded above. Unchanged web/contracts and
unaffected post-patch workspace evidence are reused with dependency identity preserved. Final
commit hooks run on every delivery commit; their results are not replaced by these checks.

Residual operational limitation: the official MinIO tag no longer supports fresh-cache pulls.
Exact original-digest recovery establishes local evidence only; platform delivery must pin a
reproducible immutable fixture source before required remote CI. Public deployment/main/HTTPS
acceptance belongs to authorized story 1.12 and is not claimed by this image-acquisition story.

### Orchestration acceptance

The build workflow finalized as `built` with a clean product working copy. All reviewed files
are committed after the canonical baseline. The orchestrator accepts ticket 2.9 as `done`:
implementation `da5f65068e54ef4f8e4fd8337b24c36f0b38f24c`, tests
`be121ef6e0e0ee6c6eb3b4b2b3298ae432ad1ef6`, and decision/evidence records
`8e5e66de0110733957cc576ab9d3b477a3ec394c`. Separate owner authorization/runbook update:
`bfeb877f628d3149f02bfeec9f34a8c20c607972`. Every applicable staged secret, formatting,
ESLint/Markdown and Conventional Commit hook passed. Documentation line-length hook failures
were corrected before successful commits; product verification was not repeated for prose edits.
No deployment or push occurred as part of this story. Continue the existing ticket order.
