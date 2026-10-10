# UX: Real Estate Intelligence

> Companion to `spec-real-estate-intelligence.md`, derived by `bmad-spec` from the design documents
> under `docs/design/`, the canvas artboards and the owner's decisions. Tokens, component
> specifications and the visual do and don't lists live in `apps/web/DESIGN.md` and are not repeated
> here.

## References

| What                                            | Where                                               |
| ----------------------------------------------- | --------------------------------------------------- |
| Tokens, components and visual rules, normative  | `apps/web/DESIGN.md`                                |
| The same tokens and component styles as CSS     | `apps/web/src/styles/tokens.css`, `components.css`  |
| Artboards, one file per screen                  | `docs/design/canvas/project/*.dc.html`              |
| Navigable canvas, private artifact              | <https://claude.ai/artifact/CYjuAEiT65NN2Pg76rKUDp> |
| Landing page production build, private artifact | <https://claude.ai/artifact/9Ps2b3vLy4qUAUECNPKcyD> |

A token changes in `DESIGN.md` and in `tokens.css` together.

## Audiences

No audience outranks another, and each gets a complete experience on phone and desktop.

| Audience                     | Comes to                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Individual buyer or investor | Judge a property or a neighborhood: is it expensive against similar ones, how did its price move |
| Broker or market analyst     | Consult the market daily: comparables, neighborhood trends, time on market, reductions, alerts   |
| Portfolio evaluator          | See within minutes that the modelling, the provenance and the AI boundary are real               |
| Data operator                | Run the platform: sources, collectors, collection runs, parsing failures, the review queue       |

They come to understand a market in a place, not to browse listings.

## Direction: Placa

Every screen is signed by its place before it shows a number. The world is the enamel street plaque
of Brazilian cities, and it lends four things only; layout, navigation and controls stay standard.

- **Type:** Barlow Condensed capitals for place names and figures, Barlow for the rest.
- **Palette:** an enamel-blue shell, a porcelain ground, one strip colour per city zone, and
  wayfinding yellow for "you are here".
- **Density:** rows and tables rather than cards; tabular numerals.
- **Signature move:** the place plate, heading every screen from the city down to a street block
  and its number range.

The use scene is a phone in daylight and a monitor at a desk, so the ground is light.

| Refused reading        | What the interface does instead                                            |
| ---------------------- | -------------------------------------------------------------------------- |
| Listing portal         | A row is a property, dense and without a photograph                        |
| AI chatbot             | A question produces a run record: decision, tool call, result              |
| Generic SaaS dashboard | Figures are lines with a source and a date, set in bands, not KPI cards    |
| Trading terminal       | Light ground, no monospace data, no jargon; movement is never green or red |

Known risk: institutional blue reads as a bank or a city hall when the plate lettering is timid.
The plate name is therefore large, condensed and uppercase, and the zone strip keeps a second
colour on every screen.

## Navigation

Place is the spine. Every screen is scoped to a place in the hierarchy country, state, city, zone,
neighborhood, street block, and says so in its plate. The crumbs above the plate climb that
hierarchy and are links. The language switch sits in the shell on every screen.

| Destination | Phone             | Desktop                 | Contains                                         |
| ----------- | ----------------- | ----------------------- | ------------------------------------------------ |
| Places      | Tab 1             | Rail                    | Place overview, map                              |
| Search      | Tab 2             | Rail                    | Results, filters, property, listing, comparables |
| Ask         | Tab 3             | Rail                    | Natural-language runs and the thread             |
| Market      | Tab 4             | Rail                    | City and zone trends, neighborhood ranking       |
| Alerts      | Bell in the shell | Rail                    | Inbox and rules                                  |
| Operations  | Tab 5, "More"     | Rail group "Operations" | Sources, collection runs, review queue           |

Places, Search, Ask and Market are public. Alerts and Operations belong to the protected surface:
they appear only for an authenticated, authorized user and stay out of the navigation until
authentication runs, which is the first increment after the MVP. The privacy notice is public: a
"Privacy" link sits in the footer of the landing page and of the application shell. On desktop
that is the foot of the rail, beside the language switch; the phone shell draws no footer, so the
story adds one at the end of the page.

## Screens

Phone artboards are 390 px wide; desktop artboards are 1440 px and fluid. Every MVP screen is part
of CAP-19. V2 screens ship with the capability they serve and protected screens once authentication
runs, under the same rules.

| Screen                     | Phase         | Artboards                                         | Capabilities                           |
| -------------------------- | ------------- | ------------------------------------------------- | -------------------------------------- |
| Place overview             | MVP           | `Main.dc.html`, `DesktopPlace.dc.html`            | CAP-9                                  |
| Place overview, English    | MVP           | `PlaceEN.dc.html`                                 | CAP-19                                 |
| Search results             | MVP           | `Search.dc.html`, `DesktopPlace.dc.html`          | CAP-6                                  |
| Filters                    | MVP           | `Filters.dc.html`                                 | CAP-6                                  |
| Property                   | MVP           | `Property.dc.html`, `DesktopProperty.dc.html`     | CAP-4, CAP-5, CAP-7                    |
| Listing and provenance     | MVP           | `Listing.dc.html`                                 | CAP-2, CAP-5, CAP-8                    |
| Ask, completed run         | MVP           | `Ask.dc.html`, `DesktopAsk.dc.html`               | CAP-10, CAP-11, CAP-12, CAP-14, CAP-18 |
| Ask, awaiting confirmation | MVP           | `AskConfirm.dc.html`, `DesktopAsk.dc.html`        | CAP-11, CAP-13, CAP-16                 |
| System states              | All           | `States.dc.html`                                  | CAP-19                                 |
| Privacy notice             | MVP           | None: built from the components                   | CAP-28                                 |
| Comparables                | V2            | `Comparables.dc.html`, `DesktopProperty.dc.html`  | CAP-21                                 |
| Market                     | V2            | `Market.dc.html`, `DesktopMarket.dc.html`         | CAP-22                                 |
| Map                        | V2            | `Map.dc.html`                                     | CAP-24                                 |
| Sign-in entry              | After the MVP | None yet                                          | CAP-32                                 |
| Alerts                     | Protected     | `Alerts.dc.html`                                  | CAP-23                                 |
| Operations                 | Protected     | `Operations.dc.html`, `DesktopOperations.dc.html` | CAP-26                                 |
| Entity resolution review   | Protected     | `Review.dc.html`, `DesktopOperations.dc.html`     | CAP-27                                 |
| Landing page               | Built         | `LandingDesktop.dc.html`, `LandingMobile.dc.html` | CAP-20                                 |
| Design system              | n/a           | `Foundations.dc.html`, `Components.dc.html`       | All                                    |

On desktop the rail replaces the tab bar, the plate moves into the blue header and bands become
panels. Screens without a desktop artboard (filters, listing, alerts, review) follow the same rule.

### Place overview

- Must show: plate, question field, median asking price with provenance, map, largest reductions.
- The map is schematic in the MVP, as in the artboards: no third-party tiles and no PostGIS.
- The plate strip carries the property and listing counts of the place.
- The question field is scoped to the place and states that the backend computes every figure and
  the model only routes and explains.
- Figures: median asking price per m² with its movement and the parent place's median, median time
  on market, price reductions in 30 days, listings per property, and recorded sale prices, which
  read "None available" when no source reports one. A property counts once, at its asking price.
- A recorded sale figure is a place aggregate of transaction records, tagged `Sale` (CAP-33, V2):
  it needs a minimum of transactions and never belongs to one property.
- Largest reductions are property rows and lead to all properties of the place.
- The artboard also draws the asking price per m² over 12 months.
- Desktop: the result table sits beside the map, with a table of neighbouring places.

### Search results

- Must show: applied filters, sort, median of the result set, property rows.
- Applied filters are chips; the count reads as matches out of the place total.
- Orderings: furthest below the median, lowest price per m², longest on the market, most recent.
- The median of the result set stands against the neighborhood median.
- A row holds type, bedrooms and area; the street block; asking price and price per m²; deviation
  from the median; listing count; days on the market or "Returned to market".
- List and map views; more rows load 20 at a time.

### Filters

- Must show: place, type, price, price per m², area, rooms, time on market, history.
- The place is chosen along the hierarchy; filters apply inside it, and the place is changed to
  widen the search.
- Property type: apartment, house, studio, commercial, land.
- Ranges with minimum and maximum: asking price, asking price per m², area.
- Minimums: bedrooms from 1 to 4, bathrooms from 1 to 3, parking spaces 1 or 2.
- Time on market: up to 30 days, 31 to 90, more than 90, more than 180.
- Listing history: price reduced, returned to market, more than one listing.
- "Clear all"; the primary button states how many properties it will show.

