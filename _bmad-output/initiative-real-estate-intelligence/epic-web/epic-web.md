---
type: epic
title: 'Place-first web application'
parent: initiative-real-estate-intelligence
covers: [CAP-19, CAP-20, CAP-28]
after: []
assignee: ''
risk: medium
---

# Place-first web application

## Description

`apps/web`: the Placa shell and every MVP screen and system state of `ux.md`, on a phone and on a
desktop, in Brazilian Portuguese and English, reading every value from `/api/v1`; the landing page
made ready to ship; the public privacy notice. Of CAP-28 it delivers the notice page and its links.

## Outcome

For a visitor: the market of a place is readable in minutes and a run can be followed; the signal is
the first and second success signals of the spec walked on the deployed application.

## Requirements

The spec is the requirement source: children cite its ids CAP-19, CAP-20, CAP-28. Where an id is
shared with another epic, Description says which part this epic delivers.

## Done when

1. Every MVP screen and system state of `ux.md` exists at 390 px and from 960 px up in the light
   theme, in both locales with locale-formatted numbers, each figure with its provenance line and
   each price tagged `Asking` or `Sale`.
2. On the deployed stack a visitor opens a neighborhood, reads its median with count, sources and
   computation time, opens the property whose three listings were resolved into one and never sees
   an asking price shown as a sale.
3. The Ask screens follow a run over SSE to a terminal state, including the pause for confirmation
   and every run state of `ux.md`.
4. The automated accessibility check and a keyboard walk of every MVP screen pass at WCAG 2.2 level
   AA, with the result recorded.
5. The privacy notice is reachable from every public screen and from the landing page in both
   locales, and the landing page ships: fonts self-hosted, the WebGL scene reviewed in a real
   browser with the review recorded, the demo address and the repository visibility set.

## Boundaries

`apps/web`, except the headless client. It computes no business value. Not V2 or protected screens.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`
- design — `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/ux.md`;
  `apps/web/DESIGN.md`; artboards under `docs/design/canvas/project/`

## Notes

- Decision: the web application is one epic with `/api/v1` as its contract to the context epics
  (owner, 2026-10-10).
- Decision: ADR 0028 accepts React Router declarative mode, TanStack Query, bundled i18next/
  react-i18next and Vitest/Testing Library/jsdom after the foundation phase of ADR 0016. Dependency
  installation and browser proof belong to implementing entries; integration remains typed Vitest
  under ADR 0020 (agent, on the owner's behalf, 2026-10-12; D-051).
- Open question (spec): who designs the sign-in entry, the signed-in shell and the theme switch. No
  MVP entry waits on it.
- Parked: the third success signal names a real source in the privacy notice; it waits with
  epic-collection.
- Waits on epic-platform-baseline because: it needs the contract conventions and the deployed stack.
- Waits on epic-collection because: it needs the list of sources for the privacy notice.
- Waits on epic-properties because: it needs the search, property, listing and largest-reductions
  shapes.
- Waits on epic-market because: it needs the place-figure, neighbours and series shapes.
- Waits on epic-ask because: it needs the run and SSE shapes.
- Tracer bullet: entry 2; entry 1 precedes it because the router and data-fetching choice shapes
  every screen.
- Assumption: the map view of Search is absent from the MVP, as the map is CAP-24.
- Assumption: places come from epic-properties (entry 3.3) and the sources with their licence from
  epic-collection (entry 2.4).
