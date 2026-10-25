# Properties and locations API reference

The seven read endpoints below are a versioned, synthetic contract surface. Property and listing
detail query persisted owned-synthetic listing history and current identity groups first, then use
prepared fallback for existing fixture IDs. Place navigation reads a persisted synthetic reference;
property search and counts remain prepared; largest reductions query persisted property-minimum
effects. No read starts collection, publishes events, resolves entities or calculates market figures.
The prepared fixture
is the unchanged collection replay: five prepared properties, nine listing identities and thirteen
monthly observations from October 2025 through October 2026. Supplementary permission, expiry and missing-value
examples are separate from that population.

Prepared property reads and persisted place navigation have this `metadata` object:

```json
{
  "dataMode": "synthetic-stub",
  "fixtureVersion": "synthetic-sao-paulo-v1",
  "asOf": "2026-10-01T12:00:00.000Z"
}
```

Persisted history keeps `dataMode: "synthetic-stub"`, uses
`fixtureVersion: "persisted-synthetic-history-v1"`, and anchors `asOf` to its latest original
acquisition or market event: the maximum retained effective date, not the final publication's
date. Legacy rows without authenticated completion history retain the
`persisted-initial-synthetic-v1` view. Reconciled current groups use
`persisted-synthetic-resolution-v1`, retaining the maximum original member `asOf`. Original
one-listing Property/Listing identities remain immutable; current membership is separate.

## Persisted listing history

The worker's durable `properties.parsed-listing` subscription consumes strict parsed v1/v2 events.
Collection verifies the complete canonical publication, original provenance and current synthetic
collection authority within the transaction; missing legacy publication evidence is not fabricated.
Receipts commit inbox, immutable fact and durable source work together. A new identity waits for
an authenticated complete source-run boundary before creating its immutable Property, distinct
Listing ID and revision-1 `properties.listing.created` event. A separate bounded worker job
reconciles sources by `(startedAt, runId)` and originals by `(observedAt, snapshotId)`; earlier
running or paused source runs block later completions. Completion can recover a missing original
delivery through Collection's facade. Retained completion publication evidence and its full
observed manifest are independent of outbox retention; missing legacy authority is never invented.

Every original snapshot is one acquisition, even when unchanged. Price and masked-description
effects compare the previous original in canonical run/fact order. Observation dates may invert
across overlapping runs: every valid original still counts, and each authentic change retains
its publication revision and effective date. The separately sorted `(observedAt, snapshotId)`
series selects dated values, current provenance and resolved geography, so an older observation
cannot replace newer current values. This also applies to a new identity whose second canonical
observation predates creation; it emits ordinary changes rather than legacy-only backfill.
Price and masked-description
changes emit immutable events in that order, with consecutive per-listing revisions. Only a valid
complete manifest's absence removes a listing, effective at completion time. Its provenance and
original values come from the latest authenticated original `(observedAt, snapshotId)` at or before
that completion, independently of the canonical comparison frontier and corrections. If no original
has yet been observed at completion, that manifest advances without an absence event or rejection;
later retained evidence remains available. Seen failed or
suppressed identities are not absence. Return keeps both IDs and emits reappearance before price
and description changes, effective at acquisition time. Lifelines close at removal and reopen on
return. Durable state retains each canonical activity period with its authentic opening and closing.
Removal closes only the corresponding open period at its exact completion. Active exposure is the
derived temporal union of non-negative periods, merging overlapping or touching
intervals so time on market counts each active day once. An earlier run may complete after a
later run observed its return: removal and reappearance retain those authentic dates and
consecutive revisions even when the effective dates decrease in publication order.
An open union never replaces closed constituent boundaries: Created(1), Removed(4), Reappeared(6),
Removed(7), Reappeared(3), Removed(5) derives intervals [1,5] and [6,7], retaining five exposure days
and the genuine gap. Empty or inverted periods add no invented exposure.
Time on market excludes removed intervals. Removed properties have no active asking
price, no sale and no fabricated zero price.

Corrections are separate dated values: highest authenticated per-snapshot correction order wins,
without adding an acquisition, revision or market event. A historical correction cannot replace a
newer original acquisition's current values. Original facts, provenance, history and published
events stay immutable. Listing effects, current/history state and outbox commit atomically; source
progress commits separately, and semantic run/snapshot effects survive replay, inbox expiry and
restart. Permanently invalid normalized/address facts reject the listing transaction and record a
rejected run effect, allowing other identities and later source runs to proceed. Collection
authority failures remain fail-closed and retryable after authority restoration.

A Collection-authenticated correction can still be invalid for Properties, for example if its
address does not resolve to the owned reference geography. That correction alone receives a
durable rejection; the valid original acquisition and previous valid corrected view remain.
A later valid higher-order correction can recover the view. Infrastructure and cancellation
failures remain retryable and are never recorded as a business rejection.

