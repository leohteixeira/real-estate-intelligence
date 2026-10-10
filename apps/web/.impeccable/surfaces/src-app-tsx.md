---
version: 1
slug: 'src-app-tsx'
primary_target: 'src/App.tsx'
related_targets: []
---

# Surface brief — web application shell and screens

- **Scope:** the whole `@rei/web` application: places, search, property and listing detail, market,
  comparables, map, natural-language runs, alerts, operations and system states.
- **Visitor mode:** Operate.
- **Audience and job:** buyers and investors, brokers and analysts, portfolio evaluators and data
  operators, on phone and desktop with equal completeness. They come to understand a market in a
  place, not to browse listings.
- **Constraints:** bilingual (pt-BR authored and default, English second), BRL, synthetic data
  only, no photography, `/api/v1` contract only.
- **Anti-goals:** listing portal, AI chatbot, generic SaaS dashboard, trading terminal.
- **Unresolved:** who designs the sign-in entry, the signed-in state of the shell and the V2 theme
  switch. None has an artboard.

## Direction contract

THESIS: Every screen is signed by its place before it shows a number. The product refuses the
photo-card grid and the KPI-card dashboard: listings are dense rows, figures are lines with a
source.

OWN-WORLD: Brazilian enamel street plaques. Enamel-blue shell, porcelain ground, ink-navy text. A
zone strip colour belongs to each city zone and is used only for place identity. Wayfinding yellow
means "you are here" and nothing else. Barlow Condensed capitals for plates and figures, Barlow for
everything else, tabular numerals throughout.

STORY: The visitor reads where they are, reads the asking-price median with its source and date,
sees how it moved, then drills into a property or asks a question and watches a typed, auditable
run answer it.

FIRST VIEWPORT: Phone: blue top bar holding the place plate (city and state line, neighborhood in
condensed capitals, zone strip with the listing count), then the question field, then the median
asking price per square meter with provenance, then the neighborhood map and dense property rows;
five bottom tabs. Desktop: blue side rail, plate across the top, map and table side by side.

SIGNATURE: the place plate re-signs itself on every screen, from city down to a street block with
its number range. Raises: yellow reserved for one job (terminal wayfinding); duration drawn to
exact scale as listing lifelines (labanotation); fixed columns whose state restyles the row
(split-flap); finite capacity shown as counted slots (j-card); destructive actions isolated by
space (developer console).

FORM: street-plaque signage system, candidate 4 of 7 on the grounded list. Seed key 3d3cd1ae.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance
