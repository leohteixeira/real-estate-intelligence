---
title: 'Synthetic São Paulo dataset'
type: 'feature'
ticket: '3'
created: '2026-10-10'
status: 'built'
baseline_revision: '227df0981d170d88ae1cd5551901dc18ded34f60'
route: 'full'
route_source: 'pinned'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 2
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
  - 'specs/adrs/0012-domain-events-and-transactional-outbox.md'
  - 'specs/adrs/0013-anti-corruption-layer-and-resilience-for-external-systems.md'
  - 'specs/adrs/0015-handling-of-collected-data.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/listing-sources.md'
  - '_bmad-output/initiative-real-estate-intelligence/epic-collection/story-collection-contracts-and-a-stub-publisher-plan.md'
  - '_bmad-output/initiative-real-estate-intelligence/epic-collection/story-synthetic-source-collected-end-to-end-plan.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The executable synthetic source proves one listing and one run, but later properties,
locations, market, and calibration stories need a shared, labelled São Paulo scenario with known
cross-portal property identity and enough dated observations to reconstruct change, disappearance,
and reappearance. Ad hoc fixtures in each consumer would drift on listing identity, place, history,
and expected matches and could make deterministic rules appear correct against incompatible data.

**Approach:** Add a fixture-only São Paulo catalogue in the collection boundary, a public
ground-truth match-label fixture, and a pure replay builder that projects fixed observations into
the existing version-1 `collection.snapshot.parsed` and `collection.run.completed` contracts. Use
three fictional synthetic portals, five zoned neighborhoods, five properties and nine stable
listing identities over thirteen fixed monthly dataset cycles from 2025-10-01 through 2026-10-01.
Project each cycle into three source-scoped collection runs, for 39 completions in total. One
property has exactly three listings. Every identifier, byte payload, hash, timestamp, ordering
decision, and prepared fingerprint is fixture-owned and deterministic.

## Boundaries & Constraints

**Always:** Keep this story entirely local and synthetic. Use fictional lower-kebab portal source
identifiers and `.invalid` URLs, fixed RFC 3339 UTC instants, BRL minor units, the closed collected
listing allowlist, and the existing strict event parsers. Keep a stable listing identity as the pair
of source identifier and source-listing identifier. Define five real São Paulo neighborhood names
with an explicit synthetic fixture mapping to the zones Centro, Norte, Sul, Leste, and Oeste, while
leaving the parsed event's established location shape unchanged. Sort monthly cycles
chronologically. Within every cycle, project sources in the declared catalogue order Aurora,
Brisa, then Cobalto; for each source emit its observations sorted by source-listing identifier and
then its source-scoped completion. Each parsed event must carry the same registered source ID and
run ID as its correlated completion. Derive raw bytes, SHA-256 content hashes, source-scoped
manifest hashes, UUIDv7 identifiers, event times, and match-label ordering only from fixed fixture
inputs. Preserve the Story 2.1 stub and Story 2.2 one-shot command behavior and public constants.

Represent a market removal by omission of a stable listing identity from that portal's completed
source-run manifest; represent reappearance by that same identity returning in a later source-run
manifest. Keep legal suppression out of this scenario. Every listing observation carries at least
one prepared fingerprint string, but the strings are opaque fixture equality markers only. The
exported match-label fixture contains both positive and negative unordered listing pairs and is
available from the collection public index so later properties tests do not infer ground truth
from listing attributes.

**Never:** Contact, name as a collected source, scrape, or simulate authorization from a real
portal. Never use network I/O, PostgreSQL, MinIO, RabbitMQ, Compose, a deployed process, production
seed data, an ignored environment file, or the VPS. Do not change migrations, Nest modules,
commands, schedules, checkpoints, source-register persistence, or the one-document `ListingSource`
port. Do not add `zone` to `CollectedListingLocation`; Story 3.3 owns location normalization and its
seed. Do not emit `collection.listing.suppressed` for an ordinary disappearance. Do not include a
person's name, phone, e-mail, CPF, individual CRECI, unit/complement, image URL, image bytes, or a
real portal brand. Do not choose, emulate, or constrain Story 2.9's perceptual fingerprint
algorithm, similarity measure, encoding, or number of photographs.

## I/O & Edge-Case Matrix