On upgrade, authenticated pending original facts for existing identities are reconciled even
when their legacy run has no retained completion publication. This restores acquisition counts
and original price/description effects without recreating the initial Property or creation event.
Legacy parsed authority cannot authorize removal or materialize a new identity. Both one-shot
and resumable collection register their running chronology before external I/O, so a later
completed run remains fenced while an earlier fetch is still in progress.

Both registration paths and canonical selection share a Collection-owned per-source transaction
guard. A new start time and run ID are captured after admission; the running boundary commits
before fetching. Selection therefore waits for an uncommitted registration rather than advancing
past an invisible earlier run. The guard precedes source/run/evidence locks and ends with the short
transaction, before external I/O or per-listing reconciliation. Equal start timestamps retain
their authentic time and select a fresh UUIDv7 after the admitted frontier; bounded exhaustion
or a regressing clock is a transient admission refusal. Existing retries retain their original
ID/start, and a one-shot completion discovered after the initial lookup returns the authenticated
completed replay without another acquisition, parse or publication.

Deterministically rejected or explicitly cancelled one-shot runs become internally `failed`,
preserving their operation ownership, run ID and original start time without publishing completion
or authorizing absence. A failed operation key cannot resume; a new request requires a new key.
Transient source/storage failures and command deadline timeouts retain the running boundary for
same-key recovery, even when an adapter maps a timeout abort to a cancelled dependency failure.
Combined command signals preserve the first abort cause: timeout is recoverable; deliberate
cancellation remains terminal. Fresh-signal retry preserves the original run ID and start time
without partial original/completion evidence. Access refusals
retain the separate source hold and paused-run policy. Failure cleanup has its own bounded
cancellation signal and cannot replace a successfully completed concurrent request.

Legacy creation recovery uses a transaction-scoped shared publication reader. Only a genuinely
retained creation envelope is copied into Properties' immutable event ledger, preserving its
identifier, payload, occurrence date, trace context and revision without republishing it.
If retention has removed that envelope, acquisition/current-state recovery still proceeds, but
no creation envelope is reconstructed. Properties' migration and repository never read platform
tables directly.

The legacy worker could publish creation from a later observation delivered first. Validated
pending originals older than that immutable creation are backfilled in acquisition-date/snapshot
order for counts, dated values, first collection date and the first lifeline. They do not replace
newer current values, rewrite the published creation/history/revisions or emit retroactive
pre-creation market events. Historical corrections and current text-display rights apply to these
backfilled values exactly as to other acquisitions.

Detail retains no recorded sale or neighborhood comparison. Prepared examples retain explicitly
illustrative evidence; reconciled groups expose actual, uncalibrated deterministic rule scores.
Amounts are exact BRL cents; price per square meter is calculated and rounded
by the backend from the current canonical area. If that derived value rounds to zero
or exceeds the positive safe-integer contract, both Property and Listing return `null` for the
metric while preserving the exact original asking-price cents.

Current source text-display permission is checked independently for each listing on every persisted
and prepared property/listing detail request. Missing or revoked rights deny text; a failed lookup
returns a sanitized failure, never a permissive fallback. Restoring rights exposes only the
already-stored or prepared permitted text, without mutating history or cached fixtures. An originally
text-free denied example remains text-free after a grant. Only masked,
allowlisted canonical facts are stored; contact, unit/complement and photograph data are excluded.

Properties derives an immutable normalized listing only after verification of the original
Collection publication. Each allowed value carries the original `sourceId`, sanitized `sourceUrl`
and acquisition `observedAt` as its collection time; run, snapshot and content hash remain audit
provenance. Required type, BRL centavos, decimal square meters and integer room/parking counts
retain their canonical values, including explicit zero counts. No missing value is replaced with
zero, and no attribute is inferred from description text. Collection accepts its existing six
types; the prepared search contract's `studio` option does not widen ingestion.

Feature normalization applies NFC, trims leading/trailing whitespace, collapses repeated
whitespace to one space and uses locale-independent lowercase. NFC is reapplied after lowercase,
before length validation and deduplication, because case conversion can reintroduce decomposed
Unicode sequences. Duplicate normalized features are
removed in first-occurrence order. Unknown valid features remain; there is no semantic dictionary
or translation. Each normalized feature must be nonempty and at most 100 characters. Empty arrays
remain empty. An invalid normalized value rejects the transaction without committing inbox, fact,
entity or creation effects. The exact received event and its evidence/hash are never rewritten.

