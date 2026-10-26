# Market read API

All routes use `GET`, accept a registered place slug and reject every query parameter, including
repeated, nested and private keys. They require no authentication in this synthetic foundation.

| Route                                      | Strict parser exported by `@rei/contracts` | Payload                                      |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------- |
| `/api/v1/places/:id/market`                | `parsePlaceMarketResponse`                 | Counts, six figures and parent median        |
| `/api/v1/places/:id/market/neighbours`     | `parsePlaceMarketNeighboursResponse`       | Registered adjacent neighbourhoods           |
| `/api/v1/places/:id/market/monthly-series` | `parsePlaceMarketSeriesResponse`           | Twelve monthly medians and parent comparison |

## Common fields

| Field         | Type                                 | Meaning                                                                |
| ------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `metadata`    | `{ dataMode, fixtureVersion, asOf }` | `synthetic-stub`, `synthetic-sao-paulo-v1`, `2026-10-01T12:00:00.000Z` |
| `basis`       | string                               | Live overview, neighbours and series: `event-fed-place-figures`        |
| `evaluatedAt` | UTC ISO timestamp                    | Freshness and population assessment instant for a live response        |
| `place`       | `{ id, kind, name: { en, ptBR } }`   | Registered country, state, city, zone, neighbourhood or street block   |

## Overview fields

The live overview uses `basis: 'event-fed-place-figures'` and has no `preparedSections` or
`preparedEvaluatedAt`. `counts` contains safe integers: distinct represented in-scope active
`properties`, all their currently active member `activeListings`, and distinct source identifiers
among those listings (`sources`). Global lowest-active-asking selection precedes geography. Area
is not required for counts, so a counted property can be absent from the price sample. Counts reuse
the exact D-096 ratio/reduction populations and ratio source evidence; they do not use the prepared
catalog's group labels or the Locations `propertyCount`.

The strict parser preserves all three earlier overview variants unchanged: the original
`prepared-market-example`, the staged `event-fed-median-with-prepared-sections` with its exact
six-section list, and `event-fed-figures-with-prepared-counts` with exact `preparedSections: ['counts']`.
Both staged variants retain required `preparedEvaluatedAt` and their independently prepared count
meaning. They remain available for prepared composition and compatible clients.

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
has null value, zero record count and no sources. Numeric zero is available data: a paired unchanged
cohort has zero movement, and an active listing population without confirmed decreases has zero
reductions.
An unrecorded sale has null value, zero record count and no sources, never a monetary zero.

Each source is `{ id, label, url, collectedAt }`, with a unique slug, label, credential-free
HTTP(S) `.invalid` URL and UTC timestamp. Source evidence lists all active sources contributing
observations to the prepared sample, including listings within the same group; the representative
asking price still counts that group only once. Median, movement, days and ratio record counts
count groups in the prepared variant; reduction record counts count eligible active listings.
The event-fed median lists only selected representatives' sources, sorted by identifier. Each
label is its source identifier. Its URL and `collectedAt` come from that source's latest contributing
observation; equal observation times select the lower listing identifier.

Prepared `freshness` contains `status: 'fresh' | 'stale'`, nullable `latestCollectionCompletedAt` and
nonnegative `ageSeconds`. Age is `(evaluatedAt - computedAt) / 1000`, not wall-clock age. A figure
is stale exactly when its computation precedes the latest source completion. Completion cannot
follow evaluation; source observations cannot follow that completion. An empty figure has null
completion and fresh status. The prepared default examples have completion equal to computation;
they do not assert a collector actually ran. Old monthly examples can be fresh with positive age.

For every live figure, `computedAt` records the actual calculation start after reading one coherent
facts snapshot. Market then reads source completion watermarks and records `evaluatedAt` for the
assessment. `ageSeconds` is exactly `(evaluatedAt - computedAt) / 1000` in every state. Source
observations and completions cannot follow evaluation. Observations may follow the last completed
collection because a newer collection can still be running.

D-098 evaluates each figure's own contributing sources independently, including parent medians,
neighbours and monthly own/parent points. If there are no sources or any contributor lacks a known
completion, status is `untracked` and `latestCollectionCompletedAt` is null. Otherwise that field is
the maximum completion of those sources; status is `stale` exactly when `computedAt` precedes it,
and `fresh` otherwise (including equality). Unrelated sources never affect a figure. Empty and
unrecorded figures remain untracked. The PT/EN evidence disclosure includes explicit localized
calculation age for stale figures alongside count, sources and computation.

The worker consumes the existing strict `collection.run.completed` event. The Market-only
`source_completion` table retains only source identity and the monotonic maximum event `occurredAt`.
Upsert and inbox effects commit together; older/replayed delivery cannot regress the watermark,
including after inbox expiry. No figures, completion payload inventories or monthly snapshots are
stored, and reads never query Collection SQL. This measures known collection completion versus
calculation, rather than listing projection lag.

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

