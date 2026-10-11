---
title: 'Collection contracts and a stub publisher'
type: 'feature'
ticket: '1'
created: '2026-10-10'
status: 'built'
baseline_revision: '01286ba2dbd7d4e5776ec70f8b0b3535ff31df02'
route: 'full'
route_source: 'pinned'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
  - 'specs/adrs/0015-handling-of-collected-data.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/listing-sources.md'
warnings:
  - 'oversized'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Downstream contexts cannot start against stable collection facts because no collection
events, read facade, or safe fixture producer exist. Letting each consumer invent an event shape
would fragment provenance, permissions, hashing, privacy allowlists, and version handling before a
real source is legally enabled.

**Approach:** Define three immutable version-1 collection events with strict runtime parsers in the
collection domain boundary, an application facade for source permissions, immutable run manifests,
and snapshot hashes, plus the HTTP DTO needed to name enabled-source licensing. Implement an
in-memory synthetic adapter that publishes a real-shaped parsed fixture and the run/suppression
facts through the existing `EventPublisher`; prove the wire round-trip with a test consumer.

## Boundaries & Constraints

**Always:** Use only synthetic data; keep canonical events under `@rei/domain`, facade ports under
`@rei/application`, HTTP response types under `@rei/contracts`, and adapters under
`@rei/infrastructure`. Use UUIDv7 identifiers, RFC 3339 instants, immutable JSON-safe values,
`sha256:<64 lowercase hexadecimal>` hashes, exact event names and version 1. Source permissions
for collection, image fetching, and listing-text display are independent and unknown sources are
all denied. The parsed event carries one observation's provenance, a non-empty fingerprint field,
and only the architecture allowlist. The completion event remains compact and points to a facade
run view whose observed source-listing identifiers are sorted and protected by the same manifest
hash. All public collection symbols leave through the context and package indexes.

**Never:** Register the stub in API/worker modules, add migrations, persistence, schedules,
checkpoints, collectors, RabbitMQ wiring, outbox writes, encryption, sanitization algorithms,
fingerprint computation, image downloads, normalization, suppression storage, or deployed seed
work. Never contact or enable a real source, depend on the VPS, include a natural-person name,
phone, e-mail, CPF, individual CRECI, unit/complement, image URL/binary, credentials, headers,
vendor DTOs, or an unmasked link. The fixture marker `[REDACTED]` proves already-masked content and
does not define the later sanitizer.

## I/O & Edge-Case Matrix

| Scenario          | Input / State                                     | Expected Output / Behavior                                                                                              | Error Handling                                                                             |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Fixture sequence  | Known synthetic source and live signal            | One parsed, one completed, and one suppressed event are published in deterministic order                                | Publisher rejection or abort is propagated; later events are not attempted                 |
| Wire consumer     | Events serialized then hydrated from untyped JSON | Strict parsers return immutable version-1 collection envelopes with correlated run/source/listing data                  | Unknown type/version, extra or missing field, invalid UUID/time/hash/URL/value is rejected |
| Parsed fixture    | Real-shaped synthetic listing                     | Payload contains provenance, BRL minor units, canonical attributes, masked description, and non-empty fingerprint array | Forbidden identity, address-detail, image, or unexpected fields cannot pass the parser     |
| Run lookup        | Completion event references an existing run       | Facade returns its immutable sorted observed IDs, counts, and matching manifest hash                                    | Unknown run and snapshot return `null` without disclosure                                  |
| Permission lookup | Synthetic or unknown source                       | Synthetic permissions reflect fixture policy; unknown source returns an explicit all-denied value                       | No permissive default or thrown lookup oracle                                              |
| Privacy contract  | Enabled synthetic source requested                | DTO names the source and reports `not-applicable`, `Synthetic data`, and a null licence URL                             | A licence is never fabricated for fixture data                                             |

</intent-contract>

## Code Map

- `packages/domain/src/collection/` -- branded SHA-256 hash validation, the three event classes,
  their exact payload contracts, and strict parsers for broker-hydrated unknown input; replace the
  placeholder README with a public collection index and export it from the domain root.
- `packages/application/src/collection/collection.facade.ts` -- consumer-owned source-permission,
  run-manifest, and snapshot-hash views plus the `CollectionFacade` port; export through collection
  and package indexes without provider or persistence types.