The existing HTTP keys are unchanged. Listing `provenance` supplies the common source, URL and
collection time inherited by every displayed attribute and feature; `fieldEffectiveAt.askingPrice`,
`.description` and `.attributes` supply their effective original-acquisition dates. Dated description
versions use corrected values where authorized, but original description-change hashes remain
unchanged.
Published address values retain that source provenance. The separately resolved `place` and
`breadcrumbs` are synthetic reference geography, with no claim that their coordinates came from
the listing source. Immutable initial values stay separately readable; current values are rebuilt
from original acquisitions plus authenticated corrections and their resolved synthetic geography.
No correction substitutes its publication time for original acquisition provenance.

Reference geography is fixture-only and persisted in the owned `locations` schema. New
`SYN-SP-0001` observations on Avenida Exemplo resolve to
`sao-paulo-bela-vista-avenida-exemplo-fictional-block`, with six crumbs. Existing five-crumb initial
property snapshots remain immutable and readable after replay or restart. Persisted property
records do not enter prepared search or place counts. They alone supply production reductions.

The worker job uses `LISTING_HISTORY_BATCH_SIZE` (1–100, default 25),
`LISTING_HISTORY_INTERVAL_MS` (at least 100, default 250), and `LISTING_HISTORY_TIMEOUT_MS`
(at least 100, default 5000). Cycles do not overlap, database work receives cancellation, shutdown
cancels active reconciliation, and OpenTelemetry records the reconciliation span and effect count.
Each cycle runs identity resolution after listing history under the same cancellation deadline;
unchanged persisted inputs publish no new decision or membership event.

The ingestion-only `resolveFixtureAddress(address, transaction?)` forwards the verified
Collection transaction scope into Locations. Its SQL uses the same active pool lease, after
evidence verification; foreign or inactive scopes are rejected. Ordinary picker and published
address queries use the bounded pool and retain its existing timeouts.

## Deterministic entity resolution

Resolution runs in the worker, never during a read. New causal membership requires at least one
retained authentic listing envelope. A legacy identity without that evidence retains its unresolved
read/history view, with no invented assignment or revision, while eligible identities advance.
A future authentic listing event makes it eligible for the next complete scan.

Configuration `d092-initial`, version 1,
uses base weights 0.150 coordinates, 0.510 images, 0.170 area, 0.085 bedrooms and 0.085
masked-description token overlap. Coordinates are unavailable in the current Collection contract;
reference centroids are not listing coordinates. Available signals are renormalized. Comparable
images use existing exact/dHash evidence, area uses the smaller/larger ratio, bedrooms use equality,
and description uses Unicode-token Jaccard without a model. Scores use twelve decimal places.

Different normalized city, state, street or canonical property type forces final probability zero.
Neighborhood disagreement remains visible and does not repair a source's address. Available base
weight below 0.75 caps the final probability at 0.89. At least 0.90 joins automatically; 0.50 to
below 0.90 records `properties.match.queued-for-review`; lower values remain separate. Stored
comparisons retain input/configuration identities, raw/final probability, coverage, incompatibilities
and safe reason contributions. These probabilities are deterministic rules, not measured calibration.
Each current assignment identifies the configuration actually executed; detail does not select a
configuration by the greatest stored version across different configuration IDs.

Stable source/listing ordering and complete-link grouping require every pair in a group to pass;
the smallest original Property UUID survives. Detail resolves old Property IDs to the current group
and `/listings/:id` returns that requested member. Every member retains its own history, provenance,
rights and published values. The summary selects the lowest active asking price with a Listing-ID
tie-break, and source disagreement remains explicit. Corrected matching inputs can split a group;
removal alone does not change identity. Corrections and association changes do not invent market
price effects or rewrite an emitted listing revision.

## Persisted synthetic geography and address resolution

The reference contains the original eighteen places, with unchanged public IDs, order, bilingual
names, registered adjacency, prepared counts and coordinates, plus two fictional street blocks:

| Public ID                                               | Neighborhood / zone | Published street | Prepared count / coordinates |
| ------------------------------------------------------- | ------------------- | ---------------- | ---------------------------- |
| `sao-paulo-bela-vista-avenida-exemplo-fictional-block`  | Bela Vista / Centro | Avenida Exemplo  | `0` / `null`                 |
| `sao-paulo-vila-mariana-rua-cenario-um-fictional-block` | Vila Mariana / Sul  | Rua Cenário Um   | `0` / `null`                 |

Both ranges are prepared inclusive examples `100–199`, not inferred published house numbers.
The hierarchy is country → state → city → zone → neighborhood → street block. The five zones are
Centro, Norte, Sul, Leste and Oeste. The only registered adjacency is Bela Vista ↔ Vila Mariana;
it is synthetic reference data, not an inference about real neighborhoods. Internal UUIDv7 IDs
are separate from unique stable public IDs, and migrations/restarts preserve both.

