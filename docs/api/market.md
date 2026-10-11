# Market read API

All routes use `GET`, accept a registered place slug and reject every query parameter, including
repeated, nested and private keys. They require no authentication in this synthetic foundation.

| Route                                      | Strict parser exported by `@rei/contracts` | Payload                                      |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------- |
| `/api/v1/places/:id/market`                | `parsePlaceMarketResponse`                 | Counts, six figures and parent median        |
| `/api/v1/places/:id/market/neighbours`     | `parsePlaceMarketNeighboursResponse`       | Registered adjacent neighbourhoods           |
| `/api/v1/places/:id/market/monthly-series` | `parsePlaceMarketSeriesResponse`           | Twelve monthly medians and parent comparison |

## Common fields

| Field         | Type                                 | Meaning                                                                                           |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `metadata`    | `{ dataMode, fixtureVersion, asOf }` | `synthetic-stub`, `synthetic-sao-paulo-v1`, `2026-10-01T12:00:00.000Z`                            |
| `basis`       | string                               | Overview: `event-fed-median-with-prepared-sections`; neighbours/series: `prepared-market-example` |
| `evaluatedAt` | UTC ISO timestamp                    | Overview: actual computation time; prepared neighbours/series: `2026-10-01T12:00:00.000Z`         |
| `place`       | `{ id, kind, name: { en, ptBR } }`   | Registered country, state, city, zone, neighbourhood or street block                              |

## Overview fields

`counts` contains safe integer `properties`, `activeListings` and `sources`. São Paulo has five
prepared properties, nine active listings and three sources. These counts belong to the prepared
grouping; they do not count the nine unresolved persisted Properties identities from ingestion.

The overview additionally requires `preparedEvaluatedAt`, the independent fixture evaluation
time, and the exact ordered `preparedSections` array:

```json
[
  "counts",
  "figures.askingPriceMovement",
  "figures.medianTimeOnMarketDays",
  "figures.priceReductions",
  "figures.listingsPerProperty",
  "figures.recordedSalePricePerSquareMeter"
]
```

Those fields retain their prepared values and evidence. Their freshness is evaluated against
`preparedEvaluatedAt`, rather than the current computation time. The live median's `recordCount`
counts eligible persisted property identifiers and is independent of prepared `counts.properties`.
Clients can distinguish the two populations using the explicit basis and section declaration.

`parentMedian` is null for Brazil. Otherwise it contains `place` and `median`, identifying the
actual registered parent and its independently evidenced figure. Pinheiros compares with
`sao-paulo-oeste`, not implicitly with São Paulo city. Empty supplementary blocks retain their
identified neighbourhood parent.

| `figures` field                   | `value` when available            | Unit / extra field                                                         |
| --------------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `medianAskingPricePerSquareMeter` | `{ minorUnits, currency: 'BRL' }` | Integer centavos per m²; positive amount                                   |
| `askingPriceMovement`             | number                            | Percentage points, possibly negative or zero; `windowMonths: 6`            |
| `medianTimeOnMarketDays`          | number                            | Finite nonnegative days                                                    |
| `priceReductions`                 | `{ count, percentage }`           | Safe integer listing count, percentage points from 0–100; `windowDays: 30` |
| `listingsPerProperty`             | number                            | Finite nonnegative listing/property ratio                                  |
| `recordedSalePricePerSquareMeter` | null                              | Always `state: 'not-recorded'`; no sale sample exists                      |

Each figure contains `state`, `value`, `recordCount`, `sources`, `computedAt` and `freshness`.
An `available` figure has a nonnull value and positive record count. An `insufficient-data` figure
has null value, zero record count and no sources. Numeric zero is available data: unchanged
Pinheiros has zero movement, and the October thirty-day example has zero reductions.
An unrecorded sale has null value, zero record count and no sources, never a monetary zero.

Each source is `{ id, label, url, collectedAt }`, with a unique slug, label, credential-free
HTTP(S) `.invalid` URL and UTC timestamp. Source evidence lists all active sources contributing
observations to the prepared sample, including listings within the same group; the representative
asking price still counts that group only once. Median, movement, days and ratio record counts
count groups in the prepared variant; reduction record counts count eligible active listings.
The event-fed median lists only selected representatives' sources, sorted by identifier. Each
label is its source identifier. Its URL and `collectedAt` come from that source's latest contributing
observation; equal observation times select the lower listing identifier.

`freshness` contains `status: 'fresh' | 'stale'`, nullable `latestCollectionCompletedAt` and
nonnegative `ageSeconds`. Age is `(evaluatedAt - computedAt) / 1000`, not wall-clock age. A figure
is stale exactly when its computation precedes the latest source completion. Completion cannot
follow evaluation; source observations cannot follow that completion. An empty figure has null
completion and fresh status. The prepared default examples have completion equal to computation;
they do not assert a collector actually ran. Old monthly examples can be fresh with positive age.

For the event-fed own and actual-parent medians, `freshness` is exactly
`{ status: 'untracked', latestCollectionCompletedAt: null, ageSeconds: 0 }` and `computedAt` equals
the overview's current `evaluatedAt`. A listing observation does not prove source collection
completion. Completion tracking belongs to a later story.

## Event-fed asking price rule

[ADR 0021](../../specs/adrs/0021-event-fed-market-median.md) defines the deterministic calculation:

1. Keep the highest revision of every listing, irrespective of event arrival or effective time.
2. Select each property's lowest active asking price globally. Equal prices select the lower
   listing identifier. Removed listings cannot represent a property.