| Scenario                | Input / State                                                          | Expected Output / Behavior                                                                                                                       | Failure Evidence                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Fixture catalogue       | The checked-in dataset is loaded                                       | Exactly three fictional portals, five properties, nine stable listings, and five neighborhoods covering the five named zones are present         | Consistency tests fail on a duplicate key, missing reference, empty catalogue, or uncovered neighborhood             |
| Three-listing property  | Match ground truth is inspected                                        | Exactly one property label owns exactly three listings, one from each fictional portal                                                           | Tests fail if another group has three listings or the three identities do not span all portals                       |
| Match labels            | Every unordered pair of the nine listing identities is inspected       | Every pair appears once in canonical order with an explicit `sameProperty` boolean; positive and negative labels both exist                      | Tests fail on a missing, reversed, duplicate, self, unknown, or contradictory pair                                   |
| Dated history           | Dataset cycles are ordered by their fixed observation instant          | Thirteen monthly cycles span 2025-10-01 through 2026-10-01 inclusively, which is at least twelve months                                          | Tests fail on a non-UTC, duplicate, non-monotonic, missing-month, or shorter sequence                                |
| Content changes         | Consecutive observations of stable identities are compared             | The fixture includes more than one dated asking-price change and more than one dated masked-description change without changing listing identity | Tests fail if the before/after values or dates cannot be identified deterministically                                |
| Removal                 | A listing is present and then omitted from its source's later manifest | No parsed event exists for it in that source run; its completion counts and manifest contain only that source's observed identities              | A suppression event, cross-source identity, or absent identity in the source manifest fails the test                 |
| Reappearance            | The omitted stable identity returns in a subsequent source run         | A new parsed observation uses the same source/listing identity after at least one absent source run and the source manifest changes accordingly  | A replacement identity, unchanged manifest, missing gap, or out-of-order return fails the history test               |
| Prepared fingerprints   | Parsed fixture listings are inspected                                  | Every listing has non-empty opaque markers; known overlap is fixed data and no photograph or algorithm metadata exists                           | Empty, malformed, image-bearing, or algorithm-specific fixture fields fail the privacy/shape audit                   |
| Full replay             | The replay builder runs from the immutable fixture                     | Each of 13 cycles emits Aurora, Brisa, then Cobalto source runs; each has sorted parsed events and one correlated completion, for 39 completions | An unregistered source, cross-source manifest, correlation mismatch, parser rejection, or bad order fails locally    |
| Repeat replay           | Two complete replays run in one process                                | Their full event arrays are deeply equal after hydration and their full UTF-8 JSON serializations are byte-identical without aliasing            | Any clock, randomness, locale, mutable singleton, completion omission, or object-key-order dependency fails the test |
| Existing synthetic path | Story 2.1 and 2.2 tests run unchanged                                  | The original one-listing stub, one-shot command, and Compose-facing source contract remain compatible                                            | Any changed existing identifier, byte fixture, event count, or public export is a regression                         |

## Frozen Acceptance Criteria

- Given the fixture catalogue, when its sources, listings, properties, and places are audited, then
  it contains exactly three explicitly fictional synthetic portals, five properties, nine stable
  listing identities, and Bela Vista, Santana, Vila Mariana, Tatuapé, and Pinheiros mapped once to
  Centro, Norte, Sul, Leste, and Oeste respectively.
- Given the exported match-label fixture, when later properties tests enumerate the nine listing
  identities, then every unordered pair has exactly one explicit positive or negative label, every
  reference exists in the dataset, and exactly one property group contains three listings spanning
  all three portals.
- Given the dataset cycle sequence, when its dates are compared, then thirteen strictly increasing
  fixed UTC cycles cover every month from 2025-10-01 through 2026-10-01 inclusively and no value
  depends on the current clock, locale, time zone, randomness, or insertion order of a set or map.
- Given the observation history, when stable listing identities are compared across runs, then it
  proves multiple asking-price changes, multiple masked-description changes, at least one absence,
  and the later reappearance of the same source/listing identity; an ordinary absence emits no
  suppression fact.
- Given any emitted `collection.snapshot.parsed`, when it crosses a JSON wire boundary and is
  hydrated by the existing strict parser, then it retains valid provenance and the complete closed
  listing shape, contains BRL values and non-empty prepared fingerprint markers, and contains no
  personal data, unit/complement, photograph, real portal identity, or unexpected field.
- Given each replayed monthly cycle, when its event subsequences are inspected, then it projects
  Aurora, Brisa, and Cobalto in that declared catalogue order into three source-scoped runs and 39
  total `collection.run.completed` events across the fixture. Each source run contains only its
  sorted parsed events before its completion; every correlated parsed event shares the completion's
  registered source ID and run ID; counts equal that source's observations; and the manifest hash
  is the SHA-256 of the same sorted source-listing identities used by Story 2.2.