The internal read-only `LocationsFacade.resolvePublishedAddress` accepts exactly `city`,
`stateCode`, `neighborhood`, `street` and optional `number`. It is not a public HTTP endpoint or
a Collection event change. Equality ignores accents, case and repeated spaces; leading `Rua` /
`R.` and `Avenida` / `Av.` are explicit aliases. No substring, fuzzy, matching-label or geocoder
correction is performed. In particular, COBALTO's published Vila Mariana / Rua Cenário Um resolves
to its separate supplementary block, not Bela Vista based on a matching label.

A number must be a nonnegative safe integer and match exactly one inclusive registered range.
Without a number, the street must have exactly one block. Unknown or ambiguous addresses and
out-of-range numbers return `null`. Extra fields (including units and complements), noninteger or
unsafe numbers, and malformed streets with appended numbers/units are rejected before database
I/O; the service does not heuristically extract private address suffixes. Query values are never
persisted, logged or added to canonical events. Collection still supplies no number.

All place reads use PostgreSQL and fail closed with the standard sanitized error response if
persistence is unavailable; there is no prepared-memory fallback. Supplementary IDs are valid
prepared search scopes with empty results and persisted reduction scopes, but the five-property
projection and its original eighteen-place counts are unchanged. No public place writes, new
business events, geometry/PostGIS activation or real-source processing are introduced.

## Endpoints

All paths are relative to `/api/v1`. All methods are `GET`; there are no property write endpoints.

| Path                             | Success body, besides metadata                                                               | Accepted query fields |
| -------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| `/properties`                    | Search page: `items`, `nextCursor`, `totalItems`, `medianPricePerSquareMeter`, `placeCounts` | Search fields below   |
| `/properties/:id`                | `property` detail, including grouped listings                                                | None                  |
| `/listings/:id`                  | `listing` detail                                                                             | None                  |
| `/places`                        | Root picker `items`                                                                          | None                  |
| `/places/:id`                    | `place` detail                                                                               | None                  |
| `/places/:id/children`           | Direct-child picker `items`                                                                  | None                  |
| `/places/:id/largest-reductions` | Reduction page: `items`, `nextCursor`, `totalItems`                                          | `pageSize`, `cursor`  |

Property and listing IDs are lowercase UUIDv7 values. Place IDs are lowercase hyphenated slugs.
Known leaf places have an empty children array, and known places without recorded reductions have
an empty reduction page. Valid unknown resource IDs return `404`; a valid unknown search scope
matches no properties. Unprefixed business paths return `404`.

## Search and paging

Search defaults to `placeId=sao-paulo`, `sort=furthest-below-median`, `pageSize=20`.
All supplied filters combine with AND, including the three history flags. Bounds are inclusive.
Missing attributes cannot satisfy a supplied numeric bound. No zero is fabricated for a missing
attribute or absent active asking price.

| Field                                              | Accepted values and meaning                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `placeId`                                          | Place slug at any level; includes all descendants                              |
| `propertyType`                                     | `apartment`, `house`, `studio`, `commercial`, `land`, `condominium`, `other`   |
| `minAskingPrice`, `maxAskingPrice`                 | Integer BRL centavos, from 0 to 9007199254740991                               |
| `minPricePerSquareMeter`, `maxPricePerSquareMeter` | Integer BRL centavos per square meter, same bounds                             |
| `minArea`, `maxArea`                               | Square meters, finite decimal from 0.01 to 1000000                             |
| `minBedrooms`, `minBathrooms`, `minParkingSpaces`  | Integer minima from 0 to 100                                                   |
| `timeOnMarket`                                     | `up-to-30` (0–30 days), `31-to-90` (31–90), `over-90` (>90), `over-180` (>180) |
| `priceReduced`                                     | `true` or `false`; any recorded listing asking-price decrease                  |
| `returnedToMarket`                                 | `true` or `false`; any recorded listing reappearance                           |
| `multipleListings`                                 | `true` or `false`; more than one currently active listing                      |
| `sort`                                             | One of the four sorts below                                                    |
| `pageSize`                                         | Integer from 1 to 20; default and maximum 20                                   |
| `cursor`                                           | Opaque cursor returned by the preceding page                                   |

Numbers use plain unsigned decimal notation, not signs, whitespace, exponents, `NaN` or `Infinity`.
Booleans are exactly lowercase `true` and `false`. Repeated keys, nested/array keys, unknown fields,
empty values, invalid enums, reversed ranges and out-of-bounds values return `400`.

