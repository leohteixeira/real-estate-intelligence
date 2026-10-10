---
id: SPEC-real-estate-intelligence
companions:
  - architecture.md
  - ux.md
  - listing-sources.md
  - ../../../apps/web/DESIGN.md
  - ../../../specs/adrs/0003-persistence-driver-and-migrations.md
  - ../../../specs/adrs/0004-testing-strategy.md
  - ../../../specs/adrs/0005-observability-with-opentelemetry.md
  - ../../../specs/adrs/0006-frontend-toolchain.md
  - ../../../specs/adrs/0007-nestjs-and-langgraph-runtime-boundary.md
  - ../../../specs/adrs/0008-typed-query-routing-with-jev.md
  - ../../../specs/adrs/0009-ai-provider-resilience-policies.md
  - ../../../specs/adrs/0010-durable-ai-runs-and-remote-checkpoints.md
sources:
  - /workspace/docs/real-state-intelligence/real_state_intelligence.md
  - /workspace/docs/real-state-intelligence/plan.md
  - ../../../docs/design/direction.md
  - ../../../docs/design/screens.md
  - ../../../docs/design/content-and-locale.md
  - ../../../docs/design/landing.md
  - ../../../apps/web/PRODUCT.md
  - ../../../apps/web/.impeccable/surfaces/src-app-tsx.md
  - ../../../apps/web/.impeccable/surfaces/src-landing-landingpage-tsx.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete,
> preservation-validated contract for what to build, test, and validate. Source documents listed in
> frontmatter are for traceability — consult them only if you need narrative rationale or prose
> color this contract intentionally omits.

# Real Estate Intelligence

## Why

Public real-estate listings are fragmented across sources, overwrite their own history and present
one physical property as several unrelated advertisements. A buyer, investor, broker or analyst can
find a listing but cannot read a market: how asking prices behave, how long listings stay, what
changed, which properties are comparable. Real Estate Intelligence is the vision of answering that
with a normalized, historical, queryable base and a market-intelligence layer in which every figure
is deterministic, dated and traceable to its source, and a language model routes and explains but
never computes. It is also a portfolio product: an evaluator must see within minutes that the
modelling, the provenance and the AI boundary are real, so the differentiator is the quality of the
model built on the data, not the number of listings collected. The repository is in its foundation
phase (four applications, four packages, one deterministic rule), which makes contracts, boundaries
and the experience cheap to fix now.

## Capabilities

Capabilities are grouped by phase. Identifiers are stable, so a later addition (CAP-28 onwards)
sits in the group it belongs to. `architecture.md` maps each one to where it lives; `ux.md` maps
the screens to them.

### MVP: data foundation

- **CAP-1**
  - **intent:** The system collects listings from each permitted source on a schedule, within that
    source's terms of use, access policy, rate limits and licensing.
  - **success:** A collection run over the synthetic dataset and over each enabled source is
    idempotent (a rerun or a redelivery adds no duplicate listing), resumes from its checkpoint
    after a restart, backs off when the source rate-limits it, shuts down gracefully and records
    what it collected, changed and failed. A source cannot be enabled until the source register
    holds a review of its terms of use, robots policy and licence that allows automated collection.
- **CAP-2**
  - **intent:** Collected content is stored as a raw snapshot before it is parsed, so data can be
    reprocessed and audited without collecting again.
  - **success:** Every normalized listing value traces to a stored snapshot or, once that expired,
    to its hash, and re-parsing stored snapshots (for example after a parser fix) updates the
    normalized data without one request to the source. A snapshot of a real source is stored
    sanitized, encrypted at rest and deleted 30 days after collection: a fixture payload holding a
    contact name, a phone number, an e-mail address and a CPF number is stored without them.
- **CAP-3**
  - **intent:** Parsed listings are normalized into distinct `Property` and `Listing` records with
    canonical attributes and a structured location.
  - **success:** A listing holds property type, asking price, area, bedrooms, bathrooms, parking
    spaces and features in canonical form where the source gives them, and a location on the
    hierarchy country, state, city, zone, neighborhood, street block, with coordinates where
    available; each value carries its source, source URL and collection time. A real listing stores
    only the allowlisted fields of `architecture.md`: the same fixture yields a listing with no
    name, contact or photograph of a natural person and with phone numbers, e-mail addresses, CPF
    numbers and links masked in its description.