3. Include a property only when its selected listing belongs to the registered descendant scope
   and has a nonnull area. A cheaper listing outside that scope or without area excludes the
   property; a more expensive listing never substitutes for it.
4. Round each representative's asking centavos divided by its own area to centavos/m². Sort these
   values and round the middle value, or the mean of the two middle values. Inputs and results
   must be positive safe integers; an even median avoids overflowing the sum. A positive price
   whose per-square-meter result rounds to zero is rejected at the domain boundary.

For property A with listings `10000 / 10` and `15000 / 10` centavos/m², and property B with
`20000 / 10`, the representatives are `1000` and `2000`. The median is `1500` centavos/m² and
`recordCount` is two. If A's cheapest listing has no area, A is excluded and the median is `2000`.
Known places without eligible facts return `state: 'insufficient-data'`, null value and zero
records, with no prepared median fallback. Asking prices are never recorded sale prices.

The worker subscribes to all five public `properties.listing.*` lifecycle events: created,
price-changed, description-changed, removed and reappeared. Each delivery validates the strict
public event, then records normalized evidence and conditionally advances Market's revision
frontier in the same transaction as its inbox marker. Permanent event identity and listing/revision
fences survive inbox expiry and worker restarts. Exact business replays are harmless; changed
identity, changed revision content or immutable listing identity conflicts reject and roll back.
Correlation context is excluded from business identity. Lower revisions remain evidence without
regressing current facts. Property merge/split assignment belongs to the later story.

## Neighbours and monthly series

The neighbours payload contains `items`, each with explicit `place`, `median` and `movement`.
Only Bela Vista and Vila Mariana are registered as adjacent to each other. Pinheiros and every
other place return an empty array. Sibling geography never implies adjacency.

The series payload contains nullable `comparisonPlace` and `points`. Every point has `month`
(`YYYY-MM`), independently evidenced `median` and nullable `parentMedian`. Exactly twelve
consecutive ordered months are returned: November 2025 through October 2026. Brazil has null
comparison and parent medians throughout; other places identify their actual parent.
Empty supplementary blocks return twelve unavailable own medians and available parent medians.
Each point's computation/source dates describe its own prepared monthly sample.

## Prepared arithmetic and examples

The immutable catalog has five labeled groups, nine listings, three synthetic portals and thirteen
cycles. Each month's active observations are assigned by the catalog's explicit group references;
the lowest active asking price represents a group. Centavos/m² are rounded to safe integers, then
the median of those group values is rounded. All groups are counted once, including the Cobalto
Bela Vista listing whose published neighbourhood differs from its prepared group label.

The October city values are `951220`, `993902`, `885135`, `918519` and `958333` centavos/m²;
their median is `951220`. Bela Vista is `round(78000000 / 82) = 951220` centavos/m².
Prepared movement compares April and October medians; prepared days use each group's earliest
active listing date; reductions compare September and October active listing prices. April and
May Vila Mariana examples use Brisa alone while Cobalto is absent. These fixture rules do not
settle later production eligibility, freshness policies, event-driven facts or monthly storage.

```ts
import { parsePlaceMarketResponse, parsePlaceMarketSeriesResponse } from '@rei/contracts';

const root = 'http://localhost:8200/api/v1/places/sao-paulo-pinheiros/market';
const response = parsePlaceMarketResponse(await (await fetch(root)).json());
console.log(response.basis); // event-fed-median-with-prepared-sections
console.log(response.parentMedian?.place.id); // sao-paulo-oeste
console.log(response.figures.askingPriceMovement.value); // 0
console.log(response.figures.recordedSalePricePerSquareMeter.value); // null
const series = parsePlaceMarketSeriesResponse(await (await fetch(`${root}/monthly-series`)).json());
console.log(series.points.length); // 12
```

## Errors and validation

| Status | Condition                                     | `error.code`     |
| ------ | --------------------------------------------- | ---------------- |
| 400    | Invalid/overlong slug or any query key        | `bad_request`    |
| 404    | Valid unknown slug or route without `/api/v1` | `not_found`      |
| 500    | Dependency failure or malformed facade output | `internal_error` |

Errors are canonical JSON `{ error: { code, message, requestId } }`. The server generates a UUID
request identifier and returns it in `X-Request-Id`; client identifiers are replaced. Error messages
never include SQL, connection strings, stack traces or thrown dependency text. No failure returns a
successful prepared fallback. Parsers reject missing/extra fields recursively, unsafe/nonfinite
numbers, invalid dates/URLs, duplicate sources, contradictory figure states/freshness and broken
series ordering or comparison coherence.

The API reads PostgreSQL registration through the public Locations facade, its own coherent
Market facts and prepared sections through the prepared port. GETs read only: they perform no
Properties/Collection SQL, broker publication, collection, model call or external request.
Source metadata remains synthetic and no real source is enabled by this feature.

Build first, then run the focused campaigns:

```bash
pnpm run build
pnpm run test:integration:market-median
pnpm run test:integration:market
```

The median campaign uses owned PostgreSQL, RabbitMQ, S3-compatible storage, worker and API
services to verify event publication, acquisition-driven changes, replay beyond inbox retention,
restart, revision ordering, lifecycle eligibility, conflicts, cancellation and read failures.
The contracts campaign preserves all twenty scopes, prepared neighbours/series, parser/error
states, detached results and exact database snapshots before/after GETs. The full gate is
`pnpm run test:integration`; unit, lint, strict TypeScript and unchanged coverage floors also apply.