- `packages/contracts/src/collection/enabled-source.dto.ts` -- JSON-only enabled-source/licence
  response contract for the later privacy notice, including honest synthetic licence semantics.
- `packages/infrastructure/src/collection/synthetic-collection.stub.ts` -- deterministic in-memory
  facade and fixture publisher using injected `EventPublisher`, fixed identifiers/instants, and an
  abort-aware ordered publish sequence; no Nest registration.
- Tests beside each unit -- validate constructors and hashes, reject malformed wire shapes and
  forbidden fields, enforce deny-by-default facade behavior, and exercise the full serialized
  producer-to-test-consumer sequence.

## Tasks & Acceptance

**Execution:**

- [x] `packages/domain/src/collection/` and domain exports -- add the canonical hash value parser,
      three immutable event contracts/classes, and strict unknown-input parsers that enforce exact
      fields, event name/version, UUIDv7, RFC 3339, absolute HTTP(S) source URL, BRL minor units,
      numeric ranges, masked description, allowlisted location, and non-empty fingerprints.
- [x] `packages/application/src/collection/` and application exports -- define an immutable
      `CollectionFacade` whose permissions are independently boolean, whose run view exposes sorted
      observed source-listing IDs/counts/manifest hash, and whose snapshot lookup exposes its
      canonical content hash.
- [x] `packages/contracts/src/collection/` and contracts exports -- define the enabled-source DTO
      with source identity, display label, permissions, and discriminated licence status/label/URL;
      cover the synthetic `not-applicable` representation with a JSON-shape regression.
- [x] `packages/infrastructure/src/collection/` and infrastructure exports -- implement the
      deterministic synthetic facade/stub, publish the parsed/completed/suppressed fixture sequence
      through the injected port, stop on abort/failure, deny unknown sources, and return immutable
      non-aliasing views.
- [x] Domain and infrastructure acceptance tests -- serialize every published event to JSON,
      deliver it to a small test consumer, parse it at the domain boundary, and assert exactly one
      valid event of each type plus correlations, manifest/hash consistency, the complete allowlist,
      and absence of the prohibited PII/address/image keys and sentinel unmasked values.

**Acceptance Criteria:**

- Given the synthetic stub and a test consumer, when the fixture sequence is published and crossed
  through a JSON wire boundary, then the consumer receives exactly the three named version-1 events
  in order and every envelope validates against its strict canonical parser.
- Given `collection.snapshot.parsed`, when its payload is inspected, then its run, snapshot hash,
  source provenance, real-shaped canonical listing, masked description, and non-empty fingerprint
  array are present, while no forbidden personal, unit/complement, raw-image, credential, header,
  or vendor field exists.
- Given `collection.run.completed`, when a consumer queries the facade with its aggregate ID, then
  the returned immutable run has deterministic counts, sorted observed source-listing IDs, and the
  same canonical manifest hash; the parsed snapshot ID resolves to its canonical content hash.
- Given a known synthetic source and an unknown source, when permissions are queried, then image
  and text permissions are independent and the unknown source is returned as explicitly denied.
- Given the enabled-source response contract, when the synthetic source is represented for the
  privacy notice, then it is enabled and reports licence status `not-applicable`, label `Synthetic
data`, and URL `null`, without asserting a legal licence.
- Given malformed, extra-field, wrong-version, invalid-hash, invalid-URL, unmasked, forbidden-key,
  aborted, or publisher-failure inputs, when the matching boundary executes, then it fails closed,
  publishes no later event, and exposes no source or provider detail.
- Given all repository quality gates, when verification runs, then lint, typecheck, coverage, tests,
  and build pass without Compose, network, a real source, or VPS access.

## Implementation Notes

- Current repair scope (D-047): the repair tasks below are complete against current
  HEAD. All earlier checked tasks and later consumer stories already exist and must be kept.
  Follow the repository's NestJS modular-monolith skill with ADR precedence (D-012), Vitest and
  strict TypeScript; do not introduce an alternate runner, ORM, module or runtime registration.
  The parent performs final gates and auto-commit; the implementation child does not commit.

### D-047 repair tasks