- **CAP-4**
  - **intent:** The system decides which listings advertise the same physical property and can
    show why.
  - **success:** Each match stores its probability and the evidence per reason (for example
    coordinates, area, bedrooms, description, images); fixture listings of one property resolve to
    one `Property` holding several `Listing` records. A match at 0.90 or above merges, one from
    0.50 up to 0.90 stays separate and awaits review, and one below 0.50 stays separate without
    review.
- **CAP-5**
  - **intent:** A change to a listing is recorded as an event, so the evolution of a listing and of
    its price can be reconstructed.
  - **success:** Replaying a fixture in which a listing is created, repriced, re-described, removed
    and seen again yields `ListingCreated`, `ListingPriceChanged`, `ListingDescriptionChanged`,
    `ListingRemoved` and `ListingReappeared` in order, with dates and previous values, and no
    earlier value is lost.
- **CAP-28**
  - **intent:** A person can read what the product collects and why, and can have a listing removed
    and kept out.
  - **success:** A public privacy notice in Brazilian Portuguese and English states what is
    collected, from which sources, for what purpose, on what legal basis and for how long, the
    rights of the data subject and the contact e-mail. A removal request deletes the stored data
    and snapshots of the listing and adds it to a suppression list, and a later collection run over
    a fixture that contains it does not restore it.

### MVP: market reading

- **CAP-6**
  - **intent:** A user can search the properties of a place with filters and order the result.
  - **success:** Each filter and ordering listed in `ux.md` narrows or orders a fixture dataset as
    expected; a result row is a property with its listings grouped inside; the result reports its
    count and its own median asking price per m².
- **CAP-7**
  - **intent:** A user can open a property and read its asking price, whether a sale is recorded,
    how the asking price moved and how its listings behaved over time.
  - **success:** For a fixture property with three listings the response gives the current asking
    price, which is the lowest among the active listings, with provenance pointing to that listing,
    an explicit statement that no sale is recorded, each price change with date and percentage, the
    time each listing spent on the market including removals, per-attribute agreement across
    listings, and the match probability with its evidence.
- **CAP-8**
  - **intent:** A user can trace any value of a listing to where and when it was collected.
  - **success:** A listing exposes its source, source URL, first-seen and last-collected times,
    collection run, raw snapshot (its hash once the snapshot expired), the date since which each
    value holds and its full event list.
- **CAP-9**
  - **intent:** A user can read deterministic market figures for a place, each with its provenance.
  - **success:** For a place the backend returns the median asking price per m² with its movement,
    the median time on market, the price reductions in 30 days, the listings per property and
    whether any sale price is recorded, each equal to the documented rule applied to the fixture
    dataset with every property counted once at its asking price, and each with record count,
    sources and computation time; a stale figure states its age.

### First natural-language increment

- **CAP-10**
  - **intent:** A user can ask in Portuguese or English for the price per square meter of a price
    and an area and get the computed value with an explanation.
  - **success:** A clear request completes with the value returned by the `pricePerSquareMeter`
    domain rule (R$ 785,000 over 68 m² gives R$ 11,544.12/m²), with price and area extracted and
    validated by code and an explanation that states only results a tool returned in that run.
- **CAP-11**
  - **intent:** Each request is routed by a typed, auditable intent decision over a closed
    taxonomy, and an uncertain decision waits for the user.
  - **success:** A decision records intent, probability, decider identifier and version,
    degradation flag, and latency and cost when available. At 0.85 or above the run proceeds;
    below it the run enters `awaiting_confirmation` with nothing computed, and explicit
    confirmation resumes the proposed intent without a second decision call. With the decision
    model unavailable a deterministic heuristic decides, marked degraded, under the same gate.
- **CAP-12**
  - **intent:** A request recognized as an intent that has no deterministic capability yet is
    answered as unavailable, never improvised.
  - **success:** Requests decided as `listing_search`, `property_history`, `region_statistics`,
    `comparables` or `unsupported` end with a typed result that names the intent and holds no
    model-generated answer.
- **CAP-13**
  - **intent:** A run survives restarts and redelivery, and the runs of one thread execute in
    order.
  - **success:** Restarting the API, the worker or the AI service mid-run loses no state; a
    redelivered command creates neither a second logical run nor a second tool effect; a paused run
    resumes on the same thread id; runs of a thread execute serially while other threads proceed; a
    thread holds at most three pending runs and a queued run expires after two minutes.
