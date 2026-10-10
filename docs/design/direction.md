# Design direction

Recorded on 2026-10-09. The direction was chosen with the product owner through the
`impeccable-v2` workflow: a product interview, a seeded roll of candidate directions and a decision
page.

## Interview answers

| Question                                | Answer                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| Primary user                            | All four: buyer or investor, broker or analyst, evaluator, operator  |
| Use scene                               | A complete experience on both phone and desktop                      |
| Scope                                   | Complete: MVP, V2, operations and system states                      |
| Interface language                      | Bilingual; pt-BR primary since 2026-10-09 (first answer: English)    |
| What would make a polished result wrong | Listing portal, AI chatbot, generic SaaS dashboard, trading terminal |
| The truth most visible on every screen  | The place                                                            |

## Grounded candidates

Seven systems from the audience's own world, ordered by resonance before the roll:

1. Municipal cadastral and zoning maps.
2. The property registry record, a numbered chain of annotations.
3. The printed street guide with grid references and zone tabs.
4. Enamel street plaques.
5. Topographic survey contours.
6. Architectural floor plans with dimension lines.
7. Newspaper classified advertisements.

The category default, a photo-card listing portal, and its opposite, a dark data terminal, were
kept off the list.

## The roll

Seed key `3d3cd1ae`, mode Operate. The roll assigned candidate 4, the street plaque, and dealt six
challengers from the Impeccable catalog. The roll exists so that the top-ranked candidate, which
every run would produce, is not chosen by default.

| Challenger                   | Verdict     | What the direction kept                                      |
| ---------------------------- | ----------- | ------------------------------------------------------------ |
| Airport terminal wayfinding  | Competitive | One colour reserved for one job: yellow means "you are here" |
| Event catalog and hall map   | Competitive | Nothing; offered as a full alternative                       |
| Rail split-flap board        | Declined    | Fixed columns; a state change restyles the row               |
| Labanotation dance score     | Declined    | Duration drawn as exact length: the listing lifelines        |
| Cassette J-card              | Declined    | Finite capacity always visible: the run slots                |
| Dark-first developer console | Declined    | Destructive actions isolated by space                        |

The decision page also showed the top-ranked candidate, the cadastral map, and the category
standard. The owner chose the assigned direction with no steer.

## The chosen direction: Placa

Every screen is signed by its place before it shows a number.

In Operate mode a visual world may lend only four things: type, palette, density and one signature
move. Layout, navigation and controls stay standard.

- **Type:** Barlow Condensed capitals for place names and figures, Barlow for the rest.
- **Palette:** an enamel-blue shell, porcelain ground, a strip colour per city zone, and wayfinding
  yellow for "you are here".
- **Density:** rows and tables rather than cards; tabular numerals.
- **Signature move:** the place plate, which heads every screen from city down to a street block
  and its number range.

The use scene is a phone in daylight and a monitor at a desk, so the ground is light.

## Known risk

Institutional blue can read as a bank or a city hall when the plate lettering is set timidly. The
plate name is therefore large, condensed and uppercase, and the zone strip keeps a second colour on
every screen.

## Process notes

- No image generation was available, so the build was code-led: no comp was produced.
- The catalog roll required one approved network call to `impeccable.style`. Nothing else left the
  machine.
- The finish review and the mechanical render inspection that the workflow prescribes were not
  run, because the artboards render only inside the canvas artifact.
