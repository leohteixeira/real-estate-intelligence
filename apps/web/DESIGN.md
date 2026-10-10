---
name: Real Estate Intelligence
description: Placa, a place-first design system drawn from Brazilian enamel street plaques.
colors:
  enamel-900: '#08214f'
  enamel-800: '#0b2c6b'
  enamel-700: '#0f3a8a'
  enamel-600: '#1a4fb3'
  enamel-200: '#c5d5f0'
  enamel-100: '#e1e9f7'
  enamel-50: '#f0f4fb'
  porcelain: '#f4f6f9'
  surface: '#ffffff'
  ink: '#101b33'
  ink-2: '#3d4a66'
  ink-3: '#5a6781'
  line: '#d5dbe6'
  line-strong: '#9aa6bb'
  here: '#f2b705'
  here-ink: '#3a2c00'
  zone-centro: '#c8402a'
  zone-oeste: '#1c8257'
  zone-sul: '#7446bd'
  zone-norte: '#b85a06'
  zone-leste: '#0b7f99'
  up: '#a8480a'
  down: '#1a4fb3'
  ok: '#17734b'
  ok-bg: '#e3f3ea'
  warn: '#7a5200'
  warn-bg: '#fcefc9'
  danger: '#a52a1a'
  danger-bg: '#fbe6e2'
  warn-ink: '#4a3200'
  danger-ink: '#6d1a10'
  ok-ink: '#0e4a30'
  map-ground: '#e9edf3'
typography:
  plate:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"
    fontSize: '2.25rem'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '0.015em'
  figure:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"
    fontSize: '3rem'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '0.005em'
  display:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"
    fontSize: '5.5rem'
    fontWeight: 600
    lineHeight: 0.94
    letterSpacing: '-0.005em'
  heading:
    fontFamily: "'Barlow', system-ui, sans-serif"
    fontSize: '1.375rem'
    fontWeight: 600
    lineHeight: 1.2
  section:
    fontFamily: "'Barlow', system-ui, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Barlow', system-ui, sans-serif"
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.45
  small:
    fontFamily: "'Barlow', system-ui, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.45
  provenance:
    fontFamily: "'Barlow', system-ui, sans-serif"
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: 1.5
  tag:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1
    letterSpacing: '0.05em'
  code:
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.45
rounded:
  xs: '2px'
  sm: '4px'
  md: '6px'
  plate: '10px'
  sheet: '14px'
  pill: '999px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '10': '40px'
  '14': '56px'
components:
  plate:
    backgroundColor: '{colors.enamel-700}'
    textColor: '{colors.surface}'
    typography: '{typography.plate}'
    rounded: '{rounded.plate}'
    padding: '4px'
  shell:
    backgroundColor: '{colors.enamel-800}'
    textColor: '{colors.surface}'
    padding: '12px 16px 16px'
  button:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '44px'
  button-hover:
    backgroundColor: '{colors.enamel-50}'
  button-primary:
    backgroundColor: '{colors.enamel-600}'
    textColor: '{colors.surface}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '44px'
  button-primary-hover:
    backgroundColor: '{colors.enamel-700}'
  button-primary-active:
    backgroundColor: '{colors.enamel-800}'
  button-danger:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.danger}'
    rounded: '{rounded.md}'
    height: '44px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '0 12px'
    height: '44px'
  chip:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '0 12px'
    height: '36px'
  chip-selected:
    backgroundColor: '{colors.enamel-100}'
    textColor: '{colors.enamel-800}'
  tab-current:
    backgroundColor: '{colors.here}'
    textColor: '{colors.here-ink}'
    rounded: '{rounded.pill}'
  tag:
    textColor: '{colors.ink-2}'
    typography: '{typography.tag}'
    rounded: '{rounded.sm}'
    padding: '0 6px'
    height: '20px'
  tag-sale:
    backgroundColor: '{colors.ok}'
    textColor: '{colors.surface}'
---

# Design System: Real Estate Intelligence

## Overview

**Creative North Star: "The Street Plaque".**

Every screen is signed by its place before it shows a number. The system borrows four things from
the enamel street plaques of Brazilian cities and nothing else: their blue, their condensed
capitals, their density, and the plate itself. Navigation, controls and layout are the standard
ones of a working web application.

The product is a market-intelligence tool, so the interface is dense, tabular and calm. Listings
are rows, not photo cards. Figures are lines with a source and a date, not tiles. A natural-language
question produces a run record with its decision, its tool call and its result, not a chat bubble.
The owner rejected four readings outright: a listing portal, an AI chatbot, a generic SaaS
dashboard and a trading terminal.

The use scene is mixed: a phone in daylight on the street and a monitor at a desk. That forces a
light ground with high-contrast ink and a saturated blue shell. A dark theme is not defined.

**Key Characteristics:**

- A place plate heads every screen, from city down to a street block and its number range.
- Enamel blue owns the shell: the top bar on a phone, the side rail and header on a desktop.
- Wayfinding yellow has one meaning, "you are here".
- Each city zone owns a strip colour, used only to identify the place.
- Every number is tabular; every figure carries its provenance.
- Asking prices and sale prices are tagged and never share a style.

## Colors

A saturated blue shell over cool porcelain neutrals, with colour assigned by job rather than by
decoration.

### Primary

- **Enamel 800** (`#0b2c6b`): the shell. Top bar, side rail, desktop page header.
- **Enamel 700** (`#0f3a8a`): the plate itself, one step lighter than the shell behind it.
- **Enamel 600** (`#1a4fb3`): primary buttons, links, data lines and bars, focus ring.
- **Enamel 100** (`#e1e9f7`) and **Enamel 50** (`#f0f4fb`): selected and hovered rows, selected
  chips, informational notes.

### Secondary

- **Wayfinding Yellow** (`#f2b705`, with **Here Ink** `#3a2c00` on top): the current tab, the
  selected row, the selected map marker, the subject property among its comparables, text selection.

### Tertiary

- **Zone strips**: Centro `#c8402a`, Oeste `#1c8257`, Sul `#7446bd`, Norte `#b85a06`, Leste
  `#0b7f99`. Each passes 4.5:1 under white text. They appear on the plate strip, the zone square in
  tables, map fills and zone series.
- **Movement**: Up `#a8480a`, Down `#1a4fb3`.
- **State**: OK `#17734b`, Waiting `#7a5200`, Failed `#a52a1a`, each with a tinted background.

### Neutral

- **Porcelain** (`#f4f6f9`): the page ground.
- **Surface** (`#ffffff`): bands, panels, sheets, rows.
- **Ink** (`#101b33`), **Ink 2** (`#3d4a66`), **Ink 3** (`#5a6781`): text, secondary text, inactive
  navigation and placeholders.
- **Line** (`#d5dbe6`) and **Line Strong** (`#9aa6bb`): hairlines and control borders.

### Named Rules

**The One Job Rule.** Yellow means "you are here". It is never a warning, a highlight, a badge or
a decoration.

**The Zone Rule.** A zone colour identifies a place. It never encodes a value, a state or a trend.

**The Neutral Movement Rule.** A price moving up or down is not good or bad. Movement is orange and
blue and always carries a sign or a word; green and red are reserved for state.

**The Two Prices Rule.** An asking price carries the outlined `Asking` tag. A recorded sale price
carries the solid green `Sale` tag. When no sale exists the interface says so in words.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, system-ui)
**Body Font:** Barlow (with system-ui)
**Label/Mono Font:** the platform monospace, for code identifiers only

**Character:** One design in two widths, descended from road and plate lettering. The condensed cut
carries place names and figures; the regular cut carries everything a person reads or presses.

### Hierarchy

- **Plate** (600, 2.25rem phone, 3rem desktop, line-height 1, uppercase, 0.015em): the place name
  on a plate. A street-block plate uses 1.75rem.
- **Figure** (600, 3rem, line-height 1): the leading number of a figure. Secondary figures use
  1.75rem; table figures use 1.125rem.