| Sort                            | Primary ordering                                      |
| ------------------------------- | ----------------------------------------------------- |
| `furthest-below-median`         | Signed below-median percentage descending             |
| `lowest-price-per-square-meter` | Current asking-price-per-square-meter ascending       |
| `longest-on-market`             | Days since earliest published listing date descending |
| `most-recent`                   | First collection timestamp descending                 |

All ties use property ID ascending. The prepared properties share a first collection timestamp,
so `most-recent` deliberately demonstrates the ID tie-break. Missing prices sort last.
The median uses the entire matching set, never only the current page; an even-sized median is
rounded to the nearest centavo. `belowMedianPercent` is
`(matchingMedian - propertyPricePerSquareMeter) / matchingMedian * 100`; negative means above median.
An empty set has a null median. `placeCounts` counts the whole matching population for each
registered country, state, city, zone, neighborhood and block. Static picker `propertyCount` instead
counts the full authoritative fixture, independent of search filters.

Cursors bind the normalized filters, scope, sort, page size and endpoint. Preserve those fields on
later requests. A malformed cursor or one copied to a different scope, filter, sort, page size or
endpoint returns `400`. `nextCursor: null` marks the last page. The cursor is an opaque navigation
token, not an authorization or tamper-proof security token. `totalItems` is the full matching count.

Reductions use `fixtureVersion: "persisted-synthetic-reductions-v1"` and `dataMode: "synthetic-stub"`.
Each current persisted group contributes at most one row. The endpoint selects its latest
strictly negative authentic property-minimum effect by effective date through `asOf`, retaining
canonical causal order for equal dates. A nonminimum member's price change is not a property
reduction. Later price increases and removals do not discard a historical reduction. There is no
30-day or active-only filter. Rows sort by exact positive percentage descending, then Property ID
ascending. `listingId` and provenance identify the selected member of the historical drop.

An initial group whose members have not previously been resolved reconstructs minimum history
from authentic retained listing envelopes, preserving each member's revision order. These safe
historical facts reference their original cause; they do not publish new events. Creation, addition,
association and parser corrections cannot manufacture a price reduction. Unresolved legacy
singletons retain their genuine original history where no grouped minimum history applies.
The backend computes signed `changePercent = (currentMinorUnits - previousMinorUnits) /
previousMinorUnits * 100` on every property price-history item and `reductionPercent = -changePercent`
on reductions. Clients format those facts without recalculating them.

Registered self-and-descendant geography determines scope, including all six levels and the two
supplementary blocks. Membership and returned `place` use the newest dated acquisition's eligible
corrected geography. Corrections can therefore move a row between places, but cannot rewrite its
original previous/current amounts, effective date or provenance, or manufacture a reduction from
adjacent corrected values. Legacy acquisition backfill likewise invents no pre-creation effects.
For example, a corrected current price of 72000000 can coexist with an original recorded reduction
of 80000000 → 70000000; the ranking still reports that original effect.

`asOf` is the maximum authentic original-acquisition or market-effect date across the whole scoped
set, including unchanged, nonreducing and initial-only Properties. Correction receipt times never
advance it. A known scope with no Properties uses the injected current clock and returns an empty
page; unknown scopes return `404`. Database failures return sanitized `500`, never prepared rows.
Persisted cursors bind the endpoint, place and page size, but are live navigation tokens: they do
not freeze a dataset snapshot, so new facts can change membership, totals and offsets between pages.

The 39 original catalog runs contain 115 acquisitions. Their four current grouped reductions,
in percentage order, are Tatuapé (95000000 → 92000000), Bela Vista (80000000 → 78000000),
Santana (67000000 → 65500000), then Vila Mariana (126000000 → 124000000).
Santana's previous group minimum comes from Aurora at 67000000;
Brisa's own previous asking price of 68000000 is not the property's minimum. Original member
provenance identifies the listing causing each drop. Vila Mariana's cheaper listing returns on
2026-06-01: its unchanged individual asking price genuinely lowers the active group minimum.
This property effect does not fabricate an individual listing price change. The separate prepared
adapter retains its illustrative examples; production does not mix them with persisted rows.
None of these asking-price changes records a
sale or a market appreciation metric.

## Response models and public validators

`@rei/contracts` exports JSON-only types and strict parsers. Parse serialized responses with
`parseSearchResponse`, `parsePropertyResponse`, `parseListingResponse`, `parsePlacesResponse`,
`parsePlaceResponse` and `parseReductionsResponse`. Parsers reject missing/extra nested fields,
invalid discriminants, dates, IDs, hashes, URLs and unsafe money. They validate wire shapes; the
backend owns the calculations and business relationships. Parsers throw `TypeError` on invalid
wire data. They do not fetch source URLs.

