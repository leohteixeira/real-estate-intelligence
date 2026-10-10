# Properties and locations API reference

The seven read endpoints below are a versioned, synthetic contract surface. Property and listing
detail query persisted initial owned-synthetic observations first, then use prepared fallback for
existing fixture IDs. Place navigation reads a persisted synthetic reference; property search,
counts and reductions remain prepared. No read starts
collection, publishes events, resolves entities or calculates market figures. The prepared fixture
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

Persisted detail keeps `dataMode: "synthetic-stub"`, uses
`fixtureVersion: "persisted-initial-synthetic-v1"`, and anchors `asOf` to its initial original
observation time. It is an unresolved single-listing baseline, not a physical-property match.

## Persisted initial detail

The worker's durable `properties.parsed-listing` subscription consumes strict parsed v1/v2 events.
Collection verifies the complete canonical publication, original provenance and current synthetic
collection authority within the transaction; missing legacy publication evidence is not fabricated.
An original v1 creates one immutable Property with a distinct Listing ID and one revision-1
`properties.listing.created` outbox event. Inbox, fact, entity and outgoing event commit together.
Durable fact and source-identity uniqueness prevent duplicate creation even after inbox expiry.

Another v1 for the source identity is `pending-history`; a v2 correction is `pending-correction`,
including when it arrives before v1. These facts retain correction identity and chronology but do
not change the initial HTTP view or create fake price/description history. Detail reports one
collection, one creation, no sale, no comparison, no production match score and explicitly
illustrative uncalibrated evidence. Amounts are exact BRL cents; price per square meter is calculated
and rounded by the backend from the original canonical area. If that derived value rounds to zero
or exceeds the positive safe-integer contract, both Property and Listing return `null` for the
metric while preserving the exact original asking-price cents.

Current source text-display permission is checked independently on every persisted property and
listing request. Denied text omits current text, versions and excerpts while preserving provenance;
a failed permission lookup returns a sanitized failure, never a permissive response. Only masked,
allowlisted canonical facts are stored; contact, unit/complement and photograph data are excluded.

Reference geography is fixture-only and persisted in the owned `locations` schema. New
`SYN-SP-0001` observations on Avenida Exemplo resolve to
`sao-paulo-bela-vista-avenida-exemplo-fictional-block`, with six crumbs. Existing five-crumb initial
property snapshots remain immutable and readable after replay or restart. Persisted property
records do not enter prepared search, place counts or reductions.

The ingestion-only `resolveFixtureAddress(address, transaction?)` forwards the verified
Collection transaction scope into Locations. Its SQL uses the same active pool lease, after
evidence verification; foreign or inactive scopes are rejected. Ordinary picker and published
address queries use the bounded pool and retain its existing timeouts.

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
prepared search/reduction scopes with empty results, but the five-property projection and its
original eighteen-place counts are unchanged. No public place writes, new business events,
geometry/PostGIS activation or real-source processing are introduced.

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

Reductions select each property's latest strictly negative minimum-active-asking-price change through
`asOf`. There is at most one row per property, ordered by positive `reductionPercent` descending,
then property ID ascending. The originating selected listing is linked by `listingId` and provenance.
The backend computes signed `changePercent = (currentMinorUnits - previousMinorUnits) /
previousMinorUnits * 100` on every property price-history item and `reductionPercent = -changePercent`
on reductions. Clients format those facts without recalculating them.

Santana illustrates the distinction: its property minimum changes from 67000000 to 65500000
centavos (about 2.2388%), although the selected Brisa listing changes from 68000000 to 65500000.
The fixture has four property reduction rows: Tatuapé, Bela Vista, Santana and Vila Mariana in that
order. Vila Mariana's minimum rises while its cheaper listing is absent, then falls when that
listing returns. None of these asking-price changes records a sale or a market appreciation metric.

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
- `preparedEvidence`: labelled `prepared-fixture`, listing membership from fixture ground truth,
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
This is an explicit prepared permission branch, not permission inferred from public availability.
Generic history never contains description text. No contact, unit identifier, photo or fingerprint
payload is exposed.

Snapshot availability is `available`, `expired` or `unavailable`. The supplementary expired example
represents a single historical observation, not a mixture of its old snapshot and newer listing facts.
An expired prepared snapshot
retains its original collection time, expiry time, run ID and content hash; no raw-object download
or retrieval is implemented. A prepared missing-bedroom example uses null, has no active asking
price, and still explicitly records no sale.

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