### Property

- Must show: asking price, absence of a sale price, price history, listing lifelines, match
  evidence.
- Summary: type, bedrooms, bathrooms, parking spaces and area, located to the street block.
- Current asking price, the lowest among the active listings, with price per m², deviation from
  the neighborhood median and its provenance: which listing, which source, when collected.
- The sale price block reads "No recorded sale" and says why.
- Asking-price history lists each change with date and percentage, back to the first listing.
- Lifelines: one bar per listing on a shared month axis. Length is time on market, a tick is a
  price change, a dashed stretch is a removal from the source.
- "Why they are one property": the probability and one evidence bar per reason. Images in common
  counts matching fingerprints; no photograph is stored or shown.
- Features state how many listings agree and which source differs, or that no source reports it.
- Actions: compare with similar properties, create an alert, ask about the property. Creating an
  alert belongs to the protected surface.
- Desktop: one page that adds the comparables table, first-seen and last-collected times and the
  stored raw snapshots.

### Listing and provenance

- Must show: source, collection run, raw snapshot, values with dates, events.
- Position among the property's listings and the listing status.
- Asking price in this listing, and price per m² with its formula, computed by
  `pricePerSquareMeter` in the backend.
- Provenance: source, source URL, first seen, last collected, collection run, raw snapshot stored
  before parsing, number of snapshots kept.
- Each value shows the date since which it holds.
- Events are listed by type with the previous value.
- For a real source the stored snapshot is sanitized, expires after 30 days and leaves its hash.
- The description follows its source. Where the source register allows showing the text, the
  screen shows it masked (phone numbers, e-mail addresses, CPF numbers and links) and compares its
  versions; elsewhere it states that the description changed and when, and links to the source.
  The synthetic dataset shows its text.
- Amenities read from the description, tagged "Interpreted, not measured", arrive in V2 with
  CAP-30. In the MVP the screen shows only the structured attributes of the source.

### Ask, completed run

- Must show: deterministic result, labelled explanation, run steps, available intents.
- The field accepts English or Portuguese and shows run slots in use out of three and the demo
  questions left today, out of 20 per visitor per calendar day in America/Sao_Paulo.
- The record holds status, time and duration; the question; the figure with the exact result, its
  formula and its deterministic provenance; and the explanation note.
- Steps: queued; intent decided, with the probability on the gate and the decider; inputs
  validated by code; tool called through `/api/v1`; explanation generated, with model, fallback use
  and token counts; completed with the terminal event. A link opens the trace.
- "What can be asked today" lists each intent as available or recognized but not yet executed.
- Earlier runs of the thread appear with their states; a thread is kept for 30 days.
- Desktop: the thread and the pending confirmation sit beside the run record, each step shows its
  actor and duration, and a summary shows retries, fallback, circuit breaker and Zero Data
  Retention.

### Ask, awaiting confirmation

- Must show: degraded notice, proposed intent, confidence gate, editable inputs.
- The proposed intent is put as a question, the probability is printed beside the gate, and the
  text states that nothing was computed.
- Extracted inputs (asking price, area) can be edited before confirming.
- Actions: confirm, rephrase, and cancel the run, the last isolated from the others.
- The place in the run is saved; the user can leave and come back.
- The steps show the pause and what is still pending.

### Comparables

- Must show: median, position of the property, the criteria used, comparable rows.
- States that only asking prices are compared.
- Criteria are listed with their values and can be adjusted; the screen states how many candidates
  were in range and how many met every criterion.
- Rows add the distance to the subject property.
- A labelled model-written explanation sits under the figures.

### Market

- Must show: city figures, zones, neighborhoods moving most, price bands.
- Window: 30 days, 6 months or 12 months.
- Figures, each with its movement: median asking price per m², active listings, median time on
  market, listings with a reduction, new listings in 30 days.
- A reading of the signals is stated as asking-price signals, not a forecast, and never reads a
  removed listing as a sale. Both artboards headline it "Menos anúncios, por menos tempo".
- Zones appear on a map and in a table; neighborhoods sort by movement; listings are distributed by
  asking-price band.
- Desktop: the neighborhood table adds zone, listings, days listed and share with a reduction.