- `PlaceRef`: `id`, `kind` (`country`, `state`, `city`, `zone`, `neighborhood`, `street-block`),
  bilingual `name.en` and `name.ptBR`.
  `PlaceDetail` adds nullable `parentId`, root-to-self `breadcrumbs`, registered `adjacentPlaceIds`
  and `propertyCount`, nullable `coordinates: {latitude, longitude}` and nullable `block` metadata.
  A block supplies `streetName`, inclusive `fromNumber`/`toNumber` range and
  `origin: "prepared-fixture"`. Each authoritative fixture property has one stable fictional block;
  prepared property/listing canonical places are those blocks; newly ingested observations use
  the block registered for their published address. Coordinates and street ranges are explicitly
  prepared examples, never geocoded. No unit or complement is exposed. Non-block places have null
  coordinates and block metadata. Adjacency is registered between neighborhoods only.
- `PropertySummary`: canonical identity/type/place/crumbs, nullable area and room attributes,
  lowest active `askingPrice` with selected `listingId` and provenance, nullable
  `pricePerSquareMeter`, `timeOnMarketDays`, first/last collection dates, active listing count,
  price-reduced/returned flags, nullable own-set deviation and `neighborhoodComparison: null`.
  The latter is intentional while the market context is absent.
- `PropertyDetail`: `summary`, `sale: {status: "not-recorded"}`, `listings`, dated `priceChanges`
  with previous/current centavos, signed `changePercent` and originating provenance, per-field
  `sourceAgreement` values (including `propertyType`), `featureAgreement`, and `preparedEvidence`.
  Attribute agreement preserves per-listing/source values and an `agrees` fact.
  Feature rows carry `feature`, `reportingCount`, `reportingPercent`, reporting `listingIds` and
  distinct `sourceIds`. The percentage uses all grouped listings as denominator; missing reports
  never prove feature absence. Features not reported anywhere have no row.
- `preparedEvidence` is discriminated by `kind`. The `deterministic-rule` branch contains actual
  `productionMatchScore` and `rawProbability` (null for a single member),
  `probabilityBasis: "deterministic-uncalibrated"`, `configurationId`, `configurationVersion`,
  member `listingIds` and `rule-comparison` reasons: compared listing IDs, feature, availability,
  nullable score and contribution. It exposes no description text, image or fingerprint payload.
  The `prepared-fixture` branch retains listing membership from fixture ground truth,
  `illustrativeProbability` (0.95 for grouped examples, 1 for a single listing),
  `probabilityBasis: "prepared-not-calibrated"`, and `productionMatchScore: null`. These values
  are prepared examples, neither measured nor calibrated scores. Typed `reasons` contain only
  permitted structured facts: `attribute-agreement` (`field`, `value`, `listingIds`),
  `shared-structured-feature` (`feature`, `listingIds`) and `published-neighborhood-disagreement`
  (per-listing `neighborhood` values). Bela Vista demonstrates the published-neighborhood conflict
  alongside matching type/area/room/street and feature facts. Reasons contain no description text,
  image, contact or fingerprint data.
- `ListingDetail`: stable identity and property ID, fixture label, source identity/label/URL,
  within-property position, `active`/`removed` status, canonical place and separately preserved
  published neighborhood, street/features/nullable attributes, asking price and BRL currency,
  centavos-per-square-meter and formula, provenance, snapshot status, collection count/dates,
  per-field effective timestamps, description, history and lifeline intervals.
- `Reduction`: property/listing IDs, place, effective date, previous/current centavos,
  reduction percentage and provenance.

All money is positive, safe-integer BRL centavos on returned facts. Asking-price-per-square-meter
uses the existing deterministic domain arithmetic (nearest-centavo result); formatting belongs
to clients. Provenance contains `sourceId`, `sourceListingId`, `sourceUrl`, `runId`, `snapshotId`,
`contentHash` (`sha256:` plus 64 lowercase hex digits) and canonical UTC `observedAt`.

Listing history is discriminated by `type`: `created`, `price-changed`, `description-changed`,
`removed`, `reappeared`. Every entry has `effectiveAt` and provenance. Price entries add prior/current
prices; description entries add only before/after hashes. Removal references the last observed
snapshot, not an invented observation. Lifelines contain `{from, to}` intervals, with null `to`
for a current active interval. Removal means absent from a synthetic observation, not sale or
privacy suppression.

Allowed descriptions have `permission: "allowed"`, `current`, dated `versions` (text and hash)
and `sourceUrl`. The denied branch has only `permission: "denied"`, `changedAt` and `sourceUrl`:
neither listing nor property responses include current/previous text, text versions or excerpts.
Current Collection source-register rights govern both detail endpoints, including prepared mixed-source
properties; public availability does not establish permission. Denied `changedAt` is the sorted unique
union of immutable original `description-changed` effective dates and corrected dated-version
transitions. A correction can collapse versions without erasing an original change date, or create
a dated transition without publishing a market event. Generic history retains those distinctions.
Generic history never contains description text. No contact, unit identifier, photo or fingerprint
payload is exposed.