- [x] In `packages/domain/src/collection/collection.events.test.ts`, add rejection cases for the
      complete XML-declared SVG base64url representation reported in review, arbitrary untyped
      tokens and invalid/uppercase/truncated SHA-256 strings. Exercise `parseCollectionEvent`
      through JSON, retaining all existing rejection cases. Add positive cases for SHA-256,
      `fixture-fingerprint:v1:synthetic-001`, `fixture:v1`, `synthetic-fingerprint`, and
      `fixture-history-fingerprint`. Verify segment length/count bounds without loosening tests.
- [x] In the same test file, add street rejections for `Rua Exemplo, apartamento AB`,
      `Rua Exemplo, apto AB`, `Rua Exemplo, bloco Azul`, `Rua Exemplo, bloco B12`,
      `Rua Exemplo, complemento: cobertura`, and `Rua Exemplo 123 fundos`. Preserve ordinary
      street names and door numbers. Add the same cases through `sanitizeSnapshotListing` in
      `packages/domain/src/collection/snapshot-privacy.test.ts` using real-shaped SHA-256 evidence.
- [x] Run the new regression tests before implementation and retain actual red evidence.
- [x] In `packages/domain/src/collection/collection.events.ts`, replace the fingerprint character
      and media-header blacklist with the two closed representations below. Preserve maximum
      array size, uniqueness and v1 nonempty/v2 intentional-empty semantics. No decoder or Node
      dependency enters the domain.

      ```ts
      /^sha256:[a-f0-9]{64}$/.test(fingerprint) ||
      /^(?:fixture|synthetic)(?:[-:][a-z0-9]{1,32}){1,8}$/.test(fingerprint)
      ```

- [x] In the same file, retain the current numeric/unit guard and reject a comma/semicolon
      followed by any existing unit/complement label independently of its value. Reject
      `fundos` following a door number without requiring punctuation. Keep word boundaries and
      positive street-name tests; do not add a sanitizer or claim arbitrary address recognition.
- [x] In `packages/application/src/properties/reconcile-listing-history.service.test.ts`, change
      only the non-namespaced positive test label `owned-fingerprint` to `fixture:owned-fingerprint`.
      In `packages/infrastructure/src/collection/postgres-snapshot-reparse.repository.test.ts`,
      change positive `trusted` input and exact expectation to `fixture:trusted`. Keep original
      history/recovery assertions; intentionally injected `invented` evidence must stay negative
      or discarded. Never change producer/dataset values, IDs, hashes or persisted history.
- [x] Run affected Domain, Application and Infrastructure Vitest suites, including synthetic
      dataset/replay, stub JSON consumer, reconciliation and reparse recovery. Report commands,
      red/green counts, files changed and any remaining risk to the parent.

Repair acceptance, additional to the unchanged intent:

- Given XML-declared SVG bytes encoded as base64url, when submitted as a fingerprint in a JSON
  collection event, then the public parser rejects them without echoing the payload.
- Given either recognized representation, when parsed and consumed, then the fingerprint remains
  byte-identical; every existing dataset event, ID and digest remains unchanged.
- Given each demonstrated unit/complement string, when parsed directly or projected through the
  snapshot boundary, then it is rejected; ordinary street names and door numbers remain accepted.

Repair implementation evidence:

- The original full-route implementation child completed the D-047 handoff. Its regression-first
  run failed with 32 failures and 136 passes before production edits; the same two suites then
  passed all 168 tests. Complete affected suites passed Domain 642, Application 219 and
  Infrastructure 427 tests. Evidence: `/tmp/rei-collection-d047-pktMDA/`.
- Production changes are confined to the two private guards in `collection.events.ts`.
  Four test files add 47 regressions and namespace two positive labels. No producer, dataset,
  migration, public event shape, runtime registration or stored evidence was changed.
- The parent read the implementation diff and confirmed root lint, strict typecheck, all 1,895
  unit tests, build and coverage passed. Domain coverage is 95.24% statements, 90.26% branches,
  100% functions and 95.90% lines; Infrastructure is 85.03%, 80.06%, 89.59% and 86.98%.
  Every workspace retains the existing coverage thresholds. Full real-service integration passed
  all 50 tests in 26 files in 1,049.43 seconds. The post-repair independent Quick review completed
  with no findings; the parent repeated all root gates successfully before finalization.
- The parent compared complete Docker inventories after the Testcontainers controller exited:
  all 13 pre-existing container IDs and all 13 volume names are unchanged, with no owned fixture
  resources remaining and no running containers. Evidence: `/tmp/rei-collection-d047-udLkii/`.