- Given the Cobalto history, when its source-scoped completion manifests are inspected, then
  `COB-VM-001` is absent from the April and May 2026 manifests and reappears under the same stable
  identity in the June 2026 manifest.
- Given two independent complete replays, when their full event arrays are compared both as
  hydrated domain objects and as UTF-8 JSON bytes, then the arrays are deeply equal and
  byte-identical, all parsed and completion identifiers/hashes/timestamps match, and the two
  returned arrays do not share mutable state.
- Given the full local quality gates, when verification runs, then fixture consistency, domain
  parsing, privacy, deterministic replay, existing Story 2.1/2.2 regressions, lint, typecheck,
  coverage, and build pass without Compose, external services, network access, a real source, or
  the VPS.

</intent-contract>

## Code Map

- `packages/domain/src/collection/synthetic-sao-paulo.match-labels.ts` -- immutable, data-only
  listing references and exhaustive unordered pair labels; this is the stable fixture future
  `properties` tests consume through the collection context's public index.
- `packages/domain/src/collection/synthetic-sao-paulo.match-labels.test.ts` -- label schema,
  canonical ordering, positive/negative coverage, uniqueness, and exactly-three-listing group
  evidence without importing infrastructure into the domain package.
- `packages/domain/src/collection/index.ts` -- export the fixture types and ground truth from the
  existing context boundary; keep production event contracts unchanged.
- `packages/infrastructure/src/collection/synthetic-sao-paulo.dataset.ts` -- fictional portal and
  neighborhood/zone catalogues, property/listing definitions, thirteen immutable monthly dataset
  cycles, and fixed history deltas expressed only in the existing collected-listing shape.
- `packages/infrastructure/src/collection/synthetic-sao-paulo.replay.ts` -- pure fixture projection:
  canonical observation bytes, SHA-256 hashes, timestamp-derived deterministic UUIDv7 values,
  deterministic Aurora/Brisa/Cobalto source-run order, source-scoped sorted manifests, and
  version-1 parsed/completed domain events; no publisher, port, storage, or process wiring.
- `packages/infrastructure/src/collection/synthetic-sao-paulo.dataset.test.ts` -- cross-file
  referential integrity, zoned-place coverage, history/removal/reappearance proofs, privacy audit,
  strict wire hydration, manifest/count checks, and two-replay byte/deep identity.
- `packages/infrastructure/src/collection/index.ts` -- export only the immutable dataset view and
  pure replay entry point through the collection boundary, leaving the existing synthetic stub and
  one-shot source exports intact.

## Tasks & Acceptance

**Execution:**

- [x] Add the failing domain fixture tests first. Pin nine canonical listing references; require
      exhaustive lexicographically ordered pair labels, both expected outcomes, referential
      uniqueness, and one three-listing property across the three fictional source identifiers.
      Run `pnpm --filter @rei/domain test` and confirm the new fixture export is the only expected
      failure before implementation.
- [x] Implement the immutable match-label fixture and collection-index exports. Keep its shape
      limited to source/listing references, property labels, and the `sameProperty` ground truth;
      do not include scoring inputs, probabilities, weights, thresholds, or expected match reasons.
      Re-run the domain package tests to green.
- [x] Add failing infrastructure consistency tests for the fixed catalogue and thirteen-cycle
      scenario. Assert exact portal/property/listing/place counts, the explicit neighborhood-zone
      map, full label-to-dataset references, strictly monthly UTC dates spanning twelve months,
      stable identities, multiple price/description deltas, and an observable present/absent/
      present sequence. Assert that no real portal name, personal datum, image field, algorithm
      name, unit, or complement occurs anywhere in the serialized fixture.
- [x] Implement the immutable dataset definitions with five properties and nine listings. Use one
      three-listing group, two two-listing groups, and two singleton groups so positive and negative
      calibration labels are both meaningful. Give near-neighbor negative examples overlapping in
      some ordinary attributes so ground truth is not trivially equivalent to neighborhood, area,
      bedroom count, description wording, or one fingerprint marker.
- [x] Add failing replay tests that wire-serialize and strictly parse every event. Require fixed
      chronological cycle order and Aurora/Brisa/Cobalto run order within each cycle, one completion
      after each source's sorted parsed events, 39 total completions, registered completion sources,
      correlated source/run IDs, observed/parsed counts equal to that source's observations, zero
      suppressed/failed counts, and the documented source-scoped sorted-identity manifest hash.
      Prove unchanged listing content reuses the same content hash while changed price or
      description changes it, and prove Cobalto's absence/reappearance in its manifests.