Snapshot availability is `available`, `expired` or `unavailable`. Persisted detail obtains safe
metadata from Collection, bound to the exact source/listing/URL/run/snapshot/hash and original
observation date. Missing or mismatched evidence returns `unavailable`, never a foreign reference.
A retained committed synthetic reference is `available` with its original collection date and
null expiry. A real generation is `available` only when its matching durable reference is confirmed
available, non-deleted and before its original fixed 30-day expiry. It is `expired` exactly at that
deadline, including delayed or interrupted physical cleanup. Trusted generation collection/expiry
dates do not change on parser correction, replay or restart. Hashes and original provenance remain
auditable after deletion. Availability describes durable metadata, not physical object-store health;
public reads do not probe storage or receive object locations, encryption keys or raw contents.

Prepared lifecycle examples remain explicitly illustrative. The supplementary expired example
represents a single historical observation, not a mixture of its old snapshot and newer listing facts.
An expired prepared snapshot
retains its original collection time, expiry time, run ID and content hash; no raw-object download
or retrieval is implemented. A prepared missing-bedroom example uses null, has no active asking
price, and still explicitly records no sale.

The isolated `pnpm run test:integration:listing-provenance` campaign verifies both detail endpoints
through genuine synthetic acquisitions, actual storage/outbox/broker/worker delivery and reparse,
live per-source revoke/restore, prepared mixed/missing rights and restart. A separately labelled
encrypted historical fixture is written through each owning repository and read through the actual
HTTP composition with a controlled clock; it proves exact expiry, interrupted deletion and fresh
pool/API recovery without weakening synthetic-only ingestion authority. All services and data are
campaign-owned local resources. No real source is enabled or collected, and no VPS, push or
deployment action is part of this proof.

## Stable fixture IDs

The UUID prefix below is literal: append the twelve-digit suffix to `0199a3e0-0000-7000-8000-`.

| Property suffix | Canonical neighborhood | Listing suffixes and source identities                                          |
| --------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `000000000001`  | Bela Vista             | `000000000101` AUR-BV-001; `000000000104` BRI-BV-001; `000000000107` COB-BV-001 |
| `000000000002`  | Pinheiros              | `000000000102` AUR-PN-001                                                       |
| `000000000003`  | Santana                | `000000000103` AUR-SN-001; `000000000105` BRI-SN-001                            |
| `000000000004`  | Vila Mariana           | `000000000106` BRI-VM-001; `000000000109` COB-VM-001                            |
| `000000000005`  | Tatuapé                | `000000000108` COB-TT-001                                                       |

Bela Vista demonstrates minimum asking-price changes from 82000000 to 80000000 to 78000000
centavos, a Brisa description update in March 2026 and published-neighborhood disagreement.
Cobalto Vila Mariana is absent in April and May 2026 and reappears in June; its lifeline preserves
that gap and its collection count is eleven rather than thirteen.

| Supplementary branch             | Property suffix | Listing suffix |
| -------------------------------- | --------------- | -------------- |
| Explicit denied text             | `000000000901`  | `000000000991` |
| Expired historical snapshot      | `000000000902`  | `000000000992` |
| No active listing / null bedroom | `000000000903`  | `000000000993` |

These examples are labelled supplementary, retrievable only by their IDs, and excluded from search,
picker counts, medians and reduction rankings. They do not modify collection replay ground truth.

The root is country `brazil`, with child state `sao-paulo-state` and city `sao-paulo`. Zones are
`sao-paulo-centro`, `sao-paulo-norte`, `sao-paulo-sul`,
`sao-paulo-leste`, `sao-paulo-oeste`. Their respective neighborhood children are
`sao-paulo-bela-vista`, `sao-paulo-santana`, `sao-paulo-vila-mariana`, `sao-paulo-tatuape`,
`sao-paulo-pinheiros`. Each neighborhood has one fictional block whose stable ID appends
`-fictional-block` to its neighborhood ID; these blocks are the leaves of the six-level hierarchy.
The country, state and city count five authoritative properties; every seeded zone, neighborhood
and block counts one. Only Bela Vista ↔ Vila Mariana adjacency is registered.

## Domain event boundary

`@rei/domain` exports `PropertiesEvent`, its literal-keyed `PropertiesPayloadMap`,
`PROPERTIES_EVENT_TYPES` and `parsePropertiesEvent`. Constructors and wire parsing both enforce
immutable v1 facts. The existing seven-field envelope is `eventId`, `type`, `version`, `aggregateId`,
`occurredAt`, `traceContext`, `payload`. UUIDv7 aggregate identity, canonical UTC times, explicit
nullable trace context and existing trace rules apply. Payloads have positive integer `revision`
and `effectiveAt` no later than the envelope's observation time.

