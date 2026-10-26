# ADR 0021 — Event-fed Market median and staged read provenance

- **Status:** accepted
- **Date:** 2026-10-11
- **Accepted by:** the agent on the owner's behalf, 2026-10-11
- **Owner decision:** D-041

## Context

Story 4.2 must prove Properties listing events → Market-owned facts → a neighbourhood's median
through actual `/api/v1` HTTP. ADR 0011 prohibits reading the Properties schema. Its public listing
events contain complete state and provenance, but delivery order is not guaranteed and higher
revisions can have earlier effective dates. Inbox markers expire after thirty days (ADR 0017).
The preceding prepared overview has strict count/figure coherence and fixture completion times;
listing observations neither establish collection completion nor populate the other Market figures.

## Decision

Market consumes created, price-changed, description-changed, removed and reappeared listing
events using the existing subscriber and transaction/inbox ports. Persist normalized event
evidence and the current listing frontier in the `market` schema. Event identity and listing/revision
uniqueness provide durable replay fences beyond inbox retention. A repeated event with identical
business envelope is harmless; an identity or revision conflict rejects and rolls back, including
the inbox. Correlation context does not change business identity. Never authenticate arbitrary
price changes using the seven-day outbox or its first-publication reader.

The highest listing revision is current, irrespective of effective time or arrival. Lower revisions
remain evidence but cannot regress the frontier. Select each property's lowest active asking
price globally, using listing identifier as the tie-breaker, then filter the selected listing's place
against registered descendant IDs returned by the Locations facade. Its own area and provenance
describe that representative; a null area excludes that property instead of selecting a more
expensive listing. Round its centavos/m² with the deterministic domain rule, sort the values,
and round the middle value or the mean of the two middle values. Guard safe integer bounds and
avoid overflowing an otherwise safe even median. The record count is the eligible-property count.
Sources are only those of representatives, unique and sorted, with the source identifier as label
and actual latest contributing observation URL/time, with listing-ID tie-breaks.

Extend the closed overview contract with the additive
`event-fed-median-with-prepared-sections` basis and a required closed `preparedSections` list:
`counts`, `figures.askingPriceMovement`, `figures.medianTimeOnMarketDays`,
`figures.priceReductions`, `figures.listingsPerProperty`, and
`figures.recordedSalePricePerSquareMeter`. Required `preparedEvaluatedAt` declares their independent
fixture evaluation time. Existing field paths and units remain stable. The own
median and actual-parent median use persisted facts and current computation/evaluation time.
Their freshness is `untracked`, latest completion is null and age is zero: story 4.5 owns completion
tracking. Prepared sections retain their independently evaluated fixture evidence and strict
cross-field validation; prepared counts do not describe the event-derived median population.
The prepared response variant, neighbours and monthly series remain valid and strictly checked.

Known scopes without eligible facts return a null unavailable median, not a fixture price. Unknown
slugs retain canonical 404, and persistence failures retain sanitized 500 without fallback. GETs
are read-only. No cross-schema queries, source requests, model calls or broker publications happen
on reads. Synthetic-only operation and metadata remain explicit; no source is enabled by this ADR.

## Options considered

- Count listings or reuse the fixture's labeled groups: rejected; neither counts actual property
  IDs once.
- Read Properties SQL or replace fixture values silently: rejected by context boundaries and provenance.
- Mark observations as completed collections: rejected because those events prove different facts.
- Add a second median endpoint: rejected because the story's place overview is the required surface.
- Replace every remaining figure now: rejected; their distinct rules and acceptance belong to
  later stories.

## Consequences

The first Market migration uses its reserved 2000–2999 range and explicit SQL. Permanent normalized
evidence costs storage and must participate in listing suppression when story 4.8 is implemented;
no new personal fields or raw snapshots are retained. The narrow tracer handles listing lifecycle,
while complete merge/split assignment is still story 4.3. Clients must read the explicit prepared
section declaration until subsequent stories replace each section. The extension is additive before
published clients exist; removing prepared variants later requires an explicit compatibility decision.
Real PostgreSQL, RabbitMQ, object-storage and HTTP campaigns prove rollback, replay, ordering,
restart, propagation and isolation under ADR 0020's strict TypeScript/Vitest standard.

## D-096 amendment — remaining persisted figures

The live overview now uses the additive `event-fed-figures-with-prepared-counts` variant with exact
`preparedSections: ['counts']` and independent `preparedEvaluatedAt`. Earlier prepared and staged
variants retain their existing strict meanings. Counts, neighbours and monthly series remain
prepared; collection completion remains untracked.

One Market-only SQL snapshot supplies current causal members, retained state history and confirmed
listing price-event evidence. Current membership applies at both movement instants. Six UTC calendar
months are subtracted with month-end clamping; prior state is the highest retained revision whose
effective and observed times both precede or equal the cutoff. Pair properties eligible at both
instants after global representative selection, geography and area checks. Movement compares the
two paired medians; this cohort can differ from the headline median. No pair yields insufficient data.

