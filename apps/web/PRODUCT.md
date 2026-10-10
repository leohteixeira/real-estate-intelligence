# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Confirmed with the product owner on 2026-10-09: the interface serves all four audiences, with a
complete experience on both mobile and desktop. No single audience outranks the others.

- **Individual buyer or investor.** Evaluating a property or a neighborhood: is this listing
  expensive against similar ones, how has its price moved, where are the opportunities.
- **Broker or market analyst.** Consults the market daily: comparables, neighborhood trends,
  time on market, price reductions, alerts.
- **Portfolio evaluator.** A recruiter or engineer exploring the public demo, who must see within
  minutes that the modelling, provenance and AI boundary are real.
- **Data operator.** Runs the platform: sources, collectors, collection runs, parsing failures and
  the entity-resolution review queue.

## Product Purpose

Real Estate Intelligence turns fragmented public real-estate listings into a normalized, historical
and queryable base, then builds a market-intelligence layer on top of it. It is explicitly not a
listing aggregator. Success means a user understands a market, not merely finds a listing: price
behaviour, time on market, listing changes, regional trends, comparable properties and potential
opportunities.

## Positioning

Every figure is deterministic, dated and traceable to its source. `Property` and `Listing` are
distinct entities, history is never overwritten, entity resolution shows its evidence, comparables
use known criteria, and an asking price is never presented as a transaction price. Language models
route and explain; they never produce a number.

## Operating Context

- Geography organizes the product. The owner named place as the truth that must be most visible
  on every screen: country, state, city, neighborhood, coordinates.
- Traditional search filters: region, price range, price per square meter, area, bedrooms,
  bathrooms, parking spaces, property type and time on market.
- Natural-language queries run as durable runs with the public states `queued`, `running`,
  `awaiting_confirmation`, `completed`, `failed`, `cancelled` and `expired`, followed over
  resumable Server-Sent Events.
- An intent decision below a `0.85` probability pauses the run for clarification or explicit
  confirmation. A heuristic fallback marks the decision as degraded and uses the same gate.
- The intent taxonomy is `price_per_square_meter`, `listing_search`, `property_history`,
  `region_statistics`, `comparables` and `unsupported`. Only `price_per_square_meter` is executable
  in the first increment; the others return a typed unavailable result.
- A thread allows three pending runs, a queued run expires after two minutes, and the public demo
  enforces quotas.
- The frontend reaches the backend only through the versioned `/api/v1` HTTP contract.

## Capabilities and Constraints

- Scope of the design, confirmed as complete: MVP (search, property and listing detail with price
  history, simple regional metrics, basic dashboard, natural-language query), V2 (auditable
  comparables, market analytics and trends, alerts, map, entity-resolution evidence), operations
  (sources, collectors, collection runs, review queue, provenance and raw snapshots) and system
  states (empty, loading, error, degraded, unavailable intent, exhausted quota, expired and
  cancelled runs).
- Most of that scope is not implemented. The repository is in its foundation phase: one
  deterministic rule, `pricePerSquareMeter`, and no entities, collectors or business endpoints.
- Listing history events: `ListingCreated`, `ListingPriceChanged`, `ListingDescriptionChanged`,
  `ListingRemoved`, `ListingReappeared`.
- Alert kinds: price decreased, new listing matches criteria, property below estimated market
  value, listing returned to market.
- Business rules, metrics, geospatial calculations, comparables and scoring stay in the backend.
- BRL is the default currency. There is no implicit currency conversion.
- Frontend toolchain per ADR 0016: React 19, Vite 8, TypeScript 6.0.3; no Tailwind, no router and no
  data-fetching library in the current phase.
- Development uses synthetic datasets or explicitly permitted sources. A real source is enabled
  only after its terms of use, robots policy and licence are reviewed and allow automated
  collection; the synthetic dataset stays live, labelled, beside any real one.
- Decided by the product owner on 2026-10-09: the MVP covers the city of São Paulo; its map is
  schematic, with no third-party tiles, and the tile provider is chosen by ADR with the V2 map.
- Alerts, operations and the entity-resolution review require an authenticated, authorized user.
  They are built ready for that boundary and stay unexposed until authentication runs; there is no
  interim access mechanism.
- Decided by the product owner on 2026-10-10: authentication, delegated to Keycloak, is the first
  increment after the MVP and ahead of V2. Operations and the review open with it; alerts follow
  when they are built.
- Decided on the same date: image evidence compares fingerprints and no photograph is stored or
  shown; the description of a real listing is shown only where its source allows; the privacy
  notice is a public text page linked from the footer of the landing page and of the shell.

## Brand Commitments

- Name: Real Estate Intelligence. No logo, palette or typeface existed before this design.
- Bilingual from the design, Brazilian Portuguese first: screens are authored in pt-BR, which is
  the default locale, and English is the second locale behind the language switch. Decided by
  the product owner on 2026-10-09, replacing the earlier English-first authoring.
- The result must not read as a listing portal, an AI chatbot, a generic SaaS dashboard or a
  financial trading terminal.

## Evidence on Hand

- Product document: `/workspace/docs/real-state-intelligence/real_state_intelligence.md`.
- AI orchestration plan: `/workspace/docs/real-state-intelligence/plan.md`.
- Architecture decisions: `specs/adrs/0001` to `0010`.
- There is no real listing data, no photography, no customers and no benchmarks. Any property,
  price, neighborhood statistic or source shown in a design is synthetic and must be labelled so.

## Product Principles

1. Place first. Every screen states where it is in the geographic hierarchy.
2. Show the evidence. A figure appears with its source, its collection date and its method.
3. History is never flattened. Change over time is shown, not summarized away.
4. Asking is not selling. A listing price is always named as an asking price.
5. The model explains, the backend computes. The interface makes that boundary visible.

## Accessibility & Inclusion

The interface meets WCAG 2.2 level AA, decided by the product owner on 2026-10-09 as an acceptance
criterion of every screen and state. The tokens of `DESIGN.md` have not been checked against AA
contrast yet. The MVP ships the light theme only; a dark theme arrives in V2 and follows the system
preference until the user picks one with a switch in the shell. Brazilian Portuguese is the primary
locale and English is fully supported.
