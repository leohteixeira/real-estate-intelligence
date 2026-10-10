# Screens and navigation

## Navigation model

Place is the spine. Every screen is scoped to a place in the hierarchy country, state, city, zone,
neighborhood, street block, and says so in its plate. The crumbs above the plate climb that
hierarchy.

| Destination | Phone             | Desktop                 | Contains                                         |
| ----------- | ----------------- | ----------------------- | ------------------------------------------------ |
| Places      | Tab 1             | Rail                    | Place overview, map                              |
| Search      | Tab 2             | Rail                    | Results, filters, property, listing, comparables |
| Ask         | Tab 3             | Rail                    | Natural-language runs and the thread             |
| Market      | Tab 4             | Rail                    | City and zone trends, neighborhood ranking       |
| Alerts      | Bell in the shell | Rail                    | Inbox and rules                                  |
| Operations  | Tab 5, "More"     | Rail group "Operations" | Sources, collection runs, review queue           |

The language switch sits in the shell on every screen.

## Screen inventory

Artboard file names are relative to `canvas/project/`.

### Phone, 390 px

| Artboard              | Screen                     | Phase | What it must show                                                                       |
| --------------------- | -------------------------- | ----- | --------------------------------------------------------------------------------------- |
| `Main.dc.html`        | Place overview             | MVP   | Plate, question field, median asking price with provenance, map, largest reductions     |
| `Search.dc.html`      | Search results             | MVP   | Applied filters, sort, median of the result set, property rows                          |
| `Filters.dc.html`     | Filters                    | MVP   | Place, type, price, price per m², area, rooms, time on market, history                  |
| `Property.dc.html`    | Property                   | MVP   | Asking price, absence of a sale price, price history, listing lifelines, match evidence |
| `Listing.dc.html`     | Listing and provenance     | MVP   | Source, collection run, raw snapshot, values with dates, events                         |
| `Comparables.dc.html` | Comparables                | V2    | Median, position of the property, the criteria used, comparable rows                    |
| `Market.dc.html`      | Market                     | V2    | City figures, zones, neighborhoods moving most, price bands                             |
| `Map.dc.html`         | Map                        | V2    | Markers, layer switch, selected property in a sheet                                     |
| `Ask.dc.html`         | Ask, completed run         | MVP   | Deterministic result, labelled explanation, run steps, available intents                |
| `AskConfirm.dc.html`  | Ask, awaiting confirmation | MVP   | Degraded notice, proposed intent, confidence gate, editable inputs                      |
| `Alerts.dc.html`      | Alerts                     | V2    | The four alert kinds and the rules                                                      |
| `Operations.dc.html`  | Operations                 | Ops   | Source health, collection runs, pipeline counts, AI providers                           |
| `Review.dc.html`      | Entity resolution review   | Ops   | Probability, evidence, side-by-side values, merge or keep separate                      |
| `PlaceEN.dc.html`     | Place overview, English    | MVP   | The same screen in English, the second locale, with English number formats              |
| `States.dc.html`      | System states              | All   | See below                                                                               |

### Desktop, 1440 px, fluid

| Artboard                    | Screen         | Notes                                                           |
| --------------------------- | -------------- | --------------------------------------------------------------- |
| `DesktopPlace.dc.html`      | Place overview | Search results are a table beside the map                       |
| `DesktopProperty.dc.html`   | Property       | Price, history, lifelines, evidence and comparables on one page |
| `DesktopMarket.dc.html`     | Market         | Zone map and table beside the neighborhood table                |
| `DesktopAsk.dc.html`        | Ask            | Thread and pending confirmation beside the run record           |
| `DesktopOperations.dc.html` | Operations     | Sources, runs and review queue as tables                        |

Screens without a desktop artboard (filters, listing, alerts, review) follow the same rules: the
rail replaces the tab bar, the plate moves into the blue header, and bands become panels.

### Design system

| Artboard              | Content                                              |
| --------------------- | ---------------------------------------------------- |
| `Foundations.dc.html` | The plate at four scales, colour, type, space, shape |
| `Components.dc.html`  | Every component with its states                      |

## System states

| State                      | Where            | Behaviour                                                                |
| -------------------------- | ---------------- | ------------------------------------------------------------------------ |
| Loading                    | Any place screen | The plate renders first; figures and rows are skeletons                  |
| No results                 | Search           | Names the filter that removed the last results and offers three ways out |
| Could not load             | Any              | Says what failed, keeps filters and place, offers a retry                |
| Stale figures              | Place, market    | States the age of the data and links to collection status                |
| Queued                     | Ask              | Position in the thread and time until expiry                             |
| Thread full                | Ask              | Three slots filled; asks the user to wait or cancel one                  |
| Awaiting confirmation      | Ask              | The run pauses below the 0.85 gate; inputs are editable                  |
| Degraded                   | Ask, operations  | A rule-based classifier decides; the same gate applies                   |
| Recognized, not available  | Ask              | The intent is named; no answer is written; a manual route is offered     |
| Quota used                 | Ask              | The field is disabled and says when it reopens; search still works       |
| Failed, expired, cancelled | Ask              | One sentence each, with a retry where it makes sense                     |
| Source degraded            | Operations       | Parse failures, what kept its old value, reprocessing from snapshots     |

Run states shown to the user map to the public states in ADR 0010: `queued`, `running`,
`awaiting_confirmation`, `completed`, `failed`, `cancelled` and `expired`.

## Rules that every screen follows

1. The plate comes first.
2. A figure is never shown without its provenance line.
3. A price is tagged `Asking` or `Sale`.
4. A row is a property; its listings are grouped inside it.
5. Text written by a model is labelled as such and sits beside the figure it explains.
6. A property is located to its street block and number range, never to a unit.