The worker subscribes to all eight public Properties event families: listing created, price-changed,
description-changed, removed and reappeared, plus property asking-price-changed, merged and split.
[ADR 0022](../../specs/adrs/0022-causal-property-price-facts.md) defines their causal v2 contract.
Listing v1 producers remain supported with assignment revision zero. Property v1 events retain
strict public parsing but are rejected into the bounded dead-letter route because they lack causal
metadata. No production merge/split emitter or live entity resolution is introduced here.

Every v2 listing carries positive safe-integer `revision` and nonnegative safe-integer
`assignmentRevision`. A v2 property payload carries complete `listingStates`, including removed
members, each containing `{ listing, revision, assignmentRevision }`. Asking-price snapshots derive
`current` from those declared states; `previous` is historical evidence. Merge/split states describe
before-membership, and every member has an assignment containing `listingId`, `fromPropertyId`,
`toPropertyId`, `fromAssignmentRevision` and consecutive `assignmentRevision`. Snapshots validate
minimum price, selected listing, place, area, provenance, ties, cardinality and member conservation.
Result identifiers may retain a predecessor identity. Removed members retain their declared
destination and contribute there when they reappear.

Market stores normalized event envelopes, immutable causal state and assignment evidence, and
independent highest state/membership frontiers. State identity excludes only property identity;
source and source-listing identity remain fixed. A late v1 listing can advance state but cannot
undo a later assignment. Event identifiers are fenced across families; listing-event and property
aggregate revisions are fenced separately. A snapshot's state reference is not another listing
event. Identical business replays are harmless, including changed trace context, after inbox expiry
and restart. Conflicting event, revision, source or causal-key content rolls back atomically.

One Market writer lock serializes evidence, membership, property minima and inbox effects in the
same transaction. Each effective property retains one selected active listing or an explicit
null tombstone. Reads retrieve those facts in one coherent Market-only statement and then apply
geography and area eligibility. The additive 2002 migration backfills all retained v1 state history,
assignment zero and property minima while preserving the original 2001 evidence unchanged.

## Suppressed listings (D-099)

Market consumes the closed `collection.listing.suppressed` and `properties.listing.suppressed`
notifications. Both paths authenticate the canonical Collection cause through its public authority
before taking the existing Market writer lock. Erasure, minimal permanent receipts, effective group
changes, survivor minima and the transport inbox commit together. The broker acknowledges only
following that commit. Delivery order does not change the result.

Suppression removes the listing's current references, all retained state and assignment evidence,
legacy listing envelopes and every causal event envelope containing its copied identity or payload.
Independently materialized survivor facts remain. Market retains stable identity/cause receipts and
JSONB-normalized SHA-256 event/state/assignment fingerprints, without price, place, source URL or
other collected payload. Exact replay is inert after inbox/publication retention and process restart;
conflicting event, aggregate revision, listing identity or causal revision still fails.

Strict validation applies to the original future envelope before an erased member is screened.
Mixed snapshots advance survivors and retain only their independent facts plus minimal envelope
fences. Suppression of an original group anchor installs an effective redirect only when its old
ID changes or ends at null. Redirect chains resolve consistently during projection, global minimum
selection and snapshot history reads. Original causal property IDs and assignment revisions remain
unchanged. Removing an ordinary member preserves its group. A null redirect ends the old association;
a later valid survivor assignment can establish another one.

Every overview/count/provenance value, registered neighbour row and own/actual-parent monthly point
is evaluated using the same documented rules without the erased listing. The next cheapest surviving
active member can become the global representative. Source completion watermarks remain monotonic
and unchanged by listing erasure. Ordinary `properties.listing.removed` remains reversible lifecycle
absence: its retained history and original observed time on market survive reappearance.

## Remaining persisted figures (D-096)

All inputs come from one coherent read of Market-owned current assignments, retained listing
states and immutable price-event envelopes. No historical assignment is inferred: current causal
membership applies to both movement samples and all retained observations.

- **Movement:** subtract six UTC calendar months from `evaluatedAt`, preserving time and clamping
  to the target month's last day. For each listing, reconstruct the highest retained revision whose
  effective time **and** observed time are at or before that inclusive cutoff. Select global active
  property representatives independently at both instants, then apply scope and nonnull area.
  Pair only properties eligible in both samples. Calculate `(current paired median / prior paired
median - 1) * 100`, using the same safe centavo rounding as the headline median. Representatives
  may differ. `recordCount` counts paired properties once; sources cover both samples. The current
  paired median can differ from the headline population. No baseline means insufficient data.
- **Time on market:** for each currently represented in-scope property, find the earliest known
  observation across all retained states of all currently assigned members, including removed
  members. Return the median nonnegative elapsed days to evaluation, including fractional days.
  Reappearance does not reset age. This is observed duration, never source publication age.
  `recordCount` counts represented properties; source evidence comes from their earliest observations.