- **CAP-14**
  - **intent:** A client can create, inspect, confirm and cancel a run and follow it to its end
    over a resumable event stream.
  - **success:** A headless web client creates a run with an idempotency key, follows versioned
    Server-Sent Events through `queued`, `running` and `awaiting_confirmation` to `completed`,
    `failed`, `cancelled` or `expired`, resumes the stream after a disconnect without losing
    events and always receives an explicit terminal event.
- **CAP-15**
  - **intent:** A failing AI provider degrades or fails a run explicitly, within bounded time and
    cost, without weakening privacy.
  - **success:** The failure matrix of `architecture.md` passes offline with fake clocks and fake
    HTTP servers.
- **CAP-16**
  - **intent:** A public-demo visitor can use natural-language runs within stated quotas, and only
    the holder of a thread can reach it.
  - **success:** History, confirmation, cancellation and the event stream of a thread are refused
    without that thread's opaque capability. A visitor's 21st question in a calendar day
    (America/Sao_Paulo) and any run beyond the global daily cap are rejected before they are
    accepted, and the response says when the quota reopens.
- **CAP-17**
  - **intent:** The probabilistic parts are measured against versioned datasets before they are
    trusted.
  - **success:** `pnpm test` runs the evaluation pack of `architecture.md` offline with fakes and
    local datasets; a live probe runs only when explicitly enabled with `AI_GATEWAY_API_KEY` and
    reports accuracy, latency and cost without storing the key or sensitive text.
- **CAP-18**
  - **intent:** An operator can follow a run end to end and see what each step decided and cost.
  - **success:** One trace context links the HTTP request, the AMQP publish and consume, the run,
    each graph node, the decision, the tool call and the generative call, carrying the attributes
    listed in `architecture.md` and no prompt, full response, key, credential or connection
    string.

### MVP: web experience

- **CAP-19**
  - **intent:** A user can read a market and follow a run in a place-first web application on a
    phone and on a desktop, in Brazilian Portuguese or English.
  - **success:** Every MVP screen and every system state of `ux.md` exists at 390 px and from
    960 px up in the light theme, meets WCAG 2.2 level AA, opens with its place plate, shows each
    figure with its provenance line and each price with its `Asking` or `Sale` tag, switches locale
    with locale-formatted numbers and takes every value from `/api/v1`. V2 and protected screens
    join under the same rules as their capabilities land.
- **CAP-20**
  - **intent:** A visitor can learn from a public landing page what the product answers for each of
    its four audiences.
  - **success:** The page walks five stops (city, zone, neighborhood, street block, collectors),
    defaults to Brazilian Portuguese with a switch to English, stays readable without WebGL and
    with reduced motion, marks every figure as synthetic and offers the demo link only when
    `VITE_DEMO_URL` is set. The page is already built; `ux.md` lists what is left before it ships.

### V2

- **CAP-21**
  - **intent:** A user can compare a property with comparable properties selected by stated,
    adjustable criteria.
  - **success:** The comparable set is reproducible from its criteria alone (distance, property
    type, area, bedrooms, bathrooms, parking spaces, features, listing period); the result states
    the criteria, the candidates considered, the matches, the median asking price per m² of the set
    and the subject's deviation from it; changing a criterion changes the set deterministically.
- **CAP-22**
  - **intent:** A user can read how the market of a city, zone or neighborhood is moving.
  - **success:** For 30-day, 6-month and 12-month windows the backend returns, per place, the
    movement of the median asking price per m², the change in active listings, the median time on
    market, the share of listings with a reduction, recurring reductions, new listings and the
    distribution by asking-price band, and ranks the neighborhoods that moved most, each equal to
    the documented rule applied to the fixture series.
- **CAP-24**
  - **intent:** A user can explore the properties and prices of a place on a map.
  - **success:** The map shows the same filtered properties as the list as markers and offers a
    price-per-m²-per-block layer; selecting a marker shows that property's row and opens the
    property; no marker locates a unit.
- **CAP-25**
  - **intent:** A user can ask natural-language questions that search listings, read a property's
    history, read region statistics and find comparables.
  - **success:** `listing_search`, `property_history`, `region_statistics` and `comparables` each
    become executable only when their typed deterministic backend capability exists, one intent at
    a time, each with its evaluation dataset, returning tool results the model only explains.
- **CAP-29**
  - **intent:** A user can read every screen in a dark theme.
  - **success:** Every screen renders from a second, dark token set defined in
    `apps/web/DESIGN.md` and `tokens.css`, under the same screen rules and at WCAG 2.2 level AA.