- Parent matrix evidence: events/privacy (168 tests), SHA-256 value (5), ordered JSON stub
  consumer/facade/abort/rejection (6), and enabled-source licence DTO (1) passed. All six original
  matrix rows are covered. Synthetic dataset/replay/source tests passed another 15 cases.
  An initial focused command used two nonexistent synthetic test filenames and failed empty
  discovery; the corrected command selected the actual files without skips or relaxed checks.
- Post-build dataset and replay JSON digests remain respectively
  `92b210a19b3096a2090736e3f1c6997ed83314306a4f67bb902e2835f5a67d69` and
  `2326bda45235778dbc5baa4e6e4478c1a6fb675e684812c56986bbd7054e6875`, equal to the pre-parent-build
  capture. Producer files are byte-identical to HEAD; the intent block retains its recorded digest.

- The phrase “run and snapshot hash” is resolved as a run reference/manifest plus a snapshot
  content hash; no second ambiguous “run content hash” is introduced. Both snapshot content and run
  manifest hashes share the canonical SHA-256 text representation.
- `collection.run.completed` carries counts and the manifest hash, not a potentially unbounded list;
  the facade owns the immutable observed-ID manifest used by later reconciliation.
- The parsed payload groups run/snapshot/source provenance separately from the canonical listing so
  one source observation does not duplicate provenance on every field. Per-field provenance starts
  at normalization, not in this collection fact.
- This contract deliberately seeds no runtime. Later collection stories may replace the in-memory
  adapter behind the same facade and publish the same event versions transactionally.

## Plan Change Log

### 2026-10-11 — D-047 closed representations and explicit street details

- Trigger: the Quick review independently reproduced XML-declared SVG base64url in the public
  event parser and multi-letter units/rear complements surviving street text into Properties.
- Amendment: replace unspecified opaque fingerprint acceptance with the ADR 0015 clarification's
  two closed representations; explicitly cover delimited multi-letter unit/complement labels
  and number-followed rear complements in both the public event and snapshot projection tests.
- Known-bad state avoided: adding one more image header or one more single-letter suffix leaves
  the same unspecified-format defect and cannot satisfy the no-image/no-complement contract.
- KEEP: preserve v1/v2 shapes and empty-array distinction, domain purity, all existing rejection
  tests, positive street names/numbers, every published synthetic producer/dataset byte, IDs and
  hashes, facade immutability/deny-default permissions/licence semantics, ordered stub publication,
  original reparse evidence and every later consumer. Two test-only labels gain a fixture namespace.
- Rollback scope: no uncommitted code exists to revert in this resumed pass. The original baseline
  spans many later committed stories; reverting that history would violate the owner's no-data/
  no-history-deletion limit. Re-derive only the private guards in current HEAD, keeping all positive
  implementation and the immutable intent block. Baseline remains unchanged.

## Review Triage Log

### 2026-10-11 — D-047 post-repair Quick review

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free reviewer read the baseline diff, acceptance and current
  surrounding contracts/consumers, checked both repaired boundaries and reported no findings.
  It independently ran 173 Domain event/privacy/hash, 41 Infrastructure stub/reparse/dataset/source,
  21 Application reconciliation and 1 enabled-source licence tests, all passing.
- No entry was patched, deferred or rejected in this pass. The earlier two high `bad_plan` entries
  are resolved by D-047's implementation and dual-boundary regressions, not carried as fresh findings.

### 2026-10-11 — Resumed third follow-up review pass

