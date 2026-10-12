---
version: 1
slug: 'src-places-placeoverview-tsx'
primary_target: 'src/places/PlaceOverview.tsx'
related_targets: ['src/places/PlaceShell.tsx', 'src/styles/place.css']
---

# Surface brief — place tracer

- Scope: story 6.2, one public neighborhood plate and asking median with actual evidence.
- Visitor mode: Operate; all four audiences understand one place in daylight on phone/desktop.
- Existing Placa world and artboards remain authoritative. D-052 limits this increment to working
  place navigation, locale switch, plate and one backend-owned figure; later screens remain absent.
- Contract readings, not illustration data: registered Bela Vista after synthetic acquisition;
  Pinheiros has no contributing sample. Proper names stay intact; no prepared-count conflation.

## Direction contract

THESIS: Sign the place before showing its one dated, traceable asking median; no listing-card or
KPI dashboard. This is a tracer, not a promise that the full place screen is complete.

OWN-WORLD: Preserve Placa enamel shell, porcelain ground, zone strip, Barlow/Barlow Condensed,
hairline band/panel and provenance line. No new tokens, world, raster or decorative motion.

STORY: Open a registered neighborhood, read its actual contributing-property/source/time evidence,
change PT/en without translating names, navigate places; unavailable evidence stays unavailable.

FIRST VIEWPORT: 390px: blue brand/language bar, hierarchy and plate, white median band. >=960px:
232px enamel rail, blue plate header and a white median panel with 24px body gutters. The signature
is the large wrapping condensed place plate; only real destinations/actions are present.

FORM: Existing street-plaque candidate 4, inherited seed key 3d3cd1ae; code-led extension, no roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implemented artifact notes

- `src/styles/place.css` extends the existing tokens and components. The shell uses Enamel 800
  over Porcelain ground; the plate keeps its Enamel 700 margin, white inner border, zone strip
  and white Barlow Condensed name at weight 600. The name uses the inherited 36px phone and
  48px desktop steps. Plate width is 358px at a 390px viewport and caps at 560px.
- At 960px the mobile brand/language bar yields to the 232px rail. Body gutters step from
  16px to 24px, and the white median band gains the existing 1px hairline and 6px panel corners.
  The rail stretches with the content. Locale buttons, hierarchy links and the mobile home link
  use the existing 44px minimum target token. The breadcrumb list, items and links constrain
  their width and wrap full canonical names; place navigation links, plate names and evidence
  also wrap. Navigation exposes working place links only, as scoped by D-052, and unbroken
  canonical names wrap within the viewport.
- `PlaceOverview.tsx` renders the registered geographic hierarchy and its canonical names.
  The strip identifies the zone and synthetic data rather than copying an illustrated count.
  The sole figure is the backend median, tagged Asking/Pedido, followed by contributing-property
  count, source labels, backend computation time and synthetic provenance. Whole-reais BRL
  formatting changes with locale; computation time states UTC. No movement is invented.
- A pending median retains the plate and uses the inherited skeleton; failure exposes a
  localized retry; insufficient evidence states that the median is unavailable. None of these
  states supplies a replacement figure or a prepared count. The prepared place hierarchy is
  identified separately below the median band.
- A failed refresh of the same place retains its previously validated plate and hierarchy with
  a localized failure and retry action; the median is hidden until the place read succeeds.
- No shipping raster is introduced. The six `place-{390,960,1440}-{pt-BR,en}.png` captures and
  three `reference-{Main,PlaceEN,DesktopPlace}.png` captures under `.impeccable/review/` are
  development evidence only. The original artboards, `DESIGN.md` and `.impeccable/design.json`
  remain incumbent authority; these surface notes do not define a new system rule.