- **Thirty-day reductions:** among all currently active member listings of those properties, count
  each listing once if a retained `properties.listing.price-changed` event confirms
  `previousMinorUnits > askingPriceMinorUnits` with effective time in
  `(evaluatedAt - 30 days, evaluatedAt]`. Percentage divides by all those active listings.
  `recordCount` is that listing denominator. Sources include current denominator observations and
  qualifying decrease observations. Real zero reductions are available; an empty denominator is not.
- **Listings/property:** divide that same active listing count by distinct represented properties.
  `recordCount` counts properties; sources cover their active listings. An empty denominator is
  insufficient data. Area is not required for duration, reductions or this ratio.
- **Recorded sale:** remains `not-recorded`, null, zero records and no sources. Removal never
  establishes a sale.

Each live source label equals its identifier. Sources are unique and sorted; their URL/time is
from the latest contributing observation for that source, with listing-ID ties. Evidence after
evaluation cannot contribute silently; malformed persisted evidence fails with sanitized 500.
No listing observation is represented as collection completion.

## Neighbours and monthly series

The neighbours payload contains `items`, each with explicit `place`, `median` and `movement`.
Only Bela Vista and Vila Mariana are registered as adjacent to each other. Pinheiros and every
other place return an empty array. Sibling geography never implies adjacency. The live
`event-fed-place-figures` variant calculates each row from that neighbour's registered descendant
scope, with a single Market snapshot and
evaluation instant shared by every row. The median follows the headline rule and movement follows
D-096's matched cohort. Known empty neighbours remain as insufficient-data rows, with live
`untracked` evidence; non-neighbourhood places retain registered empty adjacency. Prepared-only
composition still returns the original strictly validated `prepared-market-example` neighbours.

The series payload contains nullable `comparisonPlace` and exactly twelve consecutive ascending
`points`, ending in the UTC month of `evaluatedAt`. Brazil has null comparison and parent medians
throughout; other places identify their actual registered parent, including empty scopes.

The live `event-fed-place-figures` branch gives each point `month` (`YYYY-MM`), `asOf`, `median`
and nullable `parentMedian`. `asOf` is the last millisecond of a closed UTC month, including leap
February, or the response's `evaluatedAt` for the current partial month. Both medians retain the
actual calculation-start `computedAt`; their source observations must be at or before `asOf`.
D-098 freshness uses each point's independent contributor set. `asOf` is a population cutoff, never
a computation timestamp; a calculation crossing UTC month rollover still ends in evaluation's month.

D-097 reconstructs each listing's highest retained revision whose effective **and** observed times
are at or before the cutoff. Current causal membership applies. The global active-property minimum,
then geography/area and safe centavo median rule is evaluated independently for the place's and its
actual parent's descendant scopes. Every month uses its own population, not movement's paired
cohort. Removed states are ineligible; later reappearance can contribute again. Late observations
cannot leak into earlier months. Missing history gives null insufficient data, never prepared
fallback or interpolation. Reads use one Market snapshot, a calculation-start stamp and a later
evaluation instant without monthly storage.

The original `prepared-market-example` branch remains valid: November 2025–October 2026 points,
without `asOf`, each with independently prepared monthly computation/source evidence and strict
completion/freshness semantics. Its known empty blocks can retain available prepared parent values;
live parent values require their own retained eligible history.

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
console.log(response.basis); // event-fed-place-figures
console.log(response.parentMedian?.place.id); // sao-paulo-oeste
console.log(response.figures.askingPriceMovement.value); // null until a paired baseline exists
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
pnpm run test:integration:market-figures
pnpm run test:integration:market-median
pnpm run test:integration:market-price-facts
pnpm run test:integration:market
```

The figures campaign verifies manually derived live counts, independent actual-parent medians,
registered neighbour median/movement, twelve monthly own/parent medians and cutoffs, paired movement,
observed age, listing reductions and ratio
over reversed v2 membership/history, then replay, reappearance, empty scopes and read failures
through actual parsed HTTP. The median campaign uses owned PostgreSQL, RabbitMQ,
S3-compatible storage, worker and API services to verify event publication, acquisition-driven
changes, replay beyond inbox retention,
restart, revision ordering, lifecycle eligibility, conflicts, cancellation and read failures.
The price-facts campaign additionally proves populated v1 upgrade, all eight causal families,
removed-member merge/split routing, reverse-first convergence, bounded rejection and SQL rollback.
The contracts campaign preserves all twenty scopes, live neighbours and prepared series, parser/error
states, detached results and exact database snapshots before/after GETs. The full gate is
`pnpm run test:integration`; unit, lint, strict TypeScript and unchanged coverage floors also apply.