### Map

- Must show: markers, layer switch, selected property in a sheet.
- Layers: properties, and price per m² per block.
- The block layer draws the fiscal blocks of GeoSampa and states their attribution and licence
  (CC BY-SA 4.0) on the map.
- The sheet holds the property row and leads to the property or back to the list.

### Alerts

- Must show: the four alert kinds and the rules.
- Protected: rules and followed items belong to an authenticated user.
- The inbox separates new from earlier alerts; each states the values that triggered it, the place
  and the time.
- A below-market alert states the comparables median it was measured against and that the estimate
  comes from asking prices.
- Rules are set per place or over followed properties, each switchable, with a way to create one.
- States that alerts are evaluated after each collection run, by fixed rules.

### Operations

- Must show: source health, collection runs, pipeline counts, AI providers.
- Protected: only an authenticated, authorized operator opens it.
- Sources: status, listings, last run, errors, rate limit, access policy, the date the terms were
  reviewed, and whether images may be fetched and listing text shown. The synthetic dataset
  appears as a static source.
- Collection runs: queued or scheduled, running with page progress and saved checkpoint, completed,
  completed with errors, and retrying with attempt count and next attempt. A run can be stopped
  and its errors opened.
- Pipeline today: raw snapshots stored, parsed, events recorded, matches awaiting review.
- AI providers: decision model, primary model and secondary model, with circuit state and Zero
  Data Retention verification.
- A degraded source says what failed and what kept its old value, and offers reprocessing from the
  stored snapshots.
- Desktop: adds the review queue as a table with block, listings, probability and weakest evidence.

### Entity resolution review

- Must show: probability, evidence, side-by-side values, merge or keep separate.
- States that the match is too uncertain to merge automatically and stays separate until decided.
- The queue holds matches from 0.50 up to 0.90. A match at 0.90 or more merges without review and
  one below 0.50 stays separate without entering the queue.
- Protected: only an authenticated, authorized operator decides.
- Names the fields in which the two listings differ.
- Actions: merge, keep separate, skip. The decision is audit-logged and can be undone, and both
  listings keep their full history.

### Privacy notice

- Must show: what is collected, from which sources, the purpose, the legal basis, the retention,
  the rights of the data subject, how to ask for a removal, the controller and the contact e-mail.
- A public document page in Brazilian Portuguese and English, linked as "Privacy" from the footer
  of the landing page and of the application shell.
- No artboard: the story builds it from the existing components, under `apps/web/DESIGN.md`.
- Sources are listed with their licence and attribution; GeoSampa is credited here once its data
  is used.
- The controller's name and the contact e-mail are supplied by configuration, as the demo address
  is; the repository holds neither.
- It sits outside the place hierarchy and carries no place plate.

## System states

| State                      | Where            | Behaviour                                                                                        |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| Loading                    | Any place screen | The plate renders first; figures and rows are skeletons                                          |
| No results                 | Search           | Names the filter that removed the last results and offers three ways out                         |
| Could not load             | Any              | Says what failed, keeps filters and place, offers a retry, shows the request id for support      |
| Stale figures              | Place, market    | States the age of the data and the failing source, links to collection status                    |
| Queued                     | Ask              | Position in the thread and time until expiry; the run can be cancelled                           |
| Thread full                | Ask              | Three slots filled; asks the user to wait or cancel one                                          |
| Awaiting confirmation      | Ask              | The run pauses below the 0.85 gate; nothing is computed; inputs are editable                     |
| Degraded                   | Ask, operations  | A rule-based classifier decides; the same gate applies                                           |
| Recognized, not available  | Ask              | The intent is named with its probability; no answer is written; a manual route is offered        |
| Quota used                 | Ask              | The field is disabled and says when it reopens; search, filters, maps and comparables still work |
| Failed, expired, cancelled | Ask              | One sentence each, with a retry where it makes sense                                             |
| Source degraded            | Operations       | Parse failures, what kept its old value, reprocessing from snapshots                             |

The three ways out of an empty result are relaxing the named filter, widening the place and
creating an alert for the filters, the last only once alerts are available to the user. Run states
shown to the user map to the public states `queued`, `running`, `awaiting_confirmation`,
`completed`, `failed`, `cancelled` and `expired`.

The link from stale figures to collection status leads into the protected surface, so only an
authorized operator sees it.

## Rules every screen follows