- **Heading** (600, 1.375rem, 1.2): a question put to the user, an empty-state heading.
- **Section** (600, 1.125rem, 1.2): section headings.
- **Body** (400, 0.9375rem, 1.45): default text. Prose holds to 65 to 75 characters.
- **Small** (400, 0.8125rem, 1.45): row secondaries, table headers, field labels at weight 600.
- **Provenance** (400, 0.75rem, 1.5): the source line under a figure.
- **Tag** (600, 0.8125rem, 0.05em, uppercase, condensed): `Asking`, `Sale`, `Synthetic data`.

Sizes are fixed rem steps, not fluid. The type scale does not change with the viewport; only the
plate name steps up at 960 px.

The landing page is the one exception. It is a Persuade surface, so its headlines are set in the
condensed cut, in sentence case, and scale with the viewport:

- **Display** (600, 2.75rem to 5.5rem, line-height 0.94): the landing headline. The closing
  headline runs 2.5rem to 4.5rem.
- **Landing heading** (600, 1.75rem to 2.75rem, line-height 1.02): the question at each stop and
  each section heading.

No application screen uses these steps.

### Named Rules

**The Capitals Rule.** Uppercase is for place names on a plate and for tags. Headings, labels and
buttons are sentence case.

**The Tabular Rule.** Every number uses tabular lining figures so that columns of prices align.

**The Locale Rule.** Brazilian Portuguese is the primary locale and formats as `R$ 12.480` and
`3,1%`; English is the second locale and formats as `R$ 12,480` and `3.1%`. The currency is always
BRL.

## Layout

Mobile-first. A phone screen is a single column with a 16 px gutter: the shell and its plate, then
full-width white bands separated by hairlines, then a five-tab bar. At 960 px the tab bar becomes
a 232 px enamel side rail, the plate moves into a blue page header beside the question field, and
content sits in panels with a 24 px gutter. Paired panels use wrapping flex rows, so they stack
again when the window narrows.

Spacing steps are 4, 8, 12, 16, 20, 24, 32, 40 and 56 px. A section heading has 32 px above it and
12 px below. Touch targets are 44 px or taller. A wide table scrolls inside its own box; the page
never scrolls sideways. A sticky side rail or a `100vh` column is not used.

## Elevation & Depth

Flat by default. Hairlines and the white-on-porcelain step separate surfaces; nothing floats at
rest.

### Shadow Vocabulary

- **Sheet** (`box-shadow: 0 -8px 28px rgba(16, 27, 51, 0.16)`): a bottom sheet over content.
- **Pop** (`box-shadow: 0 10px 28px rgba(16, 27, 51, 0.18)`): a control placed over the map.

### Named Rules

**The Flat Rule.** A shadow means "this sits over something else". Panels, rows, buttons and bands
never cast one.

## Shapes

Small radii throughout: 2 px for bars and markers, 4 px for tags and status, 6 px for controls and
panels, 10 px for the plate, 14 px for the top corners of a sheet, a full pill for chips and the
current-tab indicator. The plate has a 4 px enamel margin around a 1.5 px white inner border, as a
struck plaque does. Borders are 1 px. The "here" marker is a 9 px square with 2 px corners.

## Components

Class names refer to `src/styles/components.css`.

### Place plate (signature)

The header of every screen (`.plate`). Three lines: the parent place and the kind of place; the
name in condensed capitals; a strip with the zone and one count.

- **City** (`.plate--city`): white strip with enamel text.
- **Neighborhood**: strip in the zone colour.
- **Street block** (`.plate--block`): smaller name; the strip ends with the number range, for
  example `1200 – 1298`. A property is never signed to a unit.
- **Compact**: name and strip on one line, for the map and other full-bleed screens.

### Navigation

- **Phone**: a blue shell (`.shell`) with the product name, alerts and the language switch, then
  the place crumbs and the plate; five tabs at the bottom (`.tabbar`): Places, Search, Ask, Market,
  More. The current tab's icon sits on a yellow pill.
- **Desktop**: an enamel rail (`.rail`) with the same destinations plus an Operations group. The
  current item has an Enamel 600 fill and a yellow square.
- **Crumbs** (`.crumbs`) climb the place hierarchy and are links.

### Buttons