- **CAP-30**
  - **intent:** A user can see the attributes a model read from the description of a listing, told
    apart from measured ones.
  - **success:** Each interpreted attribute is stored with its prompt version and its source
    sentence and is shown tagged "Interpreted, not measured"; the extraction ships with a versioned
    evaluation dataset.
- **CAP-31**
  - **intent:** The system matches listings of one property that rules alone miss, and still shows
    why.
  - **success:** Description similarity from embeddings and model-interpreted attributes appear as
    further reasons of the same match score, measured against a labelled evaluation dataset; a
    merge is still decided by the deterministic thresholds, never by a model.

### Protected operations, after authentication

These require an authenticated, authorized user. They are built ready for that boundary and stay
unexposed until authentication and authorization run.

- **CAP-23**
  - **intent:** A user can set rules on a place or on followed properties and be alerted when one
    fires.
  - **success:** After a collection run over a fixture that triggers each kind (price decreased,
    new listing matches criteria, property below estimated market value, listing returned to
    market) exactly the expected alerts appear in the inbox, each produced by a fixed rule, stating
    the values that triggered it and linking to the property. Rules and followed items belong to an
    authenticated user.
- **CAP-26**
  - **intent:** A data operator can see how sources, collection runs, the pipeline and the AI
    providers are doing and act on them.
  - **success:** With a fixture holding one degraded source the operator sees the source, run,
    pipeline and AI-provider figures listed in `ux.md`, can stop a run and open its errors, and
    reprocessing the failed snapshots triggers no collection.
- **CAP-27**
  - **intent:** A data operator can decide uncertain matches with the evidence in front of them.
  - **success:** A match from 0.50 up to 0.90 stays separate until someone decides; the operator
    sees the probability, the evidence and both listings side by side, then merges, keeps them
    separate or skips; the decision is written to the audit log and can be undone, and both
    listings keep their full history either way.

## Constraints

### Domain truth

- `Property` and `Listing` are distinct entities; a listing is never assumed to be a distinct
  property.
- History is first-class: a change is recorded as an event and never overwrites the earlier value.
  A removal request under CAP-28 is the only deletion.
- An asking price is never presented, averaged or styled as a sale price; when no source reports a
  transaction the product says that no sale is recorded.
- A removed listing is never treated as sold: time on market measures listed time, and no figure or
  text speaks of a sale unless a source records the transaction.
- A property's asking price is the lowest among its active listings, and place metrics count each
  property once at that price.
- Entity resolution and comparables are explainable: a match carries its probability and evidence,
  comparables come from stated criteria, and no model selects either. The merge and review
  thresholds (0.90 and 0.50) are versioned configuration, recalibrated against the labelled
  synthetic dataset.
- Every important value carries its provenance (source, source URL, collection time), and collected
  content is stored before it is parsed.
- Place organizes the product: location is structured as country, state, city, zone, neighborhood
  and street block, with coordinates; analyses accept geographic filters; a property is located to
  its street block and number range, never to a unit. The MVP covers the city of São Paulo.
- BRL is the only currency and nothing converts currency implicitly.

### Privacy and sources

- No personal data of a natural person is stored. A real listing keeps only the allowlisted fields
  of `architecture.md`; names, contacts, individual CRECI numbers and photographs are never stored,
  and a description is stored only after phone numbers, e-mail addresses, CPF numbers and links are
  masked.
- A raw snapshot of a real source is sanitized before it is stored, encrypted at rest and deleted
  after 30 days.
- The owner, a natural person, is the controller as a small-size processing agent, on the legal
  basis of legitimate interest. Before the first real collection a public privacy notice, a removal
  routine with a suppression list, a record of processing operations, a legitimate-interest
  assessment and a source register exist.
- A source is enabled only after its terms of use, robots policy and licence are reviewed and allow
  automated collection, with the review date in the source register. `listing-sources.md` holds the
  candidates and the outcome of each review.
- Collectors honour each source's terms of use, robots and access policies, rate limits, API
  policies and licensing, and never work around a login wall, a CAPTCHA, a block or a rate limit.
- The synthetic dataset stays live as a labelled source beside any real one.

### Determinism and AI

- Metrics, price calculations, geospatial filters, comparables and scores are deterministic backend
  code; a model may route a request, interpret listing text or explain a result, and asserts only
  what a tool returned in that run.
- In the MVP no model takes part in ingestion: entity resolution is rule-based and listing
  attributes come from the structured fields of the source.
