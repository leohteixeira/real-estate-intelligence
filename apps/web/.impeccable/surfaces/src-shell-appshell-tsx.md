---
version: 1
slug: 'src-shell-appshell-tsx'
primary_target: 'src/shell/AppShell.tsx'
related_targets: ['src/routes.tsx', 'src/styles/place.css', 'src/shell/PlaceEntry.tsx']
---

# Surface brief — public application shell

Story 6.3 extends the committed Placa world, not its visual identity. Operate mode; phone in
daylight and desktop at a desk. D-054 scopes Search/Ask to genuine geographic entries while their
complete workflows remain later stories. The existing place tracer retains its actual evidence.

## Direction contract

THESIS: A place remains the spine while a visitor moves between three public destinations;
the shell makes the current destination and the current implementation boundary readable.

OWN-WORLD: Preserve enamel shell, porcelain ground, zone strip, Barlow/Barlow Condensed,
hairline bands/panels and the street plate. No new tokens, world, shipping raster or animation.

STORY: Read the real median, enter Search or Ask without losing place, read their honest web
screen boundary, return to the median, and switch PT/en without translating canonical names.

FIRST VIEWPORT: 390px: blue brand/language bar, hierarchy and real plate, truthful content,
page-end footer and three-link tab bar with the current icon's yellow pill. >=960px: 232px
non-sticky enamel rail with three destinations, current fill/yellow square, foot locale and
synthetic label; blue plate header, white panel and 24px gutters. All links are real and 44px.

FORM: Existing street-plaque candidate 4, inherited seed key 3d3cd1ae; code-led extension, no roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance

## Observed implementation — story 6.3

Recorded from the shipped source and settled production captures on 2026-10-12. This is a
surface-specific extension of Placa, candidate 4 with inherited seed `3d3cd1ae`, under D-054.
The incumbent `DESIGN.md` and `.impeccable/design.json` remain the design-system authority.
No new visual world or approved composition is required for this code-led extension.

### Layout and navigation

- Below 960px, the brand and locale controls precede the neighborhood links, full place hierarchy
  and plate. Content uses the existing 16px gutter. The phone footer and three-destination tab bar
  follow the content in document flow. The tabs are Places, Search and Ask, with the current icon
  on the existing yellow pill; they do not obscure the content.
- At 960px and above, the existing 232px enamel rail carries those same three destinations. The
  current destination uses the Enamel 600 fill and yellow square. Locale controls and the synthetic
  label sit in the rail foot. The blue place header and white content panels use 24px outer gutters;
  the rail is not sticky, and no fixed-height rail column was introduced.
- Real destination links retain the place identifier in the URL. The neighborhood links and
  hierarchy links retain the destination. Index routes select the existing synthetic Bela Vista
  neighborhood; the landing remains at `/`. Navigation labels wrap, and actionable shell links
  and locale buttons provide at least 44px targets.
- The shared plate uses locally bundled Barlow Condensed at 36px on phones and 48px on desktops;
  readable controls and prose use Barlow. Geographic names come from canonical Portuguese names
  in both locales. Bela Vista uses the canonical Centro strip; each other zone retains its own
  established strip color. No new token, shadow, animation or shipping raster was added.

### Entry content and evidence

- Search and Ask read validated geography through the same place query as Places. Each shows the
  actual hierarchy and plate, a translated destination heading, a current-version boundary and a
  real link back to that place's median. Their entry content has 16px internal padding; desktop
  entries use the existing hairline border and 6px panel radius. Prose has a maximum width of 70ch.
- Search states that the results and filters screen is not yet available in this version. Ask
  states that the runs screen is not yet available in this version. These are web-screen boundaries
  for this increment, not declarations that backend capabilities are unavailable. D-054 leaves
  complete search, question admission, threads and run screens to later entries.
- Places preserves the acquired synthetic-data median and its outlined Asking tag. Contributor
  count, source labels, computation time, freshness and dashed synthetic label remain adjacent to
  the figure. The observed Bela Vista capture renders `R$ 9.515` in Portuguese and `R$ 9,515` in
  English; these are captured backend results, not design defaults or prepared display values.
- Both locales translate shell, entry, footer, title and document language while retaining the
  canonical geographic names and URL. The phone footer uses enamel text for unselected locale
  buttons and an enamel fill with white text for the selected locale. Group and button labels,
  pressed state, visible focus and the synthetic label remain accessible.

### Review evidence and raster provenance

The settled review matrix contains 36 top/full-page captures under `.impeccable/review/`:
`{place,search,ask}-{390,960,1440}-{pt-BR,en}{,-top}.png`. The documenter opened the representative
full-page captures `place-390-pt-BR`, `search-390-en`, `ask-390-pt-BR`, `place-960-en`,
`search-1440-pt-BR` and `ask-1440-en`, and all six original `reference-{Main,PlaceEN,Search,Ask,
DesktopPlace,DesktopAsk}.png` images. These original references establish Placa shell geometry,
type, color and selection; their illustrated counts, forms, results and future destinations are
not shipped behavior or evidence of implemented workflows.

The fresh finish reviewer opened all 36 captures and all six references, returned `SHIP`, and
reported persistence, fidelity and ceiling passes with no material fixes. After the bounded
footer-contrast and entry-padding correction and the two direct-link edge fixes, the reviewer
reopened all 36 latest captures and confirmed `SHIP`, no regression and no remaining work. The
documenter rechecked the patched source and reopened the six representative latest captures.
Destination lookup normalizes accepted route case; public navigation retains its current marker
on trailing-slash deep links without changing canonical route targets.

Parent final verification passed lint, type checking, production build and 2,210 tests in 192 files
across eight workspaces, including 76 web tests. Coverage gates remain unchanged; web statements,
branches, functions and lines are 98.52%, 92.02%, 100% and 99.47%, respectively. The owned
real-acquisition native Vitest/Playwright campaign passed in 85.89 seconds, regenerated all 36
captures and checked five accepted deep-link variants in each of the six width/locale contexts.
The 25 support regressions and integration discovery also passed. Documentation completion:
`COMPLETE`; current finish disposition: `SHIP`.

All PNGs in the review directory are browser/reference review evidence. They are not shipping
raster assets and are not imported by this surface, so no shipping-raster provenance manifest
entry is required. The existing artboards and references were preserved.

### Incumbent comparison and limits

The observed palette, type roles, spacing, panel shapes and current-location markers agree with
the incumbent Placa system. `DESIGN.md` describes five phone tabs and the eventual broader rail,
whereas D-054 ships three public destinations; the sidecar's tab-bar example already contains
three. The original plate reference has illustrative counts, while this increment's actual plate
uses its synthetic label. These are recorded surface scope differences, not changes to the global
world. Full workflows, Privacy links, protected destinations and future panels remain later work.

Pre-existing sidecar narrative is abbreviated relative to `DESIGN.md`, rather than a verbatim copy
of all its rules and guardrails. This documentation pass reports and preserves that representation
drift. Neither system file was refreshed or overwritten. Temporary entry boundaries and omitted
destinations are not canonized as system-wide prohibitions; no visual defect is adopted as a rule.