- **Shape:** 6 px radius, 44 px tall, 16 px side padding, weight 600.
- **Primary:** Enamel 600 fill, white text. Hover Enamel 700, pressed Enamel 800. One per view.
- **Default:** white fill, Line Strong border. Hover Enamel 50 with an Enamel 600 border.
- **Quiet:** text only, Enamel 600.
- **Danger:** white fill, Failed border and text. Stands alone, at least 24 px from other controls.
- **Disabled:** Porcelain fill, Line border, Ink 3 text.
- **Focus:** 3 px Enamel 600 outline, 2 px offset; yellow inside the shell.

### Chips and segmented control

- **Chip** (`.chip`): 36 px pill with a 44 px hit area. Selected: Enamel 100 fill, Enamel 600
  border, weight 600.
- **Segmented** (`.seg`): joined buttons; the selected segment is Enamel 600 with white text.

### Inputs / Fields

- **Style:** 44 px tall, 6 px radius, Line Strong border, label above at 0.8125rem weight 600.
- **Focus:** Enamel 600 border and a 3 px Enamel 100 ring.
- **Error:** Failed border; the message names the problem and the fix.
- **Ask field** (`.ask`): a labelled input joined to its submit button. It is a form, not a chat
  composer.

### Figure with provenance

`.fig`: label with its price tag, value in the Figure style, a movement line, then the provenance
line stating how many records, which sources and when it was computed, with a link to the method.
Figures sit in bands divided by hairlines (`.figs`), not in separate cards.

### Rows and tables

- **Property row** (`.prow`): two columns. Left: type, bedrooms and area, then the street block.
  Right: price and price per square meter. A meta line holds movement, listing count and time on
  market. A row is a property and carries no photograph.
- **Table** (`.tbl`): fixed columns, sortable header buttons, right-aligned numbers. Hover Enamel
  50, selected Enamel 100 with the yellow square. A state change restyles the row in place.

### Status and notes

- **Status** (`.st`): a dot and a word. Queued, Cancelled and Expired are neutral; Running is
  enamel; Waiting for you is amber with a square dot; Completed is green; Failed is red; Not
  available is a hollow dot.
- **Note** (`.note`): a tinted block with a bold first line. No side stripe. Variants: info, warn,
  danger, ok. A model-written explanation is always an info note headed "Explanation, written by a
  model".

### Time, confidence and capacity

- **Lifelines** (`.life`): one bar per listing of a property on a shared month axis. Bar length is
  time on market to scale; a tick is a price change; a dashed bar is a period removed from the
  source.
- **Confidence gate** (`.gate`): a track from 0 to 1, amber below 0.85 and green above, with a
  marker at the probability. The number is always printed beside it.
- **Evidence** (`.ev`): label, bar and value for each reason behind an entity-resolution match.
- **Run slots** (`.slots`): three squares, filled for each pending run in a thread.
- **Run steps** (`.steps`): a vertical list; done is a filled dot, waiting an amber square, pending
  a hollow dot.

### Map and sheet

The map frame (`.map`) holds the tile layer; markers are Enamel 600 dots and the selected marker is
the yellow square. On a phone the selected property appears in a bottom sheet (`.sheet`). The tile
provider is undecided, so the design shows a schematic.

## Do's and Don'ts

### Do

- **Do** open every screen with a place plate, including Ask, Alerts and Operations.
- **Do** put a provenance line under every figure: count, sources, computation time.
- **Do** tag every price as `Asking` or `Sale`, and say "No recorded sale" when none exists.
- **Do** label model-written text as written by a model, next to the deterministic figure it
  explains.
- **Do** mark demonstration data with the dashed `Synthetic data` tag.
- **Do** size every label for Brazilian Portuguese and let long place names wrap on the plate.
- **Do** keep table columns fixed and restyle a row when its state changes.

### Don't

- **Don't** build a grid of listing cards with a photograph and a price.
- **Don't** render questions and answers as chat bubbles, or decorate AI features with gradients
  or sparkle icons.
- **Don't** arrange figures as a row of KPI cards.
- **Don't** use a dark ground, a monospace face for data or trading jargon.
- **Don't** use yellow for anything except "you are here".
- **Don't** colour a price movement green or red.
- **Don't** present an asking price as what a property sold for.
- **Don't** add a coloured side stripe to a card, row or note.