1. The plate comes first.
2. A figure is never shown without its provenance line.
3. A price is tagged `Asking` or `Sale`.
4. A row is a property; its listings are grouped inside it.
5. Text written by a model is labelled as such and sits beside the figure it explains.
6. A property is located to its street block and number range, never to a unit.

The privacy notice is the one exception to rule 1.

## Accessibility and theme

- The interface meets WCAG 2.2 level AA; it is an acceptance criterion of every screen and state.
- The tokens of `apps/web/DESIGN.md` have not been checked against AA contrast yet.
- The MVP ships the light theme only. A dark theme arrives in V2 (CAP-29) as a second token set;
  `DESIGN.md` forbids a dark ground today, so its owner revises that rule first.
- The theme follows the system preference until the user picks one with a switch in the shell,
  beside the language switch; the choice is remembered in the browser.
- Already required by the design: a movement never relies on colour alone, and the landing page
  honours reduced motion.

## Voice and terminology

Plain, specific and factual. The interface states what a number is, where it came from and what it
does not mean. It never sells, never hedges and never speaks in the first person.

- A button names its action: "Show 212 properties", "Reprocess 212 snapshots", "Cancel this run".
- An error names the problem and the way out: "Below the lowest in Pinheiros, R$ 9,870. Enter 9,870
  or more."
- An empty state explains why it is empty and offers a next step.
- A limit is stated before it is reached: slots in use, questions left today.

| Term               | Meaning in the interface                                              | Never call it          |
| ------------------ | --------------------------------------------------------------------- | ---------------------- |
| Property           | One physical property; a row in every list                            | Listing, ad            |
| Listing            | One advertisement of a property on one source                         | Property               |
| Asking price       | The price on a listing                                                | Price, value, sold for |
| Sale price         | A recorded transaction price; absent unless a source reports it       | Asking price           |
| Time on market     | Days from first seen to today, or to removal                          | Age                    |
| Returned to market | A listing that was removed and seen again                             | New listing            |
| Removed            | A listing no longer found at its source; it says nothing about a sale | Sold                   |
| Comparable         | A property selected by the stated criteria                            | Similar, recommended   |
| Run                | One execution of a natural-language question                          | Chat, message          |
| Waiting for you    | The public state `awaiting_confirmation`                              | Pending, paused        |
| Degraded mode      | The rule-based classifier is deciding                                 | Offline, fallback      |
| Explanation        | Text a model wrote about a computed figure                            | Answer, insight        |
| Synthetic data     | Fixture data; shown with a dashed tag                                 | Sample, demo           |

## Languages and formats

Screens are authored in Brazilian Portuguese, the primary and default locale. English is the second
locale, reached through the switch in the shell. Only the copy a user reads is written in
Portuguese first; code, identifiers, comments and documentation stay in English.

| English                    | Brazilian Portuguese           |
| -------------------------- | ------------------------------ |
| Places                     | Lugares                        |
| Search                     | Buscar                         |
| Ask                        | Perguntar                      |
| Market                     | Mercado                        |
| More                       | Mais                           |
| Asking                     | Pedido                         |
| Sale                       | Venda                          |
| Property / properties      | Imóvel / imóveis               |
| Listing / listings         | Anúncio / anúncios             |
| Median asking price per m² | Mediana do preço pedido por m² |
| Time on market             | Tempo de anúncio               |
| Synthetic data             | Dados sintéticos               |

- Place names, street names and source names are never translated.
- Labels may wrap to two lines. No label is truncated with an ellipsis.
- The plate name wraps and stays balanced; it is never shrunk to fit.
- Tab labels are single words in both languages.

| Kind         | English             | Brazilian Portuguese |
| ------------ | ------------------- | -------------------- |
| Money        | `R$ 785,000`        | `R$ 785.000`         |
| Price per m² | `R$ 11,544/m²`      | `R$ 11.544/m²`       |
| Exact result | `R$ 11,544.12/m²`   | `R$ 11.544,12/m²`    |
| Percentage   | `+3.1%`, `−0.8%`    | `+3,1%`, `−0,8%`     |
| Date         | `9 Oct 2026, 06:00` | `9 out. 2026, 06:00` |
| Probability  | `0.91`              | `0,91`               |
| Number range | `1200 – 1298`       | `1200 – 1298`        |