- verdicts: 2 findings — high 2, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[bad_plan]` XML-declared SVG base64url bypasses the media-header blacklist — parent
    independently reproduced a complete SVG through the compiled JSON event parser and decoded
    the exact original bytes. Neither earlier logged header cases nor the real snapshot SHA-only
    guard prevents this public event path. D-047 amends representation acceptance and tests; no
    media recognition, fingerprint computation or published dataset rewrite is permitted.
  - `[high]` `[bad_plan]` Multi-letter unit values and number-followed rear complements survive
    street validation — parent reproduced apto AB, bloco B12, complemento: cobertura and
    123 fundos through the public parser; reviewer also confirmed apartamento AB and bloco Azul.
    Snapshot projection calls the same boundary and Properties preserves the accepted string.
    D-047 amends delimited-label/door-number constraints and dual-surface regression tests while
    preserving street names and ordinary door numbers. Each finding is independently graded;
    both plan-level corrections are in one implementation repair, not deduplicated.

### 2026-10-10 — Review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Source URL validation accepted invalid ports and rejected valid HTTP(S)
    forms — replaced the regular expression with the runtime WHATWG parser, retained the
    HTTP(S)/no-credentials policy without adding DOM or Node dependencies, and added uppercase,
    IPv6, invalid-port, credential, and protocol regressions.
  - `[medium]` `[patch]` The masked-description boundary admitted a spaced CPF and a bare-domain
    link — expanded the fail-closed boundary patterns and added both representations to the
    rejection matrix without implementing the later sanitizer.
  - `[medium]` `[patch]` The new story plan failed its changed-file Prettier gate — formatted only
    the plan and verified every file changed by this story with the repository formatter.

### 2026-10-11 — Follow-up review pass

- verdicts: 4 findings — high 3, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Allowed feature, location, and agency text admitted contact data —
    independently reproduced email-bearing JSON hydration in all five text fields. Reused the
    existing shared masked-text invariant at each field; five regressions reject the observed
    leak without adding a sanitizer or changing the public event shape.
  - `[high]` `[patch]` Fingerprints admitted image URLs — reproduced the reviewer's URL through
    the canonical parser, plus data-URI and JPEG-like base64 strings. Restricted the existing
    opaque value boundary to identifier characters, retaining SHA-256 and prepared fixture
    tokens. No fingerprint computation or similarity algorithm was introduced.
  - `[high]` `[patch]` Street text admitted a unit despite the closed address allowlist —
    reproduced `Rua Exemplo, apartamento 123`; four regressions cover numeric unit/complement
    labels. The boundary rejects these details while three positive cases preserve ordinary
    street numbers and source street names. Snapshot projection reaches this same parser.
  - `[medium]` `[patch]` The synthetic manifest hash did not protect its observed IDs — verified
    that the canonical digest of `["SYN-SP-0001"]` differs from the repeated-2 placeholder.
    The stub now uses the existing `hashCollectionManifest` function, and the JSON test consumer
    compares the completion hash against a digest independently derived from the facade's IDs.

### 2026-10-11 — Second follow-up review pass

- verdicts: 3 findings — high 3, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Street text still admitted alphabetic units, the `ap` abbreviation,
    and a trailing `fundos` complement — independently reproduced all three through the public
    JSON parser. Extended the existing rejection guard for these demonstrated representations;
    word boundaries preserve `Rua dos Apartamentos`, and `Rua dos Fundos` remains valid.
    Snapshot projection uses this same boundary. No address extraction algorithm was added.
  - `[high]` `[patch]` Identifier characters admitted unpadded encoded image bytes as
    fingerprints — reproduced the reviewer's complete PNG and independently confirmed GIF
    base64url and SVG base64 payloads. Added bounded encoded-header rejection alongside the
    existing opaque-token guard; no fingerprint algorithm, media decoder, or public shape was
    introduced. Existing SHA-256 and prepared fingerprint acceptance remain covered.
  - `[high]` `[patch]` Parsed and suppressed source-listing identifiers admitted contact data —
    verified email, CPF, and phone values through both event parsers and checked that the existing
    snapshot identifier boundary already rejects them. Both event payloads now reuse the shared
    masked-text invariant, with regressions for each identity and both event families.

## Design Notes

Canonical hashes use `sha256:` and lowercase hex so persistence keys, equality, and contract
validation cannot disagree. A completion event carries a bounded summary and manifest hash while
the collection facade supplies the immutable observed-ID manifest. Unknown sources are represented
as an explicit deny-all permission value. The synthetic source is labelled rather than licensed:
its public DTO uses `not-applicable`, `Synthetic data`, and no URL. These choices keep legal and
privacy posture honest while allowing downstream contexts to build entirely from fixtures.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` -- passed on the D-047
  repair; all 1,895 unit tests passed across eight workspaces. Root typecheck includes strict
  integration TypeScript. The unchanged `CityScene` chunk-size warning remains non-failing.
- `pnpm run test:coverage` -- passed on the same production source; every workspace remains above
  its unchanged coverage floors (80% statements/lines/functions and 75% branches).
- `pnpm run test:integration` -- passed on the same production source; all 50 tests in 26 files
  passed against owned real services, including API E2E, upgrades and restarts. Exact before/after
  inventories preserve all 13 foreign container IDs and all 13 volumes, with no running containers.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/support
integration/source-register-cleanup.test.ts` -- repeated after integration, all 25 tests passed.
- `pnpm run typecheck:integration`, integration ESLint/Prettier and `pnpm run test:integration:list`
  -- passed after integration; discovery lists 50 tests. All 35 integration files remain TypeScript.
- `pnpm exec prettier --check packages/application/src/collection packages/contracts/src/collection
packages/domain/src/collection packages/infrastructure/src/collection packages/application/src/index.ts
packages/contracts/src/index.ts packages/domain/src/index.ts packages/infrastructure/src/index.ts
_bmad-output/initiative-real-estate-intelligence/epic-collection/story-collection-contracts-and-a-stub-publisher-plan.md`
  -- every file changed by this story passed formatting.
- `git diff --check` -- passed.
- Matrix audit -- all six rows passed in focused checks: events/privacy 168, canonical SHA-256
  value 5, stub JSON consumer/facade/abort/rejection 6, and enabled-source licence DTO 1. Synthetic
  dataset/replay/source regressions passed another 15 cases. No tests were skipped or weakened.

## Auto Run Result

### 2026-10-11 — D-047 repair verification and convergence

- **Summary:** Replaced open fingerprint tokens/header blacklists with identifiable SHA-256 and
  prepared synthetic representations. Rejected demonstrated multi-letter unit/complement labels
  after comma/semicolon and rear complements after a door number. The JSON parser and snapshot
  boundary retain normal street names/numbers, immutability, exact event versions and the v1/v2
  intentional-empty distinction. Published producers, dataset, IDs, hashes and history are unchanged.
- **Files changed:** `packages/domain/src/collection/collection.events.ts` changes two private
  guards; its test and `snapshot-privacy.test.ts` add 47 regressions. Application reconciliation
  and Infrastructure reparse tests namespace two positive test labels without changing their
  recovery assertions. ADR 0015 and the epic Notes mirror D-047; this plan records repair and evidence.
- **Review:** The fresh context-free Quick review returned no findings. This pass has zero patched
  entries (high 0, medium 0, low 0), zero deferred entries and zero rejected findings. Both previous
  high plan defects were addressed before this review by the original full-route implementation
  child. No acceptance criteria or immutable intent were changed.
- **Follow-up review recommendation:** `false` — no patches or specific unverified regression
  remain from this review. Bounded synthetic validation is not exhaustive anonymization or legal
  permission; real sources and future perceptual computation remain separate, unenabled work.
- **Verification:** Root lint, strict typecheck, all 1,895 unit tests and build passed, then passed
  again after resuming. Coverage passed in all eight workspaces against unchanged 80/75 floors.
  The complete real-service integration/API E2E suite passed all 50 tests in 26 files in
  1,049.43 seconds. The 25 support/cleanup tests, integration typecheck/lint/format and 50-test
  discovery passed again. All six intent matrix rows and 15 dataset/source/replay tests passed.
  Scoped collection/context Prettier, Markdown lint and whitespace checks passed.
- **Isolation:** The Testcontainers controller exited automatically. Exact inventory comparisons
  preserve all 13 pre-existing containers and 13 volumes; no running container or owned test
  resource remains. No default stack, environment file, VPS, source permission or deployment changed.
- **Preservation:** The intent digest remains
  `sha256:70f5930d783cc94eade82c51e69f696af302488a6f468048f011273b93925dad`;
  baseline remains `01286ba2dbd7d4e5776ec70f8b0b3535ff31df02`. No migration or historical rewrite
  was introduced. Evidence is under `/tmp/rei-collection-d047-udLkii/` and
  `/tmp/rei-collection-d047-pktMDA/`; the reviewed diff is under
  `/tmp/rei-collection-d047-review-RnMG1f/`.
- **Residual risks:** The existing `CityScene` chunk-size build warning remains. No new configuration
  variable or deferred finding was added. This workflow ends as `built`, with independent review
  converged; the initiative controller may accept the verified artifact next. No later ticket
  was started in this invocation, and VPS-dependent work remains owner-controlled.

### 2026-10-11 — Second follow-up verification

- **Summary:** Closed the three independently demonstrated event-boundary leaks: alphabetic
  unit/abbreviated apartment/rear-complement street text, encoded image payloads beginning with
  the demonstrated PNG/GIF/SVG headers, and contact-bearing source-listing identifiers. Existing
  event versions, prepared fingerprints, ordinary street names/numbers, immutable facade values,
  independent permissions, licence semantics, and the ordered synthetic fixture remain unchanged.
- **Files changed:** `collection.events.ts` extends private guards and reuses the shared text
  invariant for both identity payloads; `collection.events.test.ts` adds ten parameterized cases,
  including a positive street-name regression; this plan records each finding and verification.
  No public surface, media decoder, fingerprint computation, persistence, or runtime wiring changed.
- **Review:** Three findings, three patched entries (high 3), zero deferred and zero rejected.
  The resumed context-free Quick reviewer completed before triage. The original full-route
  implementation child was unavailable, so the main agent applied the bounded corrections.
- **Follow-up review recommendation:** `true` — this follow-up patched three high entries.
  The specific remaining unverified risk is encoded media with alternative headers/encodings
  outside the demonstrated PNG/GIF/SVG signatures, alongside the compatibility of valid opaque
  fingerprint values with these guards. A fresh independent pass must assess that boundary;
  these synthetic regressions are not an exhaustive anonymization or real-source readiness claim.
- Regression-first evidence — the 92-case event suite exited 1 with nine failures and 83 passes
  before the code correction. The first correction revealed a positive street-name regression;
  the word-boundary correction restored it without weakening any rejection test.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — exited 0 on the
  corrected source; all 1,848 unit tests across eight workspaces passed, including strict integration
  TypeScript checking. The existing web chunk-size warning remains unchanged.
- `pnpm run test:coverage` — exited 0 with all eight workspaces above unchanged coverage floors.
  Domain measured 95.16% statements, 90.19% branches, 100% functions and 95.82% lines;
  Infrastructure measured 85.07%, 80.11%, 89.59% and 87.02% respectively.
- Focused matrix checks — Domain events/hash/privacy (3 files, 126 tests), Infrastructure stub
  (1 file, 6 tests), and Contracts enabled-source DTO (1 file, 1 test) each exited 0. All six
  original matrix rows, including the three-event JSON wire consumer, remain exercised.
- `pnpm run test:integration` — exited 0 on the corrected source: all 26 files and 50 tests
  passed in 1,049.41 seconds. Real PostgreSQL, RabbitMQ, storage, HTTP, replay/restart and API E2E
  consumers were exercised. Owned resources, including the resource controller, are gone;
  the exact pre-existing inventory of 13 foreign containers and 8 labelled volumes is unchanged,
  and `docker ps` is empty.
- The collection/context-wide Prettier check, scoped Markdown lint with `--no-globs`, and
  `git diff --check` passed. An initial Markdown invocation also expanded the configured global
  glob and reported 1,377 existing generated-render errors; those unrelated artifacts were not
  edited. The original intent block retains digest
  `sha256:70f5930d783cc94eade82c51e69f696af302488a6f468048f011273b93925dad`.
- Evidence is in `/tmp/rei-collection-contracts-second-followup-WDYQ32/`. No environment file,
  real source, VPS state, source permission, or deployment was accessed or changed. No new owner
  decision, configuration variable, or deferred finding was introduced. This pass ends as `built`,
  with the named independent follow-up risk pending; no later story was started in this invocation.

### 2026-10-11 — Follow-up verification

- **Summary:** Tightened the original parsed-event privacy boundary and replaced the stub's
  placeholder manifest with the existing canonical digest. Source configuration, the three
  version-1 fixture facts, event/public facade shapes, ordered publication, immutable views,
  permissions, licence semantics, and version-2 empty-fingerprint behavior remain unchanged.
- **Files changed:** `collection.events.ts` reuses shared text validation and rejects demonstrated
  unsafe fingerprint/street values; its test file adds 16 boundary regressions;
  `synthetic-collection.stub.ts` computes the manifest digest through the existing domain helper;
  its test file independently verifies the wire/facade manifest; this plan records triage and
  verification. No API/worker registration, storage implementation, or runtime fixture was added.
- **Review:** Four findings, four patched entries (high 3, medium 1), zero deferred and zero
  rejected. There was no viable original full-route implementation child to continue, so the
  main agent applied the bounded corrections itself. No public surface or new algorithm was added.
- **Follow-up review recommendation:** `true` — this follow-up patched three high privacy entries.
  A fresh independent pass must assess whether the new opaque-token and numeric street-detail
  constraints leave further privacy representations unguarded or reject valid source values.
  Synthetic acceptance is not a claim of exhaustive anonymization or real-source readiness.
- Regression-first evidence: the event suite failed with 13 failures and 69 passes, and the stub
  suite failed its independently computed manifest digest assertion, before implementation changes.
  Both failures exited 1. The corrected suites then passed: 82 event tests and 6 stub tests.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — exited 0 on the
  corrected source. All 1,838 unit tests passed across eight workspaces, including strict
  integration TypeScript checking. The existing web chunk-size warning is unchanged.
- `pnpm run test:coverage` — exited 0 on the final source with all eight workspaces above the
  unchanged 80% statement/line/function and 75% branch floors. Domain measured 95.16% statements,
  90.17% branches, 100% functions and 95.82% lines; Infrastructure measured 85.07%, 80.11%,
  89.59% and 87.02% respectively.
- Focused matrix checks — Domain events/hash/privacy (3 files, 116 tests), Infrastructure stub
  (1 file, 6 tests), and Contracts enabled-source DTO (1 file, 1 test) each exited 0. Together
  these exercise all six original matrix rows, including the three-event JSON test consumer.
- `pnpm run test:integration` — exited 0 on the final product source: 26 files and all 50
  tests passed in 1,302.09 seconds. This adds real-service regression evidence for the shared
  parser's downstream consumers without changing the story's fixture-only runtime scope.
  Every owned Compose resource was removed. The exact pre-existing inventory of 13 foreign
  containers and 8 foreign labelled volumes was preserved, and `docker ps` is empty.
- The original collection/context-wide Prettier command, the scoped plan Markdown lint, and
  `git diff --check` passed. The `<intent-contract>` block is byte-identical to its pre-pass
  version (`sha256:70f5930d783cc94eade82c51e69f696af302488a6f468048f011273b93925dad`).
- Evidence for this pass is in `/tmp/rei-collection-contracts-followup-vMd8N3/`; no real-source
  configuration, permission, deployment, VPS state, or environment file was changed.
- **Residual risks:** The named follow-up boundary risk remains pending independent review, and
  the existing `CityScene` build warning remains. No finding was deferred. This pass ends as
  `built`, not `done`; no later story was started in this invocation.

### 2026-10-10 — Initial build result

- **Summary:** Added immutable version-1 collection events with strict wire parsers, canonical
  SHA-256 hashes, the collection read facade, the enabled-source privacy DTO, and an isolated
  synthetic stub that publishes the parsed/completed/suppressed sequence without runtime or VPS
  wiring.
- **Files changed:** `packages/domain/src/collection/` owns hashes, events, runtime validation and
  their tests; `packages/application/src/collection/` owns the facade views and port;
  `packages/contracts/src/collection/` owns the JSON-only source/licence DTO;
  `packages/infrastructure/src/collection/` owns the deterministic synthetic adapter and consumer
  acceptance tests; the four package indexes expose their context APIs; this plan records the
  decisions, review, and evidence.
- **Review:** Three medium findings were patched: standards-based URL validation, broader
  fail-closed CPF/link detection, and plan formatting. Nothing was deferred and no finding was
  rejected.
- **Follow-up review recommendation:** `true` — three medium entries were patched on the first
  pass. The specific remaining unverified risk is that privacy-boundary pattern matching may have
  additional real-world textual representations beyond the synthetic regression corpus; the
  future sanitizer and real-source evaluation remain intentionally unavailable.
- **Verification:** Lint, context boundaries, migration conventions, typecheck, coverage, all 361
  tests, build, changed-file Prettier, diff checks, and the complete edge-case matrix passed without
  Compose, network, real-source access, or the VPS.
- **Residual risks:** Repository-wide `pnpm run format:check` still reports 36 pre-existing BMad
  render/plan files outside this story; all files added or modified by this story pass. The web
  build retains its pre-existing `CityScene` chunk-size warning. Real collectors, sanitization,
  fingerprint calculation, persistence, deployment, and legal source enablement remain owned by
  later stories.