- The AI service receives no database, broker or object-storage credential and no dependency on
  `@rei/infrastructure`; it reaches the domain only through allowlisted typed tools and never
  composes a URL, SQL or operation name.
- The 0.85 confidence gate binds the decision model and its heuristic fallback alike; an unavailable
  decision model never turns an ambiguous request into execution.
- External AI adapters make one attempt under central resilience policies. Every route that
  receives user text requires verified Zero Data Retention, fails closed and never falls back to a
  less private route; until the direct provider integration proves it, the primary model is called
  through the gateway.
- Probabilistic behaviour ships with versioned prompts, evidence, execution metadata and an offline
  evaluation dataset; default tests and CI use fakes and no network.

### Architecture and operations

- Modular monolith with inward dependencies (`@rei/api` and `@rei/worker` → `@rei/application` →
  `@rei/domain`); vendor SDKs stay in infrastructure adapters and AI SDKs in adapters inside
  `@rei/ai`; no vendor type crosses a port or a public contract; model roles (decision, language,
  embedding, reranker) are swappable behind ports.
- The frontend reaches the backend only through the versioned `/api/v1` contract and computes no
  business value; it only formats numbers and dates for the locale.
- The product separates a public surface from protected operations. Operations, entity-resolution
  review, alert rules and followed places or properties require authentication and authorization,
  are built ready for that boundary and stay unexposed until it runs.
- Cloud-agnostic and container-first: every component runs in containers on a Linux VPS, started by
  `docker compose up`; a managed service is an option, never a requirement. PostgreSQL is the
  primary database, with PostGIS, `pgvector` and S3-compatible storage only where a capability
  needs them. The MVP uses no third-party map tiles and no PostGIS; both are decided by ADR with
  the V2 Map screen.
- RabbitMQ is the only broker, for natural-language runs and for collection and parsing jobs, and
  API and worker own it; Valkey stays optional with no consumer. PostgreSQL is the source of truth
  for threads, runs and checkpoints, persisted by the API behind a typed internal saver contract.
- Collectors and workers are idempotent, bounded in concurrency, checkpointed, rate-limit aware,
  retried with backoff, dead-lettered when needed and shut down gracefully.
- OpenTelemetry instruments requests, jobs, collectors, tool calls and model usage; prompts, full
  responses, keys, credentials and connection strings never reach a log, span or metric.
- Inputs are validated, secrets stay out of the code, public use is quota-limited before a run is
  accepted, and relevant operations are audit-logged.
- Accepted ADRs under `specs/adrs/` are normative over `architecture.md`; a material framework,
  persistence, telemetry or toolchain decision needs a new ADR before code. `architecture.md` lists
  the ADRs that decisions of this spec still owe.

### Experience

- Place first: every screen opens with its place plate, no figure appears without its provenance
  line, every price is tagged `Asking` or `Sale`, a row is a property, and model-written text is
  labelled as such beside the figure it explains.
- The interface must not read as a listing portal, an AI chatbot, a generic SaaS dashboard or a
  trading terminal.
- Bilingual: Brazilian Portuguese is authored first and is the default locale, English is the
  second, and phone and desktop are equally complete. Everything else in the repository is written
  in English.
- The interface meets WCAG 2.2 level AA.
- The MVP ships the light theme only; the dark theme is CAP-29.
- Demonstration data is synthetic and labelled `Synthetic data`; the product uses no photography.

### Process

- No increment is implemented in one pass: each is sliced, specified, implemented and validated
  separately, and each story ends in observable behaviour with tests proportional to its risk.
- BMad artifacts live under `_bmad-output/`, and `specs/` holds the ADRs.
- The instruction files are corrected before the first code story: `/workspace/CLAUDE.md` and the
  repository `AGENTS.md` and `CLAUDE.md` still name NestJS 11 and Mastra, `/workspace/CLAUDE.md`
  still places product specifications under `specs/`, and the workspace port table lacks RabbitMQ
  on 5672 and 15672.

## Non-goals

- A listing portal or aggregator: no photo-card browsing and no race for collected volume.
- A chatbot: a question is a run with a record, never a free conversation or an improvised answer.
- Any number, comparable selection or market calculation produced by a language model.
- Inferring or asserting a transaction price from an asking price, or a sale from a removed
  listing.