Observed duration retains the earliest member observation, including removed members; reappearance
does not reset it. Reductions count distinct currently active listings with a confirmed decrease in
`(evaluatedAt - 30 days, evaluatedAt]`, divided by all active members of represented properties.
Listings/property uses the same listing population. These three figures do not require area.
Sale remains unrecorded. Each live figure reports actual contributing observations and computation
time without claiming collection completion. No projection, migration, event contract or replay
fence changes are required. The [API reference](../../docs/api/market.md) records units and provenance;
the focused `test:integration:market-figures` campaign exercises the real HTTP/worker/SQL path.

## Parent, plate counts and neighbours amendment

The persisted overview and neighbours now use the closed additive `event-fed-place-figures`
variant without prepared section/time fields. Existing overview variants and prepared neighbours
retain their original meanings. Counts reuse D-096's represented-property count, active-member
listing denominator and active-member source identifiers. They require no area, so the median
sample can be smaller. The actual parent's independently registered descendant scope controls its
median. Neighbours come exclusively from registered adjacency in its declared order, using each
neighbour's descendant scope. One retained snapshot and evaluation instant supply every row;
empty neighbours remain insufficient-data rows with live, untracked evidence. Reads remain
read-only and fail closed. Monthly series alone remains prepared on its separate endpoint.

## D-097 amendment — twelve-month persisted series

The monthly endpoint now adds the closed `event-fed-place-figures` series variant. It recomputes
exactly twelve ascending UTC months ending in the evaluation month from one Market history snapshot
and one clock value. Each point adds `asOf`: the final millisecond of a closed month, or `evaluatedAt`
for the current partial month. Computation remains actual `evaluatedAt`, independent of that cutoff.

At each cutoff select the highest listing revision with both effective and observed times at or
before it. Current causal membership applies to retained states. Reuse the global active minimum,
then geography/area, centavo rounding and selected-source evidence rule independently for own and
actual-parent descendant scopes. Every month has its own population; movement's paired cohort does
not constrain it. Sources cannot follow `asOf`; collection freshness remains untracked. Missing
history is insufficient data, with no interpolation or prepared fallback.

The original prepared series remains closed and unchanged, without `asOf`, with its own monthly
computation and strict completion/freshness rules. No storage, migrations, projection, jobs or
cross-context reads are added. Place exposes the live origin, monthly population cutoff and actual
computation evidence in both languages through its existing native disclosures.

## D-098 amendment — per-source completion and actual calculation age

Market consumes strict `collection.run.completed` envelopes through its existing broker, transaction
and inbox ports. Migration 2003 adds a Market-owned source ID / maximum `occurredAt` watermark.
Parameterized `GREATEST` upsert preserves monotonicity under reordered delivery and replay after
inbox retention. No Collection SQL, completion inventory or cached figure is required.

A read uses one facts snapshot, records calculation start, reads relevant source watermarks once,
then records evaluation. Each figure independently uses only its actual contributing sources. No
sources or any missing watermark means untracked/null completion; otherwise use their maximum,
stale iff calculation precedes it. Age is evaluation minus calculation in seconds for every state.
Future observations/completions fail closed. A running collection's observations may follow the
last completed run. Monthly calendars and `asOf` stay anchored to evaluation even across UTC month
rollover, with the calculation-start stamp supplied independently. Prepared contracts stay unchanged.

The native HTTP integration boundary deliberately observes a real worker-delivered completion
between calculation and evaluation; it does not establish stale frequency in production. The
browser's bounded stale response is an explicit UI boundary fixture, with strict parsing and recovery
to the real API. Existing native disclosures show localized age without a new UI layer.

## D-099 amendment — permanent listing erasure

Migration 2004 adds Market-only minimal suppression/cause receipts, erased identity and normalized
SHA-256 event/causal-key fences, Properties notification receipts and effective erased-anchor
redirects. Immutable evidence admits a narrow DELETE exception only for matching content, a matching
permanent owner receipt and the transaction-local erasure identity. Ordinary immutable UPDATE and
unrelated DELETE remain forbidden. No foreign SQL, new public suppression version or cache is needed.

Authenticate the canonical Collection cause on either notification path, then serialize erasure
with normal projection under `market:price-facts`. Delete references before evidence and copied
legacy/causal envelopes, retaining independently materialized survivor history and all permanent
business-conflict checks. A later strict mixed envelope screens only erased members; survivors
advance. Minimal fingerprints replace full envelopes and remain after inbox/publication expiry.

Original causal assignments remain unchanged. Effective membership resolves permanent anchor chains
in projection, minimum recomputation and one-snapshot current/history reads. Only an erased original
anchor transitioning to another ID or null creates a redirect; P-to-P member changes do not. Null
ends an old association, and later valid survivor assignments remain eligible. Recompute each figure
and all twelve own/actual-parent points without the suppressed listing under the existing rules.
Ordinary removal retains lifecycle history and original observed duration. D-098 source watermarks
and freshness rules remain independent of erasure.

## Reassessment trigger

Reassess projection and response provenance when property reassignment, remaining figures,
completion tracking or suppression lands. Never remove durable replay protection merely because
the inbox or relay history has expired.
