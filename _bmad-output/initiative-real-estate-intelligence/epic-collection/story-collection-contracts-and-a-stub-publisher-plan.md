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
review_loop_iteration: 0
followup_review_recommended: true
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

## Review Triage Log

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

## Design Notes

Canonical hashes use `sha256:` and lowercase hex so persistence keys, equality, and contract
validation cannot disagree. A completion event carries a bounded summary and manifest hash while
the collection facade supplies the immutable observed-ID manifest. Unknown sources are represented
as an explicit deny-all permission value. The synthetic source is labelled rather than licensed:
its public DTO uses `not-applicable`, `Synthetic data`, and no URL. These choices keep legal and
privacy posture honest while allowing downstream contexts to build entirely from fixtures.

## Verification

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test:coverage && pnpm run build` -- passed after
  review repairs; 361 tests ran under coverage and every workspace remained above its threshold.
- `pnpm exec prettier --check packages/application/src/collection packages/contracts/src/collection
packages/domain/src/collection packages/infrastructure/src/collection packages/application/src/index.ts
packages/contracts/src/index.ts packages/domain/src/index.ts packages/infrastructure/src/index.ts
_bmad-output/initiative-real-estate-intelligence/epic-collection/story-collection-contracts-and-a-stub-publisher-plan.md`
  -- every file changed by this story passed formatting.
- `git diff --check` -- passed.
- Matrix audit -- all six rows ran under coverage: ordered publication/abort/rejection, JSON wire
  hydration and strict invalid-shape handling, parsed allowlist/PII rejection, run/hash lookup,
  permission denial, and the enabled-source licence DTO.

## Auto Run Result

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