| Event type                                 | Payload facts besides revision/effectiveAt                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `properties.listing.created`               | Canonical dated listing identity/source/place/type/area/status/asking price/provenance         |
| `properties.listing.price-changed`         | Same listing facts plus `previousMinorUnits`, different from current asking price              |
| `properties.listing.description-changed`   | Same listing facts plus distinct `beforeHash`, `afterHash`; no text                            |
| `properties.listing.removed`               | Listing facts with removed status and last observation provenance                              |
| `properties.listing.reappeared`            | Listing facts with active status                                                               |
| `properties.property.asking-price-changed` | `previous`, `current` minimum-active-price facts for the aggregate                             |
| `properties.property.merged`               | Two or more `previous` properties, one `resulting` property and explicit listing `assignments` |
| `properties.property.split`                | One `previous` property, two or more `resulting` properties and explicit listing `assignments` |

Minimum facts include property/place/area, BRL currency, nullable minimum, selected listing and
provenance, and unique active listing IDs. With no active listings, minimum/selected/provenance are
all null. Otherwise the selected listing must be active. Assignment rows contain `listingId`,
`fromPropertyId`, `toPropertyId`, cover active membership consistently before and after, and cannot
be duplicate or ambiguous. Merge/split payloads also carry dated `listingFacts` for exactly every
active listing involved, anchored to its previous property. Both previous and resulting minimum
facts must select a listing at the actual minimum of those prices with that listing's exact
provenance. The same listing facts establish unchanged asking prices across reassignment. Facts may
precede the event's effective time but cannot follow it. Membership and assignments conserve every
active listing exactly once. An unchanged A→A assignment is valid when a property ID survives a
merge or split. The aggregate must identify the target listing/property. Payloads reject
unknown/missing fields, contradictory statuses, provenance/identity disagreement and invalid facts.

These are contracts only: no properties events are emitted, persisted or sent to the broker here.
Consumers must use revision/effective-time facts rather than assume delivery order. Production
matching, match weights, ingestion-driven projections and event delivery are deferred.

## Errors and verification

Malformed requests return `400` with code `bad_request`; missing resources return `404` with
`not_found`. The existing error body is `{error: {code, message, requestId}}`, with a fresh server
request ID also returned as `x-request-id`; a caller-supplied value is not trusted. Messages are
sanitized, never echoing input, internal exceptions or credentials.

After `pnpm run build`, run `pnpm run test:integration:properties` for the API-only journey. It creates
a unique Compose project with dynamic ports and synthetic credentials, explicitly disables env-file
loading, starts only PostgreSQL, existing migrations and the compiled API, validates serialized
responses and errors, verifies collection/raw-object/outbox counts do not change, and removes its
own containers and volumes in scoped cleanup. Unit and real-HTTP tests also cover contract/event
mutations, filters, paging, history, rights and expiry. No frontend or external source is involved.

`pnpm run test:integration:locations` independently traverses all twenty persisted places, resolves
all nine catalog addresses plus the tracer through the real SQL facade and fetches their returned
blocks through HTTP. It checks boundaries, ambiguity, privacy validation, relational constraints,
migration replay, restart, stable UUIDv7 IDs and fail-closed reads. Ten synchronized transactions
hold every production pool lease before resolving all ten addresses, proving the resolver needs
no second checkout. SQL writes reject whitespace-only English, Portuguese and street names for
every ECMAScript trim character, while valid 200-character names remain readable. The production
`test:integration:properties-ingestion` campaign verifies the new six-crumb block through genuine
collection → RabbitMQ → worker → Property/Listing HTTP, plus historical five-crumb replay/restart
compatibility. Both use unique owned projects, dynamic ports, disabled env-file loading and exact
container/volume cleanup.

The ingestion campaign also uses a separately labelled local real-shaped synthetic adapter on
the existing owned `synthetic-data` source with a distinct listing identity. Its in-memory input
contains artificial contact, individual CRECI, unit/complement and photo fields. Before returning
canonical bytes to Collection, it runs the shared sanitizer to drop those fields, mask permitted
text and remove URL query/fragment data. The campaign checks sanitized snapshot bytes, immutable
SQL facts and publication evidence, creation outbox facts, normalized detail and feature agreement,
per-value provenance, current denied text rights, and replay after restart/inbox expiry. This
fixture neither enables a real source nor claims general recognition of person names in arbitrary
prose; known structured contact names are masked deterministically. Prepared source bytes,
catalogs and labels remain unchanged.