- Forecasting: a market reading is a signal from asking-price data.
- A city or region other than São Paulo in the MVP.
- Storing personal data or photographs of advertisers, owners or brokers.
- Collecting from a source whose terms forbid it, or working around an access control.
- An interim access mechanism for protected operations before authentication: no operator token,
  configuration switch or browser-held ownership.
- V3, outside this spec: image analysis, opportunity scoring, advanced maps, trend forecasting,
  multiple regions, recurring agent searches and multi-user authentication integrated with
  Keycloak.
- In the first natural-language increment: the visual Ask screens (its client is headless),
  execution of the four other intents, currency conversion, LangSmith as an operational requirement
  and providers beyond the defined primary and secondary roles.
- A mandatory dependency on AWS, Azure, GCP or any managed service.

## Success signal

- On a `docker compose up` stack loaded with synthetic São Paulo, a visitor opens a neighborhood,
  reads its median asking price per m² with count, sources and computation time, opens a property
  whose three listings were resolved into one with visible evidence and a reconstructed price
  history, and never sees an asking price shown as a sale.
- The visitor then asks in Portuguese for a price per square meter: the run streams to a terminal
  event, pauses for confirmation below 0.85, survives a restart of the API, the worker and the AI
  service and returns the domain rule's value with an explanation labelled as model-written, while
  the AI service holds no database, broker or storage credential.
- A collection run over one real source whose review allows it ends with listings whose snapshots
  and normalized fields hold no name, contact or photograph of a natural person, while the public
  privacy notice names that source and a removed listing stays out of the next run.

## Assumptions

- The first natural-language increment still ships a headless web client that proves the HTTP and
  SSE contract; the Placa Ask screens are built on that contract as part of the MVP web experience.
  The Placa design is the later design flow that the brief and the plan deferred to.
- Stories are ordered by dependency, not by a preferred phase: the data foundation before market
  reading, a screen after the capability it shows, the natural-language increment independently.
- The owner's "everything this weekend" is read as the MVP (CAP-1 to CAP-20 and CAP-28); V2 and
  the protected operations stay later. The date is a delivery target, not part of this contract.
- The brief's MVP "basic dashboard" is the Place overview screen; the design rejects a KPI-card
  dashboard.
- The place hierarchy is the brief's (country, state, city, neighborhood, coordinates) extended by
  the design with zone and street block.
- Alerts are delivered to the in-app inbox only; no email or push channel is specified.
- Sanitizing and the 30-day expiry apply to snapshots of real sources; snapshots of the synthetic
  dataset hold no personal data and are kept.
- The privacy rules are an engineering reading of the LGPD (articles 7, 10, 18 and 37) and of ANPD
  resolution CD/ANPD 2/2022 on small-size processing agents; no legal review has confirmed them.
- Values printed in artboards are synthetic illustrations, not decisions: comparables within 800 m
  and 15% of area, collector request rates, retry counts. Binding values are the ones the plan, the
  ADRs and the owner fixed: 0.85, three pending runs, two minutes, 30 days, eight turns, 16,000
  characters, 1,000 tokens, 20 questions a day, the 0.90 and 0.50 match thresholds and the 30-day
  snapshot expiry.
- The versions and conventions pinned by ADRs 0003 to 0006 are inherited through the adopted ADRs
  and not restated.

## Open Questions

- When does authentication land? The brief keeps Keycloak in V3, and alerts, Operations and Review
  wait for it.
- No portal passed the source review of 9 October 2026: three forbid automated collection and five
  could not be verified. Of the open data only GeoSampa states a licence; the ITBI transactions and
  the Caixa property list state none (`listing-sources.md`). Does the owner seek written
  authorization or confirmation, and from whom first?
- Entity resolution lists overlapping images as evidence, and photographs are never stored. May a
  real source keep an image fingerprint (a hash, not the photograph), or does image evidence apply
  to the synthetic dataset only?
- May the Listing screen show the full description of a real listing and compare its versions, or
  only state that it changed and link to the source? Listing text may be protected and the terms of
  a source may restrict republication.
- The open data found is not listing data, except the Caixa list: GeoSampa holds cadastral records
  and block geometry, ITBI holds transaction values. How does each enter a model built on
  `Property` and `Listing`, does an ITBI transaction feed the `Sale` price, and what does the
  share-alike clause of CC BY-SA 4.0 require of figures derived from GeoSampa?
- How is the V2 dark theme selected: system preference, a switch, or both?
- The privacy notice has no artboard. Where does it sit in the navigation, and who designs it?