- [x] Implement the pure replay builder. Canonicalize listing JSON with one declared key order,
      hash its exact UTF-8 bytes, and derive UUIDv7 values from the fixed event instant plus a
      SHA-256 digest of dataset version, artifact kind, cycle key, source ID, and listing key as
      applicable; explicitly set the UUID version and variant bits. Construct only
      `CollectionSnapshotParsed` and `CollectionRunCompleted`, allowing their existing constructors
      to deep-clone, validate, and freeze payloads. Compute each source-run manifest from only that
      source's sorted source-listing identifiers with the algorithm already documented by
      `CollectSourceOnce`.
- [x] Complete deterministic replay tests by invoking the builder twice, comparing the full
      `JSON.stringify` UTF-8 buffers byte for byte, hydrating both full arrays with
      `parseCollectionEvent`, comparing them deeply, and proving the returned arrays and event
      payloads cannot be mutated or aliased. Include an explicit assertion that no
      `collection.listing.suppressed` event is emitted for fixture disappearance.
- [x] Export the dataset and replay entry point from the infrastructure collection index. Run all
      pre-existing domain, application, infrastructure, and worker collection tests unchanged to
      prove the Story 2.1 stub, Story 2.2 source bytes/constants, one-shot use case, command, and
      integration-facing contract did not move.
- [x] Run the repository quality gates and inspect the final diff. Confirm only the collection
      fixture/replay files, their public indexes/tests, and this plan changed; no ignored
      environment file, migration, application, Nest wiring, integration campaign, Compose file,
      real-source material, deployment artifact, or VPS-dependent step entered the story.

## Implementation Notes

- The fixture has three portal-like sources, not three authorized real portals. Suggested stable
  identifiers are `synthetic-portal-aurora`, `synthetic-portal-brisa`, and
  `synthetic-portal-cobalto`; their display labels must say `Synthetic data` and their URLs must use
  distinct `.invalid` hosts. Real candidates in `listing-sources.md` remain disabled and unnamed in
  fixture provenance.
- The neighborhood-zone catalogue is sidecar fixture metadata. Parsed events continue to carry
  `city`, `stateCode`, `neighborhood`, and `street` only. Story 3.3 may consume the catalogue to
  seed or test `locations`, but this story does not establish a production place identifier or
  alter the collection event version.
- A completed source-run manifest is the authoritative evidence of observation for exactly one
  registered portal. If a previously observed identity is absent from that portal's manifest,
  Story 3.5 can derive `ListingRemoved`; if the same identity later returns to that portal's
  manifest, it can derive `ListingReappeared`. `collection.listing.suppressed` remains exclusively
  the CAP-28 removal-request fact and is deliberately absent here.
- Match labels are exhaustive pairwise ground truth rather than inferred groups at test time. The
  file includes positive and negative examples, but no expected score or evidence. Story 3.6 owns
  matching reasons and Story 3.7 owns weight calibration; their fixed 0.90/0.50 thresholds are not
  encoded into this fixture.
- Prepared fingerprint values are opaque, stable strings such as
  `fixture-fingerprint:property-bv-001:shared-01`. Shared strings may prove known overlap and
  disjoint strings may prove its absence, but their syntax has no production meaning. Story 2.9 is
  free to choose a perceptual algorithm, output representation, comparison measure, and photograph
  count without migrating this story's contract.
- The full scenario is a pure replay fixture rather than an expansion of `CollectSourceOnce`.
  Story 2.2 intentionally owns a one-document port/use case; Story 2.5 owns multi-observation,
  idempotent, resumable runs. Keeping this story out of those runtime seams prevents a data-fixture
  change from pre-implementing checkpoints or persistence.
- The source order within every monthly cycle is the declared dataset catalogue order:
  `synthetic-portal-aurora`, `synthetic-portal-brisa`, then `synthetic-portal-cobalto`. Each source
  gets a distinct deterministic run ID and completion. No dataset-level source ID exists because
  version-1 `collection.run.completed` is source-scoped.
- Deterministic UUIDv7 generation is fixture-local. The first 48 bits encode the fixed artifact
  instant, the remaining bits come from a namespaced SHA-256 digest, and the version/variant bits
  are forced to UUIDv7/RFC 4122. It is not a general identifier service and never replaces the
  persistence-owned UUID generator.

## Verification

**Commands:**