- The currency is always BRL. No conversion is implied in either locale.
- A negative value uses the minus sign `−`, not a hyphen.
- A movement carries its sign or a word ("7.5% below median"); colour alone never carries it.
- Aggregates round to whole reais; a single computed result keeps two decimals.
- Formatting belongs to the frontend through `Intl.NumberFormat` and `Intl.DateTimeFormat`. The
  values come from the backend.

## Landing page

The Persuade surface of the same world: it explains the product to each audience by walking down a
city drawn as price relief. One WebGL scene (three.js) stays pinned behind the first part of the
page while five stops scroll over it, and the camera follows the scroll position.

| Stop         | Scene                                                        | Audience             | Proof shown                                      |
| ------------ | ------------------------------------------------------------ | -------------------- | ------------------------------------------------ |
| City         | Whole city; block height is the median asking price per m²   | Everyone             | Headline, offer, primary action, legend          |
| Zone         | Blocks take their zone colour                                | Brokers and analysts | Zone median with sample, sources and date        |
| Neighborhood | Camera descends; the rest of the city dims                   | Buyers and investors | One asking price against the neighborhood median |
| Street block | The selected block splits into three slabs                   | Portfolio evaluators | Three listings resolved as one property          |
| Collectors   | Relief flattens into a plan; pulses travel along the avenues | Data operators       | Last collection run, counted                     |

After the descent the page turns light for two reading sections, a natural-language run shown as a
record and the four rules the product keeps, and closes on an enamel band with the action and the
state of the project. The plate stands on the selected block and re-signs itself at each stop.
Wayfinding yellow marks that block and the current stop, and nothing else.

Behaviour:

- **Language.** Brazilian Portuguese by default, with an in-page switch to English, remembered in
  the browser when storage is available.
- **Primary action.** "Open the demo" links to `VITE_DEMO_URL`. While it is empty the page states
  that the demo is not published and offers the tour; it never links to a demo that does not exist.
  `VITE_REPOSITORY_URL` adds a source-code link. Both accept only `http` and `https` addresses.
- **No WebGL.** A flat street grid replaces the scene and every word stays readable.
- **Reduced motion.** The camera stops swaying and jumps to each position instead of easing.
- **Phone.** The copy of each stop is a sheet that slides over the scene; the stop list shows the
  current stop only.
- **Data.** Every figure is a fixed synthetic illustration marked "Synthetic data". The browser
  formats numbers for the locale and calculates nothing.

Source: `apps/web/src/landing/` holds `LandingPage.tsx` (structure, language switch, scroll
progress), `CityScene.ts` (the scene, framework-free, its own chunk), `cityLayout.ts` (the tested
deterministic synthetic city), `copy.ts` (both locales and number formatting) and `landing.css`.

## Build status

- `apps/web` renders the landing page only. No application screen is built and `components.css` is
  not imported yet.
- Landing: lint, type checking, unit tests and the production build pass; layout, both languages
  and the no-WebGL fallback were reviewed on 1440 px and 390 px screenshots. The WebGL scene has
  never been seen rendered, so lighting, motion and performance are unverified.
- Artboards: authored in Brazilian Portuguese, with one screen in English. Each was rendered once
  to measure its height and six were looked at; none was reviewed on the canvas, and the finish
  review of the design workflow was not run.
- Every property, price, statistic and source in the artboards and the landing page is synthetic.
- The privacy notice (CAP-28) has no artboard, by decision. The sign-in entry, the signed-in state
  of the shell and the theme switch have none yet.
- `docs/design/canvas/` is excluded from Prettier because the artboard format is
  whitespace-sensitive.

Before anything ships: review the WebGL scene in a real browser, self-host Barlow and Barlow
Condensed (they load from Google Fonts today), set the public demo address and the repository
visibility, and link the privacy notice from the landing footer, which is one line of text today.

## Open design decisions

Carried as Open Questions in the spec: who designs the sign-in entry, the signed-in state of the
shell and the V2 theme switch, which have no artboard.

Decided since the first derive: São Paulo as the MVP city, a schematic MVP map with the tile
provider left to a V2 ADR, the 0.90 and 0.50 match thresholds, WCAG 2.2 level AA, a dark theme in
V2 that follows the system preference with a switch, authentication as the first increment after
the MVP, the privacy notice as a footer link without an artboard, listing text shown per source
and image evidence from fingerprints.