- `pnpm --filter @rei/domain test`, `pnpm --filter @rei/infrastructure test`,
  `pnpm --filter @rei/application test`, and `pnpm --filter @rei/worker test` -- passed with 137,
  121, 20, and 81 tests respectively. The mandatory follow-up reviewer also reran the focused 3
  match-label and 7 dataset/replay tests successfully.
- `pnpm run lint && pnpm run typecheck && pnpm run test:coverage && pnpm run build` -- passed
  independently after the review repair. Coverage executed 413 tests across all eight workspace
  projects (9 + 14 + 9 + 137 + 20 + 121 + 22 + 81), and every package remained above its configured
  thresholds. The existing web `CityScene` chunk-size warning remains informational.
- `pnpm exec prettier --check packages/domain/src/collection packages/infrastructure/src/collection
_bmad-output/initiative-real-estate-intelligence/epic-collection/story-synthetic-sao-paulo-dataset-plan.md`
  and `git diff --check` -- passed; every changed file is formatted and whitespace-clean.
- Diff and test audit -- confirmed that two complete local replay arrays have byte-identical UTF-8
  JSON and deeply equal fully hydrated parsed/completion sequences; all 39 source-scoped completion
  manifests match only their source's sorted observations; no command starts Compose, opens a
  socket, reads an ignored environment file, accesses a real source, or depends on the VPS.

## Review Triage Log

### Pass 1 — 2026-10-10

| #   | Severity | Classification | Decision | Resolution                                                                                                                                                                                                                   |
| --- | -------- | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | `bad_plan`     | Accepted | Replaced each pooled cross-source monthly completion with three registered source-scoped runs and completions, preserving thirteen monthly dataset cycles and producing 39 completions.                                      |
| 2   | Medium   | `bad_plan`     | Accepted | Correlated each parsed event to its source run ID, limited each manifest to that portal's sorted source-listing IDs, removed the dataset-level source ID, and added explicit Cobalto absence/reappearance manifest evidence. |
| 3   | Low      | `patch`        | Accepted | Expanded deterministic replay comparison and strict hydration from parsed-only subsets to both complete replay arrays, including every completion event.                                                                     |

The accepted high-severity finding requires another quick review, so
`followup_review_recommended` remained `true` until the follow-up review completed.

### Pass 2 — 2026-10-10

- Verdict: no actionable findings.
- Evidence: the context-free reviewer confirmed 39 distinct source-scoped runs, registered source
  IDs, parsed/completion source and run correlation, per-source Story 2.2 manifest semantics,
  Cobalto's stable-identity absence/reappearance, deterministic full-array replay, consistent
  ground-truth labels, and no privacy or real-source leakage.
- Focused verification: 3 domain match-label tests and 7 infrastructure dataset/replay tests passed.

## Plan Change Log

| Date       | Review pass | Change                                                                                                                                                                                                                                                                                              |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-10 | 1           | Revised the frozen acceptance criteria, matrix, tasks, design notes, and verification from thirteen pooled cross-source runs to thirteen monthly dataset cycles projected into 39 source-scoped runs; recorded full-array determinism evidence and removed the unregistered dataset source concept. |

## Auto Run Result

- **Summary:** Added a labelled, immutable São Paulo fixture with three fictional portals, five
  properties, nine stable listing identities, exhaustive ground truth for all 36 unordered pairs,
  thirteen monthly cycles, and a pure deterministic replay into existing collection v1 events.
- **Files changed:** Domain collection exports own the data-only match labels; infrastructure
  collection files own the fictional catalogue, history and replay projection; focused tests own
  referential, privacy, history, hashing, source-scope and determinism evidence; this plan records
  the frozen contract and both review passes.
- **Review:** The first pass found one high and one medium planning defect in the pooled completion
  model plus one low test gap. All were accepted and repaired by projecting every monthly cycle
  into Aurora, Brisa and Cobalto source runs and by comparing complete replay arrays. The mandatory
  context-free second pass found no actionable issues.
- **Follow-up review recommendation:** `false` — the required follow-up review is complete and clean.
- **Verification:** Formatting, lint and architecture checks, typecheck, coverage for all 413 tests,
  build and whitespace checks passed. Focused follow-up verification also passed. No network,
  Compose, database, ignored environment file, real source or VPS was used.
- **Residual risks:** Prepared fingerprints are deliberately opaque equality fixtures and do not
  validate the future perceptual algorithm. The replay is fixture-only and does not pre-implement
  scheduling, persistence, checkpoints, normalization, matching or production source authorization;
  those remain owned by their later stories.
